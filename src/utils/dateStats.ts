import { Transaction } from '../models/Transaction.js';

// ============================================================
// CONSTANTS & TYPES
// ============================================================

export const TZ = 'Asia/Kolkata';

interface RangeStats {
  income: number;
  expense: number;
  balance: number;
  txns: any[];
  byCategory: Record<string, number>;
  transactionCount: number;
}

// ============================================================
// DATE FORMATTING HELPERS
// ============================================================

export function formatDateTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export function formatDateOnly(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// ============================================================
// DATE RANGE HELPERS
// ============================================================

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  // Monday as start of week (0 = Sunday)
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

export function startOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x;
}

export function startOfYear(d: Date): Date {
  const x = new Date(d.getFullYear(), 0, 1);
  return x;
}

// ============================================================
// STATS CALCULATION
// ============================================================

export async function getStatsForRange(
  chatId: string,
  start: Date,
  end: Date
): Promise<RangeStats> {
  try {
    // 🔑 Filter by chatId AND date range
    const txns = await Transaction.find({
      chatId,
      date: { $gte: start, $lt: end }
    })
      .sort({ date: 1 })  // Ascending order for chronological display
      .lean();  // Faster reads

    let income = 0;
    let expense = 0;
    const byCategory: Record<string, number> = {};

    for (const t of txns) {
      if (t.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      }
    }

    return {
      income,
      expense,
      balance: income - expense,
      txns,
      byCategory,
      transactionCount: txns.length
    };

  } catch (error) {
    console.error('getStatsForRange error:', error);
    throw new Error('Failed to fetch stats for range');
  }
}

// ============================================================
// BONUS: CATEGORY-WISE BREAKDOWN (For detailed reports)
// ============================================================

export async function getCategoryBreakdown(
  chatId: string,
  start: Date,
  end: Date
): Promise<Array<{ category: string; total: number; count: number }>> {
  try {
    const result = await Transaction.aggregate([
      {
        $match: {
          chatId,
          type: 'expense',
          date: { $gte: start, $lt: end }
        }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { total: -1 }  // Highest spending first
      }
    ]);

    return result.map((r: any) => ({
      category: r._id,
      total: r.total,
      count: r.count
    }));

  } catch (error) {
    console.error('getCategoryBreakdown error:', error);
    throw new Error('Failed to fetch category breakdown');
  }
}

// ============================================================
// BONUS: DAILY BREAKDOWN (For weekly reports)
// ============================================================

export async function getDailyBreakdown(
  chatId: string,
  start: Date,
  end: Date
): Promise<Array<{ date: string; income: number; expense: number }>> {
  try {
    const result = await Transaction.aggregate([
      {
        $match: {
          chatId,
          date: { $gte: start, $lt: end }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { 
              format: '%Y-%m-%d', 
              date: '$date',
              timezone: TZ
            }
          },
          income: {
            $sum: {
              $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0]
            }
          },
          expense: {
            $sum: {
              $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0]
            }
          }
        }
      },
      {
        $sort: { _id: 1 }  // Chronological order
      }
    ]);

    return result.map((r: any) => ({
      date: r._id,
      income: r.income,
      expense: r.expense
    }));

  } catch (error) {
    console.error('getDailyBreakdown error:', error);
    throw new Error('Failed to fetch daily breakdown');
  }
}