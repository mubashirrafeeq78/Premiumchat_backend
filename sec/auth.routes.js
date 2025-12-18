// sec/auth.routes.js
const express = require("express");
const { jsonError, nowIso } = require("./utils");
const { config } = require("./config");

const router = express.Router();

// In-memory OTP store (demo/temporary)
// phone -> { otp, expiresAt, attempts, lastSentAt }
const otpStore = new Map();

function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function normalizePhone(input) {
  // digits only
  const digits = String(input || "").replace(/\D/g, "");
  // basic validation: 8-15 digits (international safe)
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

router.post("/request-otp", (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return jsonError(res, 400, "Valid phone required");

  const existing = otpStore.get(phone);
  const now = Date.now();

  // basic anti-spam: 20 sec cooldown
  if (existing?.lastSentAt && now - existing.lastSentAt < 20 * 1000) {
    return jsonError(res, 429, "Please wait before requesting OTP again");
  }

  const otp = genOtp();
  const expiresAt = now + 5 * 60 * 1000; // 5 min
  otpStore.set(phone, { otp, expiresAt, attempts: 0, lastSentAt: now });

  // Demo response includes otp only if allowDemoOtp=true
  const showOtp = config.allowDemoOtp === true;

  return res.json({
    success: true,
    message: "OTP sent",
    phone,
    ...(showOtp ? { otp } : {}),
    time: nowIso(),
  });
});

router.post("/verify-otp", (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const otp = String(req.body?.otp || "").trim();

  if (!phone) return jsonError(res, 400, "Valid phone required");
  if (!otp) return jsonError(res, 400, "OTP required");

  const record = otpStore.get(phone);
  if (!record) return jsonError(res, 400, "OTP not requested");
  if (Date.now() > record.expiresAt) return jsonError(res, 400, "OTP expired");

  // attempts limit
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts > 8) {
    otpStore.delete(phone);
    return jsonError(res, 429, "Too many attempts. Request OTP again.");
  }

  if (otp !== record.otp) return jsonError(res, 400, "Invalid OTP");

  // OTP used -> remove it
  otpStore.delete(phone);

  // token (demo) — middleware/requireAuth اسی format پر چل رہا ہوگا
  const token = `phone:${phone}`;

  return res.json({
    success: true,
    message: "OTP verified",
    token,
    // user data DB سے /profile/me سے آئے گا
    user: { phone },
  });
});

module.exports = { authRouter: router };
