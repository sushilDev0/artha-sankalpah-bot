import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import { Boom } from '@hapi/boom';
import mongoose from 'mongoose';
import qrcode from 'qrcode-terminal';
import pino from "pino";
import { useMongoAuthState } from './config/mongoAuthState.js';
import { handleMessage } from './handlers/message.handler.js';
import { startWeeklyReportCron } from './services/weeklyReport.js';

// ============================================================
// CONNECTION STATE
// ============================================================

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let cronInitialized = false;
let healthTimer: ReturnType<typeof setInterval> | undefined;

// Always points at the newest socket, so the weekly cron keeps working after reconnects
let currentSock: ReturnType<typeof makeWASocket> | undefined;

// ============================================================
// ACCESS CONTROL: only talk to the owner
// ============================================================

// Strips the ":device" part, e.g. 9198...:12@s.whatsapp.net -> 9198...@s.whatsapp.net
const bareJid = (jid?: string | null) => (jid || '').replace(/:\d+(?=@)/, '').toLowerCase();
const jidDigits = (jid?: string | null) => (jid || '').split('@')[0]!.split(':')[0]!.replace(/\D/g, '');

// Allowed: your own "message yourself" chat, or a 1-to-1 chat with MY_NUMBER.
// Everything else (friends, groups, broadcasts) is ignored.
// Set ALLOW_ALL_CHATS=true only if you deliberately want a public multi-user bot.
export function isAllowedChat(sock: { user?: any }, msg: any): boolean {
  if (process.env.ALLOW_ALL_CHATS === 'true') return true;

  const jid: string | null | undefined = msg?.key?.remoteJid;
  if (!jid) return false;
  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return false;

  // 1) Self-chat: the chat is with my own account (phone JID or LID)
  const mine = [bareJid(sock.user?.id), bareJid(sock.user?.lid)].filter(Boolean);
  if (mine.includes(bareJid(jid))) return true;

  // 2) Optional: owner messaging from another number (MY_NUMBER)
  const owner = (process.env.MY_NUMBER || '').replace(/\D/g, '');
  if (!owner) return false;
  if (msg.key.fromMe) return false; // something I typed to someone else from my phone
  const alt: string | undefined = msg.key.remoteJidAlt;
  return jidDigits(jid) === owner || (alt ? jidDigits(alt) === owner : false);
}

// ============================================================
// MAIN CONNECTION FUNCTION
// ============================================================

export async function connectToWhatsapp(): Promise<ReturnType<typeof makeWASocket> | undefined> {
  try {
    const { state, saveCreds } = await useMongoAuthState();
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`📱 Using WhatsApp v${version.join('.')} ${isLatest ? '(latest)' : '(update available)'}`);

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'warn' }),
      browser: ["Artha Sankalpah", "Chrome", "1.0.0"],
      syncFullHistory: false,          // 🔑 Disables initial chat history sync delay
      connectTimeoutMs: 60_000,       // 60 second timeout
      keepAliveIntervalMs: 30_000,    // Ping every 30 seconds
      markOnlineOnConnect: true,
    });
    currentSock = sock;

    // ============================================================
    // CONNECTION EVENT HANDLER
    // ============================================================

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Show QR code for initial linking
      if (qr) {
        console.log("\n📷 SCAN THIS QR CODE WITH YOUR WHATSAPP:");
        qrcode.generate(qr, { small: true });
      }

      // Handle disconnection
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        // User logged out from the phone: clear the saved session so a fresh QR is shown
        if (statusCode === DisconnectReason.loggedOut) {
          console.log('👋 Logged out. Clearing saved session, restarting for a new QR...');
          try {
            await mongoose.connection.collection('baileysauths').deleteMany({});
          } catch (err) {
            console.error('Failed to clear saved session:', err);
          }
          process.exit(0);
        }

        // Auto-reconnect with exponential backoff
        if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          console.log(`🔄 Reconnecting in ${delay / 1000}s... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          setTimeout(() => connectToWhatsapp(), delay);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error('❌ Max reconnection attempts reached. Restarting...');
          process.exit(1);
        }
      }
      // Successful connection
      else if (connection === "open") {
        reconnectAttempts = 0;
        console.log('✅ Artha Sankalpah is linked & ready!');

        // Start weekly cron job (only once)
        if (!cronInitialized) {
          cronInitialized = true;
          startWeeklyReportCron(async (jid: string, text: string) => {
            try {
              // Use the latest socket, not the one from the first connection
              await currentSock?.sendMessage(jid, { text });
            } catch (err) {
              console.error('❌ Failed to send weekly report:', err);
            }
          });
          console.log('📅 Weekly report cron initialized');
        }
      }
    });

    // ============================================================
    // SAVE CREDENTIALS
    // ============================================================

    sock.ev.on('creds.update', saveCreds);

    // ============================================================
    // MESSAGE HANDLER
    // ============================================================

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg?.message) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;

        // Ignore everyone except the owner (checked before logging, so other chats never hit the logs)
        if (!isAllowedChat(sock, msg)) continue;

        console.log('📩 Incoming message (owner chat)');

        // Allow 120s buffer window for delayed messages
        const messageTimestamp = msg.messageTimestamp
          ? Number(msg.messageTimestamp) * 1000
          : Date.now();
        if (Date.now() - messageTimestamp > 120000) continue;

        // 🔑 Un-comment in production mode when deploying for other users:
        // if (msg.key.fromMe) continue;

        try {
          await handleMessage(sock, msg);
        } catch (err) {
          console.error("❌ Message handler error:", err);

          const targetJid = msg.key.participant || msg.key.remoteJid;
          if (targetJid) {
            try {
              await sock.sendMessage(targetJid, {
                text: '❌ Sorry, something went wrong. Please try again.'
              });
            } catch (sendErr) {
              console.error('Failed to send error message:', sendErr);
            }
          }
        }
      }
    });

    // ============================================================
    // HEALTH CHECK (Every 5 minutes)
    // ============================================================

    // Clear the previous timer so reconnects don't stack up intervals
    if (healthTimer) clearInterval(healthTimer);
    healthTimer = setInterval(() => {
      if (sock.user) {
        console.log('💓 Bot is alive');
      } else {
        console.warn('⚠️ Connection may be dead');
      }
    }, 300000);

    return sock;

  } catch (err) {
    console.error('❌ Fatal connection error:', err);
    process.exit(1);
  }
}