// routes/prediction.js — Calls Python Flask ML API and saves result to DB
const express   = require("express");
const axios     = require("axios");
const jwt       = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { pool }  = require("../db");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const ML_URL    = process.env.ML_API_URL || "http://localhost:5001";
const JWT_SECRET = process.env.JWT_SECRET || "medai_jwt_secret_please_change_me_in_production";

// Try to extract user from Authorization header (non-fatal)
function extractUserFromToken(req) {
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      return jwt.verify(auth.split(" ")[1], JWT_SECRET);
    }
  } catch (_) {}
  return null;
}

// ─────────────────────────────────────────────
// Validation Rules
// ─────────────────────────────────────────────
const validateInput = [
  body("pregnancies").isFloat({ min: 0, max: 20 }).withMessage("Pregnancies: 0–20"),
  body("glucose").isFloat({ min: 44, max: 300 }).withMessage("Glucose: 44–300 mg/dL"),
  body("blood_pressure").isFloat({ min: 20, max: 180 }).withMessage("Blood Pressure: 20–180 mmHg"),
  body("skin_thickness").isFloat({ min: 0, max: 110 }).withMessage("Skin Thickness: 0–110 mm"),
  body("insulin").isFloat({ min: 0, max: 900 }).withMessage("Insulin: 0–900 μU/mL"),
  body("bmi").isFloat({ min: 10, max: 80 }).withMessage("BMI: 10–80"),
  body("diabetes_pedigree").isFloat({ min: 0.05, max: 3 }).withMessage("Pedigree Function: 0.05–3"),
  body("age").isInt({ min: 1, max: 120 }).withMessage("Age: 1–120"),
  body("name").optional().trim().isLength({ max: 120 }),
  body("email").optional().trim().isEmail().withMessage("Invalid email"),
];

// ─────────────────────────────────────────────
// POST /api/predict
// ─────────────────────────────────────────────
router.post("/", validateInput, async (req, res) => {
  // Validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    pregnancies, glucose, blood_pressure, skin_thickness,
    insulin, bmi, diabetes_pedigree, age, name, email,
    session_id,
  } = req.body;

  // Extract logged-in user from JWT token if present
  const tokenUser = extractUserFromToken(req);

  try {
    // 1) Call Python ML API
    const mlResponse = await axios.post(`${ML_URL}/predict`, {
      pregnancies, glucose, blood_pressure, skin_thickness,
      insulin, bmi, diabetes_pedigree, age,
    }, { timeout: 15000 });

    const result = mlResponse.data;
    const sid = session_id || uuidv4();

    // 2 & 3) Save to DB — fully non-fatal; predictions work without a DB
    let reportId  = null;
    let createdAt = new Date().toISOString();

    try {
      // Resolve user ID: prefer logged-in JWT user, else upsert by email
      let userId = tokenUser ? tokenUser.userId : null;
      if (!userId && email) {
        const userRes = await pool.query(
          `INSERT INTO users (name, email)
           VALUES ($1, $2)
           ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [name || "Anonymous", email]
        );
        userId = userRes.rows[0].id;
      }

      const reportRes = await pool.query(
        `INSERT INTO reports
           (user_id, session_id, pregnancies, glucose, blood_pressure,
            skin_thickness, insulin, bmi, diabetes_pedigree, age,
            prediction, probability, risk_level, suggestions, model_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id, created_at`,
        [
          userId, sid,
          pregnancies, glucose, blood_pressure, skin_thickness,
          insulin, bmi, diabetes_pedigree, age,
          result.prediction, result.probability, result.risk_level,
          result.suggestions, result.model_type,
        ]
      );
      reportId  = reportRes.rows[0].id;
      createdAt = reportRes.rows[0].created_at;
    } catch (dbErr) {
      // DB unavailable — still return the ML prediction result
      console.warn("[DB] Save skipped (DB unavailable):", dbErr.message);
    }

    return res.status(200).json({
      ...result,
      report_id:  reportId,
      session_id: sid,
      created_at: createdAt,
    });

  } catch (err) {
    if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
      return res.status(503).json({
        error: "AI model service is unavailable. Please ensure the Python ML API is running.",
      });
    }
    if (err.response) {
      return res.status(err.response.status).json({ error: err.response.data });
    }
    console.error("[Prediction Error]", err.message);
    return res.status(500).json({ error: "Internal server error during prediction." });
  }
});

// ─────────────────────────────────────────────
// GET /api/predict/model-info
// ─────────────────────────────────────────────
router.get("/model-info", async (req, res) => {
  try {
    const info = await axios.get(`${ML_URL}/model-info`, { timeout: 5000 });
    return res.json(info.data);
  } catch {
    return res.status(503).json({ error: "ML API unavailable" });
  }
});

module.exports = router;
