import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../api/client';

const NotificationContext = createContext();

const STORAGE_KEY = 'egs_in_app_notifications';
const ACKNOWLEDGED_POPUPS_KEY = 'egs_acknowledged_popups';

// Realistic sample in-app notifications so both Tech and Staff have immediate working data
const DEFAULT_NOTIFICATIONS = [
  {
    id: 'notif_init_1',
    type: 'assignment',
    ticketId: 'EGS-2026-000114',
    complaintId: 114,
    title: 'New Complaint Assigned: EGS-2026-000114',
    message: 'You have been assigned to customer JAVIA BANSIKUMAR CHANDULAL (Solar Rooftop Systems - Inverter Fault). Expected visit: Today.',
    customerName: 'JAVIA BANSIKUMAR CHANDULAL',
    targetRole: 'technician',
    targetTechnicianId: 1,
    targetTechnicianName: 'Rohit Kumar',
    performedByName: 'Admin Supervisor',
    performedByRole: 'admin',
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    readBy: [],
    acknowledgedBy: []
  },
  {
    id: 'notif_init_2',
    type: 'status_update',
    ticketId: 'EGS-2026-000106',
    complaintId: 106,
    title: 'Technician Update: EGS-2026-000106',
    message: 'Rohit Kumar updated status to "In Progress" for Harish Nambiar (Heat Pumps - Circulation Pump Failure).',
    customerName: 'Harish Nambiar',
    targetRole: 'staff',
    targetTechnicianId: 1,
    targetTechnicianName: 'Rohit Kumar',
    performedByName: 'Rohit Kumar',
    performedByRole: 'technician',
    createdAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    readBy: [],
    acknowledgedBy: []
  },
  {
    id: 'notif_init_3',
    type: 'new_ticket',
    ticketId: 'EGS-2026-000116',
    complaintId: 116,
    title: 'New Ticket Registered: EGS-2026-000116',
    message: 'New complaint registered for Jignesh Patel (Solar Rooftop Systems - Inverter Error). Needs technician allocation.',
    customerName: 'Jignesh Patel',
    targetRole: 'staff',
    performedByName: 'Front Desk Helpdesk',
    performedByRole: 'staff',
    createdAt: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    readBy: [],
    acknowledgedBy: []
  }
];

