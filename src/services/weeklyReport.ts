import cron from 'node-cron';
import { Transaction } from '../models/Transaction';
import { generateCoachingInsight } from './ai';

export function startWeeklyReportCron(sendMessage: (text: string) => Promise<void>) {
  // Every Sunday at 9PM
cron.schedule('0 21 * * 0', async () => {
  console.log('🕐 Cron triggered!');  
  console.log('📊 Running weekly report...');

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const transactions = await Transaction.find({
        date: { $gte: sevenDaysAgo }
      });

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

      // Build category breakdown
      const categoryLines = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => `  • ${cat}: ₹${amt}`)
        .join('\n');

      // Get AI coaching insight
      const coaching = await generateCoachingInsight('week', {
        income, expense, balance, byCategory
      });

      // Build final message
      const message = `Hi buddy! 👋 Here's your *Weekly Report* 📊

💰 *Income:* ₹${income}
💸 *Spent:* ₹${expense}
🏁 *Balance:* ₹${balance}

📂 *Spending by Category:*
${categoryLines || '  No expenses recorded'}

🤖 *Coach Says:*
${coaching || 'Keep tracking your expenses!'}`;

      await sendMessage(message);
      console.log('✅ Weekly report sent!');

    } catch (error) {
      console.error('❌ Weekly report error:', error);
    }
  }, {
    timezone: "Asia/Kolkata" // IST timezone
  });

  console.log('⏰ Weekly report cron scheduled (Sunday 9PM IST)');
}