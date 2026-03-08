"""
AI Disease Risk Prediction — Flask Prediction API
Listens on port 5001 (called internally by Node.js backend)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import json
import numpy as np
import os

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────
# Load Model Artifacts
# ─────────────────────────────────────────────
BASE_DIR = os.path.dirname(__file__)

def load_artifacts():
    model_path  = os.path.join(BASE_DIR, "diabetes_model.pkl")
    scaler_path = os.path.join(BASE_DIR, "scaler.pkl")
    meta_path   = os.path.join(BASE_DIR, "model_meta.json")

    if not os.path.exists(model_path):
        raise FileNotFoundError(
            "Model not found. Run 'python train_model.py' first."
        )

    model  = joblib.load(model_path)
    scaler = joblib.load(scaler_path)
    with open(meta_path) as f:
        meta = json.load(f)

    return model, scaler, meta

try:
    MODEL, SCALER, META = load_artifacts()
    print("[✓] Model loaded successfully")
    print(f"    Type: {META['model_type']}  |  Accuracy: {META['accuracy']}  |  AUC: {META['auc_roc']}")
except FileNotFoundError as e:
    MODEL = SCALER = META = None
    print(f"[!] Warning: {e}")


# ─────────────────────────────────────────────
# Helper: Build Risk Suggestions
# ─────────────────────────────────────────────
SUGGESTIONS = {
    "high": [
        "Consult an endocrinologist or your primary care physician immediately.",
        "Monitor fasting blood glucose levels regularly.",
        "Adopt a low-glycemic index diet — reduce refined sugars and white carbs.",
        "Exercise at least 30 minutes daily (brisk walk, cycling, swimming).",
        "Lose 5–10% of body weight if BMI > 25, as it significantly reduces risk.",
        "Limit alcohol consumption and quit smoking if applicable.",
        "Stay hydrated — drink 8–10 glasses of water daily.",
        "Get HbA1c and lipid profile tested every 3–6 months.",
    ],
    "moderate": [
        "Schedule a health checkup with your doctor within the next 1–2 months.",
        "Reduce daily sugar and processed carbohydrate intake.",
        "Incorporate 20–30 minutes of physical activity most days.",
        "Monitor weight and aim for a healthy BMI (18.5–24.9).",
        "Increase dietary fiber — whole grains, vegetables, legumes.",
        "Manage stress with mindfulness, yoga, or adequate sleep (7–8 hrs).",
        "Check blood pressure and glucose levels every 6 months.",
    ],
    "low": [
        "Maintain your current healthy lifestyle — keep it up!",
        "Continue regular physical activity (150 min/week moderate exercise).",
        "Eat a balanced diet rich in fruits, vegetables, and whole grains.",
        "Get an annual health checkup to track key biomarkers.",
        "Stay mindful of family history and schedule genetic counseling if needed.",
    ],
}

def risk_band(probability):
    if probability >= 0.60:
        return "High", "danger"
    elif probability >= 0.35:
        return "Moderate", "warning"
    else:
        return "Low", "success"


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": MODEL is not None,
        "model_type": META.get("model_type") if META else None,
    })


@app.route("/predict", methods=["POST"])
def predict():
    if MODEL is None:
        return jsonify({"error": "Model not loaded. Run train_model.py first."}), 503

    data = request.get_json(force=True)

    required_fields = [
        "pregnancies", "glucose", "blood_pressure",
        "skin_thickness", "insulin", "bmi",
        "diabetes_pedigree", "age"
    ]

    # Validate input
    missing = [f for f in required_fields if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        features = np.array([[
            float(data["pregnancies"]),
            float(data["glucose"]),
            float(data["blood_pressure"]),
            float(data["skin_thickness"]),
            float(data["insulin"]),
            float(data["bmi"]),
            float(data["diabetes_pedigree"]),
            float(data["age"]),
        ]])
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input values: {str(e)}"}), 400

    # Scale & predict
    features_scaled = SCALER.transform(features)
    probability     = float(MODEL.predict_proba(features_scaled)[0][1])
    prediction      = int(MODEL.predict(features_scaled)[0])

    risk_level, risk_color = risk_band(probability)
    band_key = risk_level.lower()
    suggestions = SUGGESTIONS.get(band_key, SUGGESTIONS["moderate"])

    # Feature importances for chart
    feature_importances = META.get("feature_importances", {})
    feature_labels = list(feature_importances.keys())
    feature_values = list(feature_importances.values())

    response = {
        "prediction":         prediction,          # 0 or 1
        "probability":        round(probability * 100, 1),  # percentage
        "risk_level":         risk_level,          # High / Moderate / Low
        "risk_color":         risk_color,          # danger / warning / success
        "suggestions":        suggestions,
        "model_type":         META["model_type"],
        "accuracy":           META["accuracy"],
        "feature_labels":     feature_labels,
        "feature_importances": feature_values,
        "input_data": {
            "Pregnancies":    data["pregnancies"],
            "Glucose":        data["glucose"],
            "BloodPressure":  data["blood_pressure"],
            "SkinThickness":  data["skin_thickness"],
            "Insulin":        data["insulin"],
            "BMI":            data["bmi"],
            "DiabetesPedigree": data["diabetes_pedigree"],
            "Age":            data["age"],
        }
    }
    return jsonify(response), 200


@app.route("/model-info", methods=["GET"])
def model_info():
    if META is None:
        return jsonify({"error": "Model not loaded"}), 503
    return jsonify(META), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
