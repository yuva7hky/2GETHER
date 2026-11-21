import React, { useRef, useState } from 'react';
import { ArrowUp, Armchair, Key, DoorOpen, Zap } from 'lucide-react';

interface MobileControlsProps {
  onVectorChange: (vec: { x: number; y: number }) => void;
  onRunChange: (isRunning: boolean) => void;
  onJumpTrigger: () => void;
  onSitTrigger: () => void;
  isSitting?: boolean;
  canPickupKey?: boolean;
  canUnlockDoor?: boolean;
  onPickupKey?: () => void;
  onUnlockDoor?: () => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  onVectorChange,
  onRunChange,
  onJumpTrigger,
  onSitTrigger,
  isSitting = false,
  canPickupKey = false,
  canUnlockDoor = false,
  onPickupKey,
  onUnlockDoor,
}) => {
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const activeTouchId = useRef<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const hapticFeedback = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTouchId.current !== null) return;
    const touch = e.changedTouches[0];
    activeTouchId.current = touch.identifier;
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId.current) {
        updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId.current) {
        activeTouchId.current = null;
        if (joystickKnobRef.current) {
          joystickKnobRef.current.style.transform = 'translate(0px, 0px)';
        }
        onVectorChange({ x: 0, y: 0 });
        break;
      }
    }
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const maxRadius = rect.width / 2 - 14;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    onVectorChange({
      x: dx / maxRadius,
      y: dy / maxRadius,
    });
  };

  const toggleRun = () => {
    hapticFeedback();
    const next = !isRunning;
    setIsRunning(next);
    onRunChange(next);
  };

  const handleJump = () => {
    hapticFeedback();
    onJumpTrigger();
  };

  const handleSit = () => {
    hapticFeedback();
    onSitTrigger();
  };

  const handleKey = () => {
    hapticFeedback();
    onPickupKey?.();
  };

  const handleDoor = () => {
    hapticFeedback();
    onUnlockDoor?.();
  };

  return (
    <div
      data-no-cam="true"
      className="absolute inset-x-0 bottom-4 pointer-events-none z-30 flex justify-between items-end px-5 pb-1 select-none"
    >
      {/* 1. VIRTUAL TOUCH JOYSTICK (BOTTOM-LEFT) */}
      <div
        ref={joystickBaseRef}
        data-no-cam="true"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="w-28 h-28 rounded-full bg-theatre-darkest/75 border-2 border-theatre-pink/40 backdrop-blur-md relative flex items-center justify-center pointer-events-auto touch-none shadow-glow-pink"
      >
        {/* Directional Accent Dots */}
        <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-white/30" />
        <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-white/30" />
        <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-white/30" />
        <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-white/30" />

        {/* Center Target Indicator */}
        <div className="absolute w-8 h-8 rounded-full border border-dashed border-white/20 pointer-events-none" />

        {/* Dynamic Glowing Joystick Knob */}
        <div
          ref={joystickKnobRef}
          className="w-12 h-12 rounded-full bg-gradient-to-tr from-theatre-pink via-rose-500 to-theatre-gold shadow-lg flex items-center justify-center pointer-events-none transition-transform duration-75"
        >
          <div className="w-4 h-4 rounded-full bg-white/80 shadow-sm" />
        </div>
      </div>

      {/* 2. ERGONOMIC ACTION BUTTONS CLUSTER (BOTTOM-RIGHT) */}
      <div data-no-cam="true" className="flex flex-col gap-2.5 pointer-events-auto items-end pb-1">
        {/* Contextual Quest Key Pickup Button */}
        {canPickupKey && (
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              handleKey();
            }}
            onClick={handleKey}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 border-2 border-yellow-200 text-theatre-darkest flex items-center gap-2 font-extrabold text-xs shadow-glow-gold active:scale-95 animate-bounce transition-transform"
            title="Pick Up Key"
          >
            <Key className="w-5 h-5" />
            <span>PICK UP KEY</span>
          </button>
        )}

        {/* Contextual Quest Unlock Door Button */}
        {canUnlockDoor && (
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              handleDoor();
            }}
            onClick={handleDoor}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 border-2 border-emerald-300 text-white flex items-center gap-2 font-extrabold text-xs shadow-glow-green active:scale-95 animate-bounce transition-transform"
            title="Unlock Doors"
          >
            <DoorOpen className="w-5 h-5" />
            <span>UNLOCK DOOR</span>
          </button>
        )}

        {/* Horizontal Action Row: Sit, Sprint, Jump */}
        <div className="flex items-center gap-2.5">
          {/* Sit / Stand Button */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              handleSit();
            }}
            onClick={handleSit}
            className={`w-13 h-13 p-3 rounded-2xl flex flex-col items-center justify-center backdrop-blur-md border text-white transition-all active:scale-95 shadow-lg ${isSitting
                ? 'bg-theatre-pink border-theatre-gold shadow-glow-pink'
                : 'bg-theatre-surface/85 border-white/20'
              }`}
            title={isSitting ? 'Stand Up' : 'Sit Down'}
          >
            <Armchair className="w-5 h-5" />
            <span className="text-[9px] font-bold mt-0.5 tracking-tight">
              {isSitting ? 'STAND' : 'SIT'}
            </span>
          </button>

          {/* Run / Sprint Button */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              toggleRun();
            }}
            onClick={toggleRun}
            className={`w-13 h-13 p-3 rounded-2xl flex flex-col items-center justify-center backdrop-blur-md border transition-all active:scale-95 shadow-lg ${isRunning
                ? 'bg-theatre-gold border-amber-300 text-theatre-darkest shadow-glow-gold'
                : 'bg-theatre-surface/85 border-white/20 text-white'
              }`}
            title="Toggle Sprint"
          >
            <Zap className={`w-5 h-5 ${isRunning ? 'fill-current' : ''}`} />
            <span className="text-[9px] font-bold mt-0.5 tracking-tight">
              {isRunning ? 'RUN ON' : 'WALK'}
            </span>
          </button>

          {/* Jump / Hop Button */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              handleJump();
            }}
            onClick={handleJump}
            className="w-14 h-14 p-3 rounded-2xl bg-gradient-to-tr from-theatre-pink/90 to-purple-600/90 border-2 border-pink-400/50 flex flex-col items-center justify-center backdrop-blur-md text-white active:scale-95 shadow-glow-pink transition-transform"
            title="Hop / Jump"
          >
            <ArrowUp className="w-6 h-6 stroke-[2.5]" />
            <span className="text-[9px] font-black tracking-tight">HOP</span>
          </button>
        </div>
      </div>
    </div>
  );
};
