# ☀️ Eco Green Solar — Complaint Management System (CMS)

A full-stack Complaint Management System built for **Eco Green Solar**, servicing **Solar Rooftop Systems**, **Solar Water Heaters**, and **Heat Pumps**.

The system enables customers to raise and track complaints, allows support staff to assign certified field technicians, enables technicians to log visit updates and resolution proof on mobile, and automatically notifies customers across key stages via **WhatsApp** and **Email**.

---

## 🌟 Key Features

### 1. 6,102 Customer Database & 5-Year Dynamic Warranty Engine
- **Network Excel Integration**: Direct sync from master installation database (`\\As6302t-989d\work\2023-24\Solar Rooftop\NP - Site Visit, 3D\SUMIT\All Customer - FINAL.xls`, Sheet: `ALL CUSTOMER`).
- **5-Year Warranty Calculation Rule**:
  - $\le 5$ years from Invoice Date $\rightarrow$ **🟢 IN WARRANTY** (Free service & part replacement).
  - $> 5$ years from Invoice Date $\rightarrow$ **🔴 OUT OF WARRANTY** (Paid visit & replacement rates).
  - Current Database Breakdown: **3,623 In-Warranty** (59.4%) vs **2,479 Out-of-Warranty** (40.6%).
- **Google-Style Dynamic Typeahead**: Instant multi-token search by Customer Name, Consumer Phone, City/Village, Dealer, Consumer Number, or Inverter Serial.
- **1-Click Autofill**: Automatically populates customer details, plant capacity, inverter serial, and verified warranty status in complaint forms.

### 2. Dedicated Modern Authentication & Public Tracking
- **Modern Login Interface**: Dedicated login portals for Admin, Support Staff, and Field Technicians with 1-click test fill presets.
- **Zero-Login Customer Tracking**: Customers can track tickets, view technician dispatch details, and submit feedback without requiring any login.
- **Clean Logout & Session Isolation**: Secure JWT authentication with desktop & mobile sign out flows.

### 3. Complaint Registration & Ticket Lifecycle
- **Unique Ticket ID**: Auto-generates sequential IDs (e.g. `EGS-2026-000101`).
- **Product Specialization**: Supports Solar Rooftop Systems, Solar Water Heaters, and Heat Pumps with categorized fault trees.
- **Priority Matrix**: Low, Medium, High, and Urgent triage.
- **Lifecycle Stages**: `Registered` ➔ `Assigned` ➔ `In Progress` ➔ `On Hold` ➔ `Resolved` ➔ `Closed` ➔ `Reopened`.
- **Photo & Document Proof**: Upload inverter error photos, tank leak snapshots, and replacement parts proof.

### 4. Multi-Channel WhatsApp & Email Notifications
- **Automated Triggers**:
  1. *Complaint Registered* ➔ WhatsApp & Email to customer with Ticket ID and SLA.
  2. *Technician Assigned* ➔ WhatsApp to technician with customer site address; WhatsApp & Email to customer with technician details & visit date.
  3. *Site Visit Update* ➔ Optional notification toggle for progress notes.
  4. *Issue Resolved* ➔ WhatsApp & Email confirming resolution notes.
  5. *Ticket Closed* ➔ WhatsApp & Email with a 1–5 star customer satisfaction feedback link.
  6. *Ticket Reopened* ➔ High-priority alerts to management and customer.
- **₹0 Free WhatsApp Links**: Direct `wa.me` links to send formatted messages with 1-click from any phone or browser without paid API credits.
- **Interactive Simulated Inbox**: Built-in real-time notification drawer in the UI so you can inspect formatted WhatsApp bubbles and branded HTML emails.
- **Production-Ready**: Pluggable support for **Meta WhatsApp Cloud API**, **Twilio**, and **Nodemailer SMTP** (Amazon SES, SendGrid, Gmail).

### 5. Role-Based Portals & Live Duty Status
- **Admin**: System-wide control, staff/technician management with on-duty/off-duty live status, customer database sync, analytics dashboard, template editor, CSV report export.
- **Support Staff / Front Office**: Complaints desk, smart customer lookup, technician assignment with off-duty warnings, timeline audit logs, ticket closure.
- **Technician Field Portal**: Mobile-first cards, tap-to-call, WhatsApp chat shortcut, Google Maps directions, spare parts logging, and closing photo upload.
- **Customer Portal**: Public tracking by Ticket ID / Phone, live progress stepper, technician contact card, 5-star rating submission, and ticket reopening flow.

### 6. Cloud Deployment & Custom Subdomain (`eco-green-complain.vprotec.online`)
- **Single-Port Production**: Express backend serves the optimized React SPA and all REST APIs simultaneously.
- **Render Ready**: Includes `render.yaml` configuration with automated HTTPS SSL for `eco-green-complain.vprotec.online`.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- npm (v9+)

### Installation

```bash
# 1. Clone or navigate to the project directory
cd eco-green-solar-cms

# 2. Install backend dependencies
cd server
npm install

# 3. Seed initial database with users, technicians, and sample complaints
npm run seed

# 4. Install frontend dependencies
cd ../client
npm install
```

### Running Locally

Open two terminal tabs:

**Terminal 1 (Backend API):**
```bash
cd server
npm start
# Server starts at http://localhost:5000/api
```

**Terminal 2 (Frontend React App):**
```bash
cd client
npm run dev
# Vite dev server starts at http://localhost:5173
```

