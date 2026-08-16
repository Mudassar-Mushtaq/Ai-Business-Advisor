# 🎓 FYP Viva Preparation Guide: AI Business Advisor & Demand Forecasting System

> **Note for Viva**: Yeh document aapki FYP Viva preparation ke liye Roman Urdu aur English technical terms ke sath banaya gaya hai. Examiners ke samne confidentially jawab dene ke liye har concept ko simple aur deep level par samjhaya gaya hai.

---

## 📌 1. Project Ka Quick Summary (Aasan Alfaaz Mein)

Aapka project **AI Business Advisor** ek smart **Demand Forecasting aur Inventory Management System** hai. 

### Core Problem Jo System Solve Karta Hai:
Retailers aur businesses ko aksar yeh pata nahi hota ke aane wale 30 dino mein unka konsa product kitna bikega. Is wajah se do baray masly hoty hain:
1. **Stockout (Mal Khatam Ho Jana)**: Jab achanak demand barh jaye aur stock na ho, toh customer wapis chala jata hai (Revenue Loss).
2. **Overstocking (Ziyada Mal Mangwana)**: Jab fazool mein ziyaada stock mangwa liya jaye, toh paise block ho jaty hain aur warehouse ka kharcha barhta hai.

### System Ka Solution:
Hamara system historical sales data (tareekh, product name, sold quantity, revenue) ko analyze karke **Machine Learning Models (Random Forest aur Prophet)** ke zariye aane wale dino ki sales prediction deta hai. Is ke alawa yeh system auto-reorder levels update karta hai aur business owner ko alerts bhejta hai ke kab aur kitna stock reorder karna hai.

---

## 🏗️ 2. System How It Works (End-to-End Flow)

System 3 main layers (Architecture) par chal raha hai:

```
[ React + Vite Frontend ] (Port 3000)
         │
         │ REST API Requests (Auth Token, Sales Data)
         ▼
[ Node.js + Express Backend Gateway ] (Port 5001) ──► [ MongoDB Atlas Cloud DB ]
         │                                        ──► [ Redis Cache ]
         │ Trigger ML Training & Prediction
         ▼
[ Flask Python ML Microservice ] (Port 8000)
         │
         ├──► Random Forest Regressor Model
         └──► Meta Prophet Model
```

### Process Step-by-Step:
1. **Data Upload / Ingestion**: User `/upload` page par CSV/Excel file upload karta hai ya Google Sheets sync karta hai. Data MongoDB Atlas database mein save hota hai.
2. **Background Scheduler / Async Generation**: Jab user `/forecasts` page par "Generate Forecast" dabata hai ya auto-scheduler chalta hai, Node.js backend background mein process start karta hai.
3. **Data Pre-processing & Tiering**:
   - History ko pichle **730 days (2 saal)** par cap kiya jata hai taaki model purani aur irrelevant history par slow na ho.
   - Outliers ko **IQR (Interquartile Range)** method se clip kiya jata hai taaki koi 1-day huge bulk order forecast ko corrupt na kare.
   - Calendar gaps ko fill karke missing dates par `0` quantity lagai jati hai (`fillna(0)`).
4. **Model Selection & Execution**:
   - Agar product ka data **35+ days** hai ──► Python ML Service ko payload bheja jata hai (**Random Forest** ya **Prophet**).
   - Agar data **15-34 days** hai ──► Node.js local **EMA + Linear Trend Projection** fallback chala deta hai.
   - Agar data **5-14 days** hai ──► Node.js local **Exponential Moving Average (EMA)** baseline chala deta hai.
5. **Output Storage & Visualization**: Forecast results (Forecasted Sales, Revenue, Daily Breakdown, P10/P50/P90 confidence bounds) MongoDB Atlas mein save hoty hain aur Recharts library ke zariye frontend dashboard par dikhaye jaty hain.

---

## 💻 3. Tech Stack & Why We Used It (Tech Stack Ki Wajuhat)

Examiner poocha sakta hai: *"Aap ne yeh tech stack kyun select kiya?"*

### 1. Frontend: React.js + Vite
* **Kyun Use Kiya?** React ka Component-based architecture dashboard screens (Charts, Tables, Progress Bar) ke liye best hai. Vite Instant Server Start aur super-fast HMR (Hot Module Replacement) deta hai.

### 2. Backend Gateway: Node.js + Express.js
* **Kyun Use Kiya?** Node.js ka **Event-driven, Non-blocking I/O model** high concurrency handle karta hai. Background jobs, Authentication, Rate Limiting, aur ML Service communication ke liye Node.js fast aur reliable gateway hai.

