import React from 'react';

export const GlobalLoadingOverlay = ({ isVisible, message = 'Processing...' }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/45 backdrop-blur-xs animate-in fade-in duration-200 pointer-events-auto select-none">
      <div className="bg-slate-900/95 border border-emerald-500/40 text-white px-7 py-5 rounded-3xl shadow-2xl flex flex-col items-center gap-3.5 max-w-xs mx-4 text-center transform animate-in zoom-in-95 duration-200">
        {/* 3 Green Bouncing Dots Animation */}
        <div className="flex items-center justify-center gap-2.5 py-1">
          <div 
            className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-emerald-500/50 shadow-md animate-bounce" 
            style={{ animationDelay: '0ms', animationDuration: '0.8s' }} 
          />
          <div 
            className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-emerald-500/50 shadow-md animate-bounce" 
            style={{ animationDelay: '160ms', animationDuration: '0.8s' }} 
          />
          <div 
            className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-emerald-500/50 shadow-md animate-bounce" 
            style={{ animationDelay: '320ms', animationDuration: '0.8s' }} 
          />
        </div>

        {/* Text Details */}
        <div>
          <div className="text-sm font-bold text-slate-100 tracking-wide">
            {message}
          </div>
          <div className="text-[11px] text-emerald-300/80 font-medium mt-0.5">
            Please wait while your request is processed
          </div>
        </div>
      </div>
    </div>
  );
};
