/**
 * sec/scripts/init-db.js
 * Run:
 *   node sec/scripts/init-db.js
 *
 * Needs env:
 *   MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE
 */

const mysql = require("mysql2/promise");

function must(v, name) {
  if (!v || String(v).trim() === "") throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

async function main() {
  const host = must(process.env.MYSQLHOST, "MYSQLHOST");
  const port = Number(process.env.MYSQLPORT || 3306);
  const user = must(process.env.MYSQLUSER, "MYSQLUSER");
  const password = process.env.MYSQLPASSWORD || "";
  const database = must(process.env.MYSQLDATABASE, "MYSQLDATABASE");

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
  });

  const queries = [
    `SET NAMES utf8mb4;`,

    // MASTER USERS (buyer + provider)
    `
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL,
      name VARCHAR(120) NOT NULL,
      role ENUM('buyer','provider') NOT NULL,
      profile_pic_base64 LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,

    // PROVIDER PROFILE (status, approval fields)
    `
    CREATE TABLE IF NOT EXISTS provider_profiles (
      user_id BIGINT UNSIGNED NOT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      approved_at TIMESTAMP NULL,
      rejected_reason VARCHAR(255) NULL,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_provider_profiles_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,

    // PROVIDER DOCUMENTS (submissions history)
    `
    CREATE TABLE IF NOT EXISTS provider_documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      cnic_front_base64 LONGTEXT NULL,
      cnic_back_base64 LONGTEXT NULL,
      selfie_base64 LONGTEXT NULL,
      submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_provider_docs_user (user_id),
      CONSTRAINT fk_provider_docs_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,

    // OTP CODES (production ready)
    `
    CREATE TABLE IF NOT EXISTS otp_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL,
      otp VARCHAR(10) NOT NULL,
      expires_at BIGINT NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_otp_phone (phone),
      KEY idx_otp_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
  ];

  try {
    for (const q of queries) await conn.execute(q);
    console.log("✅ DB ready: users, provider_profiles, provider_documents, otp_codes");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("❌ init-db failed:", e.message || e);
  process.exit(1);
});
