// src/handlers/commands.ts
import { Settings } from '../models/Settings';
import { WASocket } from '@whiskeysockets/baileys';
import { getTodayStats } from '../services/stats';
import { Transaction } from '../models/Transaction';

async function getRecentList() {
  return Transaction.find().sort({ date: -1 }).limit(5);
}

function formatDateTime(date: Date) {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

const FIELD_WORDS = ['category', 'cat', 'type', 'note', 'desc', 'description'];

export async function handleCommand(
  sock: WASocket, 
  sender: string, 
  text: string
): Promise<boolean> {

  const normalized = text.trim().toLowerCase();
  const rawParts = text.trim().split(/\s+/);

  if (normalized === 'hi' || normalized === 'hello' || normalized === 'hey') {
    await sock.sendMessage(sender, {
      text: `👋 *Welcome to Artha Sankalpah Bot*\n\nYour personal bookkeeper and budgeting coach.\n\nJust send me a message about any expense or income, and I'll log it for you.\n\nType *!status* to see today's summary.`
    });
    return true;
  }

  if (normalized === '!status') {
    const { income, expense, balance } = await getTodayStats();
    await sock.sendMessage(sender, {
      text: `📊 *Today's Ledger*\n\n💰 Income: ₹${income}\n💸 Utilized: ₹${expense}\n🏁 Leftover: ₹${balance}`
    });
    return true;
  }

  if (normalized === '!last') {
    const recent = await getRecentList();
    if (recent.length === 0) {
      await sock.sendMessage(sender, { text: "No transactions yet." });
      return true;
    }

    const list = recent.map((t, i) =>
      `${i + 1}. ₹${t.amount} — ${t.category} (${t.type})\n   🕒 ${formatDateTime(t.date)}`
    ).join('\n\n');

    await sock.sendMessage(sender, {
      text: `📝 *Recent Transactions*\n\n${list}\n\n✏️ *edit food 300* → fixes most recent\n✏️ *edit 2 food 300* → fixes #2\n🗑️ *delete 2* → remove it`
    });
    return true;
  }

  // EDIT — flexible order, optional position
  if (rawParts[0]?.toLowerCase() === 'edit' && rawParts.length > 1) {
    const tokens = rawParts.slice(1);
    const recent = await getRecentList();

    // If first token is a valid position number, use it; else default to most recent (#1)
    let position = 1;
    let rest = tokens;
    const maybePosition = Number(tokens[0]);
    if (!isNaN(maybePosition) && maybePosition >= 1 && maybePosition <= recent.length) {
      position = maybePosition;
      rest = tokens.slice(1);
    }

    const txn = recent[position - 1];
    if (!txn) {
      await sock.sendMessage(sender, { text: `No transaction #${position}. Send !last to see the list.` });
      return true;
    }

    if (rest.length === 0) {
      await sock.sendMessage(sender, {
        text: `Usage:\nedit food 300\nedit 2 food 300\nedit income 500`
      });
      return true;
    }

    let matched = false;

    // scan tokens: numbers -> amount, income/expense -> type, else collect as category words
    const categoryWords: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      const word = rest[i].toLowerCase();

      if (!isNaN(Number(rest[i]))) {
        txn.amount = Number(rest[i]);
        matched = true;
        continue;
      }
      if (word === 'income' || word === 'expense') {
        txn.type = word as 'income' | 'expense';
        matched = true;
        continue;
      }
      if (FIELD_WORDS.includes(word) && rest[i + 1]) {
        const value = rest.slice(i + 1).join(' ');
        if (word === 'category' || word === 'cat') txn.category = value.toLowerCase();
        else if (word === 'type' && (value === 'income' || value === 'expense')) txn.type = value;
        else if (['note', 'desc', 'description'].includes(word)) txn.description = value;
        matched = true;
        break; // rest consumed as the value
      }
      // plain word, not a keyword -> treat as category
      categoryWords.push(word);
    }

    if (categoryWords.length > 0) {
      txn.category = categoryWords.join(' ');
      matched = true;
    }

    if (!matched) {
      await sock.sendMessage(sender, {
        text: `Didn't catch that. Try:\nedit food 300\nedit 2 food 300\nedit income 500`
      });
      return true;
    }

    await txn.save();
    await sock.sendMessage(sender, {
      text: `✏️ *Updated #${position}*\n₹${txn.amount} — ${txn.category} (${txn.type})\n🕒 ${formatDateTime(txn.date)}`
    });
    return true;
  }

  // DELETE
  if (['delete', 'del', 'remove'].includes(rawParts[0]?.toLowerCase()) && rawParts[1]) {
    const position = Number(rawParts[1]);
    const recent = await getRecentList();
    const txn = recent[position - 1];

    if (!txn) {
      await sock.sendMessage(sender, { text: `No transaction #${position}. Send !last to see the list.` });
      return true;
    }

    await txn.deleteOne();
    await sock.sendMessage(sender, {
      text: `🗑️ Deleted #${position}: ₹${txn.amount} — ${txn.category} (${formatDateTime(txn.date)})`
    });
    return true;
  }

  return false;
}