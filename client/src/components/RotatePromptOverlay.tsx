import React, { useState, useEffect } from 'react';
import { Smartphone, RotateCw, Maximize2 } from 'lucide-react';

export const RotatePromptOverlay: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (window.matchMedia && window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches);

      const portrait = window.innerHeight > window.innerWidth;
      setIsMobileDevice(isMobile);
      setIsPortrait(isMobile && portrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  const handleRequestLandscape = async () => {
    try {
      // 1. Request Fullscreen
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      }

      // 2. Lock Orientation to Landscape (Android Chrome & supported browsers)
      if (screen.orientation && (screen.orientation as any).lock) {
        await (screen.orientation as any).lock('landscape');
      }
    } catch (_) {
      // Fallback: User will physically rotate device
    }
  };

  if (!isPortrait || !isMobileDevice) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-theatre-darkest/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
      <div className="max-w-sm w-full glass-panel-pink p-8 rounded-3xl border border-theatre-pink/40 shadow-glow-pink flex flex-col items-center">
        {/* Animated Rotating Phone Graphic */}
        <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-theatre-pink/20 animate-ping" />
          <div className="w-20 h-20 rounded-2xl border-2 border-theatre-gold/60 flex items-center justify-center animate-[spin_3s_ease-in-out_infinite] shadow-glow-gold">
            <Smartphone className="w-10 h-10 text-theatre-gold" />
          </div>
          <RotateCw className="absolute -bottom-1 -right-1 w-6 h-6 text-theatre-pink animate-spin" />
        </div>

        <h3 className="text-xl font-bold text-white mb-2 tracking-wide">
          Rotate to Landscape
        </h3>
        <p className="text-xs text-slate-300 mb-6 leading-relaxed">
          2GETHER is designed for widescreen couple cinema. Please turn your phone sideways for the best 3D theatre experience and controls!
        </p>

        <button
          onClick={handleRequestLandscape}
          className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-theatre-pink to-theatre-gold text-theatre-darkest font-extrabold text-xs shadow-glow-gold flex items-center justify-center gap-2 active:scale-95 transition"
        >
          <Maximize2 className="w-4 h-4" />
          <span>Switch to Landscape</span>
        </button>

        <p className="text-[10px] text-slate-400 mt-3">
          (Or turn your phone horizontally with Auto-Rotate ON)
        </p>
      </div>
    </div>
  );
};
