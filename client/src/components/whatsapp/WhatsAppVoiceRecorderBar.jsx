import React, { useState, useEffect, useRef } from 'react';
import { Mic, Trash2, Send, Square } from 'lucide-react';

/**
 * Authentic WhatsApp Voice Note Recorder Bar
 * Records voice via browser MediaRecorder, displays live duration timer and waveform,
 * and passes the generated audio File/Blob to onSendAudio.
 */
export function WhatsAppVoiceRecorderBar({ onCancel, onSendAudio, onError }) {
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function startRecording() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Microphone audio recording is not supported in this browser environment.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        // Preferred formats for WhatsApp compatibility
        let mimeType = 'audio/webm;codecs=opus';
        if (MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
          } else {
            mimeType = '';
          }
        }

        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.start(100);

        // Start timer
        timerIntervalRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      } catch (err) {
        if (onError) onError(err.message || 'Microphone access denied or unavailable.');
        if (onCancel) onCancel();
      }
    }

    startRecording();

    return () => {
      isMounted = false;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (_) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const handleStopAndSend = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.onstop = () => {
      const mime = recorder.mimeType || 'audio/ogg';
      const audioBlob = new Blob(audioChunksRef.current, { type: mime });
      const ext = mime.includes('mp4') ? 'm4a' : (mime.includes('webm') ? 'webm' : 'ogg');
      const audioFile = new File([audioBlob], `whatsapp_voice_${Date.now()}.${ext}`, { type: mime });

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (onSendAudio) onSendAudio(audioFile);
    };

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const handleCancel = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (onCancel) onCancel();
  };

  const minutes = Math.floor(recordingSeconds / 60);
  const seconds = recordingSeconds % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="flex-1 flex items-center justify-between gap-3 px-3 py-2 bg-white rounded-xl border border-rose-200/90 shadow-xs animate-in fade-in select-none">
      {/* Left: Delete / Cancel recording */}
      <button
        type="button"
        onClick={handleCancel}
        className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
        title="Discard recording"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {/* Middle: Blinking recording dot, timer, and animated waveform bars */}
      <div className="flex-1 flex items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
          <span className="font-mono text-xs font-bold text-slate-800">{timeFormatted}</span>
        </div>

        {/* Animated Sound Waveform Bars */}
        <div className="hidden sm:flex items-center gap-1 h-5">
          {[40, 75, 55, 95, 60, 85, 45, 100, 70, 50, 80, 65, 90, 40].map((h, i) => (
            <span
              key={i}
              className="w-1 bg-[#00a884] rounded-full animate-pulse"
              style={{
                height: `${h}%`,
                animationDelay: `${(i * 70) % 600}ms`
              }}
            />
          ))}
        </div>
      </div>

      {/* Right: Send Audio Note */}
      <button
        type="button"
        onClick={handleStopAndSend}
        className="w-9 h-9 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white flex items-center justify-center shadow-xs transition-transform active:scale-95 cursor-pointer"
        title="Send voice message"
      >
        <Send className="w-4 h-4 ml-0.5" />
      </button>
    </div>
  );
}
