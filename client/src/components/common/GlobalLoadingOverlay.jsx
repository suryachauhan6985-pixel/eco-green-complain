import React from 'react';

/**
 * GlobalLoadingOverlay
 * Fullscreen loading overlay with blurred background and 3 static green bouncing dots.
 * Strictly no cards, no windows, no text, no logo, no glow.
 */
export const GlobalLoadingOverlay = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/20 select-none pointer-events-auto transition-all duration-150"
      style={{
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)'
      }}
    >
      {/* 3 Static Green Bouncing Dots (NO glow, NO window/box, NO text, NO icon) */}
      <div className="flex items-center justify-center gap-3">
        <div 
          className="w-4 h-4 rounded-full bg-[#16a34a] animate-bounce" 
          style={{ animationDelay: '0ms', animationDuration: '0.65s' }} 
        />
        <div 
          className="w-4 h-4 rounded-full bg-[#16a34a] animate-bounce" 
          style={{ animationDelay: '150ms', animationDuration: '0.65s' }} 
        />
        <div 
          className="w-4 h-4 rounded-full bg-[#16a34a] animate-bounce" 
          style={{ animationDelay: '300ms', animationDuration: '0.65s' }} 
        />
      </div>
    </div>
  );
};
