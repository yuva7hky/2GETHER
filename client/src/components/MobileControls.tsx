import React, { useRef, useState } from 'react';
import { Play, ArrowUp, Armchair, Key, DoorOpen } from 'lucide-react';

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
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [activeTouchId, setActiveTouchId] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setActiveTouchId(touch.identifier);
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === activeTouchId) {
        updateJoystick(e.touches[i].clientX, e.touches[i].clientY);
        break;
      }
    }
  };

  const handleTouchEnd = () => {
    setActiveTouchId(null);
    setKnobPos({ x: 0, y: 0 });
    onVectorChange({ x: 0, y: 0 });
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const maxRadius = rect.width / 2 - 12;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobPos({ x: dx, y: dy });
    onVectorChange({
      x: dx / maxRadius,
      y: dy / maxRadius,
    });
  };

  const toggleRun = () => {
    const next = !isRunning;
    setIsRunning(next);
    onRunChange(next);
  };

  return (
    <div className="absolute inset-x-0 bottom-6 pointer-events-none z-30 flex justify-between items-end px-6 select-none md:hidden">
      {/* Virtual Joystick */}
      <div
        ref={joystickBaseRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-28 h-28 rounded-full bg-theatre-dark/70 border border-theatre-pink/30 backdrop-blur-md relative flex items-center justify-center pointer-events-auto touch-none shadow-glow-pink"
      >
        <div
          className="w-12 h-12 rounded-full bg-gradient-to-tr from-theatre-pink to-theatre-gold shadow-lg transform transition-transform duration-75"
          style={{
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          }}
        />
      </div>

      {/* Action Buttons: Quest, Run, Jump, Sit */}
      <div className="flex flex-col gap-3 pointer-events-auto items-end">
        {/* Contextual Quest Key Pickup Button */}
        {canPickupKey && (
          <button
            onClick={onPickupKey}
            className="w-14 h-14 rounded-full bg-theatre-gold border-2 border-yellow-200 text-theatre-darkest flex items-center justify-center backdrop-blur-md font-bold shadow-glow-gold active:scale-95 animate-bounce"
            title="Pick Up Key"
          >
            <Key className="w-7 h-7" />
          </button>
        )}

        {/* Contextual Quest Unlock Door Button */}
        {canUnlockDoor && (
          <button
            onClick={onUnlockDoor}
            className="w-14 h-14 rounded-full bg-emerald-500 border-2 border-emerald-300 text-white flex items-center justify-center backdrop-blur-md font-bold shadow-glow-green active:scale-95 animate-bounce"
            title="Unlock Door"
          >
            <DoorOpen className="w-7 h-7" />
          </button>
        )}

        {/* Sit / Stand Button */}
        <button
          onClick={onSitTrigger}
          className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border text-white transition-all active:scale-95 shadow-lg ${
            isSitting
              ? 'bg-theatre-pink border-theatre-gold shadow-glow-pink'
              : 'bg-theatre-surface/80 border-white/20'
          }`}
          title={isSitting ? 'Stand Up' : 'Sit Down'}
        >
          <Armchair className="w-6 h-6" />
        </button>

        {/* Run / Sprint Button */}
        <button
          onClick={toggleRun}
          className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition-all active:scale-95 shadow-lg ${
            isRunning
              ? 'bg-theatre-gold border-amber-300 text-theatre-darkest shadow-glow-gold'
              : 'bg-theatre-surface/80 border-white/20 text-white'
          }`}
          title="Toggle Sprint"
        >
          <Play className="w-6 h-6" />
        </button>

        {/* Jump Button */}
        <button
          onClick={onJumpTrigger}
          className="w-14 h-14 rounded-full bg-theatre-surface/80 border border-white/20 flex items-center justify-center backdrop-blur-md text-white active:scale-95 shadow-lg"
          title="Jump"
        >
          <ArrowUp className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

