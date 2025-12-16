const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json());

// Railway پر PORT env سے آتا ہے
const PORT = process.env.PORT || 3000;

/**
 * Railway MySQL plugin عام طور پر یہ env دیتا ہے:
 * MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
 * ہم MYSQL_URL بھی support کر رہے ہیں اگر موجود ہو۔
 */
function getMysqlConfig() {
  if (process.env.MYSQL_URL) {
    return process.env.MYSQL_URL; // e.g. mysql://user:pass@host:port/db
  }

  const host = process.env.MYSQLHOST || process.env.DB_HOST;
  const user = process.env.MYSQLUSER || process.env.DB_USER;
  const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD;
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME;
  const port = Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306);

  if (!host || !user || !password || !database) return null;

  return { host, user, password, database, port };
}

let pool = null;

async function connectDb() {
  const cfg = getMysqlConfig();
  if (!cfg) {
    console.log("⚠️ MySQL env vars missing. DB will NOT be used.");
    return;
  }

  pool = mysql.createPool(
    typeof cfg === "string"
      ? cfg
      : {
          ...cfg,
          waitForConnections: true,
          connectionLimit: 10,
          enableKeepAlive: true
        }
  );

  // Test ping
  await pool.query("SELECT 1");
  console.log("✅ MySQL connected");
}

async function initTables() {
  if (!pool) return;

  // Users table: buyer/provider
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL UNIQUE,
      role ENUM('buyer','provider') NOT NULL DEFAULT 'buyer',
      name VARCHAR(120) NULL,
      avatar_url TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // OTP table (basic)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      phone VARCHAR(20) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log("✅ Tables ensured (users, otp_codes)");
}

// Health route
app.get("/", (req, res) => {
  res.json({ success: true, message: "PremiumChat Backend is running" });
});

// DB health check (اسی سے آپ کنفرم کر لیں گے DB connect ہے یا نہیں)
app.get("/db/health", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });
    await pool.query("SELECT 1");
    res.json({ ok: true, message: "DB connected" });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

// OTP APIs (basic demo)
app.post("/auth/request-otp", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

  const code = "123456"; // demo
  const expiresMinutes = 5;

  try {
    if (!pool) return res.status(500).json({ success: false, message: "DB not configured" });

    await pool.query("DELETE FROM otp_codes WHERE phone = ?", [phone]);
    await pool.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))",
      [phone, code, expiresMinutes]
    );

    res.json({ success: true, message: "OTP generated (demo: 123456)" });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

app.post("/auth/verify-otp", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  const otp = String(req.body?.otp || "").trim();
  if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone and otp required" });

  try {
    if (!pool) return res.status(500).json({ success: false, message: "DB not configured" });

    const [rows] = await pool.query(
      "SELECT code, expires_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1",
      [phone]
    );

    if (!rows.length) return res.status(400).json({ success: false, message: "OTP not found" });
    const row = rows[0];

    if (row.code !== otp) return res.status(400).json({ success: false, message: "Invalid OTP" });

    // expiry check
    const [expCheck] = await pool.query("SELECT NOW() <= ? AS ok", [row.expires_at]);
    if (!expCheck[0].ok) return res.status(400).json({ success: false, message: "OTP expired" });

    // ensure user exists (default buyer)
    await pool.query(
      "INSERT INTO users (phone, role) VALUES (?, 'buyer') ON DUPLICATE KEY UPDATE phone=VALUES(phone)",
      [phone]
    );

    res.json({ success: true, message: "OTP verified", phone });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

(async () => {
  try {
    await connectDb();
    await initTables();
  } catch (e) {
    console.log("❌ Startup error:", e?.message || e);
  }

  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
})();
