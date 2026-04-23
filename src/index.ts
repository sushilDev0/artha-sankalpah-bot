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

// Connect to MongoDB Atlas
connectDB();

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
            console.error("❌ ERROR: MY_NUMBER not found in .env!");
            process.exit(1);
        }
        await delay(3000);
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n 🔥 YOUR PAIRING CODE: ${code}\n`);
    }

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
        if (!/\d+/.test(text)) return;

        console.log(`📩 Processing: ${text}`);

        try {
            const result = await parseTransaction(text);
            const transactions = Array.isArray(result) ? result : [result];
            const sender = msg.key.remoteJid!;
            
            let totalIncome = 0;
            let totalOutflow = 0;
            const savedItems: string[] = [];

            // 1. Process and Save
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

                    // Track totals for the current message
                    if (type === 'income') {
                        totalIncome += amount;
                    } else {
                        totalOutflow += amount;
                    }
                }
            }

            // 2. Send Primary Confirmation
            if (savedItems.length > 0) {
                const reply = `✅ *Artha-Sankalpah Bot*\n\n` +
                              `Successfully logged:\n${savedItems.join('\n')}\n\n` +
                              `📊 _Data synced to Atlas._`;
                
                await sock.sendMessage(sender, { text: reply });

                // 3. THE AUDIT LOGIC: Check for "Leaked" money
                const balance = totalIncome - totalOutflow;

                if (totalIncome > 0 && balance > 0) {
                    await delay(1500); // Small pause for a more natural feel
                    const auditMessage = `🤔 *Wait, Specialist!* You logged ₹${totalIncome} income but only ₹${totalOutflow} in spending/savings.\n\n*₹${balance} is missing.* Did you spend it on tea, petrol, or something else?`;
                    
                    await sock.sendMessage(sender, { text: auditMessage });
                }
            }

        } catch (error: any) {
            console.error("❌ Process Error:", error.message);
        }
    });
}

connectToWhatsapp();