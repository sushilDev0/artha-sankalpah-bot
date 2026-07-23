import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

/**
 * Fallback parser when the AI API is down or timing out (503/429/Network Error).
 * Handles inputs like "savings 1000", "food 180", "1.5k wallet", "bank 500".
 */
function localRegexFallback(userInput: string) {
  const clean = userInput.trim().toLowerCase();
  const parts = clean.split(/\s+/);

  if (parts.length < 2) return null;

  // Case 1: Number/Shorthand + Word (e.g., "1.5k savings", "180 food")
  let rawAmount = parts[0];
  let word = parts.slice(1).join(" ");

  // Case 2: Word + Number/Shorthand (e.g., "savings 1000", "food 180")
  if (isNaN(Number(rawAmount.replace(/k$/i, '000')))) {
    rawAmount = parts[parts.length - 1];
    word = parts.slice(0, -1).join(" ");
  }

  // Handle 'k' shorthand in fallback
  let amount = 0;
  if (rawAmount.endsWith('k')) {
    amount = parseFloat(rawAmount.replace('k', '')) * 1000;
  } else {
    amount = Number(rawAmount);
  }

  if (isNaN(amount) || amount <= 0) return null;

  // Classify Type
  let type: 'income' | 'expense' = 'expense';
  if (['bank', 'earned', 'got', 'received', 'salary', 'income'].includes(word)) {
    type = 'income';
  }

  // Normalize Savings
  if (['savings', 'save', 'fd', 'rd', 'investment', 'invest'].includes(word)) {
    word = 'savings';
  }

  return {
    amount,
    type,
    category: word,
    note: ''
  };
}

/**
 * Parses raw text into a structured financial transaction.
 * Uses Gemini's responseSchema to guarantee valid JSON output, with retry logic and fallback.
 */
export async function parseTransaction(userInput: string) {
  const prompt = `You are parsing financial transactions for a personal ledger. Extract structured data from: "${userInput}".

Rules & Logic:
1. SPECIFIC MAPPINGS:
   - "Bank <amount>" (e.g., "Bank 500", "Bank 1000") -> type: "income", category: "bank".
   - "Wallet <amount>" (e.g., "Wallet 500", "Wallet 50") -> type: "expense", category: "wallet".
   - "Savings <amount>", "Save <amount>", "FD <amount>", "RD <amount>", "Mutual Fund <amount>" -> type: "expense", category: "savings".
   - Words like "Earned", "Received", "Got", "Salary", "Income" -> type: "income".

2. CATEGORY NORMALIZATION:
   - Map terms like "petrol", "fuel", "rapido", "uber", "cab", "diesel", "train", "flight", "travel" -> category: "transportation".
   - Map terms like "tea", "coffee", "swiggy", "zomato", "biryani", "lunch", "dinner", "food" -> category: "food".
   - Map terms like "recharge", "wifi", "bill", "electricity" -> category: "utilities".
   - Map terms like "kirana", "groceries", "items" -> category: "groceries".

3. NUMBER & CURRENCY PARSING:
   - Support "k" shorthand: "1.5k" -> 1500, "2k" -> 2000.
   - Ignore currency symbols/text like "₹", "rs", "inr".
   - Support reverse word order: both "150 food" and "food 150" work.

4. CONTEXT & NOTES:
   - Extract extra descriptive text beyond the amount and primary category into "note" (e.g., "Savings 2000 for emergency fund" -> category: "savings", amount: 2000, note: "for emergency fund", "Food 180 biryani with friends" -> category: "food", amount: 180, note: "biryani with friends").

5. NON-FINANCIAL:
   - If the input is chit-chat or non-financial, return {"error": "ignore"}.`;

  // Retry up to 3 times for API stability (503 / 429 server errors)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER },
              type: { 
                type: Type.STRING, 
                enum: ["income", "expense"] 
              },
              category: { type: Type.STRING },
              note: { type: Type.STRING },
              error: { type: Type.STRING }
            }
          }
        }
      });

      if (!response.text) break;
      return JSON.parse(response.text);

    } catch (error: any) {
      console.error(`Parse AI Error (attempt ${attempt}):`, error.message || error);

      if (attempt < 3 && (error.status === 503 || error.status === 429)) {
        console.log(`⏳ Gemini busy (${error.status}), retrying in 1.5s...`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      break;
    }
  }

  // Graceful fallback if AI is unreachable
  console.log(`⚠️ AI unavailable, using local fallback for: "${userInput}"`);
  return localRegexFallback(userInput);
}

/**
 * Generates tailored, context-aware financial advice based on period metrics.
 */
export async function generateCoachingInsight(
  period: string, 
  stats: { income: number; expense: number; balance: number; byCategory: Record<string, number> }
) {
  // Extract top expense category
  const sortedCategories = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0];

  // Calculate metrics to help the coach be specific
  const savingsRate = stats.income > 0 
    ? ((stats.balance / stats.income) * 100).toFixed(1) 
    : 0;
  const isOverspending = stats.expense > stats.income && stats.income > 0;

  const categoryLines = sortedCategories
    .map(([cat, amt]) => `${cat}: ₹${amt}`)
    .join(', ');

  const topCategoryText = topCategory 
    ? `Highest spending area: "${topCategory[0]}" at ₹${topCategory[1]}.` 
    : 'No expenses recorded.';

  const prompt = `You are a friendly, direct, and practical personal finance coach analyzing a user's ${period}ly budget for WhatsApp.

User's Data for this ${period}:
- Income: ₹${stats.income}
- Expenses: ₹${stats.expense}
- Net Balance: ₹${stats.balance}
- ${topCategoryText}
- Savings Rate: ${savingsRate}%
- Full Category Breakdown: ${categoryLines || 'None'}

Instructions:
1. Provide one honest observation about their ${period} (directly call out their top expense category if applicable).
2. Give one specific, realistic, and actionable tip for next ${period}.
3. Keep it warm, encouraging, and under 5 sentences. Use the ₹ symbol. Do NOT use markdown headers or fluff.`;

  // Retry logic up to 3 times for API stability
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });

      return response.text?.trim() || null;

    } catch (error: any) {
      console.error(`Coaching AI Error (attempt ${attempt}):`, error.message || error);

      if (attempt < 3 && (error.status === 503 || error.status === 429)) {
        console.log(`⏳ Retrying AI insight generation in 2 seconds...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
    }
  }

  // Graceful fallback advice if AI is completely unreachable
  if (isOverspending && topCategory) {
    return `You spent a bit more than you earned this ${period}. Your largest expense was *${topCategory[0]}* (₹${topCategory[1]}) — keeping an eye on that area next ${period} will make a huge difference! 💪`;
  }

  if (topCategory) {
    return `Solid effort tracking your expenses this ${period}! Most of your money went toward *${topCategory[0]}* (₹${topCategory[1]}). Keep up the momentum! 🚀`;
  }

  return `Great job keeping your ledger updated this ${period}! Keep logging every transaction to stay in control of your budget. 👍`;
}