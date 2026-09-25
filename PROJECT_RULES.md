# Eco Green Solar CMS — Project Rules & Guidelines

> **Rule Version:** 1.0.0  
> **Last Updated:** 2026-09-25  
> **Target Project:** Eco Green Solar CMS (`suryachauhan6985-pixel/eco-green-complain`)

---

## 1. Linear Issue Tracking & Workflow (MANDATORY)

- **Official Linear Workspace URL:**  
  [https://linear.app/eco-green-solar-cms/team/ECO/all](https://linear.app/eco-green-solar-cms/team/ECO/all)
- **Team Key:** `ECO`
- **Linear Workspace Name:** `eco-green-solar-cms`

### When User Says:
*"is project ke issue linear main se dekho or solve karo"* (or any variation like *"check issues in Linear / solve linear issues"*):
1. **Always reference this Linear team:** `eco-green-solar-cms/team/ECO/all`.
2. **Retrieve Issues:**
   - Use Linear MCP tools (`linear_search_issues`, `linear_get_issue`, etc.) when authenticated.
   - If MCP requires an API key, check `C:\Users\Administrator\.gemini\config\mcp_config.json` (`LINEAR_API_KEY`).
   - If Linear MCP key is missing or prompt provides direct issue details/URL, process the specified Linear task or request the user to provide the Personal API token once.
3. **Issue Resolution Lifecycle:**
   - **Step 1:** Read issue title, description, attachments, and repro steps.
   - **Step 2:** Locate the affected component / backend route in the codebase.
   - **Step 3:** Implement the fix / feature following the project design system and architecture.
   - **Step 4:** Validate and verify the fix locally (run dev server / tests / checks).
   - **Step 5:** Mark issue updated / resolved in Linear or report back the exact resolution diff to the user.

---

## 2. Project Architecture & Directory Map

- **Frontend (`client/`):** React 18, Vite, TailwindCSS / Custom Design System, Lucide Icons.
  - Components: `client/src/components/`
  - Pages / Views: Admin, Staff, Technician, Customer Public Portal (`client/src/components/public/`)
  - State & Context: `client/src/context/` (Auth, Notification, Language, etc.)
  - Demo Data: `client/src/data/demoData.js`
- **Backend (`server/` & `api/`):** Express.js API.
  - Controllers: `server/controllers/`
  - Models: `server/models/`
  - Routes: `server/routes/`
  - Seed Data: `server/data/seed.js`
- **WhatsApp Integration:** `whatsapp-master-relay-extension/`, Meta WhatsApp Cloud API templates & two-way inbox.
- **Master Documentation:**
  - `TESTING_MASTER_CHECKLIST.md` — Active verification checklist for all features.
  - `STITCH_EXISTING_SYSTEM_AUDIT.md` — System audit & components state.
  - `STITCH_SCREEN_INVENTORY.md` — Screen catalog & routes.
  - `STITCH_USER_FLOWS.md` — Flow documentation for Admin, Technician, Customer.

---

## 3. Core Coding & UI Standards

1. **Clean UI Language:**
   - 100% clean English across all customer & staff UI forms, badges, modals, and templates (no accidental mix of Hindi script in production UI strings unless localization switch is explicitly engaged).
2. **Visual & Aesthetic Quality:**
   - Modern, responsive, premium glassmorphic / clean solar theme (emerald/green/slate palette).
   - Dynamic micro-interactions, responsive layouts (mobile & desktop), animated skeleton loaders instead of plain text spinners.
3. **No Hallucinations / Verification Rule:**
   - Always inspect existing files using `view_file` or `grep_search` before modifying.
   - Never assume APIs or props exist without checking their definitions.
   - Always maintain documentation integrity in `TESTING_MASTER_CHECKLIST.md`.
4. **Safety & Zero Data Loss:**
   - Never run destructive commands (deleting database without backup, dropping collections, etc.) without explicit permission.
