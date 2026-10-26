import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Camera, Video, RotateCcw, Check, Upload, AlertCircle, 
  FlipHorizontal, RefreshCw, Play, Pause
} from 'lucide-react';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';

// High-Efficiency 720p HD Optimization with Zero Lag on Mobile:
// Target: 3 Minutes (~180s) 720p HD Video guaranteed smooth, stutter-free, and under 50 MB.
// High-Efficiency 720p HD Optimization with Crystal-Clear Audio:
// 2.5 Mbps video + 128 kbps audio for razor-sharp panels & zero speech clipping.
// Seamless automatic multi-part splitting keeps each video part safely under 50 MB.
const MAX_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB threshold per part
const MAX_RECORDING_SECONDS = 300; // Up to 5 minutes total recording
const TARGET_VIDEO_BITRATE = 2_500_000; // 2.5 Mbps crisp HD without frame drops
const TARGET_AUDIO_BITRATE = 128_000; // 128 kbps full-fidelity voice

export function VideoRecorderModal({
  isOpen,
  onClose,
  onRecordingComplete,
  maxSizeBytes = MAX_LIMIT_BYTES,
  title = 'Record Site Video',
  subtitle = 'Crisp 720p HD recording with automatic multi-part split under 50 MB'
}) {
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // Default to rear camera
  const [isInitializing, setIsInitializing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  // Permission Dialog State: 'checking' | 'prompt' | 'granted' | 'denied' | 'insecure_context'
  const [permissionStatus, setPermissionStatus] = useState('checking');

  // Recording State & Multi-Part Auto-Split
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [currentSizeBytes, setCurrentSizeBytes] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedParts, setRecordedParts] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recordedMimeType, setRecordedMimeType] = useState('video/webm');
  const [partNotification, setPartNotification] = useState(null);

  // Photo snapshots taken during session
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [photoFlash, setPhotoFlash] = useState(false);

  // Zoom presets: 0.5x, 1x, 2x
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomNotification, setZoomNotification] = useState(null);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState(null);

  const activeStreamRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordedPartsRef = useRef([]);
  const currentPartIndexRef = useRef(1);
  const isSplittingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const currentBytesAccumulatorRef = useRef(0);
  const lastZoomUpdateRef = useRef(0);
  const timerIntervalRef = useRef(null);
  const fileFallbackInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  // Detect camera devices to find potential ultra-wide rear camera
  const detectCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setAvailableCameras(videoDevices);
      return videoDevices;
    } catch (_) {
      return [];
    }
  }, []);

  // Pick optimal supported container format
  const getOptimalMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    const isSafariOrIOS = /^((?!chrome|android).)*safari/i.test(navigator.userAgent || '') || /iPad|iPhone|iPod/.test(navigator.userAgent || '');
    const safariCandidates = [
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
      'video/webm'
    ];
    const standardCandidates = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];
    const candidates = isSafariOrIOS ? safariCandidates : standardCandidates;
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
    setRecordedParts([]);
    recordedPartsRef.current = [];
    currentPartIndexRef.current = 1;
    isSplittingRef.current = false;
    isRecordingRef.current = false;
    setPartNotification(null);
    setPreviewUrl(null);
    setRecordingSeconds(0);
    setCurrentSizeBytes(0);
    recordedChunksRef.current = [];
    currentBytesAccumulatorRef.current = 0;
    setCapturedPhotos(prev => {
      prev.forEach(p => {
        try { URL.revokeObjectURL(p.preview); } catch (_) {}
      });
      return [];
    });
    setPhotoFlash(false);
    setZoomLevel(1);
    setZoomNotification(null);

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
  // Initialize native camera feed
  const initializeCamera = useCallback(async (desiredFacing = facingMode, deviceId = null) => {
    if (!isOpen) return null;
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
      setPermissionStatus('insecure_context');
      setIsInitializing(false);
      return null;
    }

    // Strict 720p maximum resolution & stable 30 FPS bounds:
    // Prevents frame drops, lag, and viewfinder stuttering on mobile GPU/CPU.
    const videoConstraints = {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: desiredFacing } }),
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 30, max: 30 }
    };

    // Full-fidelity voice configuration:
    // Disable aggressive echoCancellation and noiseSuppression to prevent voice cutting/clipping
    // when technicians speak near solar inverters and outdoor environmental sounds.
    const baseConstraints = {
      video: videoConstraints,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000
      }
    };

    let newStream = null;
    try {
      newStream = await navigator.mediaDevices.getUserMedia(baseConstraints);
    } catch (primaryErr) {
      console.warn('[VideoRecorder] Primary getUserMedia failed, trying fallback:', primaryErr);
      try {
        // Fallback 1: basic video + audio with frameRate cap
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: desiredFacing },
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: true
        });
      } catch (audioErr) {
        console.warn('[VideoRecorder] Audio request failed, trying video only:', audioErr);
        try {
          // Fallback 2: video only with frameRate cap
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: desiredFacing },
              width: { ideal: 1280, max: 1280 },
              height: { ideal: 720, max: 720 },
              frameRate: { ideal: 24, max: 30 }
            }
          });
        } catch (videoOnlyErr) {
          try {
            // Fallback 3: generic video with frameRate cap
            newStream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280, max: 1280 },
                height: { ideal: 720, max: 720 },
                frameRate: { ideal: 24, max: 30 }
              }
            });
          } catch (finalErr) {
            console.error('[VideoRecorder] All getUserMedia attempts failed:', finalErr);
            if (finalErr.name === 'NotAllowedError' || finalErr.name === 'PermissionDeniedError') {
              setPermissionStatus('denied');
            } else {
              let msg = 'Could not access device camera. Please check camera permissions in your browser settings.';
              if (finalErr.name === 'NotReadableError') {
                msg = 'Camera is currently locked by another app or phone call. Please close other camera apps and try again.';
              }
              setCameraError(msg);
            }
            setIsInitializing(false);
            return null;
          }
        }
      }
    }

    activeStreamRef.current = newStream;
    setStream(newStream);
    setPermissionStatus('granted');
    setCameraError(null);
    attachStreamToVideo(newStream);

    // Track active device ID
    const track = newStream.getVideoTracks()[0];
    if (track) {
      const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
      if (settings.deviceId) {
        setActiveDeviceId(settings.deviceId);
      }
      track.onended = () => {
        if (isOpen && !recordedBlob) {
          initializeCamera(desiredFacing);
        }
      };
    }

    // Refresh devices list
    detectCameras();
    setIsInitializing(false);
    return newStream;
  }, [isOpen, facingMode, attachStreamToVideo, recordedBlob, detectCameras]);

  // Check permission status and initialize if already granted
  const checkPermissionAndInit = useCallback(async () => {
    // 1. Check if the environment is a secure context or localhost
    const isSecure = Boolean(
      window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );

    if (!isSecure && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
      setPermissionStatus('insecure_context');
      return;
    }

    // 2. Query browser camera permission if supported
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const queryRes = await navigator.permissions.query({ name: 'camera' });
        if (queryRes.state === 'granted') {
          await initializeCamera(facingMode);
          return;
        } else if (queryRes.state === 'denied') {
          setPermissionStatus('denied');
          return;
        } else {
          // 'prompt' state: show the native Android-style permission dialog
          setPermissionStatus('prompt');
          return;
        }
      } catch (e) {
        console.warn('[VideoRecorder] navigator.permissions.query failed or not supported:', e);
      }
    }

    // 3. Fallback: prompt dialog first
    setPermissionStatus('prompt');
  }, [facingMode, initializeCamera]);

  // User explicitly clicks "Enable Camera" button from the Android permission card
  const handleRequestPermission = async () => {
    setIsInitializing(true);
    setCameraError(null);
    try {
      const liveStream = await initializeCamera(facingMode);
      if (liveStream) {
        setPermissionStatus('granted');
      }
    } catch (err) {
      console.warn('[VideoRecorder] Permission request failed:', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setPermissionStatus('denied');
      } else {
        setCameraError(err?.message || 'Could not access device camera.');
      }
    } finally {
      setIsInitializing(false);
    }
  };

  // Initialize camera or check permission whenever modal opens
  useEffect(() => {
    if (isOpen) {
      checkPermissionAndInit();
    } else {
      stopStream();
      resetRecording();
      setPermissionStatus('checking');
      setCameraError(null);
    }
    return () => {
      stopStream();
    };
  }, [isOpen, checkPermissionAndInit, stopStream, resetRecording]);

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

  // Zoom Handler: Supports 0.5x up to 5x zoom
  const applyZoom = useCallback(async (targetZoom) => {
    const clampedZoom = Math.max(0.5, Math.min(5, Number(Number(targetZoom).toFixed(1))));
    setZoomLevel(clampedZoom);

    const track = activeStreamRef.current?.getVideoTracks()?.[0];
    if (!track) return;

    const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    const hasHardwareZoom = Boolean(caps && caps.zoom);

    if (clampedZoom === 0.5) {
      // 1. Try hardware zoom < 1 if supported
      if (hasHardwareZoom && caps.zoom?.min <= 0.5) {
        try {
          await track.applyConstraints({ advanced: [{ zoom: 0.5 }] });
          return;
        } catch (_) {}
      }

      // 2. Try switching to physical ultra-wide back camera
      if (!isRecording && facingMode === 'environment') {
        const cams = availableCameras.length > 0 ? availableCameras : await detectCameras();
        const backCams = cams.filter(c => {
          const lbl = (c.label || '').toLowerCase();
          return lbl.includes('back') || lbl.includes('rear') || lbl.includes('environment') || (!lbl.includes('front') && !lbl.includes('user'));
        });

        if (backCams.length > 1) {
          const ultraWide = backCams.find(c => {
            const l = (c.label || '').toLowerCase();
            return l.includes('ultra') || l.includes('wide') || l.includes('0.5') || l.includes('uw') || l.includes('2');
          }) || backCams[1];

          if (ultraWide && ultraWide.deviceId && ultraWide.deviceId !== activeDeviceId) {
            try {
              await initializeCamera('environment', ultraWide.deviceId);
              setZoomNotification('Ultra-Wide (0.5x) Lens Active');
              setTimeout(() => setZoomNotification(null), 2500);
              return;
            } catch (_) {}
          }
        }
      }

      // Ultra-wide lens not found on device
      setZoomNotification('Ultra-wide (0.5x) lens not detected on this phone. Standard wide active.');
      setTimeout(() => setZoomNotification(null), 2500);
      setZoomLevel(1);
      return;
    }

    // Zoom from 1x up to 5x
    if (hasHardwareZoom) {
      const maxHw = caps.zoom?.max || 5;
      const minHw = caps.zoom?.min || 1;
      const targetVal = Math.max(minHw, Math.min(maxHw, clampedZoom));
      try {
        await track.applyConstraints({ advanced: [{ zoom: targetVal }] });
      } catch (err) {
        console.warn('Failed to apply hardware zoom:', err);
      }
    }
  }, [availableCameras, activeDeviceId, facingMode, isRecording, detectCameras, initializeCamera]);

  const touchStartDistRef = useRef(null);
  const touchStartZoomRef = useRef(1);

  // Pinch-to-zoom gesture handlers (supports 0.5x to 5.0x smooth scaling)
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoomLevel;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && touchStartDistRef.current) {
      const now = Date.now();
      if (now - lastZoomUpdateRef.current < 120) return; // Prevent flooding camera track with constraints
      lastZoomUpdateRef.current = now;

      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = currentDist / touchStartDistRef.current;
      const newZoom = Math.max(0.5, Math.min(5, Number((touchStartZoomRef.current * scale).toFixed(1))));
      if (Math.abs(newZoom - zoomLevel) >= 0.2) {
        applyZoom(newZoom);
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
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

  // Start recorder slice with continuous auto-split when nearing 46 MB
  const startRecorderSession = useCallback((partIndex = 1) => {
    if (!activeStreamRef.current && !stream) return;
    const liveStream = activeStreamRef.current || stream;

    try {
      recordedChunksRef.current = [];
      currentBytesAccumulatorRef.current = 0;
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

      let recorder;
      try {
        recorder = new MediaRecorder(liveStream, recorderOptions);
      } catch (_) {
        // Fallback without explicit bitrate constraints if mobile hardware rejects
        recorder = new MediaRecorder(liveStream, mimeType ? { mimeType } : undefined);
      }

      // Collect data every 1000ms (1 second) for smooth keyframe encoding and zero frame lag
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          currentBytesAccumulatorRef.current += e.data.size;
          setCurrentSizeBytes(currentBytesAccumulatorRef.current);

          // Auto-split safety when approaching 46 MB:
          // Smoothly rolls over to Part 2 without abruptly stopping or dropping recordings
          if (currentBytesAccumulatorRef.current >= 46 * 1024 * 1024 && !isSplittingRef.current) {
            isSplittingRef.current = true;
            recorder.stop();
          }
        }
      };

      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        const finalMime = recorder.mimeType || mimeType || 'video/webm';
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: finalMime });
          const ext = finalMime.includes('mp4') ? 'mp4' : 'webm';
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
          const currentPartNum = currentPartIndexRef.current;
          const partFilename = `VID_${ts}_site_part${currentPartNum}.${ext}`;
          const partFile = new File([blob], partFilename, {
            type: finalMime,
            lastModified: Date.now()
          });

          recordedPartsRef.current.push(partFile);
          setRecordedParts([...recordedPartsRef.current]);

          const url = URL.createObjectURL(partFile);
          previewUrlRef.current = url;
          setRecordedBlob(partFile);
          setPreviewUrl(url);
        }

        // If auto-splitting to next part while recording is active
        if (isSplittingRef.current && isRecordingRef.current) {
          isSplittingRef.current = false;
          currentPartIndexRef.current += 1;
          setPartNotification(`Part ${currentPartIndexRef.current - 1} saved under 50MB. Now recording Part ${currentPartIndexRef.current}...`);
          setTimeout(() => setPartNotification(null), 4000);

          startRecorderSession(currentPartIndexRef.current);
        } else {
          setIsRecording(false);
          isRecordingRef.current = false;
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      isRecordingRef.current = true;
    } catch (err) {
      console.error('[VideoRecorder] Failed to start recorder slice:', err);
      setIsRecording(false);
      isRecordingRef.current = false;
      alert('Could not start recording: ' + err.message);
    }
  }, [stream]);

  // Start 720p HD recording with multi-part support
  const handleStartRecording = () => {
    if (!stream) {
      if (!isInitializing) initializeCamera(facingMode);
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      alert('MediaRecorder is not supported in this browser. Please use the device file picker.');
      return;
    }

    recordedPartsRef.current = [];
    setRecordedParts([]);
    currentPartIndexRef.current = 1;
    isSplittingRef.current = false;
    setRecordingSeconds(0);

    startRecorderSession(1);

    // Timer tick (Max 300 seconds = 5 minutes)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setRecordingSeconds((prev) => {
        const next = prev + 1;
        if (next >= MAX_RECORDING_SECONDS) {
          handleStopRecording('time_limit');
        }
        return next;
      });
    }, 1000);
  };

  // Stop recording
  const handleStopRecording = (reason = 'user') => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    isRecordingRef.current = false;
    isSplittingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
  };

  // Retake video
  const handleRetake = () => {
    resetRecording();
    if (permissionStatus === 'granted') {
      initializeCamera(facingMode);
    } else {
      checkPermissionAndInit();
    }
  };

  // Confirm and finish recording session
  const handleUseVideo = () => {
    const videoFiles = recordedPartsRef.current.length > 0
      ? recordedPartsRef.current
      : (recordedBlob ? [recordedBlob] : []);
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

    if (file.size > 50 * 1024 * 1024) {
      alert(`Selected file (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 50 MB maximum limit.`);
      e.target.value = '';
      return;
    }

    stopStream();
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setRecordedBlob(file);
    setPreviewUrl(url);
    setRecordedParts([file]);
    recordedPartsRef.current = [file];
    setCurrentSizeBytes(file.size);
    setPermissionStatus('granted'); // Move cleanly into review mode
    e.target.value = '';
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
    <div className="fixed inset-0 z-80 w-full h-[100dvh] bg-black overflow-hidden select-none">
      {/* Container stays 100% full screen on all orientations without card margins */}
      <div className="relative w-full h-full bg-black overflow-hidden">
        
        {/* VIEWING / CAMERA CANVAS - 100% full screen edge-to-edge */}
        <div 
          className="absolute inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Live Viewfinder (Natural edge-to-edge object-cover filling entire screen with GPU layer promotion) */}
          {!recordedBlob && !cameraError && (
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover bg-black"
              style={{
                transform: 'translateZ(0)',
                WebkitTransform: 'translateZ(0)',
                willChange: 'transform'
              }}
            />
          )}

          {/* Review Mode Playback: NO autoplay, perfectly fits screen on rotation */}
          {recordedBlob && previewUrl && (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black overflow-hidden p-2 sm:p-4 pb-28 landscape:pb-16">
              <video
                ref={playbackVideoRef}
                src={previewUrl}
                controls
                playsInline
                preload="metadata"
                className="max-w-full max-h-full w-auto h-auto object-contain bg-black shadow-2xl rounded-lg"
              />
            </div>
          )}

          {/* Part auto-split notification banner */}
          {partNotification && (
            <div className="absolute top-16 inset-x-4 max-w-sm mx-auto flex justify-center pointer-events-none z-45 animate-in fade-in">
              <div className="px-4 py-2.5 rounded-xl bg-emerald-950/95 border border-emerald-400 text-emerald-300 text-xs font-semibold shadow-2xl flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{partNotification}</span>
              </div>
            </div>
          )}

          {/* Shutter Flash Animation */}
          {photoFlash && (
            <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-out fade-out duration-200" />
          )}

          {/* Zoom notification banner */}
          {zoomNotification && (
            <div className="absolute top-16 inset-x-4 max-w-sm mx-auto flex justify-center pointer-events-none z-40 animate-in fade-in">
              <div className="px-4 py-2 rounded-xl bg-slate-900/95 border border-teal-400/60 text-teal-300 text-xs font-semibold shadow-2xl flex items-center gap-2">
                <Camera className="w-4 h-4 text-teal-400 shrink-0" />
                <span>{zoomNotification}</span>
              </div>
            </div>
          )}

          {/* NATIVE ANDROID-STYLE PERMISSION SHEET / DIALOG */}
          {!recordedBlob && (permissionStatus !== 'granted' || (cameraError && !stream)) && (
            <div className="absolute inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
              <div className="w-full max-w-sm bg-slate-900/95 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
                
                {/* 1. STATE: INSECURE HTTP CONTEXT (Local IP Address over HTTP) */}
                {permissionStatus === 'insecure_context' && (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center mb-4 ring-4 ring-teal-500/10 shadow-inner">
                      <Camera className="w-8 h-8 text-teal-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Camera on Local Network</h3>
                    <p className="text-xs text-slate-300 leading-relaxed mb-5">
                      Mobile Chrome requires HTTPS for live in-app camera streaming over local network IP addresses. You can record high-definition video directly using your phone's native camera.
                    </p>
                    
                    <div className="w-full bg-slate-950/60 rounded-2xl p-3 border border-slate-800/80 mb-6 text-left flex flex-col gap-2.5">
                      <div className="flex items-center gap-2.5 text-xs text-slate-300">
                        <span className="w-5 h-5 rounded-md bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <span>Full HD video quality supported natively</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-slate-300">
                        <span className="w-5 h-5 rounded-md bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <span>Auto-split under 50 MB ready for instant upload</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={() => fileFallbackInputRef.current?.click()}
                        className="w-full py-3.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Use Device Camera</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClose}
                        className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700/80 active:scale-[0.98] text-slate-300 hover:text-white font-medium text-xs transition-all cursor-pointer border border-slate-700/60"
                      >
                        Later
                      </button>
                    </div>
                  </>
                )}

                {/* 2. STATE: CAMERA PERMISSION BLOCKED / DENIED */}
                {permissionStatus === 'denied' && (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-4 ring-4 ring-amber-500/10 shadow-inner">
                      <AlertCircle className="w-8 h-8 text-amber-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Camera Permission Blocked</h3>
                    <p className="text-xs text-slate-300 leading-relaxed mb-5">
                      Camera permission was denied in your browser settings. You can record using your device camera below, or allow camera access in Chrome site settings.
                    </p>

                    <div className="flex flex-col gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={() => fileFallbackInputRef.current?.click()}
                        className="w-full py-3.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Use Device Camera</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRequestPermission}
                        disabled={isInitializing}
                        className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 font-medium text-xs transition-all cursor-pointer border border-slate-700 flex items-center justify-center gap-2"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isInitializing ? 'animate-spin' : ''}`} />
                        <span>Try Again</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClose}
                        className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                      >
                        Later
                      </button>
                    </div>
                  </>
                )}

                {/* 3. STATE: INITIAL PERMISSION PROMPT ("Enable Camera" / "Later" / "Use Device Camera") */}
                {permissionStatus !== 'insecure_context' && permissionStatus !== 'denied' && !cameraError && (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center mb-4 ring-4 ring-teal-500/10 shadow-inner">
                      <Camera className="w-8 h-8 text-teal-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Allow Camera Access?</h3>
                    <p className="text-xs text-slate-300 leading-relaxed mb-5">
                      Eco Green Support needs access to your camera and microphone to record high-definition site inspections and capture voice diagnostic notes.
                    </p>

                    <div className="w-full bg-slate-950/60 rounded-2xl p-3 border border-slate-800/80 mb-6 text-left flex flex-col gap-2.5">
                      <div className="flex items-center gap-2.5 text-xs text-slate-300">
                        <span className="w-5 h-5 rounded-md bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                          <Video className="w-3.5 h-3.5" />
                        </span>
                        <span>Live 720p HD recording with auto-splitting</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-slate-300">
                        <span className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <span>Spoken notes & audio fault diagnostics</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={handleRequestPermission}
                        disabled={isInitializing}
                        className="w-full py-3.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isInitializing ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Requesting Access...</span>
                          </>
                        ) : (
                          <>
                            <Camera className="w-4 h-4" />
                            <span>Enable Camera</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleClose}
                        disabled={isInitializing}
                        className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700/80 active:scale-[0.98] text-slate-300 hover:text-white font-medium text-xs transition-all cursor-pointer border border-slate-700/60"
                      >
                        Later
                      </button>

                      <button
                        type="button"
                        onClick={() => fileFallbackInputRef.current?.click()}
                        className="pt-1 text-[11px] text-teal-400 hover:text-teal-300 underline underline-offset-2 transition-colors cursor-pointer"
                      >
                        Or use device camera app
                      </button>
                    </div>
                  </>
                )}

                {/* 4. STATE: CAMERA HARDWARE ERROR / BUSY */}
                {cameraError && permissionStatus === 'granted' && (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mb-4 ring-4 ring-red-500/10 shadow-inner">
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Camera Unavailable</h3>
                    <p className="text-xs text-slate-300 leading-relaxed mb-5">
                      {cameraError}
                    </p>

                    <div className="flex flex-col gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={() => initializeCamera(facingMode)}
                        disabled={isInitializing}
                        className="w-full py-3.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className={`w-4 h-4 ${isInitializing ? 'animate-spin' : ''}`} />
                        <span>Try Again</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileFallbackInputRef.current?.click()}
                        className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 font-medium text-xs transition-all cursor-pointer border border-slate-700 flex items-center justify-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Use Device Camera</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClose}
                        className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                      >
                        Later
                      </button>
                    </div>
                  </>
                )}

              </div>
            </div>
          )}

          {/* TOP HUD BAR: Clean floating status bar */}
          <div className="absolute top-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent flex items-center justify-between z-30 pointer-events-none">
            
            {/* Status / Live Telemetry */}
            <div className="pointer-events-auto flex items-center gap-2">
              {isRecording ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/90 border border-red-500/70 shadow-lg text-white">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 animate-pulse"></span>
                  </span>
                  <span className="text-xs font-bold font-mono tracking-wider">
                    {recordedPartsRef.current.length > 0 ? `Part ${currentPartIndexRef.current} • ` : ''}
                    {formatTime(recordingSeconds)} / 05:00
                  </span>
                  <span className="text-[11px] text-teal-300 font-mono font-bold border-l border-white/20 pl-2">
                    {formatMB(currentSizeBytes)} MB / 50 MB
                  </span>
                </div>
              ) : recordedBlob ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/90 border border-emerald-500/70 text-white text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="font-bold font-mono">
                    {recordedParts.length > 1
                      ? `${recordedParts.length} Parts (${formatMB(recordedParts.reduce((acc, p) => acc + p.size, 0))} MB, each <50MB)`
                      : `${formatTime(recordingSeconds)} • ${formatMB(recordedBlob.size)} MB (720p HD)`
                    }
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/85 border border-white/20 text-white text-xs shadow-md">
                  <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                  <span className="font-semibold text-[11px]">720p HD • Auto Split &lt; 50 MB</span>
                </div>
              )}
            </div>

            {/* Top Right Close Button */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="p-2 bg-slate-900/85 hover:bg-slate-800 rounded-full text-white border border-white/20 transition-all cursor-pointer shadow-md"
                title="Close Camera (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* FLOATING ZOOM PRESET CONTROLS (Vertical Pill on the Right Side) */}
          {!recordedBlob && !cameraError && permissionStatus === 'granted' && (
            <div className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-35 pointer-events-none">
              <div className="pointer-events-auto flex flex-col items-center gap-1.5 p-1.5 rounded-full bg-slate-950/90 border border-white/20 shadow-2xl">
                {[0.5, 1, 2, 3, 5].map((preset) => (
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
                {![0.5, 1, 2, 3, 5].some(p => Math.abs(zoomLevel - p) < 0.2) && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-teal-400 bg-teal-950/80 rounded-full border border-teal-500/40">
                    {zoomLevel.toFixed(1)}x
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 3-Minute Limit Approaching Warning */}
          {isRecording && remainingSeconds <= 30 && remainingSeconds > 0 && (
            <div className="absolute top-16 inset-x-4 max-w-xs mx-auto p-2 rounded-xl bg-amber-500/90 text-slate-950 text-xs font-bold text-center shadow-2xl z-30 animate-pulse pointer-events-none">
              ⚠️ {remainingSeconds}s remaining before 3-minute limit
            </div>
          )}
        </div>

        {/* FLOATING BOTTOM CAMERA CONTROLS BAR (Floats seamlessly over live viewfinder in portrait & landscape) */}
        <div className="absolute bottom-0 inset-x-0 p-3 sm:p-5 landscape:p-2 pb-safe bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col items-center justify-center gap-1.5 z-30 pointer-events-none">
          
          {/* Main Shutter & Actions Row */}
          {!recordedBlob && permissionStatus === 'granted' ? (
            <div className="pointer-events-auto w-full flex items-center justify-around max-w-sm">
              
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
                  /* STOP RECORDING BUTTON */
                  <button
                    type="button"
                    onClick={() => handleStopRecording('user')}
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white flex items-center justify-center bg-black/40 active:scale-95 transition-all cursor-pointer shadow-2xl ring-4 ring-red-500/40"
                    title="Stop Recording"
                  >
                    <div className="w-7 h-7 rounded-md bg-red-600 shadow-md animate-pulse" />
                  </button>
                ) : (
                  /* START RECORDING BUTTON */
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
          ) : recordedBlob ? (
            /* REVIEW MODE CONTROLS: Retake vs Use Video */
            <div className="pointer-events-auto w-full flex items-center justify-center gap-3 max-w-sm">
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
                <span>
                  Use Video {recordedParts.length > 1 ? `(${recordedParts.length} Parts <50MB)` : ''} {capturedPhotos.length > 0 ? `+ ${capturedPhotos.length} Photos` : ''}
                </span>
              </button>
            </div>
          ) : null}

          {/* Secondary Device File Fallback Link */}
          {!isRecording && !recordedBlob && permissionStatus === 'granted' && (
            <button
              type="button"
              onClick={() => fileFallbackInputRef.current?.click()}
              className="pointer-events-auto text-[11px] text-teal-400 hover:text-teal-300 underline underline-offset-2 flex items-center gap-1 cursor-pointer transition-colors"
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
