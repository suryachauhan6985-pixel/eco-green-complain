import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, Download, Maximize2, RotateCw, ZoomIn, ZoomOut,
  FileText, ExternalLink, MapPin, Copy, Phone, User, Check,
  CheckCheck, Clock, AlertCircle, Eye, RefreshCw, X, Mic,
  FileSpreadsheet, Archive, File, Star, Smile, Plus, Paperclip
} from 'lucide-react';

/**
 * Parses WhatsApp markdown formatting:
 * *bold* -> <b>
 * _italic_ -> <i>
 * ~strikethrough~ -> <s>
 * ```code``` or `code` -> <code>
 * URLs -> <a> links
 * Filters out legacy raw placeholder strings like "[IMAGE file]", "[WhatsApp message]".
 */
export function WhatsAppTextRenderer({ text, className = '' }) {
  if (!text) return null;

  // Filter out raw fallback placeholder strings
  const trimmed = text.trim();
  const legacyPlaceholders = [
    '[IMAGE file]',
    '[VIDEO file]',
    '[DOCUMENT file]',
    '[AUDIO file]',
    '[WhatsApp message]',
    '🔘 [Interactive reply]',
    '🔘 [Button reply]',
    '🎤 Voice Note'
  ];
  if (legacyPlaceholders.includes(trimmed)) {
    return null;
  }

  // Domain replacement if legacy URL present
  const normalizedText = text.replace(
    /https?:\/\/eco-green-complain\.vprotech\.online/g,
    'https://complain.ecogreensolar.co.in'
  );

  // Parse lines and WhatsApp formatting tokens
  const lines = normalizedText.split('\n');

  return (
    <div className={`whitespace-pre-wrap break-words leading-relaxed select-text font-normal text-[13px] text-[#111b21] ${className}`}>
      {lines.map((line, lineIdx) => (
        <React.Fragment key={lineIdx}>
          {parseWhatsAppLine(line)}
          {lineIdx < lines.length - 1 && '\n'}
        </React.Fragment>
      ))}
    </div>
  );
}

function parseWhatsAppLine(line) {
  if (!line) return '';

  // Regex for URLs, *bold*, _italic_, ~strike~, `code`
  const tokenRegex = /(https?:\/\/[^\s]+|\*[^\s*]+(?:\s+[^\s*]+)*\*|_[^\s_]+(?:\s+[^\s_]+)*_|~[^\s~]+(?:\s+[^\s~]+)*~|`[^`]+`)/g;
  const parts = line.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // URL
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[#027eb5] hover:underline font-medium break-all"
        >
          {part}
        </a>
      );
    }

    // *bold*
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <strong key={idx} className="font-bold">{part.slice(1, -1)}</strong>;
    }

    // _italic_
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      return <em key={idx} className="italic">{part.slice(1, -1)}</em>;
    }

    // ~strikethrough~
    if (part.startsWith('~') && part.endsWith('~') && part.length > 2) {
      return <del key={idx} className="line-through opacity-80">{part.slice(1, -1)}</del>;
    }

    // `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={idx} className="font-mono bg-black/5 px-1 py-0.5 rounded text-[12px] text-[#00a884]">
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}

/**
 * Authentic WhatsApp Voice Note Player
 * Features:
 * - Signature 32-bar waveform scrubber
 * - Circular play/pause button
 * - 1x / 1.5x / 2x speed toggle pill
 * - Live playback timer & total duration
 * - Microphone avatar badge
 */
