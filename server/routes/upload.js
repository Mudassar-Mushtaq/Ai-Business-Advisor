const express = require('express');
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');
const XLSX = require('xlsx');
const { parse } = require('csv-parse');
const requireAuth = require('../middleware/requireAuth');
const SalesData = require('../models/SalesData');
const InventoryItem = require('../models/InventoryItem');
const UploadHistory = require('../models/UploadHistory');
const Forecast = require('../models/Forecast');
const { triggerForecastGeneration } = require('../services/forecastRunner');
const cache = require('../config/cache');
const { runAlertPipeline } = require('../services/alertService');

const router = express.Router();

// ── Multer: keep the file in memory (Buffer) — avoids temp-file disk I/O ──
const fileFilter = (req, file, cb) => {
  const allowed = ['.csv', '.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Only CSV and Excel files are allowed'), false);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── Normalize a parsed row to the SalesData schema ──
function normalizeRow(row) {
  const keys = Object.keys(row).reduce((acc, k) => {
    acc[k.toLowerCase().replace(/\s+/g, '_')] = row[k];
    return acc;
  }, {});

  const date = keys.date || keys.sale_date || keys.order_date || keys.order_date || new Date().toISOString();
  const product = keys.product || keys.product_name || keys.item || keys.name || 'Unknown';
  const quantity = parseFloat(keys.quantity || keys.qty || keys.units_sold || keys.units || 1);
  const revenue = parseFloat(
    keys.revenue || keys.sales || keys.amount || keys.total ||
    keys.sale_price || keys.selling_price || keys.price || keys.unit_price ||
    keys.market_price || 0
  );
  const category = keys.category || keys.type || keys.sub_category || 'General';
  const cost = parseFloat(keys.cost || keys.cogs || keys.cost_price || keys.buying_price || 0);
  const region = keys.region || keys.location || keys.city || 'Global';

  return { date: new Date(date), product, quantity, revenue, category, cost, region };
}

// ── Batch size for chunked inserts ──
const BATCH_SIZE = 1000;

// ── Process a batch: bulk-insert sales + accumulate product map ──
async function processBatch(batch, userId, productMap) {
  const salesDocs = batch.map(r => ({ ...r, userId }));

  // Ordered: false lets Mongo continue inserting even if one doc fails
  await SalesData.insertMany(salesDocs, { ordered: false });

  for (const r of batch) {
    if (!productMap[r.product]) productMap[r.product] = { total: 0, category: r.category };
    productMap[r.product].total += r.quantity;
  }
}

// ── Stream-parse a CSV buffer in batches ──
function streamCSV(buffer, userId, productMap) {
  return new Promise((resolve, reject) => {
    let batch = [];
    let totalRows = 0;

    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    const pending = [];

    parser.on('readable', function () {
      let record;
      while ((record = parser.read()) !== null) {
        const normalized = normalizeRow(record);
        if (normalized.product !== 'Unknown' || normalized.revenue > 0) {
          batch.push(normalized);
          totalRows++;
        }

        if (batch.length >= BATCH_SIZE) {
          const chunk = batch;
          batch = [];
          // Pause parser while we write to Mongo, then resume
          parser.pause();
          const p = processBatch(chunk, userId, productMap)
            .then(() => parser.resume())
            .catch((err) => parser.destroy(err));
          pending.push(p);
        }
      }
    });

    parser.on('end', async () => {
      try {
        // Flush the final partial batch
        if (batch.length > 0) {
          pending.push(processBatch(batch, userId, productMap));
        }
        await Promise.all(pending);
        resolve(totalRows);
      } catch (err) {
        reject(err);
      }
    });

    parser.on('error', reject);

    // Feed the buffer into the parser as a stream
    const readable = Readable.from(buffer);
    readable.pipe(parser);
  });
}

// ── Parse an Excel buffer in batches ──
async function parseExcelBuffer(buffer, userId, productMap) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  let totalRows = 0;
  let batch = [];

  for (const row of rows) {
    const normalized = normalizeRow(row);
    if (normalized.product !== 'Unknown' || normalized.revenue > 0) {
      batch.push(normalized);
      totalRows++;
    }
    if (batch.length >= BATCH_SIZE) {
      await processBatch(batch, userId, productMap);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await processBatch(batch, userId, productMap);
  }

  return totalRows;
}

