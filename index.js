// index.js  — Premiumchat Backend (Provider Profile Save)
// ---------------------------------------------
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import mysql from "mysql2/promise";

const app = express();

// JSON body limit بڑھایا تاکہ base64 images آسکیں
app.use(cors());
app.use(bodyParser.json({ limit: "20mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "20mb" }));

// ---- MySQL Pool (اپنے env کے مطابق بدل لیں) ----
const pool = await mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "premiumchat",
  waitForConnections: true,
  connectionLimit: 10,
});

// ---------- Health ----------
app.get("/", (_req, res) => res.json({ ok: true, service: "premiumchat-backend" }));

// ---------- OTP (placeholders; اگر آپ کے پاس پہلے سے ہیں تو وہی رکھیں) ----------
app.post("/auth/request-otp", async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ success: false, message: "phone required" });
  // TODO: اپنے OTP سسٹم سے جوڑیں
  return res.json({ success: true, message: "OTP sent (stub)" });
});

app.post("/auth/verify-otp", async (req, res) => {
  const { phone, code } = req.body || {};
  if (!phone || !code) return res.status(400).json({ success: false, message: "phone & code required" });
  // TODO: verify
  return res.json({ success: true, message: "OTP verified (stub)" });
});

// ---------- Provider Profile Save ----------
app.post("/provider/profile", async (req, res) => {
  try {
    const {
      phone,
      name,
      role, // "provider"
      profileImageBase64,
      cnicFrontBase64,
      cnicBackBase64,
    } = req.body || {};

    if (!phone) return res.status(400).json({ success: false, message: "phone required" });
    if (!role || role !== "provider") {
      return res.status(400).json({ success: false, message: "role must be 'provider'" });
    }

    // کچھ basic سائز چیکس (اپنی ضرورت کے مطابق)
    const tooBig = (s) => (s ? s.length > 5_000_000 : false); // ~5MB base64
    if (tooBig(profileImageBase64) || tooBig(cnicFrontBase64) || tooBig(cnicBackBase64)) {
      return res.status(413).json({ success: false, message: "Image too large" });
    }

    // Upsert provider row
    const sql = `
      INSERT INTO providers (phone, name, role, profile_image_b64, cnic_front_b64, cnic_back_b64, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        role = VALUES(role),
        profile_image_b64 = VALUES(profile_image_b64),
        cnic_front_b64 = VALUES(cnic_front_b64),
        cnic_back_b64 = VALUES(cnic_back_b64),
        updated_at = NOW()
    `;
    await pool.query(sql, [
      phone,
      name || null,
      role,
      profileImageBase64 || null,
      cnicFrontBase64 || null,
      cnicBackBase64 || null,
    ]);

    return res.json({ success: true, message: "Provider profile saved" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
});

// ---------- Current user fetch ----------
app.get("/me", async (req, res) => {
  try {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ success: false, message: "phone required" });

    const [rows] = await pool.query(
      "SELECT phone, name, role, profile_image_b64, cnic_front_b64, cnic_back_b64, updated_at FROM providers WHERE phone = ? LIMIT 1",
      [phone]
    );

    const user = rows?.[0] || null;
    return res.json({ success: true, user });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
});

// ---------- 404 to JSON ----------
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ---------- Start ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Premiumchat backend running on :${PORT}`));
