import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Download,
  ExternalLink,
  X,
  Film,
  Clock,
  Gauge,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';

/**
 * EnterpriseVideoPlayerModal
 * 
 * Professional full-window responsive customer video player.
 * Features:
 * 1. Full-window cinematic viewport with true native fullscreen support.
 * 2. Custom seekable progress bar with real-time buffer progress & seek resilience (no 0:00 reset).
 * 3. Automatic token injection for secure Cloudflare R2 byte-range streaming.
 * 4. -5s / +5s fast jump, playback speed selector (0.5x - 2x), volume slider, and video rotation.
 * 5. Full keyboard shortcuts (Space, Arrows, F, M, Esc).
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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [videoMeta, setVideoMeta] = useState({ isLandscape: true, width: 0, height: 0 });

  const controlsTimeoutRef = useRef(null);

  useEscapeHandler(onClose, isOpen, ESCAPE_PRIORITY.MODAL);

  // Authenticated stream URL with token parameter for Cloudflare R2 206 Partial Content
  const authenticatedStreamUrl = React.useMemo(() => {
    if (!videoUrl) return '';
    const token = typeof window !== 'undefined'
      ? (sessionStorage.getItem('egs_token') || localStorage.getItem('egs_token'))
      : null;
    const separator = videoUrl.includes('?') ? '&' : '?';
    let url = `${videoUrl}${separator}stream=1`;
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }
    return url;
  }, [videoUrl]);

  const authenticatedDownloadUrl = React.useMemo(() => {
    if (!videoUrl) return '';
    const token = typeof window !== 'undefined'
      ? (sessionStorage.getItem('egs_token') || localStorage.getItem('egs_token'))
      : null;
    const separator = videoUrl.includes('?') ? '&' : '?';
    let url = `${videoUrl}${separator}download=1`;
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }
    return url;
  }, [videoUrl]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setBufferedPercent(0);
      setRotation(0);
      setVideoError(null);
      setShowControls(true);
    }
  }, [isOpen, videoUrl]);

  // Video Time Update & Buffer Progress
  const handleTimeUpdate = () => {
    if (!videoRef.current || isSeeking) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);

    // Buffer percentage
    const buf = videoRef.current.buffered;
    if (buf && buf.length > 0 && videoRef.current.duration > 0) {
      for (let i = 0; i < buf.length; i++) {
        if (buf.start(i) <= cur && cur <= buf.end(i)) {
          setBufferedPercent((buf.end(i) / videoRef.current.duration) * 100);
          break;
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const d = videoRef.current.duration;
    if (Number.isFinite(d) && d > 0) {
      setDuration(d);
    }
    const w = videoRef.current.videoWidth || 0;
    const h = videoRef.current.videoHeight || 0;
    setVideoMeta({
      isLandscape: w >= h,
      width: w,
      height: h
    });
    setVideoError(null);
  };

  const handleDurationChange = () => {
    if (!videoRef.current) return;
    const d = videoRef.current.duration;
    if (Number.isFinite(d) && d > 0) {
      setDuration(d);
    }
  };

  // Play / Pause Toggle
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused || videoRef.current.ended) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn('Playback error:', err);
      });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  // Jump -5s / +5s
  const jumpTime = useCallback((seconds) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  // Seek bar click & drag handling
  const handleSeek = (e) => {
    if (!progressBarRef.current || !videoRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * (duration || 1);

    setCurrentTime(targetTime);
    videoRef.current.currentTime = targetTime;
  };

  const handleSeekStart = (e) => {
    setIsSeeking(true);
    handleSeek(e);

    const onMouseMove = (moveEvent) => {
      handleSeek(moveEvent);
    };

    const onMouseUp = () => {
      setIsSeeking(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Volume
  const handleVolumeChange = (newVol) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolume(clamped);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = clamped === 0;
    }
    setIsMuted(clamped === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  // Playback speed cycle
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const cycleSpeed = () => {
    const curIdx = speeds.indexOf(playbackSpeed);
    const nextIdx = (curIdx + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackSpeed(nextSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  };

  // Rotate video
  const rotateVideo = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // Fullscreen
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (_) {}
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        jumpTime(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        jumpTime(5);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        handleVolumeChange(volume + 0.1);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleVolumeChange(volume - 0.1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        rotateVideo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, togglePlay, jumpTime, volume, isMuted]);

  // Auto-hide controls when playing
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  // Time format helper
  const formatTime = (secs) => {
    if (!Number.isFinite(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleDownload = async () => {
    if (!authenticatedDownloadUrl) return;
    try {
      const a = document.createElement('a');
      a.href = authenticatedDownloadUrl;
      a.download = fileName || 'site_video.mp4';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (_) {}
  };

  if (!isOpen) return null;

  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Center Full-Window Responsive Cinematic Card */}
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={handleMouseMove}
        className={`relative w-full max-w-6xl h-[92vh] max-h-[900px] bg-slate-900 border border-slate-700/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col transition-all duration-300 ${
          isFullscreen ? 'rounded-none border-none max-w-none h-screen max-h-none' : ''
        }`}
      >
        {/* Top Header Bar */}
        <div className={`p-3 sm:p-4 bg-gradient-to-b from-slate-950/90 via-slate-950/60 to-transparent flex items-center justify-between gap-3 z-30 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0">
              <Film className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-md">
                {fileName}
              </h4>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                <span>{videoMeta.isLandscape ? 'Landscape 16:9' : 'Portrait 9:16'}</span>
                {rotation !== 0 && (
                  <span className="text-teal-400 font-bold">• Rotated {rotation}°</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={rotateVideo}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700/60"
              title="Rotate 90 degrees (R)"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rotate</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Download full video file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <a
              href={authenticatedDownloadUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700/60"
              title="Open video in a new full browser tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Full Tab</span>
            </a>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs transition-colors cursor-pointer border border-slate-700/60"
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 hover:text-white text-xs transition-colors cursor-pointer border border-rose-500/30 ml-1"
              title="Close Player (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Central Viewport Area */}
        <div 
          className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden cursor-pointer"
          onClick={togglePlay}
        >
          {/* Main Video Element */}
          <video
            ref={videoRef}
            src={authenticatedStreamUrl}
            playsInline
            preload="auto"
            crossOrigin="anonymous"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onDurationChange={handleDurationChange}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onError={(e) => {
              console.warn('[Video Player Error]:', e);
              setVideoError('Could not stream video. Please use the Download button above to view the original file.');
            }}
            style={{
              transform: rotation ? `rotate(${rotation}deg)` : undefined,
              transition: 'transform 0.25s ease-out'
            }}
            className="w-full h-full object-contain"
          />

          {/* Large Center Play Button Overlay */}
          {!isPlaying && !videoError && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-teal-500/90 text-slate-950 flex items-center justify-center shadow-2xl backdrop-blur-sm transform transition-transform hover:scale-110 pointer-events-auto">
                <Play className="w-8 h-8 sm:w-10 sm:h-10 ml-1 fill-current" />
              </div>
            </div>
          )}

          {/* Video Playback Error Fallback Card */}
          {videoError && (
            <div className="absolute inset-4 max-w-md m-auto p-6 bg-slate-900/95 border border-amber-500/40 rounded-2xl flex flex-col items-center text-center shadow-2xl z-20">
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

        {/* Bottom Custom Controls Bar */}
        <div className={`p-3 sm:p-4 bg-gradient-to-t from-slate-950/95 via-slate-950/80 to-transparent flex flex-col gap-2 z-30 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          {/* Custom Interactive Seekbar */}
          <div
            ref={progressBarRef}
            onMouseDown={handleSeekStart}
            className="relative w-full h-3 sm:h-3.5 bg-slate-800/80 rounded-full cursor-pointer flex items-center group overflow-hidden border border-slate-700/60"
          >
            {/* Buffered Stream Bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-slate-700/60 rounded-full transition-all duration-200"
              style={{ width: `${bufferedPercent}%` }}
            />

            {/* Current Played Progress Bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-75"
              style={{ width: `${currentPercent}%` }}
            />

            {/* Scrubber Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white shadow-md border-2 border-teal-500 opacity-90 group-hover:scale-125 transition-transform"
              style={{ left: `calc(${currentPercent}% - 7px)` }}
            />
          </div>

          {/* Bottom Buttons & Indicators */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            {/* Left Controls: Play, Jump -5s, Jump +5s, Time */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="p-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors cursor-pointer shadow-md"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => jumpTime(-5)}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700/60 flex items-center gap-1 text-[11px] font-bold"
                title="Rewind 5 seconds (Left Arrow)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>-5s</span>
              </button>

              <button
                type="button"
                onClick={() => jumpTime(5)}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700/60 flex items-center gap-1 text-[11px] font-bold"
                title="Fast forward 5 seconds (Right Arrow)"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>+5s</span>
              </button>

              {/* Time Counter */}
              <div className="flex items-center gap-1 font-mono text-[11px] sm:text-xs text-slate-300 font-semibold px-2 py-1 rounded-lg bg-slate-800/60 border border-slate-700/40">
                <Clock className="w-3 h-3 text-teal-400 shrink-0" />
                <span>{formatTime(currentTime)}</span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Volume, Speed, Fullscreen */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Volume Slider */}
              <div className="flex items-center gap-1.5 bg-slate-800/60 px-2 py-1 rounded-xl border border-slate-700/40">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="text-slate-300 hover:text-white cursor-pointer"
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
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-14 sm:w-20 accent-teal-400 h-1 bg-slate-700 rounded-lg cursor-pointer"
                  title="Volume"
                />
              </div>

              {/* Speed Selector */}
              <button
                type="button"
                onClick={cycleSpeed}
                className="px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-mono font-bold flex items-center gap-1 border border-slate-700/60 cursor-pointer"
                title="Cycle Playback Speed"
              >
                <Gauge className="w-3.5 h-3.5 text-teal-400" />
                <span>{playbackSpeed}x</span>
              </button>

              {/* Fullscreen Button */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer border border-slate-700/60"
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnterpriseVideoPlayerModal;
