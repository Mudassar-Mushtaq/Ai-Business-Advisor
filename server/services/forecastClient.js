const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
// Prophet's first fit per product can take several seconds (Stan optimizer
// + cmdstanpy warmup), so we give the ML call a generous default timeout.
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS) || 90000;

const client = axios.create({
  baseURL: ML_SERVICE_URL,
  timeout: ML_TIMEOUT_MS,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the Python forecasting microservice. `model` selects the algorithm:
 *   'rf'      → Random Forest with engineered features (default, fast)
 *   'prophet' → Meta's Prophet (native trend + seasonality + confidence bands)
 * Retries once on a transient network error (ECONNRESET / ECONNREFUSED).
 */
async function callForecastService(product, salesHistory, forecastDays = 30, model = 'rf') {
  const body = {
    product,
    sales_history: salesHistory,
    forecast_days: forecastDays,
    model,
  };

  try {
    const { data } = await client.post('/predict', body);
    return data;
  } catch (err) {
    const transient =
      err.code === 'ECONNRESET' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ECONNABORTED';
    if (!transient) throw err;

    await sleep(500);
    const { data } = await client.post('/predict', body);
    return data;
  }
}

module.exports = { callForecastService };
