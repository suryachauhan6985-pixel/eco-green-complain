import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../api/client';

const NotificationContext = createContext();

const STORAGE_KEY = 'egs_in_app_notifications';

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

  // Helper: Persist notifications
  const saveNotifications = useCallback((newNotifs) => {
    // Ensure no dummy notifications sneak in
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
            prev.forEach(p => {
              if (Array.isArray(p.readBy)) localReadMap.set(p.id, p.readBy);
            });

            const merged = cleanRemote.map(r => {
              const localReads = localReadMap.get(r.id) || [];
              const combinedReads = Array.from(new Set([...(r.readBy || []), ...localReads]));
              return { ...r, readBy: combinedReads };
            });

            // Keep any recent unsynced local creations
            prev.forEach(p => {
              if (!p.id?.startsWith('notif_init_') && !merged.some(m => m.id === p.id)) {
                merged.push(p);
              }
            });

            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            } catch (_) {}
            return merged;
          });
        }
      }
    } catch (_) {}
  }, []);

  // Periodic poll and multi-tab sync
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

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('egs_in_app_notification_created', handleCustomNotify);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchFromBackend();
      }
    }, 8000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('egs_in_app_notification_created', handleCustomNotify);
      clearInterval(interval);
    };
  }, [fetchFromBackend]);

  // Check if a notification targets the active user (Role-Based Filtering)
  const isNotificationForUser = useCallback((notif, user) => {
    if (!user || user.role === 'customer') return false;

    // Suppress self-notifications for ANY role (technician, staff, admin)
    const performedByMe = (
      (notif.performedByName && user.name && notif.performedByName.toLowerCase() === user.name.toLowerCase()) ||
      (notif.performedByUserId && user.id && String(notif.performedByUserId) === String(user.id)) ||
      (notif.performedByUsername && user.username && notif.performedByUsername.toLowerCase() === user.username.toLowerCase())
    );
    if (performedByMe && notif.type !== 'system') return false;

    // 1. Admin sees everything across the entire organization
    if (user.role === 'admin') return true;

    // 2. Staff sees technician updates, status changes, resolutions, notes, reopens
    if (user.role === 'staff') {
      // ECO-5: Restrict new ticket creation notifications to Admin role ONLY
      if (notif.type === 'new_ticket') return false;

      return (
        notif.targetRole === 'staff' ||
        notif.targetRole === 'all' ||
        notif.targetRole === 'admin' ||
        ['status_update', 'resolved', 'note', 'reopened', 'payment', 'feedback'].includes(notif.type)
      );
    }

    // 3. Technician ONLY sees work orders, assignments, notes explicitly for them (and NEVER receives staff-targeted notifications)
    if (user.role === 'technician') {
      // Explicitly reject staff-targeted notifications
      if (['staff', 'admin'].includes(notif.targetRole)) return false;

      const currentTechId = String(user.technicianId || user.technician_id || user.id || '');
      const currentTechName = (user.name || '').trim().toLowerCase();

      const targetTechId = String(notif.targetTechnicianId || '');
      const targetTechName = (notif.targetTechnicianName || '').trim().toLowerCase();

      const idMatches = targetTechId && currentTechId && targetTechId === currentTechId;
      const nameMatches = targetTechName && currentTechName && (
        currentTechName.includes(targetTechName) || targetTechName.includes(currentTechName)
      );

      if (idMatches || nameMatches) return true;

      // Assignment or job notices targeted specifically to technicians
      if (['assignment', 'reassigned'].includes(notif.type) || notif.targetRole === 'technician') {
        if (!targetTechId && !targetTechName) return true;
        return idMatches || nameMatches;
      }

      if (['reopened', 'note'].includes(notif.type) && notif.targetRole === 'all') {
        return idMatches || nameMatches;
      }

      return false;
    }

    return false;
  }, []);

  // Compute user-relevant notifications
  const userNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications.filter(n => isNotificationForUser(n, currentUser));
  }, [notifications, currentUser, isNotificationForUser]);

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
    if (!notif.readBy || !Array.isArray(notif.readBy) || notif.readBy.length === 0) return true;
    const userKeys = getUserKeys(user);
    const readByLower = notif.readBy.map(k => String(k).toLowerCase());
    const hasRead = userKeys.some(k => readByLower.includes(k));
    return !hasRead;
  }, [getUserKeys]);

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

  // Add a new in-app notification
  const addNotification = useCallback((data) => {
    const newNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: data.type || 'info', // assignment | status_update | note | resolved | new_ticket
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

    // If targeted to active user, trigger popup immediately
    if (currentUser && isNotificationForUser(newNotif, currentUser)) {
      setActivePopup(newNotif);
    }

    // Try posting to backend
    try {
      if (api.createInAppNotification) {
        api.createInAppNotification(newNotif).catch(() => {});
      }
    } catch (_) {}

    return newNotif;
  }, [currentUser, isNotificationForUser]);

  // Mark single notification as read
  const markAsRead = useCallback((notificationId) => {
    if (!currentUser || !notificationId) return;
    const userKeys = getUserKeys(currentUser);

    setNotifications(prev => {
      const updated = prev.map(n => {
        if (n.id === notificationId || n.ticketId === notificationId) {
          const currentRead = Array.isArray(n.readBy) ? n.readBy : [];
          const combined = Array.from(new Set([...currentRead, ...userKeys]));
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
    setActivePopup(prev => (prev?.id === notificationId || prev?.ticketId === notificationId) ? null : prev);

    // Sync to backend
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
          const currentRead = Array.isArray(n.readBy) ? n.readBy : [];
          const combined = Array.from(new Set([...currentRead, ...userKeys]));
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

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    saveNotifications([]);
    setActivePopup(null);
    try {
      if (api.clearInAppNotifications) {
        api.clearInAppNotifications().catch(() => {});
      }
    } catch (_) {}
  }, [saveNotifications]);

  // Dismiss popup banner (keeps unread badge on bell icon, temporarily suppresses this specific popup in session)
  const dismissPopup = useCallback((notifId) => {
    const idToDismiss = notifId || activePopup?.id;
    if (idToDismiss) {
      setDismissedPopupIds(prev => new Set([...prev, idToDismiss]));
    }
    setActivePopup(null);
  }, [activePopup]);

  return (
    <NotificationContext.Provider value={{
      notifications: userNotifications,
      allNotifications: notifications,
      unreadCount,
      unreadNotifications,
      activePopup,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearNotifications,
      dismissPopup,
      isUnread
    }}>
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
