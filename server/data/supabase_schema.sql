-- ====================================================================
-- ECO GREEN SOLAR CMS - SUPABASE (POSTGRESQL) SCHEMA MIGRATION
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ====================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'technician')),
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. TECHNICIANS TABLE
CREATE TABLE IF NOT EXISTS technicians (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  area_zone TEXT NOT NULL,
  specialization TEXT NOT NULL,
  is_available INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. PRODUCTS CATALOG TABLE
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT 'Sun',
  description TEXT,
  is_custom INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. ISSUE CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS issue_categories (
  id BIGSERIAL PRIMARY KEY,
  product_type TEXT NOT NULL,
  category_name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_type, category_name)
);

-- 5. COMPLAINTS (SERVICE TICKETS) TABLE
CREATE TABLE IF NOT EXISTS complaints (
  id BIGSERIAL PRIMARY KEY,
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
  estimated_charges NUMERIC(10,2) DEFAULT 0,
  notify_charges INTEGER DEFAULT 0,
  payment_collected NUMERIC(10,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'Unpaid',
  payment_mode TEXT,
  company_settlement_status TEXT DEFAULT 'Pending Settlement',
  company_settled_at TIMESTAMPTZ,
  company_settled_by TEXT,
  product_type TEXT NOT NULL,
  product_serial TEXT,
  installation_id TEXT,
  issue_category TEXT NOT NULL,
  issue_description TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('Low', 'Medium', 'High', 'Urgent')) DEFAULT 'Medium',
  status TEXT NOT NULL CHECK(status IN ('Registered', 'Unassigned', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Reopened')) DEFAULT 'Unassigned',
  assigned_technician_id BIGINT REFERENCES technicians(id) ON DELETE SET NULL,
  expected_visit_date DATE,
  resolution_notes TEXT,
  spare_parts_used TEXT,
  closing_photo_url TEXT,
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  feedback_comments TEXT,
  registered_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  status_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  payment_collected_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. COMPLAINT ATTACHMENTS (DOCUMENTS & PHOTOS)
CREATE TABLE IF NOT EXISTS complaint_attachments (
  id BIGSERIAL PRIMARY KEY,
  complaint_id BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_data TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. COMPLAINT TIMELINES
CREATE TABLE IF NOT EXISTS complaint_timelines (
  id BIGSERIAL PRIMARY KEY,
  complaint_id BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  notes TEXT,
  performed_by_name TEXT NOT NULL,
  performed_by_role TEXT NOT NULL,
  notify_customer INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. NOTIFICATION TEMPLATES
CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGSERIAL PRIMARY KEY,
  template_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  whatsapp_body TEXT NOT NULL,
  email_subject TEXT NOT NULL,
  email_body TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. NOTIFICATION LOGS
CREATE TABLE IF NOT EXISTS notification_logs (
  id BIGSERIAL PRIMARY KEY,
  complaint_id BIGINT REFERENCES complaints(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK(channel IN ('whatsapp', 'email')),
  recipient TEXT NOT NULL,
  template_key TEXT NOT NULL,
  rendered_content TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'pending')),
  error_message TEXT,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. INSTALLED CUSTOMERS MASTER DIRECTORY
CREATE TABLE IF NOT EXISTS installed_customers (
  id BIGSERIAL PRIMARY KEY,
  sr_no INTEGER,
  order_no TEXT,
  scheme TEXT,
  pv_capacity NUMERIC(10,2),
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
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. WHATSAPP MESSAGES
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  complaint_id BIGINT REFERENCES complaints(id) ON DELETE SET NULL,
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
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. WHATSAPP RAW EVENTS AUDIT
CREATE TABLE IF NOT EXISTS whatsapp_raw_events (
  id BIGSERIAL PRIMARY KEY,
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
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ================= PERFORMANCE INDEXES =================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_technicians_user_id ON technicians(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_ticket ON complaints(ticket_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_phone ON complaints(customer_phone);
CREATE INDEX IF NOT EXISTS idx_complaints_tech ON complaints(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_timeline_complaint ON complaint_timelines(complaint_id);
CREATE INDEX IF NOT EXISTS idx_attachment_complaint ON complaint_attachments(complaint_id);
CREATE INDEX IF NOT EXISTS idx_notif_complaint ON notification_logs(complaint_id);
CREATE INDEX IF NOT EXISTS idx_categories_product ON issue_categories(product_type);
CREATE INDEX IF NOT EXISTS idx_customers_name ON installed_customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON installed_customers(consumer_mobile);
CREATE INDEX IF NOT EXISTS idx_customers_consumer_no ON installed_customers(consumer_no);
CREATE INDEX IF NOT EXISTS idx_customers_city ON installed_customers(city_village);
CREATE INDEX IF NOT EXISTS idx_customers_dealer ON installed_customers(dealer_name);
CREATE INDEX IF NOT EXISTS idx_customers_inverter ON installed_customers(inverter_serial);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_complaint ON whatsapp_messages(complaint_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_phone ON whatsapp_messages(phone);
CREATE INDEX IF NOT EXISTS idx_raw_events_wamid ON whatsapp_raw_events(wam_id);
CREATE INDEX IF NOT EXISTS idx_raw_events_phone ON whatsapp_raw_events(sender_phone);
CREATE INDEX IF NOT EXISTS idx_raw_events_dir ON whatsapp_raw_events(direction);
