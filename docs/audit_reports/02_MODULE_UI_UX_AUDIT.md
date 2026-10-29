# 02. Complete Module-by-Module UI/UX Audit
**Project:** Eco Green Solar CMS (`eco-green-solar-cms`)  
**Audit Type:** UI/UX Usability, Visual Consistency, Interaction Flows & Responsiveness  
**Date:** October 2026  
**Auditor:** UI/UX Auditor & Frontend Performance Engineer  

---

## 1. Executive Summary of UI/UX State

The Eco Green Solar CRM features an ambitious, modern enterprise design characterized by:
- A clean, cohesive solar-themed color palette (Emerald green, Slate, Teal, and Amber).
- Modern tactile micro-interactions (`active:scale-[0.965]` on buttons, sliding indicator capsules for tabs).
- Rich operational features (voice notes, video recordings, QR gateway pairing, interactive tour).

However, code inspection reveals several notable UI/UX inconsistencies and usability gaps:
1. **Drawer vs. Modal Exit Asymmetry:** Drawers (`ComplaintDetailDrawer`, `NotificationDrawer`) implement smooth slide-out exit animations via a custom `isClosing` state, while all modals (`NewComplaintModal`, `CustomerSearchModal`, `CustomerHistoryModal`) abruptly disappear with 0ms transition when closed.
2. **Tab Navigation Flash:** Navigating between major tabs triggers an unmount of the active tab, causing a momentary spin loader or layout re-render even when data is already available locally.
3. **Table vs. Card Responsive Discrepancy:** On the Complaints Desk, the responsive breakpoint triggers an automatic switch from the 9-column table to a card list at 768px, but several action buttons inside cards wrap unpredictably on small screens (360px–390px).
4. **Information Density Variance:** The Ticket Detail Drawer is dense and functional, whereas the Analytics tab is expansive with large graphical cards that require excessive vertical scrolling on laptop viewports (1366x768).

---

## 2. Module-by-Module Audit & Technical Breakdown

```
+----------------------------------------------------------------------------------------------------+
|                                    MODULE INVENTORY INDEX                                          |
+----+--------------------------------+--------------------------------------------------------------+
| #  | Module Name                    | Primary Source Component(s)                                  |
+----+--------------------------------+--------------------------------------------------------------+
| 01 | Authentication & Login         | `client/src/components/auth/LoginPage.jsx`                   |
| 02 | Navigation & App Shell         | `client/src/components/layout/Navbar.jsx`, `App.jsx`          |
| 03 | Complaints Desk (Table & Grid) | `client/src/components/complaints/ComplaintList.jsx`         |
| 04 | Complaint Registration Wizard  | `client/src/components/complaints/NewComplaintModal.jsx`      |
| 05 | Ticket Detail Drawer           | `client/src/components/complaints/ComplaintDetailDrawer.jsx`  |
| 06 | Field Portal & Tour Ledger     | `client/src/components/technician/TechnicianFieldPortal.jsx` |
| 07 | Customer Management & Lookup   | `CustomerSearchModal.jsx`, `CustomerPublicPortal.jsx`        |
| 08 | WhatsApp Web Hub               | `client/src/components/whatsapp/WhatsAppWebInbox.jsx`        |
| 09 | Analytics & Customer Directory | `client/src/components/admin/AnalyticsDashboard.jsx`         |
| 10 | Staff & Technician Roster      | `client/src/components/admin/StaffTechnicianManager.jsx`     |
| 11 | Settings & Template Manager    | `AdminSettingsHub.jsx`, `TemplateManager.jsx`                |
| 12 | Notification Center & Overlays | `NotificationDrawer.jsx`, `NotificationPopup.jsx`            |
+----+--------------------------------+--------------------------------------------------------------+
```

---

### Module 01: Login & Authentication

