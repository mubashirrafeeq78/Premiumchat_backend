// sec/profile.routes.js
const express = require("express");
const { jsonError } = require("./utils");
const { requireAuth } = require("./middleware");
const { getPool } = require("./db");
const { config } = require("./config");

const router = express.Router();

/**
 * Base64 cleaner
 */
function cleanBase64(v, { maxLen = 8_000_000 } = {}) {
  let s = String(v || "").trim();
  if (!s) return "";

  const idx = s.indexOf("base64,");
  if (idx !== -1) s = s.substring(idx + "base64,".length).trim();

  if (s.length > maxLen) {
    const err = new Error("Image too large (compress more before upload)");
    err.code = "PAYLOAD_TOO_LARGE";
    throw err;
  }
  return s;
}

function providerInitialStatus() {
  const v = String(config.providerDefaultStatus || "submitted").toLowerCase();
  return v === "approved" ? "approved" : "pending";
}

// -------- SAVE PROFILE --------
router.post("/save", requireAuth, async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const phone = String(req.userPhone || "").trim();
    const name = String(req.body?.name || "").trim();
    const role = String(req.body?.role || "").trim();

    const profilePicBase64 = cleanBase64(req.body?.profilePicBase64 || req.body?.avatarBase64);
    const cnicFrontBase64 = cleanBase64(req.body?.cnicFrontBase64);
    const cnicBackBase64 = cleanBase64(req.body?.cnicBackBase64);
    const selfieBase64 = cleanBase64(req.body?.selfieBase64);

    if (!phone) return jsonError(res, 400, "Phone missing");
    if (!name) return jsonError(res, 400, "Name required");
    if (!["buyer", "provider"].includes(role)) return jsonError(res, 400, "Invalid role");

    await conn.beginTransaction();

    // ---------- BUYER ----------
    if (role === "buyer") {
      await conn.execute(
        `INSERT INTO buyers (phone, name, profile_pic_base64)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name=VALUES(name),
           profile_pic_base64=VALUES(profile_pic_base64)`,
        [phone, name, profilePicBase64 || null]
      );

      const [rows] = await conn.execute(
        `SELECT id, phone, name, profile_pic_base64 AS avatarBase64
         FROM buyers WHERE phone=? LIMIT 1`,
        [phone]
      );

      await conn.commit();
      return res.json({ success: true, role: "buyer", user: rows[0] });
    }

    // ---------- PROVIDER ----------
    if (!cnicFrontBase64 || !cnicBackBase64 || !selfieBase64) {
      return jsonError(res, 400, "Provider verification required");
    }

    const initStatus = providerInitialStatus();

    await conn.execute(
      `INSERT INTO providers (phone, name, profile_pic_base64, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name),
         profile_pic_base64=VALUES(profile_pic_base64),
         status=IF(status IN ('approved','rejected'), status, VALUES(status))`,
      [phone, name, profilePicBase64 || null, initStatus]
    );

    const [provRows] = await conn.execute(
      `SELECT id, phone, name, profile_pic_base64 AS avatarBase64, status
       FROM providers WHERE phone=? LIMIT 1`,
      [phone]
    );

    const provider = provRows[0];
    if (!provider) throw new Error("Provider save failed");

    await conn.execute(
      `INSERT INTO provider_documents
       (provider_id, cnic_front_base64, cnic_back_base64, selfie_base64)
       VALUES (?, ?, ?, ?)`,
      [provider.id, cnicFrontBase64, cnicBackBase64, selfieBase64]
    );

    await conn.commit();

    return res.json({
      success: true,
      role: "provider",
      status: provider.status === "approved" ? "approved" : "submitted",
      user: provider,
    });
  } catch (e) {
    await conn.rollback();
    if (e?.code === "PAYLOAD_TOO_LARGE") return jsonError(res, 413, e.message);
    return jsonError(res, 500, e.message || "Profile save failed");
  } finally {
    conn.release();
  }
});

// -------- GET CURRENT USER --------
router.get("/me", requireAuth, async (req, res) => {
  try {
    const phone = String(req.userPhone || "").trim();
    const pool = getPool();

    const [buyers] = await pool.execute(
      `SELECT id, phone, name, profile_pic_base64 AS avatarBase64
       FROM buyers WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (buyers.length) return res.json({ success: true, role: "buyer", user: buyers[0] });

    const [providers] = await pool.execute(
      `SELECT id, phone, name, profile_pic_base64 AS avatarBase64, status
       FROM providers WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (!providers.length) return jsonError(res, 404, "User not found");

    return res.json({ success: true, role: "provider", user: providers[0] });
  } catch (e) {
    return jsonError(res, 500, e.message || "Failed");
  }
});

module.exports = { profileRouter: router };
