import type { WASocket } from '@whiskeysockets/baileys';
import { getTodayStats } from '../services/stats.js';
import { Transaction } from '../models/Transaction.js';

// ============================================================
// VALIDATION
// ============================================================

const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 999999999;

function validateAmount(amount: number): string | null {
  if (isNaN(amount)) return 'Amount must be a number';
  if (amount < MIN_AMOUNT) return `Minimum amount is ₹${MIN_AMOUNT}`;
  if (amount > MAX_AMOUNT) return `Maximum amount is ₹${MAX_AMOUNT.toLocaleString('en-IN')}`;
  return null;
}

// ============================================================
// UTILITIES
// ============================================================

function formatJid(jidOrPhone: string): string {
  if (jidOrPhone.includes('@')) return jidOrPhone;
  const cleaned = jidOrPhone.replace(/\D/g, '');
  return `${cleaned}@s.whatsapp.net`;
}

async function sendReply(sock: WASocket, jid: string, text: string): Promise<void> {
  try {
    await sock.sendMessage(formatJid(jid), { text });
  } catch (error) {
    console.error('Failed to send reply:', error);
  }
}

function formatDate(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

async function handleGreeting(sock: WASocket, sender: string): Promise<void> {
  await sendReply(sock, sender,
    '👋 *Welcome to Artha Sankalpah Bot*\n\n' +
    'Your personal bookkeeper and budgeting coach.\n\n' +
    '📝 *Quick Start:*\n' +
    '• `food 300` → Log expense\n' +
    '• `salary 50000 income` → Log income\n' +
    '• `!help` → All commands\n\n' +
    '💡 *Pro tip:* Add notes like `food 300 swiggy biryani`'
  );
}

async function handleHelp(sock: WASocket, sender: string): Promise<void> {
  await sendReply(sock, sender,
    '📚 *Available Commands*\n\n' +
    '💰 *Logging*\n' +
    '• `food 300` → Add expense\n' +
    '• `salary 50000 income` → Add income\n' +
    '• `rent 15000 note monthly` → With note\n\n' +
    '📊 *Viewing*\n' +
    '• `!status` → Today\'s summary\n' +
    '• `!last` → Recent 5 transactions\n' +
    '• `!stats` → Monthly breakdown\n\n' +
    '✏️ *Editing*\n' +
    '• `edit food 300` → Edit last entry\n' +
    '• `edit 2 food 300` → Edit specific #\n' +
    '• `delete 2` → Remove transaction'
  );
}

async function handleStatus(sock: WASocket, sender: string): Promise<void> {
  try {
    const stats = await getTodayStats(sender);

    if (stats.transactionCount === 0) {
      await sendReply(sock, sender, '📝 No transactions today!\n\nStart by sending: `food 300`');
      return;
    }

    await sendReply(sock, sender,
      '📊 *Today\'s Ledger*\n\n' +
      `💰 Income: ₹${stats.income.toLocaleString('en-IN')}\n` +
      `💸 Expenses: ₹${stats.expense.toLocaleString('en-IN')}\n` +
      `🏁 Balance: ₹${stats.balance.toLocaleString('en-IN')}\n\n` +
      `📈 Transactions: ${stats.transactionCount}`
    );
  } catch (error) {
    console.error('Status command error:', error);
    await sendReply(sock, sender, '❌ Failed to fetch stats. Please try again.');
  }
}

async function handleLast(sock: WASocket, sender: string): Promise<void> {
  try {
    const recent = await Transaction.find({ chatId: sender })
      .sort({ date: -1 })
      .limit(5)
      .lean();

    if (recent.length === 0) {
      await sendReply(sock, sender, '📝 No transactions yet!\n\nStart by sending: `food 300`');
      return;
    }

    const list = recent.map((t, i) => {
      const icon = t.type === 'income' ? '💰' : '💸';
      const desc = t.description ? `\n   📝 ${t.description}` : '';
      return `${i + 1}. ${icon} ₹${t.amount.toLocaleString('en-IN')} — ${t.category}\n   📅 ${formatDate(t.date)}${desc}`;
    }).join('\n\n');

    await sendReply(sock, sender,
      `📝 *Recent Transactions*\n\n${list}\n\n` +
      '✏️ `edit food 300` → Edit last\n' +
      '✏️ `edit 2 food 300` → Edit #2\n' +
      '🗑️ `delete 2` → Remove #2'
    );
  } catch (error) {
    console.error('Last command error:', error);
    await sendReply(sock, sender, '❌ Failed to fetch transactions.');
  }
}

async function handleEdit(
  sock: WASocket,
  sender: string,
  rawParts: string[]
): Promise<void> {
  try {
    const tokens = rawParts.slice(1);

    if (tokens.length === 0) {
      await sendReply(sock, sender,
        '✏️ *Edit Usage:*\n' +
        '• `edit food 300` → Edit last\n' +
        '• `edit 2 food 300` → Edit #2\n' +
        '• `edit income 5000` → Change type'
      );
      return;
    }

    const recent = await Transaction.find({ chatId: sender })
      .sort({ date: -1 })
      .limit(10)
      .lean();

    if (recent.length === 0) {
      await sendReply(sock, sender, '❌ No transactions to edit.');
      return;
    }

    let position = 1;
    let rest = tokens;
    const maybePosition = parseInt(tokens[0]!);
    if (!isNaN(maybePosition) && maybePosition >= 1 && maybePosition <= recent.length) {
      position = maybePosition;
      rest = tokens.slice(1);
    }

    if (rest.length === 0) {
      await sendReply(sock, sender, '❌ Nothing to update. Example: `edit food 300`');
      return;
    }

    const txn = await Transaction.findById(recent[position - 1]!._id);
    if (!txn) {
      await sendReply(sock, sender, `❌ Transaction #${position} not found.`);
      return;
    }

    let category = '';
    let amount: number | null = null;
    let type: 'income' | 'expense' | null = null;
    let description = '';
    const noteIndex = rest.indexOf('note');

    for (let i = rest.length - 1; i >= 0; i--) {
      const num = parseFloat(rest[i]!);
      if (!isNaN(num) && amount === null) {
        amount = num;
        rest.splice(i, 1);
        break;
      }
    }

    const typeIndex = rest.findIndex(w => w === 'income' || w === 'expense');
    if (typeIndex !== -1) {
      type = rest[typeIndex] as 'income' | 'expense';
      rest.splice(typeIndex, 1);
    }

    if (noteIndex !== -1) {
      description = rest.slice(noteIndex + 1).join(' ');
      rest = rest.slice(0, noteIndex);
    }

    category = rest.join(' ');

    if (amount !== null) {
      const error = validateAmount(amount);
      if (error) {
        await sendReply(sock, sender, `❌ ${error}`);
        return;
      }
      txn.amount = amount;
    }
    if (category) txn.category = category.toLowerCase().trim();
    if (type) txn.type = type;
    if (description) txn.description = description.trim();

    await txn.save();

    await sendReply(sock, sender,
      `✏️ *Updated #${position}*\n` +
      `₹${txn.amount.toLocaleString('en-IN')} — ${txn.category} (${txn.type})\n` +
      `📅 ${formatDate(txn.date)}` +
      (txn.description ? `\n📝 ${txn.description}` : '')
    );
  } catch (error) {
    console.error('Edit command error:', error);
    await sendReply(sock, sender, '❌ Failed to edit transaction.');
  }
}

async function handleDelete(
  sock: WASocket,
  sender: string,
  rawParts: string[]
): Promise<void> {
  try {
    if (rawParts.length < 2) {
      await sendReply(sock, sender, '❌ Usage: `delete 2`\nUse `!last` to see transaction numbers.');
      return;
    }

    const position = parseInt(rawParts[1]!);
    if (isNaN(position) || position < 1) {
      await sendReply(sock, sender, '❌ Please provide a valid number. Example: `delete 2`');
      return;
    }

    const recent = await Transaction.find({ chatId: sender })
      .sort({ date: -1 })
      .limit(position)
      .lean();

    const txn = recent[position - 1];
    if (!txn) {
      await sendReply(sock, sender, `❌ Transaction #${position} not found.\nUse \`!last\` to see available transactions.`);
      return;
    }

    const deletedInfo = `₹${txn.amount.toLocaleString('en-IN')} — ${txn.category} (${formatDate(txn.date)})`;
    await Transaction.findByIdAndDelete(txn._id);

    await sendReply(sock, sender,
      '🗑️ *Transaction Deleted*\n\n' +
      `#${position}: ${deletedInfo}`
    );
  } catch (error) {
    console.error('Delete command error:', error);
    await sendReply(sock, sender, '❌ Failed to delete transaction.');
  }
}

// ============================================================
// MAIN HANDLER (EXPORTED)
// ============================================================

export async function handleCommand(
  sock: WASocket,
  sender: string,
  text: string
): Promise<boolean> {
  const normalized = text.trim().toLowerCase();
  const rawParts = text.trim().split(/\s+/);

  // Greetings
  if (['hi', 'hello', 'hey', 'yo'].includes(normalized)) {
    await handleGreeting(sock, sender);
    return true;
  }

  // Help
  if (normalized === '!help' || normalized === '!commands') {
    await handleHelp(sock, sender);
    return true;
  }

  // Status
  if (normalized === '!status' || normalized === '!today') {
    await handleStatus(sock, sender);
    return true;
  }

  // Last/Recent
  if (normalized === '!last' || normalized === '!recent') {
    await handleLast(sock, sender);
    return true;
  }

  // Edit
  if (['edit', 'update', 'change'].includes(rawParts[0]?.toLowerCase()!) && rawParts.length > 1) {
    await handleEdit(sock, sender, rawParts);
    return true;
  }

  // Delete
  if (['delete', 'del', 'remove'].includes(rawParts[0]?.toLowerCase()!) && rawParts[1]) {
    await handleDelete(sock, sender, rawParts);
    return true;
  }

  return false;
}