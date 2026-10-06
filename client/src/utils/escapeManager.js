/**
 * Global Escape Key & Multi-Stage Navigation Manager
 * 
 * Manages a true LIFO (Last-In-First-Out) stack of escape handlers across the application.
 * When the user presses the 'Escape' key, only the topmost active stage/modal/sub-view handler
 * is executed, stepping back exactly one stage at a time, eventually arriving at the dashboard.
 */
import { useEffect, useRef } from 'react';

export const ESCAPE_PRIORITY = {
  DIALOG: 100,        // Custom confirmation, alert, prompt modals
  INNER_MODAL: 80,    // Sub-modals inside drawers (edit modal, preview modal, payment modal, etc.)
  DRAWER: 60,         // Main drawers & full modals (Ticket detail, New ticket, Customer search, etc.)
  SUBVIEW: 40,        // Active chat in WhatsApp, sub-sections in technician, subtabs in settings, search input
  TAB_STACK: 10       // Top-level tab navigation history stack (eventually lands on root dashboard)
};

const handlers = [];
let nextId = 1;

/**
 * Register an escape handler function.
 * Handler should return `true` if it consumed the escape action (stepped back one stage),
 * or `false` if it had nothing to consume.
 */
export function registerEscapeHandler(handler, { priority = ESCAPE_PRIORITY.DRAWER } = {}) {
  const item = {
    id: nextId++,
    handler,
    priority,
    timestamp: Date.now()
  };
  handlers.push(item);

  return () => {
    const idx = handlers.findIndex(h => h.id === item.id);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
  };
}

/**
 * React hook to register an escape handler when `isActive` is true.
 */
export function useEscapeHandler(handler, isActive = true, { priority = ESCAPE_PRIORITY.DRAWER } = {}) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!isActive) return;

    const unregister = registerEscapeHandler((e) => {
      if (handlerRef.current) {
        return handlerRef.current(e);
      }
      return false;
    }, { priority });

    return unregister;
  }, [isActive, priority]);
}

/**
 * Handle Escape key globally.
 * Sorts handlers by priority (descending), then by order of registration (LIFO - newest first).
 */
export function handleGlobalEscape(e) {
  if (e.key !== 'Escape') return false;

  // Clone handlers list and sort by priority desc, then timestamp/index desc (LIFO)
  const sorted = [...handlers].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.id - a.id; // newer handler first
  });

  for (const item of sorted) {
    try {
      const consumed = item.handler(e);
      if (consumed) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        return true;
      }
    } catch (err) {
      console.error('[EscapeManager] Handler error:', err);
    }
  }

  return false;
}

// Global window event listener initialization
let isGlobalListenerAttached = false;
export function initGlobalEscapeListener() {
  if (typeof window === 'undefined' || isGlobalListenerAttached) return;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      handleGlobalEscape(e);
    }
  }, { capture: true });

  isGlobalListenerAttached = true;
}
