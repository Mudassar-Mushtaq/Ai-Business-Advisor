const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const OpenAI = require('openai');
const SalesData = require('../models/SalesData');
const Forecast = require('../models/Forecast');
const InventoryItem = require('../models/InventoryItem');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE || undefined
});

// Build a system prompt enriched with user's business context
async function buildSystemPrompt(userId) {
  const [salesCount, topProducts, forecasts, lowStock] = await Promise.all([
    SalesData.countDocuments({ userId }),
    SalesData.aggregate([
      { $match: { userId } },
      { $group: { _id: '$product', totalRevenue: { $sum: '$revenue' }, totalQty: { $sum: '$quantity' } } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 }
    ]),
    Forecast.find({ userId }).sort({ forecastedRevenue: -1 }).limit(5).lean(),
    InventoryItem.find({ userId, $expr: { $lte: ['$stock', '$reorderLevel'] } }).limit(5).lean(),
  ]);

  const topProds = topProducts.map(p => `${p._id} ($${p.totalRevenue.toFixed(0)})`).join(', ');
  const forecastStr = forecasts.map(f => `${f.product}: ${f.forecastedSales} units / $${f.forecastedRevenue.toFixed(0)} (30d)`).join('\n');
  const lowStockStr = lowStock.map(i => `${i.product}: ${i.stock} units left (reorder at ${i.reorderLevel})`).join('\n');

  return `You are an AI-powered business advisor specialized in sales, inventory, and business forecasting.

## Current Business Context
- Total sales records: ${salesCount}
- Top products by revenue: ${topProds || 'No data yet'}

## 30-Day Forecasts (Random Forest Model)
${forecastStr || 'No forecasts generated yet. Ask the user to generate forecasts first.'}

## Low Stock Alerts
${lowStockStr || 'All inventory levels are healthy.'}

## Your Role
- Provide clear, actionable business advice based on the data above.
- Explain forecasts in plain language when asked.
- Suggest restocking strategies for low-stock items.
- Identify growth opportunities from top-performing products.
- Be concise, professional, and data-driven.
- If asked about specific products or numbers, use the context above.
- If the user asks you to generate forecasts or upload data, guide them to use the app features.`;
}

// POST /api/chat
router.post('/', requireAuth, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  try {
    const systemPrompt = await buildSystemPrompt(req.user._id);

    const response = await openai.chat.completions.create({
      model: process.env.CHAT_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-20), // Keep last 20 messages for context window
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const reply = response.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    if (err.code === 'invalid_api_key') {
      return res.status(500).json({ error: 'OpenAI API key is invalid. Please check your configuration.' });
    }
    res.status(500).json({ error: 'Failed to get AI response. Please try again.' });
  }
});

module.exports = router;
// Trigger nodemon restart