---

## 👥 Seed Demo Accounts

Use the **Role Switcher** in the top navigation bar to switch roles with a single click, or log in with these credentials:

| Role | Email | Password | Details |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@ecogreensolar.com` | `admin123` | Full administrative control & analytics |
| **Support Staff** | `staff@ecogreensolar.com` | `staff123` | Front-office desk & ticket assignments |
| **Technician** | `rohit.tech@ecogreensolar.com` | `tech123` | Rohit Kumar (North Zone / Rooftop Solar) |
| **Technician** | `vikram.tech@ecogreensolar.com` | `tech123` | Vikram Singh (South Zone / Water Heaters) |
| **Customer** | *(Public Access)* | *(No password)* | Access tracker directly at `/track/EGS-2026-000101` |

---

## 📲 WhatsApp & Email Integration Configuration

Configuration is managed via `server/.env`. By default, `WHATSAPP_PROVIDER=SIMULATED` and `EMAIL_PROVIDER=SIMULATED` are active, displaying all messages in the real-time **Notification Center** drawer in the web interface.

### 1. Meta WhatsApp Cloud API (Production)
In `server/.env`:
```env
WHATSAPP_PROVIDER=META_CLOUD_API
META_PHONE_NUMBER_ID=your_meta_phone_number_id
META_ACCESS_TOKEN=your_system_user_access_token
META_BUSINESS_ACCOUNT_ID=your_waba_id
```

### 2. Twilio WhatsApp API
In `server/.env`:
```env
WHATSAPP_PROVIDER=TWILIO
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

### 3. Nodemailer SMTP (Email)
In `server/.env`:
```env
EMAIL_PROVIDER=SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=support@ecogreensolar.com
SMTP_PASS=your_gmail_app_password
EMAIL_FROM="Eco Green Solar Support" <support@ecogreensolar.com>
```

---

## 📡 REST API Reference

### Authentication
- `POST /api/auth/login`: Authenticate with email and password. Returns JWT token.
- `GET /api/auth/me`: Fetch current logged-in user profile.
- `GET /api/auth/users`: List users (Admin only).
- `POST /api/auth/create-user`: Create new staff or technician (Admin only).

### Complaints
- `GET /api/complaints`: List complaints with filters (`search`, `status`, `priority`, `product_type`, `technician_id`).
- `GET /api/complaints/:id`: Fetch complete complaint details, attachments, timeline, and notification logs.
- `GET /api/complaints/customer-history?phone=...`: Retrieve all past complaints for a customer phone number.
- `POST /api/complaints`: Register new complaint (Supports multipart file attachments).
- `POST /api/complaints/:id/assign`: Assign technician and set expected visit date.
- `POST /api/complaints/:id/note`: Add timestamped visit note (Supports customer notification toggle).
- `POST /api/complaints/:id/resolve`: Mark resolved with resolution summary, spare parts, and photo upload.
- `POST /api/complaints/:id/close`: Final review and closure (triggers customer rating alert).
- `POST /api/complaints/:id/reopen`: Reopen ticket while preserving all previous history.
- `GET /api/complaints/track/:query`: Public endpoint to track status by Ticket ID or phone.
- `POST /api/complaints/:id/feedback`: Customer satisfaction submission (1–5 stars + review).

### Technicians
- `GET /api/technicians`: List technicians with current active workloads and average ratings.
- `GET /api/technicians/:id`: Get technician details and assigned ticket list.
- `PUT /api/technicians/:id/availability`: Toggle technician active availability.

### Notifications
- `GET /api/notifications/templates`: List all configurable templates.
- `PUT /api/notifications/templates/:id`: Update WhatsApp/Email template text.
- `GET /api/notifications/logs`: Audit trail of all dispatches.
- `POST /api/notifications/logs/:id/resend`: Manually retry sending a notification.
- `GET /api/notifications/simulated`: Retrieve recent simulated message buffer.
- `GET /api/notifications/events`: Server-Sent Events (SSE) stream for real-time live inbox.

### Analytics & Reports
- `GET /api/reports/metrics`: KPI counters, product breakdown, issue categories, and technician scoreboard.
- `GET /api/reports/export-csv`: Download complete complaints dataset as CSV.

---

## 🧪 Running Automated Tests

Run the backend integration test suite:

```bash
cd server
npm test
```

This tests:
1. API Health
2. JWT Authentication (Admin, Staff, Technician)
3. Ticket registration (`EGS-2026-000xxx`)
4. Technician assignment & alerts
5. Follow-up notes & customer notification toggle
6. Resolution logging with spare parts
7. Public tracking endpoint
8. Ticket closure & CSAT rating submission
9. Notification audit trail
10. Analytics calculation & CSV export

---

## 🐳 Docker Deployment & Containerization

The repository is fully containerized with a production multi-stage `Dockerfile` and `docker-compose.yml`:

### Run Locally with Docker Compose:
```bash
docker compose up --build -d
```
The complete unified application (Vite React UI + Express Backend + 6,102 Customer Database) will run on `http://localhost:10000`.

### Deploy on Render with Docker Runtime:
1. In Render Web Service settings, select **Runtime: Docker** (or let `render.yaml` auto-configure it).
2. Render automatically detects the root `Dockerfile` and builds both frontend and backend in an isolated, extensible Linux container.
3. Add your custom domain `eco-green-complain.vprotec.online` in Render settings.
