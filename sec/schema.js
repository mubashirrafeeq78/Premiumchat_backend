// sec/schema.js
const { getPool } = require("./db");

async function columnExists(database, table, column) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [database, table, column]
  );
  return rows.length > 0;
}

async function ensureColumn(database, table, column, ddl) {
  const exists = await columnExists(database, table, column);
  if (!exists) {
    const pool = getPool();
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  }
}

async function ensureIndex(table, indexName, ddlCreateIndex) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SHOW INDEX FROM \`${table}\` WHERE Key_name = ? LIMIT 1`,
    [indexName]
  );
  if (!rows.length) {
    await pool.query(ddlCreateIndex);
  }
}

async function ensureSchema() {
  const pool = getPool();

  // 1) base tables (create if missing)
  await pool.query(`SET NAMES utf8mb4;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL,
      role ENUM('buyer','provider') NOT NULL DEFAULT 'buyer',
      name VARCHAR(120) NOT NULL DEFAULT '',
      avatar_base64 LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      used_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_otp_phone (phone),
      KEY idx_otp_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buyer_profiles (
      user_id BIGINT UNSIGNED NOT NULL,
      preferred_categories TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_buyer_profiles_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS provider_profiles (
      user_id BIGINT UNSIGNED NOT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      cnic_front_base64 LONGTEXT NULL,
      cnic_back_base64 LONGTEXT NULL,
      selfie_base64 LONGTEXT NULL,
      submitted_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_provider_profiles_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 2) auto-migrate (add missing columns اگر پہلے والی ٹیبلز میں کمی ہو)
  // users
  const database = pool.config.connectionConfig.database;
  await ensureColumn(database, "users", "phone", "`phone` VARCHAR(20) NOT NULL");
  await ensureColumn(database, "users", "role", "`role` ENUM('buyer','provider') NOT NULL DEFAULT 'buyer'");
  await ensureColumn(database, "users", "name", "`name` VARCHAR(120) NOT NULL DEFAULT ''");
  await ensureColumn(database, "users", "avatar_base64", "`avatar_base64` LONGTEXT NULL");
  await ensureColumn(database, "users", "created_at", "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn(
    database,
    "users",
    "updated_at",
    "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  );

  // otp_codes
  await ensureColumn(database, "otp_codes", "phone", "`phone` VARCHAR(20) NOT NULL");
  await ensureColumn(database, "otp_codes", "code", "`code` VARCHAR(10) NOT NULL");
  await ensureColumn(database, "otp_codes", "expires_at", "`expires_at` BIGINT NOT NULL");
  await ensureColumn(database, "otp_codes", "created_at", "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn(database, "otp_codes", "used_at", "`used_at` TIMESTAMP NULL DEFAULT NULL");

  // provider_profiles
  await ensureColumn(database, "provider_profiles", "status", "`status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'");
  await ensureColumn(database, "provider_profiles", "cnic_front_base64", "`cnic_front_base64` LONGTEXT NULL");
  await ensureColumn(database, "provider_profiles", "cnic_back_base64", "`cnic_back_base64` LONGTEXT NULL");
  await ensureColumn(database, "provider_profiles", "selfie_base64", "`selfie_base64` LONGTEXT NULL");
  await ensureColumn(database, "provider_profiles", "submitted_at", "`submitted_at` TIMESTAMP NULL DEFAULT NULL");

  // helpful indexes
  await ensureIndex("otp_codes", "idx_otp_phone", "CREATE INDEX idx_otp_phone ON otp_codes(phone)");
  await ensureIndex("users", "uq_users_phone", "CREATE UNIQUE INDEX uq_users_phone ON users(phone)");
}

module.exports = { ensureSchema };
