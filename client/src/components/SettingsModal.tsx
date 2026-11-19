import React from 'react';
import { Settings as SettingsIcon, X, Volume2, Monitor, Eye } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md glass-panel rounded-3xl p-6 shadow-2xl relative border border-white/15">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-theatre-surface border border-white/10 flex items-center justify-center text-theatre-softPink">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Experience Settings</h2>
            <p className="text-xs text-slate-400">Customize audio, visuals, and controls</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Audio Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <Volume2 className="w-4 h-4 text-theatre-gold" />
                Cinema Volume
              </span>
              <span className="font-semibold text-theatre-gold">
                {Math.round(settings.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(e) => updateSettings({ volume: parseFloat(e.target.value) })}
              className="w-full accent-theatre-gold cursor-pointer"
            />
          </div>

          {/* Graphics Quality */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <Monitor className="w-4 h-4 text-theatre-pink" />
              Graphics Fidelity
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => updateSettings({ quality: q })}
                  className={`py-2 rounded-xl text-xs font-semibold capitalize border transition ${
                    settings.quality === q
                      ? 'bg-theatre-pink/20 border-theatre-pink text-white shadow-glow-pink'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Name Tag Visibility */}
          <div className="flex items-center justify-between py-2 border-t border-white/10">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <Eye className="w-4 h-4 text-theatre-blush" />
              Show 3D Name Tags
            </span>
            <button
              onClick={() => updateSettings({ showNameTags: !settings.showNameTags })}
              className={`w-12 h-6 rounded-full transition-colors relative p-1 ${
                settings.showNameTags ? 'bg-theatre-pink' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.showNameTags ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Save / Close */}
        <button
          onClick={onClose}
          className="w-full mt-8 py-3 rounded-2xl bg-gradient-to-r from-theatre-pink to-pink-600 text-white font-semibold shadow-glow-pink hover:brightness-110 active:scale-98 transition"
        >
          Save & Return to Cinema
        </button>
      </div>
    </div>
  );
};

