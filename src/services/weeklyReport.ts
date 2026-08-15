import cron from 'node-cron';
import { Transaction } from '../models/Transaction.js';
import { Settings } from '../models/Settings.js';
import { generateCoachingInsight } from './ai.js';

// ============================================================
// TYPES
// ============================================================

interface WeeklyReportData {
  income: number;
  expense: number;
  balance: number;
  byCategory: Record<string, number>;
  transactionCount: number;
}

// ============================================================
// REPORT GENERATOR
// ============================================================

async function generateWeeklyReport(chatId: string): Promise<string> {
  try {
    // Calculate last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // 🔑 Filter by chatId
    const transactions = await Transaction.find({
      chatId,
      date: { $gte: sevenDaysAgo }
    })
      .sort({ date: 1 })
      .lean();

    if (transactions.length === 0) {
      return [
        '📊 *Weekly Report*',
        '',
        'No transactions recorded this week!',
        '',
        'Start tracking by sending: `food 300`'
      ].join('\n');
    }

    let income = 0;
    let expense = 0;
    const byCategory: Record<string, number> = {};

    for (const t of transactions) {
      if (t.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      }
    }

    const balance = income - expense;
    const reportData: WeeklyReportData = {
      income,
      expense,
      balance,
      byCategory,
      transactionCount: transactions.length
    };

    // Build category breakdown
    const categoryLines = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `  • ${cat}: ₹${amt.toLocaleString('en-IN')}`)
      .join('\n');

    // Get AI coaching insight
    let coaching = '';
    try {
      coaching = await generateCoachingInsight('week', reportData);
    } catch (aiError) {
      console.error('AI coaching failed:', aiError);
      coaching = 'Keep tracking your expenses! 💪';
    }

    // Build final message
    return [
      '📊 *Weekly Report*',
      '',
      `💰 *Income:* ₹${income.toLocaleString('en-IN')}`,
      `💸 *Spent:* ₹${expense.toLocaleString('en-IN')}`,
      `🏁 *Balance:* ₹${balance.toLocaleString('en-IN')}`,
      '',
      `📈 *Transactions:* ${transactions.length}`,
      '',
      '📂 *Spending by Category:*',
      categoryLines || '  No expenses recorded',
      '',
      '🤖 *Coach Says:*',
      coaching
    ].join('\n');

  } catch (error) {
    console.error('generateWeeklyReport error:', error);
    throw error;
  }
}

// ============================================================
// GET USERS WHO SHOULD RECEIVE REPORTS
// ============================================================

async function getReportRecipients(): Promise<string[]> {
  try {
    // Get settings for users with weekly reports enabled
    const settings = await Settings.find({
      weeklyReportEnabled: { $ne: false }  // Not disabled
    });

    return settings.map(s => s.chatId);
  } catch (error) {
    console.error('getReportRecipients error:', error);
    return [];
  }
}

// ============================================================
// CRON SCHEDULER
// ============================================================

export function startWeeklyReportCron(
  sendMessage: (jid: string, text: string) => Promise<void>
): void {
  // Every Sunday at 9PM IST
  cron.schedule('0 21 * * 0', async () => {
    console.log('🕐 Weekly report cron triggered');
    console.log(`📅 Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

    try {
      // 🔑 Get all users who need reports
      const recipients = await getReportRecipients();

      if (recipients.length === 0) {
        console.log('📭 No users to send reports to');
        return;
      }

      console.log(`👥 Sending reports to ${recipients.length} users`);

      // Send report to each user
      for (const chatId of recipients) {
        try {
          const report = await generateWeeklyReport(chatId);
          await sendMessage(chatId, report);
          console.log(`✅ Report sent to ${chatId}`);
          
          // Update lastWeeklySent timestamp
          await Settings.findOneAndUpdate(
            { chatId },
            { lastWeeklySent: new Date() }
          );

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (userError) {
          console.error(`❌ Failed to send report to ${chatId}:`, userError);
          // Continue with next user even if one fails
        }
      }

      console.log('✅ Weekly report cron completed');

    } catch (error) {
      console.error('❌ Weekly report cron error:', error);
    }
  }, {
    timezone: "Asia/Kolkata"
  });

  console.log('⏰ Weekly report cron scheduled (Sunday 9PM IST)');
}

// ============================================================
// MANUAL TRIGGER (For testing or !report command)
// ============================================================

export async function sendManualWeeklyReport(
  chatId: string,
  sendMessage: (jid: string, text: string) => Promise<void>
): Promise<void> {
  try {
    console.log(`📊 Generating manual report for ${chatId}`);
    const report = await generateWeeklyReport(chatId);
    await sendMessage(chatId, report);
    console.log(`✅ Manual report sent to ${chatId}`);
  } catch (error) {
    console.error('Manual report error:', error);
    throw error;
  }
}