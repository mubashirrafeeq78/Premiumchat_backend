"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// =====================
// ✅ CONFIG (TOP)
// =====================
const PORT = process.env.PORT || 3000;

// Railway MySQL plugin envs (you will add these in Premiumchat_backend Variables)
const DB_HOST = process.env.MYSQLHOST;
const DB_PORT = Number(process.env.MYSQLPORT || 3306);
const DB_USER = process.env.MYSQLUSER;
const DB_PASS = process.env.MYSQLPASSWORD;
const DB_NAME = process.env.MYSQLDATABASE;

const JWT_SECRET = process.env.JWT_SECRET || "";
const OTP_TTL_MS = 2 * 60 * 1000; // 2 minutes
const BCRYPT_ROUNDS = 10;

// =====================
// ✅ App
// =====================
const app = express();

app.use(helmet());
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: "200kb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// =====================
// ✅ DB Pool
// =====================
function mustEnv(name, value) {
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

const pool = mysql.createPool({
  host: mustEnv("MYSQLHOST", DB_HOST),
  port: DB_PORT,
  user: mustEnv("MYSQLUSER", DB_USER),
  password: mustEnv("MYSQLPASSWORD", DB_PASS),
  database: mustEnv("MYSQLDATABASE", DB_NAME),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// =====================
// ✅ Helpers
// =====================
function normalizePhone(input) {
  const s = String(input || "").trim();
  return s.replace(/[^\d+]/g, "");
}

function isValidPhone(phone) {
  // Simple validation: +92xxxxxxxxxx or 03xxxxxxxxx etc (adjust later if needed)
  if (!phone) return false;
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

function signToken(payload) {
  if (!JWT_SECRET || JWT_SECRET.length < 20) {
    throw new Error("JWT_SECRET is missing or too short (use 20+ chars).");
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

async function migrate() {
  // Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL,
      role ENUM('buyer','provider') NOT NULL DEFAULT 'buyer',
      full_name VARCHAR(80) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // OTP table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      phone VARCHAR(20) NOT NULL,
      otp_hash VARCHAR(100) NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (phone),
      KEY idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

// =====================
// ✅ Routes
// =====================
app.get("/", (req, res) => res.json({ success: true, message: "PremiumChat Backend is running" }));
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true, time: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, db: false, message: "DB not reachable" });
  }
});

// ✅ Request OTP
app.post("/auth/request-otp", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);

    if (!isValidPhone(phone)) {
      return res.status(400).json({ ok: false, message: "Invalid phone number" });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const expiresAt = Date.now() + OTP_TTL_MS;

    await pool.query(
      `
        INSERT INTO otp_codes (phone, otp_hash, expires_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE otp_hash = VALUES(otp_hash), expires_at = VALUES(expires_at)
      `,
      [phone, otpHash, expiresAt]
    );

    // NOTE: Production میں OTP SMS provider سے بھیجیں گے۔
    // ابھی testing کے لیے response میں OTP واپس کر رہے ہیں (بعد میں بند کر دیں گے)
    return res.json({ ok: true, message: "OTP generated", otp, expiresAt });
  } catch (e) {
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ✅ Verify OTP + issue token + ensure user exists
app.post("/auth/verify-otp", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || "").trim();

    if (!isValidPhone(phone) || otp.length < 4) {
      return res.status(400).json({ ok: false, message: "Invalid request" });
    }

    const [rows] = await pool.query(`SELECT phone, otp_hash, expires_at FROM otp_codes WHERE phone = ? LIMIT 1`, [
      phone,
    ]);
    const record = rows && rows[0];

    if (!record) return res.status(400).json({ ok: false, message: "OTP not found" });
    if (Date.now() > Number(record.expires_at)) {
      await pool.query(`DELETE FROM otp_codes WHERE phone = ?`, [phone]);
      return res.status(400).json({ ok: false, message: "OTP expired" });
    }

    const ok = await bcrypt.compare(otp, record.otp_hash);
    if (!ok) return res.status(400).json({ ok: false, message: "Invalid OTP" });

    await pool.query(`DELETE FROM otp_codes WHERE phone = ?`, [phone]);

    // Ensure user exists
    await pool.query(`INSERT IGNORE INTO users (phone) VALUES (?)`, [phone]);

    const [urows] = await pool.query(`SELECT id, phone, role, full_name FROM users WHERE phone = ? LIMIT 1`, [phone]);
    const user = urows[0];

    const token = signToken({ uid: user.id, phone: user.phone, role: user.role });

    return res.json({
      ok: true,
      message: "OTP verified",
      token,
      user: { id: user.id, phone: user.phone, role: user.role, full_name: user.full_name },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ✅ Update profile (name + role)
app.post("/user/profile", async (req, res) => {
  try {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!token) return res.status(401).json({ ok: false, message: "Missing token" });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ ok: false, message: "Invalid token" });
    }

    const fullName = String(req.body?.full_name || "").trim().slice(0, 80);
    const role = String(req.body?.role || "").trim();

    if (role && role !== "buyer" && role !== "provider") {
      return res.status(400).json({ ok: false, message: "Invalid role" });
    }

    await pool.query(
      `UPDATE users SET full_name = COALESCE(NULLIF(?, ''), full_name), role = COALESCE(NULLIF(?, ''), role) WHERE id = ?`,
      [fullName, role, payload.uid]
    );

    const [rows] = await pool.query(`SELECT id, phone, role, full_name FROM users WHERE id = ? LIMIT 1`, [payload.uid]);
    return res.json({ ok: true, user: rows[0] });
  } catch (e) {
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// =====================
// ✅ Boot
// =====================
(async () => {
  await migrate();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on ${PORT}`);
  });
})().catch((e) => {
  console.error("Boot failed:", e.message || e);
  process.exit(1);
});
