import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
});

export async function parseTransaction(userInput: string) {
    try {
        // Direct call on models.generateContent
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: [{
                role: 'user',
                parts: [{ text: `Extract financial data from: "${userInput}". Return ONLY JSON: {"amount": number, "type": "income"|"expense", "category": "string", "note": "string"}. If not a transaction, return {"error": "ignore"}.` }]
            }]
        });

        const responseText:any = response.text;
        const cleanJson = responseText.replace(/```json|```/g, "").trim();
        return JSON.parse(cleanJson);
    } catch (error) {
        console.error("AI Error:", error);
        return null;
    }
}

export async function generateCoachingInsight(period: string, stats: {
  income: number; expense: number; balance: number; byCategory: Record<string, number>;
}) {
  const categoryLines = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `${cat}: ₹${amt}`)
    .join(', ');

  const prompt = `You are a friendly, practical budgeting coach. Here is the user's ${period} summary:
Income: ₹${stats.income}
Expenses: ₹${stats.expense}
Balance: ₹${stats.balance}
Spending by category: ${categoryLines || 'none'}

Write a short WhatsApp message (max 5 sentences) with:
1. One honest observation about their ${period}.
2. One specific, actionable tip for next ${period}.
Keep it warm, encouraging, no fluff, no generic advice. Use ₹ symbol. Do not use markdown headers.`;

  // retry up to 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      return (response.text as any)?.trim() || null;

    } catch (error: any) {
      console.error(`Coaching AI Error (attempt ${attempt}):`, error.message);

      if (attempt < 3 && error.status === 503) {
        console.log(`⏳ Retrying in 2 seconds...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      return null;
    }
  }

  return null;
}