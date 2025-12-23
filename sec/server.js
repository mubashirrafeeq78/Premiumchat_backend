const { createApp } = require("./app");
const { config } = require("./config");

const app = createApp();

// 🔴 Railway-compatible PORT
const PORT = process.env.PORT || config.port || 8080;

app.listen(PORT, () => {
  console.log(`🚀 PremiumChat backend running on port ${PORT}`);
});

// Safety: unhandled errors
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
