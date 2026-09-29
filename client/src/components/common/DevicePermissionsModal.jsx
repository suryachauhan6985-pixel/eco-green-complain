import React, { useState, useEffect } from 'react';
import { Bell, MapPin, Camera, CheckCircle2, AlertCircle, Shield, X, Sparkles, ChevronRight } from 'lucide-react';

const PERMISSIONS_STORAGE_KEY = 'egs_device_permissions_prompted_at';

export const DevicePermissionsModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [permissionStates, setPermissionStates] = useState({
    notification: 'default',
    geolocation: 'prompt',
    camera: 'prompt'
  });

  const checkCurrentPermissions = async () => {
    let notif = 'default';
    let geo = 'prompt';
    let cam = 'prompt';

    if (typeof window !== 'undefined' && 'Notification' in window) {
      notif = Notification.permission; // 'granted', 'denied', 'default'
    }

    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      try {
        const geoQuery = await navigator.permissions.query({ name: 'geolocation' });
        geo = geoQuery.state;
      } catch (_) {}

      try {
        const camQuery = await navigator.permissions.query({ name: 'camera' });
        cam = camQuery.state;
      } catch (_) {}
    }

    setPermissionStates({
      notification: notif,
      geolocation: geo,
      camera: cam
    });

    return { notif, geo, cam };
  };

  useEffect(() => {
    const initCheck = async () => {
      const states = await checkCurrentPermissions();
      // If all 3 are already granted, no need to prompt
      if (states.notif === 'granted' && states.geo === 'granted' && states.cam === 'granted') {
        return;
      }

      // Check if user dismissed it recently in this browser session
      const lastPrompted = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (lastPrompted && Date.now() - parseInt(lastPrompted, 10) < oneDayMs) {
        // Dismissed within last 24h, skip
        return;
      }

      // Small delay on load for smooth rendering
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1200);

      return () => clearTimeout(timer);
    };

    initCheck();
  }, []);

  const handleRequestAllPermissions = async () => {
    setRequesting(true);

    // 1. Notification Permission
    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        const res = await Notification.requestPermission();
        setPermissionStates(prev => ({ ...prev, notification: res }));
      }
    } catch (err) {
      console.warn('Notification permission error:', err);
    }

    // 2. Geolocation Permission
    try {
      if ('geolocation' in navigator) {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              setPermissionStates(prev => ({ ...prev, geolocation: 'granted' }));
              resolve(true);
            },
            () => {
              setPermissionStates(prev => ({ ...prev, geolocation: 'denied' }));
              resolve(false);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
        });
      }
    } catch (err) {
      console.warn('Geolocation permission error:', err);
    }

    // 3. Camera Permission
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Immediately release stream so the camera light turns off
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        setPermissionStates(prev => ({ ...prev, camera: 'granted' }));
      }
    } catch (err) {
      console.warn('Camera permission error:', err);
      setPermissionStates(prev => ({ ...prev, camera: 'denied' }));
    }

    setRequesting(false);
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, Date.now().toString());

    // Auto-close after brief review of granted status
    setTimeout(() => {
      setIsOpen(false);
    }, 1500);
  };

  const handleDismiss = () => {
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, Date.now().toString());
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const isAllGranted = 
    permissionStates.notification === 'granted' &&
    permissionStates.geolocation === 'granted' &&
    permissionStates.camera === 'granted';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-dialog-title"
      >
        {/* Header with decorative brand backdrop */}
        <div className="relative bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-6 text-white text-left">
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center mb-3 shadow-inner border border-white/20">
            <Shield className="w-6 h-6 text-white" />
          </div>

          <h3 id="permission-dialog-title" className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            Enable Device Permissions
            <Sparkles className="w-4 h-4 text-emerald-200" />
          </h3>
          <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
            Please allow essential device access for real-time ticket alerts, technician route mapping, and equipment photo uploads.
          </p>
        </div>

        {/* Permission Item List */}
        <div className="p-5 space-y-3 bg-slate-50/50 divide-y divide-slate-100 text-left">
          {/* Notifications */}
          <div className="pt-2 first:pt-0 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Push Notifications</h4>
                <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                  Receive instant alerts when a ticket is assigned, updated, or escalated.
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 ${
              permissionStates.notification === 'granted'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : permissionStates.notification === 'denied'
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {permissionStates.notification === 'granted' ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : null}
              {permissionStates.notification === 'granted' ? 'Allowed' : permissionStates.notification === 'denied' ? 'Blocked' : 'Required'}
            </span>
          </div>

          {/* Location */}
          <div className="pt-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">GPS & Site Location</h4>
                <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                  Verify installation sites, mark GPS coordinates, and compute travel distance.
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 ${
              permissionStates.geolocation === 'granted'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : permissionStates.geolocation === 'denied'
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {permissionStates.geolocation === 'granted' ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : null}
              {permissionStates.geolocation === 'granted' ? 'Allowed' : permissionStates.geolocation === 'denied' ? 'Blocked' : 'Required'}
            </span>
          </div>

          {/* Camera */}
          <div className="pt-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Camera Access</h4>
                <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                  Capture inverter serial numbers, damage photos, and completion proofs directly.
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 ${
              permissionStates.camera === 'granted'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : permissionStates.camera === 'denied'
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {permissionStates.camera === 'granted' ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : null}
              {permissionStates.camera === 'granted' ? 'Allowed' : permissionStates.camera === 'denied' ? 'Blocked' : 'Required'}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={requesting}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Maybe Later
          </button>

          <button
            type="button"
            onClick={handleRequestAllPermissions}
            disabled={requesting || isAllGranted}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {requesting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Requesting Permissions...</span>
              </>
            ) : isAllGranted ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>All Permissions Allowed</span>
              </>
            ) : (
              <>
                <span>Enable All Permissions</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
