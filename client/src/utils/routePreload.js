/**
 * High-performance route and chunk preloader
 * Pre-fetches lazy-loaded tabs and heavy modals in the background so
 * user navigation is instant (0ms delay) with no "Loading view..." flash.
 */

const preloadedModules = new Set();

const tabLoaders = {
  technician: () => import('../components/technician/TechnicianFieldPortal'),
  team: () => import('../components/admin/StaffTechnicianManager'),
  analytics: () => import('../components/admin/AnalyticsDashboard'),
  settings: () => import('../components/admin/AdminSettingsHub'),
  templates: () => import('../components/admin/AdminSettingsHub'),
  'whatsapp-inbox': () => import('../components/whatsapp/WhatsAppWebInbox'),
  customer: () => import('../components/customer/CustomerPublicPortal'),
  customerSearch: () => import('../components/customer/CustomerSearchModal'),
  customerHistory: () => import('../components/complaints/CustomerHistoryModal'),
  complaintDrawer: () => import('../components/complaints/ComplaintDetailDrawer'),
  newComplaint: () => import('../components/complaints/NewComplaintModal'),
};

export const preloadComponent = (key) => {
  if (!key || preloadedModules.has(key)) return;
  const loader = tabLoaders[key];
  if (typeof loader === 'function') {
    preloadedModules.add(key);
    loader().catch((err) => {
      preloadedModules.delete(key);
      console.warn(`[Preload] Error prefetching "${key}":`, err);
    });
  }
};

export const preloadAllSecondaryTabs = () => {
  const runPreload = () => {
    // Eagerly prefetch in order of user probability
    const priorityKeys = ['technician', 'analytics', 'whatsapp-inbox', 'team', 'settings', 'customerSearch', 'customerHistory'];
    priorityKeys.forEach((key, index) => {
      // Stagger imports slightly to avoid saturating network all at once
      setTimeout(() => {
        preloadComponent(key);
      }, index * 120);
    });
  };

  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(runPreload, { timeout: 1500 });
    } else {
      setTimeout(runPreload, 300);
    }
  }
};
