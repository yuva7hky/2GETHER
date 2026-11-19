import React, { useState } from 'react';
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
  const otherPlayer = useAppStore((state) => state.otherPlayer);

  const [isMinimized, setIsMinimized] = useState(false);

  const hasKey = quest.keyPickedBy === localPlayer?.playerId;
  const isDoorOpen = quest.isDoorUnlocked;
  const keyPicked = Boolean(quest.keyPickedBy);
  const plateActive = quest.isPressurePlateActive;

  // If doors are open and movie is playing or sitting, keep banner tiny or hidden
  if (isDoorOpen && currentMovie && !uploadState.isUploading) {
    return null;
  }

  // Determine current quest phase details
  let phaseTitle = 'PRE-SHOW CO-OP QUEST';
  let phaseInstruction = '';
  let badgeColor = 'bg-theatre-pink';
  let Icon = Sparkles;

  if (uploadState.isUploading) {
    Icon = Film;
    badgeColor = 'bg-amber-500 animate-pulse';
    phaseTitle = `UPLOADING MOVIE (${uploadState.progress}%)`;
    phaseInstruction = !keyPicked
      ? `Uploading in background (${uploadState.speed})! Search under the street lampposts to find the Theatre Key!`
      : `Uploading in background (${uploadState.speed})! Proceed to the theatre door with the key!`;
  } else if (!keyPicked) {
    Icon = Key;
    badgeColor = 'bg-amber-500';
    if (!currentMovie) {
      phaseInstruction = isHost
        ? '1. Start your movie upload. 2. Search under the street lampposts to find the Theatre Key!'
        : 'Host is preparing the movie. Search under the street lampposts to find the Theatre Key!';
    } else {
      phaseInstruction = 'Movie is ready! Search under the street lampposts to find the hidden Theatre Key!';
    }
  } else if (!isDoorOpen) {
    if (plateActive) {
      Icon = DoorOpen;
      badgeColor = 'bg-emerald-500 animate-pulse';
      phaseTitle = 'KEYHOLE REVEALED!';
      phaseInstruction = hasKey
        ? 'The pressure plate is held down! Walk up to the door and insert your Key to unlock!'
        : 'Holding pressure plate down! Partner with the Key can now unlock the door!';
    } else {
      Icon = Footprints;
      badgeColor = 'bg-sky-500';
      phaseTitle = 'CO-OP DOOR MECHANISM';
      phaseInstruction = hasKey
        ? `You have the Key! Partner must stand on the circular Pressure Plate (right of door) to open the keyhole!`
        : `${quest.keyPickedByName || 'Partner'} has the Key! Stand on the circular Pressure Plate to open the keyhole!`;
    }
  } else {
    Icon = CheckCircle2;
    badgeColor = 'bg-emerald-500';
    phaseTitle = 'DOORS UNLOCKED!';
    phaseInstruction = 'The Cinema Doors are open! Walk inside along the red carpet and take your seats! ♥';
  }

  return (
    <div className="absolute top-20 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-30 pointer-events-auto max-w-2xl select-none transition-all duration-300">
      <div className="p-3.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 shadow-glass text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl ${badgeColor} flex items-center justify-center text-white shadow-glow-gold flex-shrink-0`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider font-extrabold text-theatre-gold">
                  {phaseTitle}
                </span>
                {keyPicked && !isDoorOpen && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                    Key Found 🗝️
                  </span>
                )}
                {plateActive && !isDoorOpen && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 animate-pulse">
                    Plate Active 👣
                  </span>
                )}
              </div>
              {!isMinimized && (
                <p className="text-xs text-slate-200 mt-0.5 leading-snug">
                  {phaseInstruction}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Quick Upload Button or Uploading Live Progress Indicator */}
            {uploadState.isUploading ? (
              <button
                onClick={onOpenUpload}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 active:scale-95 transition text-[11px] font-bold text-amber-300 flex items-center gap-1.5 shadow-glow-gold animate-pulse"
                title="Click to view upload progress"
              >
                <Film className="w-3.5 h-3.5 text-theatre-gold" />
                <span>{uploadState.progress}% ({uploadState.speed})</span>
              </button>
            ) : isHost && !currentMovie && !isMinimized && (
              <button
                onClick={onOpenUpload}
                className="px-3 py-1.5 rounded-xl bg-theatre-pink/90 hover:bg-theatre-pink active:scale-95 transition text-[11px] font-bold text-white flex items-center gap-1.5 shadow-glow-pink"
              >
                <Film className="w-3.5 h-3.5" />
                <span>Upload Movie</span>
              </button>
            )}

            {/* Mobile Contextual Action Buttons */}
            {canPickupKey && (
              <button
                onClick={onPickupKey}
                className="px-3 py-1.5 rounded-xl bg-theatre-gold text-theatre-darkest font-extrabold text-[11px] flex items-center gap-1 shadow-glow-gold animate-bounce"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Pick Up Key</span>
              </button>
            )}

            {canUnlockDoor && (
              <button
                onClick={onUnlockDoor}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white font-extrabold text-[11px] flex items-center gap-1 shadow-glow-green animate-bounce"
              >
                <DoorOpen className="w-3.5 h-3.5" />
                <span>Unlock Door</span>
              </button>
            )}

            {/* Minimize / Expand Toggle */}
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
