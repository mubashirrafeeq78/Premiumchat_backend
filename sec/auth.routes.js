// sec/auth.routes.js
const express = require("express");
const crypto = require("crypto");
const { jsonError, nowIso } = require("./utils");
const { query } = require("./db");
const { config } = require("./config");

const router = express.Router();

// ✅ 1 minute OTP expiry (آپ کی requirement)
const OTP_TTL_SECONDS = 60;

// ✅ Secret for hashing (اگر ENV نہ ہو تو fallback)
// NOTE: production میں لازمی ENV میں set کریں
const OTP_SECRET = process.env.OTP_SECRET || "change-this-secret";

// 6 digits OTP
function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// hash( phone + otp + secret )  => store in DB, never store plain OTP
function hashOtp(phone, otp) {
  const s = `${phone}|${otp}|${OTP_SECRET}`;
  return crypto.createHash("sha256").update(s).digest("hex");
}

// basic phone normalize/validation (زیادہ سخت نہیں رکھا)
function normalizePhone(input) {
  const phone = String(input || "").trim();
  if (!phone) return "";
  if (phone.length > 20) return "__invalid__";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "__invalid__";
  return digits; // store digits-only
}

// ---------------- REQUEST OTP ----------------
router.post("/request-otp", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return jsonError(res, 400, "Phone required");
    if (phone === "__invalid__") return jsonError(res, 400, "Invalid phone");

    const otp = genOtp();
    const otpHash = hashOtp(phone, otp);

    // ✅ one active OTP per phone (requires UNIQUE KEY on phone)
    await query(
      `
      INSERT INTO otp_codes (phone, otp_hash, created_at, expires_at)
      VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND))
      ON DUPLICATE KEY UPDATE
        otp_hash = VALUES(otp_hash),
        created_at = VALUES(created_at),
        expires_at = VALUES(expires_at)
      `,
      [phone, otpHash, OTP_TTL_SECONDS]
    );

    return res.json({
      success: true,
      message: "OTP sent",
      phone,
      ...(config.allowDemoOtp ? { otp } : {}), // demo only
      expiresInSec: OTP_TTL_SECONDS,
      time: nowIso(),
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

// ---------------- VERIFY OTP ----------------
router.post("/verify-otp", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || "").trim();

    if (!phone) return jsonError(res, 400, "Phone required");
    if (phone === "__invalid__") return jsonError(res, 400, "Invalid phone");
    if (!otp) return jsonError(res, 400, "OTP required");

    const rows = await query(
      `
      SELECT otp_hash, expires_at
      FROM otp_codes
      WHERE phone=?
      LIMIT 1
      `,
      [phone]
    );

    const rec = rows?.[0];
    if (!rec) return jsonError(res, 400, "OTP not requested");

    const expMs = new Date(rec.expires_at).getTime();
    if (!Number.isFinite(expMs) || expMs < Date.now()) {
      return jsonError(res, 400, "OTP expired");
    }

    const expectedHash = hashOtp(phone, otp);
    if (String(rec.otp_hash) !== expectedHash) {
      return jsonError(res, 400, "Invalid OTP");
    }

    // ✅ consume OTP
    await query(`DELETE FROM otp_codes WHERE phone=? LIMIT 1`, [phone]);

    // demo token (آپ کا existing flow)
    const token = `phone:${phone}`;

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
