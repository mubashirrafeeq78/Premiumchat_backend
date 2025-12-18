const express = require("express");
const { jsonError } = require("./utils");
const { requireAuth } = require("./middleware");
const { userStore } = require("./auth.routes");

const router = express.Router();

// Save profile
router.post("/save", requireAuth, (req, res) => {
  const phone = req.userPhone;

  const name = String(req.body?.name || "").trim();
  const role = String(req.body?.role || "").trim(); // buyer/provider
  const avatarBase64 = String(req.body?.avatarBase64 || "").trim();

  if (!name) return jsonError(res, 400, "Name required");
  if (!role || !["buyer", "provider"].includes(role)) return jsonError(res, 400, "Invalid role");

  const user = userStore.get(phone) || { phone };
  user.name = name;
  user.role = role;
  user.avatarBase64 = avatarBase64; // optional
  userStore.set(phone, user);

  return res.json({ success: true, message: "Profile saved", user });
});

// Get current user
router.get("/me", requireAuth, (req, res) => {
  const phone = req.userPhone;
  const user = userStore.get(phone);
  if (!user) return jsonError(res, 404, "User not found");
  return res.json({ success: true, user });
});

module.exports = { profileRouter: router };
