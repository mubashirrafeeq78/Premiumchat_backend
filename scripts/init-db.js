const mysql = require("mysql2/promise");

(async () => {
  try {
    // Railway MySQL envs (تمہارے screenshot والے)
    const host = process.env.MYSQLHOST || "mysql.railway.internal";
    const user = process.env.MYSQLUSER || "root";
    const password = process.env.MYSQLPASSWORD;
    const database = process.env.MYSQLDATABASE || "railway";
    const port = Number(process.env.MYSQLPORT || 3306);

    if (!password) {
      throw new Error("MYSQLPASSWORD missing");
    }

    const conn = await mysql.createConnection({
      host,
      user,
      password,
      database,
      port,
    });

    console.log("✅ MySQL connected");

    // USERS
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE,
        role ENUM('buyer','provider') NOT NULL DEFAULT 'buyer',
        name VARCHAR(120),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // OTP
    await conn.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        phone VARCHAR(20) NOT NULL,
        code VARCHAR(10) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log("✅ Tables created successfully");
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ DB init failed:", err.message);
    process.exit(1);
  }
})();
