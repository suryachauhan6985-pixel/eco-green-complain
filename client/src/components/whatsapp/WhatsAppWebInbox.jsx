import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  MessageSquare, Search, Send, Image, FileText, Paperclip, 
  CheckCheck, Check, Clock, Phone, User, Ticket, PlusCircle,
  ExternalLink, RefreshCw, AlertCircle, ArrowLeft, Download,
  Maximize2, X, Sparkles, Filter, ChevronRight
} from 'lucide-react';

export const WhatsAppWebInbox = ({ onOpenComplaint, onNewComplaintWithData }) => {
  const { currentUser } = useAuth();
  const { showToast } = useDialog();

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [contactInfo, setContactInfo] = useState(null);

  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'unlinked' | 'linked'
  const [previewMedia, setPreviewMedia] = useState(null);

  const messagesEndRef = useRef(null);

  // Load conversation list
  const loadConversations = async (silent = false) => {
    if (!silent) setLoadingConversations(true);
    try {
      const res = await api.getWhatsAppConversations();
      const list = res.conversations || [];
      setConversations(list);

      // Default select first conversation if none selected
      if (!selectedPhone && list.length > 0) {
        setSelectedPhone(list[0].phone);
      }
    } catch (err) {
      console.error('Failed to load WhatsApp conversations:', err);
      if (!silent) showToast('Could not load WhatsApp chats: ' + err.message, 'error');
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  };

  // Load messages for the selected phone
  const loadMessages = async (phone, silent = false) => {
    if (!phone) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await api.getWhatsAppChatHistory(phone);
      setMessages(res.messages || []);
      setContactInfo(res.contact || null);
    } catch (err) {
      console.error('Failed to load messages for phone:', phone, err);
      if (!silent) showToast('Failed to load messages: ' + err.message, 'error');
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadConversations();
  }, []);

  // When selectedPhone changes, load its message thread
  useEffect(() => {
    if (selectedPhone) {
      loadMessages(selectedPhone);
    } else {
      setMessages([]);
      setContactInfo(null);
    }
  }, [selectedPhone]);

  // Periodic polling every 4 seconds for live chat updates
  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations(true);
      if (selectedPhone) {
        loadMessages(selectedPhone, true);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedPhone]);

  // Scroll to bottom of message thread
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle sending reply
  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedPhone || sendingReply) return;

    try {
      setSendingReply(true);
      const textToSend = replyText.trim();
      setReplyText('');

      // Optimistic message append
      const tempMsg = {
        id: 'temp-' + Date.now(),
        phone: selectedPhone,
        sender_type: 'company',
        sender_name: currentUser?.name || 'Staff Support',
        message_body: textToSend,
        created_at: new Date().toISOString(),
        status: 'sending'
      };
      setMessages(prev => [...prev, tempMsg]);

      const res = await api.sendWhatsAppDirectReply(selectedPhone, textToSend);
      if (res.success) {
        loadMessages(selectedPhone, true);
        loadConversations(true);
      } else {
        showToast(res.error || 'Failed to send WhatsApp message', 'error');
      }
    } catch (err) {
      showToast('Error sending message: ' + err.message, 'error');
    } finally {
      setSendingReply(false);
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter(c => {
    const matchesSearch = 
      (c.sender_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone || '').includes(searchQuery) ||
      (c.ticket_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.last_message || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'unlinked') return !c.complaint_id;
    if (filterType === 'linked') return Boolean(c.complaint_id);
    return true;
  });

  const selectedConv = conversations.find(c => c.phone === selectedPhone);

  return (
    <div className="h-[calc(100vh-8.5rem)] min-h-[550px] bg-white rounded-2xl border border-slate-200 shadow-sm flex overflow-hidden">
      {/* LEFT SIDEBAR: Conversation list (WhatsApp Web style) */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50 ${selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-3.5 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Official WhatsApp</h2>
              <p className="text-[11px] text-slate-500 font-medium">+91 78784 44414 (Meta API)</p>
            </div>
          </div>
          <button 
            onClick={() => loadConversations()} 
            title="Refresh Chats"
            className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loadingConversations ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-2.5 bg-white border-b border-slate-200 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chat or phone..."
              className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-slate-100 focus:bg-white border border-transparent focus:border-emerald-500 rounded-xl focus:outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterType('all')}
              className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                filterType === 'all' 
                  ? 'bg-emerald-600 text-white shadow-2xs' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({conversations.length})
            </button>
            <button
              onClick={() => setFilterType('unlinked')}
              className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                filterType === 'unlinked' 
                  ? 'bg-amber-600 text-white shadow-2xs' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              General ({conversations.filter(c => !c.complaint_id).length})
            </button>
            <button
              onClick={() => setFilterType('linked')}
              className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                filterType === 'linked' 
                  ? 'bg-blue-600 text-white shadow-2xs' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tickets ({conversations.filter(c => c.complaint_id).length})
            </button>
          </div>
        </div>

        {/* Conversations Scrollable List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingConversations && conversations.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
              <span>Loading WhatsApp chats...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300 opacity-60" />
              <p className="font-semibold text-slate-600">No chats found</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Any customer who messages <span className="font-semibold">+91 78784 44414</span> will appear here automatically.
              </p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = conv.phone === selectedPhone;
              const hasTicket = Boolean(conv.complaint_id);
              const formattedTime = conv.last_activity 
                ? new Date(conv.last_activity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div
                  key={conv.phone}
                  onClick={() => setSelectedPhone(conv.phone)}
                  className={`p-3 cursor-pointer transition-colors flex items-start gap-3 relative ${
                    isSelected ? 'bg-emerald-50/80 border-r-4 border-emerald-600' : 'hover:bg-slate-100/70 bg-white'
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    hasTicket 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {hasTicket ? (
                      <Ticket className="w-5 h-5 text-blue-700" />
                    ) : (
                      (conv.sender_name || 'U').charAt(0).toUpperCase()
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {conv.sender_name || `+${conv.phone}`}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                        {formattedTime}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-mono text-[10px] text-slate-500">
                        +{conv.phone}
                      </span>
                      {hasTicket ? (
                        <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-mono text-[9px] font-bold">
                          #{conv.ticket_id}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                          General
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-600 truncate">
                      {conv.last_sender_type === 'company' && (
                        <span className="text-emerald-700 font-semibold mr-1">You:</span>
                      )}
                      {conv.last_message || '[Media File]'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT MAIN CHAT AREA */}
      <div className={`flex-1 flex flex-col bg-[#efeae2]/30 relative ${!selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        {selectedPhone ? (
          <>
            {/* Top Chat Header */}
            <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                {/* Back button for mobile */}
                <button
                  onClick={() => setSelectedPhone(null)}
                  className="md:hidden p-1 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                  {(contactInfo?.sender_name || selectedConv?.sender_name || 'U').charAt(0).toUpperCase()}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">
                      {contactInfo?.sender_name || selectedConv?.sender_name || `+${selectedPhone}`}
                    </h3>
                    {selectedConv?.complaint_id ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
                        <Ticket className="w-3 h-3 text-blue-600" />
                        Ticket: {selectedConv.ticket_id}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        General Contact (No Ticket)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    +{selectedPhone} • Official WhatsApp Business Chat
                  </p>
                </div>
              </div>

              {/* Action Buttons: Open Complaint or Convert to Complaint */}
              <div className="flex items-center gap-2">
                {selectedConv?.complaint_id ? (
                  <button
                    onClick={() => onOpenComplaint && onOpenComplaint(selectedConv.complaint_id)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View Ticket Details</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (onNewComplaintWithData) {
                        const firstCustMsg = messages.find(m => m.sender_type === 'customer');
                        onNewComplaintWithData({
                          customer_name: contactInfo?.sender_name || selectedConv?.sender_name || '',
                          customer_phone: selectedPhone.replace(/^91/, ''),
                          issue_description: firstCustMsg?.message_body || 'Customer contacted via WhatsApp'
                        });
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Create Complaint Ticket</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notice banner for general conversations */}
            {!selectedConv?.complaint_id && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    This customer does not have an active complaint ticket registered. All documents and chats received are preserved here.
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (onNewComplaintWithData) {
                      const firstCustMsg = messages.find(m => m.sender_type === 'customer');
                      onNewComplaintWithData({
                        customer_name: contactInfo?.sender_name || selectedConv?.sender_name || '',
                        customer_phone: selectedPhone.replace(/^91/, ''),
                        issue_description: firstCustMsg?.message_body || 'Customer contacted via WhatsApp'
                      });
                    }
                  }}
                  className="font-bold underline text-amber-800 hover:text-amber-950 shrink-0 cursor-pointer"
                >
                  Convert to Complaint →
                </button>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMessages && messages.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                  <span>Loading messages...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 text-slate-300 opacity-60" />
                  <p className="font-semibold text-slate-600">No messages in this chat yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">Send a greeting message below to begin conversation.</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isCustomer = msg.sender_type === 'customer';
                  const timeStr = msg.created_at
                    ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '';

                  return (
                    <div
                      key={msg.id || idx}
                      className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[80%] sm:max-w-[70%] rounded-2xl p-3 shadow-2xs ${
                          isCustomer
                            ? 'bg-white text-slate-900 border border-slate-200 rounded-tl-xs'
                            : 'bg-emerald-700 text-white rounded-tr-xs'
                        }`}
                      >
                        {/* Sender Label */}
                        <div className="flex items-center justify-between gap-3 text-[10px] font-bold mb-1 opacity-80">
                          <span>{isCustomer ? (msg.sender_name || 'Customer') : (msg.sender_name || 'Eco Green Support')}</span>
                          <span className="font-normal text-[9px]">{timeStr}</span>
                        </div>

                        {/* Text Body */}
                        {msg.message_body && (
                          <p className="text-xs whitespace-pre-wrap break-words leading-relaxed">
                            {msg.message_body}
                          </p>
                        )}

                        {/* Media: Image */}
                        {msg.media_url && (msg.media_type === 'image' || msg.media_type?.includes('image')) && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-black/10 bg-black/5">
                            <img
                              src={msg.media_url}
                              alt="WhatsApp attachment"
                              onClick={() => setPreviewMedia({ url: msg.media_url, type: 'image' })}
                              className="max-h-60 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                            />
                            {msg.media_caption && (
                              <p className="p-2 text-[11px] italic">{msg.media_caption}</p>
                            )}
                          </div>
                        )}

                        {/* Media: Document (PDF) */}
                        {msg.media_url && (msg.media_type === 'document' || msg.media_type?.includes('pdf')) && (
                          <div className="mt-2">
                            <a
                              href={msg.media_url}
                              target="_blank"
                              rel="noreferrer"
                              className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold border transition-colors ${
                                isCustomer
                                  ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
                                  : 'bg-emerald-800/80 hover:bg-emerald-800 border-emerald-600 text-white'
                              }`}
                            >
                              <FileText className="w-5 h-5 shrink-0" />
                              <span className="truncate flex-1 font-mono text-[11px]">
                                {msg.media_caption || 'Download Document (PDF)'}
                              </span>
                              <Download className="w-4 h-4 shrink-0 opacity-80" />
                            </a>
                          </div>
                        )}

                        {/* Status Checkmark */}
                        {!isCustomer && (
                          <div className="flex items-center justify-end gap-1 mt-1 text-[9px] opacity-75">
                            <span>{msg.status || 'sent'}</span>
                            <CheckCheck className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Reply Box */}
            <form onSubmit={handleSendReply} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Type a message to +${selectedPhone}...`}
                className="flex-1 text-xs px-4 py-2.5 bg-slate-100 hover:bg-slate-50 focus:bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                disabled={sendingReply}
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>{sendingReply ? 'Sending...' : 'Send'}</span>
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-base text-slate-800">Eco Green WhatsApp Hub</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Select any conversation from the left to view customer messages, photos, and documents in real-time, or reply directly.
            </p>
          </div>
        )}
      </div>

      {/* MEDIA PREVIEW MODAL */}
      {previewMedia && (
        <div 
          onClick={() => setPreviewMedia(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setPreviewMedia(null)}
              className="absolute -top-10 right-0 p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewMedia.url}
              alt="Zoomed attachment"
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
