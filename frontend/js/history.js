/**
 * history.js — Report History Page
 * Loads previous assessments from the backend, renders stats + table + trend chart
 */

const API_BASE    = "/api";
const SESSION_KEY = "medai_session_id";
const PAGE_SIZE   = 10;

let currentPage  = 1;
let totalReports = 0;
let trendChart   = null;

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Pre-fill session input from localStorage
  const sid = localStorage.getItem(SESSION_KEY);
  if (sid) document.getElementById("sessionInput").value = sid;

  loadHistory();

  document.getElementById("loadHistoryBtn")?.addEventListener("click", () => {
    currentPage = 1;
    loadHistory();
  });

  document.getElementById("sessionInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { currentPage = 1; loadHistory(); }
  });
});

// ─────────────────────────────────────────────
// Load Reports + Stats
// ─────────────────────────────────────────────
async function loadHistory() {
  const sid    = document.getElementById("sessionInput").value.trim();
  const offset = (currentPage - 1) * PAGE_SIZE;

  setLoadingState(true);

  try {
    // Parallel: fetch reports + stats
    const [reportsRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/reports?${sid ? `session_id=${encodeURIComponent(sid)}&` : ""}limit=${PAGE_SIZE}&offset=${offset}`),
      fetch(`${API_BASE}/reports/stats/summary`),
    ]);

    const reportsData = await reportsRes.json();
    const statsData   = statsRes.ok ? await statsRes.json() : null;

    totalReports = reportsData.total || 0;

    renderStats(statsData);
    renderTable(reportsData.reports || []);
    renderPagination();
    if (statsData?.trend) renderTrendChart(statsData.trend);

  } catch (err) {
    showTableState("error", `Failed to load reports: ${err.message}`);
  } finally {
    setLoadingState(false);
  }
}

// ─────────────────────────────────────────────
// Render Stats Cards
// ─────────────────────────────────────────────
function renderStats(data) {
  if (!data?.summary) return;
  const s = data.summary;
  setText("totalCount",    s.total       || 0);
  setText("highRiskCount", s.high_risk   || 0);
  setText("lowRiskCount",  s.low_risk    || 0);
  setText("avgRisk",       s.avg_probability ? `${s.avg_probability}%` : "—");
}

// ─────────────────────────────────────────────
// Render Table
// ─────────────────────────────────────────────
function renderTable(reports) {
  const tbody   = document.getElementById("reportsTableBody");
  const wrapper = document.getElementById("tableWrapper");
  const empty   = document.getElementById("tableEmpty");
  const badge   = document.getElementById("reportCountBadge");

  badge.textContent = totalReports;

  if (!reports.length) {
    wrapper.classList.add("d-none");
    empty.classList.remove("d-none");
    return;
  }

  empty.classList.add("d-none");
  wrapper.classList.remove("d-none");

  tbody.innerHTML = reports.map(r => `
    <tr class="fade-in-up">
      <td>
        <div class="fw-semibold">${formatDate(r.created_at)}</div>
        <div class="small text-muted">${formatTime(r.created_at)}</div>
      </td>
      <td>
        <span class="risk-badge badge-${r.risk_level?.toLowerCase()}">
          <i class="bi ${riskIcon(r.risk_level)} me-1"></i>${r.risk_level}
        </span>
      </td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div style="width:60px">
            <div class="progress" style="height:6px">
              <div class="progress-bar ${r.risk_level?.toLowerCase()}"
                   style="width:${r.probability}%"></div>
            </div>
          </div>
          <span class="fw-bold">${r.probability}%</span>
        </div>
      </td>
      <td>${r.glucose ?? "—"} <span class="text-muted small">mg/dL</span></td>
      <td>${r.bmi ?? "—"}</td>
      <td>${r.age ?? "—"}</td>
      <td>
        <div class="d-flex gap-1">
          <a href="result.html?id=${r.id}" class="btn btn-sm btn-outline-primary" title="View">
            <i class="bi bi-eye"></i>
          </a>
          <a href="${API_BASE}/reports/${r.id}/pdf" target="_blank"
             class="btn btn-sm btn-outline-warning" title="Download PDF">
            <i class="bi bi-file-earmark-pdf"></i>
          </a>
          <button class="btn btn-sm btn-outline-danger" title="Delete"
                  onclick="deleteReport('${r.id}', this)">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

// ─────────────────────────────────────────────
// Delete Report
// ─────────────────────────────────────────────
async function deleteReport(id, btn) {
  if (!confirm("Delete this report? This cannot be undone.")) return;

  const tr = btn.closest("tr");
  tr.style.opacity = "0.5";
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/reports/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed.");
    tr.remove();
    totalReports = Math.max(0, totalReports - 1);
    document.getElementById("reportCountBadge").textContent = totalReports;
    if (totalReports === 0) {
      document.getElementById("tableWrapper").classList.add("d-none");
      document.getElementById("tableEmpty").classList.remove("d-none");
    }
  } catch (err) {
    alert(err.message);
    tr.style.opacity = "1";
    btn.disabled = false;
  }
}

// ─────────────────────────────────────────────
// Trend Chart
// ─────────────────────────────────────────────
function renderTrendChart(trend) {
  const card = document.getElementById("trendChartCard");
  if (!trend.length) { card.classList.add("d-none"); return; }

  card.classList.remove("d-none");
  const ctx = document.getElementById("trendChart");
  if (!ctx) return;

  if (trendChart) { trendChart.destroy(); }

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels:   trend.map(t => formatDate(t.date)),
      datasets: [{
        label:           "Avg. Risk Probability (%)",
        data:            trend.map(t => parseFloat(t.avg_prob)),
        borderColor:     "#1a73e8",
        backgroundColor: "rgba(26,115,232,0.08)",
        borderWidth:     2.5,
        pointRadius:     4,
        pointBackgroundColor: "#1a73e8",
        fill:            true,
        tension:         0.4,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw}%` } }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { callback: v => `${v}%` },
          grid: { color: "#f0f0f0" }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

// ─────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────
function renderPagination() {
  const footer   = document.getElementById("paginationFooter");
  const nav      = document.getElementById("pagination");
  const totalPages = Math.ceil(totalReports / PAGE_SIZE);

  if (totalPages <= 1) { footer.classList.add("d-none"); return; }
  footer.classList.remove("d-none");

  let html = "";
  html += `<li class="page-item ${currentPage === 1 ? "disabled" : ""}">
    <a class="page-link" href="#" onclick="goPage(${currentPage - 1})">‹</a>
  </li>`;

  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2) {
      html += `<li class="page-item ${p === currentPage ? "active" : ""}">
        <a class="page-link" href="#" onclick="goPage(${p})">${p}</a>
      </li>`;
    } else if (Math.abs(p - currentPage) === 3) {
      html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }
  }

  html += `<li class="page-item ${currentPage === totalPages ? "disabled" : ""}">
    <a class="page-link" href="#" onclick="goPage(${currentPage + 1})">›</a>
  </li>`;

  nav.innerHTML = html;
}

function goPage(p) {
  const totalPages = Math.ceil(totalReports / PAGE_SIZE);
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  loadHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
  return false;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function setLoadingState(loading) {
  document.getElementById("tableLoading").classList.toggle("d-none", !loading);
  if (loading) {
    document.getElementById("tableWrapper").classList.add("d-none");
    document.getElementById("tableEmpty").classList.add("d-none");
  }
}

function showTableState(type, msg) {
  const empty = document.getElementById("tableEmpty");
  empty.classList.remove("d-none");
  empty.innerHTML = `<i class="bi bi-exclamation-circle text-danger fs-1"></i>
    <p class="text-muted mt-2">${msg}</p>`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric"
  });
}
function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit"
  });
}

function riskIcon(level) {
  if (level === "High")     return "bi-exclamation-triangle-fill";
  if (level === "Moderate") return "bi-dash-circle-fill";
  return "bi-check-circle-fill";
}

window.goPage = goPage;
window.deleteReport = deleteReport;
