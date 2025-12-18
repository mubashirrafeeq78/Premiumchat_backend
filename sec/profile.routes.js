const express = require("express");
const mysql = require("mysql2/promise");
const { jsonError } = require("./utils");
const { requireAuth } = require("./middleware");

const router = express.Router();

// -------- DB POOL (self-contained) --------
let pool;
function getPool() {
  if (pool) return pool;

  const host = process.env.MYSQLHOST || process.env.DB_HOST;
  const port = Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306);
  const user = process.env.MYSQLUSER || process.env.DB_USER;
  const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD;
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME;

  if (!host || !user || !database) {
    throw new Error("DB env missing: MYSQLHOST, MYSQLUSER, MYSQLDATABASE (and MYSQLPASSWORD if set)");
  }

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return pool;
}

function cleanBase64(v) {
  const s = String(v || "").trim();
  // allow empty
  if (!s) return "";
  // basic protection (very large payloads)
  if (s.length > 8_000_000) throw new Error("Image too large");
  return s;
}

// -------- SAVE PROFILE --------
router.post("/save", requireAuth, async (req, res) => {
  try {
    const phone = String(req.userPhone || "").trim();

    const name = String(req.body?.name || "").trim();
    const role = String(req.body?.role || "").trim(); // buyer/provider

    // profile pic
    const profilePicBase64 = cleanBase64(req.body?.profilePicBase64 || req.body?.avatarBase64);

    // provider docs
    const cnicFrontBase64 = cleanBase64(req.body?.cnicFrontBase64);
    const cnicBackBase64 = cleanBase64(req.body?.cnicBackBase64);
    const selfieBase64 = cleanBase64(req.body?.selfieBase64);

    if (!phone) return jsonError(res, 400, "Phone missing (token)");
    if (!name) return jsonError(res, 400, "Name required");
    if (!role || !["buyer", "provider"].includes(role)) return jsonError(res, 400, "Invalid role");

    const p = getPool();

    if (role === "buyer") {
      // Upsert buyer
      await p.query(
        `INSERT INTO buyers (phone, name, profile_pic_base64)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name=VALUES(name),
           profile_pic_base64=VALUES(profile_pic_base64)`,
        [phone, name, profilePicBase64 || null]
      );

      const [rows] = await p.query(
        `SELECT id, phone, name, profile_pic_base64, created_at, updated_at
         FROM buyers WHERE phone=? LIMIT 1`,
        [phone]
      );

      return res.json({
        success: true,
        message: "Buyer profile saved",
        role: "buyer",
        user: rows[0] || null,
      });
    }

    // role === provider
    // Minimal rule: provider docs required (as per your design)
    if (!cnicFrontBase64 || !cnicBackBase64 || !selfieBase64) {
      return jsonError(res, 400, "Provider verification required (CNIC front/back + selfie)");
    }

    // Upsert provider
    await p.query(
      `INSERT INTO providers (phone, name, profile_pic_base64, status)
       VALUES (?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         name=VALUES(name),
         profile_pic_base64=VALUES(profile_pic_base64)`,
      [phone, name, profilePicBase64 || null]
    );

    // get provider id
    const [provRows] = await p.query(`SELECT id, phone, name, profile_pic_base64, status FROM providers WHERE phone=? LIMIT 1`, [phone]);
    const provider = provRows[0];
    if (!provider) return jsonError(res, 500, "Provider save failed");

    // Insert documents (new submission each time)
    await p.query(
      `INSERT INTO provider_documents (provider_id, cnic_front_base64, cnic_back_base64, selfie_base64)
       VALUES (?, ?, ?, ?)`,
      [provider.id, cnicFrontBase64, cnicBackBase64, selfieBase64]
    );

    return res.json({
      success: true,
      message: "Provider submitted for review",
      role: "provider",
      provider,
      status: provider.status, // pending by default
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

// -------- GET CURRENT USER (buyer/provider) --------
router.get("/me", requireAuth, async (req, res) => {
  try {
    const phone = String(req.userPhone || "").trim();
    if (!phone) return jsonError(res, 400, "Phone missing (token)");

    const p = getPool();

    // Try buyer first
    const [bRows] = await p.query(
      `SELECT id, phone, name, profile_pic_base64, created_at, updated_at
       FROM buyers WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (bRows.length) {
      return res.json({ success: true, role: "buyer", user: bRows[0] });
    }

    // Then provider
    const [pRows] = await p.query(
      `SELECT id, phone, name, profile_pic_base64, status, created_at, updated_at
       FROM providers WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (!pRows.length) return jsonError(res, 404, "User not found");

    const provider = pRows[0];

    // latest docs (optional to return)
    const [dRows] = await p.query(
      `SELECT id, submitted_at
       FROM provider_documents
       WHERE provider_id=?
       ORDER BY id DESC
       LIMIT 1`,
      [provider.id]
    );

    return res.json({
      success: true,
      role: "provider",
      provider,
      latest_documents: dRows[0] || null,
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

module.exports = { profileRouter: router };
