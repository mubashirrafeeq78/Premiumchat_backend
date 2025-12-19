// sec/schema.js
const mysql = require("mysql2/promise");
const { config, assertDbEnv } = require("./config");

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function addColumnIfMissing(conn, table, column, ddl) {
  const ok = await columnExists(conn, table, column);
  if (!ok) {
    await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  }
}

async function ensureSchema() {
  assertDbEnv();

  const conn = await mysql.createConnection({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    port: config.db.port,
    multipleStatements: true,
  });

  try {
    await conn.execute(`SET NAMES utf8mb4;`);

    // ---- OTP ----
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        phone VARCHAR(20) NOT NULL,
        code VARCHAR(10) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_otp_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ---- BUYERS ----
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS buyers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        phone VARCHAR(20) NOT NULL,
        name VARCHAR(120) NOT NULL,
        avatar_base64 LONGTEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_buyers_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ---- PROVIDERS ----
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS providers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        phone VARCHAR(20) NOT NULL,
        name VARCHAR(120) NOT NULL,
        avatar_base64 LONGTEXT NULL,
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_providers_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ---- PROVIDER DOCUMENTS ----
    await conn.execute(`
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
    `);

    // ✅ اگر پہلے سے ٹیبل موجود ہے تو missing columns خود add ہو جائیں
    await addColumnIfMissing(conn, "buyers", "avatar_base64", "`avatar_base64` LONGTEXT NULL");
    await addColumnIfMissing(conn, "providers", "avatar_base64", "`avatar_base64` LONGTEXT NULL");

    return true;
  } finally {
    await conn.end();
  }
}

module.exports = { ensureSchema };
