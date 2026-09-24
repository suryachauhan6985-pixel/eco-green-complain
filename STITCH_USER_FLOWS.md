# ECO GREEN SOLAR — COMPLAINT MANAGEMENT SYSTEM (CMS)
# COMPLETE USER FLOWS & STATE MACHINES (FOR GOOGLE STITCH)

> **Document Status**: Production-Ready User Flows & State Transitions  
> **Source Base**: `client/src` (Vite + React 19 + Tailwind CSS v4)  
> **Target Tool**: Google Stitch UI/UX Redesign System  
> **Total Core User Flows**: 10 End-to-End Enterprise Flows  

---

## 1. FLOW 1: AUTHENTICATION, LOGIN & SESSION LIFECYCLE

```
[ Unauthenticated User ]
        │
        ▼
   (LoginPage)
        │
        ├── User selects Demo Profile pill ──► Auto-populates credentials
        │
        └── User enters User ID / Mobile & Password
                │
                ▼
        [ Submit Sign In ]
                │
                ▼
        { API POST /api/auth/login }
                │
        ┌───────┴────────────────────────────────────────┐
        │ Success                                        │ Invalid Credentials
        ▼                                                ▼
  Save JWT token to localStorage (`egs_token`)      Show error alert:
  Save cached user profile (`egs_cached_user`)      "Invalid User ID or Password"
  Update `AuthContext` state
        │
        ├── If role == 'admin'      ──► Redirect to `/complaints` (all tabs visible)
        ├── If role == 'staff'      ──► Redirect to `/complaints` (restricted tabs)
        ├── If role == 'technician' ──► Redirect to `/technician` (Field Ops only)
        └── If role == 'customer'   ──► Redirect to `/customer` (Public Tracker)
```

### Flow Details:
* **Entrypoint**: `/` or expired token interception.
* **Key Interactions**:
  1. User views split-screen login page with 3-slide auto-advancing feature carousel on the left.
  2. User can tap the "Demo Profile" pill to quickly select from `Admin (Gujarat Supervisor)`, `Staff (Helpdesk Operator)`, or `Technician (Field Engineer)`.
  3. Enter User ID (alphanumeric or 10-digit mobile) and Password.
  4. Toggle password visibility with eye icon.
  5. Check `Remember Me` checkbox to persist session.
  6. On successful login, system loads permissions and initializes the live notification counter.

---

## 2. FLOW 2: COMPLAINT REGISTRATION & AUTO-DISPATCH

```
[ Helpdesk Staff / Admin ]
        │
        ▼ Click "+ Register Ticket" CTA in Navbar
  (NewComplaintModal - Step 1: Product Selection)
        │
        ├── User selects "Solar Rooftop Systems"
        ├── User selects "Solar Water Heaters"
        └── User selects "Heat Pump Systems"
                │
                ▼ Card click transitions to Step 2
  (NewComplaintModal - Step 2: Diagnostics & Dispatch)
        │
        ├── User types Customer Mobile Number (10 digits)
        │       │
        │       ▼ Debounced lookup against 6,102 Customer Directory
        │   { Match Found? }
        │       ├── YES ──► Auto-fills Name, Address, City, Pincode, Capacity,
        │       │           Equipment Serial Number, DISCOM Number, and calculates
        │       │           Warranty Status (In/Out Warranty).
        │       └── NO  ──► Staff enters customer details manually.
        │
        ├── Select dynamic Issue Category (populated based on Step 1 product)
        ├── Select Priority: Urgent (4h) | High (12h) | Medium (24h) | Low (48h)
        ├── Enter problem description
        ├── Attach equipment / damage photos (auto-compressed on client)
        │
        ├── Checkbox: "Send instant WhatsApp alert to customer" (checked by default)
        └── Checkbox: "Send email confirmation"
                │
                ▼ Click "Register Complaint & Dispatch Alert"
        { API POST /api/complaints }
                │
        ┌───────┴────────────────────────────────────────┐
        │ Success                                        │ Error
        ▼                                                ▼
  Auto-generate sequential Ticket ID (`EGS-2026-000101`) Show validation toast:
  Insert ticket into database                            "Please complete required fields"
  Trigger Meta WhatsApp Cloud API alert to customer
  Dispatch Nodemailer HTML email confirmation
  Log entry in ticket audit timeline
  Close modal & play success chime
  Complaints Desk updates instantly with new ticket
```

