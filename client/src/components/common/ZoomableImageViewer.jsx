import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Maximize2, RefreshCw } from 'lucide-react';

/**
 * ZoomableImageViewer
 * Supports:
 * - Desktop: Mouse wheel scroll to zoom in/out, click & drag to pan when zoomed
 * - Mobile / Android: 2-finger pinch to zoom in/out, 1-finger drag to pan when zoomed
 * - Double click / double tap to toggle zoom
 * - Visual zoom controls (+, -, reset, rotate)
 */
export function ZoomableImageViewer({
  src,
  alt = 'Preview image',
  className = '',
  maxZoom = 5,
  minZoom = 1,
  initialRotation = 0,
  onError,
}) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(initialRotation);
  const [isDragging, setIsDragging] = useState(false);

  // Refs for tracking drag and pinch gestures
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const touchDistanceRef = useRef(null);
  const touchStartScaleRef = useRef(1);
  const lastTapRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Reset transform to 1x centered
  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Zoom in / out helper
  const adjustZoom = useCallback((delta) => {
    setScale((prev) => {
      const next = Math.min(maxZoom, Math.max(minZoom, Number((prev + delta).toFixed(2))));
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  }, [maxZoom, minZoom]);

  // Rotate helper (90 degrees clockwise)
  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Mouse Wheel Zoom (Desktop)
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    const zoomFactor = e.deltaY < 0 ? 0.25 : -0.25;
    setScale((prev) => {
      const next = Math.min(maxZoom, Math.max(minZoom, Number((prev + zoomFactor).toFixed(2))));
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  }, [maxZoom, minZoom]);

  // Mouse Drag to Pan (Desktop)
  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging || scale <= 1) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Events: Pinch to Zoom + Touch Drag (Mobile / Android)
  const handleTouchStart = (e) => {
    // 2-finger Pinch
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceRef.current = dist;
      touchStartScaleRef.current = scaleRef.current;
      return;
    }

    // 1-finger Drag when zoomed
    if (e.touches.length === 1) {
      const now = Date.now();
      // Double-tap to toggle zoom
      if (now - lastTapRef.current < 300) {
        e.preventDefault();
        if (scaleRef.current > 1.2) {
          handleReset();
        } else {
          setScale(2.5);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (scaleRef.current > 1) {
        setIsDragging(true);
        dragStartRef.current = {
          x: e.touches[0].clientX - positionRef.current.x,
          y: e.touches[0].clientY - positionRef.current.y,
        };
      }
    }
  };

  const handleTouchMove = (e) => {
    // 2-finger Pinch-to-zoom
    if (e.touches.length === 2 && touchDistanceRef.current) {
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = currentDist / touchDistanceRef.current;
      const newScale = Math.min(
        maxZoom,
        Math.max(minZoom, Number((touchStartScaleRef.current * ratio).toFixed(2)))
      );
      setScale(newScale);
      if (newScale <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return;
    }

    // 1-finger Drag when zoomed in
    if (e.touches.length === 1 && isDragging && scaleRef.current > 1) {
      e.preventDefault();
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      touchDistanceRef.current = null;
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
    }
  };

  // Attach non-passive wheel listener on container to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Double Click (Desktop) to toggle zoom
  const handleDoubleClick = () => {
    if (scale > 1.2) {
      handleReset();
    } else {
      setScale(2.5);
    }
  };

  return (
    <div className="relative w-full flex flex-col items-center justify-center select-none">
      {/* Floating Zoom & Rotate Toolbar */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded-xl border border-slate-700/60 shadow-lg text-white">
        <button
          type="button"
          onClick={() => adjustZoom(0.35)}
          className="p-1.5 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
          title="Zoom In (Scroll Up)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => adjustZoom(-0.35)}
          disabled={scale <= 1}
          className="p-1.5 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
          title="Zoom Out (Scroll Down)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-2 py-0.5 hover:bg-slate-800 active:scale-95 text-teal-400 font-mono text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
          title="Reset Zoom (Double Click)"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={handleRotate}
          className="p-1.5 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
          title="Rotate Image 90°"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Image Viewport with Pan & Zoom Transform */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative w-full flex items-center justify-center overflow-hidden touch-none ${
          scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
        style={{ minHeight: '260px' }}
      >
        <img
          src={src}
          alt={alt}
          onError={onError}
          draggable={false}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            willChange: 'transform',
          }}
          className={`max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm transition-transform ${className}`}
        />
      </div>

      {/* Mobile Touch Guidance Tip */}
      <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1.5">
        <span>Scroll or pinch to zoom • Drag to pan</span>
      </div>
    </div>
  );
}

export default ZoomableImageViewer;
