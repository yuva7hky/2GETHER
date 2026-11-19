import React from 'react';
import { Film, Heart, Sparkles, Users, Lock, Play, ArrowRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const LandingPage: React.FC = () => {
  const setView = useAppStore((state) => state.setView);
  const profile = useAppStore((state) => state.profile);

  return (
    <div className="min-h-screen bg-theatre-darkest relative overflow-hidden flex flex-col justify-between">
      {/* Background Cinematic Gradients and Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-theatre-midnight via-theatre-surface/30 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-theatre-pink/20 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-theatre-gold/15 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Top Navigation Bar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-theatre-pink to-theatre-gold flex items-center justify-center text-theatre-darkest shadow-glow-pink">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-2xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-theatre-blush to-theatre-gold">
              2GETHER
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('CHARACTER_CREATION')}
            className="text-sm text-slate-300 hover:text-white transition px-3 py-1.5 rounded-xl hover:bg-white/5"
          >
            Avatar ({profile.characterName})
          </button>
          <button
            onClick={() => setView('DASHBOARD')}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-theatre-pink to-pink-600 text-white font-medium text-sm shadow-glow-pink hover:brightness-110 active:scale-95 transition flex items-center gap-2"
          >
            <span>Enter Lobby</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="w-full max-w-6xl mx-auto px-6 py-12 flex-1 flex flex-col justify-center items-center text-center z-10">
        {/* Cute Pill Tag */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border border-theatre-pink/30 text-theatre-softPink text-xs font-semibold mb-6 shadow-glow-pink animate-float">
          <Heart className="w-3.5 h-3.5 fill-current text-theatre-pink" />
          <span>Strictly for Two People • Real-Time 3D Cinema</span>
        </div>

        {/* Cinematic Main Headline */}
        <h2 className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.1] max-w-4xl">
          Two Hearts. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-theatre-gold via-theatre-softPink to-theatre-pink">
            One Theatre. One Movie.
          </span>
        </h2>

        {/* Subtitle */}
        <p className="mt-6 text-base sm:text-lg md:text-xl text-slate-300 max-w-2xl font-normal leading-relaxed">
          The coziest virtual cinema built strictly for couples and close friends. Walk together, sit side-by-side in plush velvet seats, stream your favorite films, and whisper in real time.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <button
            onClick={() => setView('DASHBOARD')}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-theatre-gold via-amber-500 to-amber-600 text-theatre-darkest font-bold text-base shadow-glow-gold hover:brightness-105 active:scale-95 transition flex items-center justify-center gap-3"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Open Private Cinema</span>
          </button>

          <button
            onClick={() => setView('CHARACTER_CREATION')}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl glass-panel text-slate-200 font-semibold text-base border border-white/15 hover:border-theatre-pink/50 hover:text-white active:scale-95 transition flex items-center justify-center gap-2 shadow-glass"
          >
            <Sparkles className="w-5 h-5 text-theatre-softPink" />
            <span>Customize 3D Avatar</span>
          </button>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 w-full max-w-5xl">
          <div className="glass-panel p-6 rounded-3xl text-left border border-white/10 hover:border-theatre-pink/40 transition">
            <div className="w-12 h-12 rounded-2xl bg-theatre-surface border border-white/10 flex items-center justify-center text-theatre-pink mb-4 shadow-glow-pink">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Strictly 2 Players</h3>
            <p className="text-sm text-slate-400 mt-2">
              Every room is private and mathematically capped at exactly two participants. No intruders, ever.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-3xl text-left border border-white/10 hover:border-theatre-gold/40 transition">
            <div className="w-12 h-12 rounded-2xl bg-theatre-surface border border-white/10 flex items-center justify-center text-theatre-gold mb-4 shadow-glow-gold">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Cute 3D Theatre</h3>
            <p className="text-sm text-slate-400 mt-2">
              Explore a cozy cinema hall with adorable characters. Walk, jump, and sit together in couple seats.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-3xl text-left border border-white/10 hover:border-theatre-pink/40 transition">
            <div className="w-12 h-12 rounded-2xl bg-theatre-surface border border-white/10 flex items-center justify-center text-theatre-blush mb-4 shadow-glow-pink">
              <Film className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Cloudflare R2 Streams</h3>
            <p className="text-sm text-slate-400 mt-2">
              Upload video files up to 700MB with zero egress lag. Synchronized play, pause, and seek controls.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
        <p>2GETHER • Crafted for two hearts across the miles.</p>
        <p>Phase 1 Architecture & Foundation</p>
      </footer>
    </div>
  );
};