- **Primary Source:** [`client/src/components/auth/LoginPage.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/auth/LoginPage.jsx)
- **Purpose:** Secure multi-role access for Admin, Staff, and Field Technicians, with a link to the Customer Public Tracking Portal.
- **User Flow & Navigation:**
  - Split 2-column layout on desktop: Left hero carousel showcasing features; Right login card with Mobile/Username and Password inputs.
  - Role switcher chips allow quick autofill during testing/demos.
  - Link at bottom allows instant transition to the Customer Tracking Portal (`/customer` or `/track`).
- **API Endpoints Called:**
  - `POST /api/auth/login` (payload: `{ identifier, password }`).
- **Loading & Error Handling:**
  - Submit button displays a spinning `RefreshCw` icon with "Signing in..." state.
  - Form validation displays error banners (`bg-rose-50 text-rose-700`).
- **Current Animations & Transitions:**
  - Slide carousel transitions with `fade-in`.
  - Button press feedback (`active:scale-95`).
- **Usability & UX Deficiencies:**
  - When returning to login after token expiration, the previous input values are cleared, but no informative session expiry banner is shown.
  - Left hero image carousel automatically cycles every 6 seconds without a pause-on-hover control.
- **Safe Opportunities for Improvement:**
  - Add pause-on-hover and keyboard navigation (Left/Right arrow keys) to the hero carousel.
  - Display clear "Your session has expired, please log in again" notification if redirected with `?expired=true`.

---

### Module 02: Navigation & App Shell (Navbar)

- **Primary Source:** [`client/src/components/layout/Navbar.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/layout/Navbar.jsx), [`client/src/App.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/App.jsx)
- **Purpose:** Sticky header navigation, multi-tab switching, customer lookup launcher, new ticket launcher, notifications trigger, and user profile management.
- **User Flow & Navigation:**
  - Dynamic tabs based on user role (`admin` sees 6 tabs; `staff` sees 3; `technician` sees 1; `customer` sees 1).
  - Apple-style sliding pill highlight tracks the active tab smoothly.
  - Top-right bell icon shows live unread count badge.
- **API Endpoints Called:**
  - None directly from Navbar; relies on `AuthContext` and `NotificationContext`.
- **Loading & Error Handling:**
  - Unread notification count updates reactively via context.
- **Current Animations & Transitions:**
  - Sliding pill indicator powered by [`useSlidingIndicator.js`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/hooks/useSlidingIndicator.js).
  - Mobile slide-over drawer menu uses `drawer-enter-left` / `drawer-exit-left`.
- **Usability & UX Deficiencies:**
  - On tablet devices (768px–1024px), the desktop tabs and utility buttons can collide, causing the brand logo text to truncate or wrap.
  - The role switcher dropdown lacks a subtle click-outside animation.
- **Safe Opportunities for Improvement:**
  - Collapse secondary utility icons into an overflow menu on screens between 768px and 1100px.
  - Add subtle backdrop blur to the mobile navigation drawer.

---

### Module 03: Complaints Desk (Table & Card Grid Views)

- **Primary Source:** [`client/src/components/complaints/ComplaintList.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/complaints/ComplaintList.jsx)
- **Purpose:** The operational nerve center where staff and supervisors monitor, filter, search, allocate, and process service tickets.
- **User Flow & Navigation:**
  - View switcher: Toggle between 9-column Data Table and Responsive Card Grid.
  - Filter bar: Status pill tabs (All, Unassigned, Assigned, In Progress, On Hold, Resolved, Closed, Reopened, Overdue), Product dropdown, Priority dropdown, Technician dropdown.
  - Search bar: Instant full-text search across ticket ID, customer name, mobile number, and city.
  - Clicking any row or card opens the 600px `ComplaintDetailDrawer`.
- **API Endpoints Called:**
  - `GET /api/complaints`
  - `GET /api/technicians`
  - `GET /api/products`
  - `POST /api/technicians/:id/settle-all` (quick settlement)
- **Loading & Error Handling:**
  - Renders `ComplaintGridSkeleton` during initial data load.
  - Pull-to-refresh / manual refresh button with spinning icon.
- **Current Animations & Transitions:**
  - Status tabs use `useSlidingIndicator` for sliding pill highlight.
  - Cards have subtle hover elevation (`hover:shadow-md hover:border-emerald-300`).
