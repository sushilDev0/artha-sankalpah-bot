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

    const sender = msg.key.remoteJid!;
    const isMe = msg.key.fromMe || sender.split('@')[0] === process.env.MY_NUMBER;
    if (!isMe) return;

    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

    // 1. Status Command (No AI needed)
    if (text.toLowerCase() === '!status') {
        const { income, expense, balance } = await getTodayStats();
        await sock.sendMessage(sender, { 
            text: `📊 *Today's Ledger*\n\n💰 Income: ₹${income}\n💸 Utilized: ₹${expense}\n🏁 Leftover: ₹${balance}` 
        });
        return;
    }

    // 2. Filter: Only process if there's a number and it's not a short code
    if (!/\d+/.test(text) || text.length < 3) return;

    try {
        // AI Call - Ensure parseTransaction handles the WHOLE string at once
        const result = await parseTransaction(text);
        if (!result || (Array.isArray(result) && result.length === 0)) return;

        const transactions = Array.isArray(result) ? result : [result];
        
        // Use Promise.all to save everything to MongoDB in parallel (Faster)
        await Promise.all(transactions.map(async (item) => {
            if (item && !item.error && item.amount > 0) {
                return new Transaction({
                    amount: Number(item.amount),
                    category: (item.category || 'personal').toLowerCase(),
                    description: item.note || text,
                    type: (item.type || 'expense').toLowerCase(),
                    date: new Date()
                }).save();
            }
        }));

        const updated = await getTodayStats();
        const reply = `✅ *Recorded.*\n\nToday's Total Utilized: *₹${updated.expense}*\nRemaining Balance: *₹${updated.balance}*`;
        
        await sock.sendMessage(sender, { text: reply });

    } catch (error: any) {
        // If Gemini hits a rate limit (429), catch it here
        if (error.message.includes('429')) {
            console.error("⚠️ AI Rate Limit Hit");
            await sock.sendMessage(sender, { text: "⏳ AI is busy. Please wait a minute before logging again." });
        } else {
            console.error("❌ Process Error:", error.message);
        }
    }
});sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const sender = msg.key.remoteJid!;
    const isMe = msg.key.fromMe || sender.split('@')[0] === process.env.MY_NUMBER;
    if (!isMe) return;

    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

    // 1. Status Command (No AI needed)
    if (text.toLowerCase() === '!status') {
        const { income, expense, balance } = await getTodayStats();
        await sock.sendMessage(sender, { 
            text: `📊 *Today's Ledger*\n\n💰 Income: ₹${income}\n💸 Utilized: ₹${expense}\n🏁 Leftover: ₹${balance}` 
        });
        return;
    }

    // 2. Filter: Only process if there's a number and it's not a short code
    if (!/\d+/.test(text) || text.length < 3) return;

    try {
        // AI Call - Ensure parseTransaction handles the WHOLE string at once
        const result = await parseTransaction(text);
        if (!result || (Array.isArray(result) && result.length === 0)) return;

        const transactions = Array.isArray(result) ? result : [result];
        
        // Use Promise.all to save everything to MongoDB in parallel (Faster)
        await Promise.all(transactions.map(async (item) => {
            if (item && !item.error && item.amount > 0) {
                return new Transaction({
                    amount: Number(item.amount),
                    category: (item.category || 'personal').toLowerCase(),
                    description: item.note || text,
                    type: (item.type || 'expense').toLowerCase(),
                    date: new Date()
                }).save();
            }
        }));

        const updated = await getTodayStats();
        const reply = `✅ *Recorded.*\n\nToday's Total Utilized: *₹${updated.expense}*\nRemaining Balance: *₹${updated.balance}*`;
        
        await sock.sendMessage(sender, { text: reply });

    } catch (error: any) {
        // If Gemini hits a rate limit (429), catch it here
        if (error.message.includes('429')) {
            console.error("⚠️ AI Rate Limit Hit");
            await sock.sendMessage(sender, { text: "⏳ AI is busy. Please wait a minute before logging again." });
        } else {
            console.error("❌ Process Error:", error.message);
        }
    }
});
}

connectToWhatsapp();