import React from 'react';

/**
 * Reusable animated skeleton loaders designed to prevent layout shift
 * and provide a smooth, premium loading experience across the app.
 */

// 1. Single Skeleton Card for Complaint Grid View
export const ComplaintCardSkeleton = () => (
  <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between gap-3 animate-pulse">
    <div>
      {/* Top Bar: Ticket ID & Stage Badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-28 bg-slate-200 rounded-md"></div>
          <div className="h-3 w-16 bg-slate-100 rounded-md hidden sm:block"></div>
        </div>
        <div className="h-5 w-24 bg-slate-200 rounded-full"></div>
      </div>

      {/* Date & SLA Bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-20 bg-slate-100 rounded"></div>
        <div className="h-3 w-14 bg-slate-100 rounded"></div>
      </div>

      {/* Customer Info */}
      <div className="space-y-1.5 mb-3">
        <div className="h-4 w-36 bg-slate-200 rounded-md"></div>
        <div className="h-3 w-28 bg-slate-100 rounded"></div>
        <div className="h-3 w-48 bg-slate-100 rounded"></div>
      </div>

      {/* Issue Summary Box */}
      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
        <div className="h-3 w-full bg-slate-200/70 rounded"></div>
        <div className="h-3 w-4/5 bg-slate-200/70 rounded"></div>
      </div>
    </div>

    {/* Footer Bar: Technician & Actions */}
    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-slate-200 shrink-0"></div>
        <div className="h-3 w-20 bg-slate-200 rounded"></div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-6 w-14 bg-slate-100 rounded-md"></div>
        <div className="h-6 w-6 bg-slate-100 rounded-md"></div>
      </div>
    </div>
  </div>
);

// Grid of 6 Complaint Cards
export const ComplaintGridSkeleton = ({ count = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4 bg-slate-100/50">
    {Array.from({ length: count }).map((_, idx) => (
      <ComplaintCardSkeleton key={idx} />
    ))}
  </div>
);

// 2. Table Rows Skeleton for Complaint List View
export const ComplaintTableSkeleton = ({ rows = 7 }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          <th className="py-3 px-4">Ticket & Product</th>
          <th className="py-3 px-4">Customer & City</th>
          <th className="py-3 px-4 hidden lg:table-cell">Issue Summary</th>
          <th className="py-3 px-4">Status</th>
          <th className="py-3 px-4">Days Open / Age</th>
          <th className="py-3 px-4">Priority & Warranty</th>
          <th className="py-3 px-4 hidden sm:table-cell">Assigned Tech</th>
          <th className="py-3 px-4">Charges</th>
          <th className="py-3 px-4 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, idx) => (
          <tr key={idx} className="animate-pulse">
            <td className="py-3.5 px-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-200 shrink-0"></div>
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 bg-slate-200 rounded"></div>
                  <div className="h-3 w-16 bg-slate-100 rounded"></div>
                </div>
              </div>
            </td>
            <td className="py-3.5 px-4">
              <div className="space-y-1.5">
                <div className="h-3.5 w-28 bg-slate-200 rounded"></div>
                <div className="h-3 w-20 bg-slate-100 rounded"></div>
              </div>
            </td>
            <td className="py-3.5 px-4 hidden lg:table-cell">
              <div className="space-y-1.5 max-w-xs">
                <div className="h-3 w-48 bg-slate-200 rounded"></div>
                <div className="h-2.5 w-32 bg-slate-100 rounded"></div>
              </div>
            </td>
            <td className="py-3.5 px-4">
              <div className="h-5 w-24 bg-slate-200 rounded-full"></div>
            </td>
            <td className="py-3.5 px-4">
              <div className="h-3.5 w-16 bg-slate-100 rounded"></div>
            </td>
            <td className="py-3.5 px-4">
              <div className="h-5 w-16 bg-slate-100 rounded"></div>
            </td>
            <td className="py-3.5 px-4 hidden sm:table-cell">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0"></div>
                <div className="h-3.5 w-20 bg-slate-200 rounded"></div>
              </div>
            </td>
            <td className="py-3.5 px-4">
              <div className="h-3.5 w-14 bg-slate-200 rounded"></div>
            </td>
            <td className="py-3.5 px-4 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <div className="w-6 h-6 rounded-md bg-slate-100"></div>
                <div className="w-6 h-6 rounded-md bg-slate-100"></div>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// 3. Analytics Dashboard Skeleton
export const AnalyticsDashboardSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    {/* Top Header Placeholder */}
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
      <div className="space-y-1.5">
        <div className="h-6 w-48 bg-slate-200 rounded-md"></div>
        <div className="h-3.5 w-72 bg-slate-100 rounded"></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-9 w-28 bg-slate-200 rounded-lg"></div>
        <div className="h-9 w-32 bg-slate-200 rounded-lg"></div>
      </div>
    </div>

    {/* 4 Metric KPI Cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-24 bg-slate-200 rounded"></div>
            <div className="w-8 h-8 rounded-lg bg-slate-100"></div>
          </div>
          <div className="h-8 w-20 bg-slate-300 rounded-md"></div>
          <div className="h-3 w-32 bg-slate-100 rounded"></div>
        </div>
      ))}
    </div>

    {/* 2 Big Chart Skeletons */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, idx) => (
        <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-4 w-36 bg-slate-200 rounded"></div>
              <div className="h-3 w-24 bg-slate-100 rounded"></div>
            </div>
            <div className="h-6 w-16 bg-slate-100 rounded"></div>
          </div>
          {/* Mock Bar / Wave Lines */}
          <div className="h-56 bg-slate-50 rounded-lg border border-slate-100 p-4 flex items-end justify-between gap-3">
            {[40, 75, 55, 90, 60, 85, 45, 95, 70, 80].map((h, i) => (
              <div
                key={i}
                className="w-full bg-slate-200/80 rounded-t-md transition-all"
                style={{ height: `${h}%` }}
              ></div>
            ))}
          </div>
        </div>
      ))}
    </div>

    {/* Bottom List Table Placeholder */}
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3">
      <div className="h-4 w-40 bg-slate-200 rounded mb-2"></div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-10 bg-slate-50 rounded-lg flex items-center justify-between px-3">
            <div className="h-3 w-36 bg-slate-200 rounded"></div>
            <div className="h-3 w-20 bg-slate-200 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// 4. Staff & Technician Grid Skeleton
