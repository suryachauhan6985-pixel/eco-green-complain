import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  Camera,
  Square,
  Play,
  RotateCcw,
  RotateCw,
  Check,
  X,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Upload,
  Info,
  Sparkles,
  FlipHorizontal,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Smartphone,
  Monitor
} from 'lucide-react';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';

// User specification: 3 minutes ≈ 48 MB (comfortably under 50 MB) for enhanced video quality
// Total target bitrate: ~2.24 Mbps (2.15 Mbps video + 96 kbps audio)
// 180s * ~280 KB/s ≈ 48.5 MB
const MAX_LIMIT_BYTES = 50 * 1024 * 1024; // Strict 50 MB limit
const AUTO_STOP_BYTES = 48.5 * 1024 * 1024; // 48.5 MB safety auto-stop margin
const MAX_RECORDING_SECONDS = 180; // 3 minutes max duration

export function VideoRecorderModal({
  isOpen,
  onClose,
  onRecordingComplete,
  maxSizeBytes = MAX_LIMIT_BYTES,
  title = 'Record Site Video',
  subtitle = 'High Quality HD Recording • Max 3 Mins (50 MB Limit)'
}) {
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // back camera default for solar equipment
  const [isInitializing, setIsInitializing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [hasAudio, setHasAudio] = useState(true);

  // Dedicated Recording Orientation Option: 'portrait' | 'landscape'
  const [recordingOrientation, setRecordingOrientation] = useState(() => {
    return typeof window !== 'undefined' && window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
  });

  // Zoom control state - Strictly defaults to 1x zoom
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCapabilities, setZoomCapabilities] = useState({
    supported: false,
    min: 1,
    max: 5,
    step: 0.1
  });

  // Device screen orientation state
  const [isDevicePortrait, setIsDevicePortrait] = useState(() => {
    return typeof window !== 'undefined' ? window.innerHeight >= window.innerWidth : true;
  });

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [currentSizeBytes, setCurrentSizeBytes] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recordedMimeType, setRecordedMimeType] = useState('video/webm');

  // Preview video orientation metadata & rotation controls
  const [previewMeta, setPreviewMeta] = useState({
    width: 0,
    height: 0,
    isLandscape: false,
    rotation: 0
  });

  const videoPreviewRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const accumulatedSizeRef = useRef(0);
  const timerIntervalRef = useRef(null);
  const fileFallbackInputRef = useRef(null);

  // Touch pinch-to-zoom tracking refs
  const touchStartDistanceRef = useRef(null);
  const touchStartZoomRef = useRef(1);

  // Monitor screen resize
  useEffect(() => {
    const handleResize = () => {
      const portrait = window.innerHeight >= window.innerWidth;
      setIsDevicePortrait(portrait);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Handle escape key
  const handleClose = useCallback(() => {
    if (isRecording) {
      if (!window.confirm('A video recording is currently in progress. Do you want to cancel and exit?')) {
        return;
      }
    }
    stopStream();
    resetRecording();
    onClose();
  }, [isRecording, onClose]);

  useEscapeHandler(handleClose, isOpen, { priority: ESCAPE_PRIORITY.INNER_MODAL });

  // Stop active camera stream tracks
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
      setStream(null);
    }
  }, [stream]);

  // Clean up recorded preview URL
  const resetRecording = useCallback(() => {
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch (_) {}
    }
    setRecordedBlob(null);
    setPreviewUrl(null);
    setRecordingSeconds(0);
    setCurrentSizeBytes(0);
    setZoomLevel(1); // strictly reset zoom to 1x
    setPreviewMeta({ width: 0, height: 0, isLandscape: false, rotation: 0 });
    recordedChunksRef.current = [];
    accumulatedSizeRef.current = 0;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, [previewUrl]);

  // Pick best supported MIME type
  const getOptimalMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };

  // Apply zoom level (both native hardware optical/sensor zoom and smooth fallback digital scale)
  const applyZoom = useCallback(async (targetZoom) => {
    const minZ = zoomCapabilities.min || 1;
    const maxZ = zoomCapabilities.max || 5;
    const clamped = Math.max(minZ, Math.min(maxZ, Number(Number(targetZoom).toFixed(1))));
    setZoomLevel(clamped);

    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track && zoomCapabilities.supported) {
        try {
          await track.applyConstraints({ advanced: [{ zoom: clamped }] });
        } catch (e) {
          console.warn('Hardware zoom constraint application error:', e);
        }
      }
    }
  }, [stream, zoomCapabilities]);

  // Start hardware camera stream with chosen orientation and 1x zoom
  const initializeCamera = useCallback(async (
    desiredFacingMode = facingMode,
    desiredOrientation = recordingOrientation
  ) => {
    if (!isOpen) return;
    setIsInitializing(true);
    setCameraError(null);
    setZoomLevel(1); // strictly enforce 1x base zoom

    // Stop any existing stream
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser. Please use the device camera or file selector below.');
      setIsInitializing(false);
      return;
    }

    try {
      const isPortraitMode = desiredOrientation === 'portrait';

      // Dynamic resolution strictly honoring user's chosen Landscape vs Portrait option:
      // Portrait: 720x1280 (vertical 9:16)
      // Landscape: 1280x720 (horizontal 16:9)
      const constraints = {
        video: {
          facingMode: { ideal: desiredFacingMode },
          width: { ideal: isPortraitMode ? 720 : 1280 },
          height: { ideal: isPortraitMode ? 1280 : 720 },
          aspectRatio: { ideal: isPortraitMode ? 9 / 16 : 16 / 9 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      };

      let newStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
        setHasAudio(true);
      } catch (audioOrModeErr) {
        console.warn('Audio or specific orientation mode failed, trying basic video:', audioOrModeErr);
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: desiredFacingMode,
              width: isPortraitMode ? { ideal: 720 } : { ideal: 1280 },
              height: isPortraitMode ? { ideal: 1280 } : { ideal: 720 }
            }
          });
          setHasAudio(false);
        } catch (basicErr) {
          newStream = await navigator.mediaDevices.getUserMedia({ video: true });
          setHasAudio(false);
        }
      }

      // Check hardware zoom capabilities and strictly initialize at 1.0x
      const track = newStream.getVideoTracks()[0];
      if (track) {
        let isHardwareZoomAvailable = false;
        let minZ = 1;
        let maxZ = 5;
        let stepZ = 0.1;

        if (typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities();
          if ('zoom' in caps) {
            isHardwareZoomAvailable = true;
            minZ = caps.zoom.min ?? 1;
            maxZ = caps.zoom.max ?? 5;
            stepZ = caps.zoom.step ?? 0.1;

            // Explicitly force hardware zoom to base 1x (or min)
            try {
              const defaultZoom = Math.max(1, minZ);
              await track.applyConstraints({ advanced: [{ zoom: defaultZoom }] });
            } catch (err) {
              console.warn('Initial hardware 1x zoom constraint error:', err);
            }
          }
        }

        setZoomCapabilities({
          supported: isHardwareZoomAvailable,
          min: minZ,
          max: Math.max(3, maxZ),
          step: stepZ
        });
        setZoomLevel(1);
      }

      setStream(newStream);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = newStream;
        videoPreviewRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('Camera initialization failed:', err);
      let msg = 'Could not access camera. Please check camera permissions in your browser.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser settings to record video.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera device found on this system.';
      } else if (err.name === 'NotReadableError') {
        msg = 'Camera is currently in use by another application.';
      }
      setCameraError(msg);
    } finally {
      setIsInitializing(false);
    }
  }, [isOpen, facingMode, recordingOrientation, stream]);

  // Switch between Portrait and Landscape
  const handleChangeOrientation = async (targetOrientation) => {
    if (isRecording) return;
    setRecordingOrientation(targetOrientation);
    await initializeCamera(facingMode, targetOrientation);
  };

  // Initialize camera when modal opens
  useEffect(() => {
    if (isOpen) {
      resetRecording();
      initializeCamera();
    } else {
      stopStream();
      resetRecording();
    }
    return () => {
      stopStream();
      resetRecording();
    };
  }, [isOpen]);

  // Keep video preview linked to stream
  useEffect(() => {
    if (stream && videoPreviewRef.current && !recordedBlob) {
      videoPreviewRef.current.srcObject = stream;
      videoPreviewRef.current.play().catch(() => {});
    }
  }, [stream, recordedBlob]);

  // Flip camera between environment (back) and user (front)
  const handleToggleFacingMode = async () => {
    if (isRecording) return;
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    await initializeCamera(nextMode, recordingOrientation);
  };

  // Touch pinch-to-zoom event handlers
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistanceRef.current = dist;
      touchStartZoomRef.current = zoomLevel;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && touchStartDistanceRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchStartDistanceRef.current;
      const target = touchStartZoomRef.current * factor;
      applyZoom(target);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistanceRef.current = null;
  };

  // Start compressed high-quality recording (3 minutes ≈ 48 MB)
  const handleStartRecording = () => {
    if (!stream) return;
    if (typeof MediaRecorder === 'undefined') {
      alert('MediaRecorder is not supported in this browser. Please use the device file picker.');
      return;
    }

    try {
      recordedChunksRef.current = [];
      accumulatedSizeRef.current = 0;
      setCurrentSizeBytes(0);
      setRecordingSeconds(0);

      const mimeType = getOptimalMimeType();
      setRecordedMimeType(mimeType || 'video/webm');

      // Enhanced quality compression:
      // ~2.15 Mbps video + 96 kbps audio -> ~2.24 Mbps total (~280 KB/s)
      // 3 minutes (180s) yields ~48 MB, comfortably under 50 MB
      const recorderOptions = {
        videoBitsPerSecond: 2_150_000,
        audioBitsPerSecond: 96_000
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      const recorder = new MediaRecorder(stream, recorderOptions);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          accumulatedSizeRef.current += event.data.size;
          setCurrentSizeBytes(accumulatedSizeRef.current);

          // STRICT SAFETY CHECK: Auto-stop if reaching 48.5 MB
          if (accumulatedSizeRef.current >= AUTO_STOP_BYTES) {
            handleStopRecording('size_limit');
          }
        }
      };

      recorder.onstop = () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setIsRecording(false);

        const chunks = recordedChunksRef.current;
        if (chunks.length > 0) {
          const blobType = mimeType || 'video/webm';
          const blob = new Blob(chunks, { type: blobType });
          setRecordedBlob(blob);
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
        }
      };

      // Request data slices every 500ms to monitor live size counter
      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Live timer tick (max 180 seconds = 3 minutes)
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
      console.error('Failed to start recording:', err);
      alert('Could not start video recording: ' + err.message);
    }
  };

  // Stop recording
  const handleStopRecording = (stopReason = 'user') => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
    setIsRecording(false);

    if (stopReason === 'size_limit') {
      alert('Recording stopped automatically to guarantee the video remains safely within the 50 MB upload limit.');
    } else if (stopReason === 'time_limit') {
      alert('Maximum recording duration of 3 minutes reached (~48 MB). Video is ready for review.');
    }
  };

  // Discard and retake
  const handleRetake = () => {
    resetRecording();
    if (!stream) {
      initializeCamera();
    }
  };

  // Rotate preview 90 degrees
  const handleRotatePreview = () => {
    setPreviewMeta(prev => ({
      ...prev,
      rotation: (prev.rotation + 90) % 360
    }));
  };

  // Confirm and finish
  const handleUseVideo = () => {
    if (!recordedBlob) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestampStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const ext = recordedMimeType.includes('mp4') ? 'mp4' : 'webm';
    const orientationTag = recordingOrientation || (previewMeta.isLandscape ? 'landscape' : 'portrait');
    const fileName = `VID_${timestampStr}_${orientationTag}_hd.${ext}`;

    const videoFile = new File([recordedBlob], fileName, {
      type: recordedMimeType || 'video/webm',
      lastModified: Date.now()
    });

    stopStream();
    resetRecording();
    onRecordingComplete(videoFile);
    onClose();
  };

  // Fallback to native device file/camera input
  const handleFallbackFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > maxSizeBytes) {
      alert(`Selected video file "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB, which exceeds the 50 MB limit. Please record a shorter video.`);
      e.target.value = '';
      return;
    }

    stopStream();
    resetRecording();
    onRecordingComplete(file);
    onClose();
  };

  if (!isOpen) return null;

  // Format helpers
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatSizeMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
  const sizePercentage = Math.min(100, Math.round((currentSizeBytes / maxSizeBytes) * 100));

  // Determine progress bar color based on size threshold
  let progressColorClass = 'bg-emerald-500';
  if (currentSizeBytes > 45 * 1024 * 1024) {
    progressColorClass = 'bg-red-500 animate-pulse';
  } else if (currentSizeBytes > 35 * 1024 * 1024) {
    progressColorClass = 'bg-amber-400';
  }

  // Preset zoom levels to display (clamped to max zoom capability)
  const availableZoomPresets = [1, 2, 3, 5].filter(z => z <= (zoomCapabilities.max || 5));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black sm:bg-slate-950/85 sm:backdrop-blur-md animate-in fade-in">
      {/* Full-screen on mobile, large immersive modal on tablet/desktop */}
      <div className="relative w-full h-[100dvh] sm:h-[92vh] sm:max-w-4xl sm:rounded-2xl sm:border sm:border-slate-800 bg-black overflow-hidden flex flex-col shadow-2xl">
        
        {/* Top Slim Progress Bar (Active only when recording) */}
        {isRecording && (
          <div className="absolute top-0 inset-x-0 h-1.5 bg-black/50 z-30 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ease-out ${progressColorClass}`}
              style={{ width: `${Math.max(3, sizePercentage)}%` }}
            />
          </div>
        )}

        {/* Viewfinder Canvas (MAXIMIZED - Fills 100% of the screen with touch pinch-to-zoom) */}
        <div 
          className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          
          {/* Active Live Camera Stream (Strictly object-contain to eliminate default forced crop/zoom) */}
          {!recordedBlob && !cameraError && (
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              style={{
                transform: (!zoomCapabilities.supported && zoomLevel > 1) ? `scale(${zoomLevel})` : undefined,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out'
              }}
              className={`object-contain bg-black transition-all duration-300 ${
                recordingOrientation === 'landscape'
                  ? 'w-full aspect-video max-h-full'
                  : 'h-full aspect-[9/16] max-w-full'
              }`}
            />
          )}

          {/* Recorded Playback Review Stream */}
          {recordedBlob && previewUrl && (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <video
                ref={playbackVideoRef}
                src={previewUrl}
                controls
                autoPlay
                playsInline
                onLoadedMetadata={(e) => {
                  const w = e.target.videoWidth || 0;
                  const h = e.target.videoHeight || 0;
                  setPreviewMeta(prev => ({
                    ...prev,
                    width: w,
                    height: h,
                    isLandscape: w > h
                  }));
                }}
                style={{
                  transform: previewMeta.rotation ? `rotate(${previewMeta.rotation}deg)` : undefined,
                  transition: 'transform 0.25s ease'
                }}
                className={`max-h-full object-contain ${
                  recordingOrientation === 'landscape' || previewMeta.isLandscape
                    ? 'w-full aspect-video'
                    : 'h-full aspect-[9/16]'
                }`}
              />
            </div>
          )}

          {/* Camera Loading Spinner */}
          {isInitializing && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3 text-slate-200 z-10">
              <RefreshCw className="w-9 h-9 text-teal-400 animate-spin" />
              <p className="text-xs font-semibold tracking-wide">
                Starting {recordingOrientation} HD camera...
              </p>
            </div>
          )}

          {/* Camera Error / Permission Denied Fallback Card */}
          {cameraError && (
            <div className="absolute inset-0 p-6 bg-slate-900/95 flex flex-col items-center justify-center text-center max-w-md mx-auto z-20">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1.5">Direct Camera Stream Unavailable</h4>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">{cameraError}</p>
              
              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => initializeCamera()}
                  className="w-full py-2.5 px-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileFallbackInputRef.current?.click()}
                  className="w-full py-2.5 px-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Use Device Camera</span>
                </button>
              </div>

              <p className="text-[10px] text-slate-400 mt-3">
                Note: Keep recordings under 3 minutes to stay within the 50 MB limit.
              </p>
            </div>
          )}

          {/* FLOATING TOP BAR: Sleek, non-intrusive HUD Over Viewfinder */}
          <div className="absolute top-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-b from-black/85 via-black/30 to-transparent flex items-center justify-between z-20 pointer-events-none gap-2 flex-wrap sm:flex-nowrap">
            {/* Status / Policy Badge */}
            <div className="pointer-events-auto flex items-center gap-2">
              {isRecording ? (
                /* Active Recording Telemetry Pill */
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-red-500/50 shadow-lg text-white">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                  <span className="text-xs font-bold font-mono tracking-wider">
                    {formatTime(recordingSeconds)} / 03:00
                  </span>
                  <span className="text-[11px] text-slate-300 font-mono border-l border-white/20 pl-2">
                    {formatSizeMB(currentSizeBytes)} / 50 MB
                  </span>
                  <span className="text-[10px] text-teal-300 font-mono border-l border-white/20 pl-2">
                    {zoomLevel.toFixed(1)}x
                  </span>
                </div>
              ) : recordedBlob ? (
                /* Review Mode Pill */
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/50 text-white text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-semibold">{(recordedBlob.size / (1024 * 1024)).toFixed(1)} MB</span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold capitalize">
                    ({recordingOrientation})
                  </span>
                </div>
              ) : (
                /* Idle Ready Pill (Very compact so entire screen is visible) */
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white text-xs shadow-md">
                  <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                  <span className="font-semibold text-[11px]">50 MB Limit</span>
                  <span className="text-[10px] text-teal-300 font-mono">• 3 min max</span>
                </div>
              )}
            </div>

            {/* Dedicated Landscape / Portrait Selector Option */}
            {!recordedBlob && (
              <div className="pointer-events-auto flex items-center p-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/20 shadow-lg">
                {!isRecording ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleChangeOrientation('portrait')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono transition-all cursor-pointer ${
                        recordingOrientation === 'portrait'
                          ? 'bg-teal-500 text-slate-950 shadow-md scale-102'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`}
                      title="Set recording orientation to Portrait (9:16 vertical)"
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Portrait</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeOrientation('landscape')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono transition-all cursor-pointer ${
                        recordingOrientation === 'landscape'
                          ? 'bg-teal-500 text-slate-950 shadow-md scale-102'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`}
                      title="Set recording orientation to Landscape (16:9 widescreen)"
                    >
                      <Monitor className="w-3 h-3" />
                      <span>Landscape</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold font-mono text-teal-300">
                    {recordingOrientation === 'portrait' ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                    <span className="capitalize">{recordingOrientation} (Locked)</span>
                  </div>
                )}
              </div>
            )}

            {/* Top Right Action Icons */}
            <div className="pointer-events-auto flex items-center gap-2">
              {/* Rotate preview button in review mode */}
              {recordedBlob && (
                <button
                  type="button"
                  onClick={handleRotatePreview}
                  className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-full text-white border border-white/20 transition-all cursor-pointer shadow-md"
                  title="Rotate video (90°)"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              )}

              {/* Flip camera between Rear and Front (when not recording) */}
              {!isRecording && !recordedBlob && (
                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-full text-white border border-white/20 transition-all cursor-pointer shadow-md"
                  title={`Flip camera (${facingMode === 'environment' ? 'Switch to Front' : 'Switch to Rear'})`}
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>
              )}

              {/* Close button */}
              <button
                type="button"
                onClick={handleClose}
                className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-full text-white border border-white/20 transition-all cursor-pointer shadow-md"
                title="Exit video recorder (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Near-Limit Floating Warning (Appears only when nearing 45 MB) */}
          {isRecording && currentSizeBytes > 40 * 1024 * 1024 && (
            <div className="absolute top-16 inset-x-4 max-w-sm mx-auto p-2.5 rounded-xl bg-red-950/90 backdrop-blur-md border border-red-500 text-white text-xs shadow-2xl flex items-center gap-2 z-20 animate-pulse pointer-events-none">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>
                <strong>Approaching 50 MB limit!</strong> Auto-stops at 48.5 MB. Conclude your recording.
              </span>
            </div>
          )}

          {/* FLOATING ZOOM PRESET CONTROLS (Positioned right above the bottom shutter bar) */}
          {!recordedBlob && !cameraError && (
            <div className="absolute bottom-24 inset-x-0 flex items-center justify-center z-30 pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-full bg-black/65 backdrop-blur-md border border-white/20 shadow-2xl">
                {availableZoomPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyZoom(preset)}
                    className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition-all cursor-pointer ${
                      Math.abs(zoomLevel - preset) < 0.2
                        ? 'bg-teal-500 text-slate-950 shadow-md scale-105'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    title={`Set zoom to ${preset}x`}
                  >
                    {preset}x
                  </button>
                ))}

                {/* Show custom decimal zoom level if pinched between presets */}
                {!availableZoomPresets.some(p => Math.abs(zoomLevel - p) < 0.2) && (
                  <span className="px-2.5 py-0.5 text-xs font-mono font-bold text-teal-400 bg-teal-950/80 rounded-full border border-teal-500/40">
                    {zoomLevel.toFixed(1)}x
                  </span>
                )}
              </div>
            </div>
          )}

          {/* FLOATING BOTTOM BAR: Minimal Footprint Shutter Dock */}
          <div className="absolute bottom-0 inset-x-0 p-4 pb-8 sm:pb-5 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-between z-20">
            {/* Left Slot: Gallery / File Upload Fallback */}
            <div className="w-20 flex justify-start">
              {!isRecording && !recordedBlob && (
                <button
                  type="button"
                  onClick={() => fileFallbackInputRef.current?.click()}
                  className="p-3 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-full text-white border border-white/20 transition-all cursor-pointer shadow-md flex items-center justify-center"
                  title="Upload video from gallery or file"
                >
                  <Upload className="w-5 h-5 text-slate-200" />
                </button>
              )}
            </div>

            {/* Center Slot: Primary Shutter Control */}
            <div className="flex items-center justify-center">
              {recordedBlob ? (
                /* Post-Recording Action Buttons */
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="py-2.5 px-4 bg-slate-800/80 hover:bg-slate-700 backdrop-blur-md text-white rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors border border-white/15 cursor-pointer shadow-lg"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Retake</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUseVideo}
                    className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xl shadow-emerald-950/50"
                  >
                    <Check className="w-4 h-4" />
                    <span>Use Video</span>
                  </button>
                </div>
              ) : isRecording ? (
                /* Active Recording: Big Stop Shutter */
                <button
                  type="button"
                  onClick={() => handleStopRecording('user')}
                  className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-red-500 bg-red-600/20 backdrop-blur-md flex items-center justify-center cursor-pointer active:scale-95 transition-transform shadow-2xl shadow-red-950/60"
                  title="Stop recording"
                >
                  <div className="w-7 h-7 rounded-md bg-red-500 shadow-md animate-pulse" />
                </button>
              ) : (
                /* Idle: Big Camera Shutter Record Button */
                <button
                  type="button"
                  disabled={isInitializing || !!cameraError}
                  onClick={handleStartRecording}
                  className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white bg-white/10 backdrop-blur-md flex items-center justify-center cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-transform shadow-2xl"
                  title="Start recording (3 min max • 50 MB limit)"
                >
                  <div className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 transition-colors shadow-inner" />
                </button>
              )}
            </div>

            {/* Right Slot: Quick Orientation Switch Button */}
            <div className="w-20 flex justify-end">
              {!isRecording && !recordedBlob ? (
                <button
                  type="button"
                  onClick={() => handleChangeOrientation(recordingOrientation === 'portrait' ? 'landscape' : 'portrait')}
                  className="p-2.5 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-full text-white border border-white/20 transition-all cursor-pointer shadow-md flex items-center gap-1 text-[11px] font-mono font-bold"
                  title={`Switch to ${recordingOrientation === 'portrait' ? 'Landscape' : 'Portrait'}`}
                >
                  {recordingOrientation === 'portrait' ? (
                    <>
                      <Smartphone className="w-4 h-4 text-teal-400" />
                      <span className="hidden sm:inline">Port</span>
                    </>
                  ) : (
                    <>
                      <Monitor className="w-4 h-4 text-teal-400" />
                      <span className="hidden sm:inline">Land</span>
                    </>
                  )}
                </button>
              ) : (
                <div
                  className="px-2 py-1 rounded-full bg-black/40 backdrop-blur-md text-[10px] font-mono text-teal-300 border border-white/10 capitalize"
                  title="Active recording format"
                >
                  {recordingOrientation}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hidden Fallback File Input */}
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
