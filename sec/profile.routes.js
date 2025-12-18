// sec/profile.routes.js
const express = require("express");
const { jsonError } = require("./utils");
const { requireAuth } = require("./middleware");
const { query } = require("./db");
const { config } = require("./config");

const router = express.Router();

/**
 * Base64 cleaner:
 * - accepts empty
 * - strips "data:image/...;base64," prefix if present
 * - basic payload guard (avoid huge server load)
 */
function cleanBase64(v, { maxLen = 8_000_000 } = {}) {
  let s = String(v || "").trim();
  if (!s) return "";

  // strip data url prefix if user sends it
  const idx = s.indexOf("base64,");
  if (idx !== -1) s = s.substring(idx + "base64,".length).trim();

  // basic size guard
  if (s.length > maxLen) {
    const err = new Error("Image too large (compress more before upload)");
    err.code = "PAYLOAD_TOO_LARGE";
    throw err;
  }
  return s;
}

// config.providerDefaultStatus supports: submitted|approved
function providerInitialStatus() {
  const v = String(config.providerDefaultStatus || "submitted").toLowerCase();
  // DB enum is pending/approved/rejected => submitted maps to pending
  if (v === "approved") return "approved";
  return "pending";
}

// -------- SAVE PROFILE --------
router.post("/save", requireAuth, async (req, res) => {
  try {
    const phone = String(req.userPhone || "").trim();

    const name = String(req.body?.name || "").trim();
    const role = String(req.body?.role || "").trim(); // buyer/provider

    const profilePicBase64 = cleanBase64(req.body?.profilePicBase64 || req.body?.avatarBase64);

    const cnicFrontBase64 = cleanBase64(req.body?.cnicFrontBase64);
    const cnicBackBase64 = cleanBase64(req.body?.cnicBackBase64);
    const selfieBase64 = cleanBase64(req.body?.selfieBase64);

    if (!phone) return jsonError(res, 400, "Phone missing (token)");
    if (!name) return jsonError(res, 400, "Name required");
    if (!role || !["buyer", "provider"].includes(role)) return jsonError(res, 400, "Invalid role");

    // ---------- BUYER ----------
    if (role === "buyer") {
      await query(
        `INSERT INTO buyers (phone, name, profile_pic_base64)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name=VALUES(name),
           profile_pic_base64=VALUES(profile_pic_base64)`,
        [phone, name, profilePicBase64 || null]
      );

      const rows = await query(
        `SELECT id, phone, name, profile_pic_base64 AS avatarBase64, created_at, updated_at
         FROM buyers WHERE phone=? LIMIT 1`,
        [phone]
      );

      return res.json({
        success: true,
        message: "Buyer profile saved",
        role: "buyer",
        user: rows?.[0] || null,
      });
    }

    // ---------- PROVIDER ----------
    // Provider requires docs (as per your UI/design)
    if (!cnicFrontBase64 || !cnicBackBase64 || !selfieBase64) {
      return jsonError(res, 400, "Provider verification required (CNIC front/back + selfie)");
    }

    const initStatus = providerInitialStatus();

    // Upsert provider (keep existing status if already approved/rejected)
    // NOTE: We do NOT overwrite status to pending every time.
    await query(
      `INSERT INTO providers (phone, name, profile_pic_base64, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name),
         profile_pic_base64=VALUES(profile_pic_base64),
         status=IF(status IN ('approved','rejected'), status, VALUES(status))`,
      [phone, name, profilePicBase64 || null, initStatus]
    );

    const provRows = await query(
      `SELECT id, phone, name, profile_pic_base64 AS avatarBase64, status, created_at, updated_at
       FROM providers WHERE phone=? LIMIT 1`,
      [phone]
    );

    const provider = provRows?.[0];
    if (!provider) return jsonError(res, 500, "Provider save failed");

    // Insert a new documents row (latest submission kept)
    await query(
      `INSERT INTO provider_documents (provider_id, cnic_front_base64, cnic_back_base64, selfie_base64)
       VALUES (?, ?, ?, ?)`,
      [provider.id, cnicFrontBase64, cnicBackBase64, selfieBase64]
    );

    // For frontend popup:
    // - if status approved => show approved popup
    // - else => show submitted popup
    const statusForUi = provider.status === "approved" ? "approved" : "submitted";

    return res.json({
      success: true,
      message: provider.status === "approved" ? "Provider approved" : "Provider submitted for review",
      role: "provider",
      status: statusForUi,
      user: provider, // keep "user" key for frontend compatibility
    });
  } catch (e) {
    // Friendly errors
    const msg = String(e?.message || e);

    if (e?.code === "DB_ENV_MISSING") return jsonError(res, 500, msg);
    if (e?.code === "PAYLOAD_TOO_LARGE") return jsonError(res, 413, msg);

    return jsonError(res, 500, msg);
  }
});

// -------- GET CURRENT USER --------
router.get("/me", requireAuth, async (req, res) => {
  try {
    const phone = String(req.userPhone || "").trim();
    if (!phone) return jsonError(res, 400, "Phone missing (token)");

    // buyer?
    const bRows = await query(
      `SELECT id, phone, name, profile_pic_base64 AS avatarBase64, created_at, updated_at
       FROM buyers WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (bRows?.length) {
      return res.json({ success: true, role: "buyer", user: bRows[0] });
    }

    // provider?
    const pRows = await query(
      `SELECT id, phone, name, profile_pic_base64 AS avatarBase64, status, created_at, updated_at
       FROM providers WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (!pRows?.length) return jsonError(res, 404, "User not found");

    const provider = pRows[0];

    const dRows = await query(
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
      user: provider,
      latest_documents: dRows?.[0] || null,
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

module.exports = { profileRouter: router };
