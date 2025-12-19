const express = require("express");
const { jsonError, nowIso } = require("./utils");
const { query } = require("./db");
const { config } = require("./config");

const router = express.Router();

function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.post("/request-otp", async (req, res) => {
  try {
    const phone = String(req.body?.phone || "").trim();
    if (!phone) return jsonError(res, 400, "Phone required");

    const otp = genOtp();

    await query(
      `INSERT INTO otp_codes (phone, code, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
      [phone, otp]
    );

    return res.json({
      success: true,
      message: "OTP sent",
      phone,
      ...(config.allowDemoOtp ? { otp } : {}),
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

    // ✅ id نہیں لیں گے (کیونکہ ٹیبل میں id نہیں ہے)
    const rows = await query(
      `SELECT code, expires_at
       FROM otp_codes
       WHERE phone=?
       ORDER BY expires_at DESC
       LIMIT 1`,
      [phone]
    );

    const rec = rows?.[0];
    if (!rec) return jsonError(res, 400, "OTP not requested");

    if (new Date(rec.expires_at).getTime() < Date.now()) {
      return jsonError(res, 400, "OTP expired");
    }

    if (String(rec.code) !== otp) return jsonError(res, 400, "Invalid OTP");

    // ✅ verify کے بعد OTP row delete کر دیں (used_at/id کی ضرورت نہیں)
    await query(`DELETE FROM otp_codes WHERE phone=? AND code=? LIMIT 1`, [phone, otp]);

    const token = `phone:${phone}`;

    return res.json({
      success: true,
      message: "OTP verified",
      token,
      user: { phone },
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

module.exports = { authRouter: router };
