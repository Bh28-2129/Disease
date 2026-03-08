/**
 * result.js — Renders the Risk Assessment Result Page
 * Reads from sessionStorage (set by predict.js) or falls back to report_id query param
 */

const API_BASE = "/api";

// ─────────────────────────────────────────────
// Color mappings
// ─────────────────────────────────────────────
const RISK_COLORS = {
  High:     { bg: "#dc3545", light: "#fde8ea", btn: "danger"  },
  Moderate: { bg: "#fd7e14", light: "#fff3e0", btn: "warning" },
  Low:      { bg: "#28a745", light: "#e8f5e9", btn: "success" },
};

// ─────────────────────────────────────────────
// Load and Render
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  let data = null;

  // Try sessionStorage first (from predict form)
  const stored = sessionStorage.getItem("medai_result");
  if (stored) {
    data = JSON.parse(stored);
    sessionStorage.removeItem("medai_result");
  } else {
    // Fall back to report_id from URL query
    const params   = new URLSearchParams(window.location.search);
    const reportId = params.get("id");
    if (reportId) {
      try {
        const res = await fetch(`${API_BASE}/reports/${reportId}`);
        if (!res.ok) throw new Error("Report not found");
        const rep = await res.json();
        // Map DB column names → ML API response shape
        data = {
          risk_level:         rep.risk_level,
          probability:        parseFloat(rep.probability),
          prediction:         rep.prediction,
          suggestions:        rep.suggestions || [],
          model_type:         rep.model_type,
          report_id:          rep.id,
          created_at:         rep.created_at,
          feature_labels:     ["Pregnancies","Glucose","BloodPressure","SkinThickness","Insulin","BMI","DiabetesPedigree","Age"],
          feature_importances: [0.04, 0.26, 0.11, 0.09, 0.13, 0.18, 0.09, 0.10],
          input_data: {
            Pregnancies:      rep.pregnancies,
            Glucose:          rep.glucose,
            BloodPressure:    rep.blood_pressure,
            SkinThickness:    rep.skin_thickness,
            Insulin:          rep.insulin,
            BMI:              rep.bmi,
            DiabetesPedigree: rep.diabetes_pedigree,
            Age:              rep.age,
          }
        };
      } catch (err) {
        showError(err.message);
        return;
      }
    } else {
      showError("No result data found. Please complete the assessment form first.");
      return;
    }
  }

  renderResult(data);
});

// ─────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────
function renderResult(data) {
  document.getElementById("loadingState").classList.add("d-none");
  document.getElementById("resultContent").classList.remove("d-none");

  const risk   = data.risk_level; // High / Moderate / Low
  const prob   = data.probability;
  const colors = RISK_COLORS[risk] || RISK_COLORS["Moderate"];

  // ── Risk Panel ──
  const panel = document.getElementById("riskPanel");
  panel.classList.add(risk.toLowerCase());

  const iconEl = document.getElementById("riskIcon");
  iconEl.classList.add(risk.toLowerCase());

  document.getElementById("riskLevelText").textContent  = risk;
  document.getElementById("probabilityText").textContent = `${prob}%`;

  // ── Progress Bar ──
  const bar = document.getElementById("riskProgressBar");
  bar.classList.add(risk.toLowerCase());
  document.getElementById("progressText").textContent = `${prob}%`;
  setTimeout(() => { bar.style.width = `${prob}%`; }, 100);

  // ── Meta ──
  document.getElementById("modelType").textContent = data.model_type || "RandomForest";
  document.getElementById("reportId").textContent  = (data.report_id || "").slice(0, 8) + "…";

  // ── Input Data Table ──
  const tbody = document.querySelector("#inputDataTable tbody");
  const inputMap = {
    "Pregnancies":       ["Pregnancies",         ""],
    "Glucose":           ["Glucose",              "mg/dL"],
    "BloodPressure":     ["Blood Pressure",       "mmHg"],
    "SkinThickness":     ["Skin Thickness",       "mm"],
    "Insulin":           ["Insulin",              "μU/mL"],
    "BMI":               ["BMI",                  "kg/m²"],
    "DiabetesPedigree":  ["Diabetes Pedigree",    ""],
    "Age":               ["Age",                  "yrs"],
  };
  tbody.innerHTML = Object.entries(data.input_data || {}).map(([key, val]) => {
    const [label, unit] = inputMap[key] || [key, ""];
    return `<tr>
      <td class="text-muted fw-semibold" style="width:55%">${label}</td>
      <td class="fw-bold">${val ?? "—"} <span class="text-muted small">${unit}</span></td>
    </tr>`;
  }).join("");

  // ── Charts ──
  drawGauge(prob, colors.bg);
  drawFeatureChart(data.feature_labels, data.feature_importances, colors.bg);
  drawDoughnut(prob, risk);

  // ── Suggestions ──
  const container = document.getElementById("suggestionsContainer");
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  container.innerHTML = suggestions.map((s, i) => `
    <div class="col-md-6 fade-in-up" style="animation-delay:${i * 0.1}s">
      <div class="suggestion-card ${risk.toLowerCase()}">
        <div class="d-flex align-items-start gap-2">
          <div class="flex-shrink-0 mt-1">
            <span class="badge rounded-pill bg-primary">${i + 1}</span>
          </div>
          <p class="mb-0 small">${s}</p>
        </div>
      </div>
    </div>
  `).join("");

  // ── Download PDF ──
  document.getElementById("downloadPDFBtn")?.addEventListener("click", () => {
    if (data.report_id) {
      window.open(`${API_BASE}/reports/${data.report_id}/pdf`, "_blank");
    } else {
      alert("Report ID not available. Please save your assessment first.");
    }
  });

  // ── Send Email ──
  document.getElementById("sendEmailBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("emailAddress").value.trim();
    const name  = document.getElementById("emailName").value.trim();
    const status = document.getElementById("emailStatus");

    if (!email) {
      status.className = "alert alert-warning d-block";
      status.textContent = "Please enter a valid email address.";
      return;
    }
    if (!data.report_id) {
      status.className = "alert alert-warning d-block";
      status.textContent = "Report ID not available.";
      return;
    }

    const btn = document.getElementById("sendEmailBtn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Sending…`;
    status.className = "d-none";

    try {
      const res = await fetch(`${API_BASE}/reports/${data.report_id}/email`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ to_email: email, to_name: name }),
      });
      const result = await res.json();
      if (res.ok) {
        status.className = "alert alert-success d-block";
        status.textContent = `✓ Report sent to ${email}`;
      } else {
        throw new Error(result.error || "Failed to send email.");
      }
    } catch (err) {
      status.className = "alert alert-danger d-block";
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-send me-2"></i>Send Report`;
    }
  });

  // ── Copy Link ──
  document.getElementById("shareLinkBtn")?.addEventListener("click", () => {
    if (data.report_id) {
      const url = `${window.location.origin}/result.html?id=${data.report_id}`;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById("shareLinkBtn");
        btn.innerHTML = `<i class="bi bi-check-lg me-2"></i>Copied!`;
        btn.classList.replace("btn-outline-success", "btn-success");
        setTimeout(() => {
          btn.innerHTML = `<i class="bi bi-share me-2"></i>Copy Report Link`;
          btn.classList.replace("btn-success", "btn-outline-success");
        }, 2000);
      });
    }
  });
}

