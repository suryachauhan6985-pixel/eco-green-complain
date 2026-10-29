# PRODUCTION DATA SAFETY & ARCHITECTURAL RISK AUDIT

> **Document ID:** `06_PRODUCTION_SAFETY_AUDIT`  
> **Status:** Codebase Verified Audit  
> **Target System:** Eco Green Solar CRM (`eco-green-solar-cms`)  
> **Author:** Antigravity Senior Architecture & Safety Team  
> **Audited Modules:** Supabase PostgreSQL, Cloudflare Worker R2 Integration, WhatsApp Webhook Engine, Financial Ledgers, RBAC  

---

## 1. Executive Safety Charter

The Eco Green Solar CRM handles critical customer disputes, active field engineering assignments, technician cash disbursements, regulatory customer service records, and Meta WhatsApp customer conversations. 

Any optimization (caching, navigation transitions, animation systems, or UI redesign) must operate under an absolute **zero-data-loss, zero-regression guarantee**. This report establishes the invariant boundary conditions, identifies existing systemic architectural risks, and specifies the defensive guardrails required prior to introducing client-side caching or animation refactoring.

```
       ┌────────────────────────────────────────────────────────┐
       │              PRODUCTION SAFETY BOUNDARY               │
       ├─────────────────────────┬──────────────────────────────┤
       │ Invariant Asset         │ Protection Mechanism         │
       ├─────────────────────────┼──────────────────────────────┤
       │ Complaint Records       │ Immutable Audit Trails       │
       │ Financial Advances      │ Monotonic Ledger Balance     │
       │ Media Attachments       │ R2 Checksum & Retention Rules│
       │ WhatsApp Message Logs   │ Idempotent Webhook Processing│
       │ User Role Boundaries    │ Stateless JWT Cryptographic  │
       │                         │ Context Verification         │
       └─────────────────────────┴──────────────────────────────┘
```

---

## 2. Inventory of Critical Business Data Assets

### 2.1 Complaint Records & Escalation State Machine
- **Database Tables:** `complaints`, `complaint_history`, `complaint_assignments`, `site_surveys`
- **Integrity Requirement:** Complaint statuses (`REGISTERED`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) must transition strictly forward according to validated state machine logic.
- **Identified Hazard:** Stale client-side caches must never allow an engineer to mark a ticket as "IN_PROGRESS" if an administrator has already cancelled or escalated it. Optimistic UI mutations without optimistic rollback will corrupt ticket assignment displays.

### 2.2 Financial Ledgers & Technician Disbursements
- **Database Tables:** `technician_advances`, `advance_settlements`, `technician_vouchers`
- **Integrity Requirement:** Technician cash advances and settlement vouchers calculate real-time net balances:
  $$\text{Balance} = \sum \text{Advances Approved} - \sum \text{Settled Vouchers}$$
- **Identified Hazard:** `advance_settlements` updates must execute in a strictly serialized atomic transaction (`BEGIN...COMMIT`). If aggressive caching serves a stale `current_balance`, an administrator may double-disburse cash to a technician.

### 2.3 Cloudflare R2 Media & Binary Attachments
- **Bucket Identification:** `eco-green-solar-cms-media` (Verified in `wrangler.toml:29`)
- **Key Prefixing:** `complaints/{id}/{timestamp}_{filename}`, `technicians/{id}/profile_{hash}.jpg`
- **Critical Code Invariant:** In `worker/src/routes/complaintRoutes.js`, attachment references are stored as R2 object keys in `complaints.attachments` (JSONB column).
- **Identified Hazard:** 
  1. *De-referencing Orphan Risk:* Deleting or resetting a complaint must never execute a wildcard bucket deletion (`R2.delete()`) without transaction verification.
  2. *Lifecycle Expiration Policy:* R2 must not be configured with lifecycle expiration policies shorter than the regulatory dispute window (minimum 365 days).

### 2.4 WhatsApp Chat History & Message Delivery States
- **Database Tables:** `whatsapp_messages`, `whatsapp_conversations`, `whatsapp_templates`
- **Integrity Requirement:** WhatsApp messages ingested via the Cloudflare Worker webhook (`/api/whatsapp/webhook`) contain external WhatsApp Message IDs (`wamid.HB...`).
- **Critical Code Invariant:** `worker/src/routes/whatsappRoutes.js` processes inbound Webhook events and status updates (`sent` $\to$ `delivered` $\to$ `read`).
- **Identified Hazard:** High concurrency webhook bursts from Meta could cause duplicate inserts if `wamid` lacks a unique constraint or if client-side polling overrides optimistic read states.

---

## 3. High-Risk Architectural Vulnerabilities Identified in Code

### 3.1 Shared Cache Leakage Hazard Between User Roles (RBAC Pollution)
* **Status:** Verified Critical Architecture Pre-Condition
* **Code Trace:** `client/src/context/AuthContext.jsx` manages `user` state and permissions. However, `client/src/api/client.js` currently stores tokens in `localStorage.getItem('token')`.
* **The Hazard:** If a global in-memory cache (e.g., `apiCache = new Map()`) is implemented naively at module scope in `client.js`:
  - When an Admin logs out and a Field Staff or Technician logs in on the same browser session without a hard page reload, the module-level `apiCache` would persist across logins.
  - A technician could query `/api/technicians` or `/api/reports` and receive cached administrative payroll or customer PII from the previous session.
* **Mandatory Guardrail:** 
  - Every client-side cache key must incorporate the tenant/user scope: `${user.id}:${endpoint}:${serializedParams}`.
  - `AuthContext.logout()` must invoke `cache.clear()` explicitly, purging all memory and IndexedDB partitions.

