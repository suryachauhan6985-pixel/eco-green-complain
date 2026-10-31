/**
 * Screen Wake Lock Manager
 * Prevents screen dimming or sleeping during active recording and large uploads.
 */

class ScreenWakeLock {
  constructor() {
    this.sentinel = null;
    this.isActive = false;
  }

  async acquire() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }

    try {
      if (this.sentinel && !this.sentinel.released) {
        return true;
      }

      this.sentinel = await navigator.wakeLock.request('screen');
      this.isActive = true;

      this.sentinel.addEventListener('release', () => {
        this.isActive = false;
        this.sentinel = null;
      });

      return true;
    } catch (err) {
      console.warn('[WakeLock] Could not acquire screen wake lock:', err.message);
      this.isActive = false;
      return false;
    }
  }

  async release() {
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch (_) {}
      this.sentinel = null;
      this.isActive = false;
    }
  }
}

export const screenWakeLock = new ScreenWakeLock();
