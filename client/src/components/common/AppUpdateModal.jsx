import React, { useState, useEffect, useCallback } from 'react';
import { 
  Sparkles, Download, RefreshCw, CheckCircle2, 
  ShieldCheck, Smartphone, Zap, ArrowRight 
} from 'lucide-react';
import { APP_VERSION, APP_BUILD_TIME } from '../../version';

const STORAGE_INSTALLED_BUILD_KEY = 'egs_installed_build_time';
const STORAGE_JUST_UPDATED_KEY = 'egs_just_updated';

export const AppUpdateModal = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateData, setUpdateData] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Check on mount if we just updated
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_JUST_UPDATED_KEY) === 'true') {
        localStorage.removeItem(STORAGE_JUST_UPDATED_KEY);
        setShowSuccessToast(true);
        const timer = setTimeout(() => setShowSuccessToast(false), 7000);
        return () => clearTimeout(timer);
      }
    } catch (_) {}
  }, []);

  const checkForUpdate = useCallback(async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (!res.ok) return;
      const remote = await res.json();
      if (!remote || !remote.version) return;

      const installedBuild = parseInt(localStorage.getItem(STORAGE_INSTALLED_BUILD_KEY) || '0', 10);
      const currentBuild = APP_BUILD_TIME;

      // If remote build is newer than our running client app build
      const isNewerBuild = remote.buildTime && remote.buildTime > currentBuild;
      const isDifferentVersion = remote.version !== APP_VERSION;

      if (isNewerBuild || isDifferentVersion) {
        setUpdateData(remote);
        setUpdateAvailable(true);
      }
    } catch (_) {
      // Offline or network error, silently ignore
    }
  }, []);

  useEffect(() => {
    // Record current build on first launch if not set
    try {
      const stored = localStorage.getItem(STORAGE_INSTALLED_BUILD_KEY);
      if (!stored) {
        localStorage.setItem(STORAGE_INSTALLED_BUILD_KEY, String(APP_BUILD_TIME));
      }
    } catch (_) {}

    checkForUpdate();

    // Check periodically every 45 seconds and on window focus / visibility change
    const interval = setInterval(checkForUpdate, 45000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [checkForUpdate]);

  const handleApplyUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    setUpdateProgress('Purging cached bundles & files...');

    try {
      // 1. Clear CacheStorage
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      setUpdateProgress('Re-registering native application worker...');

      // 2. Unregister Service Workers so fresh build activates immediately
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }

      setUpdateProgress('Applying latest features & reload...');

      // 3. Mark update success and update local build timestamp
      if (updateData?.buildTime) {
        localStorage.setItem(STORAGE_INSTALLED_BUILD_KEY, String(updateData.buildTime));
      }
      localStorage.setItem(STORAGE_JUST_UPDATED_KEY, 'true');

      // 4. Force hard reload bypassing cache
      setTimeout(() => {
        const targetUrl = window.location.origin + window.location.pathname + '?upd=' + Date.now();
        window.location.replace(targetUrl);
      }, 700);
    } catch (err) {
      console.warn('Update purge note:', err);
      window.location.reload(true);
    }
  };

  return (
    <>
      {/* Toast Notification after update completes */}
      {showSuccessToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[92%] max-w-md animate-in slide-in-from-top-4 duration-300">
          <div className="bg-slate-900/95 backdrop-blur-md text-white border border-emerald-500/40 rounded-2xl p-4 shadow-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-emerald-400">Update Installed Successfully! ✨</p>
              <p className="text-[11px] text-slate-300 line-clamp-2">
                Eco Green Solar CMS v{APP_VERSION} is now active with all new features and performance enhancements.
              </p>
            </div>
            <button 
              onClick={() => setShowSuccessToast(false)}
              className="text-slate-400 hover:text-white p-1 text-xs shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Mandatory Native App Update Modal */}
      {updateAvailable && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
            {/* Header Gradient Banner */}
            <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white p-5 sm:p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-amber-300 shadow-md">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400 text-slate-950">
                      New Release Available
                    </span>
                    <span className="text-[10px] font-bold text-emerald-200">
                      v{updateData?.version || '2.4.2'}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-white mt-0.5">
                    {updateData?.title || 'Eco Green Solar CMS Update'}
                  </h3>
                </div>
              </div>
              <p className="text-xs text-emerald-100/90 leading-relaxed mt-1">
                {updateData?.summary || 'A new official update is ready with critical fixes and user experience upgrades.'}
              </p>
            </div>

            {/* What's New Feature List */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  What's New in this Update:
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {updateData?.releaseDate || 'Latest'}
                </span>
              </div>

              <div className="space-y-2.5">
                {(updateData?.features || [
                  '📱 Mobile View Tour: Interactive feature tour guide restored for mobile screens.',
                  '🔔 In-App Notifications: Fixed intermittent delivery and added instant chime alerts.',
                  '💼 Dedicated Field Ops & Collection Tabs: Cleanly segregated tabs for technicians.',
                  '🗑️ Ticket Query Attachments: Easy delete option for uploaded files.',
                  '💬 WhatsApp Web Messenger: Resolved delivery errors.'
                ]).map((feat, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100/80">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                      ✓
                    </div>
                    <p className="text-xs text-slate-700 leading-snug font-medium">
                      {feat}
                    </p>
                  </div>
                ))}
              </div>

              {/* Notice regarding cache refresh */}
              <div className="p-3 bg-amber-50 border border-amber-200/70 rounded-2xl flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  <strong>Mandatory Update:</strong> To ensure data sync integrity and smooth operation across mobile and desktop, updating now is required.
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
              <button
                onClick={handleApplyUpdate}
                disabled={isUpdating}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{updateProgress || 'Updating Application...'}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Update Now</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
              <p className="text-[10px] text-center text-slate-400">
                ⚡ Takes only 2 seconds. All session logins will be securely preserved.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
