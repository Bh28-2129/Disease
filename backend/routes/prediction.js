// routes/prediction.js — ML inference in Node.js (no Python dependency)
const express   = require("express");
const jwt       = require("jsonwebtoken");
const path      = require("path");
const { body, validationResult } = require("express-validator");
const { pool }  = require("../db");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "medai_jwt_secret_please_change_me_in_production";

// ─────────────────────────────────────────────
// Load model parameters from model_meta.json
// ─────────────────────────────────────────────
const META = require(path.join(__dirname, "../../ml/model_meta.json"));

// Logistic Regression inference (pure JS)
function predictDiabetes(features) {
  const { coef, intercept, scaler_mean, scaler_scale } = META;

  // Standardise: z = (x - mean) / scale
  const scaled = features.map((v, i) => (v - scaler_mean[i]) / scaler_scale[i]);

  // Linear combination
  let logit = intercept;
  for (let i = 0; i < coef.length; i++) logit += coef[i] * scaled[i];

  // Sigmoid
  const probability = 1 / (1 + Math.exp(-logit));
  return probability;
}

const SUGGESTIONS = {
  high: [
    "Consult an endocrinologist or your primary care physician immediately.",
    "Monitor fasting blood glucose levels regularly.",
    "Adopt a low-glycemic index diet — reduce refined sugars and white carbs.",
    "Exercise at least 30 minutes daily (brisk walk, cycling, swimming).",
    "Lose 5–10% of body weight if BMI > 25, as it significantly reduces risk.",
    "Limit alcohol consumption and quit smoking if applicable.",
    "Stay hydrated — drink 8–10 glasses of water daily.",
    "Get HbA1c and lipid profile tested every 3–6 months.",
  ],
  moderate: [
    "Schedule a health checkup with your doctor within the next 1–2 months.",
    "Reduce daily sugar and processed carbohydrate intake.",
    "Incorporate 20–30 minutes of physical activity most days.",
    "Monitor weight and aim for a healthy BMI (18.5–24.9).",
    "Increase dietary fiber — whole grains, vegetables, legumes.",
    "Manage stress with mindfulness, yoga, or adequate sleep (7–8 hrs).",
    "Check blood pressure and glucose levels every 6 months.",
  ],
  low: [
    "Maintain your current healthy lifestyle — keep it up!",
    "Continue regular physical activity (150 min/week moderate exercise).",
    "Eat a balanced diet rich in fruits, vegetables, and whole grains.",
    "Get an annual health checkup to track key biomarkers.",
    "Stay mindful of family history and schedule genetic counseling if needed.",
  ],
};

function riskBand(probability) {
  if (probability >= 0.60) return { risk_level: "High",     risk_color: "danger"  };
  if (probability >= 0.35) return { risk_level: "Moderate", risk_color: "warning" };
  return                          { risk_level: "Low",      risk_color: "success" };
}

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
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    pregnancies, glucose, blood_pressure, skin_thickness,
    insulin, bmi, diabetes_pedigree, age, name, email,
    session_id,
  } = req.body;

  const tokenUser = extractUserFromToken(req);

  try {
    // ── Inline ML inference (no Python API needed) ──
    const features = [
      parseFloat(pregnancies),
      parseFloat(glucose),
      parseFloat(blood_pressure),
      parseFloat(skin_thickness),
      parseFloat(insulin),
      parseFloat(bmi),
      parseFloat(diabetes_pedigree),
      parseInt(age),
    ];

    const probability = predictDiabetes(features);
    const probPct     = Math.round(probability * 1000) / 10; // e.g. 67.3
    const prediction  = probability >= 0.5 ? 1 : 0;
    const { risk_level, risk_color } = riskBand(probability);
    const suggestions = SUGGESTIONS[risk_level.toLowerCase()] || SUGGESTIONS.moderate;

    const featureLabels = META.feature_columns || Object.keys(META.feature_importances);
    const featureValues = featureLabels.map(k => META.feature_importances[k]);

    const result = {
      prediction,
      probability:          probPct,
      risk_level,
      risk_color,
      suggestions,
      model_type:           META.model_type,
      accuracy:             META.accuracy,
      feature_labels:       featureLabels,
      feature_importances:  featureValues,
      input_data: {
        Pregnancies:              pregnancies,
        Glucose:                  glucose,
        BloodPressure:            blood_pressure,
        SkinThickness:            skin_thickness,
        Insulin:                  insulin,
        BMI:                      bmi,
        DiabetesPedigreeFunction: diabetes_pedigree,
        Age:                      age,
      },
    };

    const sid = session_id || uuidv4();
    let reportId  = null;
    let createdAt = new Date().toISOString();

    try {
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
      console.warn("[DB] Save skipped:", dbErr.message);
    }

    return res.status(200).json({
      ...result,
      report_id:  reportId,
      session_id: sid,
      created_at: createdAt,
    });

  } catch (err) {
    console.error("[Prediction Error]", err.message);
    return res.status(500).json({ error: "Internal server error during prediction." });
  }
});

// ─────────────────────────────────────────────
// GET /api/predict/model-info
// ─────────────────────────────────────────────
router.get("/model-info", (req, res) => {
  return res.json({
    model_type:           META.model_type,
    accuracy:             META.accuracy,
    auc_roc:              META.auc_roc,
    feature_importances:  META.feature_importances,
  });
});

module.exports = router;
