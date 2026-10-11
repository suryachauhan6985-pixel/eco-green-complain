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
  Monitor,
  Layers,
  CheckCircle2
} from 'lucide-react';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';

// High Quality HD Compression & Multi-Part Auto-Splitting (50 MB limit compliance)
// 1. Bitrate: 1.20 Mbps video + 64 kbps audio = ~1.26 Mbps (~158 KB/s)
//    Yields ~9.5 MB per minute of clear 720p HD footage (solar panel serials, meter readings, wiring).
// 2. Auto-Split Threshold: 42 MB (Comfortably under the 50 MB server upload limit).
//    When a recording nears 42 MB, it auto-seals Part 1 and seamlessly continues recording into Part 2
//    without interrupting camera feed or requiring any manual action from the user.
const MAX_LIMIT_BYTES = 50 * 1024 * 1024; // Strict 50 MB server limit
const SPLIT_THRESHOLD_BYTES = 42 * 1024 * 1024; // 42 MB auto-split boundary per part
const TARGET_VIDEO_BITRATE = 1_200_000; // 1.2 Mbps video bitrate for high clarity + low file size (~9 MB per minute)
const TARGET_AUDIO_BITRATE = 64_000; // 64 kbps mono audio
const MAX_RECORDING_SECONDS = 600; // 10 minutes max total duration across parts

