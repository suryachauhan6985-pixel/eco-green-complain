import React from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Safely parses any date string (ISO UTC, PostgreSQL timestamptz, SQLite format, etc.)
 */
export const parseDateSafe = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;

  let s = String(dateStr).trim();
  // Handle timezone offsets like "+00" missing minutes
  if (/\+\d\d$/.test(s)) s += ':00';
  if (/-\d\d$/.test(s)) s += ':00';

  // If timestamp has space between date and time, replace with 'T'
  // If no timezone specified, assume UTC ('Z') as server sends UTC timestamps
  if (!s.includes('Z') && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  } else {
    s = s.replace(' ', 'T');
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? null : fallback;
};

/**
 * Formats a date string into Indian Standard Time (IST / Asia/Kolkata)
 * e.g. "20 Sep 2026, 03:42 PM"
 */
export const formatIndianDateTime = (dateStr) => {
  const d = parseDateSafe(dateStr);
  if (!d) return '—';

  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Formats time only in IST (e.g. "03:42 PM")
 */
export const formatIndianTimeOnly = (dateStr) => {
  const d = parseDateSafe(dateStr);
  if (!d) return '—';

  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Formats date only in IST (e.g. "20 Sep 2026")
 */
export const formatIndianDateOnly = (dateStr) => {
  const d = parseDateSafe(dateStr);
  if (!d) return '—';

  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const getTicketAgeInfo = (complaint) => {
  if (!complaint) {
    return { text: 'Today', days: 0, isOpen: false, isOverdue: false, formattedDateTime: '—' };
  }
  const dateStr = complaint.created_at || complaint.status_updated_at;
  if (!dateStr) {
    return { text: 'Today', days: 0, isOpen: false, isOverdue: false, formattedDateTime: '—' };
  }

  const d = parseDateSafe(dateStr);
  const formattedDateTime = formatIndianDateTime(dateStr);
  const formattedTime = formatIndianTimeOnly(dateStr);
  const formattedDate = formatIndianDateOnly(dateStr);

  if (!d) {
    return { text: 'Today', days: 0, isOpen: false, isOverdue: false, formattedDateTime, formattedTime, formattedDate };
  }

  const createdTime = d.getTime();
  const now = Date.now();
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

  return { text, days, diffHours, diffMinutes, isOpen, isOverdue, formattedDateTime, formattedTime, formattedDate };
};

export const TicketAgeBadge = ({ complaint, compact = false, showLabel = true, showTime = false }) => {
  const { text, days, isOpen, isOverdue, formattedDateTime, formattedTime } = getTicketAgeInfo(complaint);
  const hoverTitle = `Registered: ${formattedDateTime} (IST)${isOverdue ? ` • Pending for ${days} days without closure!` : ''}`;

  if (isOverdue) {
    return (
      <span 
        className={`inline-flex items-center gap-1.5 font-bold rounded-lg border border-rose-300 bg-rose-100 text-rose-800 shadow-2xs shrink-0 ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        }`}
        title={hoverTitle}
      >
        <AlertTriangle className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-rose-600 shrink-0 animate-pulse`} />
        <span className="font-extrabold whitespace-nowrap">{text}</span>
        {showTime && <span className="font-normal opacity-80 text-[10px]">({formattedTime})</span>}
      </span>
    );
  }

  if (days === 1 && isOpen) {
    return (
      <span 
        className={`inline-flex items-center gap-1 font-semibold rounded-lg border border-amber-200 bg-amber-50 text-amber-900 shrink-0 ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
        }`}
        title={hoverTitle}
      >
        <Clock className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-amber-600 shrink-0`} />
        <span className="whitespace-nowrap">1 day ago</span>
        {showTime && <span className="font-normal text-amber-700 text-[10px]">({formattedTime})</span>}
      </span>
    );
  }

  if (isOpen) {
    return (
      <span 
        className={`inline-flex items-center gap-1 font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 shrink-0 ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
        }`}
        title={hoverTitle}
      >
        <Clock className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-emerald-600 shrink-0`} />
        <span className="whitespace-nowrap">{text}</span>
        {showTime && <span className="font-normal text-emerald-700 text-[10px]">({formattedTime})</span>}
      </span>
    );
  }

  // Resolved or Closed
  return (
    <span 
      className={`inline-flex items-center gap-1 font-medium rounded-lg border border-slate-200 bg-slate-100 text-slate-600 shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
      title={hoverTitle}
    >
      <CheckCircle2 className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-slate-400 shrink-0`} />
      <span className="whitespace-nowrap">{text}</span>
      {showTime && <span className="font-normal text-slate-500 text-[10px]">({formattedTime})</span>}
    </span>
  );
};
