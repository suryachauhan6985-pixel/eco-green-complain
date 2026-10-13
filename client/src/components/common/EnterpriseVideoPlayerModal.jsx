import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCw,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Download,
  ExternalLink,
  X,
  Film,
  Gauge,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';
import { getAuthToken } from '../../api/client';

/**
 * EnterpriseVideoPlayerModal
 * 
 * Full-Window (100vw x 100vh) Enterprise Customer Video Player.
 * Features:
 * 1. True Edge-to-Edge full window layout with native browser fullscreen toggle.
 * 2. Explicit handling for blob:, data:, and Cloudflare R2 remote URLs.
 * 3. Prominent real-time loading spinner overlay during load, buffer, and seek.
 * 4. High-contrast seek scrubber with buffer indicator, -5s/+5s jumps, and no 0:00 reset.
 * 5. Sound controls, volume slider, playback speeds (0.5x - 2x), 90° rotation.
 * 6. Responsive controls that auto-hide on inactivity during playback.
 */
export function EnterpriseVideoPlayerModal({
  isOpen,
  onClose,
  videoUrl,
  fileName = 'Site Video'
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressBarRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [videoMeta, setVideoMeta] = useState({ isLandscape: true, width: 0, height: 0 });

  const controlsTimeoutRef = useRef(null);

  useEscapeHandler(onClose, isOpen, ESCAPE_PRIORITY.MODAL);

  // Authenticated stream URL:
  // CRITICAL: blob: and data: URLs MUST NEVER have query parameters appended!
  const effectiveStreamUrl = React.useMemo(() => {
    if (!videoUrl) return '';
    if (typeof videoUrl === 'string' && (videoUrl.startsWith('blob:') || videoUrl.startsWith('data:'))) {
      return videoUrl;
    }
    const token = getAuthToken();
    const separator = videoUrl.includes('?') ? '&' : '?';
    let url = `${videoUrl}${separator}stream=1`;
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }
    return url;
  }, [videoUrl]);

  const effectiveDownloadUrl = React.useMemo(() => {
    if (!videoUrl) return '';
    if (typeof videoUrl === 'string' && (videoUrl.startsWith('blob:') || videoUrl.startsWith('data:'))) {
      return videoUrl;
    }
    const token = getAuthToken();
    const separator = videoUrl.includes('?') ? '&' : '?';
    let url = `${videoUrl}${separator}download=1`;
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }
    return url;
  }, [videoUrl]);

  const baseTimeOffsetRef = useRef(null);
  const maxObservedDurationRef = useRef(0);

  // Probe true media duration when browser reports corrupt or infinite duration
  const probeDuration = useCallback((url, startOffset) => {
    if (!url) return;
    try {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.muted = true;
      probe.playsInline = true;
      probe.src = url;

      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        probe.removeAttribute('src');
        probe.load();
        probe.remove();
      };

      const timeout = setTimeout(cleanup, 4500);

      probe.onloadedmetadata = () => {
        if (Number.isFinite(probe.duration) && probe.duration > 0 && probe.duration <= 3600 && startOffset === 0) {
          setDuration(probe.duration);
          maxObservedDurationRef.current = Math.max(maxObservedDurationRef.current, probe.duration);
          clearTimeout(timeout);
          cleanup();
          return;
        }
        // Force Chromium to seek to the end to discover true end timestamp
        try {
          probe.currentTime = 1e101;
        } catch (_) {}
      };

      probe.onseeked = () => {
        const rawEnd = probe.currentTime;
        if (Number.isFinite(rawEnd) && rawEnd > 0) {
          const realDur = startOffset > 0 ? (rawEnd - startOffset) : (rawEnd > 3600 ? 0 : rawEnd);
          if (realDur > 0 && realDur < 3600) {
            setDuration(realDur);
            maxObservedDurationRef.current = Math.max(maxObservedDurationRef.current, realDur);
          }
        }
        clearTimeout(timeout);
        cleanup();
      };

      probe.onerror = () => {
        clearTimeout(timeout);
        cleanup();
      };
    } catch (_) {}
  }, []);

  // Reset & reinitialize video whenever modal opens or videoUrl changes
  useEffect(() => {
    if (isOpen && videoUrl) {
      setIsPlaying(false);
      setIsLoading(true);
      setCurrentTime(0);
      setDuration(0);
      setBufferedPercent(0);
      setRotation(0);
      setVideoError(null);
      setShowControls(true);
      baseTimeOffsetRef.current = null;
      maxObservedDurationRef.current = 0;

      // Force video element to reload source immediately
      if (videoRef.current) {
        try {
          videoRef.current.load();
          const p = videoRef.current.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              setIsPlaying(true);
              setIsLoading(false);
            }).catch(() => {
              // Browser policy may prevent unmuted autoplay; user can click play
              setIsPlaying(false);
              setIsLoading(false);
            });
          }
        } catch (_) {
          setIsLoading(false);
        }
      }
    }
  }, [isOpen, videoUrl]);

  // Sync fullscreen change with document state
  useEffect(() => {
    const handleFsChange = () => {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Video Time Update & Buffer Progress (with stream timestamp offset normalization)
  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || isSeeking) return;

    // Detect base timestamp offset from first frames
    if (baseTimeOffsetRef.current === null) {
      if (v.seekable && v.seekable.length > 0 && v.seekable.start(0) > 10) {
        baseTimeOffsetRef.current = v.seekable.start(0);
      } else if (v.currentTime > 10) {
        baseTimeOffsetRef.current = v.currentTime;
      } else {
        baseTimeOffsetRef.current = 0;
      }
    }

    const offset = baseTimeOffsetRef.current || 0;
    const relCur = Math.max(0, (v.currentTime || 0) - offset);
    setCurrentTime(relCur);

    // Track max observed duration
    if (relCur > maxObservedDurationRef.current) {
      maxObservedDurationRef.current = relCur;
      if (duration < relCur) {
        setDuration(relCur);
      }
    }

    const dur = duration > 0 ? duration : maxObservedDurationRef.current;
    const buf = v.buffered;
    if (buf && buf.length > 0 && dur > 0) {
      for (let i = 0; i < buf.length; i++) {
        const bStart = Math.max(0, buf.start(i) - offset);
        const bEnd = Math.max(0, buf.end(i) - offset);
        if (bStart <= relCur && relCur <= bEnd) {
          setBufferedPercent(Math.min(100, Math.max(0, (bEnd / dur) * 100)));
          break;
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setIsLoading(false);

    // Detect starting offset
    let startOffset = 0;
    if (v.seekable && v.seekable.length > 0 && v.seekable.start(0) > 10) {
      startOffset = v.seekable.start(0);
      baseTimeOffsetRef.current = startOffset;
    } else if (v.currentTime > 10) {
      startOffset = v.currentTime;
      baseTimeOffsetRef.current = startOffset;
    } else {
      baseTimeOffsetRef.current = 0;
    }

    // Evaluate duration
    const d = v.duration;
    if (Number.isFinite(d) && d > 0 && d <= 3600 && startOffset === 0) {
      setDuration(d);
      maxObservedDurationRef.current = d;
    } else {
      // Stream duration is corrupt or offset, probe real length
      if (v.seekable && v.seekable.length > 0) {
        const sDur = v.seekable.end(v.seekable.length - 1) - startOffset;
        if (sDur > 0 && sDur <= 3600) {
          setDuration(sDur);
          maxObservedDurationRef.current = sDur;
        }
      }
      probeDuration(effectiveStreamUrl, startOffset);
    }

    const w = v.videoWidth || 0;
    const h = v.videoHeight || 0;
    setVideoMeta({
      isLandscape: w >= h,
      width: w,
      height: h
    });
    setVideoError(null);
  };

  const handleDurationChange = () => {
    const v = videoRef.current;
    if (!v) return;
    const offset = baseTimeOffsetRef.current || 0;
    const d = v.duration;
    if (Number.isFinite(d) && d > 0 && d <= 3600 && offset === 0) {
      setDuration(d);
      maxObservedDurationRef.current = Math.max(maxObservedDurationRef.current, d);
    }
  };

  // Play / Pause Toggle
  const togglePlay = useCallback((e) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;

    if (videoRef.current.paused || videoRef.current.ended) {
      const p = videoRef.current.play();
      if (p && typeof p.then === 'function') {
        p.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        setIsPlaying(true);
      }
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  // Jump -5s / +5s (Relative to base offset with safe bounds)
  const jumpTime = useCallback((seconds, e) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    const offset = baseTimeOffsetRef.current || 0;
    const currentRel = Math.max(0, (videoRef.current.currentTime || 0) - offset);
    const dur = duration > 0 ? duration : (maxObservedDurationRef.current || 600);
    const targetRel = Math.max(0, Math.min(dur, currentRel + seconds));
    const targetHw = offset + targetRel;

    setCurrentTime(targetRel);
    try {
      videoRef.current.currentTime = targetHw;
      if (videoRef.current.paused && isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Jump error:', err);
    }
  }, [duration, isPlaying]);

  // Smooth Seek Bar Click & Drag Handling (Supports both Mouse and Touch)
  const handleSeek = useCallback((clientX) => {
    if (!progressBarRef.current || !videoRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dur = duration > 0 ? duration : (maxObservedDurationRef.current || 30);
    const targetRelTime = pos * dur;
    const offset = baseTimeOffsetRef.current || 0;
    const targetHwTime = offset + targetRelTime;

    setCurrentTime(targetRelTime);
    try {
      videoRef.current.currentTime = targetHwTime;
      if (videoRef.current.paused && isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      console.warn('Seek error:', e);
    }
  }, [duration, isPlaying]);

  const handleSeekStart = (e) => {
    e.stopPropagation();
    setIsSeeking(true);
    handleSeek(e.clientX);

    const onMove = (moveEvent) => handleSeek(moveEvent.clientX);
    const onUp = () => {
      setIsSeeking(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTouchSeekStart = (e) => {
    e.stopPropagation();
    setIsSeeking(true);
    if (e.touches && e.touches[0]) {
      handleSeek(e.touches[0].clientX);
    }

    const onMove = (moveEvent) => {
      if (moveEvent.touches && moveEvent.touches[0]) {
        handleSeek(moveEvent.touches[0].clientX);
      }
    };
    const onUp = () => {
      setIsSeeking(false);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp, { passive: true });
  };

  // Volume & Mute handling
  const handleVolumeChange = (e) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = (e) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
    if (!nextMuted && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
  };

  // Speed selection
  const cycleSpeed = (e) => {
    if (e) e.stopPropagation();
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  };

  // Rotation
  const rotateVideo = (e) => {
    if (e) e.stopPropagation();
    setRotation(prev => (prev + 90) % 360);
  };

  // Native Fullscreen toggle
  const toggleFullscreen = (e) => {
    if (e) e.stopPropagation();
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Auto-hide controls during playback
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        jumpTime(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        jumpTime(5);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        rotateVideo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, togglePlay, jumpTime]);

  const handleDownload = (e) => {
    if (e) e.stopPropagation();
    if (!effectiveDownloadUrl) return;
    const a = document.createElement('a');
    a.href = effectiveDownloadUrl;
    a.download = fileName || 'video.mp4';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatTime = (secs) => {
    if (!Number.isFinite(secs) || secs < 0) return '00:00';
    const total = Math.floor(secs);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-[99999] w-screen h-screen bg-black flex flex-col overflow-hidden select-none animate-in fade-in duration-150"
    >
      {/* Top Header Bar Overlay */}
      <div 
        className={`absolute top-0 left-0 right-0 p-3 sm:p-5 bg-gradient-to-b from-black/95 via-black/70 to-transparent flex items-center justify-between gap-3 z-40 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/50 flex items-center justify-center text-teal-400 shrink-0">
            <Film className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-xl" title={fileName}>
              {fileName}
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                {videoMeta.isLandscape ? 'Landscape 16:9' : 'Portrait 9:16'}
              </span>
              {rotation !== 0 && (
                <span className="text-teal-400 font-bold">• Rotated {rotation}°</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Header Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={rotateVideo}
            className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700/60"
            title="Rotate 90 degrees (R)"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rotate</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
            title="Download video file"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>

          <a
            href={effectiveDownloadUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700/60"
            title="Open in Full Tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Full Tab</span>
          </a>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs transition-colors cursor-pointer border border-slate-700/60"
            title={isBrowserFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
          >
            {isBrowserFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 hover:text-white text-xs transition-colors cursor-pointer border border-rose-500/30 ml-1"
            title="Close Video Player (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Central Viewport Area - 100% Window Fit */}
      <div 
        className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden cursor-pointer"
        onClick={togglePlay}
      >
        {/* Main Video Element */}
        <video
          ref={videoRef}
          src={effectiveStreamUrl}
          playsInline
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleDurationChange}
          onLoadStart={() => setIsLoading(true)}
          onWaiting={() => setIsLoading(true)}
          onSeeking={() => setIsLoading(true)}
          onSeeked={() => setIsLoading(false)}
          onCanPlay={() => setIsLoading(false)}
          onLoadedData={() => setIsLoading(false)}
          onPlay={() => {
            setIsPlaying(true);
            setIsLoading(false);
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setShowControls(true);
          }}
          onError={(e) => {
            console.warn('[Video Player Load Error]:', e);
            setIsLoading(false);
            setVideoError('The video could not be played inline. You can download the full original MP4 file directly using the button above.');
          }}
          style={{
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transition: 'transform 0.25s ease-out'
          }}
          className="w-full h-full object-contain pointer-events-none"
        />

        {/* Loading Spinner Overlay */}
        {isLoading && !videoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs z-30 pointer-events-none">
            <Loader2 className="w-14 h-14 text-teal-400 animate-spin mb-3" />
            <p className="text-sm font-bold text-white tracking-wide">Loading Video...</p>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">Buffering stream</p>
          </div>
        )}

        {/* Large Center Play Button Overlay */}
        {!isPlaying && !isLoading && !videoError && (
          <div 
            className="absolute inset-0 flex items-center justify-center z-25 cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-teal-500/95 hover:bg-teal-400 text-slate-950 flex items-center justify-center shadow-2xl backdrop-blur-sm transform transition-all hover:scale-110 active:scale-95 cursor-pointer">
              <Play className="w-10 h-10 sm:w-12 sm:h-12 ml-1.5 fill-current" />
            </div>
          </div>
        )}

        {/* Video Playback Error Fallback Card */}
        {videoError && (
          <div 
            className="absolute inset-4 max-w-md m-auto p-6 bg-slate-900/95 border border-amber-500/40 rounded-2xl flex flex-col items-center text-center shadow-2xl z-35"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h5 className="text-sm font-bold text-white mb-1">Direct Stream Notice</h5>
            <p className="text-xs text-slate-400 mb-4">{videoError}</p>
            <button
              type="button"
              onClick={handleDownload}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download Original Video
            </button>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div 
        className={`absolute bottom-0 left-0 right-0 p-3 sm:p-5 bg-gradient-to-t from-black/95 via-black/75 to-transparent z-40 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Interactive Seek Bar (Supports both Mouse & Touch scrubbing) */}
        <div 
          ref={progressBarRef}
          onMouseDown={handleSeekStart}
          onTouchStart={handleTouchSeekStart}
          className="relative w-full py-2.5 group flex items-center cursor-pointer mb-2 select-none touch-none"
        >
          {/* Base background track */}
          <div className="w-full h-1.5 sm:h-2 group-hover:h-2.5 rounded-full bg-slate-800 transition-all overflow-hidden relative">
            {/* Buffer bar */}
            <div 
              style={{ width: `${bufferedPercent}%` }}
              className="absolute top-0 bottom-0 left-0 bg-slate-600/70 transition-all duration-150"
            />
            {/* Play progress bar */}
            <div 
              style={{ width: `${currentPercent}%` }}
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-75"
            />
          </div>

          {/* Seek scrubber thumb */}
          <div 
            style={{ left: `calc(${currentPercent}% - 7px)` }}
            className="absolute w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white rounded-full shadow-lg border border-teal-500 scale-100 sm:scale-0 sm:group-hover:scale-100 transition-transform pointer-events-none"
          />
        </div>

        {/* Action Controls & Volume */}
        <div className="flex items-center justify-between gap-3 text-white">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Play/Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="p-2 sm:p-2.5 rounded-xl bg-teal-500 text-slate-950 hover:bg-teal-400 active:scale-95 transition-all cursor-pointer shadow-sm flex items-center justify-center"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />}
            </button>

            {/* Skip -5s Backward */}
            <button
              type="button"
              onClick={(e) => jumpTime(-5, e)}
              className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white transition-all cursor-pointer text-xs font-mono font-bold flex items-center gap-1 border border-slate-700/80 shadow-sm"
              title="Rewind 5 seconds (Left Arrow)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-teal-400" />
              <span>-5s</span>
            </button>

            {/* Skip +5s Forward */}
            <button
              type="button"
              onClick={(e) => jumpTime(5, e)}
              className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white transition-all cursor-pointer text-xs font-mono font-bold flex items-center gap-1 border border-slate-700/80 shadow-sm"
              title="Fast-forward 5 seconds (Right Arrow)"
            >
              <RotateCw className="w-3.5 h-3.5 text-teal-400" />
              <span>+5s</span>
            </button>

            {/* Time Stamp */}
            <div className="font-mono text-xs sm:text-sm text-slate-300 font-medium px-2 flex items-center">
              <span className="text-white font-bold">{formatTime(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Volume Control */}
            <div className="flex items-center gap-1.5 group">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-teal-400" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 sm:w-20 accent-teal-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                title="Volume"
              />
            </div>

            {/* Speed Selector */}
            <button
              type="button"
              onClick={cycleSpeed}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-mono font-bold flex items-center gap-1 border border-slate-700/60 cursor-pointer"
              title="Cycle Playback Speed"
            >
              <Gauge className="w-3.5 h-3.5 text-teal-400" />
              <span>{playbackSpeed}x</span>
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer border border-slate-700/60"
              title={isBrowserFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isBrowserFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnterpriseVideoPlayerModal;
