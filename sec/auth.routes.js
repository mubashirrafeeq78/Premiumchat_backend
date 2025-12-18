const express = require("express");
const { jsonError, nowIso } = require("./utils");

const router = express.Router();

// In-memory stores (demo)
const otpStore = new Map();  // phone -> { otp, expiresAt }
const userStore = new Map(); // phone -> user object

function genOtp() {
  // demo: 6 digits
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.post("/request-otp", (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  if (!phone) return jsonError(res, 400, "Phone required");

  const otp = genOtp();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min
  otpStore.set(phone, { otp, expiresAt });

  // Demo response includes otp only if ALLOW_DEMO_OTP=1
  const showOtp = process.env.ALLOW_DEMO_OTP !== "0";

  return res.json({
    success: true,
    message: "OTP sent (demo)",
    phone,
    ...(showOtp ? { otp } : {}),
    time: nowIso()
  });
});

router.post("/verify-otp", (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  const otp = String(req.body?.otp || "").trim();

  if (!phone) return jsonError(res, 400, "Phone required");
  if (!otp) return jsonError(res, 400, "OTP required");

  const record = otpStore.get(phone);
  if (!record) return jsonError(res, 400, "OTP not requested");
  if (Date.now() > record.expiresAt) return jsonError(res, 400, "OTP expired");

  // Demo: accept correct otp
  if (otp !== record.otp) return jsonError(res, 400, "Invalid OTP");

  // create user placeholder if not exist
  if (!userStore.has(phone)) {
    userStore.set(phone, { phone, role: "", name: "", avatarBase64: "" });
  }

  // token (demo)
  const token = `phone:${phone}`;

  return res.json({
    success: true,
    message: "OTP verified",
    token,
    user: userStore.get(phone)
  });
});

module.exports = { authRouter: router, userStore };
