/**
 * Extract a single JPEG thumbnail from a video Blob without altering the original video bytes.
 * 
 * @param {Blob|File} videoBlob - Raw video file
 * @param {number} [targetWidth=480] - Desired thumbnail width
 * @returns {Promise<File|null>} Standalone image File or null if extraction fails
 */
export async function extractVideoThumbnail(videoBlob, targetWidth = 480) {
  if (!videoBlob || typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    let videoUrl = '';
    try {
      videoUrl = URL.createObjectURL(videoBlob);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = videoUrl;

      let hasCleanedUp = false;
      const cleanup = () => {
        if (!hasCleanedUp) {
          hasCleanedUp = true;
          try { URL.revokeObjectURL(videoUrl); } catch (_) {}
          video.removeAttribute('src');
          video.load();
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 7000);

      video.onloadeddata = () => {
        try {
          // Seek slightly into the video to avoid initial black frames
          const seekTime = Math.min(1.0, (video.duration || 1) / 4);
          video.currentTime = seekTime;
        } catch (_) {
          cleanup();
          clearTimeout(timeout);
          resolve(null);
        }
      };

      video.onseeked = () => {
        clearTimeout(timeout);
        try {
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 360;
          const scale = Math.min(1, targetWidth / w);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            return resolve(null);
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            cleanup();
            if (!blob) return resolve(null);
            const thumbName = (videoBlob.name ? videoBlob.name.replace(/\.[^.]+$/, '') : 'video') + '_thumb.jpg';
            const thumbFile = new File([blob], thumbName, { type: 'image/jpeg', lastModified: Date.now() });
            resolve(thumbFile);
          }, 'image/jpeg', 0.82);
        } catch (_) {
          cleanup();
          resolve(null);
        }
      };

      video.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      };
    } catch (_) {
      resolve(null);
    }
  });
}
