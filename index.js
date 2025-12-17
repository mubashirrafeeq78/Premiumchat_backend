const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== MySQL config (Railway / any VPS) =====
function getMysqlConfig() {
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL; // mysql://user:pass@host:port/db

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
      city VARCHAR(120) NULL,
      about TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buyer_profiles (
      user_id BIGINT UNSIGNED NOT NULL,
      preferred_categories JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_buyer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS provider_profiles (
      user_id BIGINT UNSIGNED NOT NULL,
      cnic_front_url TEXT NULL,
      cnic_back_url TEXT NULL,
      verified TINYINT(1) NOT NULL DEFAULT 0,
      services JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_provider_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

  console.log("✅ Tables ensured: users, buyer_profiles, provider_profiles, otp_codes");
}

app.get("/", (req, res) => res.json({ ok: true, message: "PremiumChat Backend running" }));

app.get("/db/health", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });
    await pool.query("SELECT 1");
    return res.json({ ok: true, message: "DB connected" });
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

app.post("/auth/request-otp", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  if (!phone) return res.status(400).json({ ok: false, message: "Phone required" });
  if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });

  const code = "1234"; // demo
  const expiresMinutes = 5;

  try {
    await pool.query("DELETE FROM otp_codes WHERE phone = ?", [phone]);
    await pool.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))",
      [phone, code, expiresMinutes]
    );
    return res.json({ ok: true, message: "OTP generated (demo)", demoOtp: code });
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

app.post("/auth/verify-otp", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  const otp = String(req.body?.otp || "").trim();
  if (!phone || !otp) return res.status(400).json({ ok: false, message: "Phone and otp required" });
  if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });

  try {
    const [rows] = await pool.query(
      "SELECT code, expires_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1",
      [phone]
    );
    if (!rows.length) return res.status(400).json({ ok: false, message: "OTP not found" });

    const row = rows[0];
    if (row.code !== otp) return res.status(400).json({ ok: false, message: "Invalid OTP" });

    const [expCheck] = await pool.query("SELECT NOW() <= ? AS ok", [row.expires_at]);
    if (!expCheck[0].ok) return res.status(400).json({ ok: false, message: "OTP expired" });

    await pool.query(
      "INSERT INTO users (phone, role) VALUES (?, 'buyer') ON DUPLICATE KEY UPDATE phone=VALUES(phone)",
      [phone]
    );

    return res.json({ ok: true, message: "OTP verified", phone });
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

app.post("/profile/setup", async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });

  const phone = String(req.body?.phone || "").trim();
  const role = String(req.body?.role || "buyer").trim(); // buyer|provider
  const name = String(req.body?.name || "").trim();
  const city = req.body?.city == null ? null : String(req.body.city).trim();
  const about = req.body?.about == null ? null : String(req.body.about).trim();

  if (!phone) return res.status(400).json({ ok: false, message: "Phone required" });
  if (!name) return res.status(400).json({ ok: false, message: "Name required" });
  if (role !== "buyer" && role !== "provider") {
    return res.status(400).json({ ok: false, message: "Invalid role" });
  }

  try {
    await pool.query(
      `INSERT INTO users (phone, role, name, city, about)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE role=VALUES(role), name=VALUES(name), city=VALUES(city), about=VALUES(about)`,
      [phone, role, name, city, about]
    );

    const [[u]] = await pool.query(
      "SELECT id, phone, role, name, city, about FROM users WHERE phone = ? LIMIT 1",
      [phone]
    );

    if (role === "buyer") {
      await pool.query("INSERT IGNORE INTO buyer_profiles (user_id) VALUES (?)", [u.id]);
      await pool.query("DELETE FROM provider_profiles WHERE user_id = ?", [u.id]);
    } else {
      await pool.query("INSERT IGNORE INTO provider_profiles (user_id) VALUES (?)", [u.id]);
      await pool.query("DELETE FROM buyer_profiles WHERE user_id = ?", [u.id]);
    }

    return res.json({ ok: true, user: u });
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

app.get("/home", async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });

  const phone = String(req.query?.phone || "").trim();
  if (!phone) return res.status(400).json({ ok: false, message: "phone query required" });

  try {
    const [users] = await pool.query(
      "SELECT id, phone, role, name, city, about, created_at FROM users WHERE phone = ? LIMIT 1",
      [phone]
    );
    if (!users.length) return res.status(404).json({ ok: false, message: "User not found" });

    const user = users[0];
    let profile = null;

    if (user.role === "buyer") {
      const [rows] = await pool.query("SELECT * FROM buyer_profiles WHERE user_id = ? LIMIT 1", [user.id]);
      profile = rows[0] || null;
    } else {
      const [rows] = await pool.query("SELECT * FROM provider_profiles WHERE user_id = ? LIMIT 1", [user.id]);
      profile = rows[0] || null;
    }

    return res.json({ ok: true, user, profile });
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e?.message || e) });
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
