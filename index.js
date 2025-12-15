/**
 * ===============================
 * GLOBAL CONFIG (EDIT HERE ONLY)
 * ===============================
 */
const PORT = process.env.PORT || 8080;

/**
 * ===============================
 * IMPORTS
 * ===============================
 */
const express = require("express");
const cors = require("cors");

/**
 * ===============================
 * APP INIT
 * ===============================
 */
const app = express();

/**
 * ===============================
 * MIDDLEWARES
 * ===============================
 */
app.use(cors());
app.use(express.json());

/**
 * ===============================
 * HEALTH CHECK (IMPORTANT)
 * ===============================
 */
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "PremiumChat Backend is running 🚀",
  });
});

/**
 * ===============================
 * SAMPLE API (TEST)
 * ===============================
 */
app.get("/api/test", (req, res) => {
  res.json({ status: "API working fine" });
});

/**
 * ===============================
 * SERVER START
 * ===============================
 */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
