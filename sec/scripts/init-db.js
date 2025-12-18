/**
 * scripts/init-db.js
 *
 * Requirements:
 *   npm i mysql2
 *
 * Env (Railway MySQL commonly provides these):
 *   MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE
 *   (If your vars are different, adjust below)
 */

const mysql = require("mysql2/promise");

async function main() {
  const host = process.env.MYSQLHOST || process.env.DB_HOST;
  const port = Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306);
  const user = process.env.MYSQLUSER || process.env.DB_USER;
  const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD;
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME;

  if (!host || !user || !database) {
    console.error("Missing DB env vars. Need MYSQLHOST, MYSQLUSER, MYSQLDATABASE (and password if set).");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
  });

  const queries = [
    // Ensure charset
    `SET NAMES utf8mb4;`,

    // BUYERS
    `
    CREATE TABLE IF NOT EXISTS buyers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL,
      name VARCHAR(120) NOT NULL,
      profile_pic_base64 LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_buyers_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,

    // PROVIDERS
    `
    CREATE TABLE IF NOT EXISTS providers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL,
      name VARCHAR(120) NOT NULL,
      profile_pic_base64 LONGTEXT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_providers_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,

    // PROVIDER DOCUMENTS (CNIC Front/Back + Selfie)
    `
    CREATE TABLE IF NOT EXISTS provider_documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      provider_id BIGINT UNSIGNED NOT NULL,
      cnic_front_base64 LONGTEXT NULL,
      cnic_back_base64 LONGTEXT NULL,
      selfie_base64 LONGTEXT NULL,
      submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_provider_documents_provider_id (provider_id),
      CONSTRAINT fk_provider_documents_provider
        FOREIGN KEY (provider_id) REFERENCES providers(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
  ];

  try {
    for (const q of queries) {
      await conn.execute(q);
    }
    console.log("✅ DB tables created/verified: buyers, providers, provider_documents");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("❌ init-db failed:", e);
  process.exit(1);
});
