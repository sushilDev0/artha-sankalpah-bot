import { Transaction } from '../models/Transaction.js';

// ============================================================
// TYPES
// ============================================================

interface TodayStats {
  income: number;
  expense: number;
  balance: number;
  transactionCount: number;
}

// ============================================================
// TODAY'S STATS
// ============================================================

export async function getTodayStats(chatId: string): Promise<TodayStats> {
  try {
    // Calculate start of day (IST - Asia/Kolkata)
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    // Aggregate transactions for this user only
    const stats = await Transaction.aggregate([
      {
        $match: {
          chatId,  // 🔑 Filter by user
          date: { 
            $gte: startOfDay, 
            $lt: endOfDay 
          }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const income = stats.find((s: any) => s._id === 'income')?.total || 0;
    const expense = stats.find((s: any) => s._id === 'expense')?.total || 0;
    const transactionCount = stats.reduce((sum: number, s: any) => sum + s.count, 0);

    return {
      income,
      expense,
      balance: income - expense,
      transactionCount
    };

  } catch (error) {
    console.error('getTodayStats error:', error);
    throw new Error('Failed to fetch today\'s stats');
  }
}

// ============================================================
// WEEKLY STATS (Optional - if needed by other files)
// ============================================================

export async function getWeeklyStats(chatId: string): Promise<TodayStats> {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    const stats = await Transaction.aggregate([
      {
        $match: {
          chatId,
          date: { $gte: startOfWeek }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const income = stats.find((s: any) => s._id === 'income')?.total || 0;
    const expense = stats.find((s: any) => s._id === 'expense')?.total || 0;
    const transactionCount = stats.reduce((sum: number, s: any) => sum + s.count, 0);

    return {
      income,
      expense,
      balance: income - expense,
      transactionCount
    };

  } catch (error) {
    console.error('getWeeklyStats error:', error);
    throw new Error('Failed to fetch weekly stats');
  }
}

// ============================================================
// MONTHLY STATS (Optional - for !stats command)
// ============================================================

export async function getMonthlyStats(chatId: string): Promise<TodayStats> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const stats = await Transaction.aggregate([
      {
        $match: {
          chatId,
          date: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const income = stats.find((s: any) => s._id === 'income')?.total || 0;
    const expense = stats.find((s: any) => s._id === 'expense')?.total || 0;
    const transactionCount = stats.reduce((sum: number, s: any) => sum + s.count, 0);

    return {
      income,
      expense,
      balance: income - expense,
      transactionCount
    };

  } catch (error) {
    console.error('getMonthlyStats error:', error);
    throw new Error('Failed to fetch monthly stats');
  }
}