require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('./config/firebase-admin');  // Initialize Firebase Admin SDK
const cache = require('./config/cache');  // Initialize Redis (optional, no-op if unset)

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const salesRoutes = require('./routes/sales');
const inventoryRoutes = require('./routes/inventory');
const forecastRoutes = require('./routes/forecast');
const chatRoutes = require('./routes/chat');
const connectorRoutes = require('./routes/connectors');
const autoAnalysisRoutes = require('./routes/autoAnalysis');
const goalsRoutes = require('./routes/goals');
const briefRoutes = require('./routes/brief');
const reorderRoutes = require('./routes/reorders');
const adminRoutes = require('./routes/admin');
const connectorScheduler = require('./services/connectors/scheduler');
const forecastScheduler = require('./services/forecastScheduler');
const briefScheduler = require('./services/briefScheduler');

const app = express();

// Trust proxy settings for Azure App Service (reverse proxy) to prevent express-rate-limit validation errors
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs (dashboard fires ~9 parallel calls per load)
  message: { error: 'Too many requests, please try again later.' }
});

// Apply rate limiter to all API requests
app.use('/api', limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/connectors', connectorRoutes);
app.use('/api/auto-analysis', autoAnalysisRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/brief', briefRoutes);
app.use('/api/reorders', reorderRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    cache: cache.isReady() ? 'connected' : 'disabled',
  });
});

// 404 for unmatched /api routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found', code: 'not_found' });
});

// Global error handler (handles AppError, Mongoose, JSON parse, etc.)
app.use(require('./middleware/errorHandler'));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Client URL: ${process.env.CLIENT_URL}`);
  // Start the connector sync scheduler. Disable in tests via DISABLE_CONNECTOR_SCHEDULER=1.
  if (process.env.DISABLE_CONNECTOR_SCHEDULER !== '1') {
    connectorScheduler.start();
  }
  // Start the auto-forecast scheduler. Disable in tests via DISABLE_FORECAST_SCHEDULER=1.
  if (process.env.DISABLE_FORECAST_SCHEDULER !== '1') {
    forecastScheduler.start();
  }
  // Start the weekly-brief scheduler. Disable in tests via DISABLE_BRIEF_SCHEDULER=1.
  if (process.env.DISABLE_BRIEF_SCHEDULER !== '1') {
    briefScheduler.start();
  }
});
