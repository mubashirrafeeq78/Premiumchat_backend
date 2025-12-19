// sec/profile.routes.js
const express = require("express");
const { jsonError } = require("./utils");
const { requireAuth } = require("./middleware");
const { query } = require("./db");
const { config } = require("./config");

const router = express.Router();

// ---- base64 cleaner ----
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

// ---- AUTO MIGRATION (fix unknown column issues) ----
let _schemaChecked = false;

async function columnExists(table, column) {
  const rows = await query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function addColumnIfMissing(table, column, ddl) {
  const exists = await columnExists(table, column);
  if (!exists) {
    await query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  }
}

async function ensureProfileColumns() {
  if (_schemaChecked) return;
  try {
    // buyers/providers tables must have avatar_base64
    await addColumnIfMissing("buyers", "avatar_base64", "`avatar_base64` LONGTEXT NULL");
    await addColumnIfMissing("providers", "avatar_base64", "`avatar_base64` LONGTEXT NULL");
  } catch (_) {
    // ignore here; actual query will surface real error if tables missing
  } finally {
    _schemaChecked = true;
  }
}

// ---- SAVE PROFILE ----
router.post("/save", requireAuth, async (req, res) => {
  try {
    await ensureProfileColumns(); // ✅ auto-fix column missing

    const phone = String(req.userPhone || "").trim();
    const name = String(req.body?.name || "").trim();
    const role = String(req.body?.role || "").trim();

    const avatarBase64 = cleanBase64(req.body?.profilePicBase64 || req.body?.avatarBase64);
    const cnicFrontBase64 = cleanBase64(req.body?.cnicFrontBase64);
    const cnicBackBase64 = cleanBase64(req.body?.cnicBackBase64);
    const selfieBase64 = cleanBase64(req.body?.selfieBase64);

    if (!phone) return jsonError(res, 400, "Phone missing (token)");
    if (!name) return jsonError(res, 400, "Name required");
    if (!role || !["buyer", "provider"].includes(role)) return jsonError(res, 400, "Invalid role");

    if (role === "buyer") {
      await query(
        `INSERT INTO buyers (phone, name, avatar_base64)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name=VALUES(name),
           avatar_base64=VALUES(avatar_base64)`,
        [phone, name, avatarBase64 || null]
      );

      const rows = await query(
        `SELECT id, phone, name, avatar_base64 AS avatarBase64, created_at, updated_at
         FROM buyers WHERE phone=? LIMIT 1`,
        [phone]
      );

      return res.json({ success: true, role: "buyer", user: rows?.[0] || null });
    }

    // provider
    if (!cnicFrontBase64 || !cnicBackBase64 || !selfieBase64) {
      return jsonError(res, 400, "Provider verification required (CNIC front/back + selfie)");
    }

    const initStatus = providerInitialStatus();

    await query(
      `INSERT INTO providers (phone, name, avatar_base64, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name),
         avatar_base64=VALUES(avatar_base64),
         status=IF(status IN ('approved','rejected'), status, VALUES(status))`,
      [phone, name, avatarBase64 || null, initStatus]
    );

    const provRows = await query(
      `SELECT id, phone, name, avatar_base64 AS avatarBase64, status, created_at, updated_at
       FROM providers WHERE phone=? LIMIT 1`,
      [phone]
    );

    const provider = provRows?.[0];
    if (!provider) return jsonError(res, 500, "Provider save failed");

    await query(
      `INSERT INTO provider_documents (provider_id, cnic_front_base64, cnic_back_base64, selfie_base64)
       VALUES (?, ?, ?, ?)`,
      [provider.id, cnicFrontBase64, cnicBackBase64, selfieBase64]
    );

    return res.json({
      success: true,
      role: "provider",
      status: provider.status === "approved" ? "approved" : "submitted",
      user: provider,
    });
  } catch (e) {
    if (e?.code === "PAYLOAD_TOO_LARGE") return jsonError(res, 413, e.message);
    return jsonError(res, 500, String(e?.message || e));
  }
});

// ---- GET ME ----
router.get("/me", requireAuth, async (req, res) => {
  try {
    await ensureProfileColumns();

    const phone = String(req.userPhone || "").trim();
    if (!phone) return jsonError(res, 400, "Phone missing (token)");

    const bRows = await query(
      `SELECT id, phone, name, avatar_base64 AS avatarBase64, created_at, updated_at
       FROM buyers WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (bRows?.length) return res.json({ success: true, role: "buyer", user: bRows[0] });

    const pRows = await query(
      `SELECT id, phone, name, avatar_base64 AS avatarBase64, status, created_at, updated_at
       FROM providers WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (!pRows?.length) return jsonError(res, 404, "User not found");

    return res.json({ success: true, role: "provider", user: pRows[0] });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

module.exports = { profileRouter: router };
