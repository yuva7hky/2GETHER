import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Center, Float } from '@react-three/drei';
import {
  Film,
  Plus,
  LogIn,
  Edit3,
  Copy,
  Check,
  Share2,
  Users,
  Lock,
  Heart,
  Settings,
  AlertCircle,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';
import { StylizedAvatar } from '../characters/StylizedAvatar';
import { SettingsModal } from '../components/SettingsModal';

export const HomeDashboard: React.FC = () => {
  const setView = useAppStore((state) => state.setView);
  const profile = useAppStore((state) => state.profile);
  const roomCode = useAppStore((state) => state.roomCode);
  const roomState = useAppStore((state) => state.roomState);
  const otherPlayer = useAppStore((state) => state.otherPlayer);

  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Handle Room Creation
  const handleCreateRoom = () => {
    setLoading(true);
    setErrorMessage(null);

    socketService.createRoom(
      (room) => {
        setLoading(false);
        console.log('[HomeDashboard] Room successfully created:', room.roomCode);
      },
      (err) => {
        setLoading(false);
        setErrorMessage(err);
      }
    );
  };

  // Handle Joining Room
  const handleJoinRoom = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputCode.trim()) return;

    setLoading(true);
    setErrorMessage(null);

    socketService.joinRoom(
      inputCode.trim().toUpperCase(),
      (room) => {
        setLoading(false);
        console.log('[HomeDashboard] Joined room:', room.roomCode);
        setView('THEATRE');
      },
      (err) => {
        setLoading(false);
        setErrorMessage(err);
      }
    );
  };

  // Copy shareable invitation link
  const handleCopyInviteLink = () => {
    if (!roomCode) return;
    const shareUrl = `${window.location.origin}?room=${roomCode}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const enterActiveTheatre = () => {
    socketService.enterTheatre();
    setView('THEATRE');
  };

  return (
    <div className="min-h-screen bg-theatre-darkest p-4 sm:p-8 flex flex-col justify-between relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-theatre-midnight rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-theatre-pink/15 rounded-full blur-[160px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-10 mb-6">
        <div
          onClick={() => setView('LANDING')}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-theatre-pink to-theatre-gold flex items-center justify-center text-theatre-darkest shadow-glow-pink group-hover:scale-105 transition">
            <Film className="w-5 h-5" />
          </div>
          <span className="font-extrabold text-2xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-theatre-blush to-theatre-gold">
            2GETHER
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2.5 rounded-2xl glass-panel border border-white/10 hover:border-white/25 text-slate-300 hover:text-white transition"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Split Layout: Left Section (Character Preview) & Right Section (Rooms & Invites) */}
      <main className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch flex-1 z-10">
        {/* LEFT SECTION: 3D Character Card & Profile Settings (5 cols) */}
        <div className="lg:col-span-5 glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-theatre-pink shadow-[0_0_8px_#f43f5e]" />
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Your Persona
              </span>
            </div>
            <button
              onClick={() => setView('CHARACTER_CREATION')}
              className="flex items-center gap-1.5 text-xs text-theatre-softPink hover:text-white transition px-3 py-1.5 rounded-xl bg-white/5 border border-white/10"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Customize</span>
            </button>
          </div>

          {/* Interactive 3D Mini Character Viewport */}
          <div className="h-64 sm:h-72 w-full rounded-2xl bg-theatre-dark/60 border border-white/5 relative overflow-hidden">
            <Canvas camera={{ position: [0, 1.1, 2.8], fov: 42 }}>
              <ambientLight intensity={0.9} />
              <directionalLight position={[2, 4, 3]} intensity={1.5} />
              <pointLight position={[-2, 1, 2]} intensity={0.4} color="#f43f5e" />
              <Center>
                <Float speed={2.5} rotationIntensity={0.2} floatIntensity={0.25}>
                  <StylizedAvatar
                    name={profile.characterName}
                    appearance={profile.appearance}
                    animationState="IDLE"
                    isLocal={true}
                    showNameTag={false}
                  />
                </Float>
              </Center>
            </Canvas>

            <div className="absolute bottom-3 inset-x-0 text-center">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-theatre-dark/80 text-theatre-gold border border-theatre-gold/30 backdrop-blur-sm">
                ♥ {profile.characterName}
              </span>
            </div>
          </div>

          {/* Character Stats & Tagline */}
          <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Theatre Presence</span>
              <span className="text-emerald-400 font-medium">Ready to Watch</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Audience Capacity</span>
              <span className="text-theatre-softPink font-medium">Strictly 2 People</span>
            </div>
          </div>
        </div>

        {/* RIGHT SECTION: Create Room, Join Room, Active Session (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Error Notification */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Active Waiting Room Banner if Host Created Room */}
          {roomCode && (
            <div className="glass-panel-pink rounded-3xl p-6 border border-theatre-pink/30 shadow-glow-pink">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-theatre-pink text-white uppercase tracking-wider">
                      Active Room
                    </span>
                    <span className="text-xs text-slate-300">
                      Status: <strong className="text-white">{roomState}</strong>
                    </span>
                  </div>
                  <h3 className="text-2xl font-extrabold text-white tracking-widest mt-1">
                    {roomCode}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    {otherPlayer
                      ? `♥ ${otherPlayer.characterName} has entered! Both hearts are ready.`
                      : 'Waiting for your partner to join with this code...'}
                  </p>
                </div>

                <div className="flex flex-wrap sm:flex-col gap-2">
                  <button
                    onClick={handleCopyInviteLink}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white border border-white/15 transition flex items-center justify-center gap-2"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Copied Link!' : 'Copy Share Link'}</span>
                  </button>

                  <button
                    onClick={enterActiveTheatre}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-theatre-gold to-amber-500 text-theatre-darkest text-xs font-bold shadow-glow-gold hover:brightness-110 active:scale-95 transition flex items-center justify-center gap-1.5"
                  >
                    <span>Enter 3D Theatre</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Create Room Card */}
          <div className="glass-panel-gold rounded-3xl p-6 sm:p-8 border border-theatre-gold/25 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-theatre-gold/20 border border-theatre-gold/40 flex items-center justify-center text-theatre-gold mb-3 shadow-glow-gold">
                  <Plus className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">Create Private Room</h3>
                <p className="text-sm text-slate-300 mt-1">
                  Generate a private cinema instance. Only you and your invited guest can enter.
                </p>
              </div>
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={loading || Boolean(roomCode)}
              className="mt-6 w-full py-4 rounded-2xl bg-gradient-to-r from-theatre-gold via-amber-500 to-amber-600 text-theatre-darkest font-extrabold text-sm shadow-glow-gold hover:brightness-105 active:scale-98 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Film className="w-4 h-4 fill-current" />
              <span>{loading ? 'Creating...' : roomCode ? 'Room Already Active Above' : 'Create Room & Get Code'}</span>
            </button>
          </div>

          {/* Join Room by Code Card */}
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-theatre-surface border border-white/10 flex items-center justify-center text-theatre-pink shadow-glow-pink">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Join Room by Code</h3>
                <p className="text-xs text-slate-400">Received a 6-character room code from your partner?</p>
              </div>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit code (e.g. 7X9K2A)"
                  maxLength={10}
                  className="flex-1 glass-input rounded-2xl px-5 py-3.5 text-center sm:text-left text-white font-mono text-base tracking-widest placeholder-slate-500 uppercase"
                />
                <button
                  type="submit"
                  disabled={loading || !inputCode.trim()}
                  className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-theatre-pink to-pink-600 text-white font-bold text-sm shadow-glow-pink hover:brightness-110 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Join Room</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Lock className="w-3.5 h-3.5 text-theatre-softPink" />
                <span>Strictly 2 people. If a room is full, entry will be automatically rejected.</span>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto py-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
        <span>2GETHER • Two Hearts. One Theatre. One Movie.</span>
        <span>Strictly 2 Players Maximum</span>
      </footer>

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
};