- **Usability & UX Deficiencies:**
  - When switching from another tab back to Complaints Desk, the entire list remounts and fetches all complaints over the network, displaying a brief loading state.
  - Status filter pill count badges (`(12)`) re-calculate on the client side, causing momentary text layout shift when data loads.
  - On mobile card view, action buttons ("Assign", "WhatsApp", "Call") stack awkwardly when customer phone numbers are long.
- **Safe Opportunities for Improvement:**
  - Keep complaints data in memory across tab switches to eliminate loading flashes.
  - Use fixed-width badge containers to eliminate text layout shift while ticket counts load.

---

### Module 04: Complaint Registration Wizard

- **Primary Source:** [`client/src/components/complaints/NewComplaintModal.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/complaints/NewComplaintModal.jsx)
- **Purpose:** Two-step guided creation modal for complaint tickets and site survey appointments with automated customer directory lookup.
- **User Flow & Navigation:**
  - **Step 1:** Product Category Selection (Solar Rooftop Systems, Solar Water Heaters, Heat Pumps, Pressure Pumps, Site Survey).
  - **Step 2:** Registration Form:
    - Customer mobile input triggers auto-lookup against the 6,102 Excel database (`GET /api/customers/search`).
    - Auto-populates consumer number, plant capacity, equipment serial numbers, and calculates 5-year warranty expiration.
    - Dynamic defect category picker filtered by chosen product.
    - Technician assignment with expected visit date.
    - In-app media dropzone (photos, PDFs, 3-minute video recorder).
  - **Success Screen:** Displays generated ticket ID (`EGS-YYYY-XXXXXX`), WhatsApp customer dispatch link, and direct "Open Ticket Details" CTA.
- **API Endpoints Called:**
  - `GET /api/customers/search?query=...`
  - `GET /api/location/pincode/:pincode`
  - `POST /api/complaints` (Multipart FormData)
  - `POST /api/complaints/draft`
- **Loading & Error Handling:**
  - Multi-stage upload progress modal (`ProcessingProgressModal`) tracks file compression, chunk upload, and database commit.
- **Current Animations & Transitions:**
  - Modal opens with `modal-enter-scale`.
  - Step transitions have no horizontal sliding animation (instant DOM replacement).
  - Closing the modal unmounts it immediately (`return null`) with no exit transition.
- **Usability & UX Deficiencies:**
  - Abrupt modal closure without exit easing feels jarring.
  - Back button from Step 2 to Step 1 resets selected defect category without an explicit confirmation prompt.
- **Safe Opportunities for Improvement:**
  - Implement smooth horizontal slide transition (`slide-left` / `slide-right`) between Step 1 and Step 2.
  - Add exit animation on modal close.

---

### Module 05: Ticket Detail Drawer & Overlays

- **Primary Source:** [`client/src/components/complaints/ComplaintDetailDrawer.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/complaints/ComplaintDetailDrawer.jsx)
- **Purpose:** Comprehensive slide-over management drawer for inspecting ticket lifecycle, audit timelines, customer communications, cash collection, and field resolution.
- **User Flow & Navigation:**
  - 4 Interior Tabs:
    1. **Overview:** Customer contact, solar equipment specs, dealer info, technician allocation card, cash collection ledger.
    2. **Timeline:** Chronological audit trail of all actions with performer names and timestamps.
    3. **Notifications:** Stream of sent WhatsApp and email messages with delivery/read ticks.
    4. **WhatsApp Chat:** Embedded two-way customer chat thread.
  - Modal Actions: "Reassign Technician", "Record Cash Payment", "Mark as Resolved", "Close Ticket", "Reopen Ticket", "Customer History".
- **API Endpoints Called:**
  - `GET /api/complaints/:id`
  - `POST /api/complaints/:id/assign`
  - `POST /api/complaints/:id/note`
  - `POST /api/complaints/:id/payment`
  - `POST /api/complaints/:id/resolve`
  - `POST /api/complaints/:id/close`
  - `POST /api/complaints/:id/reopen`
- **Loading & Error Handling:**
  - Dedicated skeleton loader for drawer overview cards.
  - Action buttons enter disabled loading state with spinner during mutation.
- **Current Animations & Transitions:**
  - Slide-in from right (`drawer-enter-right`) and slide-out (`drawer-exit-right`) via `isClosing` state.
  - Backdrop fade-in and fade-out.
