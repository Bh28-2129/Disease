// routes/reports.js — Report History, PDF Download, Email Report
const express     = require("express");
const PDFDocument = require("pdfkit");
const nodemailer  = require("nodemailer");
const { pool }    = require("../db");

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/reports — All reports (optionally filter by session_id)
// ─────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { session_id, limit = 20, offset = 0 } = req.query;

    let query  = `SELECT * FROM reports`;
    const vals = [];

    if (session_id) {
      vals.push(session_id);
      query += ` WHERE session_id = $1`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`;
    vals.push(Number(limit), Number(offset));

    const result = await pool.query(query, vals);

    // Count
    let countQuery = `SELECT COUNT(*) FROM reports`;
    const countVals = [];
    if (session_id) {
      countVals.push(session_id);
      countQuery += ` WHERE session_id = $1`;
    }
    const countResult = await pool.query(countQuery, countVals);

    return res.json({
      reports: result.rows,
      total:   parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error("[Reports] Fetch error:", err.message);
    return res.status(500).json({ error: "Failed to fetch reports." });
  }
});

// ─────────────────────────────────────────────
// GET /api/reports/:id — Single report
// ─────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.name as user_name, u.email as user_email
       FROM reports r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found." });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch report." });
  }
});

// ─────────────────────────────────────────────
// GET /api/reports/:id/pdf — Download PDF
// ─────────────────────────────────────────────
router.get("/:id/pdf", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.name as user_name, u.email as user_email
       FROM reports r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found." });
    }

    const report = result.rows[0];
    const doc    = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="disease-risk-report-${report.id.slice(0, 8)}.pdf"`
    );
    doc.pipe(res);

    buildPDF(doc, report);
    doc.end();
  } catch (err) {
    console.error("[PDF] Error:", err.message);
    return res.status(500).json({ error: "Failed to generate PDF." });
  }
});

// ─────────────────────────────────────────────
// POST /api/reports/:id/email — Email report
// ─────────────────────────────────────────────
router.post("/:id/email", async (req, res) => {
  const { to_email, to_name } = req.body;

  if (!to_email) {
    return res.status(400).json({ error: "Email address is required." });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM reports WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found." });
    }
    const report = result.rows[0];

    // Build PDF in memory
    const doc     = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));

    await new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
      buildPDF(doc, report);
      doc.end();
    });

    const pdfBuffer = Buffer.concat(buffers);

    // Configure transporter (uses SMTP env vars)
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || "smtp.gmail.com",
      port:   parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from:    `"AI Health Report" <${process.env.SMTP_USER}>`,
      to:      to_email,
      subject: "Your Disease Risk Prediction Report",
      html:    buildEmailHTML(report, to_name),
      attachments: [{
        filename:    `risk-report-${report.id.slice(0, 8)}.pdf`,
        content:     pdfBuffer,
        contentType: "application/pdf",
      }],
    });

    return res.json({ message: `Report emailed to ${to_email}` });
  } catch (err) {
    console.error("[Email] Error:", err.message);
    return res.status(500).json({ error: "Failed to send email. Check SMTP config." });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/reports/:id
// ─────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM reports WHERE id = $1`, [req.params.id]);
    return res.json({ message: "Report deleted." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete report." });
  }
});

