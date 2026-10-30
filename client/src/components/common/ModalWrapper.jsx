import React, { useEffect, useState, useRef } from 'react';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';

/**
 * Enterprise Modal Transition Wrapper
 * 
 * Provides smooth, hardware-accelerated entrance AND exit animations without heavy external libraries.
 * Handles LIFO Escape key stack, backdrop click, body scroll locking, and accessible ARIA attributes.
 */
export function ModalWrapper({
  isOpen,
  onClose,
  children,
  className = '',
  overlayClassName = '',
  backdropClassName = '',
  maxWidth = 'max-w-lg',
  closeOnEscape = true,
  closeOnBackdropClick = true,
  priority = ESCAPE_PRIORITY.DRAWER,
  zIndex = 'z-50',
  ariaLabel = 'Dialog',
  duration = 220 // ms
}) {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isActive, setIsActive] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsRendered(true);
      // Wait for DOM paint before adding active transition classes
      const frameId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsActive(true);
        });
      });
      // Lock background scrolling
      document.body.style.overflow = 'hidden';
      return () => cancelAnimationFrame(frameId);
    } else if (isRendered) {
      // Trigger exit transition
      setIsActive(false);
      timerRef.current = setTimeout(() => {
        setIsRendered(false);
        document.body.style.overflow = '';
      }, duration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen, isRendered, duration]);

  // Clean up body overflow when component unmounts entirely
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Hierarchical Escape key management (LIFO priority)
  useEscapeHandler(() => {
    if (closeOnEscape && onClose) {
      onClose();
      return true;
    }
    return false;
  }, isRendered && isOpen, { priority });

  if (!isRendered) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4 overflow-y-auto transition-opacity duration-200 ${
        isActive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      } ${overlayClassName}`}
      style={{
        paddingTop: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))',
        paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))'
      }}
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      {/* Backdrop */}
      <div
        className={`fixed inset-0 apple-glass-backdrop transition-opacity duration-220 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isActive ? 'opacity-100' : 'opacity-0'
        } ${backdropClassName}`}
        aria-hidden="true"
        onClick={(e) => {
          if (closeOnBackdropClick && onClose) {
            e.stopPropagation();
            onClose();
          }
        }}
      />

      {/* Modal Dialog Window */}
      <div
        className={`relative z-10 w-full ${maxWidth} transform transition-all duration-220 ease-[cubic-bezier(0.34,1.35,0.64,1)] will-change-transform ${
          isActive 
            ? 'opacity-100 scale-100 translate-y-0 modal-jelly-enter' 
            : 'opacity-0 scale-95 translate-y-2'
        } ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default ModalWrapper;