- **Usability & UX Deficiencies:**
  - Component is over 5,200 lines long, making DOM re-renders heavy when typing into notes or chat inputs.
  - Nested sub-modals (e.g., Payment Modal, Resolution Modal) stack on top of the drawer with overlapping dark backdrops.
- **Safe Opportunities for Improvement:**
  - Split large internal sections into memoized subcomponents to prevent whole-drawer re-renders during text input.
  - Harmonize backdrop z-indexes so nested dialogs do not multiply blur darkness.

---

### Module 06: Technician Field Portal & Tour Ledger

- **Primary Source:** [`client/src/components/technician/TechnicianFieldPortal.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/technician/TechnicianFieldPortal.jsx), [`TourLedgerSection.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/technician/TourLedgerSection.jsx)
- **Purpose:** Field mobility portal for engineers to manage assigned jobs, navigate via Google Maps, update stages, record spare parts, and log tour travel advances/expenses.
- **User Flow & Navigation:**
  - Dual Mode: Full Field Operations vs. Accounting Tour Ledger.
  - Sub-sections: "Active Jobs", "Completed Jobs", "Cash Collection", "Tour Ledger & Vouchers".
  - One-tap actions: Call Customer, Open GPS Navigation in Google Maps, WhatsApp Message, Update Visit Stage.
- **API Endpoints Called:**
  - `GET /api/complaints` (filtered by technician)
  - `GET /api/tour-ledger?technician_id=...`
  - `POST /api/tour-expenses`
  - `POST /api/tour-advances`
  - `POST /api/tour-settlements`
- **Loading & Error Handling:**
  - Mobile-first card list with status badges and cash reconciliation summary.
- **Current Animations & Transitions:**
  - Sub-section switching uses `useSlidingIndicator`.
  - Cash ledger metric cards feature subtle hover scales.
- **Usability & UX Deficiencies:**
  - In Tour Ledger, voucher receipt image thumbnails lack instant loading indicators, causing layout jump when receipt images finish downloading.
- **Safe Opportunities for Improvement:**
  - Add aspect-ratio placeholder boxes for receipt image previews in Tour Ledger.

---

### Module 07: Customer Management & Public Tracking Portal

- **Primary Source:** [`client/src/components/customer/CustomerPublicPortal.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/customer/CustomerPublicPortal.jsx), [`CustomerSearchModal.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/customer/CustomerSearchModal.jsx)
- **Purpose:** Public-facing homeowner tracker and staff directory lookup across 6,102 installed Gujarat customer records.
- **User Flow & Navigation:**
  - Homeowners enter Ticket ID (`EGS-2026-XXXXXX`) or Mobile Number.
  - Visual 5-stage progress stepper: Registered -> Assigned -> In Progress -> Resolved -> Closed.
  - CSAT rating widget (1 to 5 stars) enabled once ticket is resolved.
- **API Endpoints Called:**
  - `GET /api/complaints/track/:query` (Public, PII-masked)
  - `POST /api/complaints/:id/feedback`
  - `GET /api/customers/search?query=...`
- **Loading & Error Handling:**
  - Sanitized PII: Displays masked phone (`******1234`) and masked email (`su***@gmail.com`).
- **Current Animations & Transitions:**
  - Stepper stages highlight with emerald check icons.
  - Star rating selector has hover bounce animation.
- **Usability & UX Deficiencies:**
  - If a customer raises a new ticket while tracking an existing one, the page does not provide an immediate confirmation banner unless they refresh.
- **Safe Opportunities for Improvement:**
  - Provide an inline "Complaint Registered! Your new tracking code is #..." banner upon successful submission.

---

### Module 08: WhatsApp Web Hub & In-App Chat

