const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const { initDb } = require("./scripts/init-db");

const app = express();

/**
 * ✅ CORS FIX (GitHub Pages + Mobile Web)
 * - Allow all origins for now (development)
 * - Handle preflight automatically
 */
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);
app.options("*", cors());

app.use(express.json({ limit: "15mb" }));

const PORT = process.env.PORT || 3000;

function getMysqlConfig() {
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL;

  const host = process.env.MYSQLHOST || process.env.DB_HOST;
  const user = process.env.MYSQLUSER || process.env.DB_USER;
  const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD;
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME;
  const port = Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306);

  if (!host || !user || !password || !database) return null;
  return { host, user, password, database, port };
}

let pool = null;

async function connectDb() {
  const cfg = getMysqlConfig();
  if (!cfg) {
    console.log("⚠️ MySQL env vars missing. DB will NOT be used.");
    return;
  }

  pool = mysql.createPool(
    typeof cfg === "string"
      ? cfg
      : { ...cfg, waitForConnections: true, connectionLimit: 10, enableKeepAlive: true }
  );

  await pool.query("SELECT 1");
  console.log("✅ MySQL connected");
}

app.get("/", (req, res) => res.json({ success: true, message: "PremiumChat Backend is running" }));

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

    const [u] = await pool.query("SELECT id, phone, role FROM users WHERE phone = ? LIMIT 1", [phone]);
    res.json({ success: true, message: "OTP verified", user: u[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

app.post("/profile/save", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ success: false, message: "DB not configured" });

    const phone = String(req.body?.phone || "").trim();
    const role = String(req.body?.role || "").trim(); // buyer/provider
    const name = req.body?.name ? String(req.body.name).trim() : null;

    const avatarBase64 = req.body?.avatar_base64 ? String(req.body.avatar_base64) : null;
    const cnicFrontBase64 = req.body?.cnic_front_base64 ? String(req.body.cnic_front_base64) : null;
    const cnicBackBase64 = req.body?.cnic_back_base64 ? String(req.body.cnic_back_base64) : null;
    const selfieBase64 = req.body?.selfie_base64 ? String(req.body.selfie_base64) : null;

    if (!phone) return res.status(400).json({ success: false, message: "phone required" });
    if (role !== "buyer" && role !== "provider") {
      return res.status(400).json({ success: false, message: "role must be buyer/provider" });
    }

    await pool.query(
      "INSERT INTO users (phone, role) VALUES (?, ?) ON DUPLICATE KEY UPDATE role=VALUES(role)",
      [phone, role]
    );

    const [u] = await pool.query("SELECT id FROM users WHERE phone = ? LIMIT 1", [phone]);
    const userId = u[0].id;

    if (role === "buyer") {
      await pool.query(
        `
        INSERT INTO buyer_profiles (user_id, name, avatar_base64)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name=VALUES(name),
          avatar_base64=VALUES(avatar_base64)
        `,
        [userId, name, avatarBase64]
      );
      return res.json({ success: true, message: "Buyer profile saved", user_id: userId });
    }

    if (!cnicFrontBase64 || !cnicBackBase64 || !selfieBase64) {
      return res.status(400).json({
        success: false,
        message: "provider requires cnic_front_base64, cnic_back_base64, selfie_base64",
      });
    }

    await pool.query(
      `
      INSERT INTO provider_profiles (user_id, name, avatar_base64, cnic_front_base64, cnic_back_base64, selfie_base64, verification_status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
      ON DUPLICATE KEY UPDATE
        name=VALUES(name),
        avatar_base64=VALUES(avatar_base64),
        cnic_front_base64=VALUES(cnic_front_base64),
        cnic_back_base64=VALUES(cnic_back_base64),
        selfie_base64=VALUES(selfie_base64),
        verification_status='pending'
      `,
      [userId, name, avatarBase64, cnicFrontBase64, cnicBackBase64, selfieBase64]
    );

    res.json({ success: true, message: "Provider profile saved (pending)", user_id: userId });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

app.get("/me", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ success: false, message: "DB not configured" });
    const phone = String(req.query?.phone || "").trim();
    if (!phone) return res.status(400).json({ success: false, message: "phone query required" });

    const [u] = await pool.query("SELECT id, phone, role FROM users WHERE phone=? LIMIT 1", [phone]);
    if (!u.length) return res.status(404).json({ success: false, message: "user not found" });

    const user = u[0];

    if (user.role === "buyer") {
      const [p] = await pool.query(
        "SELECT name, avatar_base64, updated_at FROM buyer_profiles WHERE user_id=? LIMIT 1",
        [user.id]
      );
      return res.json({ success: true, user, profile: p[0] || null });
    } else {
      const [p] = await pool.query(
        "SELECT name, avatar_base64, verification_status, updated_at FROM provider_profiles WHERE user_id=? LIMIT 1",
        [user.id]
      );
      return res.json({ success: true, user, profile: p[0] || null });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

(async () => {
  try {
    await connectDb();
    await initDb();
  } catch (e) {
    console.log("❌ Startup error:", e?.message || e);
  }

  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
})();
