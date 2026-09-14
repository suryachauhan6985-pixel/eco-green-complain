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
      city TEXT,
      consumer_no TEXT,
      order_no TEXT,
      location_url TEXT,
      is_in_warranty INTEGER DEFAULT 1,
      estimated_charges REAL DEFAULT 0,
      notify_charges INTEGER DEFAULT 0,
      payment_collected REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'Unpaid',
      product_type TEXT NOT NULL CHECK(product_type IN ('Solar Rooftop Systems', 'Solar Water Heaters', 'Heat Pumps')),
      product_serial TEXT,
      installation_id TEXT,
      issue_category TEXT NOT NULL,
      issue_description TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('Low', 'Medium', 'High', 'Urgent')) DEFAULT 'Medium',
      status TEXT NOT NULL CHECK(status IN ('Registered', 'Unassigned', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Reopened')) DEFAULT 'Unassigned',
      assigned_technician_id INTEGER,
      expected_visit_date DATE,
      resolution_notes TEXT,
      spare_parts_used TEXT,
      closing_photo_url TEXT,
      rating INTEGER CHECK(rating BETWEEN 1 AND 5),
      feedback_comments TEXT,
      registered_by_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

function migrateComplaintsTable() {
  try {
    const tableSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='complaints'").get();
    if (!tableSqlRow) return;

    // Check if the current table constraint contains 'Unassigned'
    if (!tableSqlRow.sql.includes('Unassigned')) {
      console.log('Migrating complaints table schema to support Unassigned status and all extended fields...');
      db.pragma('foreign_keys = OFF');
      db.transaction(() => {
        // 1. Ensure existing table has the extra columns before copying
        const columns = db.pragma('table_info(complaints)');
        const columnNames = columns.map(c => c.name);
        const colDefs = [
          { name: 'city', type: 'TEXT' },
          { name: 'consumer_no', type: 'TEXT' },
          { name: 'order_no', type: 'TEXT' },
          { name: 'location_url', type: 'TEXT' },
          { name: 'is_in_warranty', type: 'INTEGER DEFAULT 1' },
          { name: 'estimated_charges', type: 'REAL DEFAULT 0' },
          { name: 'notify_charges', type: 'INTEGER DEFAULT 0' },
          { name: 'payment_collected', type: 'REAL DEFAULT 0' },
          { name: 'payment_status', type: "TEXT DEFAULT 'Unpaid'" },
          { name: 'status_updated_at', type: 'DATETIME' }
        ];
        for (const col of colDefs) {
          if (!columnNames.includes(col.name)) {
            db.exec(`ALTER TABLE complaints ADD COLUMN ${col.name} ${col.type}`);
          }
        }

        // 2. Rename old table
        db.exec(`ALTER TABLE complaints RENAME TO complaints_old`);

        // 3. Create new complaints table with updated CHECK constraint
        db.exec(`
          CREATE TABLE complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT UNIQUE NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            customer_email TEXT,
            customer_address TEXT NOT NULL,
            city TEXT,
            consumer_no TEXT,
            order_no TEXT,
            location_url TEXT,
            is_in_warranty INTEGER DEFAULT 1,
            estimated_charges REAL DEFAULT 0,
            notify_charges INTEGER DEFAULT 0,
            payment_collected REAL DEFAULT 0,
            payment_status TEXT DEFAULT 'Unpaid',
            product_type TEXT NOT NULL CHECK(product_type IN ('Solar Rooftop Systems', 'Solar Water Heaters', 'Heat Pumps')),
            product_serial TEXT,
            installation_id TEXT,
            issue_category TEXT NOT NULL,
            issue_description TEXT NOT NULL,
            priority TEXT NOT NULL CHECK(priority IN ('Low', 'Medium', 'High', 'Urgent')) DEFAULT 'Medium',
            status TEXT NOT NULL CHECK(status IN ('Registered', 'Unassigned', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Reopened')) DEFAULT 'Unassigned',
            assigned_technician_id INTEGER,
            expected_visit_date DATE,
            resolution_notes TEXT,
            spare_parts_used TEXT,
            closing_photo_url TEXT,
            rating INTEGER CHECK(rating BETWEEN 1 AND 5),
            feedback_comments TEXT,
            registered_by_user_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            assigned_at DATETIME,
            resolved_at DATETIME,
            closed_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assigned_technician_id) REFERENCES technicians(id) ON DELETE SET NULL,
            FOREIGN KEY (registered_by_user_id) REFERENCES users(id) ON DELETE SET NULL
          )
        `);

        // 4. Copy data over, mapping 'Registered' -> 'Unassigned'
        db.exec(`
          INSERT INTO complaints (
            id, ticket_id, customer_name, customer_phone, customer_email, customer_address,
            city, consumer_no, order_no, location_url, is_in_warranty, estimated_charges,
            notify_charges, payment_collected, payment_status,
            product_type, product_serial, installation_id, issue_category, issue_description,
            priority, status, assigned_technician_id, expected_visit_date, resolution_notes,
            spare_parts_used, closing_photo_url, rating, feedback_comments, registered_by_user_id,
            created_at, status_updated_at, assigned_at, resolved_at, closed_at, updated_at
          )
          SELECT 
            id, ticket_id, customer_name, customer_phone, customer_email, customer_address,
            city, consumer_no, order_no, location_url, COALESCE(is_in_warranty, 1), COALESCE(estimated_charges, 0),
            COALESCE(notify_charges, 0), COALESCE(payment_collected, 0), COALESCE(payment_status, 'Unpaid'),
            product_type, product_serial, installation_id, issue_category, issue_description,
            priority, 
            CASE WHEN status = 'Registered' THEN 'Unassigned' ELSE status END,
            assigned_technician_id, expected_visit_date, resolution_notes,
            spare_parts_used, closing_photo_url, rating, feedback_comments, registered_by_user_id,
            created_at, COALESCE(status_updated_at, created_at), assigned_at, resolved_at, closed_at, updated_at
          FROM complaints_old
        `);

        // 5. Drop old table
        db.exec(`DROP TABLE complaints_old`);

        // 5b. Fix child tables if SQLite updated foreign key to complaints_old
        const fixTables = [
          {
            name: 'complaint_attachments',
            createSql: 'CREATE TABLE complaint_attachments_new (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_id INTEGER NOT NULL, file_name TEXT NOT NULL, file_url TEXT NOT NULL, file_type TEXT, uploaded_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE)',
            copySql: 'INSERT INTO complaint_attachments_new SELECT * FROM complaint_attachments'
          },
          {
            name: 'complaint_timelines',
            createSql: 'CREATE TABLE complaint_timelines_new (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_id INTEGER NOT NULL, action TEXT NOT NULL, notes TEXT, performed_by_name TEXT NOT NULL, performed_by_role TEXT NOT NULL, notify_customer INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE)',
            copySql: 'INSERT INTO complaint_timelines_new SELECT * FROM complaint_timelines'
          },
          {
            name: 'notification_logs',
            createSql: 'CREATE TABLE notification_logs_new (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_id INTEGER, channel TEXT NOT NULL CHECK(channel IN (\'whatsapp\', \'email\')), recipient TEXT NOT NULL, template_key TEXT NOT NULL, rendered_content TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN (\'sent\', \'failed\', \'pending\')), error_message TEXT, provider TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE SET NULL)',
            copySql: 'INSERT INTO notification_logs_new SELECT * FROM notification_logs'
          }
        ];
        for (const t of fixTables) {
          const tableInfo = db.prepare('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name = ?').get(t.name);
          if (tableInfo && tableInfo.sql.includes('complaints_old')) {
            db.exec(t.createSql);
            db.exec(t.copySql);
            db.exec(`DROP TABLE ${t.name}`);
            db.exec(`ALTER TABLE ${t.name}_new RENAME TO ${t.name}`);
          }
        }

        // 6. Recreate indexes
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_complaints_ticket ON complaints(ticket_id);
          CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
          CREATE INDEX IF NOT EXISTS idx_complaints_phone ON complaints(customer_phone);
          CREATE INDEX IF NOT EXISTS idx_complaints_tech ON complaints(assigned_technician_id);
        `);
      })();
      db.pragma('foreign_keys = ON');
      console.log('✅ Complaints table schema migration complete.');
    } else {
      // If already has Unassigned, ensure columns exist
      const columns = db.pragma('table_info(complaints)');
      const columnNames = columns.map(c => c.name);
      const newColumns = [
        { name: 'city', type: 'TEXT' },
        { name: 'consumer_no', type: 'TEXT' },
        { name: 'order_no', type: 'TEXT' },
        { name: 'location_url', type: 'TEXT' },
        { name: 'is_in_warranty', type: 'INTEGER DEFAULT 1' },
        { name: 'estimated_charges', type: 'REAL DEFAULT 0' },
        { name: 'notify_charges', type: 'INTEGER DEFAULT 0' },
        { name: 'payment_collected', type: 'REAL DEFAULT 0' },
        { name: 'payment_status', type: "TEXT DEFAULT 'Unpaid'" },
        { name: 'status_updated_at', type: 'DATETIME' }
      ];

      for (const col of newColumns) {
        if (!columnNames.includes(col.name)) {
          db.exec(`ALTER TABLE complaints ADD COLUMN ${col.name} ${col.type}`);
        }
      }
      db.exec(`UPDATE complaints SET status_updated_at = created_at WHERE status_updated_at IS NULL`);
    }
  } catch (e) {
    console.warn('Complaints table migration note:', e.message);
  }
}

initializeSchema();
migrateComplaintsTable();

module.exports = db;
