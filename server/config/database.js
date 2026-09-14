const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'ecogreen_cms.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for high concurrency and enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'technician')),
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      area_zone TEXT NOT NULL,
      specialization TEXT NOT NULL,
      is_available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      customer_address TEXT NOT NULL,
      product_type TEXT NOT NULL CHECK(product_type IN ('Solar Rooftop Systems', 'Solar Water Heaters', 'Heat Pumps')),
      product_serial TEXT,
      installation_id TEXT,
      issue_category TEXT NOT NULL,
      issue_description TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('Low', 'Medium', 'High', 'Urgent')) DEFAULT 'Medium',
      status TEXT NOT NULL CHECK(status IN ('Registered', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Reopened')) DEFAULT 'Registered',
      assigned_technician_id INTEGER,
      expected_visit_date DATE,
      resolution_notes TEXT,
      spare_parts_used TEXT,
      closing_photo_url TEXT,
      rating INTEGER CHECK(rating BETWEEN 1 AND 5),
      feedback_comments TEXT,
      registered_by_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      assigned_at DATETIME,
      resolved_at DATETIME,
      closed_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_technician_id) REFERENCES technicians(id) ON DELETE SET NULL,
      FOREIGN KEY (registered_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS complaint_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_type TEXT,
      uploaded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS complaint_timelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      notes TEXT,
      performed_by_name TEXT NOT NULL,
      performed_by_role TEXT NOT NULL,
      notify_customer INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notification_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      whatsapp_body TEXT NOT NULL,
      email_subject TEXT NOT NULL,
      email_body TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER,
      channel TEXT NOT NULL CHECK(channel IN ('whatsapp', 'email')),
      recipient TEXT NOT NULL,
      template_key TEXT NOT NULL,
      rendered_content TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'pending')),
      error_message TEXT,
      provider TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS installed_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sr_no INTEGER,
      order_no TEXT,
      scheme TEXT,
      pv_capacity REAL,
      consumer_no TEXT,
      consumer_mobile TEXT,
      customer_name TEXT NOT NULL,
      city_village TEXT,
      installation_date TEXT,
      dealer_name TEXT,
      invoice_no TEXT,
      invoice_date TEXT,
      panel_make TEXT,
      inverter_make TEXT,
      inverter_serial TEXT,
      is_in_warranty INTEGER DEFAULT 0,
      warranty_expiry_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_ticket ON complaints(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_phone ON complaints(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_complaints_tech ON complaints(assigned_technician_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_complaint ON complaint_timelines(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_notif_complaint ON notification_logs(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON installed_customers(customer_name);
    CREATE INDEX IF NOT EXISTS idx_customers_mobile ON installed_customers(consumer_mobile);
    CREATE INDEX IF NOT EXISTS idx_customers_consumer_no ON installed_customers(consumer_no);
    CREATE INDEX IF NOT EXISTS idx_customers_city ON installed_customers(city_village);
    CREATE INDEX IF NOT EXISTS idx_customers_dealer ON installed_customers(dealer_name);
    CREATE INDEX IF NOT EXISTS idx_customers_inverter ON installed_customers(inverter_serial);
  `);
}

initializeSchema();

module.exports = db;