### 3.2 Double-Submission & Mutation Race Conditions
* **Status:** Verified Code-Level Exposure
* **Code Trace:** In `client/src/components/NewComplaintModal.jsx:214-258`:
  ```javascript
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // Basic flag check
    setLoading(true);
    try {
      await api.createComplaint(formData);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  ```
* **The Hazard:**
  - If network latency fluctuates (e.g., on 3G mobile connections in rural solar sites), users routinely double-click the primary submit button.
  - While `if (loading) return` exists, asynchronous form validation steps before `setLoading(true)` allow rapid multiple clicks to fire parallel POST requests.
  - The backend lacks an `Idempotency-Key` header check, leading to duplicate complaints in `complaints` table with identical customer phone numbers.
* **Mandatory Guardrail:** 
  - Generate a client-side UUID idempotency key per modal open session.
  - Pass `X-Idempotency-Key: ${uuid}` in `POST /api/complaints`.
  - Backend must enforce a short-lived Redis/KV or DB lock on `(customer_phone, idempotency_key)`.

### 3.3 Database Stale Data & Optimistic Mutation Rollbacks
* **Status:** High Risk for Field Technicians
* **Scenario:** A technician marks a ticket as `RESOLVED` in `TechnicianDashboard.jsx`. If optimistic UI updates the card to "Resolved" and stops polling, but the backend rejects the update (e.g., mandatory handover photo missing), the technician leaves the customer premises believing the job is completed.
* **Mandatory Guardrail:** 
  - Optimistic updates must retain the previous state snapshot.
  - If mutation fails, immediately roll back the UI state and trigger an assertive toast alert: *"Ticket update rejected by server. Reason: ..."*.

### 3.4 WhatsApp Delivery & Read Status Race Conditions
* **Status:** Code-Level Verified
* **Code Trace:** `worker/src/routes/whatsappRoutes.js:410-445` handles incoming webhook status receipts (`delivered`, `read`).
* **The Hazard:**
  - Meta does not guarantee that webhooks arrive in chronological order. A `read` status event can arrive before a `delivered` status event due to edge network routing.
  - If the database query blindly overwrites `status = $1`, a late-arriving `delivered` status can demote a `read` message back to `delivered`.
* **Mandatory Guardrail:** 
  - Status progression must be monotonically guarded in SQL:
    ```sql
    UPDATE whatsapp_messages 
    SET status = CASE 
      WHEN status = 'read' THEN 'read'
      WHEN status = 'delivered' AND $1 = 'sent' THEN 'delivered'
      ELSE $1 
    END,
    updated_at = NOW()
    WHERE wamid = $2;
    ```

---

## 4. Comprehensive Failure Mode & Effects Analysis (FMEA)

| Failure Mode | Root Cause | Severity | Probability | Prevention / Mitigation Mechanism |
| :--- | :--- | :---: | :---: | :--- |
| **Duplicate Complaint Created** | Rapid double-click on mobile network with delayed button disabling | High | High | Client-side button freeze on pointer down + `X-Idempotency-Key` header |
| **RBAC Data Leakage via Cache** | In-memory cache shared across user sessions without session invalidation | Critical | Med | Scope cache keys by `userId`; purge cache completely inside `logout()` |
| **Financial Over-Disbursement** | Stale balance served from client cache during voucher approval | Critical | Low | Tier E classification: Mark `/api/technicians/:id/advances` as strictly uncacheable (`no-store`) |
| **Orphan Media Files in R2** | Upload succeeded to R2, but DB `INSERT INTO complaints` failed | Low | Med | Implement daily cleanup worker scanning for unreferenced R2 keys older than 24h |
| **Technician Job Overwrite** | Two staff members assign different technicians to the same ticket simultaneously | High | Med | Optimistic locking using `version` column or `WHERE status = 'REGISTERED'` constraint |
| **WhatsApp Chat Desynchronization** | Polling interval collides with optimistic message send | Med | High | Append local temporary message with `temp_id`, reconcile when webhook returns `wamid` |

---

## 5. Safe Rollback and Zero-Downtime Deployment Strategy

### 5.1 Immutable Rollback Checkpoints
All future enhancements must follow a three-stage rollout where every stage can be independently reverted within 60 seconds without database rollbacks:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      THREE-TIER ROLLBACK ARCHITECTURE                  │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Frontend Client Caching & Transitions                               │
│    Revert Action: Feature flag `ENABLE_CLIENT_CACHE = false` in        │
│    `client/src/config/features.js` (Instant fallback to direct fetch)  │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Backend Hyperdrive Query Optimization                               │
│    Revert Action: `git revert` on Cloudflare Worker routes and         │
│    re-deploy worker (`wrangler deploy` executes in < 15 seconds)       │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Database Schema Indexes & Triggers                                  │
│    Revert Action: Additive migrations only (`CREATE INDEX CONCURRENTLY`│
│    Never drop columns or change types in production)                   │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Verification Test Matrix Prior to Deployment
Before any performance or animation code is merged into `main`:
1. **Financial Balance Verification:** Execute 10 concurrent advance settlements and verify final ledger balance matches mathematical sum of vouchers.
2. **Role Switching Test:** Log in as Admin, visit Dashboard $\to$ Log out $\to$ Log in as Technician $\to$ Verify zero Admin data appears in memory or UI.
3. **Network Latency Simulation:** Throttle network to "Slow 3G" in Chrome DevTools, click "Submit Complaint" 5 times rapidly $\to$ Verify exactly 1 complaint created.
4. **Offline Resilience Test:** Disconnect Wi-Fi while navigating tabs $\to$ Verify graceful error toast instead of unhandled blank screen.
5. **WhatsApp Concurrency Test:** Send 20 inbound messages via Meta test tool while simultaneously sending 2 outbound templates $\to$ Verify zero message drops or ordering scrambles.
