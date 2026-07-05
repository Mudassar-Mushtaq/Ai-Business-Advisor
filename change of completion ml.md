# Walkthrough: Forecast Generation Progress Tracker

## Summary

When you click **"Generate Forecasts"** (for RF, Prophet, or EMA), you now see a real-time progress card with:
- A **gradient progress bar** that fills from 0% → 100%
- **Elapsed time** and **estimated remaining time** badges
- A **rotating slideshow** that cycles every 3 seconds through:
  1. 📊 Overall progress percentage + products done/total
  2. 📦 How many products are remaining
  3. ⏱️ Estimated time remaining vs elapsed
  4. 🤖 Active forecasting engines (Prophet, RF, EMA)
- **Page refresh recovery**: if you reload the page mid-generation, the progress card automatically restores

## Changes Made

### Backend (3 files)

#### [NEW] [forecastTracker.js](file:///Users/apple/Documents/FYP/server/services/forecastTracker.js)
In-memory singleton that tracks one job per user with fields: `status`, `index`, `total`, `product`, `method`, `startTime`, `elapsedTime`, `estimatedRemainingTime`. Estimated remaining time is computed from average time per completed product.

#### [MODIFY] [forecastRunner.js](file:///Users/apple/Documents/FYP/server/services/forecastRunner.js#L279-L297)
The `runWithConcurrency` worker callback now accepts an `opts.onProgress` callback. Before processing each product, it calls `onProgress(index, total, product, method)` where `method` is determined by the product's row count (ema / ema_trend / rf / prophet).

#### [MODIFY] [forecast.js](file:///Users/apple/Documents/FYP/server/routes/forecast.js)
- **`GET /api/forecast/status`** — returns the current job progress for the authenticated user
- **`POST /api/forecast/reset-status`** — clears the job state after completion
- **`POST /api/forecast/generate`** — now runs the forecast **asynchronously in the background** and returns `{ status: 'started' }` immediately. Pre-validates sales data and eligible products before starting the background job. Prevents duplicate runs.

### Frontend (3 files)

#### [MODIFY] [api/index.js](file:///Users/apple/Documents/FYP/client/src/api/index.js#L108-L109)
Exported `getForecastStatus()` and `resetForecastStatus()` API calls.

#### [MODIFY] [Forecasts.jsx](file:///Users/apple/Documents/FYP/client/src/pages/Forecasts.jsx)
- Added `job` and `currentSlide` state variables
- **Mount recovery**: on page load, checks `GET /api/forecast/status` — if a job is `generating`, it restores the progress card and resumes polling
- **Polling loop**: 1-second interval when `generating` is true, stops on `complete`/`failed`/`idle`
- **Slideshow timer**: cycles `currentSlide` through 0→3 every 3 seconds with fade-in animation
- **handleGenerate**: fires the background API call, starts polling immediately
- **Completion handling**: shows success toast with the server's result message, reloads forecasts, and clears the job

#### [MODIFY] [Forecasts.css](file:///Users/apple/Documents/FYP/client/src/pages/Forecasts.css#L210-L347)
Added styles for:
- `.forecast-progress-card` — glassmorphic card with backdrop blur and radial gradient overlay
- `.pulse-icon` — pulsing animation on the activity icon
- `.progress-bar-fill` — gradient bar with glow effect and smooth width transition
- `.slideshow-container` / `.slide-fade` — fade-in animation on each slide rotation
- `.time-badge` / `.time-badge.remaining` — styled elapsed and remaining time badges
- Responsive layout for mobile screens

## Validation

- ✅ Node.js syntax check passed for all 3 backend files
- ✅ Vite production build compiled successfully (0 errors)
- ✅ Route ordering verified — `/status` and `/reset-status` are registered before the parameterized `/product/:product` route
