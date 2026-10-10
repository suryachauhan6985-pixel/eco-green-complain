import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  Camera,
  Square,
  Play,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Upload,
  Info,
  Sparkles,
  Volume2,
  VolumeX,
  FlipHorizontal
} from 'lucide-react';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';

const MAX_LIMIT_BYTES = 50 * 1024 * 1024; // Strict 50 MB limit
const AUTO_STOP_BYTES = 48.5 * 1024 * 1024; // 48.5 MB safety margin
const MAX_RECORDING_SECONDS = 300; // 5 minutes max (~38-45 MB at 1.25 Mbps)

export function VideoRecorderModal({
  isOpen,
  onClose,
  onRecordingComplete,
  maxSizeBytes = MAX_LIMIT_BYTES,
  title = 'Record Site Video',
  subtitle = 'Auto-compressed 720p HD recording for field complaints & resolution proof'
}) {
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // back camera default for solar equipment
  const [isInitializing, setIsInitializing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [hasAudio, setHasAudio] = useState(true);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [currentSizeBytes, setCurrentSizeBytes] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recordedMimeType, setRecordedMimeType] = useState('video/webm');

  // Notice banner dismissal / toast state
  const [showStartToast, setShowStartToast] = useState(false);

  const videoPreviewRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const accumulatedSizeRef = useRef(0);
  const timerIntervalRef = useRef(null);
  const fileFallbackInputRef = useRef(null);

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
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
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

  // Start hardware camera stream
  const initializeCamera = useCallback(async (desiredFacingMode = facingMode) => {
    if (!isOpen) return;
    setIsInitializing(true);
    setCameraError(null);

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
      // 1. Try with video + audio in 720p compressed target
      const constraints = {
        video: {
          facingMode: { ideal: desiredFacingMode },
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 24, max: 30 }
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
        // Fallback: try video-only if microphone was denied or unavailable
        console.warn('Audio or specific facingMode failed, falling back to basic video stream:', audioOrModeErr);
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: desiredFacingMode }
          });
          setHasAudio(false);
        } catch (basicErr) {
          // Final fallback: any video
          newStream = await navigator.mediaDevices.getUserMedia({ video: true });
          setHasAudio(false);
        }
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
  }, [isOpen, facingMode, stream]);

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
    await initializeCamera(nextMode);
  };

  // Start compressed recording
  const handleStartRecording = () => {
    if (!stream) return;
    if (typeof MediaRecorder === 'undefined') {
      alert('MediaRecorder is not supported in this browser. Please use the device file picker.');
      return;
    }

    try {
      resetRecording();
      recordedChunksRef.current = [];
      accumulatedSizeRef.current = 0;
      setCurrentSizeBytes(0);
      setRecordingSeconds(0);

      const mimeType = getOptimalMimeType();
      setRecordedMimeType(mimeType || 'video/webm');

      // Compression options: ~1.25 Mbps for crystal clear 720p HD while keeping 1 min ~ 9.5MB
      const recorderOptions = {
        videoBitsPerSecond: 1_250_000,
        audioBitsPerSecond: 64_000
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

          // STRICT SAFETY CHECK: Auto-stop if approaching 50 MB
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

      // Request chunks every 500ms to monitor live size counter
      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Trigger start notice banner/toast
      setShowStartToast(true);
      setTimeout(() => setShowStartToast(false), 5000);

      // Live timer tick
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
      alert('Recording stopped automatically to ensure the video strictly remains within the 50 MB upload limit.');
    } else if (stopReason === 'time_limit') {
      alert('Maximum recording duration reached (5 minutes). Video is ready for review.');
    }
  };

  // Discard and retake
  const handleRetake = () => {
    resetRecording();
    if (!stream) {
      initializeCamera();
    }
  };

  // Confirm and finish
  const handleUseVideo = () => {
    if (!recordedBlob) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestampStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const ext = recordedMimeType.includes('mp4') ? 'mp4' : 'webm';
    const fileName = `VID_${timestampStr}_compressed.${ext}`;

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
  let badgeColorClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
  if (currentSizeBytes > 45 * 1024 * 1024) {
    progressColorClass = 'bg-red-500 animate-pulse';
    badgeColorClass = 'bg-red-50 text-red-800 border-red-300';
  } else if (currentSizeBytes > 35 * 1024 * 1024) {
    progressColorClass = 'bg-amber-500';
    badgeColorClass = 'bg-amber-50 text-amber-800 border-amber-300';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{title}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Compressed 720p HD
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
            title="Close video recorder (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 50 MB Policy Info Bar (Always visible) */}
        <div className="px-4 py-2 bg-slate-800/60 border-b border-slate-700/50 flex items-center justify-between text-xs text-slate-300 shrink-0">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Upload Limit: 50 MB</strong> (Stream is auto-compressed to ensure smooth upload)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            Target Bitrate: 1.25 Mbps • Safe Duration: ~5 mins
          </span>
        </div>

        {/* Viewfinder / Video Canvas Area */}
        <div className="relative flex-1 bg-black min-h-[300px] sm:min-h-[400px] flex items-center justify-center overflow-hidden">
          {/* Active Live Camera View */}
          {!recordedBlob && !cameraError && (
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain max-h-[60vh] bg-black"
            />
          )}

          {/* Recorded Playback View */}
          {recordedBlob && previewUrl && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black">
              <video
                ref={playbackVideoRef}
                src={previewUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain max-h-[60vh]"
              />
            </div>
          )}

          {/* Camera Loading Spinner */}
          {isInitializing && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-2 text-slate-200">
              <RefreshCw className="w-8 h-8 text-teal-400 animate-spin" />
              <p className="text-xs font-medium">Initializing camera & audio stream...</p>
            </div>
          )}

          {/* Camera Error / Permission Denied Card */}
          {cameraError && (
            <div className="absolute inset-0 p-6 bg-slate-900/95 flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1.5">Direct Camera Stream Unavailable</h4>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">{cameraError}</p>
              
              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => initializeCamera()}
                  className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileFallbackInputRef.current?.click()}
                  className="w-full py-2 px-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Record with Device Camera</span>
                </button>
              </div>

              <p className="text-[10px] text-slate-400 mt-3">
                Note: When using device camera, please keep your recording under 1-2 minutes to stay within the 50 MB limit.
              </p>
            </div>
          )}

          {/* HUD OVERLAY: Top Status & 50MB Limit Alert Banner */}
          {!recordedBlob && !cameraError && (
            <div className="absolute top-3 inset-x-3 flex flex-col gap-2 pointer-events-none">
              {/* Mandatory 50 MB Limit Banner requested by user */}
              <div className={`p-2.5 rounded-xl backdrop-blur-md border shadow-lg transition-all flex items-center justify-between text-xs ${
                isRecording
                  ? 'bg-slate-900/90 border-teal-500/50 text-white'
                  : 'bg-slate-900/80 border-slate-700/80 text-slate-200'
              }`}>
                <div className="flex items-center gap-2">
                  {isRecording ? (
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                  ) : (
                    <Info className="w-4 h-4 text-teal-400 shrink-0" />
                  )}
                  <div className="text-left">
                    <p className="font-bold flex items-center gap-1.5">
                      <span>{isRecording ? 'Recording in Progress' : '50 MB Maximum Upload Limit'}</span>
                      <span className="text-[10px] font-normal text-teal-300 hidden sm:inline">• Live compressed video</span>
                    </p>
                    <p className="text-[10px] text-slate-300">
                      {isRecording
                        ? 'Video is compressed live at 720p HD to stay strictly under 50 MB.'
                        : 'Press the red button below to begin recording. Limit is 50 MB.'}
                    </p>
                  </div>
                </div>

                {/* Flip camera button */}
                {!isRecording && (
                  <button
                    type="button"
                    onClick={handleToggleFacingMode}
                    className="pointer-events-auto p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-600/60 transition-colors flex items-center gap-1 text-[10px] font-bold"
                    title="Flip camera (Front / Back)"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{facingMode === 'environment' ? 'Rear' : 'Front'}</span>
                  </button>
                )}
              </div>

              {/* Toast popup immediately when recording starts */}
              {showStartToast && (
                <div className="p-2.5 rounded-xl bg-teal-950/90 border border-teal-500/80 text-teal-100 shadow-xl flex items-center gap-2 text-xs animate-in slide-in-from-top-2">
                  <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>
                    <strong>Recording Started:</strong> 50 MB safety limit is active. Live data meter is tracking video size below.
                  </span>
                </div>
              )}

              {/* Warning when reaching 40MB+ */}
              {isRecording && currentSizeBytes > 38 * 1024 * 1024 && (
                <div className="p-2.5 rounded-xl bg-red-950/90 border border-red-500/80 text-red-100 shadow-xl flex items-center gap-2 text-xs animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    <strong>Approaching 50 MB limit!</strong> Please conclude your recording. System will auto-stop at 48.5 MB.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* HUD OVERLAY: Active Recording Telemetry (Timer & Size Meter) */}
          {isRecording && (
            <div className="absolute bottom-3 inset-x-3 pointer-events-none flex flex-col gap-1.5">
              <div className="p-2.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-700/80 shadow-2xl flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white text-sm bg-red-950/80 border border-red-500/40 px-2 py-0.5 rounded">
                      {formatTime(recordingSeconds)}
                    </span>
                    <span className="text-[11px] text-slate-400">/ ~05:00 max</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="text-slate-400 text-[11px]">Recorded Size:</span>
                    <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-600/60">
                      {formatSizeMB(currentSizeBytes)} MB / 50.0 MB ({sizePercentage}%)
                    </span>
                  </div>
                </div>

                {/* Live Size Progress Bar */}
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${progressColorClass}`}
                    style={{ width: `${Math.max(2, sizePercentage)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* HUD OVERLAY: Review Screen Badge */}
          {recordedBlob && (
            <div className="absolute top-3 inset-x-3 pointer-events-none flex items-center justify-between">
              <div className="p-2 rounded-xl bg-slate-900/90 backdrop-blur-md border border-emerald-500/50 shadow-lg flex items-center gap-2 text-xs text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Recording Finished:</strong> {(recordedBlob.size / (1024 * 1024)).toFixed(2)} MB{' '}
                  <span className="text-emerald-400 font-bold">(Well within 50 MB limit)</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="p-3 sm:p-4 bg-slate-800/95 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Status info */}
          <div className="text-xs text-slate-400 text-center sm:text-left">
            {recordedBlob ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1 justify-center sm:justify-start">
                <Check className="w-3.5 h-3.5" /> Video preview ready. Click "Use Video" to attach.
              </span>
            ) : isRecording ? (
              <span className="text-red-400 font-medium flex items-center gap-1 justify-center sm:justify-start">
                <Square className="w-3 h-3 fill-current" /> Recording active. Click the square button to stop.
              </span>
            ) : (
              <span className="flex items-center gap-1 justify-center sm:justify-start">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                {hasAudio ? 'Camera & microphone ready' : 'Camera ready (Audio muted)'} • Max 50 MB
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-center">
            {/* Case 1: Post-Recording Review Mode */}
            {recordedBlob ? (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="py-2 px-3.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retake Video</span>
                </button>
                <button
                  type="button"
                  onClick={handleUseVideo}
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-950/40"
                >
                  <Check className="w-4 h-4" />
                  <span>Use & Attach Video</span>
                </button>
              </>
            ) : isRecording ? (
              /* Case 2: Active Recording Mode - Stop Button */
              <button
                type="button"
                onClick={() => handleStopRecording('user')}
                className="py-2.5 px-6 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-950/50 animate-pulse"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop Recording ({formatTime(recordingSeconds)})</span>
              </button>
            ) : (
              /* Case 3: Ready to Record Mode */
              <>
                <button
                  type="button"
                  onClick={() => fileFallbackInputRef.current?.click()}
                  className="py-2 px-3 bg-slate-700/60 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Upload existing video file from phone or computer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Upload File</span>
                </button>

                <button
                  type="button"
                  disabled={isInitializing || !!cameraError}
                  onClick={handleStartRecording}
                  className="py-2.5 px-5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-teal-950/40"
                >
                  <div className="w-3 h-3 rounded-full bg-red-500 border border-white animate-pulse" />
                  <span>Start Recording (50 MB Limit)</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Hidden Fallback Input */}
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
