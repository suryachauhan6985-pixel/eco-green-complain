const assert = require('assert');

// Simulate the Escape Manager logic in Node.js environment
const ESCAPE_PRIORITY = {
  DIALOG: 100,
  INNER_MODAL: 80,
  DRAWER: 60,
  SUBVIEW: 40,
  TAB_STACK: 10
};

let handlers = [];
let nextId = 1;
let lastEscapeHandledAt = 0;
const ESCAPE_COOLDOWN_MS = 200;

function registerEscapeHandler(handler, { priority = ESCAPE_PRIORITY.DRAWER } = {}) {
  const item = {
    id: nextId++,
    handler,
    priority,
    timestamp: Date.now()
  };
  handlers.push(item);
  return () => {
    const idx = handlers.findIndex(h => h.id === item.id);
    if (idx !== -1) handlers.splice(idx, 1);
  };
}

function handleGlobalEscape(e = { key: 'Escape' }) {
  if (e.key !== 'Escape') return false;

  // Suppress repeat
  if (e.repeat) return false;

  // Cooldown
  const now = Date.now();
  if (now - lastEscapeHandledAt < ESCAPE_COOLDOWN_MS) {
    return false;
  }

  const sorted = [...handlers].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.id - a.id;
  });

  for (const item of sorted) {
    const consumed = item.handler(e);
    if (consumed) {
      lastEscapeHandledAt = Date.now();
      return true;
    }
  }
  return false;
}

console.log('--- TEST 1: Photo Preview Inside Complaint Drawer (Exact User Scenario) ---');
handlers = [];
nextId = 1;
lastEscapeHandledAt = 0;

let currentTab = 'complaints';
let selectedComplaintId = 'EGS-2026-000101';
let previewDocModal = null;

// Register App Tab Stack (Priority 10)
registerEscapeHandler(() => {
  if (selectedComplaintId) return false;
  return false;
}, { priority: ESCAPE_PRIORITY.TAB_STACK });

// Register Complaint Detail Drawer (Priority 60)
registerEscapeHandler(() => {
  if (previewDocModal) return false; // Must NEVER close drawer if preview is open
  selectedComplaintId = null;
  return true;
}, { priority: ESCAPE_PRIORITY.DRAWER });

// User clicks on photo inside complaint drawer
previewDocModal = { url: 'https://cdn.example.com/photo.jpg', name: 'photo.jpg' };
const unregPreview = registerEscapeHandler(() => {
  previewDocModal = null;
  return true;
}, { priority: ESCAPE_PRIORITY.INNER_MODAL });

// Initial assertion
assert.strictEqual(Boolean(selectedComplaintId), true, 'Drawer should be open');
assert.strictEqual(Boolean(previewDocModal), true, 'Photo preview should be open');

// 1st Esc: Should close ONLY photo preview
let consumed = handleGlobalEscape();
assert.strictEqual(consumed, true, 'First Esc should be handled');
assert.strictEqual(previewDocModal, null, 'Photo preview MUST be closed on 1st Esc');
assert.strictEqual(selectedComplaintId, 'EGS-2026-000101', 'Complaint drawer MUST remain open on 1st Esc');
console.log('✓ Esc 1: Photo preview closed. Complaint drawer remains open at EGS-2026-000101.');
unregPreview();

// 2nd Esc during cooldown (<200ms): Should be ignored to prevent double-skipping
const rapidEvent = handleGlobalEscape();
assert.strictEqual(rapidEvent, false, 'Rapid bounce within cooldown should be ignored');
assert.strictEqual(selectedComplaintId, 'EGS-2026-000101', 'Complaint drawer still preserved during cooldown window');
console.log('✓ Rapid bounce guard: Cooldown correctly ignored accidental double-trigger.');

// 2nd Esc after cooldown: Closes complaint drawer
lastEscapeHandledAt = 0; // Simulate time passed >200ms
consumed = handleGlobalEscape();
assert.strictEqual(consumed, true, 'Second Esc should close the drawer');
assert.strictEqual(selectedComplaintId, null, 'Complaint drawer should be closed on 2nd Esc');
console.log('✓ Esc 2: Complaint drawer closed cleanly back to complaints list.');

// Test repeat suppression
console.log('\n--- TEST 2: OS Keyboard Repeat Suppression ---');
handlers = [];
nextId = 1;
lastEscapeHandledAt = 0;
let testCount = 0;
registerEscapeHandler(() => {
  testCount++;
  return true;
}, { priority: ESCAPE_PRIORITY.DRAWER });

consumed = handleGlobalEscape({ key: 'Escape', repeat: true });
assert.strictEqual(consumed, false, 'Repeated keydown should be ignored');
assert.strictEqual(testCount, 0, 'Handler should not execute on repeat');
console.log('✓ Repeat keydown ignored successfully.');

console.log('\n--- ALL TESTS PASSED! ---');
