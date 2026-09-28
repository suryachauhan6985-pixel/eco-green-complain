import React, { useState, useEffect } from 'react';
import { Sun, ShieldCheck } from 'lucide-react';
import { APP_VERSION } from '../../version';

export const AppSplashScreen = ({ onFinish }) => {
  const [fadeState, setFadeState] = useState('visible'); // 'visible' | 'fading' | 'hidden'

  useEffect(() => {
    // Show splash for 1100ms, then initiate smooth fade-out
    const timer1 = setTimeout(() => {
      setFadeState('fading');
    }, 1100);

    const timer2 = setTimeout(() => {
      setFadeState('hidden');
      if (onFinish) onFinish();
    }, 1450);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [onFinish]);

  if (fadeState === 'hidden') return null;

  return (
    <div 
      className={`fixed inset-0 z-[100000] flex flex-col items-center justify-between p-8 bg-[#090d16] text-white select-none transition-opacity duration-350 ${
        fadeState === 'fading' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Top spacer */}
      <div className="w-full flex justify-end">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/20 text-[10px] text-emerald-400 font-mono tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>v{APP_VERSION}</span>
        </div>
      </div>

      {/* Central Branded Hero */}
      <div className="flex flex-col items-center gap-5 text-center max-w-xs animate-in zoom-in-95 duration-500">
        {/* Glowing Logo Icon */}
        <div className="relative">
          <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
          <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-tr from-emerald-800 to-emerald-600 p-0.5 shadow-2xl shadow-emerald-900/50 flex items-center justify-center border border-emerald-400/30">
            <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center p-3 overflow-hidden">
              <img 
                src="/support-icon-192.png" 
                alt="Eco Green Solar" 
                className="w-16 h-16 object-contain drop-shadow-md"
              />
            </div>
          </div>
        </div>

        {/* Brand Text */}
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
            <span>Eco Green Solar</span>
            <span className="text-emerald-400 text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 font-extrabold uppercase tracking-wider">
              CMS
            </span>
          </h1>
          <p className="text-xs text-slate-400 font-medium tracking-wide">
            Solar Service, Warranty &amp; Complaint Management
          </p>
        </div>

        {/* 3 Green Bouncing Dots Animation */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <div 
            className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-bounce shadow-xs shadow-emerald-500/50" 
            style={{ animationDelay: '0ms', animationDuration: '0.8s' }} 
          />
          <div 
            className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-bounce shadow-xs shadow-emerald-500/50" 
            style={{ animationDelay: '160ms', animationDuration: '0.8s' }} 
          />
          <div 
            className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-bounce shadow-xs shadow-emerald-500/50" 
            style={{ animationDelay: '320ms', animationDuration: '0.8s' }} 
          />
        </div>
      </div>

      {/* Footer Branding */}
      <div className="text-center space-y-1">
        <div className="text-[11px] font-semibold text-slate-400">
          Eco Green Solar Care Network
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          Fast Service • Instant Verification • Lifetime Support
        </div>
      </div>
    </div>
  );
};
