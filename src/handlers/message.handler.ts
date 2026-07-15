import { WASocket } from '@whiskeysockets/baileys';
import { parseTransaction } from '../services/ai';
import { Transaction } from '../models/Transaction';
import { getTodayStats } from '../services/stats';
import { handleCommand } from './commands';

export async function handleMessage(
  sock: WASocket,
  msg: any
) {
  const sender = msg.key.remoteJid!;
  const text = (
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    ''
  ).trim();

  if (!text) return;

  // identity check
  const cleanEnvNumber = (process.env.MY_NUMBER || '').replace(/\D/g, '');
  const cleanSenderNumber = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
  const isMe = msg.key.fromMe || cleanSenderNumber === cleanEnvNumber;
  if (!isMe) return;

  // mark as read
  try {
    await sock.readMessages([msg.key]);
  } catch (err) {
    console.error("⚠️ Failed to send read receipt:", err);
  }

  // handle commands first
  let wasCommand = false;
  try {
    wasCommand = await handleCommand(sock, sender, text);
  } catch (err) {
    console.error("❌ Command Error:", err);
    await sock.sendMessage(sender, {
      text: "⚠️ Something went wrong running that command."
    });
    return;
  }
  if (wasCommand) return;

  // only process if contains numbers
  if (!/\d+/.test(text)) return;

  // process transaction
  try {
    const result = await parseTransaction(text);
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
      await sock.sendMessage(sender, {
        text: `✅ *Recorded.*\n\nToday's Total Utilized: *₹${updated.expense}*\nRemaining Balance: *₹${updated.balance}*`
      });
    }

  } catch (error: any) {
    console.error("❌ Process Error:", error.message);
    if (error.message.includes('503') || error.message.includes('UNAVAILABLE')) {
      await sock.sendMessage(sender, {
        text: "⏳ Google AI is currently overloaded. Please wait a minute and try again!"
      });
    } else {
      await sock.sendMessage(sender, {
        text: "❌ Failed to process transaction due to an AI error."
      });
    }
  }
}