const express = require("express");
const { jsonError } = require("./utils");
const { requireAuth } = require("./middleware");
const { getPool } = require("./db");
const { config } = require("./config");

const router = express.Router();

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

router.post("/save", requireAuth, async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const phone = String(req.userPhone || "").trim();
    const name = String(req.body?.name || "").trim();
    const role = String(req.body?.role || "").trim(); // buyer/provider

    const avatarBase64 = cleanBase64(req.body?.profilePicBase64 || req.body?.avatarBase64);
    const cnicFrontBase64 = cleanBase64(req.body?.cnicFrontBase64);
    const cnicBackBase64 = cleanBase64(req.body?.cnicBackBase64);
    const selfieBase64 = cleanBase64(req.body?.selfieBase64);

    if (!phone) return jsonError(res, 400, "Phone missing (token)");
    if (!name) return jsonError(res, 400, "Name required");
    if (!["buyer", "provider"].includes(role)) return jsonError(res, 400, "Invalid role");

    await conn.beginTransaction();

    // upsert in users
    await conn.execute(
      `INSERT INTO users (phone, role, name, avatar_base64)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         role=VALUES(role),
         name=VALUES(name),
         avatar_base64=VALUES(avatar_base64)`,
      [phone, role, name, avatarBase64 || null]
    );

    const [uRows] = await conn.execute(
      `SELECT id, phone, role, name, avatar_base64 AS avatarBase64, created_at, updated_at
       FROM users WHERE phone=? LIMIT 1`,
      [phone]
    );
    const user = uRows?.[0];
    if (!user) throw new Error("User upsert failed");

    if (role === "buyer") {
      // ensure buyer profile row exists (extra fields later)
      await conn.execute(
        `INSERT INTO buyer_profiles (user_id)
         VALUES (?)
         ON DUPLICATE KEY UPDATE user_id=user_id`,
        [user.id]
      );

      await conn.commit();
      return res.json({ success: true, role: "buyer", user });
    }

    // provider: require docs
    if (!cnicFrontBase64 || !cnicBackBase64 || !selfieBase64) {
      await conn.rollback();
      return jsonError(res, 400, "Provider verification required (CNIC front/back + selfie)");
    }

    const initStatus = providerInitialStatus();

    // upsert provider profile
    await conn.execute(
      `INSERT INTO provider_profiles
       (user_id, status, cnic_front_base64, cnic_back_base64, selfie_base64, submitted_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         cnic_front_base64=VALUES(cnic_front_base64),
         cnic_back_base64=VALUES(cnic_back_base64),
         selfie_base64=VALUES(selfie_base64),
         submitted_at=NOW(),
         status=IF(status IN ('approved','rejected'), status, VALUES(status))`,
      [user.id, initStatus, cnicFrontBase64, cnicBackBase64, selfieBase64]
    );

    const [pRows] = await conn.execute(
      `SELECT user_id, status, submitted_at
       FROM provider_profiles WHERE user_id=? LIMIT 1`,
      [user.id]
    );

    await conn.commit();

    return res.json({
      success: true,
      role: "provider",
      status: pRows?.[0]?.status === "approved" ? "approved" : "submitted",
      user,
    });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    if (e?.code === "PAYLOAD_TOO_LARGE") return jsonError(res, 413, e.message);
    return jsonError(res, 500, String(e?.message || e));
  } finally {
    conn.release();
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const phone = String(req.userPhone || "").trim();
    if (!phone) return jsonError(res, 400, "Phone missing (token)");

    const pool = getPool();
    const [uRows] = await pool.execute(
      `SELECT id, phone, role, name, avatar_base64 AS avatarBase64, created_at, updated_at
       FROM users WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (!uRows.length) return jsonError(res, 404, "User not found");

    const user = uRows[0];

    if (user.role === "buyer") {
      return res.json({ success: true, role: "buyer", user });
    }

    const [pRows] = await pool.execute(
      `SELECT status, submitted_at FROM provider_profiles WHERE user_id=? LIMIT 1`,
      [user.id]
    );

    return res.json({
      success: true,
      role: "provider",
      user,
      provider_profile: pRows?.[0] || null,
    });
  } catch (e) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

module.exports = { profileRouter: router };
