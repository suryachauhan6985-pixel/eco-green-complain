import React, { useState, useEffect, useRef } from 'react';
import { api, getPermanentWhatsAppMessages, saveWhatsAppMessagesPermanently } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  Search, Send, FileText, Paperclip, 
  CheckCheck, Check, Clock, Phone, User, Ticket,
  ExternalLink, RefreshCw, AlertCircle, ArrowLeft, Download,
  Maximize2, X, Filter, Smile, MoreVertical, MessageSquarePlus,
  FileCheck, Shield, ChevronRight, Video, Mic, Pin, Compass,
  Users, Sparkles, Settings, MessageSquare, Radio, Copy,
  Volume2, VolumeX, Plus, CheckCircle2, Wrench, ShieldCheck,
  Edit2
} from 'lucide-react';

const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '🤗', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲'],
  'Solar & Work': ['☀️', '⚡', '🔋', '🔌', '💡', '🔧', '🔨', '🛠️', '⚙️', '🧰', '📐', '📋', '📝', '📄', '📑', '📍', '🏢', '🏠', '🏡', '🚚', '🚗', '🛵', '📞', '📱', '💬', '✅', '❌', '⚠️', '🚨', '💰', '💵', '₹', '⭐'],
  'Gestures': ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '👏', '🙌', '👐', '🤲', '💪']
};

