import React, { useRef, useState } from 'react';
import { Mic, MicOff, Radio, Volume2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { voiceService } from '../services/voiceService';

interface VoiceMicButtonProps {
  className?: string;
  compact?: boolean;
}

export const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({ className = '', compact = false }) => {
  const isMicMuted = useAppStore((state) => state.isMicMuted);
  const isLocalSpeaking = useAppStore((state) => state.isLocalSpeaking);
  const isRemoteSpeaking = useAppStore((state) => state.isRemoteSpeaking);
  const isVoiceConnected = useAppStore((state) => state.isVoiceConnected);

  const [isHoldingPTT, setIsHoldingPTT] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHoldRef = useRef(false);

  // Pointer Down (Mouse down or Touch start)
  const handlePointerDown = () => {
    didHoldRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);

    holdTimerRef.current = setTimeout(() => {
      // Long-press threshold exceeded -> Activate Walkie-Talkie Push-to-Talk
      didHoldRef.current = true;
      setIsHoldingPTT(true);
      voiceService.startPushToTalk();
    }, 280);
  };

  // Pointer Up (Mouse up or Touch end)
  const handlePointerUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (didHoldRef.current) {
      // Released after hold -> Stop Push-to-Talk & mute
      setIsHoldingPTT(false);
      voiceService.stopPushToTalk();
    } else {
      // Quick tap -> Toggle Mute / Unmute
      const nextMuted = !isMicMuted;
      if (!nextMuted) {
        voiceService.ensureLocalMedia().then(() => {
          voiceService.setMuted(false);
        });
      } else {
        voiceService.setMuted(true);
      }
    }
  };

  const handlePointerCancel = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (didHoldRef.current) {
      setIsHoldingPTT(false);
      voiceService.stopPushToTalk();
    }
  };

  const isLive = !isMicMuted || isHoldingPTT;

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      {/* Remote partner speaking indicator badge */}
      {isRemoteSpeaking && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-sky-500/90 text-[10px] font-bold text-white shadow-glow-blue whitespace-nowrap animate-bounce flex items-center gap-1">
          <Volume2 className="w-3 h-3" />
          Partner Speaking
        </span>
      )}

      {/* Main Mic Button */}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        className={`select-none transition-all active:scale-95 flex items-center gap-2 rounded-2xl font-bold text-xs border relative ${
          compact ? 'p-2.5' : 'px-3.5 py-2'
        } ${
          isLocalSpeaking
            ? 'bg-sky-500 text-white border-sky-400 shadow-[0_0_15px_#38bdf8] ring-4 ring-sky-500/30'
            : isLive
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-green hover:bg-emerald-500/30'
            : 'glass-panel text-slate-300 border-white/10 hover:bg-white/15 hover:text-white'
        }`}
        title="Tap to Toggle Mute • Hold for Push-to-Talk"
      >
        {isLocalSpeaking ? (
          <Radio className="w-4 h-4 animate-pulse fill-current" />
        ) : isLive ? (
          <Mic className="w-4 h-4 text-emerald-400" />
        ) : (
          <MicOff className="w-4 h-4 text-rose-400" />
        )}

        {!compact && (
          <div className="flex items-center gap-1.5">
            <span>
              {isLocalSpeaking
                ? 'Speaking...'
                : isHoldingPTT
                ? 'PTT Active'
                : isLive
                ? 'Mic On'
                : 'Mic Muted'}
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isVoiceConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
              title={isVoiceConnected ? 'Voice Connected' : 'Waiting for Partner'}
            />
          </div>
        )}
      </button>
    </div>
  );
};
