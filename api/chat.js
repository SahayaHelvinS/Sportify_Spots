const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDb, collections } = require('../lib/db');

const SPORTS = ['cricket', 'football', 'badminton', 'basketball', 'tennis', 'multi-sport', 'multi sport'];

const SYSTEM_PROMPT = `
You are Sportify Helper for Sportify Spots (sports ground booking).
Follow this flow: greet briefly; ask how to help; when booking ask sport -> date -> time -> confirm; keep replies short, friendly, professional; never say you are AI; encourage quick confirmation because slots fill fast.
If user confirms and slot is unavailable, clearly say so and offer another time.
`;
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function extractDetails(text) {
    const lower = text.toLowerCase();
    const sport = SPORTS.find(s => lower.includes(s)) || null;
    const dateMatch = lower.match(/(\d{4}-\d{2}-\d{2})/);
    const timeMatch = lower.match(/(\d{1,2}(:\d{2})?\s?(am|pm)?)/);
    return {
        sport,
        date: dateMatch ? dateMatch[1] : null,
        time: timeMatch ? timeMatch[1] : null,
        isConfirm: /(confirm|book now|yes, book|yes book|proceed)/i.test(text)
    };
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { message, sessionId } = req.body || {};
    if (!message || !sessionId) return res.status(400).json({ error: 'message and sessionId required' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY not set' });

    try {
        const db = await getDb();
        const convoCol = db.collection(collections.conversations);
        const slotsCol = db.collection(collections.slots);
        const bookingsCol = db.collection(collections.bookings);

        // Persist user message
        await convoCol.insertOne({ sessionId, role: 'user', content: message, ts: new Date() });

        // Load recent history
        const history = await convoCol.find({ sessionId }).sort({ ts: 1 }).limit(30).toArray();
        const geminiHistory = [
            { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
            ...history.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.content }]
            }))
        ];

        // Check for confirm flow before hitting Gemini
        const joined = history.map(h => h.content).join('\n') + '\n' + message;
        const { sport, date, time, isConfirm } = extractDetails(joined);

        if (isConfirm && sport && date && time) {
            const slot = await slotsCol.findOne({ sport, date, time });
            if (!slot || slot.available === false) {
                const reply = `That slot is unavailable. Want another time for ${sport} on ${date}?`;
                await convoCol.insertOne({ sessionId, role: 'assistant', content: reply, ts: new Date() });
                return res.status(200).json({ reply });
            }
            await slotsCol.updateOne({ sport, date, time }, { $set: { available: false } }, { upsert: true });
            await bookingsCol.insertOne({ sessionId, sport, date, time, bookedAt: new Date() });
            const reply = `Booked: ${sport} on ${date} at ${time}. Please complete payment to finalize. Slots are limited.`;
            await convoCol.insertOne({ sessionId, role: 'assistant', content: reply, ts: new Date() });
            return res.status(200).json({ reply });
        }

        // Ask Gemini for next step
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent({
            contents: geminiHistory,
            generationConfig: { maxOutputTokens: 180 }
        });
        const reply = (await result.response).text();

        await convoCol.insertOne({ sessionId, role: 'assistant', content: reply, ts: new Date() });
        return res.status(200).json({ reply });
    } catch (err) {
        console.error('Chat API error', err);
        return res.status(500).json({ error: 'Server error' });
    }
};
