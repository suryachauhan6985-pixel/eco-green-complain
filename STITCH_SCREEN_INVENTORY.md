# ECO GREEN SOLAR — COMPLAINT MANAGEMENT SYSTEM (CMS)
# COMPLETE SCREEN & VIEW INVENTORY (FOR GOOGLE STITCH)

> **Document Status**: Production-Ready Screen Inventory Matrix  
> **Source Base**: `client/src` (Vite + React 19 + Tailwind CSS v4)  
> **Target Tool**: Google Stitch UI/UX Redesign System  
> **Total Unique Screens & Overlays**: 48 Distinct Views  

---

## 1. MASTER SCREEN TAXONOMY & INDEX MATRIX

| Screen ID | User Role | Screen / View Name | Route / URL / Hash | View Type | Main Actions / Features | Desktop Layout | Mobile Layout |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SCR-01** | Public / All | Login & Authentication Page | `/` (unauthenticated) | Full Page | Split hero carousel, User ID / Mobile login, role switcher presets, link to public tracking | Split 2-col (Hero Carousel + Login Card) | Single column stacked card |
| **SCR-02** | All Users | 9-Step Onboarding Tour | Overlay (`Tour` CTA) | Centered Modal | 9-step guided walkthrough, progress bar, feature highlights, pro-tips, jump dots | 640px modal with dual buttons | Responsive modal with scroll |
| **SCR-03** | Admin, Staff | Live Notification Center | Slide-over Drawer | Right Drawer | WhatsApp & Email notification stream, filter by channel, resend failed, clear buffer | 480px slide-over drawer | Fullscreen overlay drawer |
| **SCR-04** | All Users | User Profile & Role Popover | Top-right popover | Popover Menu | View user details, role badge, switch role / sign out, system version | Dropdown menu card | Bottom sheet / dropdown |
| **SCR-05** | Admin, Staff | Complaints Desk (Table View) | `/complaints` | Full Page | 9-col data table, fast search, multi-filters (status, product, priority, tech), CSV export | Full-width data table | Auto-switches to Card Grid |
| **SCR-06** | Admin, Staff | Complaints Desk (Card View) | `/complaints` | Full Page | Responsive card grid, SLA badges, quick call/WhatsApp, overdue alerts, cash status | 3-column responsive grid | 1-column vertical card feed |
| **SCR-07** | Admin, Staff | New Complaint — Step 1: Product Selection | Modal (`+ Register`) | Wizard Modal | Select Solar Rooftop, Water Heater, or Heat Pump with solar illustrations | 3-column visual card grid | Stacked vertical card selector |
| **SCR-08** | Admin, Staff | New Complaint — Step 2: Diagnostics & Dispatch | Modal (`+ Register`) | Wizard Modal | Excel 6,102 auto-lookup, site address, serials, dynamic fault tree, priority, WhatsApp alert | 2-column structured form | Single column stacked wizard |
| **SCR-09** | Admin, Staff | Ticket Detail Drawer — Overview Tab | Drawer (`?ticket=ID`) | Right Drawer | Customer info, equipment specs, fault summary, technician card, cash ledger | 600px slide-over drawer | Fullscreen drawer |
| **SCR-10** | Admin, Staff | Ticket Detail Drawer — Timeline Tab | Drawer (`?ticket=ID`) | Right Drawer | Chronological audit trail, status transitions, staff notes logger | 600px slide-over drawer | Fullscreen drawer |
| **SCR-11** | Admin, Staff | Ticket Detail Drawer — Notifications Tab | Drawer (`?ticket=ID`) | Right Drawer | Dispatched WhatsApp & Email log, delivery status, resend action | 600px slide-over drawer | Fullscreen drawer |
| **SCR-12** | Admin, Staff | Ticket Detail Drawer — WhatsApp Chat Tab | Drawer (`?ticket=ID`) | Right Drawer | Direct customer chat stream embedded inside ticket drawer | 600px slide-over drawer | Fullscreen drawer |
| **SCR-13** | Admin, Staff | Technician Allocation & Reassignment Modal | Action in Drawer/List | Centered Modal | Select field engineer, off-duty warning, appointment time, dual notification | 480px centered dialog | Responsive bottom modal |
| **SCR-14** | Admin, Staff | Edit Complaint Details Modal | Action in Drawer | Centered Modal | Update contact phone, address, equipment serials, warranty override | 560px modal dialog | Fullscreen scrollable modal |
| **SCR-15** | Admin, Staff | Record Cash Payment Modal | Action in Drawer/Desk | Centered Modal | Log service fee / spare parts cash, enter amount, mark deposited | 440px modal dialog | Responsive modal |
| **SCR-16** | Admin, Staff, Tech | Ticket Resolution & Spare Parts Modal | Action in Drawer/Field| Centered Modal | Replaced parts entry, photo proof upload, technician sign-off notes | 580px structured modal | Fullscreen form |
| **SCR-17** | Admin, Staff | Supervisor Ticket Closure Modal | Action in Drawer | Centered Modal | Final service audit, customer verification confirm, permanent closure | 480px confirmation dialog | Responsive modal |
| **SCR-18** | Admin, Staff | Customer History Modal | Action in Drawer/Desk | Centered Modal | Search customer phone, view all past solar complaints & repeat issues | 620px table modal | Fullscreen list view |
| **SCR-19** | All Users | Photo & Document Lightbox | Image Click | Fullscreen Overlay | High-resolution zoom, rotate, inspect damaged equipment or spare parts | Centered high-res lightbox | Pinch-to-zoom image viewer |
| **SCR-20** | Tech, Admin | Technician Field Portal — Active Jobs | `/technician` | Full Page | On/off duty toggle, cash in hand ledger, job cards with GPS maps, one-tap call | 2-column or wide cards | Mobile-first 1-column feed |
| **SCR-21** | Tech, Admin | Technician Field Portal — Completed Jobs | `/technician` | Full Page | Historical completed tickets, resolution notes, customer ratings | Multi-column card layout | 1-column history feed |
| **SCR-22** | Tech, Admin | Technician Cash Reconciliation Ledger | `/technician` | Full Page Card | Summary of collected cash, pending deposits, settle with office CTA | Top metric panel | Sticky cash status card |
| **SCR-23** | Technician | Field Action & Stage Update Drawer | Modal in Field Ops | Bottom Drawer | Update status (Reached Site, Inspecting), add parts, collect cash, photo | 540px modal dialog | Mobile bottom sheet drawer |
| **SCR-24** | Customer, All | Customer Portal — Ticket Lookup Screen | `/customer` | Full Page | Solar branded portal, enter Ticket ID or Phone number, demo chips | Centered branded lookup card| Mobile responsive card |
| **SCR-25** | Customer, All | Customer Portal — 5-Stage Live Tracker | `/track/:ticketId` | Full Page | Visual progress stepper, assigned technician card, visit time slot | Centered timeline card | Vertical step tracker |
| **SCR-26** | Customer | Customer 5-Star CSAT Rating Modal | On Tracker (`Resolved`) | Centered Modal | 1-5 star selector, feedback criterion chips, review textarea | 480px rating dialog | Responsive rating sheet |
| **SCR-27** | Customer | Customer Reopen Complaint Confirmation | On Tracker | Centered Modal | Explain recurring problem, confirm reopen, notify supervisor | 460px confirmation dialog | Responsive modal |
| **SCR-28** | Customer, All | Public New Complaint Submission | `/customer` (`+ Raise`)| Full Page / Modal | Simplified public complaint registration form for homeowners | 600px clean card form | Single column mobile form |
| **SCR-29** | Admin, Staff | WhatsApp Web — Sidebar & Conversation List | `/whatsapp-inbox` | Master-Detail | Conversations list, filter tabs (All/Unread/Cust/Tech), search, status | Left panel (360px width) | Slide-over sidebar list |
| **SCR-30** | Admin, Staff | WhatsApp Web — Active Chat Thread Panel | `/whatsapp-inbox` | Master-Detail | Conversation header with ticket pill, WhatsApp green/white bubbles, ticks | Right panel (flex-1 fill) | Fullscreen chat view |
| **SCR-31** | Admin, Staff | WhatsApp Web — Message Composer & Emoji | `/whatsapp-inbox` | Component Panel | Emoji popover, attachment upload, pre-approved quick templates | Bottom dock in chat | Bottom dock with mobile keyboard |
| **SCR-32** | Admin, Staff | WhatsApp Web — New Chat & Contact Lookup | Action in Inbox | Centered Modal | Phone validation, directory auto-match, link complaint ticket | 480px modal dialog | Responsive modal |
| **SCR-33** | Admin, Staff | WhatsApp Web — Edit Contact Name Modal | Action in Inbox | Centered Modal | Update contact display name in WhatsApp address book | 420px modal dialog | Responsive modal |
| **SCR-34** | Admin | WhatsApp Gateway Session Pairing Modal | Action in Inbox/Top | Centered Modal | QR code scan for office phone (+91 7878444414), test WhatsApp alert | 540px structured modal | Scrollable QR modal |
| **SCR-35** | Admin | Analytics Dashboard — KPI Counters Panel | `/analytics` | Top Grid | Total complaints, active pipeline, average turnaround hours, CSAT score | 4-column KPI cards grid | 2-column or 1-column grid |
| **SCR-36** | Admin | Customer Master Directory Grid (6,102) | `/analytics` | Full Page Table | Searchable Gujarat customer database, warranty status, city filters | Paginated data table | Horizontally scrollable table |
| **SCR-37** | Admin | Customer Master Excel Upload Modal | `/analytics` | Centered Modal | Drag-and-drop `.xlsx` file, row parsing validation, batch synchronization | 520px upload dropzone | Mobile upload dialog |
| **SCR-38** | Admin | Product Line & Issue Distribution Breakdown | `/analytics` | Charts Panel | Horizontal share bars for products, Top 5 issue categories percentage | 2-column side-by-side charts | Stacked bar panels |
| **SCR-39** | Admin | Technician Performance & SLA Scoreboard | `/analytics` | Data Table | Ranking table: jobs assigned, completed, avg hours, SLA %, CSAT, cash | Full-width analytics table | Card-based technician ranks |
| **SCR-40** | Admin | Field Technicians Roster Management | `/team` (Tab 1) | Data Table / Cards | List engineers, zone, active tickets, live on/off duty status switch | Full-width management table | Stacked technician cards |
| **SCR-41** | Admin | Add / Edit Field Technician Modal | `/team` (Tab 1) | Centered Modal | Technician name, mobile, territory zone, skills & equipment notes | 480px modal dialog | Fullscreen mobile form |
| **SCR-42** | Admin | Staff & Admin Credentials Manager | `/team` (Tab 2) | Data Table | Staff users list, username, email, phone, role badge, last login | Full-width table | Stacked user cards |
| **SCR-43** | Admin | Add / Edit Staff User Modal | `/team` (Tab 2) | Centered Modal | User full name, username, email, phone, role select, password | 500px modal dialog | Fullscreen mobile form |
| **SCR-44** | Admin | Product Catalog & Fault Categories Manager | `/team` (Tab 3) | Master-Detail | Active products list, select product to view & manage fault tree categories | 2-column split catalog | Stacked category list |
| **SCR-45** | Admin | Add / Edit Issue Category Modal | `/team` (Tab 3) | Centered Modal | Category title, associated product, default priority, target SLA hours | 440px modal dialog | Responsive modal |
| **SCR-46** | Admin | Notification Templates Catalog | `/templates` | Full Page Cards | 9 lifecycle templates catalog, audience filter (Customer / Tech), badges | 2-column template grid | 1-column template list |
| **SCR-47** | Admin | WhatsApp & Email Multi-Channel Editor | `/templates` | Full Page Form | Variables toolbar, WhatsApp body, Email subject & body, live device mockup | Split editor (Inputs + Device Preview)| Stacked editor tabs |
| **SCR-48** | Admin | Meta WhatsApp Cloud API Sync & Status Modal | `/templates` | Action / Drawer | Live polling Meta Graph API, verification badges (Approved/Pending/Rejected) | Status alert banner & table | Mobile status list |

