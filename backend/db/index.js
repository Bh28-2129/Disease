// db/index.js — PostgreSQL connection pool
const { Pool } = require("pg");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },   // required for Neon / cloud Postgres
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected error on idle client:", err.message);
});

// ─────────────────────────────────────────────
// Initialize tables on startup
// ─────────────────────────────────────────────
const initDB = async () => {
  const createUsers = `
    CREATE TABLE IF NOT EXISTS users (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name           VARCHAR(120),
      email          VARCHAR(200) UNIQUE,
      password_hash  VARCHAR(255),
      created_at     TIMESTAMP DEFAULT NOW()
    );
  `;

  // Add password_hash to existing databases that were created without it
  const alterUsers = `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
  `;

  const createReports = `
    CREATE TABLE IF NOT EXISTS reports (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
      session_id       VARCHAR(100),

      -- Input features
      pregnancies      NUMERIC,
      glucose          NUMERIC,
      blood_pressure   NUMERIC,
      skin_thickness   NUMERIC,
      insulin          NUMERIC,
      bmi              NUMERIC,
      diabetes_pedigree NUMERIC,
      age              INTEGER,

      -- Results
      prediction       INTEGER,
      probability      NUMERIC,
      risk_level       VARCHAR(20),
      suggestions      TEXT[],
      model_type       VARCHAR(50),

      created_at       TIMESTAMP DEFAULT NOW()
    );
  `;

  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_reports_session ON reports(session_id);
    CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_risk    ON reports(risk_level);
  `;

  try {
    await pool.query(createUsers);
    await pool.query(alterUsers);
    await pool.query(createReports);
    await pool.query(createIndexes);
    console.log("[DB] Tables initialized ✓");
  } catch (err) {
    console.error("[DB] Table init failed:", err.message);
  }
};

module.exports = { pool, initDB };
