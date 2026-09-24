import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useDialog } from '../../context/DialogContext';
import { 
  X, Bell, MessageSquare, Mail, RefreshCw, Trash2, CheckCheck, 
  ExternalLink, Sparkles, Send, ShieldAlert, Wrench, CheckCircle2, 
  AlertCircle, Clock, ArrowRight, UserCheck, Shield,
  ChevronDown, ChevronUp, Layers, RotateCcw, Check
} from 'lucide-react';

export const NotificationDrawer = ({ isOpen, onClose, onSelectComplaint }) => {
  const { currentUser, unreadSimulatedCount, setUnreadSimulatedCount } = useAuth();
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    clearNotifications,
    isUnread 
  } = useNotifications();
  const { confirm, showToast } = useDialog();

  const [activeMainTab, setActiveMainTab] = useState('inbox'); // inbox | dispatches
  const [inboxFilter, setInboxFilter] = useState('all'); // all | unread
  const [messages, setMessages] = useState([]);
  const [dispatchFilter, setDispatchFilter] = useState('all'); // all | whatsapp | email
  const [loading, setLoading] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  const fetchDispatches = async () => {
    try {
      setLoading(true);
      const data = await api.getSimulatedNotifications();
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load simulated messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDispatches();
      if (setUnreadSimulatedCount) setUnreadSimulatedCount(0);
    }
  }, [isOpen]);

  const handleClearDispatches = async () => {
    const ok = await confirm({
      title: 'Clear Outgoing Dispatches?',
      message: 'Are you sure you want to clear simulated dispatch logs?',
      type: 'danger',
      confirmText: 'Clear All'
    });
    if (!ok) return;

    await api.clearSimulatedNotifications();
    setMessages([]);
    if (setUnreadSimulatedCount) setUnreadSimulatedCount(0);
    showToast('Dispatch logs cleared', 'info');
  };

  const handleClearInApp = async () => {
    const ok = await confirm({
      title: 'Clear In-App Alerts?',
      message: 'Are you sure you want to clear all your in-app alerts?',
      type: 'danger',
      confirmText: 'Clear Alerts'
    });
    if (!ok) return;

    clearNotifications();
    showToast('In-app alerts cleared', 'info');
  };

  const handleResend = async (logId) => {
    try {
      setResendingId(logId);
      await api.resendNotification(logId);
      await fetchDispatches();
      showToast('Notification resent successfully', 'success');
    } catch (err) {
      showToast('Failed to resend: ' + err.message, 'error');
    } finally {
      setResendingId(null);
    }
  };

  const handleOpenTicket = (notif) => {
    markAsRead(notif.id);
    if (onSelectComplaint && (notif.ticketId || notif.complaintId)) {
      onSelectComplaint(notif.ticketId || notif.complaintId);
      if (onClose) onClose();
    }
  };

  // Filter in-app notifications
  const filteredInbox = notifications.filter(n => {
    if (inboxFilter === 'unread') return isUnread(n, currentUser);
    return true;
  });

  // Mobile-style Grouped Notification Accordion State
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (key, e) => {
    if (e) e.stopPropagation();
    setExpandedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Group notifications by complaint ticket (Mobile Stacking)
  const groupedInbox = React.useMemo(() => {
    const map = new Map();
    const list = [];

    filteredInbox.forEach(notif => {
      const key = notif.ticketId || (notif.complaintId ? `C-${notif.complaintId}` : null);
      if (key) {
        if (!map.has(key)) {
          const grp = {
            key,
            ticketId: notif.ticketId,
            complaintId: notif.complaintId,
            customerName: notif.customerName,
            items: [notif],
            latestNotif: notif,
            unreadCount: isUnread(notif, currentUser) ? 1 : 0
          };
          map.set(key, grp);
          list.push(grp);
        } else {
          const grp = map.get(key);
          grp.items.push(notif);
          if (isUnread(notif, currentUser)) {
            grp.unreadCount += 1;
          }
          if (new Date(notif.createdAt) > new Date(grp.latestNotif.createdAt)) {
            grp.latestNotif = notif;
          }
          if (!grp.customerName && notif.customerName) {
            grp.customerName = notif.customerName;
          }
        }
      } else {
        // Standalone notification
        list.push({
          key: notif.id,
          ticketId: null,
          items: [notif],
          latestNotif: notif,
          unreadCount: isUnread(notif, currentUser) ? 1 : 0
        });
      }
    });

    return list;
  }, [filteredInbox, currentUser, isUnread]);

  // Filter dispatches
  const filteredDispatches = messages.filter(m => {
    if (dispatchFilter === 'whatsapp') return m.channel === 'whatsapp';
    if (dispatchFilter === 'email') return m.channel === 'email';
    return true;
  });

  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'Just now';
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return new Date(isoString).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch (_) {
      return 'Recent';
    }
  };

  const getNotificationBadge = (type) => {
    switch (type) {
      case 'assignment':
        return {
          icon: Wrench,
          label: 'Assignment',
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-200'
        };
      case 'resolved':
        return {
          icon: CheckCircle2,
          label: 'Resolved',
          bg: 'bg-teal-100 text-teal-800 border-teal-200'
        };
      case 'reopened':
        return {
          icon: RotateCcw,
          label: 'Reopened',
          bg: 'bg-rose-100 text-rose-800 border-rose-200'
        };
      case 'status_update':
        return {
          icon: AlertCircle,
          label: 'Status Update',
          bg: 'bg-blue-100 text-blue-800 border-blue-200'
        };
      case 'note':
        return {
          icon: MessageSquare,
          label: 'Follow-up Note',
          bg: 'bg-purple-100 text-purple-800 border-purple-200'
        };
      case 'new_ticket':
        return {
          icon: Bell,
          label: 'New Ticket',
          bg: 'bg-amber-100 text-amber-800 border-amber-200'
        };
      default:
        return {
          icon: Bell,
          label: 'Alert',
          bg: 'bg-slate-100 text-slate-800 border-slate-200'
        };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md md:max-w-lg bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 bg-emerald-800 text-white flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-700/80 rounded-xl relative">
                <Bell className="w-5 h-5 text-emerald-100" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-emerald-800 animate-pulse" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  Notification Center
                  {unreadCount > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 shadow-2xs">
                      {unreadCount} Unread
                    </span>
                  )}
                </h3>
                <p className="text-xs text-emerald-200 flex items-center gap-1.5 mt-0.5">
                  <span>Logged in as:</span>
                  <strong className="text-white font-semibold capitalize">{currentUser?.name || currentUser?.role}</strong>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-700 text-emerald-100 uppercase font-mono">
                    {currentUser?.role === 'technician' ? 'Technician' : currentUser?.role}
                  </span>
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-emerald-700 rounded-xl text-emerald-200 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Master Tab Switcher */}
          <div className="grid grid-cols-2 bg-slate-100 p-1 border-b border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setActiveMainTab('inbox')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeMainTab === 'inbox' 
                  ? 'bg-white text-emerald-900 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-emerald-600" />
              <span>In-App Alerts</span>
              {unreadCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveMainTab('dispatches')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeMainTab === 'dispatches' 
                  ? 'bg-white text-emerald-900 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp & Email Logs</span>
            </button>
          </div>

          {/* ================= TAB 1: IN-APP ALERTS ================= */}
          {activeMainTab === 'inbox' && (
            <>
              {/* Filter & Bulk Actions Bar */}
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setInboxFilter('all')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      inboxFilter === 'all' 
                        ? 'bg-white text-emerald-800 font-bold shadow-2xs border border-slate-200' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    onClick={() => setInboxFilter('unread')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      inboxFilter === 'unread' 
                        ? 'bg-white text-emerald-800 font-bold shadow-2xs border border-slate-200' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Unread ({unreadCount})
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      title="Mark all as read"
                      className="flex items-center gap-1 px-2 py-1 text-emerald-700 hover:bg-emerald-50 rounded font-semibold transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Mark all read</span>
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={handleClearInApp}
                      title="Clear alerts"
                      className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* In-App Notifications Feed */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-slate-50">
                {groupedInbox.length === 0 ? (
                  <div className="text-center py-16 px-4">
                    <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      <Bell className="w-6 h-6" />
                    </div>
                    <h4 className="font-semibold text-slate-700 text-sm">
                      {inboxFilter === 'unread' ? 'No unread notifications' : 'No notification alerts yet'}
                    </h4>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                      {currentUser?.role === 'technician'
                        ? 'When staff or admin assigns a complaint to you, live alerts and badges will appear right here.'
                        : 'When technicians update ticket progress, add visit notes, or resolve issues, live alerts will appear here.'}
                    </p>
                  </div>
                ) : (
                  groupedInbox.map((group) => {
                    // CASE 1: Standalone or Single Notification
                    if (group.items.length === 1) {
                      const notif = group.latestNotif;
                      const unread = isUnread(notif, currentUser);
                      const badge = getNotificationBadge(notif.type);
                      const BadgeIcon = badge.icon;

                      return (
                        <div
                          key={notif.id}
                          onClick={() => handleOpenTicket(notif)}
                          className={`group relative p-3.5 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
                            unread 
                              ? 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-400 hover:shadow-xs' 
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Unread indicator beacon */}
                          {unread && (
                            <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Unread</span>
                            </div>
                          )}

                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-xl border shrink-0 mt-0.5 ${badge.bg}`}>
                              <BadgeIcon className="w-4 h-4" />
                            </div>

                            <div className="flex-1 min-w-0 pr-12">
                              {/* Type tag & Ticket ID */}
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                                  {badge.label}
                                </span>
                                {notif.ticketId && (
                                  <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    {notif.ticketId}
                                  </span>
                                )}
                              </div>

                              <h5 className="font-bold text-xs text-slate-900 leading-snug">
                                {notif.title}
                              </h5>

                              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                {notif.message}
                              </p>

                              {/* Meta footer: Actor, Timestamp, View CTA */}
                              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>{formatRelativeTime(notif.createdAt)}</span>
                                  {notif.performedByName && (
                                    <>
                                      <span>•</span>
                                      <span className="text-slate-600 font-medium">By {notif.performedByName}</span>
                                    </>
                                  )}
                                </div>

                                <span className="text-emerald-700 font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-[11px]">
                                  <span>Open Ticket</span>
                                  <ArrowRight className="w-3 h-3" />
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // CASE 2: Group of Multiple Notifications for the Same Ticket (Mobile-Style Accordion Stack)
                    const isExpanded = !!expandedGroups[group.key];
                    const hasUnread = group.unreadCount > 0;
                    const latestBadge = getNotificationBadge(group.latestNotif.type);
                    const LatestIcon = latestBadge.icon;

                    return (
                      <div
                        key={group.key}
                        className={`group relative rounded-2xl border transition-all shadow-xs ${
                          hasUnread 
                            ? 'bg-gradient-to-br from-emerald-50/90 to-teal-50/60 border-emerald-300' 
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* Mobile stacked visual shadow layer beneath card when collapsed */}
                        {!isExpanded && (
                          <>
                            <div className="absolute -bottom-1 left-2.5 right-2.5 h-2 bg-slate-200/60 border border-slate-300/60 rounded-b-xl -z-10" />
                            <div className="absolute -bottom-2 left-5 right-5 h-2 bg-slate-100/40 border border-slate-200/40 rounded-b-xl -z-20" />
                          </>
                        )}

                        {/* Stack Header / Clickable Summary */}
                        <div
                          onClick={(e) => toggleGroup(group.key, e)}
                          className="p-3.5 cursor-pointer flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-800 text-white text-[11px] font-mono font-bold shadow-2xs">
                                <Layers className="w-3.5 h-3.5 text-emerald-200" />
                                <span>{group.ticketId || 'Complaint Updates'}</span>
                              </div>
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                {group.items.length} Updates
                              </span>
                              {hasUnread && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 animate-pulse shadow-2xs">
                                  {group.unreadCount} Unread
                                </span>
                              )}
                            </div>

                            {/* Expand / Collapse Button */}
                            <button
                              type="button"
                              onClick={(e) => toggleGroup(group.key, e)}
                              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-emerald-700 transition-colors flex items-center gap-1 text-xs font-bold shrink-0 cursor-pointer"
                            >
                              <span className="text-[11px]">{isExpanded ? 'Collapse' : `View all (${group.items.length})`}</span>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-700" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
                            </button>
                          </div>

                          {/* Customer Name */}
                          {group.customerName && (
                            <div className="text-xs font-bold text-slate-800">
                              <span>Customer: {group.customerName}</span>
                            </div>
                          )}

                          {/* Preview of latest action */}
                          <div className="text-xs text-slate-600 flex items-start gap-2 bg-white/80 p-2 rounded-xl border border-slate-100/80 shadow-2xs">
                            <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${latestBadge.bg}`}>
                              <LatestIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-900 truncate text-xs">{group.latestNotif.title}</p>
                              <p className="text-[11px] text-slate-500 line-clamp-1">{group.latestNotif.message}</p>
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0">{formatRelativeTime(group.latestNotif.createdAt)}</span>
                          </div>

                          {/* Footer Action Bar */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100/80 text-[11px]">
                            <span className="text-slate-400 font-medium text-[10px]">
                              {isExpanded ? 'Click box to collapse' : `Tap to expand all ${group.items.length} ticket updates`}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTicket(group.latestNotif);
                              }}
                              className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <span>Open Ticket</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* EXPANDED INNER LIST (Mobile Notification Drawer Accordion Style) */}
                        {isExpanded && (
                          <div className="p-3 pt-0 border-t border-slate-100 bg-slate-50/70 rounded-b-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="py-2 flex items-center justify-between text-[11px] text-slate-500 font-semibold border-b border-slate-200/60 mb-2.5">
                              <span>Complaint Timeline Updates ({group.items.length}):</span>
                              {hasUnread && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    group.items.forEach(item => markAsRead(item.id));
                                  }}
                                  className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <CheckCheck className="w-3 h-3" />
                                  <span>Mark ticket updates read</span>
                                </button>
                              )}
                            </div>

                            <div className="space-y-2 relative before:absolute before:top-2 before:bottom-2 before:left-3 before:w-0.5 before:bg-emerald-300 pl-0.5">
                              {group.items.map((notif, idx) => {
                                const itemUnread = isUnread(notif, currentUser);
                                const badge = getNotificationBadge(notif.type);
                                const ItemIcon = badge.icon;

                                return (
                                  <div
                                    key={notif.id || idx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenTicket(notif);
                                    }}
                                    className={`relative pl-7 p-2.5 rounded-xl border transition-all cursor-pointer ${
                                      itemUnread
                                        ? 'bg-emerald-50/90 border-emerald-300 hover:bg-emerald-100/70'
                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    {/* Dot on vertical timeline line */}
                                    <div className={`absolute left-2.5 top-3.5 w-3 h-3 rounded-full border-2 border-white -translate-x-1/2 flex items-center justify-center ${badge.bg}`}>
                                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                                    </div>

                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${badge.bg}`}>
                                          {badge.label}
                                        </span>
                                        {itemUnread && (
                                          <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-200/80 px-1.5 py-0.2 rounded">
                                            NEW
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-slate-400 shrink-0">
                                        {formatRelativeTime(notif.createdAt)}
                                      </span>
                                    </div>

                                    <h6 className="font-bold text-xs text-slate-900 mt-1 leading-snug">
                                      {notif.title}
                                    </h6>
                                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                                      {notif.message}
                                    </p>

                                    <div className="mt-1.5 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                                      <span>By {notif.performedByName || 'System'}</span>
                                      <span className="text-emerald-700 font-bold flex items-center gap-0.5 hover:underline">
                                        <span>Open</span>
                                        <ArrowRight className="w-2.5 h-2.5" />
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* ================= TAB 2: WHATSAPP & EMAIL LOGS ================= */}
          {activeMainTab === 'dispatches' && (
            <>
              {/* Filter Bar */}
              <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                <div className="flex gap-1">
                  <button
                    onClick={() => setDispatchFilter('all')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      dispatchFilter === 'all' ? 'bg-white shadow-xs text-emerald-800 font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({messages.length})
                  </button>
                  <button
                    onClick={() => setDispatchFilter('whatsapp')}
                    className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-colors ${
                      dispatchFilter === 'whatsapp' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" />
                    WhatsApp ({messages.filter(m => m.channel === 'whatsapp').length})
                  </button>
                  <button
                    onClick={() => setDispatchFilter('email')}
                    className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-colors ${
                      dispatchFilter === 'email' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Mail className="w-3 h-3" />
                    Email ({messages.filter(m => m.channel === 'email').length})
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={fetchDispatches}
                    disabled={loading}
                    title="Refresh logs"
                    className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleClearDispatches}
                    title="Clear buffer"
                    className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                {filteredDispatches.length === 0 ? (
                  <div className="text-center py-16 px-4">
                    <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <h4 className="font-semibold text-slate-700 text-sm">No outgoing dispatches yet</h4>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                      Automated WhatsApp and Email dispatches sent to customers & engineers appear here.
                    </p>
                  </div>
                ) : (
                  filteredDispatches.map((msg) => (
                    <div 
                      key={msg.id || msg.created_at} 
                      className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-slate-300"
                    >
                      <div className={`px-3 py-2 border-b flex items-center justify-between text-xs font-medium ${
                        msg.channel === 'whatsapp' 
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-100' 
                          : 'bg-blue-50 text-blue-900 border-blue-100'
                      }`}>
                        <div className="flex items-center gap-2">
                          {msg.channel === 'whatsapp' ? (
                            <span className="flex items-center gap-1 font-semibold text-emerald-700">
                              <MessageSquare className="w-3.5 h-3.5" />
                              WhatsApp
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-semibold text-blue-700">
                              <Mail className="w-3.5 h-3.5" />
                              Email
                            </span>
                          )}
                          <span className="text-slate-400">•</span>
                          <span className="font-mono text-[11px] text-slate-600 truncate max-w-[140px]">
                            {msg.recipient}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                            msg.status === 'sent' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {msg.status}
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 text-xs">
                        <div className="bg-[#e7f8e8] p-3 rounded-lg border border-emerald-200 font-sans text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
                          {msg.rendered_content}
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Provider: <strong className="text-slate-700">{msg.provider || 'SIMULATED'}</strong>
                          </span>

                          {msg.id && (
                            <button
                              onClick={() => handleResend(msg.id)}
                              disabled={resendingId === msg.id}
                              className="flex items-center gap-1 px-2 py-1 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${resendingId === msg.id ? 'animate-spin' : ''}`} />
                              Resend
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* Bottom Info Footer */}
          <div className="p-3 bg-emerald-50/70 border-t border-emerald-100 text-[11px] text-emerald-900 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Real-time In-App & WhatsApp sync</span>
            </span>
            {activeMainTab === 'inbox' && (
              <span className="text-[10px] text-emerald-700 font-bold">
                Click any alert to open ticket
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
