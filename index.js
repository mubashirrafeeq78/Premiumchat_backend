const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/**
 * Railway MySQL plugin میں اکثر یہ env آتے ہیں:
 * MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
 *
 * بعض اوقات single URL بھی ہوتا ہے:
 * MYSQL_URL or DATABASE_URL
 */
function getMysqlConfig() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (url && String(url).trim().length > 0) return String(url).trim();

  const host = process.env.MYSQLHOST;
  const user = process.env.MYSQLUSER;
  const password = process.env.MYSQLPASSWORD;
  const database = process.env.MYSQLDATABASE;
  const port = Number(process.env.MYSQLPORT || 3306);

  if (!host || !user || !password || !database) return null;

  return { host, user, password, database, port };
}

let pool = null;

async function connectDb() {
  const cfg = getMysqlConfig();
  if (!cfg) {
    console.log("❌ MySQL env vars missing. DB NOT connected.");
    return;
  }

  pool = mysql.createPool(
    typeof cfg === "string"
      ? cfg
      : {
          ...cfg,
          waitForConnections: true,
          connectionLimit: 10,
          enableKeepAlive: true,
        }
  );

  await pool.query("SELECT 1");
  console.log("✅ MySQL connected");
}

async function initTables() {
  if (!pool) return;

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      phone VARCHAR(20) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log("✅ Tables ensured: users, otp_codes");
}

// ---------- Routes ----------
app.get("/", (req, res) => {
  res.json({ ok: true, message: "PremiumChat Backend is running" });
});

app.get("/db/health", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });
    await pool.query("SELECT 1");
    res.json({ ok: true, message: "DB connected" });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

// Step-1: request OTP (demo)
app.post("/auth/request-otp", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  if (!phone) return res.status(400).json({ ok: false, message: "Phone required" });

  // demo otp
  const code = "123456";
  const expiresMinutes = 5;

  try {
    if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });

    await pool.query("DELETE FROM otp_codes WHERE phone = ?", [phone]);
    await pool.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))",
      [phone, code, expiresMinutes]
    );

    res.json({ ok: true, message: "OTP generated (demo)", demoOtp: code });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

// Step-2: verify OTP
app.post("/auth/verify-otp", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  const otp = String(req.body?.otp || "").trim();
  if (!phone || !otp) return res.status(400).json({ ok: false, message: "Phone and otp required" });

  try {
    if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });

    const [rows] = await pool.query(
      "SELECT code, expires_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1",
      [phone]
    );

    if (!rows || rows.length === 0) return res.status(400).json({ ok: false, message: "OTP not found" });

    const row = rows[0];
    if (String(row.code) !== otp) return res.status(400).json({ ok: false, message: "Invalid OTP" });

    const [expCheck] = await pool.query("SELECT NOW() <= ? AS ok", [row.expires_at]);
    if (!expCheck[0]?.ok) return res.status(400).json({ ok: false, message: "OTP expired" });

    // user ensure (default buyer)
    await pool.query(
      "INSERT INTO users (phone, role) VALUES (?, 'buyer') ON DUPLICATE KEY UPDATE phone=VALUES(phone)",
      [phone]
    );

    res.json({ ok: true, message: "OTP verified", phone });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

// ---------- Start ----------
(async () => {
  try {
    await connectDb();
    await initTables();
  } catch (e) {
    console.log("❌ Startup error:", e?.message || e);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
})();