---

## 3. FLOW 3: HELPDESK TRIAGE, ALLOCATION & REASSIGNMENT

```
[ New Ticket with Status "Registered / Open" ]
        │
        ▼ Staff opens ComplaintDetailDrawer
  (ComplaintDetailDrawer - Overview Tab)
        │
        ▼ Click "Allocate Technician" or "Change Technician"
  (TechnicianAllocationModal)
        │
        ├── System displays list of active technicians with:
        │     - Technician Name & Contact Phone
        │     - Operating Zone (e.g. Ahmedabad South, Surat City)
        │     - Current active job workload count
        │     - Duty Status Indicator (On Duty vs Off Duty)
        │
        ├── If staff selects an "Off Duty" technician:
        │     ▼
        │   Show Warning Banner: "⚠️ Warning: Technician is currently OFF DUTY.
        │   Are you sure you want to allocate this ticket?"
        │
        ├── Select scheduled visit appointment date & time slot
        ├── Add allocation dispatch instructions/notes
        │
        ▼ Click "Confirm Allocation & Dispatch Alerts"
  { API PUT /api/complaints/:id/assign }
        │
  Update ticket status to "Technician Assigned"
  Create timeline audit entry: "Assigned to [Technician Name] by [Staff Name]"
  Trigger automated dual notifications:
        ├── 1. WhatsApp template alert to Customer: "Technician assigned with phone & time"
        └── 2. WhatsApp job dispatch alert to Technician: "New job at [Customer Address] with maps link"
  Drawer updates with assigned technician card
```

---

## 4. FLOW 4: FIELD TECHNICIAN OPERATIONS & RESOLUTION

```
[ Field Technician Logs In ]
        │
        ▼
  (TechnicianFieldPortal)
        │
        ├── Step 1: Toggle Duty Status
        │     - Tap "On Duty" / "Off Duty" toggle button
        │     - When On Duty: Available for dispatch
        │
        ├── Step 2: Review Assigned Jobs Feed
        │     - Inspect active job cards sorted by SLA urgency
        │     - View customer name, solar equipment, and reported issue
        │
        ├── Step 3: Site Travel & Customer Communication
        │     - Tap "Open in Google Maps" ──► Launches GPS navigation to customer terrace
        │     - Tap "Call Customer"       ──► Initiates direct phone call (`tel:`)
        │     - Tap "WhatsApp"            ──► Opens direct WhatsApp chat
        │
        ├── Step 4: Site Arrival & Stage Progression
        │     - Tap "Start Visit" ──► Status updates to "In Progress / Field Visit"
        │     - Customer tracker updates in real time
        │
        ├── Step 5: System Inspection & Spare Parts Replacement
        │     - If spare parts required:
        │         Enter part name (e.g. "40A Inverter MCB", "Air Vent Valve")
        │         Enter quantity & spare parts cost
        │
        ├── Step 6: Cash Collection (if out of warranty or spare parts)
        │     - Enter amount collected in cash (e.g. ₹1,200)
        │     - Cash added to technician's "Cash-in-Hand Ledger"
        │
        ├── Step 7: Proof Photo Capture & Resolution Notes
        │     - Snap photo of repaired equipment / replaced parts
        │     - Enter mandatory technician completion remarks
        │
        ▼ Click "Complete Job & Mark Resolved"
  { API PUT /api/complaints/:id/resolve }
        │
  Status updates to "Resolved"
  Timeline logs: Replaced parts, cash collected, technician remarks, photo proof
  Automated WhatsApp alert sent to customer: "Service Completed — Please rate your technician"
  Job card moves to "Completed History" tab
```

---

