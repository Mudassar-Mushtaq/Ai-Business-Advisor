"""
Convert Kaggle 'Store Item Demand Forecasting' train.csv into the shape
your upload route at server/routes/upload.js expects.

Usage:
    pip install pandas
    python prepare_kaggle.py
Produces: sales_history.csv  (upload this in your app's UI)
"""

import pandas as pd

# ---- 1. Load Kaggle file ----
df = pd.read_csv("/Users/apple/Downloads/train.csv")
print(f"Loaded {len(df):,} rows from train.csv")

# ---- 2. Pick ONE store so the 10 stores don't get merged together ----
df = df[df["store"] == 1]

# ---- 3. Pick a handful of items (5 products is plenty for a demo) ----
df = df[df["item"].isin([1, 2, 3, 4, 5])]

# ---- 4. Map item IDs to real product names (looks better in viva) ----
product_names = {
    1: "Pepsi",
    2: "Lays Chips",
    3: "Coca Cola",
    4: "Biscuits",
    5: "Chocolate",
}
df["product"] = df["item"].map(product_names)

# ---- 5. Rename 'sales' column to 'quantity' ----
df["quantity"] = df["sales"]

# ---- 6. Add a revenue column (assume an average unit price per product) ----
unit_price = {
    "Pepsi":      80,
    "Lays Chips": 50,
    "Coca Cola":  90,
    "Biscuits":   30,
    "Chocolate":  120,
}
df["revenue"] = df.apply(lambda r: r["quantity"] * unit_price[r["product"]], axis=1)

# ---- 7. Add category (optional but nicer for the dashboard) ----
category = {
    "Pepsi":      "Beverage",
    "Lays Chips": "Snacks",
    "Coca Cola":  "Beverage",
    "Biscuits":   "Snacks",
    "Chocolate":  "Snacks",
}
df["category"] = df["product"].map(category)

# ---- 8. Keep only the columns your normalizeRow() in upload.js wants ----
out = df[["date", "product", "quantity", "revenue", "category"]].copy()

# ---- 9. (Optional) keep only the most recent ~2 years per product ----
# 5 years × 5 products = 9,125 rows. Plenty for forecasting; small upload.
out["date"] = pd.to_datetime(out["date"])
cutoff = out["date"].max() - pd.Timedelta(days=730)
out = out[out["date"] >= cutoff]
out["date"] = out["date"].dt.strftime("%Y-%m-%d")

out.to_csv("sales_history.csv", index=False)
print(f"Saved sales_history.csv  ({len(out):,} rows, {out['product'].nunique()} products)")
print(out.head())
