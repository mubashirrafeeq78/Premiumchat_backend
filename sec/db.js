// sec/db.js
const mysql = require("mysql2/promise");
const { config, assertDbEnv } = require("./config");

let _pool = null;

function getPool() {
  if (_pool) return _pool;

  // DB env لازمی ہے جب ہم DB استعمال کر رہے ہوں
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
    // keepAlive options بعض جگہ issue کرتے ہیں، اس لیے safe رکھیں
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  return _pool;
}

async function pingDb() {
  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT 1 AS ok");
    return rows?.[0]?.ok === 1;
  } catch (e) {
    return false;
  }
}

async function query(sql, params = []) {
  const pool = getPool();
  const [result] = await pool.execute(sql, params);
  return result;
}

module.exports = { getPool, pingDb, query };