// ─────────────────────────────────────────────
// Chart: Doughnut Gauge
// ─────────────────────────────────────────────
function drawGauge(prob, color) {
  const ctx = document.getElementById("gaugeChart");
  if (!ctx) return;
  new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data:             [prob, 100 - prob],
        backgroundColor:  [color, "rgba(255,255,255,0.2)"],
        borderWidth:      0,
        circumference:    180,
        rotation:         270,
      }]
    },
    options: {
      responsive: false,
      cutout: "75%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    }
  });
}

// ─────────────────────────────────────────────
// Chart: Feature Importance (Horizontal Bar)
// ─────────────────────────────────────────────
function drawFeatureChart(labels, values, color) {
  const ctx = document.getElementById("featureChart");
  if (!ctx) return;

  // Sort by importance descending
  const combined = (labels || []).map((l, i) => ({ l, v: values[i] || 0 }));
  combined.sort((a, b) => b.v - a.v);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels:   combined.map(d => d.l),
      datasets: [{
        label:           "Importance",
        data:            combined.map(d => d.v),
        backgroundColor: combined.map((_, i) => `${color}${Math.round(255 - i * 25).toString(16).padStart(2,"0")}`),
        borderRadius:    6,
        borderSkipped:   false,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${(ctx.raw * 100).toFixed(1)}%`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: v => `${(v * 100).toFixed(0)}%` },
          grid: { color: "#f0f0f0" }
        },
        y: { grid: { display: false } }
      }
    }
  });
}

// ─────────────────────────────────────────────
// Chart: Doughnut (Risk vs Safe)
// ─────────────────────────────────────────────
function drawDoughnut(prob, risk) {
  const ctx = document.getElementById("doughnutChart");
  if (!ctx) return;
  const color = RISK_COLORS[risk]?.bg || "#1a73e8";
  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels:   ["Risk Probability", "Safe Zone"],
      datasets: [{
        data:             [prob, 100 - prob],
        backgroundColor:  [color, "#e9ecef"],
        borderWidth:      3,
        borderColor:      ["#fff", "#fff"],
        hoverOffset:      6,
      }]
    },
    options: {
      responsive: true,
      cutout: "60%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}%` }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────
// Error State
// ─────────────────────────────────────────────
function showError(msg) {
  document.getElementById("loadingState").classList.add("d-none");
  document.getElementById("errorState").classList.remove("d-none");
  document.getElementById("errorMessage").textContent = msg;
}