export function VideoRecorderModal({
  isOpen,
  onClose,
  onRecordingComplete,
  maxSizeBytes = MAX_LIMIT_BYTES,
  title = 'Record Site Video',
  subtitle = 'High Quality HD Recording • Auto-Split Under 50 MB'
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

  // Recording State & Multi-Part Tracking
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [currentSizeBytes, setCurrentSizeBytes] = useState(0);
  const [activePartSizeBytes, setActivePartSizeBytes] = useState(0);
  const [activePartNumber, setActivePartNumber] = useState(1);
  const [splitNotification, setSplitNotification] = useState(null);
  const [recordedParts, setRecordedParts] = useState([]); // Array of File objects
  const [previewUrls, setPreviewUrls] = useState([]);
  const [selectedReviewPartIndex, setSelectedReviewPartIndex] = useState(0);
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

  // Live camera stream dimensions metadata
  const [liveStreamMeta, setLiveStreamMeta] = useState({
    width: 0,
    height: 0,
    isLandscape: false
  });

  const activeStreamRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const currentPartChunksRef = useRef([]);
  const completedPartsRef = useRef([]);
  const activePartNumberRef = useRef(1);
  const isSplittingRef = useRef(false);
  const userRequestedStopRef = useRef(false);
  const baseTimestampRef = useRef('');
  const recorderOptionsRef = useRef({});
  const timerIntervalRef = useRef(null);
  const fileFallbackInputRef = useRef(null);
  const previewUrlsRef = useRef([]);

  // Touch pinch-to-zoom tracking refs
  const touchStartDistanceRef = useRef(null);
  const touchStartZoomRef = useRef(1);

  // Monitor screen resize & auto device orientation
  useEffect(() => {
    const handleOrientationChange = () => {
      const portrait = typeof window !== 'undefined' ? window.innerHeight >= window.innerWidth : true;
      setIsDevicePortrait(portrait);
      setRecordingOrientation(portrait ? 'portrait' : 'landscape');
    };

    handleOrientationChange();
    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.addEventListener === 'function') {
      screen.orientation.addEventListener('change', handleOrientationChange);
    }
    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.removeEventListener === 'function') {
        screen.orientation.removeEventListener('change', handleOrientationChange);
      }
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

  // Stop active camera stream tracks safely
  const stopStream = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
      activeStreamRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
      setStream(null);
    }
  }, [stream]);

  // Clean up recorded preview URLs
  const resetRecording = useCallback(() => {
    if (previewUrlsRef.current.length > 0) {
      previewUrlsRef.current.forEach(u => {
        try { URL.revokeObjectURL(u); } catch (_) {}
      });
      previewUrlsRef.current = [];
    }
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
    }
    setRecordedBlob(null);
    setPreviewUrl(null);
    setRecordedParts([]);
    setPreviewUrls([]);
    setSelectedReviewPartIndex(0);
    setRecordingSeconds(0);
    setCurrentSizeBytes(0);
    setActivePartSizeBytes(0);
    setActivePartNumber(1);
    setSplitNotification(null);
    setZoomLevel(1); // strictly reset zoom to 1x
    setPreviewMeta({ width: 0, height: 0, isLandscape: false, rotation: 0 });
    setLiveStreamMeta({ width: 0, height: 0, isLandscape: false });

    currentPartChunksRef.current = [];
    completedPartsRef.current = [];
    activePartNumberRef.current = 1;
    isSplittingRef.current = false;
    userRequestedStopRef.current = false;
    baseTimestampRef.current = '';

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

  // Start hardware camera stream with auto-orienting HD constraints and 1x zoom
  const initializeCamera = useCallback(async (desiredFacingMode = facingMode) => {
    if (!isOpen) return;
    setIsInitializing(true);
    setCameraError(null);
    setZoomLevel(1); // strictly enforce 1x base zoom

    // Stop any existing stream tracks cleanly
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      activeStreamRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      setStream(null);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser. Please use the device camera or file selector below.');
      setIsInitializing(false);
      return;
    }

    try {
      // Natural 720p HD constraints without rigid forced aspect ratios,
      // allowing phone hardware to adapt smoothly between portrait (9:16) and landscape (16:9).
      const constraints = {
        video: {
          facingMode: { ideal: desiredFacingMode },
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 1280 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 44100
        }
      };

      let newStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
        setHasAudio(true);
      } catch (audioOrModeErr) {
        console.warn('Audio or preferred constraint failed, trying basic video with audio:', audioOrModeErr);
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: desiredFacingMode },
              width: { ideal: 1280, max: 1280 },
              frameRate: { ideal: 24, max: 30 }
            },
            audio: true
          });
          setHasAudio(true);
        } catch (modeErr) {
          console.warn('Audio with video failed, trying video only:', modeErr);
          try {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: desiredFacingMode } }
            });
            setHasAudio(false);
          } catch (basicErr) {
            newStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setHasAudio(false);
          }
        }
      }

      activeStreamRef.current = newStream;
      setStream(newStream);

      // Immediately connect to video element to eliminate black screen
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = newStream;
        const playPromise = videoPreviewRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => console.warn('Preview play warning:', e));
        }
      }

      // Check hardware zoom capabilities in background and strictly initialize at 1.0x
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

            try {
              const defaultZoom = Math.max(1, minZ);
              track.applyConstraints({ advanced: [{ zoom: defaultZoom }] }).catch(() => {});
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
  }, [isOpen, facingMode]);

  // CRITICAL: Initialize camera stream immediately as soon as modal opens, and cleanly stop when it closes
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

  // CRITICAL: Keep video element synchronized with active stream at all times (guarantees preview on first load)
  useEffect(() => {
    if (videoPreviewRef.current && stream) {
      if (videoPreviewRef.current.srcObject !== stream) {
        videoPreviewRef.current.srcObject = stream;
      }
      const playPromise = videoPreviewRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    }
  }, [stream]);

  // Flip camera between environment (back) and user (front)
  const handleToggleFacingMode = async () => {
    if (isRecording) return;
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    await initializeCamera(nextMode);
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

  // Helper to attach recorder events for seamless auto-split multi-part recording
  const setupRecorderInstance = (recorder, currentStream) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        currentPartChunksRef.current.push(event.data);

        // Calculate size of current part
        let partBytes = 0;
        for (const c of currentPartChunksRef.current) {
          partBytes += c.size;
        }
        setActivePartSizeBytes(partBytes);

        // Calculate total size across all completed parts + current part
        let totalBytes = partBytes;
        for (const p of completedPartsRef.current) {
          totalBytes += p.size;
        }
        setCurrentSizeBytes(totalBytes);

        // AUTOMATIC SPLIT TRIGGER:
        // When the active part reaches 42 MB, automatically seal it and continue with Part N+1!
        if (partBytes >= SPLIT_THRESHOLD_BYTES && !isSplittingRef.current && !userRequestedStopRef.current) {
          isSplittingRef.current = true;
          try {
            recorder.stop();
          } catch (stopErr) {
            console.warn('Auto-split stop error:', stopErr);
            isSplittingRef.current = false;
          }
        }
      }
    };

    recorder.onstop = () => {
      const chunks = currentPartChunksRef.current;
      const currentPartNum = activePartNumberRef.current;
      const mimeType = recorderOptionsRef.current.mimeType || recordedMimeType || 'video/webm';

      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType });
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const orientationTag = recordingOrientation || (previewMeta.isLandscape ? 'landscape' : 'portrait');
        const partName = `VID_${baseTimestampRef.current}_${orientationTag}_part${currentPartNum}.${ext}`;
        const partFile = new File([blob], partName, {
          type: mimeType,
          lastModified: Date.now()
        });
        completedPartsRef.current.push(partFile);
        setRecordedParts([...completedPartsRef.current]);
      }

      currentPartChunksRef.current = [];
      setActivePartSizeBytes(0);

      // Check whether this stop was caused by an auto-split OR by user stopping
      if (isSplittingRef.current && !userRequestedStopRef.current && currentStream) {
        // CONTINUE AUTO-SPLIT SEAMLESSLY
        const nextPartNum = currentPartNum + 1;
        activePartNumberRef.current = nextPartNum;
        setActivePartNumber(nextPartNum);

        const lastPartFile = completedPartsRef.current[completedPartsRef.current.length - 1];
        const lastPartMB = lastPartFile ? (lastPartFile.size / (1024 * 1024)).toFixed(1) : '42.0';
        setSplitNotification(`Part ${currentPartNum} saved (${lastPartMB} MB) • Seamlessly recording Part ${nextPartNum}...`);

        setTimeout(() => {
          setSplitNotification(null);
        }, 4500);

        try {
          const nextRecorder = new MediaRecorder(currentStream, recorderOptionsRef.current);
          setupRecorderInstance(nextRecorder, currentStream);
          nextRecorder.start(500);
          mediaRecorderRef.current = nextRecorder;
          isSplittingRef.current = false;
        } catch (startNextErr) {
          console.error('Failed to start next part recorder:', startNextErr);
          isSplittingRef.current = false;
          finalizeRecordingSession();
        }
      } else {
        // FINAL FINISH: User stopped recording or reached max total duration
        finalizeRecordingSession();
      }
    };
  };

  // Finalize all recorded parts and create preview URLs
  const finalizeRecordingSession = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsRecording(false);
    isSplittingRef.current = false;
    userRequestedStopRef.current = false;

    const allParts = [...completedPartsRef.current];
    if (allParts.length > 0) {
      const totalCount = allParts.length;
      const mimeType = recordedMimeType || 'video/webm';
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const orientationTag = recordingOrientation || (previewMeta.isLandscape ? 'landscape' : 'portrait');

      // If multiple parts, format clean filenames with Part X of Y
      const finalFiles = allParts.map((file, idx) => {
        if (totalCount > 1) {
          const renamed = `VID_${baseTimestampRef.current}_${orientationTag}_part${idx + 1}_of_${totalCount}.${ext}`;
          return new File([file], renamed, { type: file.type, lastModified: file.lastModified });
        }
        return file;
      });

      // Cleanup old preview URLs if any
      if (previewUrlsRef.current.length > 0) {
        previewUrlsRef.current.forEach(u => {
          try { URL.revokeObjectURL(u); } catch (_) {}
        });
      }

      const urls = finalFiles.map(f => URL.createObjectURL(f));
      previewUrlsRef.current = urls;
      setPreviewUrls(urls);
      setRecordedParts(finalFiles);
      setRecordedBlob(finalFiles[0]); // Primary reference
      setPreviewUrl(urls[0]); // Default preview to Part 1
      setSelectedReviewPartIndex(0);
    }
  };

  // Start compressed high-quality recording with multi-part auto-split
  const handleStartRecording = () => {
    if (!stream) {
      if (!isInitializing && !cameraError) {
        initializeCamera();
      }
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      alert('MediaRecorder is not supported in this browser. Please use the device file picker.');
      return;
    }

    try {
      currentPartChunksRef.current = [];
      completedPartsRef.current = [];
      activePartNumberRef.current = 1;
      isSplittingRef.current = false;
      userRequestedStopRef.current = false;

      setActivePartNumber(1);
      setActivePartSizeBytes(0);
      setCurrentSizeBytes(0);
      setRecordingSeconds(0);
      setRecordedParts([]);
      setSplitNotification(null);

      // Generate base timestamp for this session
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      baseTimestampRef.current = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      const mimeType = getOptimalMimeType();
      setRecordedMimeType(mimeType || 'video/webm');

      // Optimized High-Quality Compression (~1.20 Mbps Video + 64 kbps Audio):
      // Results in ~9.5 MB per minute of clear 720p HD recording.
      // Solar inverter serial numbers, meter readings, panel barcodes, and wire connections remain razor sharp.
      const recorderOptions = {
        videoBitsPerSecond: TARGET_VIDEO_BITRATE,
        audioBitsPerSecond: TARGET_AUDIO_BITRATE
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      recorderOptionsRef.current = recorderOptions;

      const recorder = new MediaRecorder(stream, recorderOptions);
      setupRecorderInstance(recorder, stream);

      // Request data slices every 500ms to monitor live size counter & auto-split
      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Live timer tick (max 600 seconds = 10 minutes total across parts)
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
    userRequestedStopRef.current = true;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    } else {
      finalizeRecordingSession();
    }

    if (stopReason === 'time_limit') {
      alert('Maximum session duration of 10 minutes reached. All parts have been saved under 50 MB each.');
    }
  };

  // Discard and retake
  const handleRetake = () => {
    resetRecording();
    if (!stream) {
      initializeCamera();
    }
  };

  // Switch reviewed part
  const handleSelectReviewPart = (index) => {
    if (previewUrls[index]) {
      setSelectedReviewPartIndex(index);
      setPreviewUrl(previewUrls[index]);
      setRecordedBlob(recordedParts[index]);
    }
  };

  // Rotate preview 90 degrees
  const handleRotatePreview = () => {
    setPreviewMeta(prev => ({
      ...prev,
      rotation: (prev.rotation + 90) % 360
    }));
  };

  // Confirm and finish - passes either single file or array of split files
  const handleUseVideo = () => {
    if (!recordedParts || recordedParts.length === 0) {
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
      return;
    }

    const filesToSubmit = recordedParts.length === 1 ? recordedParts[0] : recordedParts;

    stopStream();
    resetRecording();
    onRecordingComplete(filesToSubmit);
    onClose();
  };

  // Fallback to native device file/camera input with size verification
  const handleFallbackFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > maxSizeBytes) {
      alert(
        `Selected video file "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB, which exceeds the 50 MB server upload limit.\n\nPlease use our In-App HD Camera to record — it automatically compresses video to ~10 MB/min and seamlessly auto-splits long recordings into parts under 50 MB with zero manual effort!`
      );
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
  const partSizePercentage = Math.min(100, Math.round((activePartSizeBytes / SPLIT_THRESHOLD_BYTES) * 100));

  // Determine progress bar color based on active part size threshold
  let progressColorClass = 'bg-teal-400';
  if (activePartSizeBytes > 38 * 1024 * 1024) {
    progressColorClass = 'bg-amber-400 animate-pulse';
  } else if (activePartSizeBytes > 30 * 1024 * 1024) {
    progressColorClass = 'bg-emerald-400';
  }

  // Preset zoom levels to display (clamped to max zoom capability)
  const availableZoomPresets = [1, 2, 3, 5].filter(z => z <= (zoomCapabilities.max || 5));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black sm:bg-slate-950/85 sm:backdrop-blur-md backdrop-enter-fade">
      {/* Full-screen on mobile, large immersive modal on tablet/desktop */}
      <div className="relative w-full h-[100dvh] sm:h-[92vh] sm:max-w-4xl sm:rounded-2xl sm:border sm:border-slate-800 bg-black overflow-hidden flex flex-col shadow-2xl modal-enter-scale">
        
        {/* Top Slim Progress Bar (Active only when recording) */}
        {isRecording && (
          <div className="absolute top-0 inset-x-0 h-1.5 bg-black/50 z-30 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ease-out ${progressColorClass}`}
              style={{ width: `${Math.max(3, partSizePercentage)}%` }}
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
              ref={(el) => {
                videoPreviewRef.current = el;
                if (el && stream && el.srcObject !== stream) {
                  el.srcObject = stream;
                  el.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => {
                const w = e.target.videoWidth || 0;
                const h = e.target.videoHeight || 0;
                setLiveStreamMeta({
                  width: w,
                  height: h,
                  isLandscape: w > h
                });
              }}
              onResize={(e) => {
                const w = e.target.videoWidth || 0;
                const h = e.target.videoHeight || 0;
                setLiveStreamMeta({
                  width: w,
                  height: h,
                  isLandscape: w > h
                });
              }}
              style={{
                transform: (!zoomCapabilities.supported && zoomLevel > 1) ? `scale(${zoomLevel})` : undefined,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out'
              }}
              className="w-full h-full max-h-full max-w-full object-contain bg-black transition-all duration-300"
            />
          )}

          {/* Recorded Playback Review Stream */}
          {recordedBlob && previewUrl && (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <video
                key={previewUrl}
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
                className="max-h-full max-w-full w-full h-full object-contain"
              />
            </div>
          )}

          {/* Multi-Part Tab Selector in Review Mode (Shown when multiple parts recorded) */}
          {recordedParts.length > 1 && recordedBlob && (
            <div className="absolute top-16 inset-x-0 flex flex-col items-center gap-1.5 z-30 pointer-events-none px-4">
              <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-full bg-black/75 backdrop-blur-md border border-emerald-500/40 shadow-2xl">
                <div className="px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 flex items-center gap-1 font-mono">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{recordedParts.length} Parts Auto-Split:</span>
                </div>
                {recordedParts.map((part, idx) => (
                  <button
                    key={part.name || idx}
                    type="button"
                    onClick={() => handleSelectReviewPart(idx)}
                    className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition-all cursor-pointer ${
                      selectedReviewPartIndex === idx
                        ? 'bg-emerald-500 text-slate-950 shadow-md scale-105'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Part {idx + 1} ({formatSizeMB(part.size)} MB)
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-emerald-300 bg-black/60 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                All parts under 50 MB limit • Will be attached together
              </span>
            </div>
          )}

          {/* Floating Auto-Split Live Notification Banner */}
          {splitNotification && (
            <div className="absolute top-16 inset-x-4 max-w-md mx-auto p-2.5 rounded-xl bg-emerald-950/90 backdrop-blur-md border border-emerald-400 text-white text-xs shadow-2xl flex items-center gap-2.5 z-40 animate-in fade-in slide-in-from-top-2 pointer-events-none">
              <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <span className="font-semibold text-emerald-100">{splitNotification}</span>
            </div>
          )}

          {/* Camera Loading Spinner */}
          {isInitializing && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3 text-slate-200 z-10">
              <RefreshCw className="w-9 h-9 text-teal-400 animate-spin" />
              <p className="text-xs font-semibold tracking-wide">
                Starting HD camera...
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
                Note: File upload limit is 50 MB per file.
              </p>
            </div>
          )}

          {/* FLOATING TOP BAR: Sleek, non-intrusive HUD Over Viewfinder */}
          <div className="absolute top-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-b from-black/85 via-black/30 to-transparent flex items-center justify-between z-20 pointer-events-none gap-2">
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
                    {formatTime(recordingSeconds)}
                  </span>
                  <span className="text-[11px] text-teal-300 font-mono font-bold border-l border-white/20 pl-2">
                    Part {activePartNumber} ({formatSizeMB(activePartSizeBytes)} MB)
                  </span>
                  <span className="text-[10px] text-slate-300 font-mono border-l border-white/20 pl-2 hidden xs:inline">
                    Total: {formatSizeMB(currentSizeBytes)} MB
                  </span>
                  <span className="text-[10px] text-teal-300 font-mono border-l border-white/20 pl-2 hidden sm:inline">
                    {zoomLevel.toFixed(1)}x
                  </span>
                </div>
              ) : recordedBlob ? (
                /* Review Mode Pill */
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/50 text-white text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-semibold">
                    {recordedParts.length > 1
                      ? `${recordedParts.length} Parts (${formatSizeMB(currentSizeBytes)} MB Total)`
                      : `${formatSizeMB(recordedBlob.size)} MB`}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold capitalize">
                    ({recordingOrientation})
                  </span>
                </div>
              ) : (
                /* Idle Ready Pill (Very compact so entire screen is visible) */
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white text-xs shadow-md">
                  <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                  <span className="font-semibold text-[11px]">HD Auto-Split</span>
                  <span className="text-[10px] text-teal-300 font-mono hidden xs:inline">• Max 50 MB / Part</span>
                </div>
              )}
            </div>

            {/* Auto-Orientation Dynamic Indicator Badge */}
            {!recordedBlob && (
              <div className="pointer-events-auto hidden xs:flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/20 text-white shadow-lg text-[11px] font-mono">
                {isDevicePortrait ? (
                  <>
                    <Smartphone className="w-3.5 h-3.5 text-teal-400" />
                    <span className="font-semibold">Auto • Portrait</span>
                  </>
                ) : (
                  <>
                    <Monitor className="w-3.5 h-3.5 text-teal-400" />
                    <span className="font-semibold">Auto • Landscape</span>
                  </>
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

          {/* Near-Limit Live Hint (Shows that Part N will auto-split seamlessly into next part) */}
          {isRecording && activePartSizeBytes > 36 * 1024 * 1024 && !splitNotification && (
            <div className="absolute top-16 inset-x-4 max-w-sm mx-auto p-2.5 rounded-xl bg-teal-950/90 backdrop-blur-md border border-teal-400 text-white text-xs shadow-2xl flex items-center gap-2 z-20 pointer-events-none">
              <Sparkles className="w-4 h-4 text-teal-300 shrink-0 animate-spin" />
              <span>
                <strong>Part {activePartNumber} nearing 42 MB.</strong> Will auto-split seamlessly into Part {activePartNumber + 1}. Keep recording!
              </span>
            </div>
          )}

          {/* FLOATING ZOOM PRESET CONTROLS (Positioned vertically on the Right Side - Safe Distance from Shutter) */}
          {!recordedBlob && !cameraError && (
            <div className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-30 pointer-events-none">
              <div className="pointer-events-auto flex flex-col items-center gap-2 p-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 shadow-2xl">
                {availableZoomPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      applyZoom(preset);
                    }}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full text-xs font-bold font-mono flex items-center justify-center transition-all cursor-pointer ${
                      Math.abs(zoomLevel - preset) < 0.2
                        ? 'bg-teal-500 text-slate-950 shadow-md scale-105 ring-2 ring-teal-300'
                        : 'text-white/80 hover:text-white hover:bg-white/15'
                    }`}
                    title={`Set zoom to ${preset}x`}
                  >
                    {preset}x
                  </button>
                ))}

                {/* Show custom decimal zoom level if pinched between presets */}
                {!availableZoomPresets.some(p => Math.abs(zoomLevel - p) < 0.2) && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold text-teal-400 bg-teal-950/80 rounded-full border border-teal-500/40">
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

            {/* Center Slot: Primary Shutter Control (Big, Unobstructed, Safe from Zoom Buttons) */}
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
                    <span>
                      {recordedParts.length > 1
                        ? `Use Video (${recordedParts.length} Parts)`
                        : 'Use Video'}
                    </span>
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
                  disabled={isInitializing || !stream || !!cameraError}
                  onClick={handleStartRecording}
                  className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white bg-white/10 backdrop-blur-md flex items-center justify-center cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-transform shadow-2xl"
                  title={!stream ? "Connecting to camera..." : "Start recording (HD auto-compressed • auto-splits under 50 MB)"}
                >
                  <div className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 transition-colors shadow-inner" />
                </button>
              )}
            </div>

            {/* Right Slot: Quick Flip Camera (Rear ↔ Front) */}
            <div className="w-20 flex justify-end">
              {!isRecording && !recordedBlob && (
                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="p-3 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-full text-white border border-white/20 transition-all cursor-pointer shadow-md flex items-center justify-center"
                  title={`Flip camera (${facingMode === 'environment' ? 'Switch to Front' : 'Switch to Rear'})`}
                >
                  <FlipHorizontal className="w-5 h-5 text-teal-400" />
                </button>
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