## 5. FLOW 5: PUBLIC CUSTOMER TRACKING & CSAT REVIEW

```
[ Customer receives WhatsApp with link: `https://complain.ecogreensolar.co.in/track/EGS-2026-000101` ]
        │
        ▼ Direct browser navigation (Zero login required)
  (CustomerPublicPortal - Live Tracker Screen)
        │
        ├── Step 1: Live Progress Stepper View
        │     - Milestone 1: Registered (Date & Time logged)
        │     - Milestone 2: Technician Assigned (Technician name & phone displayed)
        │     - Milestone 3: In Progress (Technician en route / on site)
        │     - Milestone 4: Resolved (Repairs finished)
        │     - Milestone 5: Closed (Verified & audited)
        │
        ├── Step 2: Inspect Technician Card
        │     - View assigned technician name and phone
        │     - Expected visit appointment slot
        │
        ├── Step 3: Submit 5-Star CSAT Rating (Active once Resolved)
        │     - Tap 1 to 5 Star Rating
        │     - Select satisfaction chips: "Fast Service", "Clean Installation", "Polite Tech"
        │     - Enter optional review comments
        │     - Tap "Submit Feedback" ──► Saved to technician's scorecard
        │
        └── Step 4: Issue Recurred? 1-Click Reopen
              - If problem persists, customer taps "Issue Not Resolved? Reopen Ticket"
              - Prompts for issue description
              - Status transitions to "Reopened"
              - Escalation WhatsApp alert fired to Helpdesk Supervisor
```

---

## 6. FLOW 6: CASH RECONCILIATION & COMPANY SETTLEMENT

```
[ Technician collects cash on site: ₹1,200 ]
        │
        ▼
  Technician's Cash-in-Hand Ledger increments:
  "Total Cash in Hand: ₹3,400 (3 Paid Tickets Pending Deposit)"
        │
        ▼ At end of day / week, technician arrives at office
  [ Staff / Admin opens Desk / Field Portal ]
        │
        ├── Option A: Individual Ticket Settlement
        │     - Open ComplaintDetailDrawer ➔ Financial Register
        │     - Click "Mark Cash Deposited to Office"
        │     - Ticket cash status changes from `Pending Deposit` to `Deposited`
        │
        └── Option B: Batch Technician Settlement
              - Open StaffTechnicianManager or Field Ops Ledger
              - Select Technician (e.g. Ramesh Patel)
              - Review list of cash collected tickets
              - Click "Settle All Cash (₹3,400)"
              - Enter physical receipt / voucher number
              - Confirm settlement
              - Technician's Cash-in-Hand balance resets to ₹0
              - Audit log records settlement timestamp and supervisor signature
```

---

## 7. FLOW 7: WHATSAPP WEB TWO-WAY LIVE CHAT

```
[ Customer sends inbound WhatsApp message to +91 7878444414 ]
        │
        ▼
  { Meta WhatsApp Cloud API Webhook / Gateway Receiver }
        │
  Inbound message stored in database (`whatsapp_messages`)
  Customer phone matched against Customer Master Directory & Complaints
  Linked Ticket badge associated with conversation
  Unread badge count increments on "WhatsApp Web" tab
        │
        ▼ Staff clicks "WhatsApp Web" tab in Navbar
  (WhatsAppWebInbox)
        │
        ├── Step 1: Select Conversation from Left Sidebar
        │     - Filter by "Unread" or search by name/phone/ticket ID
        │     - Click contact card ──► Active thread opens on right
        │
        ├── Step 2: Review Message Thread
        │     - White bubbles = Inbound messages from customer
        │     - Green bubbles = Outbound messages from CMS / Staff
        │     - View customer photos of damaged inverter or meter
        │     - Click linked Ticket ID pill to inspect full complaint in drawer
        │
        ├── Step 3: Compose Reply
        │     - Type custom message in composer
        │     - Select Emoji from solar & work emoji picker
        │     - Attach document / PDF work estimate
        │     - Or click "Quick Templates" ──► Insert pre-approved arrival notice
        │
        ▼ Click Send (or press Enter)
  { API POST /api/whatsapp/send }
        │
  Message dispatched via Meta WhatsApp Cloud API
  Green bubble appears in chat with single tick (Sent) ➔ double tick (Delivered)
  Audio chime plays
