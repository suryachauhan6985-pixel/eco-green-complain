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

function handleGlobalEscape() {
  const sorted = [...handlers].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.id - a.id;
  });

  for (const item of sorted) {
    const consumed = item.handler({ key: 'Escape' });
    if (consumed) return true;
  }
  return false;
}

console.log('--- TEST 1: Hierarchical Priority LIFO execution ---');
handlers = [];
nextId = 1;

let appStage = 'complaints';
let tabHistory = ['complaints'];
let activeDrawer = null;
let innerPreview = null;
let dialogOpen = false;

// Register App Tab Stack (Priority 10)
registerEscapeHandler(() => {
  if (activeDrawer) return false;
  while (tabHistory.length > 0 && tabHistory[tabHistory.length - 1] === appStage) {
    tabHistory.pop();
  }
  if (tabHistory.length > 0) {
    appStage = tabHistory.pop();
    return true;
  }
  if (appStage !== 'complaints') {
    appStage = 'complaints';
    return true;
  }
  return false;
}, { priority: ESCAPE_PRIORITY.TAB_STACK });

// User navigates: complaints -> analytics -> team -> settings
['analytics', 'team', 'settings'].forEach(t => {
  tabHistory.push(t);
  appStage = t;
});

assert.strictEqual(appStage, 'settings');

// Open ticket drawer (Priority 60)
activeDrawer = 'TICKET-101';
const unregDrawer = registerEscapeHandler(() => {
  if (innerPreview || dialogOpen) return false;
  activeDrawer = null;
  return true;
}, { priority: ESCAPE_PRIORITY.DRAWER });

// Open image preview inside ticket (Priority 80)
innerPreview = 'photo.jpg';
const unregPreview = registerEscapeHandler(() => {
  if (dialogOpen) return false;
  innerPreview = null;
  return true;
}, { priority: ESCAPE_PRIORITY.INNER_MODAL });

// Open confirm dialog on top (Priority 100)
dialogOpen = true;
const unregDialog = registerEscapeHandler(() => {
  dialogOpen = false;
  return true;
}, { priority: ESCAPE_PRIORITY.DIALOG });

console.log('Initial State: settings tab, ticket drawer open, image preview open, confirm dialog open');

// Press 1: Should close ONLY confirm dialog
let handled = handleGlobalEscape();
assert.strictEqual(handled, true);
assert.strictEqual(dialogOpen, false, 'Dialog should be closed');
assert.strictEqual(innerPreview, 'photo.jpg', 'Inner preview should remain open');
assert.strictEqual(activeDrawer, 'TICKET-101', 'Drawer should remain open');
assert.strictEqual(appStage, 'settings', 'Should remain on settings tab');
console.log('✓ Esc 1: Closed Dialog only. Image preview & drawer preserved.');
unregDialog();

// Press 2: Should close ONLY image preview
handled = handleGlobalEscape();
assert.strictEqual(handled, true);
assert.strictEqual(innerPreview, null, 'Inner preview should be closed');
assert.strictEqual(activeDrawer, 'TICKET-101', 'Drawer should remain open');
assert.strictEqual(appStage, 'settings', 'Should remain on settings tab');
console.log('✓ Esc 2: Closed Image preview only. Ticket drawer preserved.');
unregPreview();

// Press 3: Should close ticket drawer
handled = handleGlobalEscape();
assert.strictEqual(handled, true);
assert.strictEqual(activeDrawer, null, 'Drawer should be closed');
assert.strictEqual(appStage, 'settings', 'Should remain on settings tab');
console.log('✓ Esc 3: Closed Ticket drawer. Remained on settings tab (did NOT jump to dashboard).');
unregDrawer();

// Press 4: Stepping back in tab history: settings -> team
handled = handleGlobalEscape();
assert.strictEqual(handled, true);
assert.strictEqual(appStage, 'team', 'Should step back to team tab');
console.log('✓ Esc 4: Stepped back to Team tab.');

// Press 5: Stepping back in tab history: team -> analytics
handled = handleGlobalEscape();
assert.strictEqual(handled, true);
assert.strictEqual(appStage, 'analytics', 'Should step back to analytics tab');
console.log('✓ Esc 5: Stepped back to Analytics tab.');

// Press 6: Stepping back in tab history: analytics -> complaints (Dashboard)
handled = handleGlobalEscape();
assert.strictEqual(handled, true);
assert.strictEqual(appStage, 'complaints', 'Should step back to complaints dashboard');
console.log('✓ Esc 6: Stepped back to Complaints Dashboard (Root).');

// Press 7: Already on complaints dashboard with no overlays: should stay on complaints
handled = handleGlobalEscape();
assert.strictEqual(handled, false, 'No higher stage to pop');
assert.strictEqual(appStage, 'complaints', 'Stays on complaints dashboard');
console.log('✓ Esc 7: Maintained on Complaints Dashboard (no reload, no jump).');

console.log('\n--- ALL ESCAPE STAGE TESTS PASSED SUCCESSFULLY! ---');
