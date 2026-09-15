import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  X, Bell, MessageSquare, Mail, RefreshCw, Trash2, CheckCheck, 
  ExternalLink, Sparkles, Send, ShieldAlert 
} from 'lucide-react';

export const NotificationDrawer = ({ isOpen, onClose }) => {
  const { unreadSimulatedCount, setUnreadSimulatedCount } = useAuth();
  const { confirm, showToast } = useDialog();
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all'); // all | whatsapp | email
  const [loading, setLoading] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  const fetchMessages = async () => {
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
    fetchMessages();

    // Listen to live Server-Sent Events (SSE)
    let eventSource;
    try {
      eventSource = new EventSource('/api/notifications/events');
      eventSource.onmessage = (event) => {
        try {
          const newMsg = JSON.parse(event.data);
          setMessages((prev) => [newMsg, ...prev.filter(m => m.id !== newMsg.id)]);
          setUnreadSimulatedCount((c) => c + 1);
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };
    } catch (e) {
      console.warn('SSE not supported or failed, falling back to polling');
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setUnreadSimulatedCount(0);
    }
  }, [isOpen]);

  const handleClear = async () => {
    const ok = await confirm({
      title: 'Clear Notifications?',
      message: 'Are you sure you want to clear all simulated notification logs?',
      type: 'danger',
      confirmText: 'Clear All'
    });
    if (!ok) return;

    await api.clearSimulatedNotifications();
    setMessages([]);
    setUnreadSimulatedCount(0);
    showToast('All notifications cleared', 'info');
  };

  const handleResend = async (logId) => {
    try {
      setResendingId(logId);
      await api.resendNotification(logId);
      await fetchMessages();
      showToast('Notification resent successfully', 'success');
    } catch (err) {
      showToast('Failed to resend: ' + err.message, 'error');
    } finally {
      setResendingId(null);
    }
  };

  if (!isOpen) return null;

  const filteredMessages = messages.filter(m => {
    if (filter === 'whatsapp') return m.channel === 'whatsapp';
    if (filter === 'email') return m.channel === 'email';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
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
              <div className="p-2 bg-emerald-700/80 rounded-lg">
                <Bell className="w-5 h-5 text-emerald-100" />
              </div>
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  Live Notification Center
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-600 text-emerald-100 tracking-wider">
                    Simulated & Live
                  </span>
                </h3>
                <p className="text-xs text-emerald-200">
                  Real-time WhatsApp & Email dispatch stream
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-emerald-700 rounded-lg text-emerald-200 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filter Bar */}
          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
            <div className="flex gap-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filter === 'all' ? 'bg-white shadow-xs text-emerald-800 font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({messages.length})
              </button>
              <button
                onClick={() => setFilter('whatsapp')}
                className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                  filter === 'whatsapp' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                WhatsApp ({messages.filter(m => m.channel === 'whatsapp').length})
              </button>
              <button
                onClick={() => setFilter('email')}
                className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                  filter === 'email' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email ({messages.filter(m => m.channel === 'email').length})
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={fetchMessages}
                disabled={loading}
                title="Refresh messages"
                className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleClear}
                title="Clear buffer"
                className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {filteredMessages.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-6 h-6" />
                </div>
                <h4 className="font-semibold text-slate-700 text-sm">No notification alerts yet</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                  Trigger an action such as registering a complaint, assigning a technician, or resolving a ticket to view live WhatsApp & Email notifications here.
                </p>
              </div>
            ) : (
              filteredMessages.map((msg) => (
                <div 
                  key={msg.id || msg.created_at} 
                  className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-slate-300"
                >
                  {/* Message Meta Header */}
                  <div className={`px-3 py-2 border-b flex items-center justify-between text-xs font-medium ${
                    msg.channel === 'whatsapp' 
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-100' 
                      : 'bg-blue-50 text-blue-900 border-blue-100'
                  }`}>
                    <div className="flex items-center gap-2">
                      {msg.channel === 'whatsapp' ? (
                        <span className="flex items-center gap-1 font-semibold text-emerald-700">
                          <MessageSquare className="w-3.5 h-3.5" />
                          WhatsApp Alert
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-blue-700">
                          <Mail className="w-3.5 h-3.5" />
                          Email Notification
                        </span>
                      )}
                      <span className="text-slate-400">•</span>
                      <span className="font-mono text-[11px] text-slate-600 truncate max-w-[140px]">
                        To: {msg.recipient}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                        msg.status === 'sent' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {msg.status}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-3.5 text-xs">
                    {msg.channel === 'whatsapp' ? (
                      <div className="bg-[#e7f8e8] p-3 rounded-lg border border-emerald-200 font-sans text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
                        {msg.rendered_content}
                        <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-emerald-700 font-medium">
                          <span>Delivered</span>
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {msg.subject && (
                          <div className="font-semibold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                            <span className="text-slate-500 font-normal">Subject:</span>
                            {msg.subject}
                          </div>
                        )}
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">
                          {msg.rendered_content}
                        </div>
                      </div>
                    )}

                    {/* Footer / Resend Actions */}
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
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

          {/* Bottom Info note */}
          <div className="p-3 bg-emerald-50/70 border-t border-emerald-100 text-[11px] text-emerald-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              Simulated notifications are fully recorded with identical templates to live Meta WhatsApp Cloud API and Nodemailer SMTP.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