- **Primary Source:** [`client/src/components/whatsapp/WhatsAppWebInbox.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/whatsapp/WhatsAppWebInbox.jsx)
- **Purpose:** Full two-way WhatsApp Web inbox connected to Meta Cloud API for customer and technician messaging.
- **User Flow & Navigation:**
  - Master-Detail layout: Left panel shows conversation list with unread badges and filter tabs (All, Unread, Customers, Technicians); Right panel shows message stream and composer.
  - Message bubble renderers support: Text, Audio voice notes, PDF attachments, Image/Video media, Location pins, Quick reply buttons, Emoji reactions, Quoted reply previews.
  - Audio voice recorder with live waveform timer.
- **API Endpoints Called:**
  - `GET /api/whatsapp/conversations`
  - `GET /api/whatsapp/messages/:phone`
  - `POST /api/whatsapp/send-message`
  - `POST /api/whatsapp/messages/:id/react`
  - `POST /api/whatsapp/send-template`
- **Loading & Error Handling:**
  - `WhatsAppChatListSkeleton` on initial load.
  - Message status ticks: Clock (sending), Single grey tick (sent to Meta), Double grey tick (delivered to handset), Double blue tick (read by recipient).
- **Current Animations & Transitions:**
  - New message bubbles slide in with `slide-in-from-bottom-2`.
  - Emoji picker opens with `zoom-in-95`.
- **Usability & UX Deficiencies:**
  - The component is 5,225 lines. Heavy DOM list causes slight scroll stutter when viewing conversations with 200+ messages.
  - Switching between contacts resets scroll position to bottom immediately without smooth scroll.
- **Safe Opportunities for Improvement:**
  - Virtualize message list for long conversation threads.
  - Add smooth transition when selecting a new conversation thread.

---

### Module 09: Analytics Dashboard & Master Customer Directory

- **Primary Source:** [`client/src/components/admin/AnalyticsDashboard.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/admin/AnalyticsDashboard.jsx)
- **Purpose:** High-level KPI counters, resolution turnaround averages, product defect share charts, and searchable Gujarat customer database (6,102 records).
- **User Flow & Navigation:**
  - Top KPI cards: Total Tickets, Active Pipeline, Completed, CSAT Score, Site Surveys.
  - Chart bars: Product breakdown share, Top 5 issue categories percentage.
  - Searchable Customer Master Table with warranty filter chips (All, In-Warranty, Out-of-Warranty).
  - Excel drag-and-drop batch synchronizer modal.
- **API Endpoints Called:**
  - `GET /api/reports/metrics`
  - `GET /api/complaints`
  - `GET /api/technicians`
  - `GET /api/customers/stats`
  - `POST /api/customers/sync` (batch upload)
- **Loading & Error Handling:**
  - `AnalyticsDashboardSkeleton` during fetch.
- **Current Animations & Transitions:**
  - Progress bar share fills animate via width transition (`transition-all duration-500`).
- **Usability & UX Deficiencies:**
  - Calling 4 heavy API endpoints simultaneously causes the page to take longer to render than other tabs.
  - Customer table pagination is basic, with jump-to-page dropdown requiring multiple clicks.
- **Safe Opportunities for Improvement:**
  - Rely on server-side aggregated metrics instead of fetching the entire complaints array to compute stats locally.

---

### Module 10: Staff & Technician Roster Management

