// scripts/reset_db.js
// ⚠️ DEV/TEST only. Drops ALL tables in the current database.

const mysql = require("mysql2/promise");

async function main() {
  // Safety guard: required env
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run in production (NODE_ENV=production).");
  }
  if (process.env.ALLOW_DB_RESET !== "YES") {
    throw new Error("Set ALLOW_DB_RESET=YES to run this reset.");
  }

  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Missing MYSQL_URL (or DATABASE_URL) env variable.");

  const conn = await mysql.createConnection(url);

  // Get current DB name
  const [dbRow] = await conn.query("SELECT DATABASE() AS db");
  const dbName = dbRow?.[0]?.db;
  if (!dbName) throw new Error("No database selected in connection URL.");

  // List all base tables
  const [tables] = await conn.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [dbName]
  );

  if (!tables.length) {
    console.log("No tables found. Nothing to drop.");
    await conn.end();
    return;
  }

  console.log(`Dropping ${tables.length} tables from DB: ${dbName}`);

  await conn.query("SET FOREIGN_KEY_CHECKS=0");

  for (const t of tables) {
    const table = t.table_name;
    await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
    console.log("Dropped:", table);
  }

  await conn.query("SET FOREIGN_KEY_CHECKS=1");
  await conn.end();

  console.log("✅ Done. All tables dropped.");
}

main().catch((e) => {
  console.error("❌ Reset failed:", e.message || e);
  process.exit(1);
});