---

## 2. MODALS, DRAWERS & OVERLAY COMPONENT DIRECTORY

The application contains **16 distinct overlay components** that operate above the primary page views:

```
+---------------------------------------------------------------------------------------------------------+
|                                    MODALS & DRAWERS DIRECTORY                                           |
+------+-------------------------------+-----------------------------------+------------------------------+
| ID   | Component Name                | Trigger Element                   | Dimensions & Behavior        |
+------+-------------------------------+-----------------------------------+------------------------------+
| MOD1 | OnboardingTour                | Top Nav "Tour" Button             | 640px Centered Modal, 9-Step |
| MOD2 | NotificationDrawer            | Top Nav Bell Icon                 | 480px Right Slide Drawer     |
| MOD3 | NewComplaintModal             | Top Nav "+ Register Ticket" CTA   | 720px 2-Step Wizard Modal    |
| MOD4 | ComplaintDetailDrawer         | Ticket Card/Row Click             | 600px Right Slide Drawer     |
| MOD5 | TechnicianAllocationModal     | "Assign Technician" Button        | 480px Centered Modal Dialog  |
| MOD6 | EditComplaintModal            | "Edit Details" in Drawer          | 560px Centered Modal Dialog  |
| MOD7 | RecordPaymentModal            | "Record Cash Payment" Button      | 440px Centered Modal Dialog  |
| MOD8 | ResolutionModal               | "Mark as Resolved" Button         | 580px Centered Modal Dialog  |
| MOD9 | CloseTicketModal              | "Close Ticket" Button             | 460px Centered Modal Dialog  |
| MOD10| CustomerHistoryModal          | "View Past History" Button        | 620px Centered Modal Dialog  |
| MOD11| LightboxViewer                | Image / Proof Photo Click         | Fullscreen Dark Overlay      |
| MOD12| WhatsAppGatewayModal          | "Link WhatsApp" Button            | 540px Centered QR Modal      |
| MOD13| NewWhatsAppChatModal          | "+ New Chat" Button in Inbox      | 480px Centered Modal Dialog  |
| MOD14| EditContactModal              | "Edit Contact" in Chat Menu       | 420px Centered Modal Dialog  |
| MOD15| AddTechnicianModal            | "+ Add Technician" Button         | 480px Centered Modal Dialog  |
| MOD16| AddStaffUserModal             | "+ Add Staff User" Button         | 500px Centered Modal Dialog  |
+------+-------------------------------+-----------------------------------+------------------------------+
```

---

## 3. SCREEN COUNT BREAKDOWN PER ROLE

* **Admin Role**: Total 48 Screens (Complete access to all 48 screens, views, analytics, catalog, templates, and modals).
* **Staff / Helpdesk Role**: Total 34 Screens (Complaints Desk, Registration Wizard, Detail Drawer, Modals, Field View, WhatsApp Inbox, Customer Portal).
* **Technician Role**: Total 11 Screens (Technician Field Portal, Active/Completed Feeds, Cash-in-Hand Ledger, Field Action Modal, Ticket Resolution Modal, Image Lightbox, Onboarding Tour).
* **Customer Persona**: Total 6 Screens (Public Ticket Lookup, 5-Stage Live Tracker, Assigned Technician Card, 5-Star CSAT Rating, Reopen Ticket Confirmation, Public Complaint Submission Form).
