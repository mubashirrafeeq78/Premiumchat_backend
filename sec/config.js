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

// ✅ Support MYSQL_URL as well (e.g. mysql://user:pass@host:3306/dbname)
function parseMysqlUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname) return null;

    const host = u.hostname;
    const port = u.port ? Number(u.port) : 3306;
    const user = decodeURIComponent(u.username || "");
    const password = decodeURIComponent(u.password || "");
    const database = (u.pathname || "").replace(/^\//, "");

    if (!host || !user || !database) return null;
    return { host, port, user, password, database };
  } catch (_) {
    return null;
  }
}

const mysqlUrl = getEnv("MYSQL_URL");
const parsed = mysqlUrl ? parseMysqlUrl(mysqlUrl) : null;

const nodeEnv = getEnv("NODE_ENV", "development");
const isProd = nodeEnv === "production";

const config = {
  env: nodeEnv,
  port: getEnvInt("PORT", 8080),

  // ✅ OTP secret (production میں لازمی)
  otpSecret: getEnv("OTP_SECRET"),

  // OTP demo mode (production میں default OFF)
  allowDemoOtp: getEnvBool("ALLOW_DEMO_OTP", isProd ? "0" : "1"),

  // ✅ MySQL Config (works with MYSQL_URL OR split vars)
  db: {
    host: parsed?.host ?? getEnv("MYSQLHOST"),
    user: parsed?.user ?? getEnv("MYSQLUSER"),
    password: parsed?.password ?? getEnv("MYSQLPASSWORD", ""),
    database: parsed?.database ?? getEnv("MYSQLDATABASE"),
    port: parsed?.port ?? getEnvInt("MYSQLPORT", 3306),

    // SSL for remote MySQL (optional)
    ssl: getEnvBool("MYSQL_SSL", "0"),

    // pool settings
    connectionLimit: getEnvInt("MYSQL_POOL_LIMIT", 10),
    connectTimeout: getEnvInt("MYSQL_CONNECT_TIMEOUT", 10000),
  },

  upload: {
    jsonLimit: getEnv("JSON_LIMIT", "10mb"),
  },

  providerDefaultStatus: getEnv("PROVIDER_DEFAULT_STATUS", "submitted"),
};

function assertDbEnv() {
  const missing = [];
  if (!config.db.host) missing.push("MYSQLHOST (or MYSQL_URL)");
  if (!config.db.user) missing.push("MYSQLUSER (or MYSQL_URL)");
  if (!config.db.database) missing.push("MYSQLDATABASE (or MYSQL_URL)");
  if (missing.length) {
    const msg = `DB env missing: ${missing.join(", ")} (and MYSQLPASSWORD if set)`;
    const err = new Error(msg);
    err.code = "DB_ENV_MISSING";
    throw err;
  }

  // ✅ production میں OTP_SECRET لازمی رکھیں
  if (isProd && !config.otpSecret) {
    const err = new Error("OTP_SECRET is required in production");
    err.code = "OTP_SECRET_MISSING";
    throw err;
  }
}

module.exports = { config, assertDbEnv };
