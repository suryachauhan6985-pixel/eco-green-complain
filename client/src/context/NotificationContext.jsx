import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../api/client';

const NotificationContext = createContext();

const STORAGE_KEY = 'egs_in_app_notifications';
const PERMANENT_READ_KEY = 'egs_read_notification_ids';

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

const playNotificationChime = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
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
          // Prune legacy dummy notifications immediately
          const cleaned = parsed.filter(n => 
            !n.id?.startsWith('notif_init_') && 
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
              }

              return notifObj;
            });

            // Keep any recent unsynced local creations
            prev.forEach(p => {
              if (!p.id?.startsWith('notif_init_') && !merged.some(m => m.id === p.id)) {
                merged.push(p);
              }
            });

            if (hasNewUnreadForMe) {
              playNotificationChime();
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

  // Periodic poll and multi-tab / window sync
  useEffect(() => {
    fetchFromBackend();

    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter(n => !n.id?.startsWith('notif_init_'));
            setNotifications(cleaned);
          }
        } catch (_) {}
      }
    };

    const handleCustomNotify = (e) => {
      if (e.detail && !e.detail.id?.startsWith('notif_init_')) {
        setNotifications(prev => {
          const exists = prev.some(n => n.id === e.detail.id);
          return exists ? prev : [e.detail, ...prev];
        });
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchFromBackend();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('egs_in_app_notification_created', handleCustomNotify);
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchFromBackend();
      }
    }, 7000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('egs_in_app_notification_created', handleCustomNotify);
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      clearInterval(interval);
    };
  }, [fetchFromBackend]);

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

    // If targeted to active user, trigger popup and audio chime immediately
    if (currentUser && isNotificationForUser(newNotif, currentUser)) {
      setActivePopup(newNotif);
      playNotificationChime();
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
    setNotifications([]);
    setActivePopup(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
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
    playNotificationChime,
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