### 3. Database: MongoDB Atlas (Cloud NoSQL DB)
* **What is MongoDB Atlas?** MongoDB Atlas ek fully-managed **Cloud NoSQL Database** service hai jo JSON-like BSON documents store karti hai.
* **Why Mongo DB Atlas instead of Relational SQL (MySQL/PostgreSQL)?**
  1. **Flexible Schema (BSON Document Model)**: Historical sales aur forecast predictions ke andar daily arrays hoty hain (`dailyBreakdown: [{date, quantity, revenue, p10, p50, p90}]`). SQL mein is ke liye complex join tables lagani parti hain, jabke Mongo DB mein poora forecast object ek single document mein fit ho jata hai.
  2. **High Scalability & Cloud Availability**: MongoDB Atlas cloud-native hai. Auto-scaling, auto-indexing, aur automated replication clusters (Replica Sets) provide karta hai bina zero server setup stress ke.
  3. **Node.js Integration**: Mongoose ODM ke zariye Node.js aur Mongo DB ka JSON data pipeline natural aur smooth lagta hai.

### 4. Machine Learning Microservice: Python + Flask
* **Kyun Use Kiya?** Python Machine Learning aur Data Science ka gold standard hai (`pandas`, `numpy`, `scikit-learn`, `prophet`). Flask microservice ke zariye hum ne Python ko Node.js se bilkul decouple (alag) rakha hai. Agar ML server CPU heavy ho jaye tab bhi main API gateway freeze nahi hota.

### 5. Caching Layer: Redis & In-Memory SHA256 Cache
* **Kyun Use Kiya?** Repeated API responses aur identical sales payloads ki prediction request aane par training bypass ho jati hai aur response millisecond mein milta hai.

---

## 🧠 4. Deep Dive into AI, ML, RF, aur Prophet

Examiner yeh zaroor poochaega: *"AI, ML, RF, Prophet mein kya farq hai aur yeh kaam kaise kartay hain?"*

### A. What is AI (Artificial Intelligence)?
* **Definition**: AI ek broad computer science field hai jahan machines human cognitive tasks (jaise faisla lena, pattern samajhna, advice dena) mimic karti hain.
* **Aap ke project mein AI kya kar raha hai?**: System dynamic stock reorder advice deta hai, sales spikes predict karta hai, aur alert triggers generate karta hai.

### B. What is ML (Machine Learning)?
* **Definition**: ML AI ki ek branch hai jisme hum computer ko explicit rules code nahi karte, balki algorithm historical data se patterns **learn (sikhna)** karta hai aur future values generalize karta hai.
* **Aap ke project mein ML kya kar raha hai?**: Historical sales dates aur quantities sikh kar 30-day future demand curves build kar raha hai.

---

### C. What is Random Forest (RF)?
* **Definition**: Random Forest ek **Ensemble Machine Learning Technique** hai jo multiple **Decision Trees** ka majmua (forest) hoti hai.
* **Decision Tree kya hota hai?**: Ek tree-structure flow chart jo data ko conditions par split karta hai. For example:
  - *Split 1*: `Is dayofweek >= 5 (Weekend)?` ──► Yes: Sales higher, No: Check next feature.
  - *Split 2*: `Is qty_roll_mean_7 > 50?` ──► High demand prediction.
* **Random Forest kaise kaam karta hai?**:
  1. **Bagging (Bootstrap Aggregation)**: Data se randomly samples chun kar 40 se 80 alag-alag Decision Trees train kiye jaty hain.
  2. **Random Feature Subsampling**: Har tree feature space ka square root subset (`max_features='sqrt'`) randomly use karta hai.
  3. **Average of Decision Trees (Decision Trees Ka Ausat)**:
     - Machine learning model mein har Decision Tree apni alag final prediction numeric value deta hai.
     - Random Forest Regressor in tamaam individual decision trees ki predictions ka **Arithmetic Mean (Average)** nikalta hai:
       $$\hat{y} = \frac{1}{N} \sum_{i=1}^{N} T_i(x)$$
     - **Wajah (Why average?)**: Ek अकेला Decision Tree bohot jaldi **Overfit** ho jata hai (data ko ratta mar leta hai). Lekin jab hum 80 trees ki predictions ka average lete hain, toh noise cancel out ho jati hai, variance reduce hoti hai, aur model naye un-seen data par highly accurate performance deta hai.

