import React from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const getTicketAgeInfo = (complaint) => {
  if (!complaint) return { text: 'Today', days: 0, isOpen: false, isOverdue: false };
  const dateStr = complaint.created_at || complaint.status_updated_at;
  if (!dateStr) return { text: 'Today', days: 0, isOpen: false, isOverdue: false };

  // Normalize SQLite UTC timestamp format:
  // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" (UTC without 'T' or 'Z').
  // In Indian Standard Time (IST, UTC+5:30), new Date("2026-09-14 14:00:00") is treated as local time,
  // causing an artificial 5.5 hour ("5h ago") discrepancy for newly registered tickets.
  const normalizedStr = dateStr.includes('Z') || dateStr.includes('+')
    ? dateStr
    : (dateStr.includes('T') ? `${dateStr}Z` : `${dateStr.replace(' ', 'T')}Z`);

  const createdTime = new Date(normalizedStr).getTime();
  const now = new Date().getTime();
  const diffMs = Math.max(0, now - createdTime);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(diffHours / 24);

  let text = 'Today';
  if (diffMinutes < 3) text = 'Just now';
  else if (diffHours < 1) text = `${diffMinutes}m ago`;
  else if (diffHours < 24) text = `${diffHours}h ago`;
  else if (days === 1) text = '1 day ago';
  else text = `${days} days ago`;

  const status = complaint.status || 'Unassigned';
  const isOpen = !['Resolved', 'Closed'].includes(status);
  // User condition: If open for >= 2 days without closure, turn RED
  const isOverdue = isOpen && days >= 2;

  return { text, days, diffHours, isOpen, isOverdue };
};

export const TicketAgeBadge = ({ complaint, compact = false, showLabel = true }) => {
  const { text, days, isOpen, isOverdue } = getTicketAgeInfo(complaint);

  if (isOverdue) {
    return (
      <span 
        className={`inline-flex items-center gap-1.5 font-bold rounded-lg border border-rose-300 bg-rose-100 text-rose-800 shadow-2xs shrink-0 ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        }`}
        title={`Pending for ${days} days without closure!`}
      >
        <AlertTriangle className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-rose-600 shrink-0 animate-pulse`} />
        <span className="font-extrabold whitespace-nowrap">{text}</span>
      </span>
    );
  }

  if (days === 1 && isOpen) {
    return (
      <span 
        className={`inline-flex items-center gap-1 font-semibold rounded-lg border border-amber-200 bg-amber-50 text-amber-900 shrink-0 ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
        }`}
      >
        <Clock className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-amber-600 shrink-0`} />
        <span className="whitespace-nowrap">1 day ago</span>
      </span>
    );
  }

  if (isOpen) {
    return (
      <span 
        className={`inline-flex items-center gap-1 font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 shrink-0 ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
        }`}
      >
        <Clock className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-emerald-600 shrink-0`} />
        <span className="whitespace-nowrap">{text}</span>
      </span>
    );
  }

  // Resolved or Closed
  return (
    <span 
      className={`inline-flex items-center gap-1 font-medium rounded-lg border border-slate-200 bg-slate-100 text-slate-600 shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <CheckCircle2 className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-slate-400 shrink-0`} />
      <span className="whitespace-nowrap">{text}</span>
    </span>
  );
};
