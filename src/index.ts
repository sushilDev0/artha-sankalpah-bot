import './config/dns';
import { connectDB } from './config/db';
import { parseTransaction } from './services/ai';
import { Transaction } from './models/Transaction';
import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion 
} from "@whiskeysockets/baileys";
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from "pino";
import * as dotenv from 'dotenv';

dotenv.config();
connectDB();

async function getTodayStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const stats = await Transaction.aggregate([
        { $match: { date: { $gte: startOfDay } } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } }
    ]);

    const income = stats.find(s => s._id === 'income')?.total || 0;
    const expense = stats.find(s => s._id === 'expense')?.total || 0;
    return { income, expense, balance: income - expense };
}

async function connectToWhatsapp() {
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

        // Manually render the QR code since Baileys removed automatic printing
        if (qr) {
            console.log("\n📷 SCAN THIS QR CODE WITH YOUR WHATSAPP:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("🔄 Reconnecting to WhatsApp...");
                connectToWhatsapp();
            }
        } else if (connection === "open") {
            console.log(`\n✅ SUCCESS! Artha Sankalpah is linked.`);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Single unified message event listener
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // 1. Only process real-time incoming messages, ignore historical sync loops
        if (type !== 'notify') return; 

        const msg = messages[0];
        if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;

        // 2. Safety Check: Skip messages that are older than 60 seconds (prevents catch-up loops)
        const messageTimestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
        if (Date.now() - messageTimestamp > 60000) {
            return; 
        }

        const sender = msg.key.remoteJid!;
        const text = (
            msg.message.conversation || 
            msg.message.extendedTextMessage?.text || 
            msg.message.imageMessage?.caption || 
            ''
        ).trim();

        if (!text) return;

        // --- BULLETPROOF IDENTITY DETECTOR ---
        const cleanEnvNumber = (process.env.MY_NUMBER || '').replace(/\D/g, '');
        const cleanSenderNumber = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
        const isMe = msg.key.fromMe || cleanSenderNumber === cleanEnvNumber;

        if (!isMe) return;

        // 3. Mark the message as read immediately so WhatsApp stops retrying it
        try {
            await sock.readMessages([msg.key]);
        } catch (err) {
            console.error("⚠️ Failed to send read receipt:", err);
        }

        console.log(`📥 Received: "${text}" | Allowed? ${isMe}`);

        // 1. Status Command
        if (text.toLowerCase() === '!status') {
            const { income, expense, balance } = await getTodayStats();
            await sock.sendMessage(sender, { 
                text: `📊 *Today's Ledger*\n\n💰 Income: ₹${income}\n💸 Utilized: ₹${expense}\n🏁 Leftover: ₹${balance}` 
            });
            return;
        }

        // 2. Filter: Only continue if the message contains numbers
        if (!/\d+/.test(text)) return;

        try {
            console.log(`🧠 Sending text to AI Parser...`);
            const result = await parseTransaction(text);
            console.log(`🤖 AI Parsed Output:`, JSON.stringify(result));

            if (!result) return;

            const transactions = Array.isArray(result) ? result : [result];
            let savedCount = 0;
            
            for (const item of transactions) {
                if (item && !item.error && Number(item.amount) > 0) {
                    await new Transaction({
                        amount: Number(item.amount),
                        category: (item.category || 'personal').toLowerCase(),
                        description: item.note || text,
                        type: (item.type || 'expense').toLowerCase(),
                        date: new Date()
                    }).save();
                    savedCount++;
                }
            }

            if (savedCount > 0) {
                const updated = await getTodayStats();
                const reply = `✅ *Recorded.*\n\nToday's Total Utilized: *₹${updated.expense}*\nRemaining Balance: *₹${updated.balance}*`;
                await sock.sendMessage(sender, { text: reply });
            }

        } catch (error: any) {
            console.error("❌ Process Error:", error.message);
            if (error.message.includes('503') || error.message.includes('UNAVAILABLE')) {
                await sock.sendMessage(sender, { 
                    text: "⏳ Google AI is currently overloaded. Please wait a minute and try that log again!" 
                });
            } else {
                await sock.sendMessage(sender, { text: "❌ Failed to process transaction due to an AI error." });
            }
        }
    });
}

connectToWhatsapp();