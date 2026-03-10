const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Database Initialization Script
 * This script creates all required tables for the payroll system
 */

async function initializeDatabase() {
    let connection;

    try {
        console.log('🔌 Connecting to MySQL...');

        // Create connection without specifying database first
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306
        });

        console.log('✅ Connected to MySQL');

        // Create database if it doesn't exist
        const dbName = process.env.DB_NAME || 'pop_db';
        console.log(`📦 Creating database '${dbName}' if not exists...`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        console.log(`✅ Database '${dbName}' ready`);

        // Switch to the database
        await connection.query(`USE \`${dbName}\``);
        console.log(`✅ Using database '${dbName}'`);

        // Disable foreign key checks temporarily
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        console.log('📝 Creating tables...\n');

        // Create users table
        console.log('Creating users table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        phone VARCHAR(30),
        password VARCHAR(255) NOT NULL,
        role ENUM('superadmin', 'admin', 'employer', 'employee', 'vendor', 'jobseeker') NOT NULL DEFAULT 'jobseeker',
        company_id INT,
        status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
        last_login DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      )
    `);
        console.log('✅ users table created');

        // Create employers table
        console.log('Creating employers table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS employers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        company_name VARCHAR(200) NOT NULL,
        company_address TEXT,
        website VARCHAR(200),
        gst_number VARCHAR(50),
        pan_number VARCHAR(50),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_employer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
        console.log('✅ employers table created');

        // Add foreign key to users table
        console.log('Adding company_id foreign key to users table...');
        try {
            await connection.query(`
        ALTER TABLE users 
        ADD CONSTRAINT fk_user_company 
        FOREIGN KEY (company_id) REFERENCES employers(id) ON DELETE SET NULL
      `);
            console.log('✅ Foreign key added');
        } catch (err) {
            if (err.code === 'ER_DUP_KEYNAME') {
                console.log('⚠️  Foreign key already exists, skipping');
            } else {
                throw err;
            }
        }

        // Create admins table
        console.log('Creating admins table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        department VARCHAR(100),
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_admin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_admin_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
        console.log('✅ admins table created');

        // Create plans table
        console.log('Creating plans table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        duration_months INT NOT NULL DEFAULT 1,
        description TEXT,
        features TEXT,
        max_employees INT,
        max_jobs INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ plans table created');

        // Create company_requests table
        console.log('Creating company_requests table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS company_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(200) NOT NULL,
        contact_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        phone VARCHAR(30),
        plan_id INT NOT NULL,
        payment_status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
        request_status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
        company_address TEXT,
        gst_number VARCHAR(50),
        pan_number VARCHAR(50),
        notes TEXT,
        processed_by INT,
        processed_at DATETIME,
        created_company_id INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_req_plan FOREIGN KEY (plan_id) REFERENCES plans(id),
        CONSTRAINT fk_req_processor FOREIGN KEY (processed_by) REFERENCES users(id),
        CONSTRAINT fk_req_company FOREIGN KEY (created_company_id) REFERENCES employers(id)
      )
    `);
        console.log('✅ company_requests table created');

        // Create subscriptions table
        console.log('Creating subscriptions table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employer_id INT NOT NULL,
        plan_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status ENUM('active', 'expired', 'cancelled', 'pending') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_sub_employer FOREIGN KEY (employer_id) REFERENCES employers(id),
        CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
      )
    `);
        console.log('✅ subscriptions table created');

        // Create audit_logs table
        console.log('Creating audit_logs table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ audit_logs table created');

        // Re-enable foreign key checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        // Verify tables were created
        const [tables] = await connection.query('SHOW TABLES');
        console.log('\n📊 Tables in database:');
        tables.forEach(table => {
            const tableName = Object.values(table)[0];
            console.log(`   ✓ ${tableName}`);
        });

        console.log('\n🎉 Database initialization completed successfully!');

    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

// Run the initialization
initializeDatabase();
