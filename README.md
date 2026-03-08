# 🏥 AI-Based Disease Risk Prediction System

> **⚠️ Disclaimer:** This tool is for informational and educational purposes only. It does **NOT** constitute medical advice. Always consult a qualified healthcare professional for diagnosis or treatment.

---

## 📸 Features

| Feature | Description |
|---|---|
| 🤖 AI Prediction | Random Forest (~82% accuracy) trained on PIMA Indians Diabetes Dataset |
| 📊 Risk Visualization | Gauge chart, feature importance bar chart, doughnut chart |
| 📄 PDF Reports | One-click downloadable health report |
| 📧 Email Reports | Send reports via email (configurable SMTP) |
| 🕐 History | Track all past assessments with trend chart |
| 🗑️ Delete Reports | Manage your assessment history |
| 🔒 Privacy | Session-based tracking, email optional |
| 📱 Responsive | Mobile-friendly Bootstrap 5 UI |

---

## 🏗️ Architecture

```
Frontend (HTML/CSS/JS + Bootstrap + Chart.js)
        ↓  HTTP
Node.js Backend (Express.js — Port 3001)
        ↓  HTTP
Python Flask ML API (scikit-learn — Port 5001)
        ↓
PostgreSQL Database (Reports + Users)
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Bootstrap 5.3, Chart.js 4, Bootstrap Icons |
| Backend | Node.js, Express.js, express-validator, helmet, pdfkit, nodemailer |
| ML/AI | Python 3.10+, Flask, scikit-learn, pandas, numpy, joblib |
| Database | PostgreSQL (pg driver) |

---

## 🚀 Setup & Running

### Prerequisites
- Node.js 18+
- Python 3.10+
- PostgreSQL 14+

---

### 1️⃣ Clone / Open Project

```bash
cd "c:\Users\BHARGAV TRIVEN\OneDrive\Desktop\projects\Disease"
```

---

### 2️⃣ Set Up Python ML Environment

```bash
cd ml
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

pip install -r requirements.txt

# Train the model (creates diabetes_model.pkl + scaler.pkl)
python train_model.py

# Start the Flask ML API (keep this running)
python predict_api.py
```

The Flask API will start on `http://localhost:5001`.

---

### 3️⃣ Set Up PostgreSQL Database

Create a database:

```sql
CREATE DATABASE disease_risk_db;
```

Tables are **auto-created** when the Node.js server starts.

---

### 4️⃣ Configure Backend Environment

```bash
cd backend
copy .env.example .env
```

Edit `.env`:

```env
PORT=3001
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/disease_risk_db
ML_API_URL=http://localhost:5001

# Optional: for email reports
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

> 💡 For Gmail: Use an **App Password** (not your account password).  
> Enable: Google Account → Security → 2-Step Verification → App Passwords

---

### 5️⃣ Install Node.js Dependencies & Start Backend

```bash
cd backend
npm install
npm run dev          # development (auto-reload with nodemon)
# npm start          # production
```

Backend starts on `http://localhost:3001`.

---

### 6️⃣ Open the Frontend

Open in your browser:

```
http://localhost:3001
```

or directly open `frontend/index.html` in your browser.

---

## 📁 Project Structure

```
Disease/
├── ml/
│   ├── train_model.py        # Model training (Random Forest + Logistic Regression)
│   ├── predict_api.py        # Flask API for predictions
│   ├── requirements.txt      # Python dependencies
│   ├── diabetes.csv          # Dataset (auto-generated if missing)
│   ├── diabetes_model.pkl    # Saved model (created after training)
│   ├── scaler.pkl            # Saved scaler
│   └── model_meta.json       # Model metadata
│
├── backend/
│   ├── server.js             # Express app entry point
│   ├── package.json
│   ├── .env.example          # Environment variable template
│   ├── db/
│   │   └── index.js          # PostgreSQL connection + table init
│   └── routes/
│       ├── prediction.js     # POST /api/predict
│       └── reports.js        # GET/DELETE /api/reports, PDF, email
│
└── frontend/
    ├── index.html            # Landing page
    ├── predict.html          # Assessment form
    ├── result.html           # Risk result + charts
    ├── history.html          # Report history + trend
    ├── css/
    │   └── style.css
    └── js/
        ├── predict.js        # Form submission
        ├── result.js         # Result rendering + charts
        └── history.js        # History page logic
```

