const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://db-ai-bussiness-advisor:ezLve7iOlwP4nRlY@cluster0.phdhgsy.mongodb.net/ai_advisor?retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  await mongoose.connect(MONGO_URI);
  const userId = new mongoose.Types.ObjectId('6a0832e103822fbe8b20a740');
  const SalesData = mongoose.model('SalesData', new mongoose.Schema({}, { strict: false }), 'salesdatas');
  
  const minMax = await SalesData.aggregate([
    { $match: { userId } },
    { $group: {
        _id: null,
        minDate: { $min: '$date' },
        maxDate: { $max: '$date' },
        totalCount: { $sum: 1 }
      }
    }
  ]);
  
  console.log('User SalesData Stats:', minMax[0]);
  
  process.exit(0);
}

run().catch(console.error);