// ── Bulk upsert inventory using bulkWrite (single DB round-trip) ──
async function bulkUpsertInventory(userId, productMap) {
  const ops = Object.entries(productMap).map(([product, val]) => ({
    updateOne: {
      filter: { userId, product },
      update: {
        $inc: { stock: -val.total },
        $set: { category: val.category, lastUpdated: new Date() },
      },
      upsert: true,
    },
  }));

  if (ops.length > 0) {
    await InventoryItem.bulkWrite(ops, { ordered: false });
  }
}

// ── POST /api/upload ──
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const userId = req.user._id;

  try {
    // 1. Aggregate old uploaded quantities per product (runs on MongoDB, not in Node memory)
    const oldProductAgg = await SalesData.aggregate([
      { $match: { userId, source: 'upload' } },
      { $group: { _id: '$product', totalQty: { $sum: '$quantity' } } },
    ]);

    const oldProductQuantities = {};
    for (const doc of oldProductAgg) {
      if (doc._id) oldProductQuantities[doc._id] = doc.totalQty || 0;
    }

    // 2. Revert the stock level adjustments for the old uploaded sales
    const restoreOps = Object.entries(oldProductQuantities).map(([product, qty]) => ({
      updateOne: {
        filter: { userId, product },
        update: {
          $inc: { stock: qty }
        }
      }
    }));
    if (restoreOps.length > 0) {
      await InventoryItem.bulkWrite(restoreOps, { ordered: false });
    }

    // 3. Wipe old uploaded sales data for this user
    await SalesData.deleteMany({ userId, source: 'upload' });

    // 4. Parse the new CSV or Excel file
    const productMap = {};
    let totalRows;

    if (ext === '.csv') {
      totalRows = await streamCSV(req.file.buffer, userId, productMap);
    } else {
      totalRows = await parseExcelBuffer(req.file.buffer, userId, productMap);
    }

    if (totalRows === 0) {
      return res.status(400).json({ error: 'File is empty or has no valid rows.' });
    }

    // 5. Bulk upsert inventory (subtracts new sales quantities)
    await bulkUpsertInventory(userId, productMap);

    // 6. Update Forecasts (stale for present products, delete for missing ones)
    try {
      const newProducts = Object.keys(productMap);
      await Promise.all([
        Forecast.updateMany(
          { userId, product: { $in: newProducts } },
          { $set: { isStale: true } }
        ),
        Forecast.deleteMany(
          { userId, product: { $nin: newProducts } }
        )
      ]);
    } catch (err) {
      console.error('Failed to update forecasts during upload:', err.message);
    }

    // Bust cache synchronously before responding to ensure client gets fresh data
    try {
      await Promise.all([
        cache.delPattern(`sales:${userId}:*`),
        cache.delPattern(`inventory:${userId}:*`),
        cache.delPattern(`forecast:${userId}:*`),
      ]);
    } catch (err) {
      console.error('Cache bust error during upload:', err.message);
    }

    // Run alert pipeline and trigger forecast generation in the background
    setImmediate(async () => {
      try {
        await runAlertPipeline(userId);
      } catch (err) {
        console.error('Background alert pipeline error:', err.message);
      }

      try {
        // Retrieve the last model selected by the user, fallback to 'rf'
        const lastForecast = await Forecast.findOne({ userId }).sort({ generatedAt: -1 }).lean();
        const model = lastForecast?.model || 'rf';
        await triggerForecastGeneration(userId, { model, forecastDays: 30, trigger: 'upload' });
      } catch (err) {
        console.error('Background auto-trigger forecast generation failed:', err.message);
      }
    });

    // Build a small preview from the first products in the map
    const preview = Object.entries(productMap)
      .slice(0, 10)
      .map(([product, val]) => ({ product, totalQuantity: val.total, category: val.category }));

    const productsUpdated = Object.keys(productMap).length;

    // Save upload history record
    const historyRecord = await UploadHistory.create({
      userId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: ext,
      rowsImported: totalRows,
      productsUpdated,
      status: 'success',
    });

    res.json({
      message: 'File uploaded and processed successfully.',
      rowsImported: totalRows,
      productsUpdated,
      alerts: [], // alerts are generated in background — they'll appear via the normal alerts API
      preview,
      uploadId: historyRecord._id,
    });
  } catch (err) {
    console.error('Upload error:', err);
    // Save failed upload history
    if (req.file) {
      UploadHistory.create({
        userId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: ext,
        rowsImported: 0,
        status: 'failed',
        errorMessage: err.message,
      }).catch(() => {});
    }
    res.status(500).json({ error: err.message || 'File processing failed.' });
  }
});

// ── GET /api/upload/history — returns the user's upload history ──
router.get('/history', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await UploadHistory.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
