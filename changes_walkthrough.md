# Walkthrough of Changes — Dashboard Data Fixes & Optimizations

This document summarizes all the changes made to the AI Business Advisor codebase to resolve data mixing, stock level distortion, permanently stale forecasts, out-of-memory crashes, and chart errors.

---

## 1. Summary of Fixed Issues

| # | Problem | Root Cause | Solution |
|---|---------|------------|----------|
| **1** | **Data Mixing in Charts** | When a new sales CSV/Excel file was uploaded, the backend server simply appended the rows to the `SalesData` collection. Old sales rows were mixed with the new ones. | **Clean-Slate Upload**: We now wipe the old uploaded sales rows belonging to the user before importing the new file's sales rows. |
| **2** | **Distorted/Negative Stock Levels** | The system decrements `InventoryItem.stock` by the sales quantities. Because old sales were not cleared, re-uploading datasets kept subtracting stock levels down to highly distorted or negative values. | **Stock Reversion**: We now aggregate the old sales quantities per product, **add them back** to restore the stock levels to their pre-upload state, and only then subtract the new upload's sales. |
| **3** | **Stuck "Stale" Warning Banners** | Old forecasts were marked `isStale: true` on upload. If a product from a previous upload was not in the new dataset, its forecast was never updated, locking the banner in a stale warning state permanently. | **Orphaned Forecast Cleanup**: We now delete forecasts for products no longer present in the new upload, while keeping only the active products as stale until they are regenerated. |
| **4** | **JavaScript Heap Out-of-Memory Crash** | Wiping and reverting old sales loaded all old sales rows into Node's memory using `SalesData.find().lean()`, leading to heap exhaustion (OOM) on large datasets. | **Server-Side Aggregation**: Replaced the `.find().lean()` call with a MongoDB aggregation pipeline (`SalesData.aggregate`) to sum quantities on the DB server, avoiding OOM. |
| **5** | **Frontend Chart Rendering Crashes** | When charts received empty or undefined arrays, Recharts `reduce` calls crashed the entire Dashboard. | **Null Guards & Safe Defaults**: Added default values (`data = []`) and safe `(data || [])` array checks to both `CategoryPieChart` and `TopProductsChart`. |

---

## 2. Detailed Code Modifications

### 🔧 Backend (Server)

#### [MODIFY] [upload.js](file:///Users/apple/Documents/FYP/server/routes/upload.js)
Replaced the naive append-only flow in `POST /api/upload` with a robust clean-slate database pipeline:

```javascript
// 1. Aggregate old uploaded quantities per product server-side (prevents Out-Of-Memory)
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

// 4. Parse the new CSV or Excel file (streamCSV / parseExcelBuffer)
// ...

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
```

---

### 🎨 Frontend (Client)

#### [MODIFY] [Charts.jsx](file:///Users/apple/Documents/FYP/client/src/components/Charts/Charts.jsx)
Added default parameters and safety wrappers in chart visualization components:

```diff
// Top Products Bar Chart
-export function TopProductsChart({ data }) {
+export function TopProductsChart({ data = [] }) {
   const truncatedData = useMemo(() => {
     return (data || []).map(item => ({
       ...item,
       truncatedName: truncateProductName(item._id)
     }));
   }, [data]);
   // ...
}

// Category Pie Chart
-export function CategoryPieChart({ data }) {
+export function CategoryPieChart({ data = [] }) {
   const totalRevenue = useMemo(() => {
     return (data || []).reduce((sum, d) => sum + (d.totalRevenue || 0), 0);
   }, [data]);

-  const total = useMemo(() => data.reduce((sum, entry) => sum + (entry.totalRevenue || 0), 0), [data]);
+  const total = useMemo(() => (data || []).reduce((sum, entry) => sum + (entry.totalRevenue || 0), 0), [data]);

   const renderLegend = (value, entry) => {
     const { payload } = entry;
     const val = payload?.totalRevenue || 0;
     const percent = total > 0 ? (val / total * 100).toFixed(0) : 0;
     return `${value} (${percent}%)`;
   };

   return (
     <ResponsiveContainer width="100%" height={240}>
       <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
         <Pie
-          data={data}
+          data={data || []}
           cx="50%"
           cy="50%"
           innerRadius={65}
           outerRadius={88}
           dataKey="totalRevenue"
           nameKey="_id"
           paddingAngle={3}
           label={false}
         >
-          {data.map((_, i) => (
+          {(data || []).map((_, i) => (
             <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--bg-card)" strokeWidth={2} />
           ))}
         </Pie>
         // ...
       </PieChart>
     </ResponsiveContainer>
   );
}
```

---

## 3. How the Data Flows Now

When you upload a new sales dataset:
1. **Stock levels are restored**: Node retrieves the total quantities sold from the previous upload via MongoDB aggregation, then adds them back to your inventory stock.
2. **Old sales are cleaned**: Previous upload rows in MongoDB are deleted.
3. **New sales are written**: The new file's sales records are saved.
4. **Stock is re-adjusted**: The quantities in the new upload are subtracted from your restored stock.
5. **Forecasts are updated**: Forecast entries for new products are flagged as stale, while orphaned products (from the old upload but not the new one) are deleted to clear out-of-date forecasts and resolve the stuck stale warning banner.
6. **Background forecasting starts**: Background engines automatically re-train and predict 30-day demand.
7. **Banners disappear**: Once forecast generation completes, the stale banner automatically fades.