- **Primary Source:** [`client/src/components/admin/StaffTechnicianManager.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/admin/StaffTechnicianManager.jsx)
- **Purpose:** Administration of staff accounts, field engineers, on/off-duty switches, territory zones, and product line issue diagnostic catalog.
- **User Flow & Navigation:**
  - 3 Sub-tabs: "Field Technicians", "Staff & Admin Users", "Products & Defect Categories".
  - Dedicated modals: "Add Member", "Edit Member", "Secure Admin Password Reset".
- **API Endpoints Called:**
  - `GET /api/technicians`
  - `GET /api/auth/users`
  - `GET /api/products`
  - `POST /api/auth/create-user`
  - `POST /api/auth/admin-reset-password`
  - `PUT /api/technicians/:id/availability`
- **Loading & Error Handling:**
  - `StaffTeamSkeleton` displayed while loading.
- **Current Animations & Transitions:**
  - Subtab slider uses `useSlidingIndicator`.
  - Toggle switches animate with `transition-transform`.
- **Usability & UX Deficiencies:**
  - Deleting a member shows standard browser alert before the custom modal.
- **Safe Opportunities for Improvement:**
  - Unify all delete confirmations using `DialogContext.confirm()`.

---

### Module 11: Settings Hub & Notification Template Manager

- **Primary Source:** [`client/src/components/admin/AdminSettingsHub.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/admin/AdminSettingsHub.jsx), [`TemplateManager.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/admin/TemplateManager.jsx)
- **Purpose:** Meta WhatsApp Cloud API template status monitor, system configuration, sound preferences, device permissions, and audit logs.
- **User Flow & Navigation:**
  - Meta Template status table with live verification badges (Approved, Pending, Rejected).
  - Multi-channel editor with variable placeholders (`{{1}}`, `{{2}}`) and live smartphone preview mockup.
- **API Endpoints Called:**
  - `GET /api/notifications/meta-status`
  - `GET /api/whatsapp/templates`
- **Loading & Error Handling:**
  - Displays Meta API sync state with connection health indicators.
- **Current Animations & Transitions:**
  - Live smartphone preview updates reactively as admin types.
- **Usability & UX Deficiencies:**
  - The live smartphone preview is hidden on tablet/mobile screens without a toggle button to preview it.
- **Safe Opportunities for Improvement:**
  - Add a "Preview" tab toggle on mobile viewports so admins can inspect the message layout.

---

### Module 12: Notification Center & Overlays

- **Primary Source:** [`client/src/components/layout/NotificationDrawer.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/layout/NotificationDrawer.jsx), [`NotificationPopup.jsx`](file:///c:/Users/Administrator/.gemini/antigravity/scratch/eco-green-solar-cms/client/src/components/common/NotificationPopup.jsx)
- **Purpose:** Real-time stream of incoming WhatsApp customer messages, status changes, technician job updates, and floating toast notifications.
- **User Flow & Navigation:**
  - Right slide-over drawer (480px) triggered by top-bar bell icon.
  - Floating toast popup in bottom-right corner when new messages arrive.
  - Swipe-to-dismiss gesture on notification cards (`SwipeableCard`).
- **API Endpoints Called:**
  - `GET /api/notifications`
  - `POST /api/notifications/mark-read`
  - `POST /api/notifications/clear-all`
- **Current Animations & Transitions:**
  - Drawer uses `drawer-enter-right` and `drawer-exit-right`.
  - Floating toast popup enters with `slide-in-from-bottom-3` and spring bounce.
  - Swipe card translates smoothly with touch drag (`transform: translateX(...)`).
- **Usability & UX Deficiencies:**
  - Clicking a notification opens the ticket drawer, but leaves the notification drawer open underneath it, creating visual clutter.
- **Safe Opportunities for Improvement:**
  - Automatically close the notification drawer when a user clicks a notification to open a ticket.

---

## 3. UI Inconsistency & Usability Synthesis Matrix

| Element / Area | Current Observed State | Inconsistency / Usability Issue | Recommended Standard |
|---|---|---|---|
| **Modal Exit Transitions** | Modals return `null` immediately on close. | Abrupt, jarring disappearance compared to smooth drawers. | Standardize exit duration (200ms) with `zoom-out-95` & `fade-out`. |
| **Drawer Exit Transitions** | Handled via manual `isClosing` state and `setTimeout(..., 260)`. | Duplicated logic in multiple drawer components. | Abstract into a shared `useOverlayAnimation()` hook. |
| **Active Tab Pill** | Uses `useSlidingIndicator` with `left` and `width` in pixels. | Causes layout recalculation when tabs resize. | Convert to hardware-accelerated `transform: translateX(...)`. |
| **Card Action Buttons** | Button text wraps on mobile screens (<380px). | Text overflows container or wraps awkwardly. | Use responsive icon-only buttons on small viewports with tooltips. |
| **Backdrop Blur** | Varies between `backdrop-blur-xs`, `backdrop-blur-sm`, and none. | Inconsistent background dimming depth across dialogs. | Standardize on single token: `bg-slate-900/60 backdrop-blur-xs`. |
| **Reduced Motion** | Zero `@media (prefers-reduced-motion)` rules in CSS. | Accessibility compliance gap for sensitive users. | Add global reduced-motion overrides in `index.css`. |
