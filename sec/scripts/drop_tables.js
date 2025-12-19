/**
 * scripts/drop_tables.js
 * Usage:
 *   ALLOW_DB_DROP=YES node scripts/drop_tables.js
 *
 * Requirement:
 *   env میں MYSQL_URL موجود ہو (Railway والا)
 */

const mysql = require("mysql2/promise");

// ✅ یہاں صرف وہی ٹیبلز لکھیں جو آپ delete کرنا چاہتے ہیں
const TABLES_TO_DROP = [
  "otp_codes",
  "otp_verification",
  "users",
  "buyers",
  "buyer_profiles",
  "providers",
  "provider_profiles",
  "provider_documents",
];

function mustEnv(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function isSafeTableName(t) {
  // صرف letters, numbers, underscore allow (SQL injection سے بچاؤ)
  return /^[A-Za-z0-9_]+$/.test(t);
}

async function main() {
  // ✅ safety switch
  if (process.env.ALLOW_DB_DROP !== "YES") {
    console.log("Blocked: set ALLOW_DB_DROP=YES to run this script.");
    process.exit(1);
  }

  const MYSQL_URL = mustEnv("MYSQL_URL");

  // validate table names
  for (const t of TABLES_TO_DROP) {
    if (!isSafeTableName(t)) {
      throw new Error(`Invalid table name: "${t}" (only A-Z a-z 0-9 _)`);
    }
  }

  const conn = await mysql.createConnection(MYSQL_URL);

  try {
    // FK errors avoid کرنے کیلئے
    await conn.query("SET FOREIGN_KEY_CHECKS=0");

    for (const table of TABLES_TO_DROP) {
      const sql = `DROP TABLE IF EXISTS \`${table}\``;
      console.log("Dropping:", table);
      await conn.query(sql);
    }

    await conn.query("SET FOREIGN_KEY_CHECKS=1");
    console.log("✅ Done. Tables dropped successfully.");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("❌ Error:", e.message || e);
  process.exit(1);
});
