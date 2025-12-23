const { createApp } = require("./app");
const { config } = require("./config");

const app = createApp();
const PORT = process.env.PORT || config.port || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PremiumChat backend running on ${PORT}`);
});
