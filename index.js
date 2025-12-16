"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");

const app = express();

/** =========================
 *  1) CONFIG (TOP)
 *  ========================= */
const CONFIG = {
  PORT: process.env.PORT || 3000,

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || "CHANGE_ME__JWT_SECRET",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "30d",

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",

  // MySQL (Railway commonly provides these)
  MYSQL: {
    HOST: process.env.MYSQLHOST || process.env.MYSQL_HOST,
    USER: process.env.MYSQLUSER || process.env.MYSQL_USER,
    PASSWORD: process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD,
    DATABASE: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE,
    PORT: Number(process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306),
    URL: process.env.MYSQL_URL || process.env.DATABASE_URL // optional
  }
};

/** =========================
 *  2) MIDDLEWARE
 *  ========================= */
app.use(
  cors({
    origin: CONFIG.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"]
  })
);

app.options("*", cors());
app.use(express.json({ limit: "1mb" }));

/** =========================
 *  3) HELPERS
 *  ========================= */
function normalizePhone(phone) {
  return String(phone || "").trim().replace(/\s+/g, "");
}

function isValidPhone(phone) {
  const p = normalizePhone(phone);
  const digits = p.replace(/[^\d]/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

function signToken(payload) {
  return jwt.sign(payload, CONFIG.JWT_SECRET, { expiresIn: CONFIG.JWT_EXPIRES_IN });
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ ok: false, message: "Missing token" });

  try {
    req.user = jwt.verify(token, CONFIG.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Invalid token" });
  }
}

/** =========================
 *  4) DB (POOL + MIGRATIONS)
 *  ========================= */
let pool = null;

async function createPoolFromEnv() {
  // If Railway provides a single URL
  if (CONFIG.MYSQL.URL) {
    return mysql.createPool(CONFIG.MYSQL.URL);
  }

  // Otherwise use discrete vars
  const { HOST, USER, PASSWORD, DATABASE, PORT } = CONFIG.MYSQL;
  if (!HOST || !USER || !DATABASE) return null;

  return mysql.createPool({
    host: HOST,
    user: USER,
    password: PASSWORD,
    database: DATABASE,
    port: PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

async function migrate() {
  if (!pool) return;

  // Users table: role = buyer/provider
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL,
      role ENUM('buyer','provider') NOT NULL DEFAULT 'buyer',
      name VARCHAR(120) NULL,
      avatar_url TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // OTP table (optional) - for demo auditing (can be removed later)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL,
      otp VARCHAR(10) NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_otp_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureDb() {
  pool = await createPoolFromEnv();
  if (!pool) {
    console.log("⚠️ DB env not found. API will run but DB endpoints will fail.");
    return;
  }

  // Test connection
  await pool.query("SELECT 1");

  // Run migrations
  await migrate();
  console.log("✅ DB connected + migrations applied.");
}

/** =========================
 *  5) ROUTES
 *  ========================= */
app.get("/", (req, res) => {
  res.json({ ok: true, message: "PremiumChat Backend is running" });
});

app.get("/health", async (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

// DB check endpoint (to confirm MySQL is connected)
app.get("/db-check", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false, message: "DB not configured" });
    const [rows] = await pool.query("SELECT 1 AS one");
    res.json({ ok: true, db: true, result: rows?.[0]?.one ?? 1 });
  } catch (e) {
    res.status(500).json({ ok: false, db: false, message: String(e?.message || e) });
  }
});

// Demo in-memory OTP store (restart پر ختم ہو جائے گا)
const otpStore = new Map(); // phone -> { otp, expiresAt }

// Request OTP
app.post("/auth/request-otp", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);

  if (!isValidPhone(phone)) {
    return res.status(400).json({ ok: false, message: "Invalid phone number" });
  }

  const otp = generateOtp();
  const expiresAt = Date.now() + 2 * 60 * 1000; // 2 minutes
  otpStore.set(phone, { otp, expiresAt });

  // Save to DB logs if available (optional)
  try {
    if (pool) {
      await pool.query("INSERT INTO otp_logs (phone, otp, expires_at) VALUES (?, ?, ?)", [
        phone,
        otp,
        expiresAt
      ]);
    }
  } catch (_) {}

  // Demo response (SMS نہیں جا رہا)
  return res.json({
    ok: true,
    message: "OTP generated (demo)",
    phone,
    otp,
    expiresAt
  });
});

// Verify OTP -> create/find user in DB, return JWT token
app.post("/auth/verify-otp", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const otp = normalizePhone(req.body?.otp);

  if (!isValidPhone(phone) || !otp) {
    return res.status(400).json({ ok: false, message: "phone and otp are required" });
  }

  const record = otpStore.get(phone);
  if (!record) return res.status(400).json({ ok: false, message: "No OTP requested" });

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ ok: false, message: "OTP expired" });
  }

  if (otp !== record.otp) {
    return res.status(400).json({ ok: false, message: "Invalid OTP" });
  }

  otpStore.delete(phone);

  // Ensure user exists in DB
  let userId = null;
  try {
    if (!pool) {
      // still allow demo token even if db not configured
      const token = signToken({ phone, userId: null });
      return res.json({ ok: true, message: "OTP verified (no-db)", token });
    }

    const [found] = await pool.query("SELECT id, role, name FROM users WHERE phone = ? LIMIT 1", [
      phone
    ]);

    if (found.length) {
      userId = found[0].id;
    } else {
      const [ins] = await pool.query("INSERT INTO users (phone, role) VALUES (?, 'buyer')", [phone]);
      userId = ins.insertId;
    }

    const token = signToken({ phone, userId });
    return res.json({ ok: true, message: "OTP verified", token, userId });
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

// Update profile (name, role, avatar_url)
app.post("/user/profile", authMiddleware, async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false, message: "DB not configured" });

    const userId = req.user?.userId;
    if (!userId) return res.status(400).json({ ok: false, message: "Invalid user in token" });

    const name = String(req.body?.name || "").trim() || null;
    const avatarUrl = String(req.body?.avatar_url || "").trim() || null;
    const role = String(req.body?.role || "").trim();

    if (role && role !== "buyer" && role !== "provider") {
      return res.status(400).json({ ok: false, message: "role must be buyer or provider" });
    }

    await pool.query(
      "UPDATE users SET name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url), role = COALESCE(?, role) WHERE id = ?",
      [name, avatarUrl, role || null, userId]
    );

    const [rows] = await pool.query("SELECT id, phone, role, name, avatar_url, created_at FROM users WHERE id = ?", [
      userId
    ]);

    return res.json({ ok: true, user: rows[0] || null });
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

// Get current user
app.get("/user/me", authMiddleware, async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false, message: "DB not configured" });

    const userId = req.user?.userId;
    if (!userId) return res.status(400).json({ ok: false, message: "Invalid user in token" });

    const [rows] = await pool.query(
      "SELECT id, phone, role, name, avatar_url, created_at FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    return res.json({ ok: true, user: rows[0] || null });
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

/** =========================
 *  6) START
 *  ========================= */
(async () => {
  try {
    await ensureDb();
  } catch (e) {
    console.log("❌ DB init failed:", e?.message || e);
  }

  app.listen(CONFIG.PORT, "0.0.0.0", () => {
    console.log(`✅ API running on port ${CONFIG.PORT}`);
  });
})();
