const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const defaultDir = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const dbPath = process.env.DATABASE_PATH || path.join(defaultDir, 'ecogreen_cms.db');
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_complaint ON whatsapp_messages(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_phone ON whatsapp_messages(phone);

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
        { name: 'invoice_no', type: 'TEXT' },
        { name: 'invoice_date', type: 'TEXT' },
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

function seedAuthenticWhatsAppRecords() {
  try {
    // 1. Purge personal numbers that were accidentally imported from local desktop WhatsApp
    const badPhones = [
      '916352454247', '919426529550', '919662729804', '919825112345', 
      '919825099887', '918000123456', '919825011223', '919979795214', '919900011223'
    ];
    const placeholders = badPhones.map(() => '?').join(',');
    db.prepare(`DELETE FROM whatsapp_messages WHERE phone IN (${placeholders}) OR wam_id LIKE 'wam_sumit_%' OR wam_id LIKE 'wam_jay_%' OR wam_id LIKE 'wam_dhaval_%' OR wam_id LIKE 'wam_akshar_%' OR wam_id LIKE 'wam_maa_%' OR wam_id LIKE 'wam_office_%' OR wam_id LIKE 'wam_ge_%' OR wam_id LIKE 'wam_flipkart_%' OR wam_id LIKE 'wam_99797_%'`).run(...badPhones);

    // 2. Ensure real complaints from tickets exist
    const comp114 = db.prepare('SELECT id FROM complaints WHERE ticket_id = ?').get('EGS-2026-000114');
    let comp114Id = comp114?.id;
    if (!comp114Id) {
      const info = db.prepare(`
        INSERT INTO complaints (
          ticket_id, customer_name, customer_phone, customer_email, customer_address,
          city, consumer_no, order_no, is_in_warranty, estimated_charges,
          payment_status, product_type, product_serial, installation_id,
          issue_category, issue_description, priority, status, assigned_technician_id,
          expected_visit_date, created_at, status_updated_at
        ) VALUES (
          'EGS-2026-000114', 'JAVIA BANSIKUMAR CHANDULAL', '+918758883888', 'javia.solar@gmail.com', 'B-204, Green Heights, Opp. Reliance Town',
          'Rajkot', 'CONS-GUJ-88388', 'ORD-2026-9901', 1, 0,
          'Unpaid', 'Solar Rooftop Systems', 'EGS-RT-5KW-9912', 'INST-GUJ-2025-412',
          'Inverter Fault / Zero Generation', 'Inverter display blinking red with Error Code E04, solar generation zero since yesterday morning.', 'High', 'Assigned', 4,
          '2026-09-16', '2026-09-15 16:15:00', '2026-09-15 16:19:00'
        )
      `).run();
      comp114Id = info.lastInsertRowid;
    }

    const comp101 = db.prepare('SELECT id FROM complaints WHERE ticket_id = ?').get('EGS-2026-000101');
    const comp101Id = comp101?.id;

    const comp102 = db.prepare('SELECT id FROM complaints WHERE ticket_id = ?').get('EGS-2026-000102');
    const comp102Id = comp102?.id;

    const comp104 = db.prepare('SELECT id FROM complaints WHERE ticket_id = ?').get('EGS-2026-000104');
    const comp104Id = comp104?.id;

    const comp113 = db.prepare('SELECT id FROM complaints WHERE ticket_id = ?').get('EGS-2026-000113');
    let comp113Id = comp113?.id;
    if (!comp113Id) {
      const info = db.prepare(`
        INSERT INTO complaints (
          ticket_id, customer_name, customer_phone, customer_email, customer_address,
          city, consumer_no, order_no, is_in_warranty, estimated_charges,
          payment_status, product_type, product_serial, installation_id,
          issue_category, issue_description, priority, status, assigned_technician_id,
          expected_visit_date, created_at, status_updated_at
        ) VALUES (
          'EGS-2026-000113', 'Jignesh Patel', '+916354687931', 'jignesh.patel@gmail.com', '45, Sardar Patel Society, Near Kalawad Road',
          'Rajkot', 'CONS-GUJ-77123', 'ORD-2026-8840', 1, 0,
          'Unpaid', 'Solar Rooftop Systems', 'EGS-RT-3KW-5510', 'INST-GUJ-2024-819',
          'Generation Fluctuation', 'Solar generation drops sharply in afternoon, requesting technician site inspection.', 'Medium', 'In Progress', 1,
          '2026-09-15', '2026-09-15 10:15:00', '2026-09-15 10:35:00'
        )
      `).run();
      comp113Id = info.lastInsertRowid;
    }

    // No mock messages seeded. Real messages will be permanently recorded via webhooks and staff replies.
  } catch (err) {
    console.warn('[Database] initialization note:', err.message);
  }
}

// Clean out legacy mock messages, queue, and personal chats from desktop WhatsApp
try {
  db.prepare("DELETE FROM whatsapp_outgoing_queue").run();
} catch (e) {}

try {
  // Clean only synthetic mock seed IDs (escaped so underscore is not a wildcard, NEVER deleting Meta 'wamid.' messages)
  db.prepare("DELETE FROM whatsapp_messages WHERE wam_id LIKE 'wam\\_seed\\_%' ESCAPE '\\' OR wam_id LIKE 'wam\\_mock\\_%' ESCAPE '\\'").run();
  db.prepare(`
    DELETE FROM whatsapp_messages 
    WHERE phone LIKE '%6352454247%' 
       OR phone LIKE '%9426529550%'
       OR phone LIKE '%9662729804%'
       OR phone LIKE '%9825112345%'
       OR phone LIKE '%9825099887%'
       OR phone LIKE '%9825011223%'
       OR phone LIKE '%9900011223%'
       OR sender_name LIKE '%akshar%' 
       OR sender_name LIKE '%અક્ષર%' 
       OR sender_name LIKE '%jay%' 
       OR sender_name LIKE '%જય%' 
       OR sender_name LIKE '%dhaval%' 
       OR sender_name LIKE '%ધવલ%' 
       OR sender_name LIKE '%sumit%'
       OR message_body LIKE '%અક્ષર%'
       OR message_body LIKE '%instagram.com/reel%'
       OR wam_id LIKE 'wam_jay_%'
       OR wam_id LIKE 'wam_dhaval_%'
  `).run();
} catch (e) {}

try {
  db.prepare("UPDATE notification_templates SET whatsapp_body = REPLACE(whatsapp_body, '1800-ECO-SOLAR', '+91 78784 44414') WHERE whatsapp_body LIKE '%1800-ECO-SOLAR%'").run();
} catch (e) {}

initializeSchema();
migrateComplaintsTable();

module.exports = db;
