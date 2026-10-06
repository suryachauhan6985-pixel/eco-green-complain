import React, { useEffect, useCallback } from 'react';
import { APP_BUILD_TIME } from '../../version';

/**
 * Headless Silent App Updater
 * 
 * Automatically purges stale cache and Service Workers in the background
 * without interrupting the user with any modal or popup screen.
 * Updates are applied directly without blocking the user.
 */
export const AppUpdateModal = () => {
  const silentlyApplyCachePurge = useCallback(async () => {
    try {
      // 1. Purge CacheStorage so new bundles load directly
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      // 2. Unregister stale Service Workers in background
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
    } catch (_) {}
  }, []);

  const checkForUpdateSilently = useCallback(async () => {
    try {
      let res = await fetch(`/api/version?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' }
      });
      if (!res.ok) {
        res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' }
        });
      }
      if (!res.ok) return;
      const remote = await res.json();
      if (!remote) return;

      const currentBuildTime = Number(APP_BUILD_TIME) || 0;
      const remoteBuildTime = Number(remote.buildTime) || 0;

      // If remote build is newer, silently clear caches so fresh assets are fetched directly
      if (remoteBuildTime > 0 && currentBuildTime > 0 && remoteBuildTime > currentBuildTime) {
        await silentlyApplyCachePurge();
      }
    } catch (_) {}
  }, [silentlyApplyCachePurge]);

  useEffect(() => {
    // Run silent check on mount and when tab becomes active
    checkForUpdateSilently();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdateSilently();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    return () => window.removeEventListener('visibilitychange', handleVisibility);
  }, [checkForUpdateSilently]);

  // Completely removed popup screen - updates apply directly and silently
  return null;
};
