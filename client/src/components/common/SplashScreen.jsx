import React, { useState, useEffect, useRef } from 'react';

/**
 * SplashScreen
 * High-fidelity, smooth splash screen for Eco Green Solar CMS.
 * Ensures fast display duration (500ms) with a graceful fade-out transition.
 * Guaranteed never to get stuck with stable ref callbacks, tap-to-dismiss,
 * and a hard safety fallback timeout.
 */
export const SplashScreen = ({ minDuration = 500, onComplete }) => {
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(true);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const dismiss = () => {
    setFading(true);
    setTimeout(() => {
      setVisible(false);
      if (onCompleteRef.current) onCompleteRef.current();
    }, 250);
  };

  useEffect(() => {
    // If browser already spent time downloading assets on a slow connection, dismiss quickly
    const initialStart = typeof window !== 'undefined' ? window.__INITIAL_SPLASH_START : null;
    const elapsed = initialStart ? (Date.now() - initialStart) : 0;
    const effectiveDuration = elapsed > 800 ? 150 : minDuration;

    const timer = setTimeout(() => {
      dismiss();
    }, effectiveDuration);

    // Hard safety fallback: guaranteed dismissal under any network or rendering conditions
    const safetyTimer = setTimeout(() => {
      setVisible(false);
      if (onCompleteRef.current) onCompleteRef.current();
    }, 1200);

    return () => {
      clearTimeout(timer);
      clearTimeout(safetyTimer);
    };
  }, [minDuration]);

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      className={`fixed inset-0 z-[9999999] flex flex-col items-center justify-between select-none cursor-pointer transition-opacity duration-250 ease-out ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        backgroundColor: '#085235',
        paddingTop: 'max(2rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))'
      }}
      aria-label="Application Loading"
      role="status"
    >
      {/* Top spacer */}
      <div className="w-full flex justify-center pt-2">
        <span className="text-[11px] font-bold tracking-widest text-emerald-300/75 uppercase">
          Solar Service Portal
        </span>
      </div>

      {/* Center Brand Identity */}
      <div className="flex flex-col items-center justify-center text-center px-4 max-w-sm">
        <div className="relative mb-5">
          {/* Subtle Ambient Pulse Halo */}
          <div className="absolute -inset-4 bg-emerald-400/25 rounded-full blur-2xl animate-pulse pointer-events-none" />
          
          <img
            src="/support-icon-192.png"
            srcSet="/support-icon-192.png 192w, /support-icon-512.png 512w"
            sizes="140px"
            width="140"
            height="140"
            alt="Eco Green Support"
            className="relative w-36 h-36 object-contain drop-shadow-2xl animate-in zoom-in-95 duration-500"
          />
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Eco Green Support
        </h1>
        <p className="text-xs sm:text-sm text-emerald-200/85 mt-1 font-medium tracking-wide">
          Solar Systems &amp; Field Operations Hub
        </p>

        {/* Minimalist Smooth Loading Indicator */}
        <div className="mt-5 w-36 h-1 bg-white/15 rounded-full overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-300 rounded-full animate-pulse" />
        </div>
        <p className="text-[11px] text-emerald-300 font-semibold mt-2.5">
          Loading Eco Green Portal...
        </p>
      </div>

      {/* Bottom Footer Info */}
      <div className="text-center">
        <p className="text-[11px] font-semibold text-emerald-300/80">
          Eco Green Solar CMS
        </p>
        <p className="text-[10px] text-emerald-400/50 font-mono mt-0.5">
          v2.6 • complain.ecogreensolar.co.in
        </p>
      </div>
    </div>
  );
};
