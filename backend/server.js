// server.js — Main Express Application
require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const helmet   = require("helmet");
const morgan   = require("morgan");
const path     = require("path");
const rateLimit = require("express-rate-limit");

const { initDB } = require("./db");
const predictionRoutes = require("./routes/prediction");
const reportRoutes     = require("./routes/reports");
const authRoutes       = require("./routes/auth");

const app  = express();
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // Allow inline scripts for frontend
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend")));

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
app.use("/api/auth",    authRoutes);
app.use("/api/predict", predictionRoutes);
app.use("/api/reports", reportRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "AI Disease Risk Prediction API",
    timestamp: new Date().toISOString(),
    ml_url: process.env.ML_API_URL || "http://localhost:5001",
  });
});

// Serve frontend for all non-API routes
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
  } else {
    res.status(404).json({ error: "API route not found" });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("[Error]", err.stack);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

// ─────────────────────────────────────────────
// Start Server (local) or export for Vercel
// ─────────────────────────────────────────────
const start = async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log("========================================");
      console.log(" AI Disease Risk Prediction — Backend  ");
      console.log("========================================");
      console.log(` Server:   http://localhost:${PORT}`);
      console.log(` DB:       ${process.env.DATABASE_URL ? "Connected" : "Not configured"}`);
      console.log("========================================");
    });
  } catch (err) {
    console.error("[Fatal] Failed to start:", err.message);
    process.exit(1);
  }
};

// On Vercel the module is imported; locally we call start()
if (require.main === module) {
  start();
} else {
  // Vercel serverless: init DB once then export app
  initDB().catch(err => console.error("[DB init]", err.message));
}

module.exports = app;
