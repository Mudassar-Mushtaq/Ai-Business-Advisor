const Connector = require('../../models/Connector');
const SalesData = require('../../models/SalesData');
const InventoryItem = require('../../models/InventoryItem');
const cache = require('../../config/cache');
const { runAlertPipeline } = require('../alertService');

const googleSheets = require('./googleSheets');

const ADAPTERS = {
  google_sheets: googleSheets,
};

function getAdapter(provider) {
  const a = ADAPTERS[provider];
  if (!a) throw new Error(`Unknown connector provider: ${provider}`);
  return a;
}

// Run one sync against a connector. Returns { rowsImported, productsUpdated, alerts }.
async function runSync(connectorId) {
  const connector = await Connector.findById(connectorId);
  if (!connector) throw new Error('Connector not found');

  const adapter = getAdapter(connector.provider);
  const userId = connector.userId;

  try {
    const { rows, credentials } = await adapter.fetchDelta(connector);

    // Persist refreshed tokens (if any)
    if (credentials) connector.credentials = credentials;

    let rowsImported = 0;
    const productMap = {};

    if (rows.length) {
      // Idempotent upserts keyed on (userId, source, externalId)
      const ops = rows.map((r) => ({
        updateOne: {
          filter: { userId, source: connector.provider, externalId: r.externalId },
          update: {
            $set: {
              userId,
              source: connector.provider,
              externalId: r.externalId,
              date: r.date,
              product: r.product,
              category: r.category,
              quantity: r.quantity,
              revenue: r.revenue,
              cost: r.cost,
              region: r.region,
            },
            $setOnInsert: { uploadedAt: new Date() },
          },
          upsert: true,
        },
      }));

      const result = await SalesData.bulkWrite(ops, { ordered: false });
      rowsImported = (result.upsertedCount || 0) + (result.modifiedCount || 0);

      rows.forEach((r) => {
        if (!productMap[r.product]) productMap[r.product] = { total: 0, category: r.category };
        productMap[r.product].total += r.quantity;
      });

      // Mirror inventory updates the same way the upload route does
      for (const [product, val] of Object.entries(productMap)) {
        await InventoryItem.findOneAndUpdate(
          { userId, product },
          { $inc: { stock: -val.total }, $set: { category: val.category, lastUpdated: new Date() } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }

    const alerts = await runAlertPipeline(userId);

    await Promise.all([
      cache.delPattern(`sales:${userId}:*`),
      cache.delPattern(`inventory:${userId}:*`),
      cache.delPattern(`forecast:${userId}:*`),
    ]);

    connector.status = 'connected';
    connector.lastError = null;
    connector.lastSyncAt = new Date();
    connector.lastSyncRows = rowsImported;
    connector.syncCount += 1;
    await connector.save();

    return {
      rowsImported,
      productsUpdated: Object.keys(productMap).length,
      alerts,
      totalRowsSeen: rows.length,
    };
  } catch (err) {
    connector.status = 'error';
    connector.lastError = err.message?.slice(0, 500) || 'Unknown sync error';
    await connector.save();
    throw err;
  }
}

module.exports = { runSync, getAdapter };
