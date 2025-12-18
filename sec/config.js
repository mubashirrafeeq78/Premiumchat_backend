function getEnv(name, fallback = "") {
  return process.env[name] ?? fallback;
}

const config = {
  port: Number(getEnv("PORT", "8080")),
  // Demo mode: no DB required. All data in-memory.
  // Later you can replace with DB without changing frontend.
  allowDemoOtp: getEnv("ALLOW_DEMO_OTP", "1") === "1"
};

module.exports = { config };
