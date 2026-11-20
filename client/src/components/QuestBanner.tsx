import React, { useState, useEffect } from 'react';
import { Key, DoorOpen, Footprints, Sparkles, Film, CheckCircle2, ChevronUp, ChevronDown } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface QuestBannerProps {
  onOpenUpload: () => void;
  canPickupKey?: boolean;
  canUnlockDoor?: boolean;
  onPickupKey?: () => void;
  onUnlockDoor?: () => void;
}

export const QuestBanner: React.FC<QuestBannerProps> = ({
  onOpenUpload,
  canPickupKey = false,
  canUnlockDoor = false,
  onPickupKey,
  onUnlockDoor,
}) => {
  const quest = useAppStore((state) => state.quest);
  const currentMovie = useAppStore((state) => state.currentMovie);
  const uploadState = useAppStore((state) => state.uploadState);
  const isHost = useAppStore((state) => state.isHost);
  const localPlayer = useAppStore((state) => state.localPlayer);

  const [isMinimized, setIsMinimized] = useState(false);

  const hasKey = quest.keyPickedBy === localPlayer?.playerId;
  const isDoorOpen = quest.isDoorUnlocked;
  const keyPicked = Boolean(quest.keyPickedBy);
  const plateActive = quest.isPressurePlateActive;

  // Auto-hide / auto-minimize after 10 seconds of entering or phase transition
  useEffect(() => {
    setIsMinimized(false);
    const timer = setTimeout(() => {
      setIsMinimized(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [quest.isDoorUnlocked, quest.keyPickedBy, quest.isPressurePlateActive]);

  // If doors are open and movie is playing or sitting, keep banner hidden
  if (isDoorOpen && currentMovie && !uploadState.isUploading) {
    return null;
  }

  // Determine current quest phase details
  let phaseTitle = 'PRE-SHOW QUEST';
  let phaseInstruction = '';
  let badgeColor = 'bg-theatre-pink';
  let Icon = Sparkles;

  if (uploadState.isUploading) {
    Icon = Film;
    badgeColor = 'bg-amber-500 animate-pulse';
    phaseTitle = `UPLOADING (${uploadState.progress}%)`;
    phaseInstruction = !keyPicked
      ? `Uploading in background (${uploadState.speed})! Search under street lampposts for the Key!`
      : `Uploading in background (${uploadState.speed})! Proceed to the theatre door with the key!`;
  } else if (!keyPicked) {
    Icon = Key;
    badgeColor = 'bg-amber-500';
    if (!currentMovie) {
      phaseInstruction = isHost
        ? '1. Start movie upload. 2. Search under street lampposts to find the Theatre Key!'
        : 'Host is preparing movie. Search under street lampposts to find the Theatre Key!';
    } else {
      phaseInstruction = 'Movie is ready! Search under the street lampposts to find the hidden Key!';
    }
  } else if (!isDoorOpen) {
    if (plateActive) {
      Icon = DoorOpen;
      badgeColor = 'bg-emerald-500 animate-pulse';
      phaseTitle = 'KEYHOLE ACTIVE!';
      phaseInstruction = hasKey
        ? 'Plate is held down! Walk up to the door and insert your Key to unlock!'
        : 'Holding plate down! Partner with Key can now unlock the door!';
    } else {
      Icon = Footprints;
      badgeColor = 'bg-sky-500';
      phaseTitle = 'DOOR MECHANISM';
      phaseInstruction = hasKey
        ? 'You have Key! Partner must stand on the circular Plate to open keyhole!'
        : `${quest.keyPickedByName || 'Partner'} has Key! Stand on circular Plate to open keyhole!`;
    }
  } else {
    Icon = CheckCircle2;
    badgeColor = 'bg-emerald-500';
    phaseTitle = 'DOORS UNLOCKED!';
    phaseInstruction = 'Doors are open! Walk inside along the red carpet and take your seats! ♥';
  }

  return (
    <div className="absolute top-14 sm:top-16 md:top-20 inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-30 pointer-events-auto max-w-lg md:max-w-xl select-none transition-all duration-300">
      {/* 1. COMPACT MINIMIZED PILL (AUTO-COLLAPSED AFTER 10s TO FREE SCREEN) */}
      {isMinimized ? (
        <div
          onClick={() => setIsMinimized(false)}
          className="mx-auto w-fit px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/20 shadow-glass text-white flex items-center gap-2 cursor-pointer active:scale-95 transition hover:bg-black/95 pointer-events-auto"
          title="Click to expand quest instructions"
        >
          <div className={`w-5 h-5 rounded-full ${badgeColor} flex items-center justify-center text-white flex-shrink-0`}>
            <Icon className="w-3 h-3" />
          </div>
          <span className="text-[10px] sm:text-xs font-bold text-theatre-gold uppercase tracking-wider">
            {phaseTitle}
          </span>
          {uploadState.isUploading && (
            <span className="text-[10px] font-mono text-amber-300">
              {uploadState.progress}%
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </div>
      ) : (
        /* 2. EXPANDED BANNER (AUTO-MINIMIZES AFTER 10s) */
        <div className="p-2.5 sm:p-3 rounded-2xl bg-black/85 backdrop-blur-md border border-white/15 shadow-glass text-white animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl ${badgeColor} flex items-center justify-center text-white shadow-glow-gold flex-shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-extrabold text-theatre-gold truncate">
                    {phaseTitle}
                  </span>
                  {keyPicked && !isDoorOpen && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-500/30">
                      Key 🗝️
                    </span>
                  )}
                  {plateActive && !isDoorOpen && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold border border-emerald-500/30 animate-pulse">
                      Plate 👣
                    </span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-200 mt-0.5 leading-snug line-clamp-2">
                  {phaseInstruction}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Quick Upload Button */}
              {uploadState.isUploading ? (
                <button
                  onClick={onOpenUpload}
                  className="px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-[10px] font-bold text-amber-300 flex items-center gap-1 shadow-glow-gold animate-pulse"
                >
                  <Film className="w-3 h-3 text-theatre-gold" />
                  <span>{uploadState.progress}%</span>
                </button>
              ) : isHost && !currentMovie && (
                <button
                  onClick={onOpenUpload}
                  className="px-2.5 py-1 rounded-xl bg-theatre-pink/90 hover:bg-theatre-pink active:scale-95 transition text-[10px] font-bold text-white flex items-center gap-1 shadow-glow-pink"
                >
                  <Film className="w-3 h-3" />
                  <span>Upload</span>
                </button>
              )}

              {/* Contextual Key / Door Actions */}
              {canPickupKey && (
                <button
                  onClick={onPickupKey}
                  className="px-2.5 py-1 rounded-xl bg-theatre-gold text-theatre-darkest font-extrabold text-[10px] flex items-center gap-1 shadow-glow-gold animate-bounce"
                >
                  <Key className="w-3 h-3" />
                  <span>Key</span>
                </button>
              )}

              {canUnlockDoor && (
                <button
                  onClick={onUnlockDoor}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-glow-green animate-bounce"
                >
                  <DoorOpen className="w-3 h-3" />
                  <span>Unlock</span>
                </button>
              )}

              {/* Manual Minimize Button */}
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition"
                title="Minimize banner"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
