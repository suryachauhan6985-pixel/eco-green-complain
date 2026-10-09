import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../api/client';
import { playNotificationChime } from '../utils/sound';
import {
  showOSNotification,
  requestPushPermission as baseRequestPushPermission,
  getPushPermissionState,
  subscribeUserToPush,
  testBackgroundPush
} from '../utils/pushNotification';

const NotificationContext = createContext();

const STORAGE_KEY = 'egs_in_app_notifications';
const PERMANENT_READ_KEY = 'egs_read_notification_ids';
const CLEARED_TIMESTAMP_KEY = 'egs_notifications_cleared_at';

const getClearedTimestamp = () => {
  try {
    const raw = localStorage.getItem(CLEARED_TIMESTAMP_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch (_) {
    return 0;
  }
};

const isNotificationCleared = (notif) => {
  if (!notif) return true;
  const clearedAt = getClearedTimestamp();
  if (clearedAt <= 0) return false;

  // Check createdAt ISO string
  if (notif.createdAt) {
    const time = new Date(notif.createdAt).getTime();
    if (!isNaN(time) && time <= clearedAt) return true;
  }

  // Check timestamp embedded in id (e.g. notif_179058..._xxx)
  if (typeof notif.id === 'string' && notif.id.startsWith('notif_')) {
    const parts = notif.id.split('_');
    if (parts[1]) {
      const idTime = parseInt(parts[1], 10);
      if (!isNaN(idTime) && idTime <= clearedAt) return true;
    }
  }

  return false;
};

const getPermanentReadIds = () => {
  try {
    const raw = localStorage.getItem(PERMANENT_READ_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Filter out ticket IDs (e.g. 'EGS-2026-...') that were previously mistakenly saved as read IDs
      const validNotifIds = parsed.filter(id => typeof id === 'string' && !id.startsWith('EGS-'));
      if (validNotifIds.length !== parsed.length) {
        localStorage.setItem(PERMANENT_READ_KEY, JSON.stringify(validNotifIds));
      }
      return new Set(validNotifIds);
    }
    return new Set();
  } catch (_) {
    return new Set();
  }
};

const addPermanentReadId = (id) => {
  if (!id || String(id).startsWith('EGS-')) return;
  try {
    const set = getPermanentReadIds();
    set.add(String(id));
    localStorage.setItem(PERMANENT_READ_KEY, JSON.stringify(Array.from(set)));
  } catch (_) {}
};



export const NotificationProvider = ({ children }) => {
  const { currentUser } = useAuth();

  const [notifications, setNotifications] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Prune legacy dummy notifications and cleared alerts immediately
          const cleaned = parsed.filter(n => 
            !n.id?.startsWith('notif_init_') && 
            !isNotificationCleared(n) &&
            !['EGS-2026-000114', 'EGS-2026-000106', 'EGS-2026-000116'].includes(n.ticketId)
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
          return cleaned;
        }
      }
    } catch (_) {}
    return [];
  });

  const [activePopup, setActivePopup] = useState(null);
  const [dismissedPopupIds, setDismissedPopupIds] = useState(new Set());

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('egs_notification_sound_enabled') !== 'false';
    } catch (_) {
      return true;
    }
  });

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem('egs_notification_sound_enabled', String(next));
      } catch (_) {}
      if (next) {
        playNotificationChime({ force: true, volume: 0.95 });
      }
      return next;
    });
  }, []);

  const playSound = useCallback((opts = {}) => {
    playNotificationChime({ volume: 0.95, ...opts });
  }, []);

  // Check if a notification targets the active user (Role-Based Filtering)
  const isNotificationForUser = useCallback((notif, user) => {
    if (!user || user.role === 'customer') return false;

    // Suppress self-notifications only if specifically performed by me
    const performedName = (notif.performedByName || '').trim().toLowerCase();
    const myName = (user.name || '').trim().toLowerCase();
    const performedByMe = (
      (performedName && myName && performedName === myName && !['system', 'staff support', 'admin', 'automated'].includes(performedName)) ||
      (notif.performedByUserId && user.id && String(notif.performedByUserId) === String(user.id)) ||
      (notif.performedByUsername && user.username && notif.performedByUsername.toLowerCase() === user.username.toLowerCase())
    );
    if (performedByMe && notif.type !== 'system') return false;

    // 1. Admin sees everything across the entire organization
    if (user.role === 'admin') return true;

    // 2. Staff sees technician updates, status changes, resolutions, notes, reopens
    if (user.role === 'staff') {
      if (notif.type === 'new_ticket') return false; // new ticket creation notifications to Admin only

      return (
        notif.targetRole === 'staff' ||
        notif.targetRole === 'all' ||
        notif.targetRole === 'admin' ||
        ['status_update', 'resolved', 'note', 'reopened', 'payment', 'feedback'].includes(notif.type)
      );
    }

    // 3. Technician ONLY sees work orders, assignments, notes explicitly for them
    if (user.role === 'technician') {
      if (['staff', 'admin'].includes(notif.targetRole)) return false;

      const currentTechId = String(user.technicianId || user.technician_id || user.id || '');
      const currentTechName = (user.name || '').trim().toLowerCase();
      const currentTechPhone = (user.phone || '').replace(/[^0-9]/g, '').slice(-10);

      const targetTechId = String(notif.targetTechnicianId || '');
      const targetTechName = (notif.targetTechnicianName || '').trim().toLowerCase();
      const targetTechPhone = (notif.targetTechnicianPhone || '').replace(/[^0-9]/g, '').slice(-10);

      const idMatches = targetTechId && currentTechId && targetTechId === currentTechId;
      const nameMatches = targetTechName && currentTechName && (
        currentTechName.includes(targetTechName) || targetTechName.includes(currentTechName)
      );
      const phoneMatches = targetTechPhone && currentTechPhone && targetTechPhone === currentTechPhone;

      if (idMatches || nameMatches || phoneMatches) return true;

      if (['assignment', 'reassigned'].includes(notif.type) || notif.targetRole === 'technician') {
        if (!targetTechId && !targetTechName) return true;
        return idMatches || nameMatches || phoneMatches;
      }

      if (['reopened', 'note'].includes(notif.type) && notif.targetRole === 'all') {
        return idMatches || nameMatches || phoneMatches;
      }

      return false;
    }

    return false;
  }, []);

  // Compute primary identifier key for a user (backward compatibility)
  const getUserKey = useCallback((user) => {
    if (!user) return '';
    return user.username || user.email || user.name || user.role || '';
  }, []);

  // Compute all valid identifier keys for a user (id, username, email, name, phone, role)
  const getUserKeys = useCallback((user) => {
    if (!user) return [];
    const keys = [
      user.id !== undefined && user.id !== null ? String(user.id).toLowerCase() : null,
      user.username ? String(user.username).toLowerCase() : null,
      user.email ? String(user.email).toLowerCase() : null,
      user.name ? String(user.name).toLowerCase() : null,
      user.phone ? String(user.phone).replace(/[^0-9]/g, '').slice(-10) : null,
      user.technician_id ? String(user.technician_id).toLowerCase() : null,
      user.technicianId ? String(user.technicianId).toLowerCase() : null,
      user.role ? String(user.role).toLowerCase() : null
    ].filter(Boolean);
    return Array.from(new Set(keys));
  }, []);

  const isUnread = useCallback((notif, user) => {
    if (!user) return false;
    // 1. Permanent read cache check for this specific notification ID
    const permReads = getPermanentReadIds();
    if (permReads.has(String(notif.id))) {
      return false;
    }

    if (!notif.readBy || !Array.isArray(notif.readBy) || notif.readBy.length === 0) return true;
    const userKeys = getUserKeys(user);
    const readByLower = notif.readBy.map(k => String(k).toLowerCase());
    const hasRead = userKeys.some(k => readByLower.includes(k)) || readByLower.includes('read');
    if (hasRead) {
      addPermanentReadId(notif.id);
    }
    return !hasRead;
  }, [getUserKeys]);

  // Compute user-relevant notifications
  const userNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications.filter(n => isNotificationForUser(n, currentUser));
  }, [notifications, currentUser, isNotificationForUser]);

  const unreadNotifications = useMemo(() => {
    if (!currentUser) return [];
    return userNotifications.filter(n => isUnread(n, currentUser));
  }, [userNotifications, currentUser, isUnread]);

  const unreadCount = unreadNotifications.length;

  // POPUP LOGIC: Automatically surface unread notifications until read
  useEffect(() => {
    if (!currentUser || currentUser.role === 'customer') {
      setActivePopup(null);
      return;
    }

    // Find the latest unread notification that hasn't been temporarily dismissed
    const nextUnread = unreadNotifications.find(n => !dismissedPopupIds.has(n.id));
    setActivePopup(nextUnread || null);
  }, [currentUser, unreadNotifications, dismissedPopupIds]);

  // Helper: Persist notifications
  const saveNotifications = useCallback((newNotifs) => {
    const cleaned = (newNotifs || []).filter(n => 
      !n.id?.startsWith('notif_init_') && 
      !isNotificationCleared(n) &&
      !['EGS-2026-000114', 'EGS-2026-000106', 'EGS-2026-000116'].includes(n.ticketId)
    );
    setNotifications(cleaned);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    } catch (e) {
      console.warn('Failed to save in-app notifications:', e);
    }
  }, []);

  // Sync with backend
  const fetchFromBackend = useCallback(async () => {
    try {
      if (api.getInAppNotifications) {
        const data = await api.getInAppNotifications();
        if (data && Array.isArray(data.notifications)) {
          const cleanRemote = data.notifications.filter(n => 
            !n.id?.startsWith('notif_init_') && 
            !isNotificationCleared(n) &&
            !['EGS-2026-000114', 'EGS-2026-000106', 'EGS-2026-000116'].includes(n.ticketId)
          );
          
          setNotifications(prev => {
            const localReadMap = new Map();
            const permReads = getPermanentReadIds();
            const prevIds = new Set(prev.map(p => p.id));

            prev.forEach(p => {
              if (Array.isArray(p.readBy)) localReadMap.set(p.id, p.readBy);
            });

            let hasNewUnreadForMe = false;
            let latestAlertForMe = null;

            const merged = cleanRemote.map(r => {
              const localReads = localReadMap.get(r.id) || [];
              const combinedReads = Array.from(new Set([...(r.readBy || []), ...localReads]));
              if (permReads.has(String(r.id))) {
                combinedReads.push('read');
              }
              const notifObj = { ...r, readBy: combinedReads };

              // Check if brand new unread notification for currentUser
              if (!prevIds.has(r.id) && currentUser && isNotificationForUser(notifObj, currentUser) && isUnread(notifObj, currentUser)) {
                hasNewUnreadForMe = true;
                latestAlertForMe = notifObj;
              }

              return notifObj;
            });

            // Keep ONLY very recent (< 15 seconds) unsynced local creations that have not been cleared
            prev.forEach(p => {
              const ageMs = Date.now() - (new Date(p.createdAt || 0).getTime());
              const isRecentLocalCreation = ageMs < 15000 && String(p.id || '').startsWith('notif_');
              if (isRecentLocalCreation && !isNotificationCleared(p) && !merged.some(m => m.id === p.id)) {
                merged.push(p);
              }
            });

            if (hasNewUnreadForMe) {
              playNotificationChime();
              if (latestAlertForMe) {
                showOSNotification({
                  title: latestAlertForMe.title || 'Eco Green Support Alert',
                  body: latestAlertForMe.message || 'New complaint or service update received.',
                  ticketId: latestAlertForMe.ticketId,
                  url: latestAlertForMe.ticketId ? `/complaints?ticket=${latestAlertForMe.ticketId}` : '/complaints'
                });
              }
            }

            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            } catch (_) {}
            return merged;
          });
        }
      }
    } catch (_) {}
  }, [currentUser, isNotificationForUser, isUnread]);

  // Real-time WhatsApp incoming customer message monitor for OS-level alerts across the whole app
  const lastKnownWAMsgIdRef = useRef(null);

  const checkWhatsAppIncoming = useCallback(async () => {
    if (!currentUser) return;
    try {
      if (api.getWhatsAppConversations) {
        const res = await api.getWhatsAppConversations();
        if (res && Array.isArray(res.conversations)) {
          const customerConvs = res.conversations.filter(c => c.last_sender_type === 'customer');
          if (customerConvs.length === 0) return;

          const maxId = Math.max(...customerConvs.map(c => Number(c.id || 0)));

          // On first load, initialize maxId so we don't alert for existing historic messages
          if (lastKnownWAMsgIdRef.current === null) {
            lastKnownWAMsgIdRef.current = maxId;
            return;
          }

          if (maxId > lastKnownWAMsgIdRef.current) {
            const newConvs = customerConvs.filter(c => Number(c.id || 0) > lastKnownWAMsgIdRef.current);
            lastKnownWAMsgIdRef.current = maxId;

            newConvs.forEach(conv => {
              playNotificationChime({ force: true, volume: 1.0 });
              showOSNotification({
                title: `💬 WhatsApp: ${conv.sender_name || conv.phone}`,
                body: conv.last_message || 'New customer WhatsApp message received.',
                tag: `wa-${conv.last10 || conv.phone}`,
                url: `/whatsapp-inbox?phone=${conv.phone}`
              });
            });
          }
        }
      }
    } catch (_) {}
  }, [currentUser]);

  // Periodic poll and multi-tab / window sync
  useEffect(() => {
    fetchFromBackend();

    const handleStorageChange = (e) => {
      if (e.key === CLEARED_TIMESTAMP_KEY || (e.key === STORAGE_KEY && (e.newValue === '[]' || !e.newValue))) {
        setNotifications([]);
        setActivePopup(null);
        return;
      }
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter(n => !n.id?.startsWith('notif_init_') && !isNotificationCleared(n));
            setNotifications(cleaned);
          }
        } catch (_) {}
      }
    };

    const handleCustomNotify = (e) => {
      if (e.detail && !e.detail.id?.startsWith('notif_init_') && !isNotificationCleared(e.detail)) {
        setNotifications(prev => {
          const exists = prev.some(n => n.id === e.detail.id);
          return exists ? prev : [e.detail, ...prev];
        });
      }
    };

    const handleClearedEvent = () => {
      setNotifications([]);
      setActivePopup(null);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchFromBackend();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('egs_in_app_notifications_cleared', handleClearedEvent);
    window.addEventListener('egs_in_app_notification_created', handleCustomNotify);
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchFromBackend();
      }
      checkWhatsAppIncoming();
    }, 5000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('egs_in_app_notifications_cleared', handleClearedEvent);
      window.removeEventListener('egs_in_app_notification_created', handleCustomNotify);
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      clearInterval(interval);
    };
  }, [fetchFromBackend, checkWhatsAppIncoming]);

  // Automatically register device for OS background Web Push when permission is granted
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      subscribeUserToPush(currentUser).catch(() => {});
      const t = setTimeout(() => {
        subscribeUserToPush(currentUser).catch(() => {});
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [currentUser]);

  const requestPushPermission = useCallback(async () => {
    const res = await baseRequestPushPermission(currentUser);
    return res;
  }, [currentUser]);

  // Add a new in-app notification
  const addNotification = useCallback((data) => {
    const newNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: data.type || 'info', // assignment | reassigned | status_update | note | resolved | new_ticket
      ticketId: data.ticketId || '',
      complaintId: data.complaintId || null,
      title: data.title || 'System Notification',
      message: data.message || '',
      customerName: data.customerName || '',
      targetRole: data.targetRole || 'all', // technician | staff | admin | all
      targetTechnicianId: data.targetTechnicianId || null,
      targetTechnicianName: data.targetTechnicianName || '',
      performedByName: data.performedByName || currentUser?.name || 'Staff',
      performedByRole: data.performedByRole || currentUser?.role || 'staff',
      createdAt: new Date().toISOString(),
      readBy: [],
      acknowledgedBy: []
    };

    setNotifications(prev => {
      const updated = [newNotif, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    // Notify other tabs and listeners
    try {
      window.dispatchEvent(new CustomEvent('egs_in_app_notification_created', { detail: newNotif }));
    } catch (_) {}

    // If targeted to active user, trigger popup, audio chime, and OS system notification
    if (currentUser && isNotificationForUser(newNotif, currentUser)) {
      setActivePopup(newNotif);
      playNotificationChime();
      showOSNotification({
        title: newNotif.title || 'Eco Green Support Alert',
        body: newNotif.message || 'New complaint or service update received.',
        ticketId: newNotif.ticketId,
        url: newNotif.ticketId ? `/complaints?ticket=${newNotif.ticketId}` : '/complaints'
      });
    }

    // Post to backend
    try {
      if (api.createInAppNotification) {
        api.createInAppNotification(newNotif).catch(() => {});
      }
    } catch (_) {}

    return newNotif;
  }, [currentUser, isNotificationForUser]);

  // Mark single notification as read (permanently across all reloads & sessions)
  const markAsRead = useCallback((notificationId) => {
    if (!currentUser || !notificationId) return;
    const userKeys = getUserKeys(currentUser);

    // Save permanently in local storage read list immediately
    addPermanentReadId(notificationId);

    setNotifications(prev => {
      const updated = prev.map(n => {
        if (n.id === notificationId) {
          addPermanentReadId(n.id);
          const currentRead = Array.isArray(n.readBy) ? n.readBy : [];
          const combined = Array.from(new Set([...currentRead, ...userKeys, 'read']));
          return { ...n, readBy: combined };
        }
        return n;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    // Dismiss active popup if it matches
    setActivePopup(prev => prev?.id === notificationId ? null : prev);

    // Sync to backend database permanently
    try {
      if (api.markInAppNotificationRead) {
        api.markInAppNotificationRead(notificationId).catch(() => {});
      }
    } catch (_) {}
  }, [currentUser, getUserKeys]);

  // Mark all relevant notifications as read
  const markAllAsRead = useCallback(() => {
    if (!currentUser) return;
    const userKeys = getUserKeys(currentUser);

    setNotifications(prev => {
      const updated = prev.map(n => {
        if (isNotificationForUser(n, currentUser)) {
          addPermanentReadId(n.id);
          const currentRead = Array.isArray(n.readBy) ? n.readBy : [];
          const combined = Array.from(new Set([...currentRead, ...userKeys, 'read']));
          return { ...n, readBy: combined };
        }
        return n;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    setActivePopup(null);

    // Sync to backend
    try {
      if (api.markAllInAppNotificationsRead) {
        api.markAllInAppNotificationsRead().catch(() => {});
      }
    } catch (_) {}
  }, [currentUser, getUserKeys, isNotificationForUser]);

  // Mark all notifications for a specific ticket/complaint as read
  const markTicketAsRead = useCallback((ticketOrComplaintId) => {
    if (!ticketOrComplaintId || !currentUser) return;
    const userKeys = getUserKeys(currentUser);
    const targetKey = String(ticketOrComplaintId).trim().toLowerCase();

    setNotifications(prev => {
      const updated = prev.map(n => {
        const notifTicket = String(n.ticketId || '').trim().toLowerCase();
        const notifComp = String(n.complaintId || '').trim().toLowerCase();
        if (notifTicket === targetKey || notifComp === targetKey) {
          addPermanentReadId(n.id);
          const currentRead = Array.isArray(n.readBy) ? n.readBy : [];
          const combined = Array.from(new Set([...currentRead, ...userKeys, 'read']));
          return { ...n, readBy: combined };
        }
        return n;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    setActivePopup(prev => {
      const prevTicket = String(prev?.ticketId || '').trim().toLowerCase();
      const prevComp = String(prev?.complaintId || '').trim().toLowerCase();
      return (prevTicket === targetKey || prevComp === targetKey) ? null : prev;
    });
  }, [currentUser, getUserKeys]);

  // Delete a single notification completely
  const deleteNotification = useCallback((notificationId) => {
    if (!notificationId) return;
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== notificationId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
    setActivePopup(prev => prev?.id === notificationId ? null : prev);
  }, []);

  // Delete all notifications belonging to a specific ticket
  const deleteNotificationsForTicket = useCallback((ticketOrComplaintId) => {
    if (!ticketOrComplaintId) return;
    const targetKey = String(ticketOrComplaintId).trim().toLowerCase();
    setNotifications(prev => {
      const updated = prev.filter(n => {
        const notifTicket = String(n.ticketId || '').trim().toLowerCase();
        const notifComp = String(n.complaintId || '').trim().toLowerCase();
        return notifTicket !== targetKey && notifComp !== targetKey;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
    setActivePopup(prev => {
      const prevTicket = String(prev?.ticketId || '').trim().toLowerCase();
      const prevComp = String(prev?.complaintId || '').trim().toLowerCase();
      return (prevTicket === targetKey || prevComp === targetKey) ? null : prev;
    });
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    const now = Date.now();
    try {
      localStorage.setItem(CLEARED_TIMESTAMP_KEY, String(now));
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch (_) {}

    // Mark existing IDs as permanently read as extra safeguard
    setNotifications(prev => {
      prev.forEach(n => {
        if (n.id) addPermanentReadId(n.id);
      });
      return [];
    });
    setActivePopup(null);

    // Broadcast across windows / tabs
    try {
      window.dispatchEvent(new CustomEvent('egs_in_app_notifications_cleared', { detail: { clearedAt: now } }));
    } catch (_) {}

    try {
      if (api.clearInAppNotifications) {
        api.clearInAppNotifications().catch(() => {});
      }
    } catch (_) {}
  }, []);

  // Temporarily dismiss popup without marking read (it will stay in drawer badge)
  const dismissPopup = useCallback((notifId) => {
    const idToDismiss = notifId || activePopup?.id;
    if (idToDismiss) {
      setDismissedPopupIds(prev => new Set([...prev, idToDismiss]));
      // Advance to next unread popup if any
      setActivePopup(null);
    }
  }, [activePopup]);

  // Dismiss all pending popups at once
  const dismissAllPopups = useCallback(() => {
    const allIds = unreadNotifications.map(n => n.id);
    if (activePopup?.id) allIds.push(activePopup.id);
    setDismissedPopupIds(prev => new Set([...prev, ...allIds]));
    setActivePopup(null);
  }, [unreadNotifications, activePopup]);

  const value = {
    notifications,
    userNotifications,
    unreadNotifications,
    unreadCount,
    activePopup,
    addNotification,
    markAsRead,
    markTicketAsRead,
    markAllAsRead,
    deleteNotification,
    deleteNotificationsForTicket,
    clearAllNotifications,
    clearNotifications: clearAllNotifications,
    dismissPopup,
    dismissAllPopups,
    fetchFromBackend,
    saveNotifications,
    playNotificationChime: playSound,
    playSound,
    soundEnabled,
    toggleSound,
    requestPushPermission,
    getPushPermissionState,
    subscribeUserToPush,
    testBackgroundPush,
    isUnread
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