// Helper: Ensure SQLite UTC timestamps are converted to local browser time (e.g. IST)
function parseToLocalDate(dateInput) {
  if (!dateInput) return null;
  let dStr = String(dateInput).trim();
  // If 'YYYY-MM-DD HH:MM:SS' without timezone, treat as UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dStr)) {
    dStr = dStr.replace(' ', 'T') + 'Z';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dStr)) {
    dStr = dStr + 'Z';
  }
  const d = new Date(dStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatWhatsAppTime(dateInput) {
  if (!dateInput) return '';
  const d = parseToLocalDate(dateInput);
  if (!d) return String(dateInput);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatWhatsAppListTime(dateInput) {
  if (!dateInput) return 'Recent';
  const d = parseToLocalDate(dateInput);
  if (!d) return String(dateInput);

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (isYesterday) {
    return 'Yesterday';
  }
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export const WhatsAppWebInbox = ({ 
  onOpenComplaint, 
  onNewComplaintWithData, 
  initialTarget, 
  onClearInitialTarget 
}) => {
  const { currentUser } = useAuth();
  const { confirm, alert, showToast } = useDialog();

  // Active chat state
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [contactInfo, setContactInfo] = useState(null);

  // Message compose state
  const [replyText, setReplyText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | 'favorites' | 'groups'
  const [previewMedia, setPreviewMedia] = useState(null);

  // Interactive Controls state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeEmojiTab, setActiveEmojiTab] = useState('Smileys');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showSidebarMenu, setShowSidebarMenu] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
  const [editedContactName, setEditedContactName] = useState('');
  const [savingContactName, setSavingContactName] = useState(false);

  // Sound notification preference
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('egs_wa_sound') !== 'false';
  });

  // New Chat Modal state
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [newChatMessage, setNewChatMessage] = useState('Namaste, greetings from Eco Green Solar! How can we assist you today?');
  const [newChatVerifying, setNewChatVerifying] = useState(false);
  const [newChatVerification, setNewChatVerification] = useState(null);
  const [startingChat, setStartingChat] = useState(false);
  const [recentComplaintsList, setRecentComplaintsList] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const previousMessageCountRef = useRef(0);

  // Synthesize notification chime using Web Audio API
  const playNotificationChime = () => {
    try {
      if (!soundEnabled) return;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('egs_wa_sound', String(next));
    if (next) playNotificationChime();
  };

  // Close open popups when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('#header-menu-container') && !e.target.closest('#header-menu-button')) {
        setShowHeaderMenu(false);
      }
      if (!e.target.closest('#sidebar-menu-container') && !e.target.closest('#sidebar-menu-button')) {
        setShowSidebarMenu(false);
      }
      if (!e.target.closest('#emoji-picker-container') && !e.target.closest('#emoji-picker-button')) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Load conversation list from server
  const loadConversations = async (silent = false) => {
    if (!silent) setLoadingConversations(true);
    try {
      const res = await api.getWhatsAppConversations();
      if (res && Array.isArray(res.conversations)) {
        setConversations(res.conversations);
      } else {
        setConversations([]);
      }
    } catch (err) {
      console.warn('Error loading conversations:', err);
      setConversations([]);
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  };

  // Load messages for the selected phone
  const loadMessages = async (phone, silent = false) => {
    if (!phone) {
      setMessages([]);
      return;
    }
    if (!silent) setLoadingMessages(true);
    try {
      const res = await api.getWhatsAppChatHistory(phone);
      if (res && Array.isArray(res.messages)) {
        if (previousMessageCountRef.current > 0 && res.messages.length > previousMessageCountRef.current) {
          const latest = res.messages[res.messages.length - 1];
          if (latest?.sender_type === 'customer') {
            playNotificationChime();
          }
        }
        previousMessageCountRef.current = res.messages.length;
        setMessages(res.messages);
        if (res.contact) {
          setContactInfo(res.contact);
        }
        // Save to browser persistent backup so history survives container sleep/restart
        saveWhatsAppMessagesPermanently(res.messages);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.warn('Error loading chat history:', err);
      setMessages([]);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  // Handle incoming initialTarget prop (from complaints desk)
  useEffect(() => {
    if (initialTarget && initialTarget.phone) {
      const clean = String(initialTarget.phone).replace(/\D/g, '');
      const fullPhone = clean.startsWith('91') && clean.length === 12 ? clean : clean.length === 10 ? '91' + clean : clean;
      setSelectedPhone(fullPhone);
      setContactInfo({
        phone: fullPhone,
        sender_name: initialTarget.customerName || 'Customer',
        ticket_id: initialTarget.ticketId || null,
        complaint: initialTarget.complaintId ? { id: initialTarget.complaintId, ticket_id: initialTarget.ticketId } : null
      });

      // Ensure conversation item is visible in list
      setConversations(prev => {
        if (prev.find(c => c.phone === fullPhone)) return prev;
        return [
          {
            phone: fullPhone,
            sender_name: initialTarget.customerName || 'Customer',
            ticket_id: initialTarget.ticketId || null,
            complaint_id: initialTarget.complaintId || null,
            last_message: 'Chat initiated from complaints desk',
            last_activity: 'Just now',
            unread_count: 0
          },
          ...prev
        ];
      });

      loadMessages(fullPhone);
      if (onClearInitialTarget) onClearInitialTarget();
    }
  }, [initialTarget]);

  // Initial load with automatic client-side backup restoration
  useEffect(() => {
    const initInbox = async () => {
      // 1. Sync any cached messages from browser localStorage to server (in case container restarted)
      const localBackup = getPermanentWhatsAppMessages();
      if (Array.isArray(localBackup) && localBackup.length > 0) {
        try {
          await api.syncBackupWhatsApp(localBackup);
        } catch (e) {
          console.warn('Backup sync note:', e.message);
        }
      }
      // 2. Load latest conversations
      await loadConversations();
    };
    initInbox();
  }, []);

  // When selectedPhone changes, load thread
  useEffect(() => {
    if (selectedPhone) {
      loadMessages(selectedPhone);
      setSelectedFile(null);
      setFilePreview(null);
      setShowEmojiPicker(false);
      setShowHeaderMenu(false);
    }
  }, [selectedPhone]);

  // Polling every 4 seconds for incoming WhatsApp messages
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations(true);
      if (selectedPhone) {
        loadMessages(selectedPhone, true);
      }
    }, 4000);
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

    if (file.size > 20 * 1024 * 1024) {
      showToast('File size exceeds 20MB limit', 'error');
      return;
    }

    setSelectedFile(file);

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

  // Download media/document helper
  const handleDownloadFile = (url, filename) => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'whatsapp_file';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  // Handle sending message
  const handleSendReply = async (e) => {
    e?.preventDefault();
    if (!selectedPhone || (!replyText.trim() && !selectedFile)) return;

    const currentText = replyText.trim();
    const currentFile = selectedFile;
    const optimisticId = 'opt_' + Date.now();

    const optimisticMsg = {
      id: optimisticId,
      phone: selectedPhone,
      sender_type: 'company',
      sender_name: 'Eco Green Desk',
      message_body: currentText,
      media_url: filePreview || null,
      media_type: currentFile ? (currentFile.type.startsWith('image/') ? 'image' : 'document') : null,
      media_caption: currentFile ? currentFile.name : null,
      created_at: new Date().toISOString(),
      status: 'sent'
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setReplyText('');
    handleClearSelectedFile();
    setShowEmojiPicker(false);

    try {
      setSendingReply(true);
      await api.sendWhatsAppDirectReply(selectedPhone, currentText, currentFile);
      setTimeout(() => loadMessages(selectedPhone, true), 800);
      loadConversations(true);
    } catch (err) {
      showToast('Error sending message: ' + err.message, 'error');
    } finally {
      setSendingReply(false);
    }
  };

  // Insert emoji into reply text
  const handleInsertEmoji = (emoji) => {
    setReplyText(prev => prev + emoji);
    messageInputRef.current?.focus();
  };

  // Header 3-Dots actions
  const handleCopyPhone = () => {
    setShowHeaderMenu(false);
    if (!selectedPhone) return;
    const clean = selectedPhone.replace(/^91/, '');
    navigator.clipboard?.writeText(clean);
    showToast(`Copied +91 ${clean} to clipboard!`, 'success');
  };

  const handleClearChat = async () => {
    setShowHeaderMenu(false);
    if (!selectedPhone) return;
    const ok = await confirm({
      title: 'Clear WhatsApp Chat History?',
      message: `Are you sure you want to clear all message history with ${contactInfo?.sender_name || selectedPhone}? This action cannot be undone.`,
      type: 'danger',
      confirmText: 'Clear Chat',
      cancelText: 'Cancel'
    });
    if (!ok) return;

    try {
      await api.clearWhatsAppChat(selectedPhone);
      setMessages([]);
      showToast('Chat history cleared successfully', 'success');
      loadConversations(true);
    } catch (err) {
      showToast('Failed to clear chat: ' + err.message, 'error');
    }
  };

  // New Chat Phone Verification Effect
  useEffect(() => {
    const raw = (newChatPhone || '').replace(/\D/g, '');
    if (!raw || raw.length < 5) {
      setNewChatVerification(null);
      setNewChatVerifying(false);
      return;
    }

    const timer = setTimeout(async () => {
      setNewChatVerifying(true);
      try {
        const res = await api.verifyWhatsAppNumber(newChatPhone);
        setNewChatVerification(res);
      } catch (e) {
        setNewChatVerification(null);
      } finally {
        setNewChatVerifying(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [newChatPhone]);

  // Fetch recent complaints when New Chat modal opens
  useEffect(() => {
    if (isNewChatModalOpen) {
      setLoadingRecent(true);
      api.getComplaints({ limit: 12 })
        .then(res => {
          if (res && Array.isArray(res.complaints)) {
            setRecentComplaintsList(res.complaints);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingRecent(false));
    }
  }, [isNewChatModalOpen]);

  // Handle starting a new chat
  const handleStartNewChat = async (e) => {
    e?.preventDefault();
    const raw = (newChatPhone || '').replace(/\D/g, '');
    const clean = raw.length === 12 && raw.startsWith('91') ? raw.slice(2) : raw;

    if (!/^[6-9]\d{9}$/.test(clean)) {
      showToast('Please enter a valid 10-digit Indian WhatsApp mobile number', 'error');
      return;
    }

    const fullPhone = '91' + clean;
    setStartingChat(true);

    try {
      if (newChatMessage.trim()) {
        await api.sendWhatsAppDirectReply(fullPhone, newChatMessage.trim());
      }

      setSelectedPhone(fullPhone);
      setContactInfo({
        phone: fullPhone,
        sender_name: newChatName.trim() || `Customer (+91 ${clean})`
      });

      // Add to conversations
      setConversations(prev => {
        if (prev.find(c => c.phone === fullPhone)) return prev;
        return [
          {
            phone: fullPhone,
            sender_name: newChatName.trim() || `Customer (+91 ${clean})`,
            last_message: newChatMessage.trim() || 'Chat initiated',
            last_activity: 'Just now',
            unread_count: 0
          },
          ...prev
        ];
      });

      setIsNewChatModalOpen(false);
      setNewChatPhone('');
      setNewChatName('');
      loadMessages(fullPhone);
      showToast(`Chat started with +91 ${clean}!`, 'success');
    } catch (err) {
      showToast('Failed to start chat: ' + err.message, 'error');
    } finally {
      setStartingChat(false);
    }
  };

  const handlePickRecentTicket = (complaint) => {
    const raw = (complaint.customer_phone || '').replace(/\D/g, '');
    const clean = raw.length === 12 && raw.startsWith('91') ? raw.slice(2) : raw;
    const fullPhone = '91' + clean;

    setSelectedPhone(fullPhone);
    setContactInfo({
      phone: fullPhone,
      sender_name: complaint.customer_name,
      ticket_id: complaint.ticket_id,
      complaint: { id: complaint.id, ticket_id: complaint.ticket_id }
    });

    setConversations(prev => {
      if (prev.find(c => c.phone === fullPhone)) return prev;
      return [
        {
          phone: fullPhone,
          sender_name: complaint.customer_name,
          ticket_id: complaint.ticket_id,
          complaint_id: complaint.id,
          last_message: `Ticket #${complaint.ticket_id}`,
          last_activity: 'Just now',
          unread_count: 0
        },
        ...prev
      ];
    });

    setIsNewChatModalOpen(false);
    loadMessages(fullPhone);
  };

  const handleSaveContactName = async (e) => {
    if (e) e.preventDefault();
    if (!selectedPhone || !editedContactName.trim()) return;
    try {
      setSavingContactName(true);
      const cleanName = editedContactName.trim();
      const res = await api.updateWhatsAppContactName(selectedPhone, cleanName);
      if (res && res.success) {
        setContactInfo(prev => prev ? { ...prev, sender_name: cleanName } : { phone: selectedPhone, sender_name: cleanName });
        setConversations(prev => prev.map(c => c.phone === selectedPhone ? { ...c, sender_name: cleanName } : c));
        showToast('Contact name updated successfully', 'success');
        setIsEditNameModalOpen(false);
      }
    } catch (err) {
      showToast(err.message || 'Failed to update contact name', 'error');
    } finally {
      setSavingContactName(false);
    }
  };

  // Helper to render avatar initials or clean user icon when name starts with '+' or digits
  const renderAvatarContent = (name, phone, iconClass = "w-5 h-5") => {
    const cleanName = (name || '').trim();
    if (!cleanName || cleanName.startsWith('+') || /^\d/.test(cleanName)) {
      return <User className={iconClass} />;
    }
    return cleanName.charAt(0).toUpperCase();
  };

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    const p = (conv.phone || '').replace(/[^0-9]/g, '');
    const personalPhoneRegex = /6352454247|9426529550|9662729804|9825112345|9825099887/;
    const personalPattern = /akshar|અક્ષર|jay\s*bhai|dhaval|sumit|instagram\.com|linktr\.ee|reels/i;

    if (personalPhoneRegex.test(p)) return false;
    const combined = `${conv.sender_name || ''} ${conv.last_message || ''}`;
    if (personalPattern.test(combined)) return false;

    if (activeFilter === 'unread' && !conv.unread_count) return false;
    if (activeFilter === 'favorites' && !conv.is_pinned) return false;
    if (activeFilter === 'groups' && !conv.sender_name?.toLowerCase().includes('group') && !conv.is_group) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (conv.sender_name && conv.sender_name.toLowerCase().includes(q)) ||
      (conv.phone && conv.phone.includes(q)) ||
      (conv.last_message && conv.last_message.toLowerCase().includes(q)) ||
      (conv.ticket_id && conv.ticket_id.toLowerCase().includes(q))
    );
  });

  const selectedConv = conversations.find(c => c.phone === selectedPhone);

  // Group messages by day for authentic WhatsApp dividers
  const renderMessageGroups = () => {
    if (messages.length === 0) {
      return (
        <div className="py-16 text-center text-[#8696a0] text-xs space-y-2">
          <div className="w-12 h-12 rounded-full bg-white/80 text-[#00a884] mx-auto flex items-center justify-center shadow-xs">
            <MessageSquare className="w-6 h-6" />
          </div>
          <p className="font-semibold text-[#111b21]">No messages in this chat yet</p>
          <p className="text-[11px] text-[#667781] max-w-xs mx-auto">
            Type a message below or attach a photo/document to start the conversation with this customer.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex justify-center my-3">
          <span className="px-3 py-1 bg-white/90 text-[#54656f] text-[11px] font-semibold rounded-lg shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] select-none">
            Messages Saved Permanently in Database & Files
          </span>
        </div>

        {messages.map((msg, idx) => {
          const isCustomer = msg.sender_type === 'customer';
          const timeStr = formatWhatsAppTime(msg.created_at) || '12:00 PM';

          return (
            <div
              key={msg.id || idx}
              className={`flex ${isCustomer ? 'justify-start' : 'justify-end'} my-1 relative px-2`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[72%] px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] text-sm relative rounded-lg ${
                  isCustomer
                    ? 'bg-white text-[#111b21] rounded-tl-none'
                    : 'bg-[#d9fdd3] text-[#111b21] rounded-tr-none'
                }`}
              >
                {/* Quoted Reply Preview block if present */}
                {msg.quoted_text && (
                  <div className="mb-2 p-2 rounded bg-black/5 border-l-4 border-[#25d366] text-xs">
                    <p className="font-bold text-[#00a884] text-[11px] mb-0.5">You</p>
                    <p className="text-[#54656f] font-mono text-[10px] truncate max-w-sm">
                      {msg.quoted_text}
                    </p>
                  </div>
                )}

                {/* Media: Image Photo preview with download button */}
                {msg.media_url && (msg.media_type === 'image' || msg.media_type?.includes('image')) && (
                  <div className="mb-2 rounded-lg overflow-hidden relative group max-w-md bg-black/5">
                    <img
                      src={msg.media_url}
                      alt="WhatsApp photo"
                      className="w-full max-h-72 object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                      onClick={() => setPreviewMedia({ url: msg.media_url, type: 'image' })}
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewMedia({ url: msg.media_url, type: 'image' })}
                        className="p-2 bg-white/90 rounded-full text-slate-800 hover:bg-white shadow-md transition-colors cursor-pointer"
                        title="View Full Size"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(msg.media_url, `whatsapp_${msg.id}.jpg`)}
                        className="p-2 bg-white/90 rounded-full text-slate-800 hover:bg-white shadow-md transition-colors cursor-pointer"
                        title="Download Photo"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Media: PDF Document Card with Download Action */}
                {msg.media_url && (msg.media_type === 'document' || msg.media_type?.includes('pdf') || msg.media_type?.includes('document')) && (
                  <div className="mb-2 p-3 bg-black/5 hover:bg-black/10 rounded-lg flex items-center justify-between gap-3 border border-black/5 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded bg-[#d9fdd3] text-[#008069] flex items-center justify-center shrink-0 shadow-2xs font-bold text-xs">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-[#111b21] truncate max-w-[200px]">
                          {msg.media_caption || 'Attached Document.pdf'}
                        </p>
                        <span className="text-[10px] text-[#667781] uppercase font-mono">
                          PDF • Click to open
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadFile(msg.media_url, msg.media_caption || 'document.pdf')}
                      className="p-1.5 text-[#54656f] hover:text-[#111b21] hover:bg-white/60 rounded-full transition-colors cursor-pointer"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Link Preview Card */}
                {msg.link_url || (msg.message_body && msg.message_body.includes('http')) ? (
                  <div className="mb-2 p-2 rounded-lg bg-black/5 border border-black/5 text-xs">
                    <div className="flex items-center gap-1.5 text-[#008069] font-semibold text-[11px] mb-0.5">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{msg.link_title || 'Eco Green Customer Portal'}</span>
                    </div>
                    {msg.link_description && (
                      <p className="text-[#54656f] text-[11px] line-clamp-2">
                        {msg.link_description}
                      </p>
                    )}
                    <a
                      href={msg.link_url || 'https://eco-green-complain.vprotech.online/'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#027eb5] hover:underline break-all text-[11px] block mt-0.5"
                    >
                      {msg.link_url || 'https://eco-green-complain.vprotech.online/'}
                    </a>
                  </div>
                ) : null}

                {/* Main Message Text */}
                {msg.message_body && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed select-text font-normal text-[13px]">
                    {msg.message_body}
                  </p>
                )}

                {/* Timestamp & Delivery Checkmarks */}
                <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] mt-1 ml-3 select-none float-right">
                  <span>{timeStr}</span>
                  {!isCustomer && (
                    <span className="inline-flex items-center ml-0.5" title={`Status: ${msg.status || 'sent'}${msg.failure_reason ? ' (' + msg.failure_reason + ')' : ''}`}>
                      {msg.status === 'read' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" />
                      ) : msg.status === 'failed' ? (
                        <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold text-[9px] bg-rose-50 px-1 py-0.5 rounded border border-rose-200">
                          <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>Failed</span>
                        </span>
                      ) : msg.status === 'pending' ? (
                        <Clock className="w-3 h-3 text-[#8696a0]" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-[#8696a0]" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full flex-1 h-full flex overflow-hidden bg-[#efeae2] select-none">
      {/* ================= FAR LEFT APP RAIL (WHATSAPP WEB DESKTOP ICON BAR) ================= */}
      <div className="hidden md:flex w-14 bg-[#f0f2f5] border-r border-[#d1d7db] flex-col justify-between items-center py-3 shrink-0 z-20">
        {/* Top Icons */}
        <div className="flex flex-col items-center gap-4 w-full">
          {/* WhatsApp Chats Icon (Active) */}
          <button
            type="button"
            className="w-10 h-10 rounded-xl bg-[#d9fdd3] text-[#008069] flex items-center justify-center transition-all cursor-pointer shadow-xs relative"
            title="Chats"
          >
            <MessageSquare className="w-5 h-5 fill-[#008069]" />
            <span className="w-2 h-2 rounded-full bg-[#008069] absolute top-1.5 right-1.5" />
          </button>

          {/* Status Updates */}
          <button
            type="button"
            className="w-10 h-10 rounded-xl hover:bg-[#e9edef] text-[#54656f] hover:text-[#111b21] flex items-center justify-center transition-all cursor-pointer"
            title="Status"
          >
            <Radio className="w-5 h-5" />
          </button>

          {/* Channels / Broadcasts */}
          <button
            type="button"
            className="w-10 h-10 rounded-xl hover:bg-[#e9edef] text-[#54656f] hover:text-[#111b21] flex items-center justify-center transition-all cursor-pointer"
            title="Channels"
          >
            <Compass className="w-5 h-5" />
          </button>

          {/* Communities */}
          <button
            type="button"
            className="w-10 h-10 rounded-xl hover:bg-[#e9edef] text-[#54656f] hover:text-[#111b21] flex items-center justify-center transition-all cursor-pointer"
            title="Communities"
          >
            <Users className="w-5 h-5" />
          </button>

          {/* Meta AI */}
          <button
            type="button"
            className="w-10 h-10 rounded-xl hover:bg-[#e9edef] text-[#54656f] hover:text-[#111b21] flex items-center justify-center transition-all cursor-pointer"
            title="Meta AI"
          >
            <Sparkles className="w-5 h-5 text-indigo-500" />
          </button>
        </div>

        {/* Bottom Icons: Sound, Settings & Avatar */}
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Audio Notification Toggle */}
          <button
            type="button"
            onClick={handleToggleSound}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              soundEnabled ? 'text-[#008069] hover:bg-[#e9edef]' : 'text-slate-400 hover:bg-[#e9edef]'
            }`}
            title={soundEnabled ? 'Sound Notifications Active (Click to mute)' : 'Sound Notifications Muted'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(true)}
            className="w-10 h-10 rounded-xl hover:bg-[#e9edef] text-[#54656f] hover:text-[#111b21] flex items-center justify-center transition-all cursor-pointer"
            title="WhatsApp Settings & Cloud API Status"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Profile Circle Avatar */}
          <div 
            onClick={() => setIsSettingsModalOpen(true)}
            className="w-9 h-9 rounded-full bg-[#00a884] text-white flex items-center justify-center font-bold text-xs shadow-xs cursor-pointer"
            title="Eco Green Solar (+91 78784 44414)"
          >
            EG
          </div>
        </div>
      </div>

      {/* ================= MIDDLE CHAT LIST PANE (AUTHENTIC WHATSAPP WEB) ================= */}
      <div className={`w-full md:w-[380px] lg:w-[410px] bg-white border-r border-[#d1d7db] flex flex-col h-full shrink-0 z-10 ${selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        {/* Header: WhatsApp Title & Action Buttons */}
        <div className="bg-white px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-[#111b21] tracking-tight">
            WhatsApp
          </h2>

          <div className="flex items-center gap-1.5 text-[#54656f] relative">
            {/* New Chat Button (+) */}
            <button
              type="button"
              onClick={() => setIsNewChatModalOpen(true)}
              className="w-8 h-8 rounded-full hover:bg-[#f0f2f5] text-[#54656f] hover:text-[#008069] flex items-center justify-center transition-colors cursor-pointer"
              title="Start New WhatsApp Chat"
            >
              <MessageSquarePlus className="w-5 h-5" />
            </button>

            {/* Menu 3 Dots Button */}
            <button
              id="sidebar-menu-button"
              type="button"
              onClick={() => setShowSidebarMenu(!showSidebarMenu)}
              className="w-8 h-8 rounded-full hover:bg-[#f0f2f5] text-[#54656f] hover:text-[#111b21] flex items-center justify-center transition-colors cursor-pointer"
              title="Menu Options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {/* Sidebar 3-Dots Dropdown Menu */}
            {showSidebarMenu && (
              <div 
                id="sidebar-menu-container"
                className="absolute right-0 top-10 w-52 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  type="button"
                  onClick={() => { setShowSidebarMenu(false); setIsNewChatModalOpen(true); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold text-[#111b21] hover:bg-[#f5f6f6] flex items-center gap-2.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#008069]" />
                  <span>New Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSidebarMenu(false); setIsSettingsModalOpen(true); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold text-[#111b21] hover:bg-[#f5f6f6] flex items-center gap-2.5 cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-600" />
                  <span>Settings & WABA</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSidebarMenu(false); loadConversations(); showToast('Chats refreshed', 'success'); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold text-[#111b21] hover:bg-[#f5f6f6] flex items-center gap-2.5 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-slate-600" />
                  <span>Refresh Conversations</span>
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => { 
                    setShowSidebarMenu(false); 
                    setActiveFilter(activeFilter === 'unread' ? 'all' : 'unread'); 
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold text-[#111b21] hover:bg-[#f5f6f6] flex items-center gap-2.5 cursor-pointer"
                >
                  <Filter className="w-4 h-4 text-slate-600" />
                  <span>{activeFilter === 'unread' ? 'Show All Chats' : 'Filter Unread Chats'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-3 py-1.5 shrink-0">
          <div className="bg-[#f0f2f5] rounded-lg flex items-center px-3 py-1.5 transition-colors focus-within:bg-white focus-within:ring-1 focus-within:ring-[#00a884]">
            <Search className="w-4 h-4 text-[#54656f] mr-3 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or start a new chat"
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
        </div>

        {/* WhatsApp Filter Pills */}
        <div className="px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 border-b border-[#f0f2f5]">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer shrink-0 ${
              activeFilter === 'all'
                ? 'bg-[#d9fdd3] text-[#008069]'
                : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
            }`}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('unread')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer shrink-0 ${
              activeFilter === 'unread'
                ? 'bg-[#d9fdd3] text-[#008069]'
                : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
            }`}
          >
            <span>Unread</span>
            {conversations.filter(c => c.unread_count > 0).length > 0 && (
              <span className="font-mono text-[10px] ml-1 bg-[#25d366] text-white px-1.5 py-0.2 rounded-full">
                {conversations.filter(c => c.unread_count > 0).length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('favorites')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer shrink-0 ${
              activeFilter === 'favorites'
                ? 'bg-[#d9fdd3] text-[#008069]'
                : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
            }`}
          >
            Favorites
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('groups')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer shrink-0 ${
              activeFilter === 'groups'
                ? 'bg-[#d9fdd3] text-[#008069]'
                : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
            }`}
          >
            Groups
          </button>

          <button
            type="button"
            onClick={() => setIsNewChatModalOpen(true)}
            className="w-7 h-7 rounded-full bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef] flex items-center justify-center text-sm font-bold shrink-0 cursor-pointer"
            title="Start New Chat"
          >
            +
          </button>
        </div>

        {/* Scrollable Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#f5f6f6] bg-white">
          {loadingConversations && conversations.length === 0 ? (
            <div className="p-8 text-center text-[#8696a0] text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#00a884]" />
              <span>Loading WhatsApp chats...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-[#8696a0] text-xs space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-[#008069] flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="font-semibold text-[#111b21]">No WhatsApp chats yet</p>
              <p className="text-[11px] text-[#667781] leading-relaxed">
                Start a new conversation with any customer or incoming webhook messages will appear here.
              </p>
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(true)}
                className="px-3.5 py-1.5 bg-[#00a884] hover:bg-[#008f72] text-white rounded-lg text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Start New Chat</span>
              </button>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = conv.phone === selectedPhone;
              const formattedTime = formatWhatsAppListTime(conv.last_activity);

              return (
                <div
                  key={conv.phone}
                  onClick={() => setSelectedPhone(conv.phone)}
                  className={`px-3 py-2.5 cursor-pointer transition-colors flex items-center gap-3 relative ${
                    isSelected ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6] bg-white'
                  }`}
                >
                  {/* Avatar Circle */}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
                    conv.is_pinned 
                      ? 'bg-slate-800 text-white' 
                      : conv.ticket_id 
                        ? 'bg-[#00a884] text-white' 
                        : 'bg-[#dfe5e7] text-[#54656f]'
                  }`}>
                    {renderAvatarContent(conv.sender_name, conv.phone, "w-5 h-5")}
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-semibold text-[13.5px] text-[#111b21] truncate">
                        {conv.sender_name || `+${conv.phone}`}
                      </h4>
                      <span className={`text-[11px] shrink-0 ml-1 font-mono ${
                        conv.unread_count ? 'text-[#00a884] font-bold' : 'text-[#8696a0]'
                      }`}>
                        {formattedTime}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs text-[#667781] truncate flex items-center gap-1 font-normal">
                        {conv.last_sender_type === 'company' && (
                          <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] shrink-0 inline" />
                        )}
                        {conv.last_sender_type === 'customer' && !conv.unread_count && (
                          <CheckCheck className="w-3.5 h-3.5 text-[#8696a0] shrink-0 inline" />
                        )}
                        <span className="truncate">{conv.last_message || 'Media attachment'}</span>
                      </p>

                      {/* Right indicators: Pinned icon OR Unread count badge */}
                      <div className="flex items-center gap-1 shrink-0">
                        {conv.is_pinned && (
                          <Pin className="w-3.5 h-3.5 text-[#8696a0] rotate-45" />
                        )}
                        {Boolean(conv.unread_count) && (
                          <span className="w-4 h-4 rounded-full bg-[#25d366] text-white font-bold text-[10px] flex items-center justify-center">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* WABA Active Banner at bottom of Chat List */}
        <div className="p-2.5 bg-[#f0f2f5] border-t border-[#d1d7db] flex items-center justify-between px-4 shrink-0 text-[11px] text-[#54656f]">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <strong className="text-[#111b21]">+91 78784 44414</strong>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(true)}
            className="text-[#008069] font-bold hover:underline"
          >
            Cloud API Active
          </button>
        </div>
      </div>

      {/* ================= RIGHT MAIN CHAT AREA (AUTHENTIC WHATSAPP WEB REPLICA) ================= */}
      <div className={`flex-1 flex flex-col h-full bg-[#efeae2] relative overflow-hidden ${!selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        {selectedPhone ? (
          <>
            {/* Top WhatsApp Conversation Header */}
            <div className="bg-[#f0f2f5] px-3 sm:px-4 py-2 border-b border-[#d1d7db] flex items-center justify-between z-10 shrink-0">
              <div 
                onClick={() => setIsContactInfoOpen(true)}
                className="flex items-center gap-2 sm:gap-3 min-w-0 cursor-pointer group"
                title="Click to view contact info"
              >
                {/* Mobile Back button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedPhone(null); }}
                  className="md:hidden p-1 text-[#54656f] hover:text-[#111b21] rounded-full cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
                  selectedConv?.is_pinned 
                    ? 'bg-slate-800 text-white' 
                    : selectedConv?.ticket_id 
                      ? 'bg-[#00a884] text-white' 
                      : 'bg-[#dfe5e7] text-[#54656f]'
                }`}>
                  {renderAvatarContent(contactInfo?.sender_name || selectedConv?.sender_name, selectedPhone, "w-4 h-4")}
                </div>

                {/* Name & Live Status */}
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-[#111b21] truncate group-hover:text-[#008069] transition-colors flex items-center gap-1.5">
                    <span className="truncate">{contactInfo?.sender_name || selectedConv?.sender_name || `+${selectedPhone}`}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditedContactName(contactInfo?.sender_name || selectedConv?.sender_name || '');
                        setIsEditNameModalOpen(true);
                      }}
                      className="p-1 hover:bg-[#dfe5e7] rounded-full text-slate-400 hover:text-[#008069] transition-colors cursor-pointer shrink-0"
                      title="Edit Contact Name"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </h3>
                  <p className="text-[11px] text-[#667781] truncate font-mono">
                    +91 {selectedPhone.replace(/^91/, '')} • <span className="text-[#008069]">online / WhatsApp</span>
                  </p>
                </div>
              </div>

              {/* Right Action Icons (Ticket Pill, Video, Search, Menu 3-Dots) */}
              <div className="flex items-center gap-1.5 shrink-0 relative">
                {contactInfo?.is_technician ? (
                  <span className="px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs mr-1">
                    <Wrench className="w-3.5 h-3.5 text-teal-600" />
                    <span>Field Technician</span>
                  </span>
                ) : (contactInfo?.ticket_id || selectedConv?.complaint_id || selectedConv?.ticket_id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      const cId = contactInfo?.complaint?.id || selectedConv?.complaint_id;
                      if (onOpenComplaint && cId) {
                        onOpenComplaint(cId);
                      } else {
                        setIsContactInfoOpen(true);
                      }
                    }}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer mr-1"
                    title="View Ticket in CMS"
                  >
                    <Ticket className="w-3.5 h-3.5 text-blue-700" />
                    <span>#{contactInfo?.ticket_id || selectedConv?.ticket_id}</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setIsContactInfoOpen(true)}
                  className="p-1.5 hover:bg-[#e9edef] rounded-full text-[#54656f] transition-colors cursor-pointer"
                  title="Contact Information"
                >
                  <User className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => showToast('In-app voice & video calling via WebRTC coming soon', 'info')}
                  className="p-1.5 hover:bg-[#e9edef] rounded-full text-[#54656f] transition-colors cursor-pointer"
                  title="Video Call"
                >
                  <Video className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyPhone()}
                  className="p-1.5 hover:bg-[#e9edef] rounded-full text-[#54656f] transition-colors cursor-pointer"
                  title="Copy Phone"
                >
                  <Copy className="w-4 h-4" />
                </button>

                {/* Header 3-Dots Button */}
                <button
                  id="header-menu-button"
                  type="button"
                  onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                  className="p-1.5 hover:bg-[#e9edef] rounded-full text-[#54656f] hover:text-[#111b21] transition-colors cursor-pointer"
                  title="More Options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {/* Header 3-Dots Dropdown Menu */}
                {showHeaderMenu && (
                  <div 
                    id="header-menu-container"
                    className="absolute right-0 top-10 w-52 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                  >
                    <button
                      type="button"
                      onClick={() => { setShowHeaderMenu(false); setIsContactInfoOpen(true); }}
                      className="w-full px-4 py-2.5 text-left text-xs font-semibold text-[#111b21] hover:bg-[#f5f6f6] flex items-center gap-2.5 cursor-pointer"
                    >
                      <User className="w-4 h-4 text-slate-600" />
                      <span>Contact Info</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyPhone}
                      className="w-full px-4 py-2.5 text-left text-xs font-semibold text-[#111b21] hover:bg-[#f5f6f6] flex items-center gap-2.5 cursor-pointer"
                    >
                      <Copy className="w-4 h-4 text-slate-600" />
                      <span>Copy Phone Number</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowHeaderMenu(false); loadMessages(selectedPhone); showToast('Messages refreshed', 'success'); }}
                      className="w-full px-4 py-2.5 text-left text-xs font-semibold text-[#111b21] hover:bg-[#f5f6f6] flex items-center gap-2.5 cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4 text-slate-600" />
                      <span>Refresh Messages</span>
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={handleClearChat}
                      className="w-full px-4 py-2.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 cursor-pointer"
                    >
                      <X className="w-4 h-4 text-rose-600" />
                      <span>Clear Chat History</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowHeaderMenu(false); setSelectedPhone(null); }}
                      className="w-full px-4 py-2.5 text-left text-xs font-semibold text-slate-600 hover:bg-[#f5f6f6] flex items-center gap-2.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4 text-slate-400" />
                      <span>Close Chat</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Prominent Yellow/Amber Bar to Raise / Convert to Ticket if general inquiry */}
            {!(contactInfo?.ticket_id || selectedConv?.complaint_id || selectedConv?.ticket_id) && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 shrink-0 shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="truncate sm:whitespace-normal font-medium">
                    This customer does not have an active complaint ticket.
                  </span>
                </div>
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
                  className="font-bold underline text-amber-800 hover:text-amber-950 shrink-0 cursor-pointer ml-3 flex items-center gap-1"
                >
                  <span>+ Register Ticket</span>
                </button>
              </div>
            )}

            {/* Main Messages Stream (Authentic WhatsApp Doodle Background) */}
            <div 
              className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#efeae2] relative"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M9 15a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-6zm50 20a4 4 0 1 1 8 0 4 4 0 0 1-8 0zm35-15a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3v-8zM20 70a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm65 15a4 4 0 1 1 8 0 4 4 0 0 1-8 0zM15 105a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-6zm60 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' fill='%23707070' fill-opacity='0.05' fill-rule='evenodd'/%3E%3C/svg%3E")`,
                backgroundSize: '180px 180px'
              }}
            >
              {renderMessageGroups()}
              <div ref={messagesEndRef} />
            </div>

            {/* Pending File Attachment Banner */}
            {selectedFile && (
              <div className="px-4 py-2 bg-[#f0f2f5] border-t border-[#d1d7db] flex items-center justify-between shrink-0 animate-in fade-in">
                <div className="flex items-center gap-2.5 min-w-0">
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

            {/* Interactive Emoji Picker Popover */}
            {showEmojiPicker && (
              <div 
                id="emoji-picker-container"
                className="absolute bottom-16 left-4 z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 w-80 p-3 animate-in fade-in slide-in-from-bottom-2 duration-150"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    {Object.keys(EMOJI_CATEGORIES).map(cat => (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => setActiveEmojiTab(cat)}
                        className={`text-xs px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                          activeEmojiTab === cat
                            ? 'bg-[#d9fdd3] text-[#008069]'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto p-1">
                  {EMOJI_CATEGORIES[activeEmojiTab].map((em, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => handleInsertEmoji(em)}
                      className="w-8 h-8 rounded hover:bg-[#f0f2f5] text-lg flex items-center justify-center transition-transform hover:scale-125 cursor-pointer"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Message Input Bar */}
            <form onSubmit={handleSendReply} className="px-2 py-2 sm:px-3 sm:py-2 bg-[#f0f2f5] border-t border-[#d1d7db] flex items-center gap-1 sm:gap-2 shrink-0">
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
                id="emoji-picker-button"
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`p-2 rounded-full transition-colors cursor-pointer shrink-0 ${
                  showEmojiPicker ? 'bg-[#d9fdd3] text-[#008069]' : 'text-[#54656f] hover:text-[#111b21]'
                }`}
                title="Emojis & Symbols"
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

              {/* Text Input Box */}
              <input
                ref={messageInputRef}
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={selectedFile ? `Add a caption or send ${selectedFile.name}...` : "Type a message"}
                className="flex-1 text-sm px-4 py-2 bg-white rounded-lg text-[#111b21] placeholder-[#8696a0] border-none outline-none focus:ring-0 shadow-2xs font-normal"
                disabled={sendingReply}
              />

              {/* Send Button */}
              {replyText.trim() || selectedFile ? (
                <button
                  type="submit"
                  disabled={sendingReply}
                  className="w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#008f72] disabled:opacity-50 text-white flex items-center justify-center shrink-0 shadow-2xs transition-all cursor-pointer"
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => showToast('Voice note recording ready via browser microphone', 'info')}
                  className="p-2 text-[#54656f] hover:text-[#111b21] rounded-full transition-colors cursor-pointer shrink-0"
                  title="Voice Message"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </form>
          </>
        ) : (
          /* Empty State (WhatsApp Web native landing graphic) */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#f0f2f5] border-b-8 border-[#25d366]">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-md mb-4 text-[#00a884]">
              <Phone className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-[#111b21]">Eco Green Solar WhatsApp Hub</h3>
            <p className="text-xs text-[#667781] max-w-sm mt-2 leading-relaxed">
              Send and receive WhatsApp messages with solar customers in real time. All incoming customer messages and staff replies are recorded permanently in database and file storage.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(true)}
                className="px-4 py-2 bg-[#00a884] hover:bg-[#008f72] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Start New Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-500" />
                <span>View Settings & Status</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#8696a0] mt-8 font-mono">
              <Shield className="w-3.5 h-3.5 text-[#00a884]" />
              <span>Connected to Meta Cloud API (+91 78784 44414)</span>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL: START NEW CHAT ================= */}
      {isNewChatModalOpen && (
        <div 
          onClick={() => setIsNewChatModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200"
          >
            {/* Header */}
            <div className="px-5 py-4 bg-[#008069] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <MessageSquarePlus className="w-5 h-5 text-emerald-200" />
                <div>
                  <h3 className="font-bold text-sm">Start New WhatsApp Chat</h3>
                  <p className="text-[11px] text-emerald-100">Send WhatsApp from official number +91 78784 44414</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-full text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleStartNewChat} className="p-5 space-y-4">
              {/* Phone Input with Live WhatsApp Verification */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Customer Mobile Phone *</label>
                  {newChatVerifying && (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin text-[#008069]" />
                      Verifying...
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    placeholder="Enter 10-digit mobile (e.g., 9876543210)"
                    value={newChatPhone}
                    onChange={(e) => setNewChatPhone(e.target.value)}
                    className={`w-full text-xs px-3.5 py-2.5 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 font-mono ${
                      newChatVerification
                        ? newChatVerification.isVerified
                          ? 'border-emerald-500 focus:ring-emerald-500 pr-8'
                          : 'border-rose-400 focus:ring-rose-400 pr-8'
                        : 'border-slate-300 focus:ring-[#008069]'
                    }`}
                  />
                  {newChatVerification && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {(newChatVerification.isVerified ?? newChatVerification.valid) ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      )}
                    </div>
                  )}
                </div>

                {/* Verification Badge */}
                {newChatVerification && (
                  <div className="mt-1.5">
                    {(newChatVerification.status === 'invite_required' || newChatVerification.isWhatsApp === false) ? (
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                        <div className="flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>🔴 Not on WhatsApp (Invite Required)</span>
                        </div>
                        <a
                          href={`https://wa.me/91${(newChatPhone || '').replace(/\D/g, '').slice(-10)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto text-[10px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-0.5 rounded shadow-2xs transition-all"
                        >
                          Invite to WhatsApp
                        </a>
                      </div>
                    ) : (newChatVerification.status === 'verified' || newChatVerification.isWhatsApp === true) ? (
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                          <span>🟢 WhatsApp Active ({newChatVerification.formatted || newChatVerification.formattedPhone || newChatPhone})</span>
                        </div>
                        {newChatVerification.isExistingCustomer && (
                          <span className="ml-auto text-[10px] font-bold text-emerald-900 bg-emerald-200/90 px-1.5 py-0.5 rounded">
                            {newChatVerification.customerName || 'Registered Customer'}
                          </span>
                        )}
                      </div>
                    ) : newChatVerification.status === 'unconfirmed' ? (
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
                          <span>🟡 Valid Mobile ({newChatVerification.formatted}) • WhatsApp Unconfirmed</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>{newChatVerification.message || 'Invalid Indian mobile number format.'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer / Contact Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., Rajesh Sharma"
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#008069]"
                />
              </div>

              {/* Initial Greeting Message */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Initial Greeting Message</label>
                <textarea
                  rows={2}
                  value={newChatMessage}
                  onChange={(e) => setNewChatMessage(e.target.value)}
                  placeholder="Type initial greeting..."
                  className="w-full text-xs px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#008069] resize-none"
                />
              </div>

              {/* Quick Pick from Recent Complaints */}
              <div>
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Or Pick from Recent Complaints:
                </span>
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50">
                  {loadingRecent ? (
                    <div className="p-4 text-center text-xs text-slate-400">Loading complaints...</div>
                  ) : recentComplaintsList.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">No recent complaints</div>
                  ) : (
                    recentComplaintsList.slice(0, 5).map(c => (
                      <div
                        key={c.id}
                        onClick={() => handlePickRecentTicket(c)}
                        className="p-2.5 hover:bg-emerald-50/70 cursor-pointer flex items-center justify-between transition-colors text-xs"
                      >
                        <div className="min-w-0">
                          <strong className="text-slate-900 block truncate">{c.customer_name}</strong>
                          <span className="text-[11px] text-slate-500 font-mono">
                            📞 {c.customer_phone} • #{c.ticket_id}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-[#008069] shrink-0">
                          Select →
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewChatModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={startingChat}
                  className="px-5 py-2 bg-[#00a884] hover:bg-[#008f72] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {startingChat ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Open WhatsApp Thread</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: WHATSAPP SETTINGS & WABA ================= */}
      {isSettingsModalOpen && (
        <div 
          onClick={() => setIsSettingsModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200"
          >
            {/* Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm">WhatsApp Cloud API & Settings</h3>
                  <p className="text-[11px] text-slate-400">Meta Business Suite Integration Parameters</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-full text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs text-slate-700 max-h-[80vh] overflow-y-auto">
              {/* Account Status Card */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Meta Cloud API Status
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-full text-[10px] font-bold">
                    CONNECTED & LIVE
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Two-way messaging with customers is active. All inbound webhooks and outbound replies are permanently logged.
                </p>
              </div>

              {/* Technical Parameters Table */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 font-mono text-[11px]">
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-500 font-sans">Business Name:</span>
                  <strong className="text-slate-900 font-sans">Eco Green Solar</strong>
                </div>
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-500 font-sans">Registered Number:</span>
                  <strong className="text-emerald-700 font-bold">+91 78784 44414</strong>
                </div>
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-500 font-sans">Phone Number ID:</span>
                  <span className="text-slate-800">1387211441132836</span>
                </div>
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-500 font-sans">WABA ID:</span>
                  <span className="text-slate-800">1015283491554000</span>
                </div>
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-500 font-sans">Meta App ID:</span>
                  <span className="text-slate-800">2162649631332203</span>
                </div>
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-500 font-sans">Quality Rating:</span>
                  <span className="text-emerald-700 font-bold">HIGH (Green)</span>
                </div>
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-500 font-sans">Permanent Storage:</span>
                  <span className="text-slate-800">SQLite + /uploads/</span>
                </div>
              </div>

              {/* Sound & Notifications Preference */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                    {soundEnabled ? <Volume2 className="w-4 h-4 text-[#008069]" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                    Message Chime Sound
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Play notification audio when customer messages arrive
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={playNotificationChime}
                    className="text-[10px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleSound}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      soundEnabled ? 'bg-[#00a884]' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full bg-white block transition-transform absolute top-0.5 shadow-sm ${
                      soundEnabled ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Close Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Close Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CONTACT INFO ================= */}
      {isContactInfoOpen && (
        <div 
          onClick={() => setIsContactInfoOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
          >
            {/* Header */}
            <div className="p-6 bg-gradient-to-b from-[#008069] to-[#005c4b] text-white text-center relative">
              <button
                type="button"
                onClick={() => setIsContactInfoOpen(false)}
                className="absolute right-3 top-3 p-1 hover:bg-white/10 rounded-full text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-20 h-20 rounded-full bg-white text-[#008069] flex items-center justify-center font-bold text-2xl mx-auto shadow-lg mb-2">
                {renderAvatarContent(contactInfo?.sender_name || selectedConv?.sender_name, selectedPhone, "w-10 h-10 text-[#008069]")}
              </div>

              <div className="flex items-center justify-center gap-1.5 max-w-xs mx-auto">
                <h3 className="text-base font-bold truncate">
                  {contactInfo?.sender_name || selectedConv?.sender_name || 'Customer'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditedContactName(contactInfo?.sender_name || selectedConv?.sender_name || '');
                    setIsEditNameModalOpen(true);
                  }}
                  className="p-1 hover:bg-white/20 rounded-full text-white cursor-pointer shrink-0"
                  title="Edit Contact Name"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-emerald-200 font-mono mt-0.5">
                +91 {selectedPhone?.replace(/^91/, '')}
              </p>
            </div>

            {/* Content Details */}
            <div className="p-5 space-y-3.5 text-xs text-slate-700">
              {/* Linked Complaint Ticket */}
              {contactInfo?.ticket_id || selectedConv?.ticket_id ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-950 flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-blue-700" />
                      Active Ticket #{contactInfo?.ticket_id || selectedConv?.ticket_id}
                    </span>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      {selectedConv?.product_type || 'Solar System'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsContactInfoOpen(false);
                      const cId = contactInfo?.complaint?.id || selectedConv?.complaint_id;
                      if (onOpenComplaint && cId) onOpenComplaint(cId);
                    }}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Open Complaint Drawer</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>No complaint registered for this contact yet.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsContactInfoOpen(false);
                      if (onNewComplaintWithData) {
                        onNewComplaintWithData({
                          customer_name: contactInfo?.sender_name || selectedConv?.sender_name || '',
                          customer_phone: selectedPhone?.replace(/^91/, ''),
                          issue_description: 'Registered from WhatsApp conversation'
                        });
                      }
                    }}
                    className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-all text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>+ Register New Complaint Ticket</span>
                  </button>
                </div>
              )}

              {/* Quick Contact Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Phone</span>
                </button>
                <a
                  href={`tel:+91${selectedPhone?.replace(/^91/, '')}`}
                  className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-all text-center"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Direct Call</span>
                </a>
              </div>

              {/* Edit Contact Name Button */}
              <button
                type="button"
                onClick={() => {
                  setEditedContactName(contactInfo?.sender_name || selectedConv?.sender_name || '');
                  setIsEditNameModalOpen(true);
                }}
                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 rounded-xl font-bold transition-all text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-[#008069]" />
                <span>Edit Contact Name</span>
              </button>

              {/* Clear Chat Button */}
              <button
                type="button"
                onClick={() => { setIsContactInfoOpen(false); handleClearChat(); }}
                className="w-full py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl font-bold transition-all text-xs cursor-pointer"
              >
                Clear This Chat History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MEDIA PREVIEW MODAL ================= */}
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
      {/* ================= MODAL: EDIT CONTACT NAME ================= */}
      {isEditNameModalOpen && (
        <div 
          onClick={() => setIsEditNameModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200"
          >
            <div className="px-5 py-4 bg-gradient-to-r from-[#008069] to-[#005c4b] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4" />
                <h3 className="font-bold text-sm">Edit Contact Name</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditNameModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-full text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContactName} className="p-5 space-y-4 text-xs text-slate-700">
              <div>
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Mobile Number
                </span>
                <span className="block font-mono font-bold text-slate-900 bg-slate-100 px-3 py-2 rounded-xl text-xs">
                  +91 {selectedPhone?.replace(/^91/, '')}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Contact / Customer Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editedContactName}
                  onChange={(e) => setEditedContactName(e.target.value)}
                  placeholder="e.g. Ramesh Patel"
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#008069] font-medium"
                />
                <span className="block text-[10px] text-slate-400 mt-1">
                  This name will appear on WhatsApp Web and all conversation records.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditNameModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingContactName || !editedContactName.trim()}
                  className="px-5 py-2 bg-[#00a884] hover:bg-[#008f72] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {savingContactName ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Name</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
