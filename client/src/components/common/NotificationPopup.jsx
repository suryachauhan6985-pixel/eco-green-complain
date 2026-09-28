import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../../context/NotificationContext';
import { Bell, Wrench, CheckCircle2, ArrowRight, X, Clock, AlertCircle, Check, RotateCcw, XCircle } from 'lucide-react';

export const NotificationPopup = ({ onSelectComplaint }) => {
  const { 
    activePopup, 
    dismissPopup, 
    dismissAllPopups, 
    markAsRead, 
    unreadCount 
  } = useNotifications();

  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissDirection, setDismissDirection] = useState('right');

  const startCoordRef = useRef({ x: 0, y: 0, time: 0 });
  const cardRef = useRef(null);

  // Reset drag state when activePopup changes
  useEffect(() => {
    setDragX(0);
    setIsDragging(false);
    setIsDismissing(false);
  }, [activePopup?.id]);

  if (!activePopup) return null;

  const handleOpenTicket = () => {
    if (!activePopup) return;
    if (activePopup.id) {
      markAsRead(activePopup.id);
    }
    if (onSelectComplaint && (activePopup.ticketId || activePopup.complaintId)) {
      onSelectComplaint(activePopup.ticketId || activePopup.complaintId);
    }
  };

  const handleMarkRead = (e) => {
    e.stopPropagation();
    markAsRead(activePopup.id);
  };

  const handleDismissAll = (e) => {
    e.stopPropagation();
    if (dismissAllPopups) {
      dismissAllPopups();
    } else {
      dismissPopup(activePopup.id);
    }
  };

  // Touch & Swipe handlers (Native Mobile Android / iOS swipe-to-dismiss)
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    startCoordRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - startCoordRef.current.x;
    const diffY = touch.clientY - startCoordRef.current.y;

    // Only swipe if horizontal movement is greater than vertical scroll
    if (Math.abs(diffX) > Math.abs(diffY)) {
      setDragX(diffX);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 75; // px to trigger dismiss
    if (Math.abs(dragX) > threshold) {
      const direction = dragX > 0 ? 'right' : 'left';
      setDismissDirection(direction);
      setIsDismissing(true);
      setTimeout(() => {
        dismissPopup(activePopup.id);
      }, 180);
    } else {
      // Snap back smoothly
      setDragX(0);
    }
  };

  // Mouse drag support for desktop/trackpad
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // primary click only
    startCoordRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const diffX = e.clientX - startCoordRef.current.x;
    setDragX(diffX);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (Math.abs(dragX) > 75) {
      const direction = dragX > 0 ? 'right' : 'left';
      setDismissDirection(direction);
      setIsDismissing(true);
      setTimeout(() => {
        dismissPopup(activePopup.id);
      }, 180);
    } else {
      setDragX(0);
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
      case 'reopened':
        return {
          icon: RotateCcw,
          bg: 'bg-rose-950/95',
          border: 'border-rose-500/50',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          badgeText: 'Ticket Reopened',
          accent: 'text-rose-400',
          buttonBg: 'bg-rose-500 hover:bg-rose-600 text-white font-bold'
        };
      case 'reassigned':
        return {
          icon: RotateCcw,
          bg: 'bg-amber-950/95',
          border: 'border-amber-500/50',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          badgeText: 'Job Reassigned',
          accent: 'text-amber-400',
          buttonBg: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
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
      case 'new_ticket':
        return {
          icon: Bell,
          bg: 'bg-amber-950/95',
          border: 'border-amber-500/50',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          badgeText: 'New Ticket',
          accent: 'text-amber-400',
          buttonBg: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
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

  // Swipe translation style
  const currentTranslateX = isDismissing
    ? dismissDirection === 'right' ? 420 : -420
    : dragX;

  const currentOpacity = isDismissing
    ? 0
    : Math.max(0.35, 1 - Math.abs(dragX) / 280);

  return (
    <div className="fixed top-18 sm:top-20 right-3 sm:right-6 z-50 max-w-sm sm:max-w-md w-full animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-auto select-none">
      <div 
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          transform: `translateX(${currentTranslateX}px)`,
          opacity: currentOpacity,
          transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.22s ease'
        }}
        className={`${theme.bg} ${theme.border} border-2 rounded-2xl shadow-2xl backdrop-blur-md p-4 text-white transition-all cursor-grab active:cursor-grabbing relative overflow-hidden`}
      >
        {/* Android style swipe action indicators */}
        {dragX !== 0 && (
          <div 
            className={`absolute inset-y-0 ${dragX > 0 ? 'left-3' : 'right-3'} flex items-center gap-1.5 text-xs font-bold pointer-events-none transition-opacity ${Math.abs(dragX) > 60 ? 'text-rose-400 opacity-100' : 'text-slate-400 opacity-60'}`}
          >
            <XCircle className="w-5 h-5 animate-pulse" />
            <span className="text-[11px] uppercase tracking-wider">Dismiss</span>
          </div>
        )}

        {/* Header & Badges */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="relative p-2 rounded-xl bg-white/10 shrink-0">
              <IconComponent className={`w-5 h-5 ${theme.accent}`} />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${theme.badgeBg}`}>
                  {theme.badgeText}
                </span>
                {activePopup.ticketId && (
                  <span className="font-mono text-xs font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                    {activePopup.ticketId}
                  </span>
                )}
                {unreadCount > 1 && (
                  <span className="text-[10px] font-bold text-slate-300 bg-white/10 px-2 py-0.5 rounded-full">
                    {unreadCount} Unread
                  </span>
                )}
              </div>
              <h4 className="font-bold text-sm text-slate-100 mt-1 leading-snug">
                {activePopup.title}
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Close All Button (when multiple notifications or readily accessible) */}
            {unreadCount > 1 && (
              <button
                onClick={handleDismissAll}
                className="px-2 py-1 rounded-lg text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/30 hover:text-white transition-all cursor-pointer shadow-2xs"
                title="Close all unread popups at once"
              >
                Close All ({unreadCount})
              </button>
            )}

            {/* Single Close Button */}
            <button
              onClick={() => dismissPopup(activePopup.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Dismiss this notification (or swipe left/right)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Body */}
        <p className="text-xs text-slate-300 mb-3 pl-10 pr-2 line-clamp-2 leading-relaxed">
          {activePopup.message}
        </p>

        {/* Swipe hint on touch devices */}
        <div className="sm:hidden pl-10 mb-2 flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
          <span className="opacity-70">👈 Swipe left or right to dismiss 👉</span>
        </div>

        {/* Actions & Timestamp */}
        <div className="flex items-center justify-between pl-10 pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>Unread</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkRead}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors font-medium cursor-pointer"
              title="Mark as read and advance to next"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Mark Read</span>
            </button>
            <button
              onClick={handleOpenTicket}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs shadow-xs transition-all active:scale-95 cursor-pointer ${theme.buttonBg}`}
            >
              <span>Open Ticket</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
