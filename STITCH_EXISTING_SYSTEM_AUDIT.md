# ECO GREEN SOLAR — COMPLAINT MANAGEMENT SYSTEM (CMS)
# COMPLETE EXISTING SYSTEM UI/UX DISCOVERY AUDIT (FOR GOOGLE STITCH)

> **Document Status**: Complete Forensic UI/UX Specification  
> **Source Base**: `client/src` & `server` (React 19 + Vite, Tailwind CSS v4, Express Node.js, SQLite)  
> **Production Target**: [https://complain.ecogreensolar.co.in/](https://complain.ecogreensolar.co.in/)  
> **Target Tool**: Google Stitch UI/UX Redesign System  
> **Rule Compliance**: Strict Audit & Discovery Only — Zero Modifications to Existing Production Code  

---

## 1. ARCHITECTURAL & TECHNICAL SYSTEM OVERVIEW

### 1.1 Technology Stack & Runtime Architecture
* **Frontend Framework**: React 19 (`19.0.0`) powered by Vite (`vite@6.1.0`).
* **Styling Engine**: Tailwind CSS v4 (`@tailwindcss/vite`, modern `@theme` css variable configuration in `index.css`).
* **Icons & Assets**: `lucide-react` (comprehensive vector icon system), custom brand SVGs, and PNG assets (`/company-logo.png`, `/company-logo-white.png`, `/support-icon-192.png`).
* **State Management**:
  * `AuthContext` (`client/src/context/AuthContext.jsx`): Manages active authenticated session, user role (`admin`, `staff`, `technician`, `customer`), token storage in `localStorage` (`egs_token`), cached user (`egs_cached_user`), and unread notification badge counter.
  * `DialogContext` (`client/src/context/DialogContext.jsx`): Centralized declarative modal dialogs (`alert`, `confirm`, `prompt`) and custom animated toast notifications (`showToast`).
  * Local State: High-performance React component-level state (`useState`, `useEffect`, `useMemo`, `useCallback`) optimized with debounced search and memoized lists.
* **Backend Runtime**: Node.js with Express (`server/index.js`, `server/server.js`).
* **Database Engine**: Embedded SQLite database managed via `better-sqlite3` with automated foreign key constraints and indexed schemas (`complaints`, `users`, `technicians`, `notifications`, `customer_directory`, `product_catalog`, `whatsapp_messages`).
* **External Integrations**:
  * **Meta WhatsApp Cloud API**: Graph API v21.0 integration (`https://graph.facebook.com/v21.0/`) with webhook receivers for inbound messages and delivery receipts (`sent`, `delivered`, `read`, `failed`).
  * **Virtual Baileys WhatsApp Gateway**: Fallback/virtual gateway session supporting QR code pairing for office phones.
  * **Nodemailer SMTP**: Automated HTML emails for ticket lifecycle events.
  * **XLSX Parser**: In-memory streaming parser for 6,100+ customer records from `Eco_Green_Solar_Customer_Master.xlsx`.

---

## 2. USER ROLES, PERMISSIONS & ACCESS BOUNDARIES

The application enforces a multi-tier role-based access model across 4 distinct personas:

```
+---------------------------------------------------------------------------------------+
|                                    ROLE PERMISSION MATRIX                              |
+---------------------+----------------+----------------+----------------+--------------+
| Feature / Module    | Admin          | Staff / Desk   | Technician     | Customer     |
+---------------------+----------------+----------------+----------------+--------------+
| Complaints Desk     | Full Access    | Full Access    | Hidden         | Hidden       |
| Ticket Creation     | Yes (All)      | Yes (All)      | No             | Yes (Public) |
| Ticket Assignment   | Yes            | Yes            | No             | No           |
| Edit / Delete Ticket| Edit & Delete  | Edit Only      | No             | No           |
| Field Portal        | View / Supervise| View Only     | Assigned Only  | Hidden       |
| Duty Status Toggle  | No             | No             | On/Off Duty    | No           |
| Technician Cash Reg | View & Settle  | Settle (Desk)  | View Own Cash  | Hidden       |
| WhatsApp Web Hub    | Full Access    | Full Access    | Hidden         | Hidden       |
| Team & Users Roster | Full Access    | Hidden         | Hidden         | Hidden       |
| Product Catalog     | Add / Remove   | Hidden         | Hidden         | Hidden       |
| Analytics & Reports | Full Access    | Hidden         | Hidden         | Hidden       |
| Customer Directory  | Upload & View  | View & Search  | View On-job    | Hidden       |
| Notification Drawer | Full Access    | Full Access    | Hidden         | Hidden       |
| Template Manager    | Edit & Sync    | Hidden         | Hidden         | Hidden       |
| Public Ticket Track | View Any       | View Any       | View Any       | Track by ID  |
| 5-Star CSAT Rating  | View Scores    | View Scores    | View Own Score | Submit Review|
| Reopen Ticket       | Supervise      | Process        | Assigned       | Request      |
+---------------------+----------------+----------------+----------------+--------------+
```

---

## 3. GLOBAL SHELL & NAVIGATION ARCHITECTURE

### 3.1 Top Navigation Bar (`Navbar.jsx`)
* **Brand Header**:
  * Logo mark: Dual sun/solar leaf crest with text "Eco Green Solar CMS".
  * Sub-badge: "Smart Service & Complaint Management".
* **Desktop Navigation Links** (Role Filtered):
  * **Complaints** (`/complaints`): Admin & Staff. Shows badge with open ticket count.
  * **Field Ops** (`/technician`): Admin, Staff, and Technician. Shows active assigned jobs badge.
  * **WhatsApp Web** (`/whatsapp-inbox`): Admin & Staff. Live two-way chat hub.
  * **Team** (`/team`): Admin only. Technician roster, staff credentials, and catalog.
  * **Analytics** (`/analytics`): Admin only. KPIs, customer database, performance scoreboard.
  * **Templates** (`/templates`): Admin only. Notification copy and Meta Cloud API sync.
  * **Customer Portal** (`/customer`): Accessible to all, including direct customer link.
* **Top Right Action Controls**:
  * **Tour Button**: Launches the 9-step interactive system walkthrough (`OnboardingTour.jsx`).
  * **Quick Register Ticket Button**: Prominent Emerald CTA `+ Register Ticket` triggering `NewComplaintModal`.
  * **Live Notification Bell**: Displays simulated/live unread notification count badge with pulsing green glow. Clicking opens `NotificationDrawer.jsx`.
  * **User Profile Popover**:
    * Displays avatar initials, full name, role badge (`ADMIN`, `STAFF`, `TECHNICIAN`, `CUSTOMER`), and contact phone.
    * Actions: "Role Switcher / Sign Out" and system version metadata.
* **Mobile Bottom Navigation Bar**:
  * Fixed bottom dock on viewports `< 768px` displaying icons for active tabs (Desk, Field, Chat, More menu) ensuring thumb-zone accessibility.

---

## 4. AUTHENTICATION & LOGIN PAGE (`LoginPage.jsx`)

* **Split-Screen Design**:
  * **Left Hero Panel (Desktop)**:
    * Background: Deep Slate gradient `#091E16` to `#052e16` with ambient emerald solar mesh.
    * 3-Slide Auto-Advancing Feature Carousel:
      * *Slide 1*: "Next-Gen Solar Service Desk" — Real-time tracking of Rooftop, Water Heater & Heat Pump complaints.
      * *Slide 2*: "Instant WhatsApp Multi-Dispatch" — Zero-redirect automated notifications to customers & engineers.
      * *Slide 3*: "Cash In Hand & Field Settlement" — Instant field collection auditing, spare parts logs, and photo verification.
    * Interactive Slide Dots: Manual slide jump indicators.
  * **Right Authentication Panel**:
    * Company logo crest and welcome header.
    * Quick Role Switcher Pill / Saved Device Profile: One-tap profile switcher for demo/development environments with instant pre-fills.
    * Form Inputs:
      * `User ID / Mobile Number`: Floating icon (`User`), supports alphanumeric username (`admin`, `staff1`, `tech1`) or 10-digit mobile (`7878444414`).
      * `Password`: Password field with `Eye` / `EyeOff` visibility toggle.
      * `Remember Me`: Checkbox persisting credentials.
    * Submit CTA: `Sign In to Portal` with loading spinner.
    * Public Customer Portal Link: Footer banner: *"Are you an Eco Green Solar Customer? Track your complaint status without signing in -> Track Ticket"*.

---

## 5. COMPLAINT MANAGEMENT MODULE (`ComplaintList.jsx`)

### 5.1 Controls & Command Ribbon
* **Universal Search Bar**:
  * Text input with auto-debounce searching across: Ticket ID (`EGS-2026-000101`), Customer Name, Phone number, City/Address, and Equipment Serial numbers.
* **Multi-Tier Filter Controls**:
  * **Status Filter Dropdown**: `All Statuses`, `Registered / Open`, `Technician Assigned`, `In Progress / Field Visit`, `On Hold / Spare Needed`, `Resolved`, `Closed`.
  * **Product Filter Dropdown**: `All Products`, `Solar Rooftop System`, `Solar Water Heater`, `Heat Pump System`.
  * **Priority Filter Dropdown**: `All Priorities`, `Urgent (SLA 4h)`, `High (SLA 12h)`, `Medium (SLA 24h)`, `Low (SLA 48h)`.
  * **Technician Filter Dropdown**: Dynamic list of all field engineers.
  * **View Mode Switcher**: Toggle button group between **Table List View** and **Card Grid View**.
  * **Export CSV Action**: One-click download button generating sanitized CSV file with customer details, equipment serials, timestamps, SLA compliance, and cash collected.

### 5.2 Table List View Specification
Grid layout featuring 9 structured columns:
1. **Ticket ID & Priority**: Monospace badge (`EGS-2026-000101`) with priority pill (Rose for Urgent, Amber for High, Blue for Medium, Slate for Low) and Age indicator (e.g. `2h ago`, `OVERDUE`).
2. **Customer Information**: Full Name, primary phone with clickable WhatsApp icon, city/area.
3. **Product & Issue**: Product category badge with custom color tag, issue category (e.g. `Inverter Tripping`, `Tank Leakage`, `Sensor Error F1`), and truncated description.
4. **Warranty Status**: `In Warranty` (Emerald badge) or `Out of Warranty` (Slate badge) with service charge preview if applicable.
5. **Assigned Technician**: Technician name, avatar, on-duty status dot, or `Unassigned` warning badge.
6. **Current Stage / Status**: Color-coded status badge with progress ring.
7. **Cash Collected**: Rupee amount (`₹0` or `₹1,200`) with settlement status indicator (Pending or Deposited).
8. **Created Date / SLA**: Relative time elapsed and SLA deadline warning.
9. **Row Actions**:
   * Quick Assign / Change Technician button.
   * Direct WhatsApp Chat button.
   * Row click opening `ComplaintDetailDrawer`.

### 5.3 Card Grid View Specification
Responsive 1, 2, or 3-column card layout:
* **Card Header**: Ticket ID, priority pill, age badge, and product line color bar on top border.
* **Customer Block**: Name in bold, phone number with one-touch call and WhatsApp action buttons.
* **Issue Summary**: Highlighted issue category and description box.
* **Technician & Schedule**: Assigned technician avatar, visit appointment slot, and travel status.
* **Cash Collection Banner**: Highlights any collected cash in hand awaiting deposit.
* **Action Footer**: `View Full Ticket` CTA button.

---

## 6. COMPLAINT REGISTRATION WIZARD (`NewComplaintModal.jsx`)

A multi-step, modal wizard designed for error-free complaint logging:

### 6.1 Step 1: Product Line Selection Catalog
* Grid of 3 large interactive product cards with animated hover states and solar illustrations:
  1. **Solar Rooftop Systems**: On-grid/Off-grid inverters, PV modules, net meter, structure, generation drop.
  2. **Solar Water Heaters**: ETC/FPC collectors, storage tanks, backup heating element, descaling, plumbing.
  3. **Heat Pumps**: Residential/Commercial heat pumps, compressors, circulating pumps, digital controllers (F1/F2 errors).
* Visual selection badge and immediate advancement to Step 2.

### 6.2 Step 2: Comprehensive Customer & Diagnostics Form
* **Selected Product Banner**: Displays chosen product line with "Change Product" quick link.
* **Smart Customer Directory Lookup (Excel Integration)**:
  * Phone number input triggers instant real-time lookup across 6,102 customer master records.
  * If matched: Auto-populates Customer Name, Installation Address, City, Pincode, Installation Date, System Capacity, Serial Number, and calculates Warranty validity.
  * Match Confirmation Pill: Displays *"Verified Customer: 3kW On-Grid Rooftop Solar, Installed 14-May-2023"*.
* **Customer Contact Details**:
  * Full Name (required).
  * Primary Mobile Number (10 digits, required).
  * Secondary Mobile Number / Landline (optional).
  * Email Address (optional, for notifications).
* **Site Installation & Location**:
  * Street Address / Building Name (required).
  * City / Village (required).
  * Pincode (6 digits).
  * Google Maps Location URL / Coordinates (for technician navigation).
* **System Identifiers & Warranty**:
  * Inverter / Heater Serial Number.
  * Consumer Number (DISCOM / GUVNL / MGVCL / DGVCL / UGVCL / PGVCL).
  * Invoice Number & Date of Installation.
  * Warranty Status Toggle: Auto-calculated or manual override (`In Warranty` vs `Out of Warranty`).
  * Estimated Service Charges: Numeric input for out-of-warranty inspection fee.
  * Customer Consent Checkbox: *"Customer informed about out-of-warranty inspection charges"*.
* **Issue Diagnostics & SLA**:
  * Issue Category Dropdown: Dynamically loaded based on selected product (e.g. Inverter Error Codes, Zero Generation, Water Not Heating, Pipe Leakage, Display Blank).
  * Priority Buttons: `Urgent (4h)`, `High (12h)`, `Medium (24h)`, `Low (48h)` with estimated resolution target.
  * Detailed Problem Description: Multi-line textarea.
  * File / Photo Attachments: Drag-and-drop zone with client-side image compression, thumbnail previews, and remove buttons.
* **Notification Preview & Instant Dispatch**:
  * Checkbox: *"Send instant WhatsApp alert to customer (+91 ...)"* (checked by default).
  * Checkbox: *"Send email confirmation"* (if email provided).
  * Submit Button: `Register Complaint & Dispatch Alert` with real-time feedback toast.

---

## 7. COMPLAINT DETAIL & OPERATIONS DRAWER (`ComplaintDetailDrawer.jsx`)

Slide-over right drawer (Width: 600px desktop, full-width mobile) providing complete ticket management without leaving the page:

### 7.1 Header Bar
* Ticket ID (`EGS-2026-000101`) with copy-to-clipboard action.
* Status Badge with inline stage selector dropdown.
* Priority Pill & Age counter.
* Close drawer `X` button.

### 7.2 Drawer Sub-Navigation Tabs
1. **Overview Tab**:
   * **Customer Information Box**: Name, phone with direct call and WhatsApp links, complete address, Google Maps direct link button.
   * **Product & Equipment Details**: Product name, system capacity, serial number, DISCOM consumer number, installation date, warranty badge.
   * **Issue Diagnostics Card**: Problem category, full problem description, attached photos with full-size lightbox viewer.
   * **Assigned Technician Card**:
     * Current technician avatar, name, phone number, on-duty status.
     * `Reassign Technician` button opening assignment modal with off-duty warning.
     * Expected visit appointment date and time slot.
   * **Financial & Cash Collection Register**:
     * Warranty classification (`Free In-Warranty Service` or `Chargeable Service`).
     * Service charge, spare parts cost, total amount payable.
     * Cash collection record: Amount collected, date collected, collecting technician, and company deposit status.
     * `Record Cash Payment` modal trigger button.
2. **Timeline & Audit Trail Tab**:
   * Chronological visual audit log.
   * Each entry features: Timestamp, actor (Admin, Staff, Technician, Customer, System), action taken, previous vs new status, notes logged, and notification dispatch status.
   * Note Logger Input: Staff/Admin can add internal private notes or public customer updates.
3. **Notifications History Tab**:
   * Complete log of all WhatsApp messages, SMS alerts, and Emails dispatched for this specific ticket.
   * Provider metadata (`Meta Cloud API` or `Simulated`), delivery timestamps, message text preview, and `Resend Notification` button.
4. **Live WhatsApp Thread Tab**:
   * Embedded two-way WhatsApp conversation view with this customer.
   * Staff can reply directly without switching tabs.

### 7.3 Lifecycle Stage Transition & Action Buttons
* **Stage Change Actions**:
  * `Allocate Technician`: Triggers assignment modal.
  * `Start Field Visit`: Transitions status to `In Progress / Field Visit`.
  * `Put On Hold`: Prompts for reason (waiting for spare parts, customer unavailable, etc.).
  * `Mark as Resolved`: Opens resolution modal requiring technician notes, replaced spare parts list, and completion photos.
  * `Close Ticket`: Supervisor final audit and ticket closure.
  * `Reopen Ticket`: For unresolved or recurring problems, restarts ticket lifecycle with counter.
* **Direct Actions**:
  * `Edit Complaint Details`: Opens edit modal to modify phone, address, or serials.
  * `Print / PDF Work Order`: Generates printable job card for technicians.
  * `Delete Ticket`: Admin-only action with confirmation modal.

---

## 8. TECHNICIAN FIELD OPERATIONS PORTAL (`TechnicianFieldPortal.jsx`)

A mobile-first workspace engineered specifically for solar engineers working in the field:

### 8.1 Technician Status & Header
* Technician Profile Header: Name, photo/avatar, assigned territory zone (e.g. `Ahmedabad South & Sanand`).
* **Duty Status Toggle**: Prominent toggle button (`On Duty` vs `Off Duty`). When off-duty, warning appears: *"You are marked Off Duty. New tickets will not be allocated to you"*.
* **Cash-in-Hand Settlement Ledger Card**:
  * Large metric display: Total cash currently held in hand by technician (e.g. `₹3,400`).
  * Breakdown: Number of paid tickets, pending deposits.
  * Action: *"Deposit to Office / Mark Settled"* (Admin verification flow).

### 8.2 Job Cards Feed
* Tab Filters: `Active Jobs (In Progress & Assigned)` vs `Completed History`.
* Quick Search & Filter by locality or product.
* **Technician Job Card Structure**:
  * **Urgency & Distance Banner**: Priority color bar, SLA remaining timer (e.g. `2 hrs remaining`).
  * **Customer Location Block**: Customer name, street address, and one-tap **"Open in Google Maps"** navigation button.
  * **Communication Strip**: Quick tap **"Call Customer"** (`tel:...`) and **"Open WhatsApp"** (`wa.me/...`).
  * **System Diagnostics**: Product type, serial number, reported issue, and customer note.
  * **Field Action Drawer / Modal**:
    * Tap to update stage: `Reached Site`, `Inspecting System`, `Parts Required`, `Resolved`.
    * **Spare Parts Replacement Form**: Add item name (e.g. `40A 2-Pole MCB`, `Collector Air Vent Valve`, `Magnesium Anode`), quantity, and cost.
    * **Cash Collection Entry**: Enter cash collected on site from customer (with digital receipt preview).
    * **Photo Proof Upload**: Camera capture for installed parts, repaired inverter, or customer signature.
    * **Completion Notes**: Mandatory technician sign-off comments before marking `Resolved`.

---

## 9. PUBLIC CUSTOMER TRACKING & CSAT PORTAL (`CustomerPublicPortal.jsx`)

Public-facing portal accessible via `/customer` or deep-link `/track/:ticketId` (no login required):

### 9.1 Ticket Lookup Screen
* Clean, customer-friendly solar branded interface.
* Lookup Input: Enter Complaint Ticket ID (e.g. `EGS-2026-000101`) or Registered Mobile Number.
* Sample Ticket Quick-Chips: For instant demonstration and customer guidance.

### 9.2 Live Service Tracker Screen
* **Status Stepper (5 Milestones)**:
  1. `Registered` (Ticket received & logged).
  2. `Technician Assigned` (Engineer assigned with name & phone).
  3. `In Progress / Visit` (Technician on way or on site).
  4. `Resolved` (Repairs complete & tested).
  5. `Closed` (Verified & completed).
* **Ticket Overview Card**:
  * Complaint ID, Registration Date, Product Model, Reported Issue.
* **Assigned Technician Card**:
  * Technician Name, Contact Number, and Expected Visit Time Window.
* **Customer Feedback & CSAT Rating Widget** (Active upon Resolution):
  * 1 to 5 Star Interactive Rating selector.
  * Satisfaction criteria tags: `Fast Service`, `Polite Technician`, `Clean Installation`, `Explained Problem`.
  * Written feedback comments textarea.
  * Submit Rating button.
* **1-Click Ticket Reopen**:
  * If issue recurs, customer can click *"Issue Not Resolved? Reopen Complaint"* to notify supervisor immediately.
* **Raise New Complaint Action**:
  * Button allowing customers to initiate a new complaint ticket directly.

---

## 10. WHATSAPP WEB TWO-WAY CHAT HUB (`WhatsAppWebInbox.jsx`)

Full-featured WhatsApp Web clone integrated with official Meta Cloud API:

### 10.1 Left Sidebar: Conversations List
* Top Bar: Official Connected Number badge (`+91 7878444414`), connection status dot, sound toggle, and `+ New Chat` button.
* Conversation Filter Tabs: `All`, `Unread`, `Customers`, `Technicians`.
* Search Bar: Filter conversations by contact name, phone number, or linked Ticket ID.
* Chat Item Preview:
  * Contact avatar with initials.
  * Contact name, phone number, and linked Complaint Ticket badge (e.g. `#000101`).
  * Last message snippet with delivery tick icons (sent, delivered, read).
  * Timestamp of last activity.
  * Unread messages green counter badge.

### 10.2 Chat Thread Panel
* **Thread Header**:
  * Contact Name, Phone Number, Role tag (`Customer` or `Technician`).
  * Linked Complaint Ticket Pill (clicking opens complaint drawer directly).
  * Actions: Search in chat, 3-dots menu (Copy phone number, Clear chat, Open customer history).
* **Message Stream**:
  * WhatsApp-authentic bubble styling (Green `#d9fdd3` for outbound, White `#ffffff` for inbound).
  * Message Timestamps and double-tick delivery receipts.
  * Document / Image Previews: Photos sent by customer of damaged solar panels or inverters render inline with zoom lightbox.
  * Context Menu on Hover: Reply, Copy text, View details.
* **Message Composer & Toolbar**:
  * Emoji Picker Popover: Solar, tools, smileys, and office symbols.
  * Attachment Picker: Photos, PDFs, and invoices.
  * Textarea input with Enter-to-send and Shift+Enter for newline.
  * Quick Template Responses Button: Drops down verified pre-approved templates (Arrival notice, Estimate notice, Resolution follow-up).
  * Send Button with audio chime feedback.

### 10.3 Auxiliary Overlays
* **New Chat Modal**: Phone number input with real-time customer directory auto-lookup and recent complaints linking.
* **Edit Contact Name Modal**: Modify customer display name in the WhatsApp address book.

---

## 11. ANALYTICS & EXECUTIVE REPORTS (`AnalyticsDashboard.jsx`)

### 11.1 Top Metric KPI Cards
1. **Total Complaints**: All-time complaints logged with month-over-month growth percentage.
2. **Active Pipeline**: Tickets currently Open, Assigned, or In Progress requiring action.
3. **Average Resolution Turnaround**: Average turnaround time in hours from registration to resolution.
4. **Customer CSAT Score**: Average customer satisfaction rating (out of 5.0 stars) with total reviews count.

### 11.2 Customer Master Directory Engine (6,102 Records)
* Searchable, paginated data grid displaying Gujarat customer database.
* Metrics: Total Records (6,102), In-Warranty count, Out-of-Warranty count.
* Filter by District / City (Ahmedabad, Surat, Vadodara, Rajkot, Bhavnagar, Gandhinagar, etc.).
* **Excel Upload & Sync**:
  * Upload updated `Eco_Green_Solar_Customer_Master.xlsx`.
  * Real-time client-side and server-side validation and record counts.

### 11.3 Product & Issue Distribution Charts
* **Product Line Breakdown**: Horizontal share bars showing percentage distribution across Solar Rooftop, Water Heater, and Heat Pump.
* **Top 5 Issue Categories**: Breakdown of root causes (e.g. Inverter Tripping 38%, Meter Communication 22%, Water Leakage 18%, etc.).

### 11.4 Technician Performance & SLA Scoreboard
* Sortable table ranking all field technicians:
  * Technician Name & Zone.
  * Total Assigned Jobs.
  * Completed / Resolved Jobs.
  * Average Resolution Time (Hours).
  * SLA Compliance Rate (%).
  * Customer Satisfaction Rating (Stars).
  * Current Cash Held in Hand (₹).

---

## 12. TEAM, TECHNICIANS & CATALOG MANAGER (`StaffTechnicianManager.jsx`)

### 12.1 Tab 1: Field Technicians Roster
* Technician Cards & Table:
  * Name, Phone Number, Assigned Territory Zone, Active Tickets Count.
  * Live Availability Toggle: Instant On-Duty / Off-Duty status switch.
  * Actions: Edit details, View assigned ticket list, Delete technician.
* **Add / Edit Technician Modal**:
  * Full Name, Mobile Number, Zone / Area, Vehicle / Skills notes.

### 12.2 Tab 2: Staff & Admin Users
* User credentials and role management table:
  * Username, Full Name, Email, Mobile Number, Role (`admin` or `staff`).
  * Last Login timestamp and status badge.
* **Add / Edit Staff User Modal**:
  * Full Name, Username, Phone, Email, Password, Role selection.

### 12.3 Tab 3: Product Catalog & Issue Categories
* Product line and fault-tree management:
  * Active Products list with icons and descriptions.
  * Category Selector: Select product to view its associated issue categories.
  * Add / Remove Issue Category with custom SLA turnaround target (e.g. add `Grid Overvoltage Trip` with 8-hour SLA).

---

## 13. NOTIFICATION TEMPLATES & GATEWAY (`TemplateManager.jsx` & `WhatsAppGatewayModal.jsx`)

### 13.1 Template Manager
* **9 Standard Lifecycle Notification Templates**:
  * *Customer Templates (6)*:
    1. `ticket_registered_customer` — Complaint registration confirmation with ticket ID & SLA.
    2. `technician_assigned_customer` — Engineer details and appointment notice.
    3. `technician_visit_customer` — Field engineer arrival alert.
    4. `ticket_resolved_customer` — Service completed notice with CSAT review link.
    5. `ticket_closed_customer` — Final ticket closure confirmation.
    6. `ticket_reopened_customer` — Ticket reopened notice.
  * *Technician Templates (3)*:
    1. `ticket_assigned_technician` — New job dispatch with customer location & problem summary.
    2. `ticket_reassigned_technician` — Reassignment notification.
    3. `ticket_urgent_technician` — High-priority escalation notice.
* **Meta WhatsApp Cloud API Verification**:
  * Live status badges: `APPROVED` (Green), `PENDING` (Amber), `REJECTED` (Red).
  * `Sync with Meta` action: Queries Meta Graph API for live template status.
* **Template Editor**:
  * Dynamic Variables Ribbon: One-click placeholder insertion (`{{customer_name}}`, `{{ticket_id}}`, `{{technician_name}}`, `{{product_name}}`, `{{tracking_link}}`).
  * WhatsApp Message Body textarea with character count.
  * Email Subject & HTML Body editor.
  * Live Device Preview Mockup: Real-time rendering of WhatsApp chat bubble.

### 13.2 WhatsApp Gateway Modal (`WhatsAppGatewayModal.jsx`)
* **Session Manager for Office Mobile (+91 7878444414)**:
  * Status indicator: `Active & Connected` or `QR Code Required`.
  * QR Code Scan Container: Renders dynamic pairing QR code for WhatsApp Web.
  * Instructions guide: How to link device from mobile phone settings.
  * Send Quick Test WhatsApp: Input test phone number and message to verify outbound delivery.
  * Unlink / Logout Device button.

---

## 14. LIVE NOTIFICATION CENTER (`NotificationDrawer.jsx`)

* Slide-over right drawer showing real-time dispatch stream across all channels.
* Channel Filter Tabs: `All`, `WhatsApp`, `Email`.
* Real-Time Message Card:
  * Channel Badge (`WhatsApp Alert` or `Email Notification`).
  * Recipient phone number or email address.
  * Dispatch timestamp and delivery status (`SENT` or `FAILED`).
  * Exact rendered message copy with variables populated.
  * Provider indicator (`META CLOUD API`, `BAILEYS GATEWAY`, or `SIMULATED`).
  * `Resend Notification` button for failed alerts.
* Bulk Actions: `Refresh Feed` and `Clear Notification Buffer`.

---

## 15. RESPONSIVE DESIGN & VIEWPORT BREAKPOINTS

The system adheres to a mobile-responsive layout across 4 standardized breakpoints:

* **Desktop Wide (1440px - 1920px)**:
  * Fixed top navbar, 9-column complaints table, multi-filter horizontal bar, 600px right drawer, 3-column analytics grid, side-by-side WhatsApp layout.
* **Laptop / Standard Desktop (1024px - 1439px)**:
  * Compact horizontal navbar, full data table with horizontal scroll, 520px right drawer, 2-column analytics grid.
* **Tablet (768px - 1023px)**:
  * Collapsible menu navigation, complaints view automatically switches to Card Grid, full-screen overlay drawers, stacked analytics panels.
* **Mobile (360px - 767px)**:
  * Bottom navigation bar for core tabs, stacked job cards with large tap targets for field engineers, full-screen modals, floating action buttons (FAB), sticky mobile headers.

---

## 16. UI STATES, DESIGN TOKENS & BRANDING

### 16.1 Design Tokens & Color System
* **Primary Emerald**:
  * `#047857` (Emerald 700) — Primary brand headers, active tabs, main buttons.
  * `#059669` (Emerald 600) — Hover states, progress indicators.
  * `#10b981` (Emerald 500) — Online status indicators, success checkmarks.
  * `#ecfdf5` (Emerald 50) — Table row highlights, success message backgrounds.
* **Accent Teal**:
  * `#0f766e` (Teal 700) — Secondary brand accents, badge headers.
* **Solar Amber / Warning**:
  * `#f59e0b` (Amber 500) — Sun icons, High priority badges, Pending alerts.
  * `#fffbeb` (Amber 50) — Warning cards, warranty alert backgrounds.
* **Urgent Rose / Danger**:
  * `#e11d48` (Rose 600) — Urgent SLA badges, delete buttons, error alerts.
* **Neutral Slate**:
  * `#0f172a` (Slate 900) — Primary typography, modal headers, dark backgrounds.
  * `#64748b` (Slate 500) — Secondary text, metadata timestamps.
  * `#f8fafc` (Slate 50) — Page background, card fill.

### 16.2 Typography & Iconography
* **Font Family**: `Plus Jakarta Sans`, sans-serif (clean, modern geometric).
* **Monospace**: `ui-monospace`, `SFMono-Regular`, `Menlo` for Ticket IDs, phone numbers, and serials.
* **Icon Set**: `lucide-react` with standardized sizes (`14px` for inline badges, `18px` for buttons, `24px` for headers).

### 16.3 Standard UI States
* **Loading**: Subtle pulse skeletons with emerald accent bars, spinning SVG indicators on submit buttons.
* **Empty States**: Centered illustration container, informative headline, contextual explanation, and primary action button (e.g. "No complaints match your filters — Clear Filters").
* **Error States**: Light rose banner with alert circle icon, error explanation, and retry action.
* **Dialog Confirmations**: Custom non-blocking modal (`DialogContext`) with explicit danger styling for destructive actions.
