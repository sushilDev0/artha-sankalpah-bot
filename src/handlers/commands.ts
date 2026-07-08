// src/handlers/commands.ts
import { WASocket } from '@whiskeysockets/baileys';
import { getTodayStats } from '../services/stats';

export async function handleCommand(
  sock: WASocket, 
  sender: string, 
  text: string
): Promise<boolean> {
  
  if (text.toLowerCase() === '!status') {
    const { income, expense, balance } = await getTodayStats();
    await sock.sendMessage(sender, {
      text: `📊 *Today's Ledger*\n\n💰 Income: ₹${income}\n💸 Utilized: ₹${expense}\n🏁 Leftover: ₹${balance}`
    });
    return true; // command was handled
  }

  return false; // not a command
}