// ─────────────────────────────────────────────
// GET /api/reports/stats/summary — Dashboard stats
// ─────────────────────────────────────────────
router.get("/stats/summary", async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*)                                           AS total,
        COUNT(*) FILTER (WHERE risk_level = 'High')       AS high_risk,
        COUNT(*) FILTER (WHERE risk_level = 'Moderate')   AS moderate_risk,
        COUNT(*) FILTER (WHERE risk_level = 'Low')        AS low_risk,
        ROUND(AVG(probability), 1)                         AS avg_probability,
        ROUND(AVG(bmi), 1)                                 AS avg_bmi,
        ROUND(AVG(glucose), 1)                             AS avg_glucose,
        ROUND(AVG(age), 1)                                 AS avg_age
      FROM reports
    `);

    const trend = await pool.query(`
      SELECT
        DATE_TRUNC('day', created_at)::date AS date,
        COUNT(*) AS count,
        ROUND(AVG(probability), 1) AS avg_prob
      FROM reports
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);

    return res.json({
      summary: stats.rows[0],
      trend:   trend.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch stats." });
  }
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function buildPDF(doc, report) {
  const riskColor = report.risk_level === "High"
    ? "#dc3545" : report.risk_level === "Moderate"
    ? "#fd7e14" : "#28a745";

  // Header
  doc.fillColor("#1a73e8").fontSize(22).font("Helvetica-Bold")
     .text("AI Disease Risk Prediction Report", { align: "center" });
  doc.moveDown(0.3);
  doc.fillColor("#6c757d").fontSize(10).font("Helvetica")
     .text(`Report ID: ${report.id}`, { align: "center" })
     .text(`Generated: ${new Date(report.created_at).toLocaleString()}`, { align: "center" });

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#dee2e6").stroke();
  doc.moveDown(0.5);

  // ⚠️ Disclaimer
  doc.fillColor("#856404").fontSize(9).font("Helvetica-Oblique")
     .text(
       "⚠️  DISCLAIMER: This is NOT medical advice. The predictions are AI-generated and for informational purposes only. Please consult a qualified healthcare professional for diagnosis or treatment.",
       { align: "left" }
     );

  doc.moveDown(0.8);

  // Risk Result
  doc.fillColor(riskColor).fontSize(28).font("Helvetica-Bold")
     .text(`${report.risk_level} Risk`, { align: "center" });
  doc.fillColor(riskColor).fontSize(18).font("Helvetica-Bold")
     .text(`${report.probability}%`, { align: "center" });

  doc.moveDown(0.8);

  // Input Data Table
  doc.fillColor("#212529").fontSize(13).font("Helvetica-Bold").text("Input Health Data");
  doc.moveDown(0.3);

  const fields = [
    ["Pregnancies",           report.pregnancies],
    ["Glucose (mg/dL)",       report.glucose],
    ["Blood Pressure (mmHg)", report.blood_pressure],
    ["Skin Thickness (mm)",   report.skin_thickness],
    ["Insulin (μU/mL)",       report.insulin],
    ["BMI",                   report.bmi],
    ["Diabetes Pedigree",     report.diabetes_pedigree],
    ["Age (years)",           report.age],
  ];

  fields.forEach(([label, value]) => {
    doc.fillColor("#495057").fontSize(10).font("Helvetica-Bold").text(label, 50, doc.y, { continued: true, width: 250 });
    doc.fillColor("#212529").font("Helvetica").text(`: ${value ?? "N/A"}`);
  });

  doc.moveDown(0.8);

  // Suggestions
  doc.fillColor("#212529").fontSize(13).font("Helvetica-Bold").text("Recommendations");
  doc.moveDown(0.3);

  const suggestions = Array.isArray(report.suggestions) ? report.suggestions : [];
  suggestions.forEach((s, i) => {
    doc.fillColor("#495057").fontSize(10).font("Helvetica")
       .text(`${i + 1}. ${s}`, { indent: 10 });
    doc.moveDown(0.2);
  });

  doc.moveDown(0.5);
  doc.fillColor("#6c757d").fontSize(9).font("Helvetica-Oblique")
     .text(`Model: ${report.model_type}`, { align: "right" });
}

function buildEmailHTML(report, toName) {
  const riskColor = report.risk_level === "High"
    ? "#dc3545" : report.risk_level === "Moderate"
    ? "#fd7e14" : "#28a745";

  return `
  <!DOCTYPE html>
  <html>
  <body style="font-family:Arial,sans-serif;background:#f8f9fa;padding:20px">
    <div style="max-width:600px;margin:auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
      <div style="background:#1a73e8;color:white;padding:24px;text-align:center">
        <h2>AI Disease Risk Prediction Report</h2>
      </div>
      <div style="padding:24px">
        <p>Hi <strong>${toName || "there"}</strong>,</p>
        <p>Your health assessment report is ready. Please find the full PDF attached.</p>
        <div style="text-align:center;margin:24px 0">
          <div style="font-size:36px;font-weight:bold;color:${riskColor}">${report.risk_level} Risk</div>
          <div style="font-size:24px;color:${riskColor}">${report.probability}%</div>
        </div>
        <hr style="border:none;border-top:1px solid #dee2e6">
        <p style="font-size:12px;color:#856404;background:#fff3cd;padding:10px;border-radius:6px">
          ⚠️ This is NOT medical advice. Please consult a qualified healthcare professional.
        </p>
      </div>
    </div>
  </body>
  </html>`;
}

module.exports = router;