export function WhatsAppVoiceNotePlayer({ audioUrl, isOutgoing = false, onDownload }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handleError = () => {
      setAudioError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const togglePlay = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn('Voice note playback error:', err);
      });
    }
  };

  const toggleSpeed = (e) => {
    e.stopPropagation();
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * duration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const formatSecs = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // 32 pseudo-random bar heights for realistic voice waveform visualization
  const waveformHeights = [
    20, 45, 75, 30, 60, 90, 40, 70, 85, 35, 65, 95, 50, 80, 45, 60,
    75, 90, 40, 55, 70, 85, 30, 65, 80, 45, 60, 75, 35, 50, 65, 40
  ];

  const progressRatio = duration > 0 ? currentTime / duration : 0;

  if (audioError) {
    return (
      <div className="mb-2 p-3 rounded-lg bg-black/5 border border-black/10 flex items-center justify-between gap-3 text-xs text-slate-700">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-600">Voice Note (Unavailable)</span>
        </div>
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="p-1 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
            title="Download Voice Note"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 p-2.5 rounded-xl bg-black/5 border border-black/5 max-w-[340px] select-none">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#008f6f] text-white flex items-center justify-center shrink-0 shadow-md transition-transform active:scale-95 cursor-pointer"
          title={isPlaying ? 'Pause' : 'Play Voice Note'}
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
        </button>

        {/* Waveform Scrubber & Timer */}
        <div className="flex-1 min-w-0">
          {/* Interactive Waveform Bars */}
          <div
            onClick={handleSeek}
            className="h-8 flex items-center gap-[2.5px] cursor-pointer py-1"
            title="Click to seek"
          >
            {waveformHeights.map((h, idx) => {
              const barRatio = idx / waveformHeights.length;
              const isPlayed = barRatio <= progressRatio;
              return (
                <div
                  key={idx}
                  className="flex-1 rounded-full transition-colors duration-150"
                  style={{
                    height: `${h}%`,
                    backgroundColor: isPlayed ? '#00a884' : '#8696a0'
                  }}
                />
              );
            })}
          </div>

          {/* Time & Mic status */}
          <div className="flex items-center justify-between text-[11px] font-mono text-[#667781] mt-0.5">
            <span>{isPlaying ? formatSecs(currentTime) : formatSecs(duration || currentTime)}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#00a884] font-semibold flex items-center gap-0.5">
                <Mic className="w-3 h-3" />
                <span>Voice</span>
              </span>
            </div>
          </div>
        </div>

        {/* Playback Speed Selector */}
        <button
          type="button"
          onClick={toggleSpeed}
          className="px-2 py-1 rounded-full bg-white/80 hover:bg-white text-[#111b21] border border-black/10 text-[11px] font-bold font-mono shrink-0 transition-colors shadow-2xs cursor-pointer"
          title="Toggle speed (1x, 1.5x, 2x)"
        >
          {playbackSpeed}x
        </button>
      </div>
    </div>
  );
}

/**
 * Authentic WhatsApp Document Card
 * Recognizes PDF, Excel, Word, Archive, Text files with specialized color icons.
 */
export function WhatsAppDocumentCard({
  docUrl,
  docName = 'Document',
  fileSizeStr,
  onOpenPdf,
  onDownload,
  onAttachToComplaint
}) {
  const ext = (docName.split('.').pop() || '').toLowerCase();

  let IconComponent = FileText;
  let iconBgClass = 'bg-red-500/10 text-red-600';
  let badgeLabel = 'PDF';

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    IconComponent = FileSpreadsheet;
    iconBgClass = 'bg-emerald-500/10 text-emerald-600';
    badgeLabel = 'EXCEL';
  } else if (['docx', 'doc', 'rtf'].includes(ext)) {
    IconComponent = FileText;
    iconBgClass = 'bg-blue-500/10 text-blue-600';
    badgeLabel = 'DOC';
  } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    IconComponent = Archive;
    iconBgClass = 'bg-amber-500/10 text-amber-600';
    badgeLabel = 'ZIP';
  } else if (ext === 'pdf') {
    IconComponent = FileText;
    iconBgClass = 'bg-red-500/10 text-red-600';
    badgeLabel = 'PDF';
  } else {
    IconComponent = File;
    iconBgClass = 'bg-slate-500/10 text-slate-600';
    badgeLabel = ext.toUpperCase() || 'FILE';
  }

  const isPdf = ext === 'pdf';

  return (
    <div
      onClick={isPdf && onOpenPdf ? onOpenPdf : onDownload}
      className="mb-2 p-3 bg-black/5 hover:bg-emerald-50/70 rounded-xl flex items-center justify-between gap-3 border border-black/5 hover:border-emerald-300 transition-all cursor-pointer group max-w-sm shadow-2xs"
      title={isPdf ? 'Click to open PDF inside app' : 'Click to download document'}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-11 h-11 rounded-xl ${iconBgClass} flex items-center justify-center shrink-0 shadow-2xs transition-transform group-hover:scale-105`}>
          <IconComponent className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-xs text-[#111b21] group-hover:text-[#008069] truncate max-w-[210px] transition-colors">
            {docName}
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-[#667781] font-mono mt-0.5">
            <span className="font-bold uppercase tracking-wider">{badgeLabel}</span>
            {fileSizeStr && <span>• {fileSizeStr}</span>}
            {isPdf && (
              <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                • <Eye className="w-3 h-3" /> Read in app
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {onAttachToComplaint && (
          <button
            type="button"
            onClick={onAttachToComplaint}
            className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-full transition-colors cursor-pointer"
            title="Attach to Complaint / Ticket"
          >
            <Paperclip className="w-4 h-4" />
          </button>
        )}
        {isPdf && onOpenPdf && (
          <button
            type="button"
            onClick={onOpenPdf}
            className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-full transition-colors cursor-pointer"
            title="Read PDF inside app"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="p-1.5 text-[#54656f] hover:text-[#111b21] hover:bg-white/80 rounded-full transition-colors cursor-pointer"
            title="Download document"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Authentic WhatsApp Location Pin Card
 */
export function WhatsAppLocationCard({
  mapsUrl,
  title = 'Shared Location Pin',
  address = '',
  onCopy
}) {
  return (
    <div className="mb-2 p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200/90 flex flex-col gap-2 max-w-sm shadow-2xs">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-full bg-[#008069] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
          <MapPin className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-xs text-[#111b21] flex items-center gap-1">
            <span>{title}</span>
          </p>
          {address && (
            <p className="text-[11px] text-[#54656f] mt-0.5 truncate font-sans">
              {address}
            </p>
          )}
          {mapsUrl && !address && (
            <p className="text-[10px] text-[#54656f] mt-0.5 truncate font-mono">
              {mapsUrl}
            </p>
          )}
        </div>
      </div>

      {mapsUrl && (
        <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/70">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="px-2.5 py-1 bg-[#008069] hover:bg-[#00705b] text-white text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in Google Maps</span>
          </a>
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold rounded-md border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Copy className="w-3 h-3 text-slate-500" />
              <span>Copy Link</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Authentic WhatsApp Contact Card (vCard)
 */
export function WhatsAppContactCard({
  contactName = 'Contact',
  phone = '',
  onMessage,
  onSaveContact
}) {
  return (
    <div className="mb-2 p-3 rounded-xl bg-black/5 border border-black/10 flex flex-col gap-2.5 max-w-sm shadow-2xs">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
          <User className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-xs text-[#111b21] truncate">{contactName}</p>
          <p className="text-[11px] text-[#54656f] font-mono mt-0.5">{phone || 'WhatsApp Contact'}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-black/10">
        {onMessage && phone && (
          <button
            type="button"
            onClick={onMessage}
            className="flex-1 py-1.5 px-3 bg-[#008069] hover:bg-[#00705b] text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Message</span>
          </button>
        )}
        {onSaveContact && (
          <button
            type="button"
            onClick={onSaveContact}
            className="flex-1 py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-800 text-[11px] font-bold rounded-lg border border-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Save Contact</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Authentic WhatsApp Interactive Buttons (Template Quick Replies & List Actions)
 */
export function WhatsAppInteractiveButtons({
  buttons = [],
  onButtonClick
}) {
  if (!buttons || buttons.length === 0) return null;

  return (
    <div className="mt-2 pt-1 border-t border-black/10 flex flex-col gap-1.5">
      {buttons.map((btn, idx) => (
        <button
          key={btn.id || idx}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onButtonClick) onButtonClick(btn);
          }}
          className="w-full py-1.5 px-3 rounded-lg bg-white/90 hover:bg-[#00a884] hover:text-white text-[#00a884] border border-[#00a884]/30 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
        >
          {btn.icon || '🔘'} <span>{btn.title || btn.text || 'Action'}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Authentic WhatsApp Quoted / Replied Message Banner
 */
export function WhatsAppQuotedPreview({
  quotedText,
  senderName = 'You',
  onClick
}) {
  if (!quotedText) return null;

  return (
    <div
      onClick={onClick}
      className="mb-1.5 p-2 rounded-lg bg-black/5 hover:bg-black/10 border-l-4 border-[#00a884] text-xs transition-colors cursor-pointer select-none max-w-sm"
      title="Click to jump to quoted message"
    >
      <p className="font-bold text-[#00a884] text-[11px] mb-0.5 truncate">{senderName}</p>
      <p className="text-[#54656f] text-[11px] truncate max-w-xs leading-snug">
        {quotedText}
      </p>
    </div>
  );
}

/**
 * Authentic WhatsApp Message Status Indicator (Ticks + Time + Star)
 */
export function WhatsAppMessageStatusTick({
  status = 'sent',
  isEdited = false,
  isStarred = false,
  timeStr = '',
  fullDateTimeStr = '',
  isCustomer = false,
  onRetry
}) {
  return (
    <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] mt-1 ml-3 select-none float-right">
      {isStarred && (
        <Star className="w-3 h-3 fill-amber-400 text-amber-400 mr-0.5 inline-block shrink-0" title="Starred message" />
      )}
      {isEdited && (
        <span className="italic text-[9px] text-[#8696a0] mr-0.5 font-sans">(edited)</span>
      )}
      <span title={fullDateTimeStr}>{timeStr}</span>

      {!isCustomer && (
        <span className="inline-flex items-center ml-0.5">
          {status === 'read' ? (
            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" title="Read" />
          ) : status === 'delivered' ? (
            <CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" title="Delivered" />
          ) : status === 'failed' ? (
            <span
              onClick={onRetry}
              className="inline-flex items-center gap-0.5 text-rose-600 font-bold text-[9px] bg-rose-50 px-1 py-0.5 rounded border border-rose-200 cursor-pointer hover:bg-rose-100"
              title="Failed to deliver. Click to retry."
            >
              <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
              <span>Retry</span>
            </span>
          ) : status === 'pending' ? (
            <Clock className="w-3.5 h-3.5 text-[#8696a0]" title="Sending..." />
          ) : (
            <Check className="w-3.5 h-3.5 text-[#8696a0]" title="Sent" />
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Authentic WhatsApp Reaction Pill (Rendered at bottom edge of message bubble)
 */
export function WhatsAppReactionPill({
  reactions = [],
  currentUserId = 'staff',
  onReactionClick
}) {
  let list = [];
  try {
    list = typeof reactions === 'string' ? JSON.parse(reactions) : (Array.isArray(reactions) ? reactions : []);
  } catch (_) {
    list = [];
  }

  if (!list || list.length === 0) return null;

  // Group by emoji
  const grouped = {};
  list.forEach((r) => {
    if (!r || !r.emoji) return;
    if (!grouped[r.emoji]) {
      grouped[r.emoji] = { count: 0, users: [], hasUserReacted: false };
    }
    grouped[r.emoji].count += 1;
    grouped[r.emoji].users.push(r.user_name || (r.user_id === 'customer' ? 'Customer' : 'Staff'));
    if (r.user_id === currentUserId) {
      grouped[r.emoji].hasUserReacted = true;
    }
  });

  const entries = Object.entries(grouped);
  if (entries.length === 0) return null;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute -bottom-2.5 right-3 flex items-center gap-1 z-10 select-none animate-in fade-in zoom-in-75 duration-150"
    >
      {entries.map(([emoji, data]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReactionClick && onReactionClick(emoji)}
          className={`px-1.5 py-0.5 rounded-full bg-white border text-xs shadow-2xs flex items-center gap-1 hover:scale-110 active:scale-95 transition-all cursor-pointer ${
            data.hasUserReacted
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-400/30'
              : 'border-slate-200 text-slate-700'
          }`}
          title={`${data.users.join(', ')} (${data.hasUserReacted ? 'Click to remove' : 'Click to react'})`}
        >
          <span className="text-[13px] leading-none">{emoji}</span>
          {data.count > 1 && (
            <span className="text-[10px] font-bold text-slate-600">{data.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Authentic WhatsApp Web Hover Reaction Button & Click Popup Picker
 * - On hover only: displays a single subtle reaction button beside the bubble
 * - On click: opens the full reaction picker (👍 ❤️ 😂 😮 😢 🙏) in a clean popup
 * - Never overlaps or pushes the message above it
 */
export function WhatsAppReactionButtonWithPicker({
  msgId,
  isOutgoing = false,
  isOpen = false,
  onToggleOpen,
  onReact
}) {
  const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  return (
    <div className={`relative flex items-center shrink-0 self-center transition-opacity duration-150 ${
      isOutgoing ? 'mr-1.5' : 'ml-1.5'
    } ${isOpen ? 'opacity-100 z-40' : 'opacity-0 group-hover:opacity-100 z-10'}`}>
      {/* Small Single Reaction Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleOpen && onToggleOpen();
        }}
        className="msg-reaction-trigger w-6 h-6 rounded-full bg-white/95 hover:bg-white text-slate-500 hover:text-slate-800 shadow-xs border border-slate-200/90 flex items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95"
        title="React to message"
      >
        <span className="text-[12px] leading-none select-none">👍</span>
      </button>

      {/* Floating Reaction Picker Popup on Click */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`msg-reaction-picker-container absolute bottom-full mb-1.5 ${
            isOutgoing ? 'right-0' : 'left-0'
          } z-50 flex items-center gap-1 px-2 py-1 bg-white/95 backdrop-blur-md rounded-full shadow-xl border border-slate-200/90 popover-enter select-none ring-1 ring-black/5`}
        >
          {quickEmojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReact && onReact(emoji);
              }}
              className="w-7 h-7 flex items-center justify-center text-base hover:scale-130 transition-transform cursor-pointer rounded-full hover:bg-slate-100 active:scale-95"
              title={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Backward compatibility export
 */
export function WhatsAppQuickReactionHover() {
  return null;
}

/**
 * High-Resolution WhatsApp Lightbox Modal for Images & Videos
 * Features:
 * - Zoom In (+), Zoom Out (-), Reset
 * - Rotate 90°
 * - Download High Res
 * - Close via Esc or outside click
 */
export function WhatsAppMediaLightbox({
  media,
  onClose,
  onDownload,
  onAttachToComplaint
}) {
  const isVideo = media && (media.type === 'video' || (media.url && /\.(mp4|webm|mov)($|\?)/i.test(media.url)));

  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Gesture tracking refs
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const touchDistanceRef = useRef(null);
  const touchStartZoomRef = useRef(1);
  const lastTapRef = useRef(0);

  // Synchronize refs with state
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Reset zoom and pan
  const handleReset = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Zoom adjustment helper
  const adjustZoom = useCallback((delta) => {
    setZoom((prev) => {
      const next = Math.min(5, Math.max(0.5, Number((prev + delta).toFixed(2))));
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  // Mouse Wheel Zoom (Desktop)
  const handleWheel = useCallback((e) => {
    if (isVideo) return;
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom((prev) => {
      const next = Math.min(5, Math.max(0.5, Number((prev + delta).toFixed(2))));
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  }, [isVideo]);

  // Attach non-passive wheel listener on container to prevent page scroll while zooming
  useEffect(() => {
    const el = containerRef.current;
    if (!el || isVideo) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel, isVideo]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (isVideo) return;
      if (e.key === '+' || e.key === '=') adjustZoom(0.25);
      if (e.key === '-') adjustZoom(-0.25);
      if (e.key === '0' || e.key === 'r') handleReset();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, adjustZoom, handleReset, isVideo]);

  // Mouse Drag to Pan (Desktop)
  const handleMouseDown = (e) => {
    if (zoom <= 1 || isVideo) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging || zoom <= 1 || isVideo) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Double click to toggle zoom (Desktop)
  const handleDoubleClick = (e) => {
    if (isVideo) return;
    e.stopPropagation();
    if (zoom > 1.2) {
      handleReset();
    } else {
      setZoom(2.5);
    }
  };

  // Mobile Touch Gestures: Pinch-to-zoom & Touch Pan
  const handleTouchStart = (e) => {
    if (isVideo) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceRef.current = dist;
      touchStartZoomRef.current = zoomRef.current;
      return;
    }

    if (e.touches.length === 1) {
      const now = Date.now();
      // Double-tap to toggle zoom
      if (now - lastTapRef.current < 300) {
        e.preventDefault();
        if (zoomRef.current > 1.2) {
          handleReset();
        } else {
          setZoom(2.5);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (zoomRef.current > 1) {
        setIsDragging(true);
        dragStartRef.current = {
          x: e.touches[0].clientX - positionRef.current.x,
          y: e.touches[0].clientY - positionRef.current.y,
        };
      }
    }
  };

  const handleTouchMove = (e) => {
    if (isVideo) return;
    if (e.touches.length === 2 && touchDistanceRef.current) {
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = currentDist / touchDistanceRef.current;
      const next = Math.min(5, Math.max(0.5, Number((touchStartZoomRef.current * ratio).toFixed(2))));
      setZoom(next);
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return;
    }

    if (e.touches.length === 1 && isDragging && zoomRef.current > 1) {
      e.preventDefault();
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      touchDistanceRef.current = null;
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
    }
  };

  if (!media || !media.url) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 backdrop-enter-fade select-none"
    >
      {/* Lightbox Top Navigation Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl flex items-center justify-between text-white py-2 z-10"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate max-w-md">
            {media.title || (isVideo ? 'WhatsApp Video' : 'WhatsApp Photo')}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isVideo && (
            <>
              <button
                type="button"
                onClick={() => adjustZoom(-0.25)}
                disabled={zoom <= 0.5}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white transition-colors cursor-pointer"
                title="Zoom Out (- or Scroll Down)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-mono px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-emerald-400 font-bold transition-colors cursor-pointer"
                title="Reset Zoom & Pan (Double Click to toggle)"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => adjustZoom(0.25)}
                disabled={zoom >= 5}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white transition-colors cursor-pointer"
                title="Zoom In (+ or Scroll Up)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setRotation(r => (r + 90) % 360)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Rotate 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Reset Zoom & Pan"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          )}

          {onAttachToComplaint && (
            <button
              type="button"
              onClick={onAttachToComplaint}
              className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer mr-1"
              title="Attach to Complaint / Ticket"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attach to Ticket</span>
            </button>
          )}

          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Download Media"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer ml-2"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Media Canvas */}
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`flex-1 w-full max-w-5xl flex items-center justify-center overflow-hidden my-2 modal-enter-scale select-none ${
          !isVideo && zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
      >
        {isVideo ? (
          <video
            src={media.url}
            controls
            autoPlay
            playsInline
            className="max-h-[82vh] max-w-full rounded-lg object-contain shadow-2xl bg-black"
          />
        ) : (
          <img
            src={media.url}
            alt="WhatsApp Media"
            draggable={false}
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              willChange: 'transform',
            }}
            className="max-h-[82vh] max-w-full object-contain rounded-lg shadow-2xl select-none"
          />
        )}
      </div>

      {/* Lightbox Footer Caption & Interaction Tip */}
      <div className="w-full max-w-2xl flex flex-col items-center gap-1.5 z-10">
        {!isVideo && (
          <div className="text-[11px] text-white/50 tracking-wide font-medium">
            Scroll mouse wheel to zoom • Drag to pan • Double click to toggle
          </div>
        )}
        {media.caption && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-black/60 backdrop-blur-md text-white text-center py-2 px-4 rounded-xl text-xs"
          >
            {media.caption}
          </div>
        )}
      </div>
    </div>
  );
}
