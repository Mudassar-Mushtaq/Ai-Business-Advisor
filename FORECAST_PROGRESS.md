# Demand Forecast Progress Tracker & Slideshow UI

This document details the modifications made to implement a real-time progress tracker and slideshow-style status display when generating demand forecasts.

---

## 📖 Overview

Previously, clicking "Generate Forecasts" sent a blocking synchronous HTTP request that trained Random Forest or Prophet models for all eligible products. Because training is CPU-heavy (especially with Prophet), large catalogs could cause browser or server connection timeouts. The user also had no visual feedback on progress, elapsed time, or how long they needed to wait.

To solve this, we implemented:
1. **Asynchronous Background Processing**: The generation is triggered in the background, immediately returning a `202 Accepted`-like status to prevent timeouts.
2. **In-Memory Progress Tracking**: A server-side tracker records the active progress, elapsed time, estimated remaining time, and specific model technique for the current user.
3. **Slideshow Progress UI**: A glassmorphic card on the frontend that polls the status and rotates (slideshow style) through key statistics (overall percentage, remaining count, time estimates, and active engines).
4. **Resilient Session Recovery**: If the page is refreshed mid-generation, the frontend automatically restores the progress card and resumes tracking.

---

## 🛠️ Detailed Component Changes

### 1. In-Memory Job Tracker
* **File created**: [server/services/forecastTracker.js](file:///Users/apple/Documents/FYP/server/services/forecastTracker.js)
* **Description**: Tracks one active forecast job per user. Keeps memory footprint tiny and isolates state by Firebase user ID.
* **Key metrics tracked**:
  * `status`: `'idle' | 'generating' | 'complete' | 'failed'`
  * `index`: Number of products finished.
  * `total`: Total number of products to process.
  * `elapsedTime`: Milliseconds elapsed since the run started.
  * `estimatedRemainingTime`: Estimated remaining milliseconds, calculated dynamically as:
    $$\text{estimatedRemainingTime} = \frac{\text{elapsedTime}}{\text{index}} \times (\text{total} - \text{index})$$
  * `product` / `method`: The current product name and its forecasting engine (`rf`, `prophet`, `ema`, or `ema_trend`).

### 2. Progress Hooks in Forecast Engine
* **File modified**: [server/services/forecastRunner.js](file:///Users/apple/Documents/FYP/server/services/forecastRunner.js)
* **Description**: Added a progress-reporting hook inside `runForecastForUser`. Before training each product, the concurrency runner calls `opts.onProgress` with the item's details. It detects which model technique is running:
  * **Exponential Moving Average (EMA)**: Used as fallback for sparse records (5-14 sales rows).
  * **EMA + Trend Projection**: Used as fallback for short-term records (15-34 sales rows).
  * **Random Forest / Prophet**: Used for mature records (35+ sales rows).

### 3. Asynchronous & Status API Routes
* **File modified**: [server/routes/forecast.js](file:///Users/apple/Documents/FYP/server/routes/forecast.js)
* **Description**:
  * Added `GET /api/forecast/status` to check the current user's job progress.
  * Added `POST /api/forecast/reset-status` to clear completed or failed jobs.
  * Modified `POST /api/forecast/generate` to trigger the forecast in the background, updating the tracker callback. Pre-checks are performed before starting the job so syntax or data-sufficiency errors are thrown immediately (returning 400 Bad Request).

### 4. API Client Connection
* **File modified**: [client/src/api/index.js](file:///Users/apple/Documents/FYP/client/src/api/index.js)
* **Description**: Exported `getForecastStatus` and `resetForecastStatus` wrapper calls for backend polling.

### 5. Frontend Poller & Slideshow component
* **File modified**: [client/src/pages/Forecasts.jsx](file:///Users/apple/Documents/FYP/client/src/pages/Forecasts.jsx)
* **Description**:
  * Check for running jobs on mount. If found, restore the loader state.
  * Trigger 1-second interval checks while status is `generating`.
  * Cycle a slideshow counter (`currentSlide`) through indices `0-3` every 3 seconds to rotate through detailed statistics.
  * On completion, show success toast, refresh table list, and reset tracker status.
  * Disable all action buttons while a generation is active.

### 6. Styles & Animations
* **File modified**: [client/src/pages/Forecasts.css](file:///Users/apple/Documents/FYP/client/src/pages/Forecasts.css)
* **Description**:
  * Styled the `.forecast-progress-card` with glassmorphic backdrop filters and card shadows.
  * Added keyframe animations (`iconPulse` and `slideFadeIn`) for premium UI micro-interactions.
  * Added styling for timing and remaining badges.

---

## 📈 Slideshow Interface Slides

The progress card persistently shows a gradient progress bar. Above and below it, it rotates between the following 4 slides:

* **Slide 1 (Overall Completion)**: `📊 Overall Progress: XX% Complete (X of Y products)`
* **Slide 2 (Work Remaining)**: `📦 Remaining Work: X product(s) remaining to process`
* **Slide 3 (Time Estimator)**: `⏱️ Estimated Time: ~X expected (elapsed: Ys)`
* **Slide 4 (Active Engines)**: `🤖 Active Engines: Prophet, Random Forest & Exponential Moving Average (EMA)`