export const StaffTeamSkeleton = ({ count = 6 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-slate-200 shrink-0"></div>
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="h-4 w-28 bg-slate-200 rounded"></div>
              <div className="h-3 w-20 bg-slate-100 rounded"></div>
            </div>
            <div className="h-5 w-16 bg-slate-100 rounded-full"></div>
          </div>

          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="h-3 w-36 bg-slate-100 rounded"></div>
            <div className="h-3 w-44 bg-slate-100 rounded"></div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="h-6 w-20 bg-slate-100 rounded-md"></div>
          <div className="h-7 w-20 bg-slate-200 rounded-lg"></div>
        </div>
      </div>
    ))}
  </div>
);

// 5. WhatsApp Chat List Skeleton
export const WhatsAppChatListSkeleton = ({ count = 7 }) => (
  <div className="divide-y divide-slate-100 animate-pulse">
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className="p-3.5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-slate-200 shrink-0"></div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="h-3.5 w-28 bg-slate-200 rounded"></div>
            <div className="h-2.5 w-10 bg-slate-100 rounded"></div>
          </div>
          <div className="h-3 w-40 bg-slate-100 rounded"></div>
        </div>
      </div>
    ))}
  </div>
);

// 6. Generic Top-Level App Fallback Skeleton
export const AppPageSkeleton = () => (
  <div className="min-h-screen bg-slate-50 animate-pulse flex flex-col">
    {/* Nav Header */}
    <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100"></div>
        <div className="h-4 w-36 bg-slate-200 rounded"></div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-8 w-24 bg-slate-100 rounded-lg"></div>
        <div className="w-8 h-8 rounded-full bg-slate-200"></div>
      </div>
    </div>

    {/* Secondary Filter Header */}
    <div className="h-14 bg-white border-b border-slate-100 px-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-24 bg-slate-200 rounded-lg"></div>
        <div className="h-8 w-24 bg-slate-100 rounded-lg"></div>
        <div className="h-8 w-24 bg-slate-100 rounded-lg"></div>
      </div>
      <div className="h-8 w-32 bg-emerald-200/60 rounded-lg"></div>
    </div>

    {/* Content Skeleton */}
    <div className="flex-1 p-6">
      <ComplaintGridSkeleton count={8} />
    </div>
  </div>
);
