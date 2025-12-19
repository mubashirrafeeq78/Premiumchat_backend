const express = require("express");
const { jsonError, nowIso } = require("./utils");
const { query } = require("./db");
const { config } = require("./config");

const router = express.Router();

function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

router.post("/request-otp", async (req, res) => {
  try {
    const phone = String(req.body?.phone || "").trim();
    if (!phone) return jsonError(res, 400, "Phone required");

    const otp = genOtp();

    // ✅ DATETIME expiry (5 minutes from now)
    await query(
      `INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
      [phone, otp]
    );

    const showOtp = config.allowDemoOtp === true;

    return res.json({
      success: true,
      message: "OTP sent",
      phone,
      ...(showOtp ? { otp } : {}),
      time: nowIso(),
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const phone = String(req.body?.phone || "").trim();
    const otp = String(req.body?.otp || "").trim();
    if (!phone) return jsonError(res, 400, "Phone required");
    if (!otp) return jsonError(res, 400, "OTP required");

    const rows = await query(
      `SELECT id, code, expires_at, used_at
       FROM otp_codes
       WHERE phone=?
       ORDER BY id DESC
       LIMIT 1`,
      [phone]
    );

    const rec = rows?.[0];
    if (!rec) return jsonError(res, 400, "OTP not requested");
    if (rec.used_at) return jsonError(res, 400, "OTP already used");

    // ✅ expires_at is DATETIME
    if (new Date(rec.expires_at).getTime() < Date.now()) {
      return jsonError(res, 400, "OTP expired");
    }

    if (String(rec.code) !== otp) return jsonError(res, 400, "Invalid OTP");

    await query(`UPDATE otp_codes SET used_at=NOW() WHERE id=?`, [rec.id]);

    await query(
      `INSERT INTO users (phone, role, name)
       VALUES (?, 'buyer', '')
       ON DUPLICATE KEY UPDATE phone=VALUES(phone)`,
      [phone]
    );

    const me = await query(
      `SELECT id, phone, role, name, avatar_base64 AS avatarBase64, created_at, updated_at
       FROM users WHERE phone=? LIMIT 1`,
      [phone]
    );

    const token = `phone:${phone}`;

    return res.json({
      success: true,
      message: "OTP verified",
      token,
      user: me?.[0] || null,
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

module.exports = { authRouter: router };
