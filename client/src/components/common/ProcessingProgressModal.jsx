import React from 'react';
import { UploadCloud, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';

/**
 * ProcessingProgressModal
 * 
 * Enterprise-grade full-screen modal overlay with background blur.
 * Completely blurs the background and blocks all user interactions while
 * file uploads, complaint resolutions, or critical operations are running.
 * 
 * Only the centered progress bar and loading details remain clear and focused.
 */
export function ProcessingProgressModal({
  isOpen,
  title = 'Processing Request...',
  subtitle = 'Please wait while your data is securely optimized and transferred.',
  progress = 0,
  currentFile = '',
  currentIndex = 0,
  totalFiles = 0,
  stage = ''
}) {
  if (!isOpen) return null;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const isComplete = clampedProgress >= 100;

  return (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/75 select-none transition-all duration-300"
      style={{
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
      aria-modal="true"
      role="dialog"
    >
      {/* Centered Elevated Progress Card */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
        
        {/* Animated Icon Badge */}
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
            {isComplete ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-500 animate-in zoom-in duration-300" />
            ) : (
              <UploadCloud className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-bounce" style={{ animationDuration: '1.4s' }} />
            )}
          </div>
          {!isComplete && (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight mb-1">
          {title}
        </h3>

        {/* Subtitle / Stage */}
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mb-5 leading-relaxed">
          {subtitle}
        </p>

        {/* Live Progress Bar */}
        <div className="w-full space-y-2 mb-4">
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider font-mono">
              {stage || (isComplete ? 'Transfer Complete' : 'Optimizing & Uploading')}
            </span>
            <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
              {clampedProgress}%
            </span>
          </div>

          <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/80 dark:border-slate-700/60 p-0.5">
            <div 
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                isComplete 
                  ? 'bg-emerald-500' 
                  : 'bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-400 animate-pulse'
              }`}
              style={{ width: `${Math.max(4, clampedProgress)}%` }}
            />
          </div>
        </div>

        {/* Active File Telemetry Chip */}
        {(currentFile || totalFiles > 0) && (
          <div className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl flex items-center justify-center gap-2 mb-4 text-xs text-slate-700 dark:text-slate-300">
            {!isComplete && (
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-spin shrink-0" />
            )}
            <span className="truncate max-w-[260px] font-medium text-[11px]">
              {totalFiles > 1 && currentIndex > 0 ? (
                <>
                  <strong className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">[{currentIndex}/{totalFiles}]</strong>{' '}
                  {currentFile}
                </>
              ) : (
                currentFile
              )}
            </span>
          </div>
        )}

        {/* Safe Operation Notice */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>Secure Cloud Transfer Active • Do not close this window</span>
        </div>

      </div>
    </div>
  );
}