export const NotificationProvider = ({ children }) => {
  const { currentUser } = useAuth();

  const [notifications, setNotifications] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return DEFAULT_NOTIFICATIONS;
  });

  const [activePopup, setActivePopup] = useState(null);

  // Helper: Persist notifications
  const saveNotifications = useCallback((newNotifs) => {
    setNotifications(newNotifs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newNotifs));
    } catch (e) {
      console.warn('Failed to save in-app notifications:', e);
    }
  }, []);

  // Sync with backend if API is running
  const fetchFromBackend = useCallback(async () => {
    try {
      if (api.getInAppNotifications) {
        const data = await api.getInAppNotifications();
        if (data && Array.isArray(data.notifications) && data.notifications.length > 0) {
          // Merge with local state to preserve unread flags
          const localMap = new Map();
          notifications.forEach(n => localMap.set(String(n.id || n.ticketId), n));
          
          const merged = data.notifications.map(remote => {
            const key = String(remote.id || remote.ticketId || remote.ticket_id);
            const local = localMap.get(key);
            return local ? { ...remote, ...local } : remote;
          });

          // Also include purely local notifications that haven't synced yet
          notifications.forEach(n => {
            const key = String(n.id || n.ticketId);
            if (!merged.some(m => String(m.id || m.ticketId || m.ticket_id) === key)) {
              merged.push(n);
            }
          });

          saveNotifications(merged);
        }
      }
    } catch (_) {
      // Backend offline or endpoint not yet configured, local store operates independently
    }
  }, [notifications, saveNotifications]);

  // Periodic poll and multi-tab sync
  useEffect(() => {
    fetchFromBackend();

    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setNotifications(parsed);
        } catch (_) {}
      }
    };

    const handleCustomNotify = (e) => {
      if (e.detail) {
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
    }, 10000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('egs_in_app_notification_created', handleCustomNotify);
      clearInterval(interval);
    };
  }, [fetchFromBackend]);

  // Check if a notification targets the active user
  const isNotificationForUser = useCallback((notif, user) => {
    if (!user || user.role === 'customer') return false;

    // Admin sees all system notifications
    if (user.role === 'admin') return true;

    // Staff sees technician updates, resolutions, notes, and new registrations
    if (user.role === 'staff') {
      return (
        notif.targetRole === 'staff' ||
        notif.targetRole === 'admin' ||
        notif.targetRole === 'all' ||
        notif.type === 'status_update' ||
        notif.type === 'resolved' ||
        notif.type === 'note' ||
        notif.type === 'new_ticket'
      );
    }

    // Technician sees jobs and updates assigned to them
    if (user.role === 'technician') {
      if (notif.targetRole === 'technician' || notif.type === 'assignment') {
        if (!notif.targetTechnicianId && !notif.targetTechnicianName) return true;

        const currentTechId = String(user.technicianId || user.id || '');
        const targetTechId = String(notif.targetTechnicianId || '');

        const idMatches = targetTechId && currentTechId && targetTechId === currentTechId;
        const nameMatches = notif.targetTechnicianName && user.name && (
          user.name.toLowerCase().includes(notif.targetTechnicianName.toLowerCase()) ||
          notif.targetTechnicianName.toLowerCase().includes(user.name.toLowerCase())
        );

        // Demo user fallback: Rohit Kumar
        const isDemoRohit = (user.name?.toLowerCase().includes('rohit') || user.username === 'rohit');
        return idMatches || nameMatches || isDemoRohit;
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

  // Compute unread user notifications
  const getUserKey = useCallback((user) => {
    if (!user) return '';
    return user.username || user.email || user.name || user.role;
  }, []);

  const isUnread = useCallback((notif, user) => {
    if (!user) return false;
    const userKey = getUserKey(user);
    if (!notif.readBy || !Array.isArray(notif.readBy)) return true;
    return !notif.readBy.includes(userKey);
  }, [getUserKey]);

  const unreadNotifications = useMemo(() => {
    if (!currentUser) return [];
    return userNotifications.filter(n => isUnread(n, currentUser));
  }, [userNotifications, currentUser, isUnread]);

  const unreadCount = unreadNotifications.length;

  // POPUP LOGIC: Trigger popup banner when user opens session or when a new unread arrives
  useEffect(() => {
    if (!currentUser || currentUser.role === 'customer') {
      setActivePopup(null);
      return;
    }

    const userKey = getUserKey(currentUser);
    let acknowledged = [];
    try {
      acknowledged = JSON.parse(sessionStorage.getItem(ACKNOWLEDGED_POPUPS_KEY) || '[]');
    } catch (_) {}

    // Find the latest unread notification that hasn't been acknowledged in this session
    const unacknowledged = unreadNotifications.find(n => {
      const ackKey = `${userKey}_${n.id || n.ticketId}`;
      return !acknowledged.includes(ackKey);
    });

    if (unacknowledged) {
      setActivePopup(unacknowledged);

      // Record acknowledgement for this session so we don't repeat the toast on every re-render
      const ackKey = `${userKey}_${unacknowledged.id || unacknowledged.ticketId}`;
      acknowledged.push(ackKey);
      try {
        sessionStorage.setItem(ACKNOWLEDGED_POPUPS_KEY, JSON.stringify(acknowledged));
      } catch (_) {}
    }
  }, [currentUser, unreadNotifications, getUserKey]);

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
    const userKey = getUserKey(currentUser);

    setNotifications(prev => {
      const updated = prev.map(n => {
        if (n.id === notificationId || n.ticketId === notificationId) {
          const currentRead = Array.isArray(n.readBy) ? n.readBy : [];
          if (!currentRead.includes(userKey)) {
            return { ...n, readBy: [...currentRead, userKey] };
          }
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
  }, [currentUser, getUserKey]);

  // Mark all relevant notifications as read
  const markAllAsRead = useCallback(() => {
    if (!currentUser) return;
    const userKey = getUserKey(currentUser);

    setNotifications(prev => {
      const updated = prev.map(n => {
        if (isNotificationForUser(n, currentUser)) {
          const currentRead = Array.isArray(n.readBy) ? n.readBy : [];
          if (!currentRead.includes(userKey)) {
            return { ...n, readBy: [...currentRead, userKey] };
          }
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
  }, [currentUser, getUserKey, isNotificationForUser]);

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

  // Dismiss popup banner (keeps unread badge on bell icon!)
  const dismissPopup = useCallback(() => {
    setActivePopup(null);
  }, []);

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