```

---

## 8. FLOW 8: NOTIFICATION TEMPLATES & META CLOUD API SYNC

```
[ Admin opens "Templates & Settings" tab ]
        │
        ▼
  (TemplateManager)
        │
        ├── Step 1: Browse 9 Standard Lifecycle Templates
        │     - Filter by Audience: Customer (6) vs Technician (3)
        │     - View live Meta Approval status badge:
        │         🟢 `APPROVED` | 🟡 `PENDING` | 🔴 `REJECTED`
        │
        ├── Step 2: Sync with Meta Cloud API
        │     - Click "Sync with Meta" button
        │     - Backend queries Meta Graph API (`/v21.0/message_templates`)
        │     - Status badges update in real time
        │
        ├── Step 3: Edit Template Copy
        │     - Click on any template (e.g. `ticket_registered_customer`)
        │     - Click variable buttons to insert placeholders:
        │         `{{customer_name}}`, `{{ticket_id}}`, `{{product_name}}`, `{{tracking_link}}`
        │     - Edit WhatsApp message body text
        │     - Edit Email Subject and HTML Body text
        │     - Inspect live preview in phone mockup container
        │
        ▼ Click "Save Template Changes"
  { API PUT /api/templates/:id }
        │
  Updated template saved to database
  Success toast notification displayed
```

---

## 9. FLOW 9: TEAM ROSTER & CATALOG MANAGEMENT

```
[ Admin opens "Team & Users" tab ]
        │
        ▼
  (StaffTechnicianManager)
        │
        ├── Tab 1: Field Technicians Management
        │     - View list of all technicians, assigned zones, active tickets
        │     - Toggle availability switch (On/Off Duty)
        │     - Click "+ Add Technician":
        │         Enter Full Name, Phone, Territory Zone, Vehicle/Skills
        │         Click "Save Technician"
        │
        ├── Tab 2: Staff & Admin Credentials
        │     - View active staff and administrator accounts
        │     - Click "+ Add Staff User":
        │         Enter Full Name, Username, Phone, Email, Role (`admin` / `staff`), Password
        │         Click "Create User"
        │
        └── Tab 3: Product Catalog & Fault Tree
              - Select Product Line (Solar Rooftop, Water Heater, Heat Pump)
              - View current issue categories and SLA hours
              - Click "+ Add Issue Category":
                  Enter Category Title (e.g. "Net Meter Export Failure")
                  Set default priority and SLA target turnaround (e.g. 12 hours)
                  Click "Save Category"
```

---

## 10. FLOW 10: CUSTOMER DIRECTORY EXCEL SYNCHRONIZATION

```
[ Admin has updated customer database file: `Eco_Green_Solar_Customer_Master.xlsx` ]
        │
        ▼ Open "Analytics & Reports" tab
  (AnalyticsDashboard - Customer Master Section)
        │
        ▼ Click "Upload Updated Excel Directory"
  (CustomerMasterUploadModal)
        │
        ├── Drag and drop `.xlsx` file into dropzone
        │
        ▼ File validation & parsing
  { Client reads file using SheetJS / in-memory parser }
        │
        ├── Validate required column headers:
        │     - Customer Name
        │     - Mobile Number
        │     - Installation Address & City
        │     - Product Type & Capacity
        │     - Serial Number & Installation Date
        │
        ▼ Click "Start Synchronization (6,102 Records)"
  { API POST /api/customers/upload-excel }
        │
  Server streams records into indexed SQLite database
  Calculates warranty validity for each customer:
        `Warranty Expired = Installation Date + Warranty Years < Today`
  Progress bar updates: 0% ➔ 100%
  Success toast: "Successfully synchronized 6,102 customer records"
  Complaints registration auto-lookup immediately benefits from new data
```
