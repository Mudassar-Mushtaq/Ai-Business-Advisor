const mongoose = require('mongoose');
const SalesData = require('/Users/apple/Documents/FYP/server/models/SalesData');

const MONGO_URI = 'mongodb+srv://db-ai-bussiness-advisor:ezLve7iOlwP4nRlY@cluster0.phdhgsy.mongodb.net/ai_advisor?retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  console.log('Connecting...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const userId = new mongoose.Types.ObjectId('6a0832e103822fbe8b20a740');
  const product = 'Staples';

  console.log(`Querying SalesData for ${product}...`);
  const salesData = await SalesData.find({ userId, product }).sort({ date: 1 }).lean();
  console.log(`Found ${salesData.length} records.`);
  if (salesData.length > 0) {
    console.log('First record:', salesData[0]);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
