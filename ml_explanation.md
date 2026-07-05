# 🚀 ML Forecasting Service Guide: Logs, Errors, Data, & Efficiency

This document provides a comprehensive, deep-dive explanation of the backend developer logs, API errors, data requirements, model training, and efficiency improvements. It is written in both **English** and **Roman Urdu** for easy understanding.

---

## 📚 1. System Architecture & Dev Logs (System Architecture aur Logs)

### 🇬🇧 English
When you run `npm run dev:all` in the root directory, `concurrently` starts three separate processes:
1.  **`[0]` Node.js Server:** Runs on port `5001`. Handles authorization, schedulers, database (MongoDB/Redis) interactions, and acts as the gatekeeper.
2.  **`[1]` React Client:** Runs on port `3000` using Vite. Serves the user interface.
3.  **`[2]` Python ML Service:** Runs on port `8000` using Flask. Trains machine learning models (Random Forest and Prophet) to predict future sales.

#### Log Flow Example:
*   `[0] ✅ MongoDB Connected`: The Node server successfully established a database connection.
*   `[2] 127.0.0.1 - - "POST /predict HTTP/1.1" 200 -`: The Flask ML service successfully received sales data for a product, trained the model, and returned predictions.
*   `[2] 127.0.0.1 - - "POST /predict HTTP/1.1" 422 -`: The Flask ML service rejected a request because the product did not meet the data requirements.

---

### 🇵🇰 Roman Urdu (Logs aur Services)
Jab aap `npm run dev:all` command chalate hain, toh computer parallel mein teen alag-alag processes run karta hai:
1.  **`[0]` Node.js Backend Server (`Port 5001`):** Yeh server database (MongoDB/Redis) se connect karta hai, user auth verify karta hai, aur ML model ke scheduler chalata hai.
2.  **`[1]` React Client/Frontend (`Port 3000`):** Yeh frontend user interface dikhata hai.
3.  **`[2]` Python Flask ML Service (`Port 8000`):** Yeh python code machine learning models (Random Forest aur Prophet) train kar ke future sales forecast karta hai.

#### Logs ke matlab:
*   `[0] ✅ Redis / MongoDB Connected`: Server MongoDB database aur Redis caching se sahi tarike se connect ho chuka hai.
*   `[2] POST /predict 200`: ML service ke paas kafi data tha, model train ho gaya aur predictions backend ko send ho gayin.
*   `[2] POST /predict 422`: ML service ke paas us product ka data kam tha, jiski wajah se training cancel ho gayi aur system ne fallback statistical method use kiya.

---

## ❌ 2. Common Errors & Troubleshooting (Errors aur Unke Solutions)

### 🇬🇧 English

