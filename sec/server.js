const { createApp } = require("./app");
const { config } = require("./config");

const app = createApp();

const port = config.port || 8080;

app.listen(port, () => {
  console.log(`🚀 PremiumChat backend running on port ${port}`);
});

// Safety: unhandled errors (server crash protection)
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
