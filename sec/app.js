const express = require("express");
const cors = require("cors");
const { authRouter } = require("./auth.routes");
const { profileRouter } = require("./profile.routes");
const { notFound, errorHandler } = require("./middleware");

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

  // ✅ Preflight requests (IMPORTANT for Web)
  app.options("*", cors());

  // ✅ Body parsers (Base64 images supported)
  app.use(express.json({ limit: "10mb" }));
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
