const mysql = require("mysql2/promise");

function getMysqlConfig() {
  // Railway plugin variable reference: MYSQL_URL = ${{MySQL.MYSQL_URL}}
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL;

  const host = process.env.MYSQLHOST || process.env.DB_HOST;
  const user = process.env.MYSQLUSER || process.env.DB_USER;
  const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD;
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME;
  const port = Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306);

  if (!host || !user || !password || !database) return null;
  return { host, user, password, database, port };
}

async function initDbAndTables() {
  const cfg = getMysqlConfig();
  if (!cfg) {
    throw new Error(
      "MySQL config missing. Set MYSQL_URL or MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE (or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME)."
    );
  }

  const pool = await mysql.createPool(
    typeof cfg === "string"
      ? cfg
      : {
          ...cfg,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        }
  );

  await pool.query("SELECT 1");
  console.log("✅ MySQL connected");

  // 1) users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      phone VARCHAR(20) NOT NULL UNIQUE,
      role ENUM('buyer','provider') NOT NULL DEFAULT 'buyer',
      name VARCHAR(120) NULL,
      avatar_url TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 2) providers table (CNIC + images in DB as Base64)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS providers (
      phone VARCHAR(20) NOT NULL,
      name VARCHAR(120) NULL,
      role ENUM('provider') NOT NULL DEFAULT 'provider',
      profile_image_b64 LONGTEXT NULL,
      cnic_front_b64 LONGTEXT NULL,
      cnic_back_b64 LONGTEXT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (phone),
      CONSTRAINT fk_providers_users_phone
        FOREIGN KEY (phone) REFERENCES users(phone)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 3) otp_codes table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      phone VARCHAR(20) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log("✅ Tables ensured (users, providers, otp_codes)");
  return pool;
}

module.exports = { initDbAndTables };
