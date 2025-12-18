const express = require("express");
const cors = require("cors");
const { authRouter } = require("./auth.routes");
const { profileRouter } = require("./profile.routes");
const { notFound, errorHandler } = require("./middleware");

function createApp() {
  const app = express();

  app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app.use(express.json({ limit: "10mb" })); // base64 images size control
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (req, res) => res.json({ success: true, message: "PremiumChat API running" }));

  app.use("/auth", authRouter);
  app.use("/profile", profileRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
