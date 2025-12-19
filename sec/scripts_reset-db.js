/**
 * sec/scripts/reset-db.js
 * Run: npm run db:reset
 */
const mysql = require("mysql2/promise");

async function main() {
  const host = process.env.MYSQLHOST || process.env.DB_HOST;
  const port = Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306);
  const user = process.env.MYSQLUSER || process.env.DB_USER;
  const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "";
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME;

  if (!host || !user || !database) {
    throw new Error("DB env missing: MYSQLHOST, MYSQLUSER, MYSQLDATABASE (and MYSQLPASSWORD if set)");
  }

  const conn = await mysql.createConnection({
    host, port, user, password, database,
    multipleStatements: true,
  });

  const sql = `
    SET FOREIGN_KEY_CHECKS = 0;

    DROP TABLE IF EXISTS provider_documents;
    DROP TABLE IF EXISTS provider_profiles;
    DROP TABLE IF EXISTS buyer_profiles;
    DROP TABLE IF EXISTS otp_codes;
    DROP TABLE IF EXISTS users;

    -- legacy (اگر پہلے بن چکی ہوں)
    DROP TABLE IF EXISTS providers;
    DROP TABLE IF EXISTS buyers;

    SET FOREIGN_KEY_CHECKS = 1;
  `;

  try {
    await conn.query(sql);
    console.log("✅ DB reset done (tables dropped)");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("❌ reset-db failed:", e.message || e);
  process.exit(1);
});
