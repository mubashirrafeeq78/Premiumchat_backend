// sec/auth.routes.js
const express = require("express");
const crypto = require("crypto");
const { jsonError, nowIso } = require("./utils");
const { query } = require("./db");
const { config } = require("./config");

const router = express.Router();

function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

function normalizePhone(v) {
  // simple: trim + keep digits only
  return String(v || "").trim().replace(/\D/g, "");
}

function otpHash(phone, otp) {
  // IMPORTANT: change this secret in production (env var recommended)
  const secret = String(config.otpSecret || process.env.OTP_SECRET || "change-me-otp-secret");
  return crypto.createHash("sha256").update(`${phone}|${otp}|${secret}`).digest("hex");
}

// ------------------ REQUEST OTP ------------------
router.post("/request-otp", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return jsonError(res, 400, "Phone required");

    const otp = genOtp();
    const hash = otpHash(phone, otp);

    // ✅ one active OTP per phone (delete old then insert new)
    await query(`DELETE FROM otp_verification WHERE phone=?`, [phone]);

    await query(
      `INSERT INTO otp_verification (phone, otp_hash, created_at, expires_at)
       VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 MINUTE))`,
      [phone, hash]
    );

    return res.json({
      success: true,
      message: "OTP sent",
      phone,
      ...(config.allowDemoOtp ? { otp } : {}), // demo only
      time: nowIso(),
      expiresInSec: 60,
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

// ------------------ VERIFY OTP ------------------
router.post("/verify-otp", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || "").trim();

    if (!phone) return jsonError(res, 400, "Phone required");
    if (!otp) return jsonError(res, 400, "OTP required");

    const rows = await query(
      `SELECT otp_hash, expires_at
       FROM otp_verification
       WHERE phone=?
       ORDER BY id DESC
       LIMIT 1`,
      [phone]
    );

    const rec = rows?.[0];
    if (!rec) return jsonError(res, 400, "OTP not requested");

    if (new Date(rec.expires_at).getTime() < Date.now()) {
      return jsonError(res, 400, "OTP expired");
    }

    const hash = otpHash(phone, otp);
    if (String(rec.otp_hash) !== hash) return jsonError(res, 400, "Invalid OTP");

    // ✅ OTP used => delete
    await query(`DELETE FROM otp_verification WHERE phone=?`, [phone]);

    const token = `phone:${phone}`; // your existing demo token format

    return res.json({
      success: true,
      message: "OTP verified",
      token,
      user: { phone },
      time: nowIso(),
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

module.exports = { authRouter: router };
