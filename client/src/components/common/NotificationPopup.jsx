import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../../context/NotificationContext';
import { 
  Bell, Wrench, CheckCircle2, ArrowRight, X, Clock, AlertCircle, 
  Check, RotateCcw, XCircle, Sparkles 
} from 'lucide-react';

/**
 * NotificationPopup
 * Windows 11 Fluent style notification toast banner.
 * Auto-dismisses after 6s with animated progress bar.
 * Pauses on hover, supports swipe left/right to dismiss.
 */
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
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(100);

  const startCoordRef = useRef({ x: 0, y: 0, time: 0 });
  const cardRef = useRef(null);

  // Auto-dismiss duration: 6 seconds
  const DURATION = 6000;
  const remainingTimeRef = useRef(DURATION);
  const startTimeRef = useRef(Date.now());

  // Reset drag and timer state when activePopup changes
  useEffect(() => {
    setDragX(0);
    setIsDragging(false);
    setIsDismissing(false);
    setProgress(100);
    remainingTimeRef.current = DURATION;
    startTimeRef.current = Date.now();
  }, [activePopup?.id]);

  // Auto-dismiss countdown timer (pauses when user hovers or drags)
  useEffect(() => {
    if (!activePopup?.id) return;

    const interval = setInterval(() => {
      if (isHovered || isDragging) {
        startTimeRef.current = Date.now() - (DURATION - remainingTimeRef.current);
        return;
      }

      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, DURATION - elapsed);
      remainingTimeRef.current = remaining;
      setProgress((remaining / DURATION) * 100);

      if (remaining <= 0) {
        clearInterval(interval);
        dismissPopup(activePopup.id);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [activePopup?.id, isHovered, isDragging, dismissPopup]);

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

    if (Math.abs(diffX) > Math.abs(diffY)) {
      setDragX(diffX);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 70; // px to trigger dismiss
    if (Math.abs(dragX) > threshold) {
      const direction = dragX > 0 ? 'right' : 'left';
      setDismissDirection(direction);
      setIsDismissing(true);
      setTimeout(() => {
        dismissPopup(activePopup.id);
      }, 160);
    } else {
      setDragX(0);
    }
  };

  // Mouse drag support for desktop/trackpad
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
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
    if (Math.abs(dragX) > 70) {
      const direction = dragX > 0 ? 'right' : 'left';
      setDismissDirection(direction);
      setIsDismissing(true);
      setTimeout(() => {
        dismissPopup(activePopup.id);
      }, 160);
    } else {
      setDragX(0);
    }
  };

  const getIconAndColors = () => {
    switch (activePopup.type) {
      case 'assignment':
        return {
          icon: Wrench,
          bg: 'bg-[#182230]/95',
          border: 'border-emerald-500/40',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          badgeText: 'New Assignment',
          accent: 'text-emerald-400',
          progressColor: 'bg-emerald-500',
          buttonBg: 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold'
        };
      case 'resolved':
        return {
          icon: CheckCircle2,
          bg: 'bg-[#182230]/95',
          border: 'border-teal-500/40',
          badgeBg: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
          badgeText: 'Ticket Resolved',
          accent: 'text-teal-400',
          progressColor: 'bg-teal-500',
          buttonBg: 'bg-teal-600 hover:bg-teal-500 text-white font-bold'
        };
      case 'reopened':
        return {
          icon: RotateCcw,
          bg: 'bg-[#182230]/95',
          border: 'border-rose-500/40',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          badgeText: 'Ticket Reopened',
          accent: 'text-rose-400',
          progressColor: 'bg-rose-500',
          buttonBg: 'bg-rose-600 hover:bg-rose-500 text-white font-bold'
        };
      case 'reassigned':
        return {
          icon: RotateCcw,
          bg: 'bg-[#182230]/95',
          border: 'border-amber-500/40',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          badgeText: 'Job Reassigned',
          accent: 'text-amber-400',
          progressColor: 'bg-amber-500',
          buttonBg: 'bg-amber-600 hover:bg-amber-500 text-white font-bold'
        };
      case 'status_update':
        return {
          icon: AlertCircle,
          bg: 'bg-[#182230]/95',
          border: 'border-blue-500/40',
          badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
          badgeText: 'Status Update',
          accent: 'text-blue-400',
          progressColor: 'bg-blue-500',
          buttonBg: 'bg-blue-600 hover:bg-blue-500 text-white font-bold'
        };
      case 'new_ticket':
        return {
          icon: Bell,
          bg: 'bg-[#182230]/95',
          border: 'border-amber-500/40',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          badgeText: 'New Ticket',
          accent: 'text-amber-400',
          progressColor: 'bg-amber-500',
          buttonBg: 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold'
        };
      default:
        return {
          icon: Bell,
          bg: 'bg-[#182230]/95',
          border: 'border-slate-600/50',
          badgeBg: 'bg-slate-700/50 text-slate-300 border-slate-600/40',
          badgeText: 'Notification',
          accent: 'text-emerald-400',
          progressColor: 'bg-emerald-500',
          buttonBg: 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold'
        };
    }
  };

  const theme = getIconAndColors();
  const IconComponent = theme.icon;

  const currentTranslateX = isDismissing
    ? (dismissDirection === 'right' ? 440 : -440)
    : dragX;

  const currentOpacity = isDismissing
    ? 0
    : Math.max(0.3, 1 - Math.abs(dragX) / 260);

  return (
    <div 
      className="fixed right-3 sm:right-6 z-[99999] max-w-sm sm:max-w-md w-full animate-in slide-in-from-top-4 fade-in duration-200 pointer-events-auto select-none"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
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
        className={`${theme.bg} ${theme.border} border rounded-2xl shadow-2xl backdrop-blur-xl text-white transition-all cursor-grab active:cursor-grabbing relative overflow-hidden`}
      >
        {/* Swipe drag indicator */}
        {dragX !== 0 && (
          <div 
            className={`absolute inset-y-0 ${dragX > 0 ? 'left-3' : 'right-3'} flex items-center gap-1.5 text-xs font-bold pointer-events-none transition-opacity ${Math.abs(dragX) > 50 ? 'text-rose-400 opacity-100' : 'text-slate-400 opacity-60'}`}
          >
            <XCircle className="w-5 h-5 animate-pulse" />
            <span className="text-[10px] uppercase tracking-wider">Dismiss</span>
          </div>
        )}

        {/* Windows 11 App Header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/10 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-emerald-600 flex items-center justify-center text-white text-[10px] font-bold">
              ⚡
            </div>
            <span className="font-semibold text-slate-300 text-[11px] tracking-wide">Eco Green Support</span>
            <span className="text-slate-500">•</span>
            <span className="text-[10px] text-slate-400">Just now</span>
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 1 && (
              <button
                type="button"
                onClick={handleDismissAll}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-amber-300 hover:bg-white/10 transition-colors cursor-pointer"
                title="Dismiss all unread popups"
              >
                Clear all ({unreadCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => dismissPopup(activePopup.id)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Notification Body Content */}
        <div className="p-4 pt-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl bg-white/10 shrink-0 mt-0.5 border border-white/10`}>
              <IconComponent className={`w-4 h-4 ${theme.accent}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full border uppercase tracking-wider ${theme.badgeBg}`}>
                  {theme.badgeText}
                </span>
                {activePopup.ticketId && (
                  <span className="font-mono text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                    {activePopup.ticketId}
                  </span>
                )}
              </div>

              <h4 className="font-bold text-xs text-white leading-snug">
                {activePopup.title}
              </h4>

              <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                {activePopup.message}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/10">
            <span className="text-[10px] text-slate-400 font-mono">
              👈 Swipe to dismiss 👉
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMarkRead}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 px-2.5 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors font-medium cursor-pointer"
                title="Mark as read"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Mark Read</span>
              </button>
              <button
                type="button"
                onClick={handleOpenTicket}
                className={`flex items-center gap-1 px-3 py-1 rounded-xl text-xs shadow-xs transition-all active:scale-95 cursor-pointer ${theme.buttonBg}`}
              >
                <span>Open Ticket</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Windows-style auto-dismiss progress bar */}
        <div className="h-0.5 w-full bg-white/10">
          <div 
            className={`h-full ${theme.progressColor} transition-all duration-75 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
