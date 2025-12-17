const express = require("express");
const cors = require("cors");
const { initDbAndTables } = require("./scripts/init-db");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

let pool = null;

app.get("/", (req, res) => {
  res.json({ success: true, message: "PremiumChat Backend is running" });
});

app.get("/db/health", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, message: "DB not configured" });
    await pool.query("SELECT 1");
    res.json({ ok: true, message: "DB connected" });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e?.message || e) });
  }
});

app.post("/auth/request-otp", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

  const code = "123456";
  const expiresMinutes = 5;

  try {
    if (!pool) return res.status(500).json({ success: false, message: "DB not configured" });

    await pool.query("DELETE FROM otp_codes WHERE phone = ?", [phone]);
    await pool.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))",
      [phone, code, expiresMinutes]
    );

    res.json({ success: true, message: "OTP generated (demo: 123456)" });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

app.post("/auth/verify-otp", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  const otp = String(req.body?.otp || "").trim();
  if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone and otp required" });

  try {
    if (!pool) return res.status(500).json({ success: false, message: "DB not configured" });

    const [rows] = await pool.query(
      "SELECT code, expires_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1",
      [phone]
    );

    if (!rows.length) return res.status(400).json({ success: false, message: "OTP not found" });
    const row = rows[0];

    if (row.code !== otp) return res.status(400).json({ success: false, message: "Invalid OTP" });

    const [expCheck] = await pool.query("SELECT NOW() <= ? AS ok", [row.expires_at]);
    if (!expCheck[0].ok) return res.status(400).json({ success: false, message: "OTP expired" });

    await pool.query(
      "INSERT INTO users (phone, role) VALUES (?, 'buyer') ON DUPLICATE KEY UPDATE phone=VALUES(phone)",
      [phone]
    );

    res.json({ success: true, message: "OTP verified", phone });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

(async () => {
  try {
    pool = await initDbAndTables();
  } catch (e) {
    console.log("❌ Startup error:", e?.message || e);
  }

  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
})();
