// sec/db.js
const mysql = require("mysql2/promise");
const { config, assertDbEnv } = require("./config");

let _pool = null;

function getPool() {
  if (_pool) return _pool;

  assertDbEnv();

  _pool = mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    port: config.db.port,

    waitForConnections: true,
    connectionLimit: config.db.connectionLimit ?? 10,
    queueLimit: 0,

    connectTimeout: config.db.connectTimeout ?? 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  return _pool;
}

async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

async function pingDb() {
  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT 1 AS ok");
    return rows?.[0]?.ok === 1;
  } catch (_) {
    return false;
  }
}

// ✅ SELECT => rows | INSERT/UPDATE => result (mysql2 behavior)
async function query(sql, params = []) {
  const pool = getPool();
  const [rowsOrResult] = await pool.execute(sql, params);
  return rowsOrResult;
}

module.exports = { getPool, closePool, pingDb, query };