#### Feature Engineering in Random Forest (50+ Features):
RF model ko train karne ke liye hum ne custom features banaye hain:
1. **Calendar Features**: `dayofweek`, `day`, `month`, `quarter`, `is_weekend`, `is_month_start`, `is_month_end`.
2. **Cyclical Transformations**: `dow_sin`, `dow_cos`, `month_sin`, `month_cos` (Sine/Cosine formulas taaki Sunday se Monday aur Dec se Jan ka continuous relationship model samajh sake).
3. **Lag Features**: Past sales values (`qty_lag_1`, `qty_lag_7`, `qty_lag_14`, `qty_lag_30`). Model dekhta hai ke 7 din pehle kitni sale hui thi.
4. **Rolling Statistics**: 7, 14, aur 30-day moving window metrics (`qty_roll_mean_7`, `qty_roll_std_30`, `qty_roll_min`, `qty_roll_max`).
5. **EWMA (Exponentially Weighted Moving Average)**: Recent days ki sale ko ziyada weightage dena.
6. **Short-term Trend Slope (`qty_trend_7`)**: Pichle 7 dino ki linear regression slope $m = \frac{\sum (x - \bar{x})(y - \bar{y})}{\sum (x - \bar{x})^2}$ jisse upward/downward momentum pata chalta hai.

---

### D. What is Meta Prophet?
* **Definition**: Prophet Meta (Facebook) ka banaya hua ek specialized **Additive Time-Series Forecasting Model** hai jo business time series data ke liye design kiya gaya hai.
* **Mathematical Equation**:
  $$y(t) = g(t) + s(t) + h(t) + \epsilon_t$$
  - $g(t)$ = **Trend Function**: Non-periodic baseline growth ya decline.
  - $s(t)$ = **Seasonality**: Periodic changes (Weekly Fourier cycles aur Yearly patterns).
  - $h(t)$ = **Holidays / Events**: Specific days par sales spikes.
  - $\epsilon_t$ = **Error Term**: Unexplained noise.
* **Why use Prophet?**: Prophet Missing Data, Outliers, aur Seasonal spikes (jaise Eid, Black Friday, Christmas) ko naturally smoothly fit kar leta hai.

---

### E. Detailed Explanation: P10, P50, P90 Percentiles (Confidence Bands)

Examiner: *"P10, P50, P90 percentiles kya hain aur forecast mein inka kya role hai?"*

```
       ▲ Sales Quantity
       │
 P90 ──┤ . . . . . . . . . . . . . . (Optimistic / High Spike Demand)
       │       /───\
 P50 ──┤──────/─────\─────────────── (Expected / Median Forecast)
       │     /       \
 P10 ──┤. . . . . . . . . . . . . . . (Pessimistic / Minimum Demand)
       └─────────────────────────────► Time (Next 30 Days)
```

1. **P50 (50th Percentile / Median Prediction - `yhat`)**:
   - **Matlab**: Yeh expected baseline forecast hai. 50% chance hai sale is se upar ho aur 50% chance hai is se kam ho.
   - **Use Case**: Regular daily stocking aur inventory valuation.

2. **P10 (10th Percentile / Lower Bound - `yhat_lower`)**:
   - **Matlab**: Pessimistic (Worst-case) scenario. Only 10% chance hai ke sale is se bhi kam ho jaye (yani 90% certainty hai ke sale kam se kam P10 jitni zaroor hogi).
   - **Use Case**: Low-risk safety planning. Cash flow management aur baseline minimum stock levels.

3. **P90 (90th Percentile / Upper Bound - `yhat_upper`)**:
   - **Matlab**: Optimistic (Best-case / Rush Spike) scenario. 90% chances hoty hain ke sale is level ke andar rahegi, sirf 10% rare chance hota hai ke demand is se bhi upar nikal jaye.
   - **Use Case**: Peak demand, festival sales rushes, aur Stockout Prevention (Safety Stock Buffer).

* **Prophet mein Native Banding**: Prophet model 80% uncertainty interval (`interval_width=0.8`) calculate karta hai jisse automatically `yhat_lower` (P10) aur `yhat_upper` (P90) derive hoty hain.

---

## ⚔️ 5. Model Comparison: Why Use BOTH (Random Forest vs Prophet)?

Examiner: *"Dono models kyun use kiye? In dono ka kya faida hai?"*

| Feature / Aspect | Random Forest (RF) | Meta Prophet |
| :--- | :--- | :--- |
| **Primary Strength** | Complex, Short/Medium term non-linear feature interactions (Lags, Rolling averages). | Macro Time-Series Trends & Seasonality (Weekly/Yearly cycles). |
| **Required Features** | Requires explicit feature matrix (50+ lag/rolling columns). | Requires only Date (`ds`) and Target Value (`y`). |
| **Confidence Bands** | Point estimation (Requires heuristic bounds). | Native **P10, P50, P90** exact percentile distribution. |
| **Best Used For** | Fast daily sales with strong lag dependency. | Long-term forecasting with clear seasonal & holiday spikes. |
| **Data Requirement** | Works well with 35-180 days of history. | Ideal with 365+ days (1-2 years) of history. |

### Why having BOTH is beneficial?
- System user ko choice deta hai: Agar business seasonal spikes analyze karna chahta hai toh **Prophet** select kare, aur agar recent daily lags par immediate predictions chahiye toh **Random Forest** select kare!

---

