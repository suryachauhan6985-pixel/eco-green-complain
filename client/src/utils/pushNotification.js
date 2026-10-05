/**
 * Eco Green Solar CMS - Native OS / PWA Web Push Notification Engine
 * Displays system-level notifications on mobile phone lock screens, Android status bar,
 * Windows Action Center, and macOS Notification Center even when PWA is closed or in background.
 */

export const VAPID_PUBLIC_KEY = 'BG7RGa45M_-DXtXhZsTXDBUrBfFGtXp9INDkked5RDSRTt2zSF-1Hs3wvcDVFVuVJ__DVMgDnT1MSvFONbXED4g';

/**
 * Convert base64 VAPID public key to Uint8Array for browser pushManager.subscribe()
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const getPushPermissionState = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission; // 'granted' | 'denied' | 'default'
};

/**
 * Register device for OS background push with PushManager and backend API
 */
export const subscribeUserToPush = async (currentUser) => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, reason: 'unsupported' };
  }

  if (Notification.permission !== 'granted') {
    return { success: false, reason: 'permission_not_granted' };
  }

  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js').catch(() => null);
    }

    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('SW ready timeout')), 6000));
    reg = await Promise.race([readyPromise, timeoutPromise]).catch(() => reg);

    if (!reg || !reg.pushManager) {
      return { success: false, reason: 'push_manager_unavailable' };
    }

    let subscription = await reg.pushManager.getSubscription();
    const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    // If subscription already exists, check if its applicationServerKey matches our active VAPID key
    if (subscription) {
      const rawExistingKey = subscription.options?.applicationServerKey;
      let matches = false;
      if (rawExistingKey) {
        try {
          const existingKeyArray = new Uint8Array(rawExistingKey);
          if (existingKeyArray.length === convertedVapidKey.length) {
            matches = existingKeyArray.every((b, idx) => b === convertedVapidKey[idx]);
          }
        } catch (_) {}
      }
      if (!matches) {
        console.log('[WebPush] Re-subscribing with active VAPID key...');
        await subscription.unsubscribe().catch(() => {});
        subscription = null;
      }
    }

    // Subscribe with VAPID key
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }

    if (!subscription) {
      return { success: false, reason: 'subscription_failed' };
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { success: false, reason: 'incomplete_keys' };
    }

    // Determine user profile (from argument or cached user)
    let user = currentUser;
    if (!user) {
      try {
        const cached = sessionStorage.getItem('egs_cached_user') || localStorage.getItem('egs_cached_user');
        if (cached) user = JSON.parse(cached);
      } catch (_) {}
    }

    const token = sessionStorage.getItem('egs_token') || localStorage.getItem('egs_token');
    const resp = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        role: user?.role || 'staff',
        userId: user?.id || null,
        phone: user?.phone || null
      })
    });

    const resData = await resp.json().catch(() => ({}));
    localStorage.setItem('egs_push_subscribed_endpoint', subJson.endpoint);
    localStorage.setItem('egs_push_subscribed_at', new Date().toISOString());
    console.log('[WebPush] Device registered for background push:', resData);

    return { success: true, subscription: subJson, data: resData };
  } catch (err) {
    console.warn('Failed to subscribe user to background push:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Request OS permission and immediately register push subscription
 */
export const requestPushPermission = async (currentUser = null) => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      // Subscribe device to background push
      await subscribeUserToPush(currentUser);

      // Fire confirmation notification
      showOSNotification({
        title: 'Eco Green Support Alerts Active',
        body: 'You will receive lock screen alerts and service updates even when the app is closed.',
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
 * Display native OS notification with vibration pattern and ticket link (Foreground/In-App)
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
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(targetTitle, options);
        return;
      }
    }
    new Notification(targetTitle, options);
  } catch (err) {
    console.warn('OS notification display error:', err);
  }
};

/**
 * Trigger a background push test (with optional countdown delay so user can lock screen)
 */
export const testBackgroundPush = async (delaySeconds = 3, currentUser = null) => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, message: 'Push notifications are not supported on this browser.' };
  }

  try {
    // 1. Ensure user is subscribed first
    const subResult = await subscribeUserToPush(currentUser);
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    const token = sessionStorage.getItem('egs_token') || localStorage.getItem('egs_token');
    const response = await fetch('/api/push/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        subscription: subscription ? subscription.toJSON() : subResult?.subscription || null,
        delaySeconds
      })
    });

    return await response.json();
  } catch (err) {
    console.warn('Test background push error:', err);
    return { success: false, message: err.message };
  }
};
