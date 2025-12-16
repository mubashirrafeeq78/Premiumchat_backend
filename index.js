const express = require("express");
const cors = require("cors");

const app = express();

// ✅ CORS for GitHub Pages / Flutter Web
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);

app.options("*", cors());
app.use(express.json());

// Demo in-memory OTP store (server restart پر ختم ہو جائے گا)
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

// ✅ Root + health
app.get("/", (req, res) => {
  res.json({ success: true, message: "PremiumChat Backend is running" });
});
app.get("/health", (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

// ✅ Request OTP
app.post("/auth/request-otp", (req, res) => {
  const phone = normalizePhone(req.body?.phone);

  if (!isValidPhone(phone)) {
    return res.status(400).json({ ok: false, message: "Invalid phone number" });
  }

  const otp = generateOtp();
  const expiresAt = Date.now() + 2 * 60 * 1000; // 2 minutes
  otpStore.set(phone, { otp, expiresAt });

  // Demo response (SMS نہیں جا رہا، صرف demo ہے)
  return res.json({
    ok: true,
    message: "OTP generated (demo)",
    phone,
    otp,
    expiresAt,
  });
});

// ✅ Verify OTP
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

// ✅ Railway uses PORT env
const PORT = process.env.PORT || 3000;

// ✅ MUST listen on 0.0.0.0 in hosting (Railway)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
});
