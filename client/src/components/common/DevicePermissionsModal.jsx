import React, { useState, useEffect } from 'react';
import { Bell, MapPin, Camera, CheckCircle2, AlertCircle, Shield, X, Sparkles, ChevronRight, Check } from 'lucide-react';

const PERMISSIONS_STORAGE_KEY = 'egs_device_permissions_prompted_at';

export const DevicePermissionsModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [activePrompt, setActivePrompt] = useState(null); // 'notification' | 'geolocation' | 'camera' | null
  const [permissionStates, setPermissionStates] = useState({
    notification: 'default',
    geolocation: 'prompt',
    camera: 'prompt'
  });
  const [gpsLocation, setGpsLocation] = useState(null);

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
      const twelveHoursMs = 12 * 60 * 60 * 1000;
      if (lastPrompted && Date.now() - parseInt(lastPrompted, 10) < twelveHoursMs) {
        return;
      }

      // Proactively trigger native browser location prompt on first load if supported
      if ('geolocation' in navigator && states.geo === 'prompt') {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setPermissionStates(prev => ({ ...prev, geolocation: 'granted' }));
            setGpsLocation({ lat: pos.coords.latitude.toFixed(4), lng: pos.coords.longitude.toFixed(4) });
          },
          () => {},
          { timeout: 8000 }
        );
      }

      // Show the permission setup dialog after short delay
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000);

      return () => clearTimeout(timer);
    };

    initCheck();
  }, []);

  // 1. Genuine Native Notification Request
  const requestNotificationPermission = async () => {
    try {
      setActivePrompt('notification');
      if ('Notification' in window) {
        const res = await Notification.requestPermission();
        setPermissionStates(prev => ({ ...prev, notification: res }));
        if (res === 'granted') {
          // Fire an actual genuine native OS desktop notification so the user verifies it
          try {
            new Notification('Eco Green Solar Support', {
              body: 'Push Notifications Enabled! You will receive live complaint and dispatch alerts.',
              icon: '/favicon.ico'
            });
          } catch (_) {}
        }
        return res;
      }
    } catch (err) {
      console.warn('Native notification permission error:', err);
    } finally {
      setActivePrompt(null);
    }
  };

  // 2. Genuine Native Geolocation Request
  const requestLocationPermission = async () => {
    try {
      setActivePrompt('geolocation');
      if ('geolocation' in navigator) {
        return await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setPermissionStates(prev => ({ ...prev, geolocation: 'granted' }));
              setGpsLocation({ lat: pos.coords.latitude.toFixed(4), lng: pos.coords.longitude.toFixed(4) });
              resolve('granted');
            },
            () => {
              setPermissionStates(prev => ({ ...prev, geolocation: 'denied' }));
              resolve('denied');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        });
      }
    } catch (err) {
      console.warn('Native geolocation permission error:', err);
    } finally {
      setActivePrompt(null);
    }
  };

  // 3. Genuine Native Camera Hardware Request
  const requestCameraPermission = async () => {
    try {
      setActivePrompt('camera');
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        // Immediately release stream so hardware camera indicator turns off
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        setPermissionStates(prev => ({ ...prev, camera: 'granted' }));
        return 'granted';
      }
    } catch (err) {
      console.warn('Native camera permission error:', err);
      setPermissionStates(prev => ({ ...prev, camera: 'denied' }));
      return 'denied';
    } finally {
      setActivePrompt(null);
    }
  };

  // Request missing permissions sequentially without colliding browser prompts
  const handleRequestAllPermissions = async () => {
    setRequesting(true);

    try {
      if (permissionStates.notification !== 'granted') {
        await requestNotificationPermission();
      }
      if (permissionStates.geolocation !== 'granted') {
        await requestLocationPermission();
      }
      if (permissionStates.camera !== 'granted') {
        await requestCameraPermission();
      }
    } catch (err) {
      console.warn('Batch permission request notice:', err);
    } finally {
      setRequesting(false);
      localStorage.setItem(PERMISSIONS_STORAGE_KEY, Date.now().toString());
    }

    // Auto-close smoothly after 1.5 seconds so user sees the green checkmark
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 text-left"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-dialog-title"
      >
        {/* Header with brand gradient */}
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
            Enable Genuine Device Permissions
            <Sparkles className="w-4 h-4 text-emerald-200" />
          </h3>
          <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
            Please allow browser access to receive real-time push alerts, technician site location tracking, and camera equipment uploads.
          </p>
        </div>

        {/* Permission Cards with Direct Native Trigger Buttons */}
        <div className="p-5 space-y-3 bg-slate-50/60 divide-y divide-slate-100">
          {/* Push Notifications */}
          <div className="pt-2 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900">Push Notifications</h4>
                  {permissionStates.notification === 'granted' && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded flex items-center gap-1">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                  Direct browser notifications for newly assigned tickets, customer updates, and escalations.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
              {permissionStates.notification === 'granted' ? (
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Allowed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  disabled={activePrompt === 'notification'}
                  className="px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:text-white bg-blue-50 hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded-lg transition-colors cursor-pointer"
                >
                  {activePrompt === 'notification' ? 'Prompting...' : 'Allow Push'}
                </button>
              )}
            </div>
          </div>

          {/* GPS Location */}
          <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900">GPS & Site Location</h4>
                  {permissionStates.geolocation === 'granted' && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded flex items-center gap-1">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                  Verify solar installation sites, record GPS coordinates, and compute technician driving distance.
                </p>
                {gpsLocation && (
                  <p className="text-[10px] font-mono text-emerald-700 font-semibold mt-0.5">
                    📍 Coordinates detected: {gpsLocation.lat}, {gpsLocation.lng}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
              {permissionStates.geolocation === 'granted' ? (
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Allowed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestLocationPermission}
                  disabled={activePrompt === 'geolocation'}
                  className="px-3 py-1.5 text-[11px] font-bold text-emerald-800 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 rounded-lg transition-colors cursor-pointer"
                >
                  {activePrompt === 'geolocation' ? 'Prompting...' : 'Allow GPS'}
                </button>
              )}
            </div>
          </div>

          {/* Camera Access */}
          <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900">Camera Access</h4>
                  {permissionStates.camera === 'granted' && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded flex items-center gap-1">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                  Capture inverter serial numbers, rooftop damage photos, and technician visit proof.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
              {permissionStates.camera === 'granted' ? (
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Allowed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestCameraPermission}
                  disabled={activePrompt === 'camera'}
                  className="px-3 py-1.5 text-[11px] font-bold text-purple-700 hover:text-white bg-purple-50 hover:bg-purple-600 border border-purple-200 hover:border-purple-600 rounded-lg transition-colors cursor-pointer"
                >
                  {activePrompt === 'camera' ? 'Prompting...' : 'Allow Camera'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">
            Permissions can be revoked anytime in your browser settings.
          </p>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={requesting}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Maybe Later
            </button>

            <button
              type="button"
              onClick={handleRequestAllPermissions}
              disabled={requesting || isAllGranted}
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {requesting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Requesting Browser Prompts...</span>
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
    </div>
  );
};
