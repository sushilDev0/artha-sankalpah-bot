import { Transaction } from '../models/Transaction.js';

export async function generateCsvExport(chatId:string): Promise<string> {

  const transactions = await Transaction.find({ chatId }).
  sort({ date: -1 }).
  lean();

  if(transactions.length === 0) {
    throw new Error('No transactions found for this chatId');
  }

  const headers = ['Date', 'Type', 'Category', 'Amount', 'Description'];
  const rows = transactions.map((tx) => {
    const formattedDate = new Date(tx.date).toISOString().split('T')[0]; // Format date as YYYY-MM-DD
    const cleanDesc = (tx.description || '').replace(/"/g, '""'); // Escape double quotes
    return `"${formattedDate}","${tx.type}","${tx.category}","${tx.amount}","${cleanDesc}"`;
});

return [headers.join(','), ...rows].join('\n');

}