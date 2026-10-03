/**
 * Live Real-Time Multi-Tab & Multi-Window Synchronization Utility
 * Enables seamless instant synchronization across Admin, Staff, and Technician views
 * without requiring manual browser reload (F5).
 */

const SYNC_KEYS = {
  COMPLAINTS: 'egs_live_complaints_sync',
  LEDGER: 'egs_live_ledger_sync',
  TECHS: 'egs_live_techs_sync'
};

const SYNC_EVENTS = {
  COMPLAINTS: 'complaints-updated',
  LEDGER: 'tour-ledger-updated',
  TECHS: 'technicians-updated'
};

// Create a BroadcastChannel instance if supported by the browser
let broadcastChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('egs_live_bus');
  }
} catch (_) {
  broadcastChannel = null;
}

/**
 * Broadcast an event across the current window, other tabs, and other windows
 */
function emitSync(channelKey, eventName, detail = {}) {
  const payload = {
    channel: channelKey,
    event: eventName,
    timestamp: Date.now(),
    detail
  };

  // 1. Dispatch custom event in current window/document
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
    }
  } catch (_) {}

  // 2. Broadcast to other tabs & windows via BroadcastChannel (zero latency)
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage(payload);
    }
  } catch (_) {}

  // 3. Fallback across all browser instances via localStorage storage event
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(channelKey, JSON.stringify(payload));
    }
  } catch (_) {}
}

export function broadcastComplaintsUpdate(detail = {}) {
  emitSync(SYNC_KEYS.COMPLAINTS, SYNC_EVENTS.COMPLAINTS, detail);
}

export function broadcastLedgerUpdate(detail = {}) {
  emitSync(SYNC_KEYS.LEDGER, SYNC_EVENTS.LEDGER, detail);
}

export function broadcastTechniciansUpdate(detail = {}) {
  emitSync(SYNC_KEYS.TECHS, SYNC_EVENTS.TECHS, detail);
}

/**
 * Subscribe a component to live synchronization events
 * @param {string|string[]} types - 'complaints' | 'ledger' | 'techs' or ['complaints', 'techs']
 * @param {Function} callback - Function called with payload when sync event occurs
 * @param {Object} options - { onFocus: boolean (default true), onVisible: boolean (default true) }
 * @returns {Function} unsubscribe cleanup function
 */
export function subscribeLiveSync(types, callback, options = { onFocus: true, onVisible: true }) {
  if (typeof window === 'undefined' || typeof callback !== 'function') {
    return () => {};
  }

  const requestedTypes = Array.isArray(types) ? types : [types];
  const targetKeys = new Set();
  const targetEvents = new Set();

  requestedTypes.forEach(t => {
    const norm = String(t).toLowerCase();
    if (norm.includes('complaint')) {
      targetKeys.add(SYNC_KEYS.COMPLAINTS);
      targetEvents.add(SYNC_EVENTS.COMPLAINTS);
    }
    if (norm.includes('ledger') || norm.includes('advance') || norm.includes('voucher') || norm.includes('expense')) {
      targetKeys.add(SYNC_KEYS.LEDGER);
      targetEvents.add(SYNC_EVENTS.LEDGER);
    }
    if (norm.includes('tech') || norm.includes('staff') || norm.includes('team')) {
      targetKeys.add(SYNC_KEYS.TECHS);
      targetEvents.add(SYNC_EVENTS.TECHS);
    }
  });

  // Debounce callback to prevent rapid redundant re-fetches
  let debounceTimer = null;
  const triggerCallback = (meta) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(meta);
    }, 100);
  };

  // 1. Custom in-window event listeners
  const customListeners = [];
  targetEvents.forEach(evtName => {
    const listener = (e) => {
      triggerCallback(e.detail || { event: evtName, timestamp: Date.now() });
    };
    window.addEventListener(evtName, listener);
    customListeners.push({ evtName, listener });
  });

  // 2. Storage event listener (cross-tab)
  const handleStorage = (e) => {
    if (e.key && targetKeys.has(e.key)) {
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : { timestamp: Date.now() };
        triggerCallback(parsed);
      } catch (_) {
        triggerCallback({ timestamp: Date.now() });
      }
    }
  };
  window.addEventListener('storage', handleStorage);

  // 3. BroadcastChannel listener
  const handleBcMessage = (e) => {
    if (e.data && targetKeys.has(e.data.channel)) {
      triggerCallback(e.data);
    }
  };
  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBcMessage);
  }

  // 4. Focus & Visibility Change listeners
  const handleFocus = () => {
    if (options.onFocus) {
      triggerCallback({ reason: 'focus', timestamp: Date.now() });
    }
  };
  const handleVisibility = () => {
    if (options.onVisible && document.visibilityState === 'visible') {
      triggerCallback({ reason: 'visibility', timestamp: Date.now() });
    }
  };

  if (options.onFocus) window.addEventListener('focus', handleFocus);
  if (options.onVisible) {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  // Return cleanup function
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    customListeners.forEach(({ evtName, listener }) => {
      window.removeEventListener(evtName, listener);
    });
    window.removeEventListener('storage', handleStorage);
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBcMessage);
    }
    if (options.onFocus) window.removeEventListener('focus', handleFocus);
    if (options.onVisible) {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
  };
}
