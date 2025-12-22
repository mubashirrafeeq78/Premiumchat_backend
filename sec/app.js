// sec/app.js
const express = require("express");
const cors = require("cors");
const { authRouter } = require("./auth.routes");
const { profileRouter } = require("./profile.routes");
const { notFound, errorHandler } = require("./middleware");
const { config } = require("./config");

function parseOrigins(v) {
  const s = String(v || "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function createApp() {
  const app = express();

  // ✅ CORS (env/config based)
  const allowAll = config.env !== "production" && process.env.CORS_ORIGINS === "*";
  const allowedOrigins = parseOrigins(process.env.CORS_ORIGINS);

  app.use(
    cors({
      origin: (origin, cb) => {
        if (allowAll) return cb(null, true);

        // mobile apps / curl etc. (no origin header)
        if (!origin) return cb(null, true);

        // if list empty => allow all in non-prod, block in prod
        if (allowedOrigins.length === 0) {
          if (config.env === "production") return cb(new Error("CORS blocked"));
          return cb(null, true);
        }

        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("CORS blocked"));
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.options("*", cors());

  app.use(express.json({ limit: config.upload.jsonLimit }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (req, res) => {
    res.json({
      success: true,
      message: "PremiumChat API running",
      time: new Date().toISOString(),
    });
  });

  app.use("/auth", authRouter);
  app.use("/profile", profileRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
