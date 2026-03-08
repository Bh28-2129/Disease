/**
 * predict.js — Prediction Form Submission
 * Sends form data to Node.js backend → stores result → redirects to result.html
 */

const API_BASE    = "/api";
const SESSION_KEY = "medai_session_id";

// ─────────────────────────────────────────────
// Session ID (persists across tabs via localStorage)
// ─────────────────────────────────────────────
function getSessionId() {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = "sess-" + crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

// ─────────────────────────────────────────────
// BMI Calculator
// ─────────────────────────────────────────────
document.getElementById("calcBMI")?.addEventListener("click", () => {
  const h = parseFloat(document.getElementById("heightInput").value);
  const w = parseFloat(document.getElementById("weightInput").value);
  if (!h || !w || h <= 0 || w <= 0) return;

  const bmi = (w / Math.pow(h / 100, 2)).toFixed(1);
  let cat = "";
  if (bmi < 18.5)       cat = "Underweight";
  else if (bmi < 25)    cat = "Normal weight ✓";
  else if (bmi < 30)    cat = "Overweight";
  else                  cat = "Obese";

  const resultEl = document.getElementById("bmiResult");
  document.getElementById("bmiValue").textContent = bmi;
  document.getElementById("bmiCategory").textContent = cat;
  resultEl.classList.remove("d-none");
  document.getElementById("useBMI").disabled = false;
  document.getElementById("useBMI").setAttribute("data-bmi", bmi);
});

document.getElementById("useBMI")?.addEventListener("click", () => {
  const bmi = document.getElementById("useBMI").getAttribute("data-bmi");
  document.getElementById("bmi").value = bmi;
  bootstrap.Modal.getInstance(document.getElementById("bmiModal")).hide();
});

// ─────────────────────────────────────────────
// Bootstrap Tooltips
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltips.forEach(el => new bootstrap.Tooltip(el));
});

// ─────────────────────────────────────────────
// Form Submission
// ─────────────────────────────────────────────
document.getElementById("predictionForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const form   = e.target;
  const btn    = document.getElementById("submitBtn");
  const errDiv = document.getElementById("formError");

  // Bootstrap's native validation
  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }

  // Set loading state
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Analyzing with AI…`;
  errDiv.classList.add("d-none");

  const payload = {
    pregnancies:       parseFloat(document.getElementById("pregnancies").value),
    glucose:           parseFloat(document.getElementById("glucose").value),
    blood_pressure:    parseFloat(document.getElementById("blood_pressure").value),
    skin_thickness:    parseFloat(document.getElementById("skin_thickness").value),
    insulin:           parseFloat(document.getElementById("insulin").value),
    bmi:               parseFloat(document.getElementById("bmi").value),
    diabetes_pedigree: parseFloat(document.getElementById("diabetes_pedigree").value),
    age:               parseInt(document.getElementById("age").value),
    name:              document.getElementById("name").value.trim() || undefined,
    email:             document.getElementById("email").value.trim() || undefined,
    session_id:        getSessionId(),
  };

  try {
    const res  = await fetch(`${API_BASE}/predict`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),        // attach JWT token if logged in
      },
      body:    JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.errors
          ? data.errors.map(e => e.msg).join(", ")
          : data.error || "Prediction failed."
      );
    }

    // Store result in sessionStorage and redirect
    sessionStorage.setItem("medai_result", JSON.stringify(data));
    window.location.href = "result.html";

  } catch (err) {
    errDiv.textContent = `Error: ${err.message}`;
    errDiv.classList.remove("d-none");
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-robot me-2"></i>Analyze My Risk with AI`;
  }
});
