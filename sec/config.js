// sec/config.js
function getEnv(name, fallback = undefined) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === "") return fallback;
  return String(v).trim();
}

function getEnvBool(name, fallback = "0") {
  const v = getEnv(name, fallback);
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
}

function getEnvInt(name, fallback) {
  const v = getEnv(name, String(fallback));
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  port: getEnvInt("PORT", 8080),

  // OTP demo mode (backend demo OTP return)
  allowDemoOtp: getEnvBool("ALLOW_DEMO_OTP", "1"),

  // ✅ MySQL Config (Railway/Any server)
  db: {
    host: getEnv("MYSQLHOST"),
    user: getEnv("MYSQLUSER"),
    password: getEnv("MYSQLPASSWORD", ""), // can be empty if your DB has no password
    database: getEnv("MYSQLDATABASE"),
    port: getEnvInt("MYSQLPORT", 3306),

    // pool settings (stable + low load)
    connectionLimit: getEnvInt("MYSQL_POOL_LIMIT", 10),
    connectTimeout: getEnvInt("MYSQL_CONNECT_TIMEOUT", 10000),
  },

  // Upload limits (base64 payload control)
  upload: {
    // 10mb is OK for compressed images; you can lower later
    jsonLimit: getEnv("JSON_LIMIT", "10mb"),
  },

  // Provider flow default status after submit
  providerDefaultStatus: getEnv("PROVIDER_DEFAULT_STATUS", "submitted"), // submitted|approved
};

// ✅ helper: DB required check (only when you actually use DB code)
function assertDbEnv() {
  const missing = [];
  if (!config.db.host) missing.push("MYSQLHOST");
  if (!config.db.user) missing.push("MYSQLUSER");
  if (!config.db.database) missing.push("MYSQLDATABASE");
  // MYSQLPASSWORD optional (depends on DB)
  if (missing.length) {
    const msg = `DB env missing: ${missing.join(", ")} (and MYSQLPASSWORD if set)`;
    const err = new Error(msg);
    err.code = "DB_ENV_MISSING";
    throw err;
  }
}

module.exports = { config, assertDbEnv };
