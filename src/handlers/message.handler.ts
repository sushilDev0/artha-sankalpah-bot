import type { WASocket } from '@whiskeysockets/baileys';
import { parseTransaction } from '../services/ai.js';
import { Transaction } from '../models/Transaction.js';
import { getTodayStats } from '../services/stats.js';
import { handleCommand } from './commands.js';

// ============================================================
// TYPES
// ============================================================

interface ParsedItem {
  amount: number;
  category?: string;
  note?: string;
  type?: 'income' | 'expense';
  error?: string;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function extractText(msg: any): string {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''
  ).trim();
}

function isOwner(msg: any, sender: string): boolean {
  const cleanEnvNumber = (process.env.MY_NUMBER || '').replace(/\D/g, '');
  const cleanSenderNumber = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
  return msg.key.fromMe || cleanSenderNumber === cleanEnvNumber;
}

// ============================================================
// MAIN MESSAGE HANDLER
// ============================================================

export async function handleMessage(
  sock: WASocket,
  msg: any
): Promise<void> {
  const sender = msg.key.remoteJid!;
  const text = extractText(msg);

  if (!text || !sender) return;

  // ============================================================
  // IDENTITY CHECK - Remove/comment if you want multi-user bot
  // ============================================================
  
  // Uncomment below to restrict to owner only:
  // if (!isOwner(msg, sender)) return;
  
  // For multi-user bot, remove the above restriction

  // Mark as read
  try {
    await sock.readMessages([msg.key]);
  } catch (err) {
    console.error("⚠️ Failed to send read receipt:", err);
  }

  // ============================================================
  // HANDLE COMMANDS FIRST
  // ============================================================

  try {
    const wasCommand = await handleCommand(sock, sender, text);
    if (wasCommand) return;  // Command was handled, stop here
  } catch (err) {
    console.error("❌ Command Error:", err);
    await sock.sendMessage(sender, {
      text: "⚠️ Something went wrong running that command."
    });
    return;
  }

  // ============================================================
  // NATURAL LANGUAGE TRANSACTION PROCESSING
  // ============================================================

  // Only process if contains numbers
  if (!/\d+/.test(text)) return;

  try {
    const result = await parseTransaction(text);
    if (!result) return;

    // Handle both single and multiple transactions
    const transactions: ParsedItem[] = Array.isArray(result) ? result : [result];
    let savedCount = 0;
    let totalSavedAmount = 0;

    for (const item of transactions) {
      // Skip items with errors or invalid amounts
      if (!item || item.error || !item.amount || item.amount <= 0) continue;

      try {
        await Transaction.create({
          chatId: sender,  // 🔑 CRITICAL: Add chatId!
          amount: Number(item.amount),
          category: (item.category || 'personal').toLowerCase().trim(),
          description: item.note || text,
          type: (item.type || 'expense').toLowerCase() as 'income' | 'expense',
          date: new Date()
        });
        
        savedCount++;
        totalSavedAmount += Number(item.amount);
      } catch (saveErr) {
        console.error('Failed to save transaction:', saveErr);
      }
    }

    // Send confirmation if transactions saved
    if (savedCount > 0) {
      try {
        const stats = await getTodayStats(sender);  // 🔑 Pass sender!
        
        const isIncome = transactions.some(t => t.type === 'income');
        const confirmType = isIncome ? 'Income' : 'Expense';
        
        const confirmationText = transactions.length === 1
          ? `✅ *Recorded ${confirmType}*\n\n` +
            `Amount: ₹${totalSavedAmount.toLocaleString('en-IN')}\n` +
            `Category: ${transactions[0]?.category || 'personal'}\n\n` +
            `📊 *Today's Summary*\n` +
            `Income: ₹${stats.income.toLocaleString('en-IN')}\n` +
            `Expenses: ₹${stats.expense.toLocaleString('en-IN')}\n` +
            `Balance: ₹${stats.balance.toLocaleString('en-IN')}`
          : `✅ *Recorded ${savedCount} transactions*\n\n` +
            `Total: ₹${totalSavedAmount.toLocaleString('en-IN')}\n\n` +
            `📊 *Today's Summary*\n` +
            `Income: ₹${stats.income.toLocaleString('en-IN')}\n` +
            `Expenses: ₹${stats.expense.toLocaleString('en-IN')}\n` +
            `Balance: ₹${stats.balance.toLocaleString('en-IN')}`;

        await sock.sendMessage(sender, { text: confirmationText });
        
      } catch (statsErr) {
        // Transaction saved but stats failed
        console.error('Stats fetch error:', statsErr);
        await sock.sendMessage(sender, {
          text: `✅ *Recorded ₹${totalSavedAmount.toLocaleString('en-IN')}*\n\nFailed to fetch today's summary. Use \`!status\` to check.`
        });
      }
    }

  } catch (error: any) {
    console.error("❌ Process Error:", error.message);
    
    // Handle specific errors
    if (error.message.includes('503') || error.message.includes('UNAVAILABLE')) {
      await sock.sendMessage(sender, {
        text: "⏳ Google AI is currently overloaded. Please wait a minute and try again!"
      });
    } else {
      await sock.sendMessage(sender, {
        text: "❌ Failed to process transaction. Please try again."
      });
    }
  }
}