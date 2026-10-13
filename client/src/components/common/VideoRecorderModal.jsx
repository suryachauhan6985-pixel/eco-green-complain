import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Camera, Video, RotateCcw, Check, Upload, AlertCircle, 
  FlipHorizontal, Sparkles, RefreshCw, ZoomIn
} from 'lucide-react';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';

// 3-Minute HD Optimization:
// Target: 3 Minutes (~180s) 720p HD Video guaranteed under 50 MB upload limit.
// 1.85 Mbps video + 64 kbps audio = ~1.91 Mbps total (~14.3 MB/min, ~43 MB for full 3 minutes).
const MAX_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB server limit
const MAX_RECORDING_SECONDS = 180; // Exactly 3 minutes
const TARGET_VIDEO_BITRATE = 1_850_000; // 1.85 Mbps 720p HD
const TARGET_AUDIO_BITRATE = 64_000; // 64 kbps clear audio

export function VideoRecorderModal({
  isOpen,
  onClose,
  onRecordingComplete,
  maxSizeBytes = MAX_LIMIT_BYTES,
  title = 'Record Site Video',
  subtitle = '3-Minute 720p HD Camera (Under 50 MB)'
}) {
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // Default to rear camera
  const [isInitializing, setIsInitializing] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [currentSizeBytes, setCurrentSizeBytes] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recordedMimeType, setRecordedMimeType] = useState('video/webm');

  // Photo snapshots taken during session
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [photoFlash, setPhotoFlash] = useState(false);

  // Hardware Zoom (1x, 2x)
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hasHardwareZoom, setHasHardwareZoom] = useState(false);

  const activeStreamRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const fileFallbackInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  // Pick optimal supported container format
  const getOptimalMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4'
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };

  // Safely stop all camera tracks
  const stopStream = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
      activeStreamRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
      setStream(null);
    }
  }, [stream]);

  // Reset recording session
  const resetRecording = useCallback(() => {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch (_) {}
      previewUrlRef.current = null;
    }
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
    }
    setRecordedBlob(null);
    setPreviewUrl(null);
    setRecordingSeconds(0);
    setCurrentSizeBytes(0);
    recordedChunksRef.current = [];
    setCapturedPhotos(prev => {
      prev.forEach(p => {
        try { URL.revokeObjectURL(p.preview); } catch (_) {}
      });
      return [];
    });
    setPhotoFlash(false);
    setZoomLevel(1);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, [previewUrl]);

  // Clean close handler
  const handleClose = useCallback(() => {
    if (isRecording) {
      if (!window.confirm('A video recording is currently in progress. Do you want to cancel and exit?')) {
        return;
      }
    }
    stopStream();
    resetRecording();
    onClose();
  }, [isRecording, onClose, stopStream, resetRecording]);

  useEscapeHandler(handleClose, isOpen, { priority: ESCAPE_PRIORITY.INNER_MODAL });

  // Connect active stream to live video element cleanly (eliminates black preview)
  const attachStreamToVideo = useCallback((newStream) => {
    const video = videoPreviewRef.current;
    if (!video || !newStream) return;

    try {
      video.srcObject = newStream;
      video.muted = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Retry on user interaction / metadata ready
          video.onloadedmetadata = () => {
            video.play().catch(() => {});
          };
        });
      }
    } catch (e) {
      console.warn('[VideoRecorder] attachStream error:', e);
    }
  }, []);

  // Initialize native camera feed
  const initializeCamera = useCallback(async (desiredFacing = facingMode) => {
    if (!isOpen) return;
    setIsInitializing(true);
    setCameraError(null);
    setZoomLevel(1);

    // Release any previous tracks first
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      activeStreamRef.current = null;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser. Please use the device camera or file selector below.');
      setIsInitializing(false);
      return;
    }

    // Standard natural camera constraints without restrictive bounds
    const baseConstraints = {
      video: {
        facingMode: { ideal: desiredFacing },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true
      }
    };

    let newStream = null;
    try {
      newStream = await navigator.mediaDevices.getUserMedia(baseConstraints);
    } catch (primaryErr) {
      console.warn('[VideoRecorder] Primary getUserMedia failed, trying fallback:', primaryErr);
      try {
        // Fallback 1: basic video + audio
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: desiredFacing } },
          audio: true
        });
      } catch (audioErr) {
        console.warn('[VideoRecorder] Audio request failed, trying video only:', audioErr);
        try {
          // Fallback 2: video only
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: desiredFacing } }
          });
        } catch (videoOnlyErr) {
          try {
            // Fallback 3: generic video
            newStream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (finalErr) {
            console.error('[VideoRecorder] All getUserMedia attempts failed:', finalErr);
            let msg = 'Could not access device camera. Please check camera permissions in your browser settings.';
            if (finalErr.name === 'NotAllowedError' || finalErr.name === 'PermissionDeniedError') {
              msg = 'Camera permission was denied. Please allow camera access in your browser settings to record video.';
            } else if (finalErr.name === 'NotReadableError') {
              msg = 'Camera is currently locked by another app or phone call. Please close other camera apps and try again.';
            }
            setCameraError(msg);
            setIsInitializing(false);
            return;
          }
        }
      }
    }

    activeStreamRef.current = newStream;
    setStream(newStream);
    attachStreamToVideo(newStream);

    // Detect hardware zoom capability
    const track = newStream.getVideoTracks()[0];
    if (track && typeof track.getCapabilities === 'function') {
      const caps = track.getCapabilities();
      setHasHardwareZoom(Boolean(caps && caps.zoom));
    } else {
      setHasHardwareZoom(false);
    }

    // Handle incoming phone call track interruptions
    if (track) {
      track.onended = () => {
        if (isOpen && !recordedBlob) {
          initializeCamera(desiredFacing);
        }
      };
    }

    setIsInitializing(false);
  }, [isOpen, facingMode, attachStreamToVideo, recordedBlob]);

  // Initialize camera whenever modal opens
  useEffect(() => {
    if (isOpen) {
      initializeCamera(facingMode);
    } else {
      stopStream();
      resetRecording();
    }
    return () => {
      stopStream();
    };
  }, [isOpen]);

  // Keep video preview attached if video element re-mounts
  useEffect(() => {
    if (stream && videoPreviewRef.current && !recordedBlob) {
      attachStreamToVideo(stream);
    }
  }, [stream, recordedBlob, attachStreamToVideo]);

  // Flip camera between Rear (environment) and Front (user)
  const handleToggleFacingMode = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    await initializeCamera(nextMode);
  };

  // Apply hardware zoom (1x / 2x toggle)
  const handleToggleZoom = async () => {
    const track = activeStreamRef.current?.getVideoTracks()?.[0];
    if (!track) return;

    const nextZoom = zoomLevel === 1 ? 2 : 1;
    setZoomLevel(nextZoom);

    if (track.getCapabilities && track.getCapabilities().zoom) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: nextZoom }] });
      } catch (_) {}
    }
  };

  // High-Resolution Snapshot Photo
  const handleCapturePhoto = () => {
    const video = videoPreviewRef.current;
    if (!video || !activeStreamRef.current) return;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    setPhotoFlash(true);
    setTimeout(() => setPhotoFlash(false), 200);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
      const photoName = `IMG_${ts}_site_photo.jpg`;
      const photoFile = new File([blob], photoName, { type: 'image/jpeg', lastModified: Date.now() });
      const photoUrl = URL.createObjectURL(blob);
      setCapturedPhotos(prev => [...prev, { file: photoFile, preview: photoUrl, name: photoName }]);
    }, 'image/jpeg', 0.92);
  };

  // Start 3-minute 720p HD recording
  const handleStartRecording = () => {
    if (!stream) {
      if (!isInitializing) initializeCamera(facingMode);
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      alert('MediaRecorder is not supported in this browser. Please use the device file picker.');
      return;
    }

    try {
      recordedChunksRef.current = [];
      setRecordingSeconds(0);
      setCurrentSizeBytes(0);

      const mimeType = getOptimalMimeType();
      setRecordedMimeType(mimeType || 'video/webm');

      const recorderOptions = {
        videoBitsPerSecond: TARGET_VIDEO_BITRATE,
        audioBitsPerSecond: TARGET_AUDIO_BITRATE
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      const recorder = new MediaRecorder(stream, recorderOptions);

      // Collect data every 1 second (1000ms) for smooth recording without lag
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          let total = 0;
          for (const chunk of recordedChunksRef.current) {
            total += chunk.size;
          }
          setCurrentSizeBytes(total);

          // Auto-stop safety if nearing 48 MB
          if (total >= 48 * 1024 * 1024) {
            handleStopRecording('size_limit');
          }
        }
      };

      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        const finalMime = recorderOptions.mimeType || recordedMimeType || 'video/webm';
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: finalMime });
          const ext = finalMime.includes('mp4') ? 'mp4' : 'webm';
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
          const finalFile = new File([blob], `VID_${ts}_site_hd.${ext}`, {
            type: finalMime,
            lastModified: Date.now()
          });

          const url = URL.createObjectURL(finalFile);
          previewUrlRef.current = url;
          setRecordedBlob(finalFile);
          setPreviewUrl(url);
        }
        setIsRecording(false);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Timer tick (Max 180 seconds = 3 minutes)
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            handleStopRecording('time_limit');
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('[VideoRecorder] Failed to start recording:', err);
      alert('Could not start recording: ' + err.message);
    }
  };

  // Stop recording
  const handleStopRecording = (reason = 'user') => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
    if (reason === 'time_limit') {
      // Completed full 3 minutes
    }
  };

  // Retake video
  const handleRetake = () => {
    resetRecording();
    if (!stream) {
      initializeCamera(facingMode);
    }
  };

  // Confirm and finish recording session
  const handleUseVideo = () => {
    const videoFiles = recordedBlob ? [recordedBlob] : [];
    const photoFiles = capturedPhotos.map(p => p.file);
    const allFiles = [...videoFiles, ...photoFiles];

    if (allFiles.length === 0) return;

    stopStream();
    resetRecording();
    onRecordingComplete(allFiles.length === 1 ? allFiles[0] : allFiles);
    onClose();
  };

  // Native device file / camera fallback
  const handleFallbackFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > maxSizeBytes) {
      alert(`Selected file (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 50 MB limit.`);
      e.target.value = '';
      return;
    }

    stopStream();
    resetRecording();
    onRecordingComplete(file);
    onClose();
  };

  if (!isOpen) return null;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
  const remainingSeconds = Math.max(0, MAX_RECORDING_SECONDS - recordingSeconds);

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center bg-black sm:bg-slate-950/90 sm:backdrop-blur-md animate-in fade-in duration-150">
      {/* Full-screen on mobile, sleek floating frame on desktop */}
      <div className="relative w-full h-[100dvh] sm:h-[90vh] sm:max-w-2xl sm:rounded-3xl bg-black overflow-hidden flex flex-col shadow-2xl">
        
        {/* VIEWING / CAMERA CANVAS (True Edge-to-Edge object-cover with ZERO black bars) */}
        <div className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden">
          
          {/* Live Viewfinder */}
          {!recordedBlob && !cameraError && (
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover bg-black"
            />
          )}

          {/* Review Mode Playback */}
          {recordedBlob && previewUrl && (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <video
                ref={playbackVideoRef}
                src={previewUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            </div>
          )}

          {/* Shutter Flash Animation */}
          {photoFlash && (
            <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-out fade-out duration-200" />
          )}

          {/* Camera Error Screen with One-Click Fallback */}
          {cameraError && !recordedBlob && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center bg-slate-900 text-white">
              <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold mb-2">Camera Unavailable</h4>
              <p className="text-xs text-slate-300 max-w-sm mb-6 leading-relaxed">
                {cameraError}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => initializeCamera(facingMode)}
                  className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Try Again
                </button>
                <button
                  type="button"
                  onClick={() => fileFallbackInputRef.current?.click()}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
                >
                  <Upload className="w-4 h-4" /> Use Device Camera
                </button>
              </div>
            </div>
          )}

          {/* TOP HUD BAR: Clean, non-intrusive floating stats */}
          <div className="absolute top-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent flex items-center justify-between z-30 pointer-events-none">
            
            {/* Status / Live Telemetry */}
            <div className="pointer-events-auto flex items-center gap-2">
              {isRecording ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-red-500/60 shadow-lg text-white">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                  <span className="text-xs font-bold font-mono tracking-wider">
                    {formatTime(recordingSeconds)} / 03:00
                  </span>
                  <span className="text-[11px] text-teal-300 font-mono font-bold border-l border-white/20 pl-2">
                    {formatMB(currentSizeBytes)} MB / 50 MB
                  </span>
                </div>
              ) : recordedBlob ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/60 text-white text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="font-bold font-mono">
                    {formatTime(recordingSeconds)} • {formatMB(recordedBlob.size)} MB (720p HD)
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white text-xs shadow-md">
                  <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                  <span className="font-semibold text-[11px]">720p HD • Max 3 Min • 50 MB</span>
                </div>
              )}
            </div>

            {/* Top Right Close Button */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="p-2 bg-black/50 hover:bg-black/75 backdrop-blur-md rounded-full text-white border border-white/20 transition-all cursor-pointer shadow-md"
                title="Close Camera (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Floating Zoom Button (Right side, tap to toggle 1x / 2x) */}
          {!recordedBlob && !cameraError && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 pointer-events-auto">
              <button
                type="button"
                onClick={handleToggleZoom}
                className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/25 text-white text-xs font-bold font-mono flex items-center justify-center hover:bg-black/80 transition-all shadow-xl cursor-pointer"
                title="Toggle Zoom (1x / 2x)"
              >
                {zoomLevel}x
              </button>
            </div>
          )}

          {/* 3-Minute Limit Approaching Warning */}
          {isRecording && remainingSeconds <= 30 && remainingSeconds > 0 && (
            <div className="absolute top-16 inset-x-4 max-w-xs mx-auto p-2 rounded-xl bg-amber-500/90 text-slate-950 text-xs font-bold text-center shadow-2xl z-30 animate-pulse pointer-events-none">
              ⚠️ {remainingSeconds}s remaining before 3-minute limit
            </div>
          )}
        </div>

        {/* BOTTOM CAMERA CONTROLS BAR */}
        <div className="relative w-full p-4 sm:p-5 bg-gradient-to-t from-black via-black/95 to-black/70 flex flex-col items-center justify-center gap-3 z-30">
          
          {/* Main Shutter & Actions Row */}
          {!recordedBlob ? (
            <div className="w-full flex items-center justify-around max-w-sm">
              
              {/* Snapshot Photo Button */}
              <button
                type="button"
                onClick={handleCapturePhoto}
                disabled={isInitializing || Boolean(cameraError)}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all cursor-pointer disabled:opacity-30 relative"
                title="Take photo snapshot"
              >
                <Camera className="w-6 h-6 text-white" />
                {capturedPhotos.length > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-teal-500 text-slate-950 font-mono text-[10px] font-bold shadow-md">
                    {capturedPhotos.length}
                  </span>
                )}
              </button>

              {/* Big Center Shutter Button */}
              <div className="relative flex items-center justify-center">
                {isRecording ? (
                  /* STOP RECORDING BUTTON (Red Square inside ring) */
                  <button
                    type="button"
                    onClick={() => handleStopRecording('user')}
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white flex items-center justify-center bg-black/40 active:scale-95 transition-all cursor-pointer shadow-2xl ring-4 ring-red-500/40"
                    title="Stop Recording"
                  >
                    <div className="w-7 h-7 rounded-md bg-red-600 shadow-md animate-pulse" />
                  </button>
                ) : (
                  /* START RECORDING BUTTON (Red Circle inside white ring) */
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    disabled={isInitializing || Boolean(cameraError)}
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white flex items-center justify-center bg-black/40 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-2xl disabled:opacity-30"
                    title="Start Recording (3 min HD)"
                  >
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-600 hover:bg-red-500 shadow-md transition-colors" />
                  </button>
                )}
              </div>

              {/* Flip Camera Button (Rear ⇄ Front) */}
              <button
                type="button"
                onClick={handleToggleFacingMode}
                disabled={isRecording || isInitializing || Boolean(cameraError)}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all cursor-pointer disabled:opacity-30"
                title={`Switch camera (${facingMode === 'environment' ? 'Front' : 'Rear'})`}
              >
                <FlipHorizontal className="w-6 h-6 text-white" />
              </button>
            </div>
          ) : (
            /* REVIEW MODE CONTROLS: Retake vs Use Video */
            <div className="w-full flex items-center justify-center gap-3 max-w-sm">
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-700 shadow-md"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleUseVideo}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-900/30"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Use Video {capturedPhotos.length > 0 ? `+ ${capturedPhotos.length} Photos` : ''}</span>
              </button>
            </div>
          )}

          {/* Secondary Device File Fallback Link */}
          {!isRecording && !recordedBlob && (
            <button
              type="button"
              onClick={() => fileFallbackInputRef.current?.click()}
              className="text-[11px] text-teal-400 hover:text-teal-300 underline underline-offset-2 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Or choose video from device gallery</span>
            </button>
          )}
        </div>

        {/* Hidden Device Camera / File Fallback Input */}
        <input
          ref={fileFallbackInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          onChange={handleFallbackFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}

export default VideoRecorderModal;