#### A. HTTP 429: Too Many Requests (Rate Limiter)
*   **Why it occurs:** In [index.js](file:///Users/apple/Documents/FYP/server/index.js#L42-L46), there is a rate limiter to protect the API. Previously, it was capped at `100 requests per 15 minutes`. Since the dashboard makes ~9 parallel API calls per page load, refreshing the dashboard 11 times within 15 minutes would exhaust the limit, throwing a `429` error.
*   **The Fix:** We increased the limit to `500` requests per 15 minutes for local development.

#### B. HTTP 422: Unprocessable Entity (Insufficient Data)
*   **Why it occurs:** In [model.py](file:///Users/apple/Documents/FYP/ml_service/model.py#L183-L184), feature engineering builds 30-day lag features and rolling averages. Rows containing `NaN` are dropped (`dropna()`). If a product has less than **35 calendar days of sales history**, it results in fewer than 5 clean rows after feature engineering, raising a `ValueError`.
*   **The Fix/Behavior:** The Flask service returns a `422` response. The Node backend catches it in [forecastRunner.js](file:///Users/apple/Documents/FYP/server/services/forecastRunner.js#L43-L47) and gracefully switches to a simple statistical average fallback (`statisticalFallback`), ensuring the dashboard doesn't crash.

---

### 🇵🇰 Roman Urdu (Errors aur Wajuhat)

#### A. HTTP 429: Too Many Requests (Rate Limiter Error)
*   **Kyun aata hai:** [index.js](file:///Users/apple/Documents/FYP/server/index.js#L42-L46) mein ek rate limiter laga hua hai jo server ko hack ya traffic overload se bachata hai. Pehle limit `100 requests per 15 minutes` thi. Kyunki aapka dashboard har refresh par 9 alag-alag API requests bhejta hai, toh sirf 11 baar refresh karne se limit khatam ho jati thi aur `429` block screen aati thi.
*   **Solution:** Humne iski limit ko local development ke liye `500` kar diya hai.

#### B. HTTP 422: Unprocessable Entity (Kam Data Ka Masla)
*   **Kyun aata hai:** Python model [model.py](file:///Users/apple/Documents/FYP/ml_service/model.py#L25-L90) mein training se pehle feature engineering karta hai. Wo pichle 30 dino ka data (Lag & Rolling mean) use karta hai. Is wajah se shuru ke 30 din ka data drop ho jata hai. Agar kisi product ki history **35 din se kam** ho, toh training ke liye zaroori 5 clean rows nahi milti. Aur python program `ValueError` dekar `422` return karta hai.
*   **Solution:** Backend [forecastRunner.js](file:///Users/apple/Documents/FYP/server/services/forecastRunner.js#L43-L47) is error ko catch karta hai aur auto-fallback ke zariye simple statistical average nikal kar dashboard par dikha deta hai taaki app chalti rahe.

---

## 📊 3. Data Requirements & Model Training (Zaroori Data aur Training)

### 🇬🇧 English

#### What Data is Needed?
To train the machine learning models (Random Forest or Prophet) successfully, the dataset uploaded via the **Upload** page or synchronized from **Google Sheets** must contain:
1.  **`date`** (e.g., `YYYY-MM-DD`): To parse time series sequence.
2.  **`product`** (String): To group sales by individual product.
3.  **`quantity`** (Numeric): The number of items sold on that day.
4.  **`revenue`** (Numeric): The sales value generated.

#### Recommended Data Length:
*   **Minimum:** 35+ days of consecutive data per product.
*   **Ideal for Random Forest:** 90 to 180+ days of history to capture monthly trends.
*   **Ideal for Prophet:** 365+ days (1 year) of history to detect yearly seasonality (e.g., holiday spikes).

#### How to Train the Model?
1.  **Upload Data:** Navigate to the `/upload` tab and upload a CSV or Excel file.
2.  **Background Schedulers:** Node.js runs background schedulers (`forecastScheduler.js`) every minute (or via cron) to check for new data and auto-trigger training.
3.  **Manual Trigger:** You can navigate to the `/forecasts` page and click **Generate Forecast** to manually force a run.

---

### 🇵🇰 Roman Urdu (Data aur Training)

#### Kaisa Data Hona Chahiye?
ML model ko achi forecasting sikhane ke liye jo CSV ya Excel file aap `/upload` karenge, usme ye column zaroori hain:
1.  **`date`** (Format: `YYYY-MM-DD`): Taaki time sequence pata chale.
2.  **`product`** (Naam): Har product ko alag se pehchanne ke liye.
3.  **`quantity`** (Tadaad): Us din kitne item bike.
4.  **`revenue`** (Kamai): Kitne paise kamae.

#### Kitne Dino Ka Data Chahiye?
*   **Kam se kam (Minimum):** 35+ din ka data har product ke liye zaroori hai.
*   **Random Forest ke liye behtar (Recommended):** 3 se 6 mahine (90-180 days) ka data taaki weekly/monthly patterns samajh sake.
*   **Prophet Model ke liye behtar:** 1 saal (365+ days) ka data taaki seasonal peaks (jaise Eid, Christmas ya Garmiyo/Sardiyo ki sales) detect ho sakein.

#### Train Kaise Karein?
1.  Frontend par `/upload` page par ja kar apni CSV ya Excel file upload karein.
2.  Backend par auto-scheduler chal raha hai jo naye data ke aate hi background mein python server (`/predict`) ko data bhej kar training shuru kar deta hai.
3.  Aap manual tarike se bhi `/forecasts` page par ja kar **Generate Forecast** button daba kar models train kar sakte hain.

---

## ⚡ 4. How to Improve Model Efficiency & Accuracy (Efficiency aur Accuracy Barhana)

### 🇬🇧 English

To improve the accuracy of predictions and the performance speed of your forecasting models, apply these techniques:

1.  **Data Quality & Imputation:**
    *   *Zero-filling:* Ensure missing dates are filled with `0` sales instead of skipping dates. This is already handled in [model.py](file:///Users/apple/Documents/FYP/ml_service/model.py#L42) using `reindex` and `fillna(0)`.
    *   *Outlier removal:* Exclude anomalous massive bulk-orders that skew normal demand.
2.  **Feature Engineering Additions:**
    *   *Holidays & Promotions:* Feed promotional event markers (0 or 1) to help the model learn why sudden sales spikes occurred.
    *   *Price Elasticity:* Include the average price per unit (`revenue / quantity`) as a feature, as price changes heavily dictate demand.
3.  **Algorithm Optimization:**
    *   *In-Memory Caching:* The Flask service has an in-memory caching mechanism (`_RESULT_CACHE`) using SHA256 hashes of payloads. If a user queries the same product with the exact same sales data, it skips training and returns results in milliseconds.
    *   *Bounded Concurrency:* Running too many Random Forest fitting threads concurrently will crash your CPU because sklearn's tree construction is highly CPU intensive. The backend uses `FORECAST_CONCURRENCY = 1` in [forecastRunner.js](file:///Users/apple/Documents/FYP/server/services/forecastRunner.js#L153) to train models sequentially.
4.  **Hyperparameter Tuning:**
    *   Adjust the tree depth and leaf sizes in `_build_rf(n_samples)` based on dataset size to prevent overfitting.

---

### 🇵🇰 Roman Urdu (Efficiency aur Accuracy behtar karna)

ML model ki predictions ko mazeed sacha (accurate) aur computer ki speed ko fast karne ke tarike:

1.  **Saaf aur Mukammal Data (Data Quality):**
    *   Jis din koi sale na ho, us din ka record delete na karein balki Quantity `0` daalein (humne python code mein `fillna(0)` lagaya hua hai).
    *   Achanak bohot baray outlier orders (jaise bulk purchase) ko remove karein jo normal demand ko kharab karte hain.
2.  **Naye Features Shamil Karna:**
    *   *Chuttiyan aur Events (Holidays):* Model ko batayein ke kis din chutti thi ya discount offer chal rahi thi, taaki model sudden spikes ko samajh sake.
    *   *Unit Price:* Har item ki keemat (`revenue / quantity`) ka feature add karein, kyunki keemat barhne se sales kam hoti hain.
3.  **Computer Performance Behtar Karna:**
    *   *Result Caching:* Python service mein SHA256 caching lagi hui hai. Agar bar bar wahi purana data predict kiya jaye, to training bypass ho kar response micro-seconds mein mil jata hai.
    *   *Sequential Training:* Ek sath 10 products ki training karne se CPU crash ho sakta hai. Isliye [forecastRunner.js](file:///Users/apple/Documents/FYP/server/services/forecastRunner.js#L153) mein `concurrency = 1` set ki gayi hai taaki aik ke baad aik model araam se train ho.
4.  **Model Hyperparameters Sahi Karna:**
    *   `_build_rf` function ke andar data ke size ke mutabiq decision trees (`n_estimators`) aur depth (`max_depth`) ko barhayein ya kam karein taaki model overfit na ho.
