import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';

dotenv.config();

// The 2026 SDK uses a unified Client
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

        const responseText = response.text;
        const cleanJson = responseText.replace(/```json|```/g, "").trim();
        return JSON.parse(cleanJson);
    } catch (error) {
        console.error("AI Error:", error);
        return null;
    }
}