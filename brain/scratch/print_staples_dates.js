const mongoose = require('mongoose');
const SalesData = require('/Users/apple/Documents/FYP/server/models/SalesData');

const MONGO_URI = 'mongodb+srv://db-ai-bussiness-advisor:ezLve7iOlwP4nRlY@cluster0.phdhgsy.mongodb.net/ai_advisor?retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  await mongoose.connect(MONGO_URI);
  const userId = new mongoose.Types.ObjectId('6a0832e103822fbe8b20a740');
  const product = 'Staples';

  const salesData = await SalesData.find({ userId, product }).sort({ date: 1 }).lean();
  console.log(`Found ${salesData.length} records.`);
  
  const dates = salesData.map(r => r.date.toISOString());
  console.log('Unique dates:', [...new Set(dates)]);
  
  process.exit(0);
}

run().catch(console.error);
