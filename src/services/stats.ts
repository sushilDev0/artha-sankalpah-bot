import { Transaction } from '../models/Transaction';

export async function getTodayStats() {
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