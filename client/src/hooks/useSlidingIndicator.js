import { useState, useRef, useLayoutEffect, useCallback } from 'react';

/**
 * Enterprise Apple Segmented Control Sliding Indicator Hook
 * Provides fluid, hardware-accelerated gliding highlight for tabs, pills, and segmented bars.
 * Ensures pixel-perfect alignment without clipping, text overflow, or disappearance.
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
        setIndicator({
          left,
          width,
          opacity: 1
        });
        return true;
      }
    }

    // Do not zero out dimensions if previously valid; keep last known width during quick re-renders
    setIndicator(prev => (prev.width > 0 ? { ...prev, opacity: 0 } : prev));
    return false;
  }, [activeKey]);

  // Robust observer & retry system for dynamic mounts, tab switching, and content changes (e.g. ticket counts)
  useLayoutEffect(() => {
    let cancel = false;
    let attempts = 0;

    const tryUpdate = () => {
      if (cancel) return;
      const success = updateIndicator();
      if (!success && attempts < 10) {
        attempts++;
        retryRafRef.current = requestAnimationFrame(tryUpdate);
      }
    };

    tryUpdate();

    // ResizeObserver: auto-updates whenever button or container size changes (e.g. ticket counts loaded, font rendered)
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        if (!cancel) updateIndicator();
      });
      ro.observe(containerRef.current);
      const activeBtn = buttonRefs.current[activeKey];
      if (activeBtn) ro.observe(activeBtn);
    }

    // MutationObserver: detects text, badge, or child count changes inside the tabs container
    let mo = null;
    if (typeof MutationObserver !== 'undefined' && containerRef.current) {
      mo = new MutationObserver(() => {
        if (!cancel) updateIndicator();
      });
      mo.observe(containerRef.current, { childList: true, subtree: true, characterData: true });
    }

    const handleResize = () => {
      if (!cancel) updateIndicator();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancel = true;
      if (retryRafRef.current) cancelAnimationFrame(retryRafRef.current);
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
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

  const getButtonRef = useCallback((key) => (el) => {
    if (el) {
      buttonRefs.current[key] = el;
      if (String(key) === String(activeKey)) {
        updateIndicator(key);
      }
    } else {
      delete buttonRefs.current[key];
    }
  }, [activeKey, updateIndicator]);

  return {
    containerRef,
    getButtonRef,
    indicator,
    updateIndicator,
    onTabClick
  };
}
