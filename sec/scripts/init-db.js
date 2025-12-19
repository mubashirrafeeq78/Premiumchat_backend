/**
 * sec/scripts/init-db.js
 * ✅ Safe schema ensure: creates tables if missing, adds missing columns if tables already exist.
 * Run: npm run db:init
 */
const mysql = require("mysql2/promise");

function env(name, fallback = "") {
  const v = process.env[name];
  return (v === undefined || v === null || String(v).trim() === "") ? fallback : String(v).trim();
}

async function main() {
  const host = env("MYSQLHOST", env("DB_HOST"));
  const port = Number(env("MYSQLPORT", env("DB_PORT", "3306")));
  const user = env("MYSQLUSER", env("DB_USER"));
  const password = env("MYSQLPASSWORD", env("DB_PASSWORD", ""));
  const database = env("MYSQLDATABASE", env("DB_NAME"));

  if (!host || !user || !database) {
    throw new Error("DB env missing: MYSQLHOST, MYSQLUSER, MYSQLDATABASE (and MYSQLPASSWORD if set)");
  }

  const conn = await mysql.createConnection({
    host, port, user, password, database,
    multipleStatements: true,
  });

  async function tableExists(table) {
    const [r] = await conn.execute(
      `SELECT 1 FROM information_schema.tables WHERE table_schema=? AND table_name=? LIMIT 1`,
      [database, table]
    );
    return r.length > 0;
  }

  async function columnExists(table, column) {
    const [r] = await conn.execute(
      `SELECT 1 FROM information_schema.columns WHERE table_schema=? AND table_name=? AND column_name=? LIMIT 1`,
      [database, table, column]
    );
    return r.length > 0;
  }

  async function addColumnIfMissing(table, column, ddl) {
    if (!(await columnExists(table, column))) {
      await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
      console.log(`➕ Added ${table}.${column}`);
    }
  }

  async function addIndexIfMissing(table, indexName, ddlCreate) {
    const [r] = await conn.execute(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema=? AND table_name=? AND index_name=? LIMIT 1`,
      [database, table, indexName]
    );
    if (!r.length) {
      await conn.execute(ddlCreate);
      console.log(`➕ Index ${indexName} on ${table}`);
    }
  }

  async function addFkIfMissing(table, fkName, ddlCreate) {
    const [r] = await conn.execute(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema=? AND table_name=? AND constraint_name=? AND constraint_type='FOREIGN KEY' LIMIT 1`,
      [database, table, fkName]
    );
    if (!r.length) {
      try {
        await conn.execute(ddlCreate);
        console.log(`➕ FK ${fkName} on ${table}`);
      } catch (e) {
        // اگر پہلے سے کسی اور نام سے FK لگا ہو تو ignore
        console.log(`ℹ️ FK ${fkName} skip: ${e.message}`);
      }
    }
  }

  try {
    await conn.execute(`SET NAMES utf8mb4;`);

    // ---------------- USERS ----------------
    if (!(await tableExists("users"))) {
      await conn.execute(`
        CREATE TABLE users (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          phone VARCHAR(20) NOT NULL,
          role ENUM('buyer','provider') NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_users_phone (phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("✅ Created table users");
    } else {
      await addColumnIfMissing("users", "id", "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY");
      await addColumnIfMissing("users", "phone", "`phone` VARCHAR(20) NOT NULL");
      await addColumnIfMissing("users", "role", "`role` ENUM('buyer','provider') NOT NULL DEFAULT 'buyer'");
      await addColumnIfMissing("users", "created_at", "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
      await addColumnIfMissing("users", "updated_at", "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
      await addIndexIfMissing("users", "uq_users_phone", "ALTER TABLE `users` ADD UNIQUE KEY `uq_users_phone` (`phone`)");
    }

    // ---------------- OTP CODES ----------------
    if (!(await tableExists("otp_codes"))) {
      await conn.execute(`
        CREATE TABLE otp_codes (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          otp_code VARCHAR(10) NOT NULL,
          expires_at DATETIME NOT NULL,
          is_used TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_otp_user (user_id),
          KEY idx_otp_expires (expires_at),
          CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("✅ Created table otp_codes");
    } else {
      await addColumnIfMissing("otp_codes", "id", "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY");
      await addColumnIfMissing("otp_codes", "user_id", "`user_id` BIGINT UNSIGNED NOT NULL");
      await addColumnIfMissing("otp_codes", "otp_code", "`otp_code` VARCHAR(10) NOT NULL");
      await addColumnIfMissing("otp_codes", "expires_at", "`expires_at` DATETIME NOT NULL");
      await addColumnIfMissing("otp_codes", "is_used", "`is_used` TINYINT(1) NOT NULL DEFAULT 0");
      await addColumnIfMissing("otp_codes", "created_at", "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
      await addIndexIfMissing("otp_codes", "idx_otp_user", "ALTER TABLE `otp_codes` ADD KEY `idx_otp_user` (`user_id`)");
      await addIndexIfMissing("otp_codes", "idx_otp_expires", "ALTER TABLE `otp_codes` ADD KEY `idx_otp_expires` (`expires_at`)");
      await addFkIfMissing(
        "otp_codes",
        "fk_otp_user",
        "ALTER TABLE `otp_codes` ADD CONSTRAINT `fk_otp_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE"
      );
    }

    // ---------------- BUYER PROFILES ----------------
    if (!(await tableExists("buyer_profiles"))) {
      await conn.execute(`
        CREATE TABLE buyer_profiles (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          name VARCHAR(120) NOT NULL,
          profile_pic_base64 LONGTEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_buyer_user (user_id),
          CONSTRAINT fk_buyer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("✅ Created table buyer_profiles");
    } else {
      await addColumnIfMissing("buyer_profiles", "id", "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY");
      await addColumnIfMissing("buyer_profiles", "user_id", "`user_id` BIGINT UNSIGNED NOT NULL");
      await addColumnIfMissing("buyer_profiles", "name", "`name` VARCHAR(120) NOT NULL");
      await addColumnIfMissing("buyer_profiles", "profile_pic_base64", "`profile_pic_base64` LONGTEXT NULL");
      await addColumnIfMissing("buyer_profiles", "created_at", "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
      await addColumnIfMissing("buyer_profiles", "updated_at", "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
      await addIndexIfMissing("buyer_profiles", "uq_buyer_user", "ALTER TABLE `buyer_profiles` ADD UNIQUE KEY `uq_buyer_user` (`user_id`)");
      await addFkIfMissing(
        "buyer_profiles",
        "fk_buyer_user",
        "ALTER TABLE `buyer_profiles` ADD CONSTRAINT `fk_buyer_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE"
      );
    }

    // ---------------- PROVIDER PROFILES ----------------
    if (!(await tableExists("provider_profiles"))) {
      await conn.execute(`
        CREATE TABLE provider_profiles (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          name VARCHAR(120) NOT NULL,
          profile_pic_base64 LONGTEXT NULL,
          status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_provider_user (user_id),
          CONSTRAINT fk_provider_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("✅ Created table provider_profiles");
    } else {
      await addColumnIfMissing("provider_profiles", "id", "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY");
      await addColumnIfMissing("provider_profiles", "user_id", "`user_id` BIGINT UNSIGNED NOT NULL");
      await addColumnIfMissing("provider_profiles", "name", "`name` VARCHAR(120) NOT NULL");
      await addColumnIfMissing("provider_profiles", "profile_pic_base64", "`profile_pic_base64` LONGTEXT NULL");
      await addColumnIfMissing("provider_profiles", "status", "`status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'");
      await addColumnIfMissing("provider_profiles", "created_at", "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
      await addColumnIfMissing("provider_profiles", "updated_at", "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
      await addIndexIfMissing("provider_profiles", "uq_provider_user", "ALTER TABLE `provider_profiles` ADD UNIQUE KEY `uq_provider_user` (`user_id`)");
      await addFkIfMissing(
        "provider_profiles",
        "fk_provider_user",
        "ALTER TABLE `provider_profiles` ADD CONSTRAINT `fk_provider_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE"
      );
    }

    // ---------------- PROVIDER DOCUMENTS ----------------
    if (!(await tableExists("provider_documents"))) {
      await conn.execute(`
        CREATE TABLE provider_documents (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          provider_profile_id BIGINT UNSIGNED NOT NULL,
          cnic_front_base64 LONGTEXT NULL,
          cnic_back_base64 LONGTEXT NULL,
          selfie_base64 LONGTEXT NULL,
          submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_docs_provider (provider_profile_id),
          CONSTRAINT fk_docs_provider FOREIGN KEY (provider_profile_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("✅ Created table provider_documents");
    } else {
      await addColumnIfMissing("provider_documents", "id", "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY");
      await addColumnIfMissing("provider_documents", "provider_profile_id", "`provider_profile_id` BIGINT UNSIGNED NOT NULL");
      await addColumnIfMissing("provider_documents", "cnic_front_base64", "`cnic_front_base64` LONGTEXT NULL");
      await addColumnIfMissing("provider_documents", "cnic_back_base64", "`cnic_back_base64` LONGTEXT NULL");
      await addColumnIfMissing("provider_documents", "selfie_base64", "`selfie_base64` LONGTEXT NULL");
      await addColumnIfMissing("provider_documents", "submitted_at", "`submitted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
      await addIndexIfMissing("provider_documents", "idx_docs_provider", "ALTER TABLE `provider_documents` ADD KEY `idx_docs_provider` (`provider_profile_id`)");
      await addFkIfMissing(
        "provider_documents",
        "fk_docs_provider",
        "ALTER TABLE `provider_documents` ADD CONSTRAINT `fk_docs_provider` FOREIGN KEY (`provider_profile_id`) REFERENCES `provider_profiles`(`id`) ON DELETE CASCADE"
      );
    }

    console.log("✅ DB schema ensured (no drops).");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("❌ init-db failed:", e.message || e);
  process.exit(1);
});
