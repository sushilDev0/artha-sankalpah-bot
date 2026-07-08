import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from "pino";
import { handleMessage } from './handlers/message.handler';

export async function connectToWhatsapp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📷 SCAN THIS QR CODE WITH YOUR WHATSAPP:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log("🔄 Reconnecting...");
        connectToWhatsapp();
      }
    } else if (connection === "open") {
      console.log(`\n✅ Artha Sankalpah is linked.`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const msg = messages[0];
    if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;

    const messageTimestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
    if (Date.now() - messageTimestamp > 60000) return;

    await handleMessage(sock, msg);
  });
}