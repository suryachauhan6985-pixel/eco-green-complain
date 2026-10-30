import React from 'react';

/**
 * AppBackground — Apple iOS 26 Organic Ambient Mesh Gradient & Subtle Texture
 * 
 * Renders:
 * 1. Rich, slowly drifting organic mesh gradient (deep emerald, solar amber/gold, teal, cool sky blue)
 *    drifting over 25-40s with GPU-only transform3d keyframes.
 * 2. Ultra-subtle organic solar micro-texture (4-6% opacity) that gives tactile depth
 *    WITHOUT harsh dot grids.
 * 3. Fixed behind the entire app so all Liquid Glass layers refract and blur the colors beneath.
 */
export const AppBackground = () => {
  return (
    <div 
      className="fixed inset-0 pointer-events-none overflow-hidden select-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {/* Base Tint */}
      <div className="absolute inset-0 bg-[#f8fafc]" />

      {/* Animated Mesh Gradient Blobs (GPU translate3d only) */}
      <div className="absolute inset-0 overflow-hidden filter blur-[80px] sm:blur-[110px] opacity-75">
        {/* Blob 1: Eco Emerald Green (Top Left -> Center) */}
        <div 
          className="absolute w-[500px] h-[500px] sm:w-[700px] sm:h-[700px] rounded-full"
          style={{
            top: '-15%',
            left: '-10%',
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.28) 0%, rgba(5, 150, 105, 0.12) 50%, transparent 75%)',
            animation: 'meshDrift1 28s ease-in-out infinite alternate',
            willChange: 'transform'
          }}
        />

        {/* Blob 2: Warm Solar Gold / Amber (Top Right) */}
        <div 
          className="absolute w-[450px] h-[450px] sm:w-[650px] sm:h-[650px] rounded-full"
          style={{
            top: '-10%',
            right: '-10%',
            background: 'radial-gradient(circle, rgba(245, 158, 11, 0.22) 0%, rgba(217, 119, 6, 0.08) 55%, transparent 75%)',
            animation: 'meshDrift2 34s ease-in-out infinite alternate',
            willChange: 'transform'
          }}
        />

        {/* Blob 3: Clean Teal (Bottom Left -> Center) */}
        <div 
          className="absolute w-[480px] h-[480px] sm:w-[680px] sm:h-[680px] rounded-full"
          style={{
            bottom: '-15%',
            left: '15%',
            background: 'radial-gradient(circle, rgba(13, 148, 136, 0.20) 0%, rgba(15, 118, 110, 0.08) 55%, transparent 75%)',
            animation: 'meshDrift3 32s ease-in-out infinite alternate',
            willChange: 'transform'
          }}
        />

        {/* Blob 4: Cool Sky Blue (Bottom Right) */}
        <div 
          className="absolute w-[450px] h-[450px] sm:w-[600px] sm:h-[600px] rounded-full"
          style={{
            bottom: '-10%',
            right: '-5%',
            background: 'radial-gradient(circle, rgba(2, 132, 199, 0.18) 0%, rgba(3, 105, 161, 0.06) 50%, transparent 70%)',
            animation: 'meshDrift4 38s ease-in-out infinite alternate',
            willChange: 'transform'
          }}
        />
      </div>

      {/* Ultra-Subtle Organic Solar Micro-Texture (No dots, clean solar cell wafer lines at 3% opacity) */}
      <div 
        className="absolute inset-0 opacity-[0.035] mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='160' height='160' viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='cell' width='80' height='80' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 80 0 L 0 0 0 80' fill='none' stroke='%23047857' stroke-width='0.6' stroke-opacity='0.45'/%3E%3Cpath d='M 0 40 L 80 40' fill='none' stroke='%23047857' stroke-width='0.3' stroke-opacity='0.25' stroke-dasharray='4,4'/%3E%3Cpath d='M 40 0 L 40 80' fill='none' stroke='%23047857' stroke-width='0.3' stroke-opacity='0.25' stroke-dasharray='4,4'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='160' height='160' fill='url(%23cell)'/%3E%3C/svg%3E")`,
          backgroundSize: '160px 160px'
        }}
      />
    </div>
  );
};
