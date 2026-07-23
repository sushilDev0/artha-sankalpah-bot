import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

/**
 * Parses raw text into a structured financial transaction.
 * Uses Gemini's responseSchema to guarantee valid JSON output.
 */
export async function parseTransaction(userInput: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract financial data from: "${userInput}". If the input is not a transaction, set error to "ignore".`,
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

    if (!response.text) return null;
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Transaction Parse Error:", error);
    return null;
  }
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
      console.error(`Coaching AI Error (attempt ${attempt}):`, error.message);

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