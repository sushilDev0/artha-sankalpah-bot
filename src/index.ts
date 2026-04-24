import './config/dns';
import { connectDB } from './config/db';
import { parseTransaction } from './services/ai';
import { Transaction } from './models/Transaction';
import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    delay 
} from "@whiskeysockets/baileys";
import { Boom } from '@hapi/boom';
import pino from "pino";
import * as dotenv from 'dotenv';

dotenv.config();
connectDB();

const phoneNumber = process.env.MY_NUMBER;

// --- Helper Function for Audit Math ---
async function getMissingBalance() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const stats = await Transaction.aggregate([
        { $match: { date: { $gte: startOfDay } } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } }
    ]);

    const income = stats.find(s => s._id === 'income')?.total || 0;
    const outflow = stats.find(s => s._id === 'expense')?.total || 0;
    return income - outflow;
}

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

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsapp();
        } else if (connection === "open") {
            console.log(`✅ SUCCESS! Artha Sankalpah is linked.`);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || '';

        if (text.startsWith('✅') || text.includes('Artha-Sankalpah') || text.startsWith('🤔')) return;

        const sender = msg.key.remoteJid!;
        const containsNumber = /\d+/.test(text);

        try {
            // --- NEW: SMART LISTENER LOGIC ---
            if (!containsNumber) {
                const missing = await getMissingBalance();
                
                if (missing > 0) {
                    console.log(`🧠 Context: Explaining missing ₹${missing}`);
                    // Use Gemini to categorize the text reply
                    const data = await parseTransaction(`The missing ${missing} was for ${text}`);
                    
                    const auditEntry = new Transaction({
                        amount: missing,
                        category: (data.category || 'personal').toLowerCase(),
                        description: `Audit: ${text}`,
                        type: 'expense'
                    });
                    await auditEntry.save();
                    
                    await sock.sendMessage(sender, { 
                        text: `✅ Got it! Logged the remaining *₹${missing}* as *${data.category}*. Your daily balance is now matched! 🎯` 
                    });
                    return;
                }
                // If no number and no missing balance, ignore the message
                return;
            }

            // --- REGULAR TRANSACTION LOGIC (With Numbers) ---
            console.log(`📩 Processing: ${text}`);
            const result = await parseTransaction(text);
            const transactions = Array.isArray(result) ? result : [result];
            
            let totalIncome = 0;
            let totalOutflow = 0;
            const savedItems: string[] = [];

            for (const item of transactions) {
                if (item && !item.error) {
                    const type = (item.type || 'expense').toLowerCase();
                    const amount = Number(item.amount);

                    const newEntry = new Transaction({
                        amount: amount,
                        category: (item.category || 'personal').toLowerCase(),
                        description: item.note || text,
                        type: type
                    });

                    await newEntry.save();
                    savedItems.push(`• ₹${amount} (${item.category})`);

                    if (type === 'income') totalIncome += amount;
                    else totalOutflow += amount;
                }
            }

            if (savedItems.length > 0) {
                await sock.sendMessage(sender, { 
                    text: `✅ *Artha-Sankalpah Bot*\n\nLogged:\n${savedItems.join('\n')}\n\n📊 _Synced to Atlas._` 
                });

                // Check Daily Balance (not just message balance)
                const totalMissing = await getMissingBalance();

                if (totalMissing > 0) {
                    await delay(1500);
                    const auditMessage = `🤔 *Wait, Specialist!* After this update, you still have *₹${totalMissing}* missing from your daily total. \n\nDid you spend that on tea or something else?`;
                    await sock.sendMessage(sender, { text: auditMessage });
                }
            }

        } catch (error: any) {
            console.error("❌ Process Error:", error.message);
        }
    });
}

connectToWhatsapp();