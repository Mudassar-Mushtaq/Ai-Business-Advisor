# 🚀 AI-Powered Business Advisor

> An end-to-end full-stack MERN & Python Machine Learning application providing automated sales forecasting, business performance metrics, financial intelligence, and AI-driven conversational advisory.

---

## 📋 Table of Contents
- [Features](#-features)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Environment Configuration](#-environment-configuration)
- [Installation & Quickstart](#-installation--quickstart)
- [Running the Application](#-running-the-application)
- [Service Ports Summary](#-service-ports-summary)
- [Troubleshooting & Notes](#-troubleshooting--notes)

---

## ✨ Features

- 📊 **Sales Forecasting**: Machine Learning service using **RandomForest** and **FB Prophet** models to predict revenue and unit demand for up to 180 days.
- 💬 **AI Business Assistant**: Natural language advisor supporting flexible LLM backends (**Google Gemini**, **Ollama/Qwen 2.5**, or **OpenAI GPT-4o**).
- 📈 **Interactive Dashboards**: Financial charts, KPI metrics, and business analytics powered by Recharts and React.
- 📁 **Data Import & Connectors**: Import sales history from CSV, Excel (`.xlsx`), and live Google Sheets connectors.
- 📧 **Automated Briefs**: Daily business health summary emails delivered via Resend API integration.
- ⚡ **High Performance Caching**: Optional Redis integration for sub-millisecond API response caching.

---

## 🏗️ Architecture & Tech Stack

The application is structured into three decoupled services:

| Component | Technology Stack | Description |
| :--- | :--- | :--- |
| **Frontend (`client/`)** | React 18, Vite, Recharts, Lucide Icons, CSS | Interactive web dashboard and user interface |
| **Backend (`server/`)** | Node.js, Express, MongoDB Atlas, Redis, Firebase Admin | REST APIs, authentication, database management, & LLM integration |
| **ML Service (`ml_service/`)** | Python 3.9+, Flask, Scikit-Learn, FB Prophet, Pandas | Time-series forecasting model training & prediction service |

---

## 📁 Project Structure

```
.
├── client/                # Vite + React Frontend Application
│   ├── src/               # Components, pages, hooks, & API service calls
│   └── package.json
├── server/                # Node.js + Express Backend API
│   ├── controllers/       # Business logic handlers
│   ├── models/            # Mongoose MongoDB Data Schemas
│   ├── routes/            # API Route definitions
│   ├── services/          # AI engines, Redis cache, Google & Resend connectors
│   ├── .env.example       # Example backend configuration template
│   └── package.json
├── ml_service/            # Python Flask ML Service
│   ├── app.py             # Flask REST Server (/predict, /health)
│   ├── model.py           # RandomForest forecasting engine
│   ├── prophet_model.py   # FB Prophet forecasting engine
│   └── requirements.txt   # Python dependencies
├── package.json           # Root task & concurrent script runner
└── README.md              # Project setup & documentation
```

---

## 🛠️ Prerequisites

Ensure you have the following installed on your machine before running the project:

- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher
- **Python**: `v3.9` or higher (with `venv` package)
- **MongoDB**: A running local MongoDB server or a MongoDB Atlas Cloud connection string
- **Redis** *(Optional)*: Local or Cloud Redis instance for API caching

---

## ⚙️ Environment Configuration

### Server Setup (`server/.env`)

Create a `.env` file inside the `server/` directory. You can copy the provided example template:

```bash
cp server/.env.example server/.env
```

Configure your parameters in `server/.env`:

```env
# Database Connection
MONGO_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/ai_advisor?retryWrites=true&w=majority

# Service Ports & URLs
PORT=5001
CLIENT_URL=http://localhost:3000
ML_SERVICE_URL=http://localhost:8000

# Security Encryption Key (64-character hex string)
ENCRYPTION_KEY=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2

# AI Chatbot Selection (Google Gemini - Free Tier Recommended)
OPENAI_API_KEY=YOUR_GEMINI_API_KEY
OPENAI_API_BASE=https://generativelanguage.googleapis.com/v1beta/openai/
CHAT_MODEL=gemini-1.5-flash
BRIEF_MODEL=gemini-1.5-flash

# Redis Caching (Optional)
REDIS_URL=redis://127.0.0.1:6379
```

---

## 📥 Installation & Quickstart

### Step 1: Install Node.js Dependencies

Run the automated installer command from the root directory to install all packages for the root runner, backend server, and client UI:

```bash
npm run install:all
```

### Step 2: Set Up Python ML Service Environment

Navigate to the `ml_service/` directory, create a Python virtual environment, and install dependencies:

```bash
cd ml_service
python3 -m venv venv
source venv/bin/activate       # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

---

## 🚀 Running the Application

### Method 1: Concurrent Runner (Recommended)

From the root project directory, execute the `dev:all` command to start all three services simultaneously:

```bash
npm run dev:all
```

### Method 2: Individual Service Execution

Alternatively, you can run each service independently in separate terminal sessions:

1. **Backend Server** (Port `5001`):
   ```bash
   npm run server
   ```

2. **Frontend UI Client** (Port `3000` / Vite default):
   ```bash
   npm run client
   ```

3. **ML Forecasting Service** (Port `8000`):
   ```bash
   npm run ml
   ```

---

## 📡 Service Ports Summary

| Service | Protocol / URL | Details |
| :--- | :--- | :--- |
| **Frontend UI** | `http://localhost:3000` | React web application |
| **Backend REST API** | `http://localhost:5001` | Express backend routes |
| **ML Forecast API** | `http://localhost:8000` | Python Flask prediction endpoints |

---

## 💡 Troubleshooting & Notes

- **ML Forecast Fallback**: The forecasting service supports both `RandomForest` and `FB Prophet`. If `prophet` is not installed or encounters compilation issues, the service automatically falls back to `RandomForest` seamlessly.
- **MongoDB Access**: If using MongoDB Atlas, ensure your current IP address is added to Network Access in Atlas dashboard.
- **Port Conflict**: Make sure ports `3000`, `5001`, and `8000` are free before starting the project.
