const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bundledDbPath = path.join(__dirname, '..', 'ecogreen_cms.db');
const hasPersistentDataDir = fs.existsSync('/data');
const defaultDir = hasPersistentDataDir ? '/data' : path.join(__dirname, '..');
const dbPath = process.env.DATABASE_PATH || path.join(defaultDir, 'ecogreen_cms.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// If persistent volume is attached at /data and ecogreen_cms.db doesn't exist yet, seed it from the bundled db
if (hasPersistentDataDir && dbPath === '/data/ecogreen_cms.db' && !fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
  console.log('[Database] First persistent run: copying bundled database to /data/ecogreen_cms.db...');
  try {
    fs.copyFileSync(bundledDbPath, dbPath);
    console.log('[Database] Bundled database successfully seeded to persistent volume.');
  } catch (err) {
    console.error('[Database] Failed to seed persistent database:', err.message);
  }
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
      invoice_no TEXT,
      invoice_date TEXT,
      location_url TEXT,
      is_in_warranty INTEGER DEFAULT 1,
      estimated_charges REAL DEFAULT 0,
      notify_charges INTEGER DEFAULT 0,
      payment_collected REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'Unpaid',
      company_settlement_status TEXT DEFAULT 'Pending Settlement',
      company_settled_at DATETIME,
      company_settled_by TEXT,
      product_type TEXT NOT NULL,
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
      file_data TEXT,
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
      audience TEXT DEFAULT 'customer',
      trigger_event TEXT DEFAULT 'manual',
      meta_template_name TEXT,
      meta_language TEXT DEFAULT 'en_US',
      meta_category TEXT DEFAULT 'UTILITY',
      meta_status TEXT DEFAULT 'PENDING',
      is_active INTEGER DEFAULT 1,
      channel TEXT DEFAULT 'whatsapp',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

    CREATE TABLE IF NOT EXISTS in_app_notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'info',
      ticket_id TEXT,
      complaint_id INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      customer_name TEXT,
      target_role TEXT DEFAULT 'all',
      target_technician_id INTEGER,
      target_technician_name TEXT,
      performed_by_name TEXT,
      performed_by_role TEXT,
      performed_by_user_id INTEGER,
      read_by TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT DEFAULT 'Sun',
      description TEXT,
      is_custom INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS issue_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_type TEXT NOT NULL,
      category_name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_type, category_name)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER,
      phone TEXT NOT NULL,
      sender_type TEXT NOT NULL CHECK(sender_type IN ('customer', 'company', 'technician')),
      sender_name TEXT,
      message_body TEXT,
      media_id TEXT,
      media_type TEXT,
      media_url TEXT,
      media_caption TEXT,
      wam_id TEXT UNIQUE,
      status TEXT DEFAULT 'received',
      template_name TEXT,
      template_version TEXT,
      failure_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS whatsapp_raw_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT,
      wam_id TEXT,
      waba_id TEXT,
      phone_number_id TEXT,
      sender_phone TEXT,
      recipient_phone TEXT,
      direction TEXT CHECK(direction IN ('inbound', 'outbound', 'status')),
      event_type TEXT,
      status TEXT,
      error_code TEXT,
      error_message TEXT,
      raw_payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_complaint ON whatsapp_messages(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_phone ON whatsapp_messages(phone);
    CREATE INDEX IF NOT EXISTS idx_raw_events_wamid ON whatsapp_raw_events(wam_id);
    CREATE INDEX IF NOT EXISTS idx_raw_events_phone ON whatsapp_raw_events(sender_phone);
    CREATE INDEX IF NOT EXISTS idx_raw_events_dir ON whatsapp_raw_events(direction);

    CREATE INDEX IF NOT EXISTS idx_complaints_ticket ON complaints(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_phone ON complaints(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_complaints_tech ON complaints(assigned_technician_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_complaint ON complaint_timelines(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_notif_complaint ON notification_logs(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_categories_product ON issue_categories(product_type);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON installed_customers(customer_name);
    CREATE INDEX IF NOT EXISTS idx_customers_mobile ON installed_customers(consumer_mobile);
    CREATE INDEX IF NOT EXISTS idx_customers_consumer_no ON installed_customers(consumer_no);
    CREATE INDEX IF NOT EXISTS idx_customers_city ON installed_customers(city_village);
    CREATE INDEX IF NOT EXISTS idx_customers_dealer ON installed_customers(dealer_name);
    CREATE INDEX IF NOT EXISTS idx_customers_inverter ON installed_customers(inverter_serial);
  `);

  // Seed default product catalog
  const defaultProducts = [
    { name: 'Solar Rooftop Systems', icon: 'Sun', description: 'On-grid & off-grid inverters, panels, net meters, tripping issues' },
    { name: 'Solar Water Heaters', icon: 'Flame', description: 'ETC & FPC collector tanks, scaling, plumbing, non-heating' },
    { name: 'Heat Pumps', icon: 'AirVent', description: 'Commercial & residential heat pumps, compressor tripping, error codes' },
    { name: 'Pressure Pumps', icon: 'Droplets', description: 'Booster pumps, pressure drop, continuous run, motor jamming' },
    { name: 'Other', icon: 'Box', description: 'General solar & electrical maintenance requests' }
  ];
  const insertProd = db.prepare(`
    INSERT OR IGNORE INTO products (name, icon, description, is_custom)
    VALUES (?, ?, ?, 0)
  `);
  for (const p of defaultProducts) {
    insertProd.run(p.name, p.icon, p.description);
  }

  // Seed default issue categories per product
  const defaultCategories = [
    // Solar Rooftop Systems
    { product_type: 'Solar Rooftop Systems', category_name: 'No Power Output' },
    { product_type: 'Solar Rooftop Systems', category_name: 'Inverter Fault / Error Code' },
    { product_type: 'Solar Rooftop Systems', category_name: 'Grid Breaker Tripping' },
    { product_type: 'Solar Rooftop Systems', category_name: 'Cable / Connector Damage' },
    { product_type: 'Solar Rooftop Systems', category_name: 'AMC / Panel Cleaning' },
    { product_type: 'Solar Rooftop Systems', category_name: 'Monitoring App Offline' },
    { product_type: 'Solar Rooftop Systems', category_name: 'Other Rooftop Issue' },

    // Solar Water Heaters
    { product_type: 'Solar Water Heaters', category_name: 'Water Leakage from Tank' },
    { product_type: 'Solar Water Heaters', category_name: 'Cold Water Inlet / Pipe Issue' },
    { product_type: 'Solar Water Heaters', category_name: 'Low Water Temperature' },
    { product_type: 'Solar Water Heaters', category_name: 'Scale Formation / Descaling' },
    { product_type: 'Solar Water Heaters', category_name: 'Air Vent Valve Issue' },
    { product_type: 'Solar Water Heaters', category_name: 'Electrical Backup Heater Fault' },
    { product_type: 'Solar Water Heaters', category_name: 'Other Water Heater Issue' },

    // Heat Pumps
    { product_type: 'Heat Pumps', category_name: 'Compressor Tripping' },
    { product_type: 'Heat Pumps', category_name: 'Water Not Heating to Set Temp' },
    { product_type: 'Heat Pumps', category_name: 'Display Error Code (F1/F2)' },
    { product_type: 'Heat Pumps', category_name: 'Unusual Noise / Vibration' },
    { product_type: 'Heat Pumps', category_name: 'Circulation Pump Failure' },
    { product_type: 'Heat Pumps', category_name: 'Refrigerant Leak / Pressure Drop' },
    { product_type: 'Heat Pumps', category_name: 'Other Heat Pump Issue' },

    // Pressure Pumps
    { product_type: 'Pressure Pumps', category_name: 'Pump Not Starting / No Power' },
    { product_type: 'Pressure Pumps', category_name: 'Low Pressure / Uneven Flow' },
    { product_type: 'Pressure Pumps', category_name: 'Continuous Running / Won\'t Turn Off' },
    { product_type: 'Pressure Pumps', category_name: 'Water Leakage from Body/Joints' },
    { product_type: 'Pressure Pumps', category_name: 'Pressure Controller / Switch Fault' },
    { product_type: 'Pressure Pumps', category_name: 'Motor Overheating / Burning Smell' },
    { product_type: 'Pressure Pumps', category_name: 'Other Pressure Pump Issue' },

    // Other
    { product_type: 'Other', category_name: 'Equipment Not Turning On' },
    { product_type: 'Other', category_name: 'Performance Degradation' },
    { product_type: 'Other', category_name: 'Physical / Mechanical Damage' },
    { product_type: 'Other', category_name: 'Electrical / Wiring Short Circuit' },
    { product_type: 'Other', category_name: 'Periodic Maintenance / Inspection' },
    { product_type: 'Other', category_name: 'Other Issue' }
  ];

  const insertCat = db.prepare(`
    INSERT OR IGNORE INTO issue_categories (product_type, category_name, is_default)
    VALUES (?, ?, 1)
  `);
  for (const c of defaultCategories) {
    insertCat.run(c.product_type, c.category_name);
  }
}

function migrateComplaintsTable() {
  try {
    const tableSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='complaints'").get();
    if (!tableSqlRow) return;

    // Check if table needs recreation (missing Unassigned status or has restrictive product_type check)
    if (!tableSqlRow.sql.includes('Unassigned') || tableSqlRow.sql.includes("CHECK(product_type IN")) {
      console.log('Migrating complaints table schema to support dynamic products and company settlement fields...');
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
          { name: 'company_settlement_status', type: "TEXT DEFAULT 'Pending Settlement'" },
          { name: 'company_settled_at', type: 'DATETIME' },
          { name: 'company_settled_by', type: 'TEXT' },
          { name: 'status_updated_at', type: 'DATETIME' }
        ];
        for (const col of colDefs) {
          if (!columnNames.includes(col.name)) {
            db.exec(`ALTER TABLE complaints ADD COLUMN ${col.name} ${col.type}`);
          }
        }

        // 2. Rename old table
        db.exec(`ALTER TABLE complaints RENAME TO complaints_old`);

        // 3. Create new complaints table with dynamic product_type and company settlement fields
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
            company_settlement_status TEXT DEFAULT 'Pending Settlement',
            company_settled_at DATETIME,
            company_settled_by TEXT,
            product_type TEXT NOT NULL,
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
            company_settlement_status, company_settled_at, company_settled_by,
            product_type, product_serial, installation_id, issue_category, issue_description,
            priority, status, assigned_technician_id, expected_visit_date, resolution_notes,
            spare_parts_used, closing_photo_url, rating, feedback_comments, registered_by_user_id,
            created_at, status_updated_at, assigned_at, resolved_at, closed_at, updated_at
          )
          SELECT 
            id, ticket_id, customer_name, customer_phone, customer_email, customer_address,
            city, consumer_no, order_no, location_url, COALESCE(is_in_warranty, 1), COALESCE(estimated_charges, 0),
            COALESCE(notify_charges, 0), COALESCE(payment_collected, 0), COALESCE(payment_status, 'Unpaid'),
            COALESCE(company_settlement_status, 'Pending Settlement'), company_settled_at, company_settled_by,
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
            createSql: 'CREATE TABLE complaint_attachments_new (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_id INTEGER NOT NULL, file_name TEXT NOT NULL, file_url TEXT NOT NULL, file_type TEXT, file_data TEXT, uploaded_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE)',
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
        { name: 'invoice_no', type: 'TEXT' },
        { name: 'invoice_date', type: 'TEXT' },
        { name: 'location_url', type: 'TEXT' },
        { name: 'is_in_warranty', type: 'INTEGER DEFAULT 1' },
        { name: 'estimated_charges', type: 'REAL DEFAULT 0' },
        { name: 'notify_charges', type: 'INTEGER DEFAULT 0' },
        { name: 'payment_collected', type: 'REAL DEFAULT 0' },
        { name: 'payment_collected_at', type: 'DATETIME' },
        { name: 'payment_mode', type: "TEXT DEFAULT 'Cash'" },
        { name: 'payment_status', type: "TEXT DEFAULT 'Unpaid'" },
        { name: 'status_updated_at', type: 'DATETIME' }
      ];

      for (const col of newColumns) {
        if (!columnNames.includes(col.name)) {
          db.exec(`ALTER TABLE complaints ADD COLUMN ${col.name} ${col.type}`);
        }
      }
      db.exec(`UPDATE complaints SET status_updated_at = created_at WHERE status_updated_at IS NULL`);
      db.exec(`UPDATE complaints SET payment_collected_at = status_updated_at WHERE payment_collected > 0 AND payment_collected_at IS NULL`);

      // WhatsApp Number Registry (tracks verified vs non-WhatsApp/Invite-required numbers)
      db.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_number_registry (
          phone TEXT PRIMARY KEY,
          is_whatsapp_active INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'verified',
          customer_name TEXT,
          source TEXT,
          notes TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed 9510244013 as Invite Required / No WhatsApp
      try {
        db.prepare(`
          INSERT OR REPLACE INTO whatsapp_number_registry (phone, is_whatsapp_active, status, customer_name, source, notes)
          VALUES ('9510244013', 0, 'invite_required', 'Unknown / Non-WhatsApp User', 'whatsapp_app_check', 'Customer has not registered on WhatsApp. Invite to WhatsApp required.')
        `).run();
      } catch (e) {}
    }
  } catch (e) {
    console.warn('Complaints table migration note:', e.message);
  }
}

function migrateWhatsAppMessagesTable() {
  try {
    const cols = db.prepare("PRAGMA table_info(whatsapp_messages)").all().map(c => c.name);
    if (!cols.includes('template_name')) {
      db.exec("ALTER TABLE whatsapp_messages ADD COLUMN template_name TEXT");
    }
    if (!cols.includes('template_version')) {
      db.exec("ALTER TABLE whatsapp_messages ADD COLUMN template_version TEXT");
    }
    if (!cols.includes('failure_reason')) {
      db.exec("ALTER TABLE whatsapp_messages ADD COLUMN failure_reason TEXT");
    }
    if (!cols.includes('updated_at')) {
      db.exec("ALTER TABLE whatsapp_messages ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    }
  } catch (e) {
    console.warn('[Database] WhatsApp messages migration note:', e.message);
  }
}

function migrateNotificationTemplates() {
  try {
    const cols = db.prepare("PRAGMA table_info(notification_templates)").all().map(c => c.name);
    if (!cols.includes('audience')) {
      db.exec("ALTER TABLE notification_templates ADD COLUMN audience TEXT DEFAULT 'customer'");
    }
    if (!cols.includes('trigger_event')) {
      db.exec("ALTER TABLE notification_templates ADD COLUMN trigger_event TEXT DEFAULT 'manual'");
    }
    if (!cols.includes('meta_template_name')) {
      db.exec("ALTER TABLE notification_templates ADD COLUMN meta_template_name TEXT");
    }
    if (!cols.includes('meta_language')) {
      db.exec("ALTER TABLE notification_templates ADD COLUMN meta_language TEXT DEFAULT 'en_US'");
    }
    if (!cols.includes('meta_category')) {
      db.exec("ALTER TABLE notification_templates ADD COLUMN meta_category TEXT DEFAULT 'UTILITY'");
    }
    if (!cols.includes('meta_status')) {
      db.exec("ALTER TABLE notification_templates ADD COLUMN meta_status TEXT DEFAULT 'PENDING'");
    }
    if (!cols.includes('is_active')) {
      db.exec("ALTER TABLE notification_templates ADD COLUMN is_active INTEGER DEFAULT 1");
    }
    if (!cols.includes('channel')) {
      db.exec("ALTER TABLE notification_templates ADD COLUMN channel TEXT DEFAULT 'whatsapp'");
    }
    if (!cols.includes('created_at')) {
      db.exec("ALTER TABLE notification_templates ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    }

    const defaults = [
      {
        key: 'complaint_registered',
        name: 'Complaint Registered Notification',
        audience: 'customer',
        trigger_event: 'complaint_registered',
        meta_template_name: 'complaint_registered',
        meta_language: 'en_US',
        meta_category: 'UTILITY',
        meta_status: 'APPROVED',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `☀️ *Eco Green Solar Support*\n\nDear {{customer_name}}, your service complaint has been successfully registered.\n\n📌 *Ticket ID:* {{complaint_id}}\n🔧 *Product:* {{product_type}}\n📅 *Date:* {{date}}{{charges_line}}\n\nOur team is reviewing your ticket and will assign a technician shortly.\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`,
        email_subject: `[Eco Green Solar] Service Complaint Registered - {{complaint_id}}`,
        email_body: `Dear {{customer_name}},\n\nThank you for contacting Eco Green Solar Care. Your service complaint has been successfully registered.\n\nTicket ID: {{complaint_id}}\nProduct: {{product_type}}\nIssue: {{issue_category}}\n\nOur technical support team is reviewing your ticket and will assign a specialist technician shortly. You can track your complaint status live at any time.`
      },
      {
        key: 'technician_assigned',
        name: 'Technician Assigned Notification',
        audience: 'customer',
        trigger_event: 'technician_assigned',
        meta_template_name: 'technician_assigned',
        meta_language: 'en_US',
        meta_category: 'UTILITY',
        meta_status: 'APPROVED',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `☀️ *Eco Green Solar Update*\n\nHello {{customer_name}}, a service technician has been assigned to your complaint *{{complaint_id}}*.\n\n👨‍🔧 *Technician:* {{technician_name}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\n🔗 *Track Status:* {{feedback_url}}\n- Eco Green Solar`,
        email_subject: `[Eco Green Solar] Technician Assigned - {{complaint_id}}`,
        email_body: `Dear {{customer_name}},\n\nA certified technician has been assigned to resolve your complaint.\n\nTechnician Name: {{technician_name}}\nExpected Visit Date: {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.`
      },
      {
        key: 'customer_technician_reassigned',
        name: 'Customer Technician Reassigned Notice',
        audience: 'customer',
        trigger_event: 'customer_technician_reassigned',
        meta_template_name: 'customer_technician_reassigned',
        meta_language: 'en_US',
        meta_category: 'UTILITY',
        meta_status: 'PENDING',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `☀️ *Eco Green Solar - Technician Reassigned*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* ({{product_type}}) has been reassigned to a new technician.\n\n👷 *New Technician:* {{technician_name}}\n📞 *Mobile:* {{technician_phone}}\n📅 *Estimated Visit:* {{expected_visit_date}}\n\nOur service engineer will contact you shortly to coordinate your visit.\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
        email_subject: `[Eco Green Solar] Service Technician Update - Ticket {{complaint_id}}`,
        email_body: `Dear {{customer_name}},\n\nYour complaint ticket {{complaint_id}} has been reassigned to technician {{technician_name}} (Phone: {{technician_phone}}).\n\nScheduled Date: {{expected_visit_date}}\n\nOur team is working to resolve your issue as soon as possible.`
      },
      {
        key: 'status_update',
        name: 'Status & Follow-up Note Update',
        audience: 'customer',
        trigger_event: 'status_update',
        meta_template_name: 'status__followup_note_update',
        meta_language: 'en',
        meta_category: 'UTILITY',
        meta_status: 'APPROVED',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `☀️ *Eco Green Solar Alert*\n\nUpdate on Complaint *{{complaint_id}}* ({{product_type}}):\nStatus: *{{status}}*\n\n📝 *Notes:* {{notes}}\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
        email_subject: `[Eco Green Solar] Status Update - Ticket {{complaint_id}}`,
        email_body: `Dear {{customer_name}},\n\nAn update has been logged for your complaint ticket {{complaint_id}}.\n\nCurrent Status: {{status}}\nUpdate Details: {{notes}}\n\nWe remain committed to resolving your issue promptly.`
      },
      {
        key: 'complaint_resolved',
        name: 'Complaint Resolved Notification',
        audience: 'customer',
        trigger_event: 'complaint_resolved',
        meta_template_name: 'complaint_resolved',
        meta_language: 'en_US',
        meta_category: 'UTILITY',
        meta_status: 'APPROVED',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `☀️ *Eco Green Solar Resolution*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been marked as *RESOLVED* by technician {{technician_name}}.\n\n✅ *Resolution Notes:* {{notes}}\n\nOur quality desk will verify and close the ticket shortly. If you have any questions, please contact our helpline.\n\n🔗 *View Details:* {{feedback_url}}\n- Eco Green Solar`,
        email_subject: `[Eco Green Solar] Issue Resolved - Ticket {{complaint_id}}`,
        email_body: `Dear {{customer_name}},\n\nOur field technician has addressed the issue on your {{product_type}} (Ticket ID: {{complaint_id}}).\n\nResolution Summary: {{notes}}\n\nOur support desk will verify the resolution and close the ticket.`
      },
      {
        key: 'complaint_closed',
        name: 'Complaint Closed & Feedback Request',
        audience: 'customer',
        trigger_event: 'complaint_closed',
        meta_template_name: 'complaint_closed__feedback_request',
        meta_language: 'en',
        meta_category: 'UTILITY',
        meta_status: 'APPROVED',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `☀️ *Eco Green Solar Closure*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been resolved and closed. Thank you for choosing clean energy!\n\n⭐ *Please rate your service experience (1-5 Stars):*\n{{feedback_url}}\n\nYour feedback helps us continuously improve!\n- Eco Green Solar Care`,
        email_subject: `[Eco Green Solar] Complaint Closed - {{complaint_id}} | Please Rate Us`,
        email_body: `Dear {{customer_name}},\n\nYour service complaint under ticket ID {{complaint_id}} is now closed.\n\nPlease take 30 seconds to rate your service experience by clicking the link below.`
      },
      {
        key: 'complaint_reopened',
        name: 'Complaint Reopened Notification',
        audience: 'customer',
        trigger_event: 'complaint_reopened',
        meta_template_name: 'complaint_reopened_notification',
        meta_language: 'en',
        meta_category: 'UTILITY',
        meta_status: 'APPROVED',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `☀️ *Eco Green Solar Priority Alert*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been *REOPENED* upon your request.\n\nA senior service supervisor will review the case and arrange an expedited follow-up.\n\n🔗 *Track:* {{feedback_url}}\n- Eco Green Solar`,
        email_subject: `[Eco Green Solar] Complaint Reopened - {{complaint_id}}`,
        email_body: `Dear {{customer_name}},\n\nWe have received your request to reopen complaint ticket {{complaint_id}}.\n\nOur senior operations lead will review the service history and arrange an immediate re-inspection.`
      },
      {
        key: 'technician_work_order',
        name: 'Technician Work Order (Job Assignment)',
        audience: 'technician',
        trigger_event: 'technician_work_order',
        meta_template_name: 'technician_work_order',
        meta_language: 'en_US',
        meta_category: 'UTILITY',
        meta_status: 'APPROVED',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `🛠️ *Eco Green Solar - New Job Assignment*\n\nHello {{technician_name}}, you have been assigned ticket *{{complaint_id}}*.\n\n👤 *Customer:* {{customer_name}}\n📞 *Customer Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Product:* {{product_type}}\n⚠️ *Issue:* {{issue_category}} - {{notes}}\n🚨 *Priority:* {{priority}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\nPlease check your Eco Green technician portal for details and coordinate with the customer.`,
        email_subject: `[Eco Green Solar] Work Order: Ticket #{{complaint_id}} - {{customer_name}}`,
        email_body: `Dear {{technician_name}},\n\nYou have been assigned to service complaint ticket #{{complaint_id}}.\n\nCustomer: {{customer_name}}\nPhone: {{customer_phone}}\nAddress: {{customer_address}}\nProduct: {{product_type}}\nIssue Category: {{issue_category}}\nDetails: {{notes}}\nPriority: {{priority}}\nScheduled Visit: {{expected_visit_date}}\n\nPlease log in to your Technician Portal to view complete details, update progress, and record spare parts or payment collections.`
      },
      {
        key: 'technician_reminder',
        name: 'Technician Pending Visit Reminder',
        audience: 'technician',
        trigger_event: 'technician_reminder',
        meta_template_name: 'technician_pending_visit_reminder',
        meta_language: 'en',
        meta_category: 'UTILITY',
        meta_status: 'APPROVED',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `⏰ *Eco Green Solar - Job Reminder*\n\nHello {{technician_name}}, this is a friendly reminder for scheduled ticket *{{complaint_id}}*.\n\n👤 *Customer:* {{customer_name}}\n📞 *Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n📅 *Visit Date:* {{expected_visit_date}}\n\nPlease contact the customer before visiting and ensure the service is updated in your portal.`,
        email_subject: `[Eco Green Solar] Reminder: Scheduled Visit for Ticket #{{complaint_id}}`,
        email_body: `Dear {{technician_name}},\n\nReminder: You have a scheduled service visit for ticket #{{complaint_id}} (Customer: {{customer_name}}, Address: {{customer_address}}).\n\nPlease ensure your visit is completed on schedule.`
      },
      {
        key: 'technician_reassigned',
        name: 'Technician Job Reassigned Notice',
        audience: 'technician',
        trigger_event: 'technician_reassigned',
        meta_template_name: 'technician_job_reassigned_notice',
        meta_language: 'en',
        meta_category: 'UTILITY',
        meta_status: 'PENDING',
        is_active: 1,
        channel: 'whatsapp',
        whatsapp_body: `⚠️ *Eco Green Solar - Job Update*\n\nHello {{technician_name}}, please note that ticket *{{complaint_id}}* (Customer: {{customer_name}}) has been reassigned or updated.\n\n📝 *Notes:* {{notes}}\n\nPlease check your Eco Green technician portal for your latest schedule.\n- Eco Green Dispatch`,
        email_subject: `[Eco Green Solar] Job Update: Ticket #{{complaint_id}} - {{customer_name}}`,
        email_body: `Dear {{technician_name}},\n\nThis is to notify you that complaint ticket #{{complaint_id}} (Customer: {{customer_name}}) has been reassigned or updated.\n\nNotes: {{notes}}\n\nPlease check your Technician Portal for your latest active dispatch schedule.`
      }
    ];

    const insertOrUpdate = db.prepare(`
      INSERT INTO notification_templates (
        template_key, name, whatsapp_body, email_subject, email_body,
        audience, trigger_event, meta_template_name, meta_language, meta_category, meta_status, is_active, channel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(template_key) DO UPDATE SET
        name = COALESCE(notification_templates.name, excluded.name),
        audience = CASE WHEN notification_templates.audience IS NULL OR notification_templates.audience = '' THEN excluded.audience ELSE notification_templates.audience END,
        trigger_event = CASE WHEN notification_templates.trigger_event IS NULL OR notification_templates.trigger_event = '' OR notification_templates.trigger_event = 'manual' THEN excluded.trigger_event ELSE notification_templates.trigger_event END,
        meta_template_name = CASE WHEN notification_templates.meta_template_name IS NULL OR notification_templates.meta_template_name = '' THEN excluded.meta_template_name ELSE notification_templates.meta_template_name END,
        meta_language = COALESCE(notification_templates.meta_language, excluded.meta_language),
        meta_category = COALESCE(notification_templates.meta_category, excluded.meta_category),
        meta_status = COALESCE(notification_templates.meta_status, excluded.meta_status),
        is_active = COALESCE(notification_templates.is_active, excluded.is_active),
        channel = COALESCE(notification_templates.channel, excluded.channel)
    `);

    defaults.forEach(t => {
      insertOrUpdate.run(
        t.key, t.name, t.whatsapp_body, t.email_subject, t.email_body,
        t.audience, t.trigger_event, t.meta_template_name, t.meta_language, t.meta_category, t.meta_status, t.is_active, t.channel
      );
    });

  } catch (e) {
    console.warn('[Database] Notification templates migration note:', e.message);
  }
}

function migrateUsersTable() {
  try {
    const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!cols.includes('username')) {
      db.exec("ALTER TABLE users ADD COLUMN username TEXT");
    }
    db.prepare("UPDATE users SET username = 'admin', phone = '6352454247' WHERE email = 'admin@ecogreensolar.com'").run();
    db.prepare("UPDATE users SET phone = '6352454247' WHERE role = 'admin'").run();
    db.prepare("UPDATE users SET username = 'staff' WHERE email = 'staff@ecogreensolar.com' AND (username IS NULL OR username = '')").run();
    db.prepare("UPDATE users SET username = 'rohit' WHERE email = 'rohit.tech@ecogreensolar.com' AND (username IS NULL OR username = '')").run();
    db.prepare("UPDATE users SET username = 'vikram' WHERE email = 'vikram.tech@ecogreensolar.com' AND (username IS NULL OR username = '')").run();
    db.prepare("UPDATE users SET username = 'suresh' WHERE email = 'suresh.tech@ecogreensolar.com' AND (username IS NULL OR username = '')").run();
    db.prepare("UPDATE users SET username = 'manoj' WHERE email = 'manoj.tech@ecogreensolar.com' AND (username IS NULL OR username = '')").run();
    db.prepare("UPDATE users SET username = SUBSTR(email, 1, INSTR(email, '@') - 1) WHERE (username IS NULL OR username = '') AND INSTR(email, '@') > 1").run();
  } catch (e) {
    console.warn('[Database] Users table migration note:', e.message);
  }
}

function migrateTechniciansAndComplaints() {
  try {
    // 1. Link technicians.user_id from users table if null
    db.prepare(`
      UPDATE technicians 
      SET user_id = (
        SELECT id FROM users 
        WHERE users.role = 'technician' 
          AND (LOWER(users.email) = LOWER(technicians.email) OR users.name = technicians.name) 
        LIMIT 1
      )
      WHERE user_id IS NULL
    `).run();

    // 2. Auto-repair complaints where status is not Unassigned but assigned_technician_id is NULL
    const unlinkedComplaints = db.prepare(`
      SELECT c.id, c.ticket_id, ct.notes 
      FROM complaints c
      JOIN complaint_timelines ct ON c.id = ct.complaint_id
      WHERE c.assigned_technician_id IS NULL 
        AND ct.action = 'Assigned'
    `).all();

    const techs = db.prepare('SELECT id, name FROM technicians').all();
    for (const c of unlinkedComplaints) {
      for (const t of techs) {
        if (c.notes && c.notes.includes(t.name)) {
          db.prepare('UPDATE complaints SET assigned_technician_id = ? WHERE id = ?').run(t.id, c.id);
          break;
        }
      }
    }
  } catch (err) {
    console.warn('[Database] Technicians and complaints auto-repair note:', err.message);
  }
}

function migrateAttachmentsTable() {
  try {
    const columns = db.pragma('table_info(complaint_attachments)');
    const columnNames = columns.map(c => c.name);
    if (!columnNames.includes('file_data')) {
      db.exec('ALTER TABLE complaint_attachments ADD COLUMN file_data TEXT');
      console.log('✅ Added file_data column to local complaint_attachments');
    }
  } catch (err) {
    console.warn('[Database] Attachments migration note:', err.message);
  }
}

try {
  db.prepare("UPDATE notification_templates SET whatsapp_body = REPLACE(whatsapp_body, '1800-ECO-SOLAR', '+91 78784 44414') WHERE whatsapp_body LIKE '%1800-ECO-SOLAR%'").run();
} catch (e) {}

initializeSchema();
migrateComplaintsTable();
migrateAttachmentsTable();
migrateWhatsAppMessagesTable();
migrateUsersTable();
migrateTechniciansAndComplaints();

// Attach Supabase continuous cloud sync hook
const supabaseSync = require('../services/supabaseSyncService');
supabaseSync.hookDatabase(db);

// Attach Turso continuous cloud sync hook (fallback or parallel cloud replication)
const tursoSync = require('../services/tursoSyncService');
tursoSync.hookDatabase(db);

// Trigger startup sync from Supabase Cloud (or Turso Cloud)
if (supabaseSync.isEnabled) {
  supabaseSync.pullFromCloud(db).then(() => {
    migrateNotificationTemplates();
    migrateTechniciansAndComplaints();
    migrateAttachmentsTable();
  }).catch(err => {
    console.error('[Database] Initial Supabase pull failed:', err.message);
    migrateNotificationTemplates();
    migrateTechniciansAndComplaints();
    migrateAttachmentsTable();
  });
} else if (tursoSync.isEnabled) {
  tursoSync.pullFromCloud(db).then(() => {
    migrateNotificationTemplates();
    migrateTechniciansAndComplaints();
    migrateAttachmentsTable();
  }).catch(err => {
    console.error('[Database] Initial Turso pull failed:', err.message);
    migrateNotificationTemplates();
    migrateTechniciansAndComplaints();
    migrateAttachmentsTable();
  });
} else {
  migrateNotificationTemplates();
  migrateTechniciansAndComplaints();
  migrateAttachmentsTable();
}

module.exports = db;
