import { useState, useRef, useLayoutEffect, useCallback } from 'react';

/**
 * Enterprise Apple Segmented Control Sliding Indicator Hook
 * Provides fluid, hardware-accelerated gliding highlight for tabs, pills, and segmented bars.
 * 
 * @param {string|number} activeKey - Currently active tab key
 * @returns {object} { containerRef, getButtonRef, indicator, updateIndicator, onTabClick }
 */
export function useSlidingIndicator(activeKey) {
  const containerRef = useRef(null);
  const buttonRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });

  const updateIndicator = useCallback((overrideKey = null) => {
    const key = overrideKey !== null ? overrideKey : activeKey;
    const activeBtn = buttonRefs.current[key];
    const container = containerRef.current;
    if (activeBtn && container) {
      const activeRect = activeBtn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft || 0;
      const left = (activeRect.left - containerRect.left) + scrollLeft;
      const width = activeRect.width;
      setIndicator({
        left,
        width,
        opacity: 1
      });
    } else {
      setIndicator(prev => ({ ...prev, opacity: 0 }));
    }
  }, [activeKey]);

  useLayoutEffect(() => {
    updateIndicator();
    const handleResize = () => updateIndicator();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateIndicator]);

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