## 🛟 6. Multi-Tiered Fallback Strategy (Sparse Data Handling)

Examiner: *"Agar kisi product ka data bohot kam ho (e.g. 10 days sales record), toh aapka model kaise behave karega?"*

Hamara system zero-crash architecture guarantee karta hai trough **Tiered Fallback Mechanism**:

```
Data Length (Clean Sales Rows) ──► Selected Engine
────────────────────────────────────────────────────────────────
< 5 rows             ──► Tier 0: Skipped (Not enough data)
5 to 14 rows         ──► Tier 1: Exponential Moving Average (EMA)
15 to 34 rows        ──► Tier 2: EMA + Linear Trend Projection
35+ rows             ──► Tier 3: Full ML Engine (Random Forest / Prophet)
ML HTTP Error (422)  ──► Auto Fallback to Tier 2 (EMA + Trend)
```

1. **Tier 1 (EMA Fallback)**:
   $$\text{EMA}_t = \alpha \cdot Y_t + (1 - \alpha) \cdot \text{EMA}_{t-1} \quad \text{where } \alpha = \frac{2}{N+1}$$
   Recent sales ko ziyaada wazan diya jata hai taaki baseline average mil jaye.
2. **Tier 2 (EMA + Trend Fallback)**:
   Linear regression slope ($m$) overlay ki jati hai taaki forecast flat line ke bajaye upward ya downward momentum direction capture kare.

---

## ❓ 7. Edge Cases & Viva Tough Scenarios (Special Technical Questions)

### Q1: What happens if input attributes in uploaded CSV are missing or invalid?
* **Answer**: Node.js backend aur Python Pandas service strict data sanitation run karte hain:
  - `pd.to_numeric(..., errors='coerce').fillna(0)` non-numeric ya corrupt cells ko zero mein convert kar deta hai.
  - Required missing columns par HTTP 400 validation error show kiya jata hai.
  - Missing dates ko full range reindexing ke zariye daily granularity par `0` quantity se fill kiya jata hai.

### Q2: What happens if we feed inputs of Random Forest into Prophet or vice versa?
* **Answer**: 
  - **Random Forest** tabular feature matrix maangta hai (50 columns: `dayofweek`, `qty_lag_1`, `qty_roll_mean_7`, etc.).
  - **Prophet** specific 2-column DataFrame maangta hai (`ds` for Date, `y` for target metric Quantity/Revenue).
  - Flask backend wrapper (`app.py`) input JSON request parsing karta hai aur payload ko respective model format mein array transform kar ke bhejta hai. Agar direct cross-over format bhej diya jaye bina transformation ke, toh Pandas schema error dega. Isliye wrapper class intermediate translator ka kaam karti hai.

### Q3: What happens if attribute data is out-of-distribution or features are missing during prediction phase?
* **Answer**: Iterative 30-day forecast loop ke dauran jab future dates ke lag values (e.g. `qty_lag_7`) generate ho rahy hoty hain, agar historical points 7 days se kam hon toh system historical mean value (`np.mean(history_qty)`) auto-impute karta hai. Is tarah model kabhi NaN ya crash throw nahi karta.

### Q4: Outliers (Achanak baray bulk orders) ko kaise roka gaya hai?
* **Answer**: Model training se pehle **IQR (Interquartile Range)** outlier filter chalta hai:
  $$\text{Upper Bound} = Q3 + 1.5 \times (Q3 - Q1)$$
  Har woh sales quantity jo Upper Bound se bari ho, use Upper Bound value par cap (clip) kar diya jata hai taaki single anomaly bulk purchase forecast ko distort na kare.

---

## 🗣️ 8. Rapid-Fire Viva Q&A (Quick Revision for Student)

**Q: Single Decision Tree ke bajaye Random Forest kyun use kiya?**
> *A: Single decision tree overfit ho jata hai. Random Forest 40-80 decision trees ka average leta hai jisse variance drop hoti hai aur generalization accuracy barh jati hai.*

**Q: Linear Regression kyun use nahi kiya?**
> *A: Linear regression sirf straight line capture karta hai. Sales history mein non-linear weekly cycles, lag correlations, aur sudden changes hoty hain jo tree-based ensembles better capture karte hain.*

**Q: System ki accuracy kaise measure ki?**
> *A: Hum WAPE (Weighted Absolute Percentage Error) calculate karte hain aur use confidence score mein convert karte hain: $\text{Model Accuracy} = 100 - (\text{WAPE} \times 30)$.*

**Q: Database Cloud MongoDB Atlas kyun chuna?**
> *A: Sales aur forecasts ka nested document structure (daily breakdowns) MongoDB BSON schema mein natural fit hai. Atlas zero-downtime, cloud replication aur easy scalability deta hai.*

---
*Good luck with your Viva! You are fully prepared to answer all technical questions.* 🚀
