import { parseTransaction } from './services/ai';
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, delay } from "@whiskeysockets/baileys";
import { Boom } from '@hapi/boom';
import pino from "pino";
import * as dotenv from 'dotenv';
dotenv.config();
console.log("Checking .env Number found:", process.env.MY_NUMBER);
const phoneNumber = process.env.MY_NUMBER;


async function connectToWhatsapp() {

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });


    if (!sock.authState.creds.registered) {
        if (!phoneNumber) {
            console.error("❌ ERROR: MY_NUMBER not found in .env file!");
            process.exit(1);
        }

        await delay(3000);
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n 🔥 YOUR ARTHA SANKALPAH PAIRING CODE:${code}\n`);
        console.log(`➡️ Steps : Open WhatsApp -> Settings -> Linked Devices -> Link with phone number instead \n`);

    }


    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`♻️ Connection lost. Reconnectiong ... `, shouldReconnect);
            if (shouldReconnect) connectToWhatsapp();

        } else if (connection === "open") {
            console.log(`✅ SUCCESS! Artha Sankalpah is now linked to your WhatsApp.`);

        }
    });

    sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    
    // 1. Basic checks: Is there a message? Is it a broadcast/status?
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

    // 2. Extract text from various message types
    const text = msg.message.conversation || 
                 msg.message.extendedTextMessage?.text || 
                 msg.message.imageMessage?.caption || '';

    // 3. THE LOOP KILLER: 
    // If the message starts with our specific Emoji or Header, EXIT immediately.
    if (text.startsWith('✅') || text.includes('Artha Sankalpah')) {
        return; 
    }

    // 4. PRE-FILTER: Only send to AI if the message contains a number.
    // This saves your 5-request-per-minute quota!
    const containsNumber = /\d+/.test(text);
    if (!containsNumber) {
        console.log("Empty or non-financial message. Skipping AI.");
        return;
    }

    console.log(`📩 Processing valid expense: ${text}`);

    // 5. Call Gemini
    const data = await parseTransaction(text);

    if (data && !data.error) {
        const sender = msg.key.remoteJid!;
        const reply = `✅ *Recorded to Artha Sankalpah*\n\n` +
                      `💰 *Amount:* ₹${data.amount}\n` +
                      `📂 *Category:* ${data.category}\n` +
                      `📝 *Note:* ${data.note}\n` +
                      `⚖️ *Type:* ${data.type.toUpperCase()}`;
        
        await sock.sendMessage(sender, { text: reply });
    }
});

}

connectToWhatsapp();