/**
 * Eco Green Solar CMS - Audio Notification System
 * High-definition, loud, harmonic Web Audio chimes for notifications, alerts, and dispatches.
 */

let sharedAudioCtx = null;

// Initialize or return existing AudioContext with resume safeguard
export const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
  } catch (e) {
    console.warn('AudioContext initialization notice:', e);
  }
  return sharedAudioCtx;
};

// Auto-unlock audio playback on first user gesture across the browser window
const unlockAudioContext = () => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', unlockAudioContext);
    window.removeEventListener('keydown', unlockAudioContext);
    window.removeEventListener('touchstart', unlockAudioContext);
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('click', unlockAudioContext, { once: true });
  window.addEventListener('keydown', unlockAudioContext, { once: true });
  window.addEventListener('touchstart', unlockAudioContext, { once: true });
}

/**
 * Play a crisp, loud, harmonic notification chime
 * Uses dual-oscillator bell harmonics + dynamic compressor for punchy audibility on laptops and mobile devices.
 * 
 * @param {Object} options
 * @param {number} [options.volume] - Master volume (0.0 to 1.0, default 0.95)
 * @param {boolean} [options.force] - Force play even if sound preference is disabled
 * @param {'chime'|'urgent'|'success'} [options.type] - Sound profile
 */
export const playNotificationChime = (options = {}) => {
  if (typeof window === 'undefined') return;

  try {
    const isSoundEnabled = localStorage.getItem('egs_notification_sound_enabled') !== 'false';
    if (!isSoundEnabled && !options.force) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // 1. Dynamic compressor: Maximizes loudness and punch without clipping or distortion
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, now);
    compressor.knee.setValueAtTime(8, now);
    compressor.ratio.setValueAtTime(8, now);
    compressor.attack.setValueAtTime(0.002, now);
    compressor.release.setValueAtTime(0.18, now);
    compressor.connect(ctx.destination);

    // 2. Master Gain (Loud & Punchy)
    const masterGain = ctx.createGain();
    const storedVolume = parseFloat(localStorage.getItem('egs_notification_volume') || '0.95');
    const targetVolume = options.volume !== undefined ? options.volume : storedVolume;
    masterGain.gain.setValueAtTime(Math.min(1.0, Math.max(0.1, targetVolume)), now);
    masterGain.connect(compressor);

    const soundType = options.type || 'chime';

    let notes = [];
    if (soundType === 'urgent') {
      // Urgent attention: Two rapid assertive bursts (880Hz -> 1046Hz)
      notes = [
        { freq: 880.00, time: 0.00, duration: 0.16, gain: 0.90 },
        { freq: 1046.50, time: 0.12, duration: 0.22, gain: 1.00 },
        { freq: 1318.51, time: 0.24, duration: 0.35, gain: 0.95 }
      ];
    } else if (soundType === 'success') {
      // Pleasant confirmation tone
      notes = [
        { freq: 523.25, time: 0.00, duration: 0.20, gain: 0.80 },
        { freq: 783.99, time: 0.10, duration: 0.32, gain: 0.95 }
      ];
    } else {
      // Signature Energetic Enterprise Bell Chime (E5 -> B5 -> E6)
      // Crystal clear, resonant, and loud
      notes = [
        { freq: 659.25, time: 0.00, duration: 0.24, gain: 0.80 }, // E5
        { freq: 987.77, time: 0.09, duration: 0.36, gain: 1.00 }, // B5
        { freq: 1318.51, time: 0.18, duration: 0.48, gain: 0.90 }  // E6
      ];
    }

    notes.forEach(n => {
      const osc1 = ctx.createOscillator(); // Pure foundation
      const osc2 = ctx.createOscillator(); // Harmonic presence
      const noteGain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(n.freq, now + n.time);

      // Triangle oscillator gives speaker warmth and overtone penetration
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(n.freq * 2, now + n.time);

      osc1.connect(noteGain);
      osc2.connect(noteGain);
      noteGain.connect(masterGain);

      const startTime = now + n.time;
      const stopTime = startTime + n.duration;

      // Sharp crisp attack (0.012s) then smooth exponential decay
      noteGain.gain.setValueAtTime(0.001, startTime);
      noteGain.gain.linearRampToValueAtTime(n.gain, startTime + 0.012);
      noteGain.gain.exponentialRampToValueAtTime(0.001, stopTime);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(stopTime);
      osc2.stop(stopTime);
    });
  } catch (err) {
    console.warn('Notification chime playback error:', err);
  }
};
