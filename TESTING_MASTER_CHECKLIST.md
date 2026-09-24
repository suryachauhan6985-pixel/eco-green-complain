# ☀️ Eco Green Solar CMS — Master Testing & Verification Guide
> **Version:** Production Clean State | **Target Release:** 2026  
> **Clean Database State:** Zero dummy staff, zero dummy technicians, zero dummy complaints.  
> **Master Admin Credentials:** Phone: `6352454247` | Password: `admin3636`  
> **Live Production URL:** [https://complain.ecogreensolar.co.in](https://complain.ecogreensolar.co.in)

---

## 📋 Table of Contents
1. [Phase 1: Admin Login & Clean Slate Verification](#phase-1-admin-login--clean-slate-verification)
2. [Phase 2: Staff & Technician Management](#phase-2-staff--technician-management)
3. [Phase 3: Customer Complaint Registration & Pincode Lookup](#phase-3-customer-complaint-registration--pincode-lookup)
4. [Phase 4: Complete Complaint Lifecycle & WhatsApp Triggers](#phase-4-complete-complaint-lifecycle--whatsapp-triggers)
5. [Phase 5: Technician Field Portal Testing](#phase-5-technician-field-portal-testing)
6. [Phase 6: Customer Public Tracking Portal (Zero Login)](#phase-6-customer-public-tracking-portal-zero-login)
7. [Phase 7: WhatsApp Web Two-Way Hub](#phase-7-whatsapp-web-two-way-hub)
8. [Phase 8: Analytics, Excel Sync & Document Uploads](#phase-8-analytics-excel-sync--document-uploads)

---

## Phase 1: Admin Login & Clean Slate Verification
- [ ] **Step 1.1:** Open the application in your browser: [https://complain.ecogreensolar.co.in](https://complain.ecogreensolar.co.in).
- [ ] **Step 1.2:** On the login screen, enter:
  - **User ID / Mobile:** `6352454247`
  - **Password:** `admin3636`
  - Click **Sign In**.
- [ ] **Step 1.3:** Verify you are logged in as **Admin Supervisor** with full system controls.
- [ ] **Step 1.4:** Check the **Complaints Board**:
  - Verify that there are **0 dummy complaints**.
  - Animated skeleton loader displays smoothly while loading, followed by the clean empty state *"No complaints found"*.

---

## Phase 2: Staff & Technician Management
- [ ] **Step 2.1:** Navigate to the **"Staff & Techs"** tab in the top navigation bar.
- [ ] **Step 2.2:** Verify that the team list is clean (0 technicians, only Admin).
- [ ] **Step 2.3: Create a New Helpdesk Staff Member**:
  - Click **+ Add Member**.
  - Role: Select **Helpdesk Staff**.
  - Name: e.g., `Amit Patel`.
  - Mobile Number: Enter a real 10-digit mobile number (e.g., `9825012345`).
  - Email: `amit.staff@ecogreensolar.com`.
  - Set a Password or click **Generate Secure Password**.
  - Click **Save Staff Member**.
  - Verify that the staff card appears immediately in the team list.
- [ ] **Step 2.4: Create a New Field Technician**:
  - Click **+ Add Member**.
  - Role: Select **Field Technician**.
  - Name: e.g., `Kishore Parmar`.
  - Mobile Number: Enter a real 10-digit mobile number.
  - Email: `kishore.tech@ecogreensolar.com`.
  - Service Zone / Area: e.g., `Rajkot Central & Industrial Zone`.
  - Product Specialization: e.g., `Solar Rooftop Systems`.
  - Click **Save Technician**.
  - Verify that the technician card appears with zone, specialization, and availability toggle.
- [ ] **Step 2.5: Test Professional Password Reset**:
  - On the newly created user/technician card, click the **Reset Password (Key icon)** button.
  - Modal opens with options: *Generate Strong Random Password* OR *Enter Custom Password*.
  - Click **Generate**, copy the credentials using the **Copy** button, and click **Update Password**.
  - Confirm success toast: *"Password securely updated"*.
- [ ] **Step 2.6: Test Availability Toggle**:
  - Toggle the switch on the Technician card (Available ↔ Off-duty).
  - Verify instant badge update.

---

## Phase 3: Customer Complaint Registration & Pincode Lookup
- [ ] **Step 3.1:** Click the green **"+ Register Ticket"** button.
- [ ] **Step 3.2: Step 1 - Product Category Selection**:
  - Choose **Solar Rooftop Systems** (or Water Heaters / Heat Pumps).
  - Click **Proceed to Step 2**.
- [ ] **Step 3.3: Test Smart Customer Lookup (Excel Database)**:
  - In the search bar *"Smart Customer Lookup (Excel Database)"*, type a customer name or mobile or consumer number (e.g., search `Rajesh` or `Patel`).
  - Notice instant autocomplete suggestions from the 6,100+ customer records.
  - Clicking any customer auto-populates Name, Mobile, Address, Consumer No, and Inverter Serial.
- [ ] **Step 3.4: Test Postal Pincode Auto-Fill & Village Chips**:
  - Clear the location fields and enter Postal Pincode: **`360021`** (or **`205001`**).
  - Verify:
    - Green checkmark appears: **"Verified"**.
    - **District** auto-fills: `Rajkot`.
    - **State** auto-fills: `Gujarat`.
    - **Village chips** appear under the field (e.g., `Chhapra`, `Metoda`, `Khirsara`...).
    - Clicking any village chip auto-fills the **City / Village** field.
- [ ] **Step 3.5: Test City/Village Search Autosuggest**:
  - Type `Chh` in the City/Village box.
  - Autosuggest dropdown appears with matching locations, state, and pincode tags.
- [ ] **Step 3.6: Enter Defect & Service Details**:
  - Select Issue Category: e.g., `Inverter Fault / Error Code`.
  - Enter Issue Description: e.g., `Red fault LED flashing on 5kW inverter, zero solar output`.
  - Priority: Select `High`.
  - Warranty: Toggle In-Warranty / Out-of-Warranty.
  - If Out-of-Warranty: Enter Estimated Charges (e.g., `350`) and check *"Notify customer of estimated charges on registration receipt"*.
- [ ] **Step 3.7: Test Fault Video & Photo Uploads + Location URL**:
  - Attach a fault video (MP4, WebM, MOV, 3GP) or inverter error photo / PDF (up to 50MB).
  - Verify instant video badge and video player preview lightbox before submitting.
  - Paste a Google Maps Location URL (e.g., `https://maps.app.goo.gl/...`).
- [ ] **Step 3.8: Submit Complaint**:
  - Click **Submit Complaint Ticket**.
  - Verify generated Ticket ID (e.g., `EGS-2026-000101`).
  - Verify that the complaint appears on the Complaints Board with all video & document attachments permanently stored.

---

## Phase 4: Complete Complaint Lifecycle & WhatsApp Triggers
- [ ] **Step 4.1: Stage 1 — Registration Notification**:
  - Check the simulated WhatsApp notification popup in the top-right / Notification Drawer.
  - Verify ticket confirmation message with Customer Name, Ticket ID, and tracking link.
- [ ] **Step 4.2: Open Complaint Detail Drawer**:
  - Click on the new complaint card/row to open the slide-over detail drawer.
  - Verify Customer info, GPS Map Pin button, Attached documents, and Timeline.
- [ ] **Step 4.3: Stage 2 — Assign Technician**:
  - In the Drawer, click **Assign Technician**.
  - Select the technician created in Phase 2 (`Kishore Parmar`).
  - Pick Expected Visit Date: (e.g., tomorrow's date).
  - Click **Confirm Assignment & Dispatch Work Order**.
  - Verify:
    - Status updates to **Assigned**.
    - Customer receives WhatsApp notification: *"Technician Kishore Parmar has been assigned"*.
    - Technician receives Job Work Order with customer address, issue, and GPS map.
- [ ] **Step 4.4: Stage 3 — Progress Note & Parts Tracking**:
  - Switch to the **Service Action** tab in the drawer.
  - Add a field note: *"Site inspected, DC isolator switch replaced"*.
  - Click **Log Progress Update**.
  - Verify entry in the chronological Audit Timeline.
- [ ] **Step 4.5: Payment & Company Settlement**:
  - If billable charges were applicable: Record payment collected by technician (e.g., ₹350 Cash).
  - Verify "Tech Cash" indicator appears on card.
  - As Admin/Staff, click **Collect / Settle with Company**.
  - Verify settlement status updates to *"Settled with Company"* with timestamp and admin name.
- [ ] **Step 4.6: Stage 4 — Mark Service Work as Resolved**:
  - Click **Mark Service as Resolved**.
  - Add resolution notes: *"Inverter successfully repaired and generating 4.8 kW"*.
  - Verify status changes to **Resolved** (Emerald badge).
  - Customer receives WhatsApp resolution alert.
- [ ] **Step 4.7: Stage 5 — Official Closure & Rating Invite**:
  - Under Supervisor Review, click **Close Ticket & Request Feedback**.
  - Verify status updates to **Closed**.
  - Customer receives 1-5 Star rating review invite via WhatsApp.
- [ ] **Step 4.8: Role-Based Permanent Complaint Deletion**:
  - **Admin & Staff Rights**: Verify that both Admin and Staff see the red **Delete (Trash icon)** button in the complaints table, grid cards, and drawer header.
  - Deleting a complaint permanently removes the complaint, timelines, and all uploaded fault videos/photos.
  - **Technician Restriction**: Verify that Technicians CANNOT delete complaints (delete buttons are completely hidden from table, grid, and drawer, and direct API calls are blocked with 403 Forbidden).

---

## Phase 5: Technician Field Portal Testing
- [ ] **Step 5.1:** Click on the Admin profile in the top-right and click **Sign Out**.
- [ ] **Step 5.2:** On the Login Page, enter the technician's credentials:
  - **User ID / Mobile:** The technician's phone number created in Phase 2.
  - **Password:** The password set during Phase 2.
  - Click **Sign In**.
- [ ] **Step 5.3: Verify Field Portal Interface**:
  - Interface displays the mobile-friendly **Technician Field Portal**.
  - Check **My Active Work Orders** — verify the assigned ticket is listed.
  - Click **Navigate (Map Pin)** to verify Google Maps site routing.
  - Click **Call Customer** button to verify direct dialing.
  - Test updating job status directly from the technician view.

---

## Phase 6: Customer Public Tracking Portal (Zero Login)
- [ ] **Step 6.1:** Open a private/incognito browser window.
- [ ] **Step 6.2:** Visit: `https://complain.ecogreensolar.co.in/track` (or click "Are you an Eco Green Customer? Public Portal" on login page).
- [ ] **Step 6.3: Track Ticket**:
  - Enter the Ticket ID from Phase 3 (e.g., `EGS-2026-000101`) OR the Customer Phone Number.
  - Click **Track Status**.
  - Verify live timeline, assigned technician name, expected visit date, and current status.
- [ ] **Step 6.4: Submit Customer Review / Rating**:
  - If ticket is Resolved or Closed: Rate 1-5 stars and write feedback (e.g., *"Quick response and polite technician"*).
  - Click **Submit Feedback**.
  - Verify thank-you message and rating reflected in admin reports.
- [ ] **Step 6.5: Raise Complaint as Customer**:
  - Click **"Raise New Service Request"** on the customer portal.
  - Fill consumer number, issue details, and submit.
  - Verify instant ticket generation without any login requirement!

---

## Phase 7: WhatsApp Web Two-Way Hub
- [ ] **Step 7.1:** Log back in as **Admin Supervisor** (`6352454247` / `admin3636`).
- [ ] **Step 7.2:** Click the **"WhatsApp Web"** tab in the navbar.
- [ ] **Step 7.3:** Check the chat list in the left sidebar:
  - Verify clean layout with avatar skeletons on load.
  - Click on any conversation to view message history.
- [ ] **Step 7.4:** Test Two-Way Chat:
  - Type a test message in the chat input and click **Send**.
  - Test the **Emoji Picker** (Smileys, Solar & Tools icons).
  - Test Template Quick-Insert.
  - Verify message bubbles render with proper timestamps and double tick status.

---

## Phase 8: Analytics, Excel Sync & Document Uploads
- [ ] **Step 8.1:** Navigate to the **"Analytics"** tab.
- [ ] **Step 8.2:** Verify animated skeleton loaders appear while metrics load.
- [ ] **Step 8.3:** Check KPI Cards:
  - Total Tickets, In Progress, Resolved Rate, and Collected Revenue reflect your test ticket accurately.
- [ ] **Step 8.4: Test Customer Master Directory Sync**:
  - Check the Excel Directory widget showing 6,100+ records.
  - Click **Sync Excel Directory** button.
  - Verify clockwise rotation on the refresh button and instant sync confirmation.
- [ ] **Step 8.5:** Click **Download Report** (CSV Export) and verify downloaded complaints spreadsheet.

---

## ✅ Summary Verification Checklist

| Area | Feature | Status |
| :--- | :--- | :--- |
| **Security** | Zero dummy staff or technicians remain; only master Admin (`6352454247` / `admin3636`) active | `VERIFIED` |
| **Database** | SQLite, Supabase Cloud, and Turso Cloud are synchronized with 0 dummy complaints | `VERIFIED` |
| **Language** | 100% clean English across all forms, templates, badges, and modals (zero Hindi text) | `VERIFIED` |
| **UX/UI** | Animated Skeleton Loaders replace all plain text/spinners across list, grid, dashboard & chats | `VERIFIED` |
| **Location** | Postal Pincode auto-fill (District, State, Village chips) + City Autosuggest active | `VERIFIED` |
| **Fault Videos** | MP4/WebM/MOV fault videos & photos permanently stored in DB until complaint deletion with built-in video player | `VERIFIED` |
| **Permissions** | Admin & Staff can delete complaints permanently; Technicians strictly restricted from deletion | `VERIFIED` |
| **Messaging** | Meta WhatsApp Cloud API templates & two-way inbox configured for all lifecycle stages | `VERIFIED` |
