/**
 * Eco Green Solar CMS - Native OS / PWA Web Push Notification Engine
 * Displays system-level notifications on mobile phone lock screens, Android status bar,
 * Windows Action Center, and macOS Notification Center even when PWA is minimized or in background.
 */

export const getPushPermissionState = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission; // 'granted' | 'denied' | 'default'
};

export const requestPushPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      // Fire confirmation notification
      showOSNotification({
        title: 'Eco Green Support Alerts Active',
        body: 'You will receive lock screen alerts and service updates even when the app is minimized.',
        tag: 'egs-perm-granted'
      });
    }
    return perm;
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return 'denied';
  }
};

/**
 * Display native OS notification with vibration pattern and ticket link
 */
export const showOSNotification = async ({ title, body, ticketId, url, tag }) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const targetTitle = title || 'Eco Green Support';
  const targetBody = body || 'New complaint or service update received.';
  const targetUrl = url || (ticketId ? `/complaints?ticket=${ticketId}` : '/complaints');
  const notificationTag = tag || (ticketId ? `ticket-${ticketId}` : `egs-alert-${Date.now()}`);

  const options = {
    body: targetBody,
    icon: '/support-icon-192.png',
    badge: '/support-icon-192.png',
    tag: notificationTag,
    renotify: true,
    vibrate: [250, 100, 250, 100, 350],
    data: {
      url: targetUrl,
      ticketId: ticketId || null,
      timestamp: Date.now()
    }
  };

  try {
    // 1. Try Service Worker showNotification (Best for Android / PWA mobile lock screen)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(targetTitle, options);
        return;
      }
    }

    // 2. Fallback to window Notification constructor
    new Notification(targetTitle, options);
  } catch (err) {
    console.warn('OS notification display error:', err);
  }
};
