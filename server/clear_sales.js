// One-off script: wipe SalesData, InventoryItem, and Forecast collections
// so you can re-upload fresh data from prepare_kaggle.py
// Run with:   node clear_sales.js
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected! Deleting sales, inventory, and forecast documents...');
  const SalesData = require('./models/SalesData');
  const InventoryItem = require('./models/InventoryItem');
  const Forecast = require('./models/Forecast');

  const s = await SalesData.deleteMany({});
  const i = await InventoryItem.deleteMany({});
  const f = await Forecast.deleteMany({});

  console.log(`Deleted ${s.deletedCount} sales rows`);
  console.log(`Deleted ${i.deletedCount} inventory items`);
  console.log(`Deleted ${f.deletedCount} forecasts`);

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
