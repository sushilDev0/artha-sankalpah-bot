import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from "pino";
import { handleMessage } from './handlers/message.handler.js';
import { startWeeklyReportCron } from './services/weeklyReport.js';

// ============================================================
// CONNECTION STATE
// ============================================================

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let cronInitialized = false;

// ============================================================
// MAIN CONNECTION FUNCTION
// ============================================================

export async function connectToWhatsapp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`📱 Using WhatsApp v${version.join('.')} ${isLatest ? '(latest)' : '(update available)'}`);

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ 
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'silent' 
      }),
      browser: ["Artha Sankalpah", "Chrome", "1.0.0"],
      connectTimeoutMs: 60_000,       // 60 second timeout
      keepAliveIntervalMs: 30_000     // Ping every 30 seconds
    });

    // ============================================================
    // CONNECTION EVENT HANDLER
    // ============================================================

    sock.ev.on('connection.update', (update) => {
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

        // User deliberately logged out
        if (statusCode === DisconnectReason.loggedOut) {
          console.log('👋 Logged out. Delete auth_info folder to re-link.');
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
              await sock.sendMessage(jid, { text });
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

      const msg = messages[0];
      if (!msg?.message) return;
      if (msg.key.remoteJid === 'status@broadcast') return;

      // Ignore messages older than 60 seconds
      const messageTimestamp = msg.messageTimestamp 
        ? Number(msg.messageTimestamp) * 1000 
        : Date.now();
      if (Date.now() - messageTimestamp > 60000) return;

      // Ignore own messages
      if (msg.key.fromMe) return;

      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error("❌ Message handler error:", err);
        
        // Send error message to user
        try {
          await sock.sendMessage(msg.key.remoteJid!, { 
            text: '❌ Sorry, something went wrong. Please try again.' 
          });
        } catch (sendErr) {
          console.error('Failed to send error message:', sendErr);
        }
      }
    });

    // ============================================================
    // HEALTH CHECK (Every 5 minutes)
    // ============================================================

    setInterval(() => {
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