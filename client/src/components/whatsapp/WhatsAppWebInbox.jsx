import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  Search, Send, FileText, Paperclip, 
  CheckCheck, Check, Clock, Phone, User, Ticket,
  ExternalLink, RefreshCw, AlertCircle, ArrowLeft, Download,
  Maximize2, X, Filter, Smile, MoreVertical, MessageSquarePlus,
  FileCheck, Shield, ChevronRight
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
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'unlinked' | 'linked'
  const [previewMedia, setPreviewMedia] = useState(null);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Load conversation list
  const loadConversations = async (silent = false) => {
    if (!silent) setLoadingConversations(true);
    try {
      const res = await api.getWhatsAppConversations();
      const list = (res.conversations || []).filter(c => !c.last_message?.includes('rooftop solar system lagwaya'));
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
      // Clean out any fake seeds if present
      const cleanMsgs = (res.messages || []).filter(m => !m.wam_id?.startsWith('wam_seed_'));
      setMessages(cleanMsgs);
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
      setSelectedFile(null);
      setFilePreview(null);
    } else {
      setMessages([]);
      setContactInfo(null);
      setSelectedFile(null);
      setFilePreview(null);
    }
  }, [selectedPhone]);

  // Polling every 5 seconds for incoming WhatsApp messages
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations(true);
      if (selectedPhone) {
        loadMessages(selectedPhone, true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedPhone]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle file selection (Images & PDFs)
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 15MB
    if (file.size > 15 * 1024 * 1024) {
      showToast('File size exceeds 15MB limit', 'error');
      return;
    }

    setSelectedFile(file);

    // Create thumbnail preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setFilePreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle sending reply
  const handleSendReply = async (e) => {
    e?.preventDefault();
    if (!selectedPhone || (!replyText.trim() && !selectedFile)) return;

    try {
      setSendingReply(true);

      const res = await api.sendWhatsAppDirectReply(selectedPhone, replyText.trim(), selectedFile);

      // Optimistically append outgoing message to chat
      const newMsg = {
        id: res.messageId || Date.now(),
        phone: selectedPhone,
        sender_type: 'company',
        sender_name: currentUser?.name || 'Eco Green Support',
        message_body: replyText.trim(),
        media_url: res.mediaUrl || (filePreview || null),
        media_type: selectedFile ? (selectedFile.type.startsWith('image/') ? 'image' : 'document') : null,
        media_caption: selectedFile?.name || null,
        status: 'sent',
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, newMsg]);
      setReplyText('');
      handleClearSelectedFile();
      showToast('Message sent via WhatsApp Cloud API', 'success');

      // Refresh list to update snippet
      loadConversations(true);
    } catch (err) {
      console.error('Failed to send WhatsApp reply:', err);
      showToast('Failed to send: ' + err.message, 'error');
    } finally {
      setSendingReply(false);
    }
  };

  // Safe download helper for media
  const handleDownloadFile = async (url, filename) => {
    try {
      showToast('Starting download...', 'info');
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'whatsapp_document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(url, '_blank');
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    if (filterType === 'unlinked' && conv.complaint_id) return false;
    if (filterType === 'linked' && !conv.complaint_id) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (conv.sender_name && conv.sender_name.toLowerCase().includes(q)) ||
      (conv.phone && conv.phone.includes(q)) ||
      (conv.last_message && conv.last_message.toLowerCase().includes(q)) ||
      (conv.ticket_id && conv.ticket_id.toLowerCase().includes(q))
    );
  });

  const selectedConv = conversations.find(c => c.phone === selectedPhone);

  return (
    <div className="w-full flex-1 h-full flex overflow-hidden bg-[#efeae2]">
      {/* ================= LEFT SIDEBAR (CONVERSATIONS LIST) ================= */}
      <div className={`w-full md:w-[380px] lg:w-[420px] bg-white border-r border-[#d1d7db] flex flex-col h-full shrink-0 z-10 ${selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        {/* WhatsApp Top Header Bar */}
        <div className="bg-[#f0f2f5] px-4 py-2.5 flex items-center justify-between border-b border-[#d1d7db] shrink-0">
          <div className="flex items-center gap-3">
            {/* User Profile Avatar with Green Active Ring */}
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                EG
              </div>
              <span className="w-3 h-3 rounded-full bg-[#25d366] border-2 border-white absolute bottom-0 right-0" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#111b21] leading-tight flex items-center gap-1.5">
                <span>WhatsApp Web</span>
              </h2>
              <p className="text-[11px] text-[#667781] font-mono leading-tight">
                +91 78784 44414 (Official)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[#54656f]">
            <button
              type="button"
              onClick={() => loadConversations()}
              title="Refresh chats"
              className="p-2 hover:bg-[#e9edef] rounded-full transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loadingConversations ? 'animate-spin' : ''}`} />
            </button>
            <div className="w-px h-4 bg-[#d1d7db] mx-1" />
            <button
              type="button"
              title="WhatsApp status: Connected"
              className="p-1.5 text-[#00a884] rounded-full"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Filter Header */}
        <div className="bg-white p-2.5 border-b border-[#e9edef] space-y-2 shrink-0">
          {/* Authentic WhatsApp Search Box */}
          <div className="bg-[#f0f2f5] rounded-lg flex items-center px-3 py-1.5 transition-colors focus-within:bg-white focus-within:ring-1 focus-within:ring-[#00a884]">
            <Search className="w-4 h-4 text-[#54656f] mr-3 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or start new chat"
              className="w-full text-xs text-[#111b21] placeholder-[#8696a0] bg-transparent border-none outline-none font-normal"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-[#54656f] hover:text-[#111b21] ml-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all cursor-pointer ${
                filterType === 'all' 
                  ? 'bg-[#00a884] text-white shadow-2xs' 
                  : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
              }`}
            >
              All ({conversations.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('unlinked')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all cursor-pointer ${
                filterType === 'unlinked' 
                  ? 'bg-[#00a884] text-white shadow-2xs' 
                  : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
              }`}
            >
              General ({conversations.filter(c => !c.complaint_id).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('linked')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all cursor-pointer ${
                filterType === 'linked' 
                  ? 'bg-[#00a884] text-white shadow-2xs' 
                  : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
              }`}
            >
              Tickets ({conversations.filter(c => c.complaint_id).length})
            </button>
          </div>
        </div>

        {/* Conversations Scrollable List (WhatsApp Web replica item list) */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#f5f6f6] bg-white">
          {loadingConversations && conversations.length === 0 ? (
            <div className="p-8 text-center text-[#8696a0] text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#00a884]" />
              <span>Loading WhatsApp chats...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-[#8696a0] text-xs space-y-2">
              <p className="font-semibold text-[#111b21]">No chats found</p>
              <p className="text-[11px] text-[#667781] leading-relaxed">
                Messages from customers to <span className="font-semibold text-[#111b21]">+91 78784 44414</span> will appear here automatically.
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
                  className={`px-4 py-3 cursor-pointer transition-colors flex items-center gap-3 relative ${
                    isSelected ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6] bg-white'
                  }`}
                >
                  {/* WhatsApp Profile Avatar (49x49px) */}
                  <div className="w-12 h-12 rounded-full bg-[#dfe5e7] text-[#54656f] flex items-center justify-center font-bold text-base shrink-0 shadow-2xs">
                    {(conv.sender_name || 'U').charAt(0).toUpperCase()}
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-semibold text-sm text-[#111b21] truncate">
                        {conv.sender_name || `+${conv.phone}`}
                      </h4>
                      <span className="text-[11px] text-[#8696a0] shrink-0 ml-1 font-mono">
                        {formattedTime}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs text-[#667781] truncate flex items-center gap-1">
                        {conv.last_sender_type === 'company' && (
                          <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] shrink-0 inline" />
                        )}
                        <span className="truncate">{conv.last_message || 'Media attachment'}</span>
                      </p>

                      {/* Ticket Badge indicator */}
                      {hasTicket ? (
                        <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-mono text-[9px] font-bold shrink-0">
                          #{conv.ticket_id}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[9px] font-semibold shrink-0">
                          General
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ================= RIGHT MAIN CHAT AREA (WHATSAPP CHAT STREAM) ================= */}
      <div className={`flex-1 flex flex-col h-full bg-[#efeae2] relative overflow-hidden ${!selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        {selectedPhone ? (
          <>
            {/* Top WhatsApp Conversation Header */}
            <div className="bg-[#f0f2f5] px-4 py-2.5 border-b border-[#d1d7db] flex items-center justify-between z-10 shrink-0">
              <div className="flex items-center gap-3">
                {/* Mobile Back button */}
                <button
                  onClick={() => setSelectedPhone(null)}
                  className="md:hidden p-1 text-[#54656f] hover:text-[#111b21] rounded-full cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[#dfe5e7] text-[#54656f] flex items-center justify-center font-bold text-sm shadow-2xs">
                  {(contactInfo?.sender_name || selectedConv?.sender_name || 'U').charAt(0).toUpperCase()}
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-[#111b21] leading-tight">
                    {contactInfo?.sender_name || selectedConv?.sender_name || `+${selectedPhone}`}
                  </h3>
                  <p className="text-[11px] text-[#667781] leading-tight font-mono">
                    +${selectedPhone} • WhatsApp
                  </p>
                </div>
              </div>

              {/* Right Action: Clean Ticket details or Convert button */}
              <div className="flex items-center gap-2">
                {selectedConv?.complaint_id ? (
                  <button
                    type="button"
                    onClick={() => onOpenComplaint && onOpenComplaint(selectedConv.complaint_id)}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <Ticket className="w-3.5 h-3.5 text-blue-700" />
                    <span>Ticket #{selectedConv.ticket_id}</span>
                  </button>
                ) : (
                  <button
                    type="button"
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
                    className="px-3 py-1.5 bg-[#00a884] hover:bg-[#008f72] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    title="Register a new complaint for this customer prefilled with their phone & chat details"
                  >
                    <span>+ Convert to Ticket</span>
                  </button>
                )}
              </div>
            </div>

            {/* Main Messages Stream (WhatsApp Wallpaper Background) */}
            <div 
              className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#efeae2]"
              style={{
                backgroundImage: 'radial-gradient(#00000008 1px, transparent 1px)',
                backgroundSize: '16px 16px'
              }}
            >
              {/* Date Header Pill */}
              <div className="flex justify-center my-2">
                <span className="px-3 py-1 bg-white text-[#54656f] text-[11px] font-medium rounded-lg shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] uppercase tracking-wider">
                  Today
                </span>
              </div>

              {loadingMessages && messages.length === 0 ? (
                <div className="p-8 text-center text-[#8696a0] text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#00a884]" />
                  <span>Loading messages...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="p-12 text-center text-[#8696a0] text-xs bg-white/70 backdrop-blur-xs max-w-md mx-auto rounded-2xl shadow-xs border border-white/60">
                  <p className="font-semibold text-[#111b21] text-sm">No messages in this chat yet</p>
                  <p className="text-[11px] text-[#667781] mt-1">Send a greeting, photo, or document below to start the conversation.</p>
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
                      className={`flex ${isCustomer ? 'justify-start' : 'justify-end'} my-1`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[70%] px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] text-sm relative ${
                          isCustomer
                            ? 'bg-white text-[#111b21] rounded-lg rounded-tl-none'
                            : 'bg-[#d9fdd3] text-[#111b21] rounded-lg rounded-tr-none'
                        }`}
                      >
                        {/* Text Message */}
                        {msg.message_body && (
                          <p className="whitespace-pre-wrap break-words leading-relaxed select-text font-normal text-[13.5px]">
                            {msg.message_body}
                          </p>
                        )}

                        {/* Media Attachment: Image */}
                        {msg.media_url && (msg.media_type === 'image' || msg.media_type?.includes('image')) && (
                          <div className="mt-1.5 rounded-lg overflow-hidden border border-black/5 bg-black/5 relative group">
                            <img
                              src={msg.media_url}
                              alt="WhatsApp attachment"
                              onClick={() => setPreviewMedia({ url: msg.media_url, type: 'image' })}
                              className="max-h-64 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                            />
                            {/* Hover download button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadFile(msg.media_url, msg.media_caption || 'whatsapp_photo.jpg');
                              }}
                              title="Download Photo"
                              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors cursor-pointer shadow-md"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Media Attachment: Document (PDF / Doc) */}
                        {msg.media_url && msg.media_type !== 'image' && !msg.media_type?.includes('image') && (
                          <div className="mt-1.5">
                            <div className="flex items-center gap-2.5 p-2.5 bg-[#f0f2f5] rounded-lg text-xs font-medium border border-[#d1d7db]">
                              <FileText className="w-6 h-6 shrink-0 text-red-500" />
                              <span className="truncate flex-1 font-sans text-xs text-[#111b21] font-semibold">
                                {msg.media_caption || 'Document.pdf'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDownloadFile(msg.media_url, msg.media_caption || 'document.pdf')}
                                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-[#d1d7db] rounded-md flex items-center gap-1 text-[11px] font-bold text-[#111b21] cursor-pointer transition-colors shadow-2xs shrink-0"
                                title="Download Document"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Timestamp & Delivery Checkmarks */}
                        <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] mt-1 ml-4 select-none float-right">
                          <span>{timeStr}</span>
                          {!isCustomer && (
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Pending File Attachment Banner */}
            {selectedFile && (
              <div className="px-4 py-2 bg-[#f0f2f5] border-t border-[#d1d7db] flex items-center justify-between shrink-0 animate-in fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  {filePreview ? (
                    <img src={filePreview} alt="preview" className="w-10 h-10 rounded-lg object-cover border border-[#d1d7db] shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-emerald-700" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#111b21] truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-[#667781] font-mono">{(selectedFile.size / 1024).toFixed(1)} KB • Ready to send</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearSelectedFile}
                  className="p-1.5 text-[#54656f] hover:text-rose-600 rounded-full hover:bg-[#e9edef] transition-colors cursor-pointer"
                  title="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Bottom Reply Bar (WhatsApp Web replica input bar) */}
            <form onSubmit={handleSendReply} className="px-3 py-2 bg-[#f0f2f5] border-t border-[#d1d7db] flex items-center gap-2 shrink-0">
              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
              />

              {/* Emoji Smiley Button */}
              <button
                type="button"
                className="p-2 text-[#54656f] hover:text-[#111b21] rounded-full transition-colors cursor-pointer shrink-0"
                title="Emojis"
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* Paperclip Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sendingReply}
                className="p-2 text-[#54656f] hover:text-[#111b21] rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                title="Attach Document or Photo (PDF / JPG)"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={selectedFile ? `Add a caption or send ${selectedFile.name}...` : "Type a message"}
                className="flex-1 text-sm px-4 py-2 bg-white rounded-lg text-[#111b21] placeholder-[#8696a0] border-none outline-none focus:ring-0 shadow-2xs font-normal"
                disabled={sendingReply}
              />

              {/* WhatsApp Green Circular Send Button */}
              <button
                type="submit"
                disabled={sendingReply || (!replyText.trim() && !selectedFile)}
                className="w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#008f72] disabled:opacity-50 text-white flex items-center justify-center shrink-0 shadow-2xs transition-all cursor-pointer disabled:cursor-not-allowed"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          /* Empty State (WhatsApp Web native landing graphic) */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#f0f2f5] border-b-8 border-[#25d366]">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-md mb-4 text-[#00a884]">
              <Phone className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-[#111b21]">Eco Green WhatsApp Hub</h3>
            <p className="text-xs text-[#667781] max-w-sm mt-2 leading-relaxed">
              Send and receive messages with solar rooftop and water heater customers in real time. Select any conversation from the left to start chatting.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-[#8696a0] mt-6 font-mono">
              <Shield className="w-3.5 h-3.5 text-[#00a884]" />
              <span>End-to-end encrypted official Meta Cloud API</span>
            </div>
          </div>
        )}
      </div>

      {/* MEDIA PREVIEW MODAL (Zoomed View with Download Button) */}
      {previewMedia && (
        <div 
          onClick={() => setPreviewMedia(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -top-10 right-0 flex items-center gap-2">
              <button
                onClick={() => handleDownloadFile(previewMedia.url, 'whatsapp_photo.jpg')}
                className="px-3 py-1 bg-white/20 hover:bg-white/40 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
              <button
                onClick={() => setPreviewMedia(null)}
                className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <img
              src={previewMedia.url}
              alt="Zoomed attachment"
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </div>
  );
};
