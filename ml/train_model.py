"""
AI Disease Risk Prediction - Model Training
Trains on PIMA Indians Diabetes Dataset using Random Forest
Saves model, scaler, and feature importances for use by the Flask API
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix, roc_auc_score
)
import joblib
import json
import os
import warnings
warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────
# 1. Load Dataset
# ─────────────────────────────────────────────
def load_data():
    """
    Tries to load the PIMA dataset from local CSV.
    If not found, downloads it or generates representative synthetic data.
    """
    csv_path = os.path.join(os.path.dirname(__file__), "diabetes.csv")

    if os.path.exists(csv_path):
        print(f"[+] Loading dataset from {csv_path}")
        df = pd.read_csv(csv_path)
    else:
        print("[!] diabetes.csv not found. Generating synthetic representative data...")
        df = generate_synthetic_data()
        df.to_csv(csv_path, index=False)
        print(f"[+] Synthetic dataset saved to {csv_path}")

    return df


def generate_synthetic_data(n=768):
    """
    Generates synthetic data that closely mimics the PIMA Indians Diabetes Dataset
    distributions (from published dataset statistics).
    """
    np.random.seed(42)

    # Diabetic (~35%) and non-diabetic (~65%) split
    n_diabetic = int(n * 0.35)
    n_healthy = n - n_diabetic

    def diabetic_samples(n):
        return pd.DataFrame({
            "Pregnancies":     np.random.poisson(3.3, n).clip(0, 17),
            "Glucose":         np.random.normal(141, 31, n).clip(70, 200).astype(int),
            "BloodPressure":   np.random.normal(74, 11, n).clip(40, 122).astype(int),
            "SkinThickness":   np.random.normal(33, 12, n).clip(0, 99).astype(int),
            "Insulin":         np.random.exponential(100, n).clip(0, 846).astype(int),
            "BMI":             np.random.normal(35, 7, n).clip(18, 67),
            "DiabetesPedigreeFunction": np.random.gamma(2, 0.25, n).clip(0.08, 2.42),
            "Age":             np.random.normal(37, 11, n).clip(21, 81).astype(int),
            "Outcome":         np.ones(n, dtype=int),
        })

    def healthy_samples(n):
        return pd.DataFrame({
            "Pregnancies":     np.random.poisson(2.8, n).clip(0, 17),
            "Glucose":         np.random.normal(110, 26, n).clip(44, 200).astype(int),
            "BloodPressure":   np.random.normal(70, 12, n).clip(40, 122).astype(int),
            "SkinThickness":   np.random.normal(27, 11, n).clip(0, 99).astype(int),
            "Insulin":         np.random.exponential(60, n).clip(0, 846).astype(int),
            "BMI":             np.random.normal(30, 7, n).clip(18, 67),
            "DiabetesPedigreeFunction": np.random.gamma(1.5, 0.2, n).clip(0.08, 2.42),
            "Age":             np.random.normal(31, 10, n).clip(21, 81).astype(int),
            "Outcome":         np.zeros(n, dtype=int),
        })

    df = pd.concat([diabetic_samples(n_diabetic), healthy_samples(n_healthy)], ignore_index=True)
    return df.sample(frac=1, random_state=42).reset_index(drop=True)


# ─────────────────────────────────────────────
# 2. Preprocess
# ─────────────────────────────────────────────
def preprocess(df):
    """Replace biological zero values with column median, then scale."""
    zero_cols = ["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"]
    for col in zero_cols:
        median = df[col].replace(0, np.nan).median()
        df[col] = df[col].replace(0, median)

    feature_cols = [
        "Pregnancies", "Glucose", "BloodPressure",
        "SkinThickness", "Insulin", "BMI",
        "DiabetesPedigreeFunction", "Age"
    ]
    X = df[feature_cols].values
    y = df["Outcome"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    return X_train_scaled, X_test_scaled, y_train, y_test, scaler, feature_cols


# ─────────────────────────────────────────────
# 3. Train & Evaluate
# ─────────────────────────────────────────────
def train_and_evaluate(X_train, X_test, y_train, y_test, feature_cols):
    """Train Random Forest + Logistic Regression; return best model."""

    # --- Random Forest ---
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)
    rf_preds = rf.predict(X_test)
    rf_proba = rf.predict_proba(X_test)[:, 1]
    rf_acc   = accuracy_score(y_test, rf_preds)
    rf_auc   = roc_auc_score(y_test, rf_proba)

    # --- Logistic Regression ---
    lr = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)
    lr.fit(X_train, y_train)
    lr_preds = lr.predict(X_test)
    lr_proba = lr.predict_proba(X_test)[:, 1]
    lr_acc   = accuracy_score(y_test, lr_preds)
    lr_auc   = roc_auc_score(y_test, lr_proba)

    print("\n===== Model Comparison =====")
    print(f"Random Forest   → Accuracy: {rf_acc:.4f}  |  AUC: {rf_auc:.4f}")
    print(f"Logistic Regr.  → Accuracy: {lr_acc:.4f}  |  AUC: {lr_auc:.4f}")

    # Pick best model
    best_model = rf if rf_auc >= lr_auc else lr
    best_name  = "RandomForest" if rf_auc >= lr_auc else "LogisticRegression"
    best_preds = rf_preds if rf_auc >= lr_auc else lr_preds
    best_proba = rf_proba if rf_auc >= lr_auc else lr_proba

    print(f"\n[✓] Selected model: {best_name}")
    print("\nClassification Report:")
    print(classification_report(y_test, best_preds, target_names=["No Diabetes", "Diabetes"]))

    # Feature importances (RF only)
    importance = {}
    if best_name == "RandomForest":
        for name, imp in zip(feature_cols, best_model.feature_importances_):
            importance[name] = round(float(imp), 4)
    else:
        for name, coef in zip(feature_cols, best_model.coef_[0]):
            importance[name] = round(float(abs(coef)), 4)

    metrics = {
        "model_type": best_name,
        "accuracy": round(float(accuracy_score(y_test, best_preds)), 4),
        "auc_roc":  round(float(roc_auc_score(y_test, best_proba)), 4),
        "feature_importances": importance,
    }

    return best_model, metrics


# ─────────────────────────────────────────────
# 4. Save Artifacts
# ─────────────────────────────────────────────
def save_artifacts(model, scaler, metrics, feature_cols):
    out_dir = os.path.dirname(__file__)
    joblib.dump(model,  os.path.join(out_dir, "diabetes_model.pkl"))
    joblib.dump(scaler, os.path.join(out_dir, "scaler.pkl"))

    meta = {**metrics, "feature_columns": feature_cols}
    with open(os.path.join(out_dir, "model_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\n[✓] Model saved  → ml/diabetes_model.pkl")
    print(f"[✓] Scaler saved → ml/scaler.pkl")
    print(f"[✓] Meta saved   → ml/model_meta.json")


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 50)
    print("  AI Disease Risk Prediction — Model Training")
    print("=" * 50)

    df = load_data()
    print(f"[+] Dataset shape: {df.shape}  |  Positive cases: {df['Outcome'].sum()}")

    X_train, X_test, y_train, y_test, scaler, feature_cols = preprocess(df)
    model, metrics = train_and_evaluate(X_train, X_test, y_train, y_test, feature_cols)
    save_artifacts(model, scaler, metrics, feature_cols)

    print("\n[✓] Training complete. Run predict_api.py to start the Flask server.")