---

## 🤖 AI Model Details

| Property | Value |
|---|---|
| Dataset | PIMA Indians Diabetes Dataset (768 samples) |
| Algorithm | Random Forest Classifier (200 trees) |
| Features | Pregnancies, Glucose, Blood Pressure, Skin Thickness, Insulin, BMI, Diabetes Pedigree, Age |
| Accuracy | ~82% |
| AUC-ROC | ~0.87 |
| Cross-validation | Stratified 80/20 split |

### Feature Importance (approximate)
1. **Glucose** (26%) — Strongest predictor
2. **BMI** (18%)
3. **Insulin** (13%)
4. **Blood Pressure** (11%)
5. **Skin Thickness** (9%)
6. **Diabetes Pedigree** (9%)
7. **Age** (10%)
8. **Pregnancies** (4%)

### Risk Bands
| Probability | Risk Level |
|---|---|
| 0–35% | 🟢 Low |
| 35–60% | 🟡 Moderate |
| 60–100% | 🔴 High |

---

## 🔌 API Endpoints

### Node.js Backend (Port 3001)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/predict` | Submit health data, get AI prediction |
| `GET` | `/api/reports` | Fetch all reports (filter by `session_id`) |
| `GET` | `/api/reports/:id` | Get single report |
| `GET` | `/api/reports/:id/pdf` | Download PDF report |
| `POST` | `/api/reports/:id/email` | Email report |
| `DELETE` | `/api/reports/:id` | Delete report |
| `GET` | `/api/reports/stats/summary` | Dashboard statistics |
| `GET` | `/api/health` | Health check |

### Python Flask ML API (Port 5001)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/predict` | Direct ML prediction |
| `GET` | `/model-info` | Model metadata |
| `GET` | `/health` | Health check |

---

## 📊 Sample API Request

```json
POST /api/predict
{
  "pregnancies": 2,
  "glucose": 148,
  "blood_pressure": 72,
  "skin_thickness": 35,
  "insulin": 0,
  "bmi": 33.6,
  "diabetes_pedigree": 0.627,
  "age": 50
}
```

### Sample Response

```json
{
  "prediction": 1,
  "probability": 78.3,
  "risk_level": "High",
  "risk_color": "danger",
  "suggestions": [
    "Consult an endocrinologist or your primary care physician immediately.",
    "Monitor fasting blood glucose levels regularly.",
    "..."
  ],
  "model_type": "RandomForest",
  "report_id": "uuid-here",
  "feature_labels": ["Glucose", "BMI", ...],
  "feature_importances": [0.26, 0.18, ...]
}
```

---

## 🔐 Using Your Own PIMA Dataset

1. Download from [Kaggle - PIMA Indians Diabetes](https://www.kaggle.com/datasets/uciml/pima-indians-diabetes-database)
2. Save as `ml/diabetes.csv`
3. Re-run `python train_model.py`

---

## 📋 Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `PORT` | ❌ | Backend port (default: 3001) |
| `ML_API_URL` | ❌ | Flask API URL (default: http://localhost:5001) |
| `SMTP_HOST` | ❌ | SMTP server for email reports |
| `SMTP_PORT` | ❌ | SMTP port (587 for TLS) |
| `SMTP_USER` | ❌ | SMTP username/email |
| `SMTP_PASS` | ❌ | SMTP password or app password |

---

## 🎯 Recruiter Highlights

- ✅ **Full-Stack**: Frontend + Node.js API + Python ML microservice
- ✅ **Machine Learning**: Real scikit-learn model, cross-validation, AUC metrics
- ✅ **Database**: PostgreSQL with normalized schema + indexes
- ✅ **PDF Generation**: pdfkit for downloadable reports
- ✅ **Email Integration**: nodemailer with SMTP
- ✅ **Data Visualization**: Chart.js (gauge, bar, doughnut, trend line)
- ✅ **Security**: helmet, rate limiting, input validation
- ✅ **Production-Ready**: Environment config, error handling, DB connection pooling
