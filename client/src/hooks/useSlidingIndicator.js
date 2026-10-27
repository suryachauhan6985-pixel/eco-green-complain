import { useState, useRef, useLayoutEffect, useCallback } from 'react';

/**
 * Enterprise Apple Segmented Control Sliding Indicator Hook
 * Provides fluid, hardware-accelerated gliding highlight for tabs, pills, and segmented bars.
 * Ensures pixel-perfect alignment without clipping, text overflow, or disappearance.
 * Guaranteed safe from React Error #185 infinite loops via strict state deduplication.
 * 
 * @param {string|number} activeKey - Currently active tab key
 * @returns {object} { containerRef, getButtonRef, indicator, updateIndicator, onTabClick }
 */
export function useSlidingIndicator(activeKey) {
  const containerRef = useRef(null);
  const buttonRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });
  const retryRafRef = useRef(null);

  const updateIndicator = useCallback((overrideKey = null) => {
    const key = overrideKey !== null ? overrideKey : activeKey;
    const activeBtn = buttonRefs.current[key];
    const container = containerRef.current;

    if (activeBtn && container) {
      const activeRect = activeBtn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft || 0;

      // Prefer offsetLeft / offsetWidth for exact positioned layout box inside offsetParent
      let left = activeBtn.offsetLeft;
      const width = activeBtn.offsetWidth || activeRect.width;

      // Fallback calculation if offsetParent is not the container
      if (typeof left !== 'number' || isNaN(left) || activeBtn.offsetParent !== container) {
        left = (activeRect.left - containerRect.left) + scrollLeft;
      }

      if (width > 0) {
        setIndicator(prev => {
          // Strictly deduplicate to prevent infinite re-renders
          if (
            Math.abs(prev.left - left) < 0.5 &&
            Math.abs(prev.width - width) < 0.5 &&
            prev.opacity === 1
          ) {
            return prev;
          }
          return { left, width, opacity: 1 };
        });
        return true;
      }
    }

    setIndicator(prev => (prev.opacity === 0 ? prev : { ...prev, opacity: 0 }));
    return false;
  }, [activeKey]);

  // Robust observer & retry system for dynamic mounts, tab switching, and content changes (e.g. ticket counts)
  useLayoutEffect(() => {
    let cancel = false;
    let attempts = 0;

    const tryUpdate = () => {
      if (cancel) return;
      const success = updateIndicator();
      if (!success && attempts < 5) {
        attempts++;
        retryRafRef.current = requestAnimationFrame(tryUpdate);
      }
    };

    tryUpdate();

    // ResizeObserver: auto-updates whenever button or container size changes
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        if (!cancel) updateIndicator();
      });
      ro.observe(containerRef.current);
      const activeBtn = buttonRefs.current[activeKey];
      if (activeBtn) ro.observe(activeBtn);
    }

    const handleResize = () => {
      if (!cancel) updateIndicator();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancel = true;
      if (retryRafRef.current) cancelAnimationFrame(retryRafRef.current);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [activeKey, updateIndicator]);

  // Immediate 0ms tactile response on click
  const onTabClick = useCallback((key, callback) => {
    updateIndicator(key);
    if (typeof callback === 'function') {
      callback(key);
    }
  }, [updateIndicator]);

  // Ref callback must be pure and never invoke setState directly to prevent React Error #185
  const getButtonRef = useCallback((key) => (el) => {
    if (el) {
      buttonRefs.current[key] = el;
    } else {
      delete buttonRefs.current[key];
    }
  }, []);

  return {
    containerRef,
    getButtonRef,
    indicator,
    updateIndicator,
    onTabClick
  };
}
