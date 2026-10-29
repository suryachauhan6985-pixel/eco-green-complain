import React from 'react';

/**
 * High-Performance, Zero-CLS Skeleton Primitives
 * 
 * Provides layout-stable placeholders matching production card and table dimensions
 * without jarring layout shifts or excessive CPU-intensive animations.
 */

export function SkeletonCard({ className = '', height = 'h-36', children }) {
  return (
    <div className={`bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3 animate-pulse ${className}`}>
      {children || (
        <>
          <div className="flex items-center justify-between">
            <div className="h-4 bg-slate-200 rounded-md w-1/3" />
            <div className="h-5 bg-slate-100 rounded-full w-20" />
          </div>
          <div className="space-y-2 pt-1">
            <div className="h-3.5 bg-slate-100 rounded w-3/4" />
            <div className="h-3.5 bg-slate-100 rounded w-1/2" />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="h-3 bg-slate-100 rounded w-24" />
            <div className="h-6 bg-slate-200/70 rounded-lg w-16" />
          </div>
        </>
      )}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs ${className}`}>
      {/* Table Header Skeleton */}
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div 
            key={i} 
            className="h-3.5 bg-slate-200 rounded-md animate-pulse" 
            style={{ width: `${Math.max(12, 100 / cols - 4)}%` }} 
          />
        ))}
      </div>
      {/* Table Rows Skeleton */}
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="px-5 py-3.5 flex items-center justify-between gap-4 animate-pulse">
            {Array.from({ length: cols }).map((_, cIdx) => (
              <div 
                key={cIdx} 
                className="h-3 bg-slate-100 rounded" 
                style={{ width: `${Math.max(10, (100 / cols) - (cIdx % 2 ? 6 : 2))}%` }} 
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonStat({ className = '' }) {
  return (
    <div className={`bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-2.5 animate-pulse ${className}`}>
      <div className="flex items-center justify-between">
        <div className="h-3.5 bg-slate-200 rounded w-24" />
        <div className="w-8 h-8 rounded-xl bg-slate-100" />
      </div>
      <div className="h-7 bg-slate-200 rounded-lg w-28" />
      <div className="h-3 bg-slate-100 rounded w-36 pt-1" />
    </div>
  );
}

export function SkeletonList({ items = 4, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-3.5 border border-slate-200/80 flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="h-3.5 bg-slate-200 rounded w-1/3" />
              <div className="h-3 bg-slate-100 rounded w-2/3" />
            </div>
          </div>
          <div className="h-5 bg-slate-100 rounded-full w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default {
  SkeletonCard,
  SkeletonTable,
  SkeletonStat,
  SkeletonList
};
