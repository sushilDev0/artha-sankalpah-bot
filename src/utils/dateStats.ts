
// src/utils/dateStats.ts
import { Transaction } from '../models/Transaction';

export const TZ = 'Asia/Kolkata';

export function formatDateTime(date: Date) {
  return date.toLocaleString('en-IN', {
    timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  });
}
export function formatDateOnly(date: Date) {
  return date.toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}
export function startOfDay(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
export function endOfDay(d: Date) {
  const x = startOfDay(d); x.setDate(x.getDate() + 1); return x;
}
export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}
export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}
export function isLastDayOfMonth(d: Date) {
  const test = new Date(d);
  test.setDate(test.getDate() + 1);
  return test.getMonth() !== d.getMonth();
}

export async function getStatsForRange(start: Date, end: Date) {
  const txns = await Transaction.find({ date: { $gte: start, $lt: end } }).sort({ date: 1 });
  let income = 0, expense = 0;
  const byCategory: Record<string, number> = {};

  for (const t of txns) {
    if (t.type === 'income') income += t.amount;
    else {
      expense += t.amount;
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    }
  }
  return { income, expense, balance: income - expense, txns, byCategory };
}