const { createApp } = require("./app");
const { config } = require("./config");
const { ensureSchema } = require("./schema");

const app = createApp();
const port = config.port || 8080;

// ✅ DB tables auto-create on server start
ensureSchema()
  .then(() => {
    console.log("✅ Database schema ready");

    app.listen(port, () => {
      console.log(`🚀 PremiumChat backend running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("❌ Schema init failed:", err);
    process.exit(1);
  });

// Safety: unhandled errors
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
