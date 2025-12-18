// sec/app.js
const express = require("express");
const cors = require("cors");
const { authRouter } = require("./auth.routes");
const { profileRouter } = require("./profile.routes");
const { notFound, errorHandler } = require("./middleware");
const { config } = require("./config");

function createApp() {
  const app = express();

  // ✅ CORS – Flutter Web + Mobile compatible
  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // ✅ Preflight (Web support)
  app.options("*", cors());

  // ✅ Body parsers (central limit from config)
  app.use(express.json({ limit: config.upload.jsonLimit }));
  app.use(express.urlencoded({ extended: true }));

  // ✅ Health check
  app.get("/", (req, res) => {
    res.json({
      success: true,
      message: "PremiumChat API running",
      time: new Date().toISOString(),
    });
  });

  // ✅ Routes
  app.use("/auth", authRouter);
  app.use("/profile", profileRouter);

  // ✅ Error handlers
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
