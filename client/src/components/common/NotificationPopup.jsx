import React from 'react';
import { useNotifications } from '../../context/NotificationContext';
import { Bell, Wrench, CheckCircle2, ArrowRight, X, Clock, AlertCircle } from 'lucide-react';

export const NotificationPopup = ({ onSelectComplaint }) => {
  const { activePopup, dismissPopup, markAsRead } = useNotifications();

  if (!activePopup) return null;

  const handleOpenTicket = () => {
    if (activePopup.ticketId || activePopup.complaintId) {
      markAsRead(activePopup.id);
      if (onSelectComplaint) {
        onSelectComplaint(activePopup.ticketId || activePopup.complaintId);
      }
    }
  };

  const getIconAndColors = () => {
    switch (activePopup.type) {
      case 'assignment':
        return {
          icon: Wrench,
          bg: 'bg-emerald-950/95',
          border: 'border-emerald-500/50',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          badgeText: 'New Assignment',
          accent: 'text-emerald-400',
          buttonBg: 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold'
        };
      case 'resolved':
        return {
          icon: CheckCircle2,
          bg: 'bg-teal-950/95',
          border: 'border-teal-500/50',
          badgeBg: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
          badgeText: 'Ticket Resolved',
          accent: 'text-teal-400',
          buttonBg: 'bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold'
        };
      case 'status_update':
        return {
          icon: AlertCircle,
          bg: 'bg-blue-950/95',
          border: 'border-blue-500/50',
          badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
          badgeText: 'Status Update',
          accent: 'text-blue-400',
          buttonBg: 'bg-blue-500 hover:bg-blue-600 text-white font-bold'
        };
      default:
        return {
          icon: Bell,
          bg: 'bg-slate-900/95',
          border: 'border-amber-500/50',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          badgeText: 'Notification',
          accent: 'text-amber-400',
          buttonBg: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
        };
    }
  };

  const theme = getIconAndColors();
  const IconComponent = theme.icon;

  return (
    <div className="fixed top-18 sm:top-20 right-3 sm:right-6 z-50 max-w-sm sm:max-w-md w-full animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-auto">
      <div className={`${theme.bg} ${theme.border} border-2 rounded-2xl shadow-2xl backdrop-blur-md p-4 text-white transition-all`}>
        {/* Header & Badges */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="relative p-2 rounded-xl bg-white/10 shrink-0">
              <IconComponent className={`w-5 h-5 ${theme.accent}`} />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${theme.badgeBg}`}>
                  {theme.badgeText}
                </span>
                {activePopup.ticketId && (
                  <span className="font-mono text-xs font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                    {activePopup.ticketId}
                  </span>
                )}
              </div>
              <h4 className="font-bold text-sm text-slate-100 mt-1 leading-snug">
                {activePopup.title}
              </h4>
            </div>
          </div>

          <button
            onClick={dismissPopup}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Dismiss popup (Keeps unread badge on bell icon)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Body */}
        <p className="text-xs text-slate-300 mb-3 pl-10 pr-2 line-clamp-2 leading-relaxed">
          {activePopup.message}
        </p>

        {/* Actions & Timestamp */}
        <div className="flex items-center justify-between pl-10 pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>Just now</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={dismissPopup}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
            >
              Later
            </button>
            <button
              onClick={handleOpenTicket}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs shadow-xs transition-all active:scale-95 ${theme.buttonBg}`}
            >
              <span>View Ticket</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
