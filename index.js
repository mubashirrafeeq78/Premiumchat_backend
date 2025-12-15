const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Temporary (demo) OTP store: restart پر data ختم ہو جائے گا
const otpStore = new Map(); // phone -> { otp, expiresAt }

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

app.get("/", (req, res) => res.send("Premium Chat API is running"));
app.get("/health", (req, res) => res.json({ ok: true, time: Date.now() }));

// Mobile Number Screen API
app.post("/auth/request-otp", (req, res) => {
  const phone = normalizePhone(req.body?.phone);

  if (!isValidPhone(phone)) {
    return res.status(400).json({ ok: false, message: "Invalid phone number" });
  }

  const otp = generateOtp();
  const expiresAt = Date.now() + 2 * 60 * 1000; // 2 minutes
  otpStore.set(phone, { otp, expiresAt });

  return res.json({ ok: true, message: "OTP generated (demo)", phone, otp, expiresAt });
});

// OTP Verification Screen API
app.post("/auth/verify-otp", (req, res) => {
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
  const token = `demo-token-${Date.now()}`;

  return res.json({ ok: true, message: "OTP verified", token });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`API running on http://127.0.0.1:${PORT}`);
});