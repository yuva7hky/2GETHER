import React, { useRef } from 'react';
import {
  Play,
  Pause,
  Upload,
  Film,
  X,
  Volume2,
  FastForward,
  RotateCcw,
  AlertTriangle,
  XCircle,
  Gauge,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';
import { uploadService } from '../services/uploadService';
import { apiUrl } from '../services/apiConfig';

interface MoviePlayerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MoviePlayerOverlay: React.FC<MoviePlayerOverlayProps> = ({ isOpen, onClose }) => {
  const isHost = useAppStore((state) => state.isHost);
  const roomCode = useAppStore((state) => state.roomCode);
  const currentMovie = useAppStore((state) => state.currentMovie);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const movieTime = useAppStore((state) => state.movieTime);
  const movieDuration = useAppStore((state) => state.movieDuration);
  const setMovie = useAppStore((state) => state.setMovie);
  const setMovieSync = useAppStore((state) => state.setMovieSync);

  // Background Persistent Upload State
  const uploadState = useAppStore((state) => state.uploadState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomCode) return;
    uploadService.startUpload(file, roomCode);
  };

  const handleCancelUpload = () => {
    uploadService.cancelUpload();
  };

  const handlePlayToggle = () => {
    if (!currentMovie) return;
    const nextAction = isPlaying ? 'PAUSE' : 'PLAY';
    const vid = useAppStore.getState().activeVideoElement;
    if (vid) {
      if (nextAction === 'PLAY') {
        vid.muted = false;
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    }
    setMovieSync({ action: nextAction });
    socketService.sendMovieSync(nextAction, movieTime, currentMovie.playbackUrl);
  };

  const handleSeek = (newTime: number) => {
    if (!currentMovie) return;
    const clampedTime = Math.max(0, Math.min(newTime, movieDuration || newTime));
    setMovieSync({ currentTime: clampedTime });
    socketService.sendMovieSync('SEEK', clampedTime, currentMovie.playbackUrl);
  };

  const handleDeleteMovie = async () => {
    if (!roomCode || !currentMovie?.r2Key) return;
    const profile = useAppStore.getState().profile;
    const userId = profile.userId || profile.playerId;

    try {
      await fetch(apiUrl(`/api/movies/${roomCode}?userId=${encodeURIComponent(userId)}`), {
        method: 'DELETE',
      });
      setMovie(null);
      socketService.removeMovie();
    } catch (err) {
      console.error('Failed to delete movie:', err);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl glass-panel-gold rounded-3xl p-6 shadow-2xl relative border border-theatre-gold/30">
        {/* Close Button - ALWAYS active so users can explore street while uploading */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
          title="Close (Upload will continue in background)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-theatre-gold to-amber-600 flex items-center justify-center text-theatre-darkest shadow-glow-gold">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">Cinema Projector Control</h2>
            <p className="text-xs text-slate-300">Synchronized video stream for two hearts</p>
          </div>
        </div>

        {/* Error Notification */}
        {uploadState.error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs space-y-1">
            <div className="flex items-center gap-2 font-bold text-rose-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadState.error}</span>
            </div>
            {uploadState.errorDetails && (
              <p className="text-[11px] text-rose-100/90 leading-relaxed pl-6">
                {uploadState.errorDetails}
              </p>
            )}
          </div>
        )}

        {/* Active Movie Display or Upload Box */}
        {currentMovie ? (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-theatre-dark/70 border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-xs text-theatre-gold font-medium uppercase tracking-wider">Now Projecting</p>
                <h3 className="text-lg font-bold text-white mt-0.5">{currentMovie.title}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Size: {(currentMovie.fileSize / (1024 * 1024)).toFixed(1)} MB • R2 Secure Stream
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Synchronized
              </span>
            </div>

            {/* Playback Controls */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => handleSeek(Math.max(0, movieTime - 10))}
                  disabled={!isHost}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 transition"
                  title="Rewind 10s"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>

                <button
                  onClick={handlePlayToggle}
                  disabled={!isHost}
                  className="p-4 rounded-2xl bg-theatre-gold text-theatre-darkest hover:scale-105 active:scale-95 shadow-glow-gold font-bold transition disabled:opacity-40"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                </button>

                <button
                  onClick={() => handleSeek(movieTime + 10)}
                  disabled={!isHost}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 transition"
                  title="Forward 10s"
                >
                  <FastForward className="w-5 h-5" />
                </button>
              </div>

              {!isHost && (
                <p className="text-center text-xs text-theatre-blush/80">
                  ♥ Playback is controlled by the room host. Enjoy the movie together!
                </p>
              )}
            </div>

            {isHost && (
              <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                <button
                  onClick={() => setMovie(null)}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  Change Selection
                </button>
                <button
                  onClick={handleDeleteMovie}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 transition border border-rose-500/20"
                >
                  Delete Movie from R2
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {isHost ? (
              <>
                <div
                  onClick={() => !uploadState.isUploading && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition text-center ${
                    uploadState.isUploading
                      ? 'border-theatre-gold/60 bg-theatre-dark/60 cursor-default'
                      : 'border-theatre-gold/40 hover:border-theatre-gold/80 bg-theatre-dark/40 hover:bg-theatre-dark/60 cursor-pointer'
                  }`}
                >
                  <Upload className="w-12 h-12 text-theatre-gold mb-3 animate-bounce" />
                  <p className="font-semibold text-white">Upload Your Movie (Max 700 MB)</p>
                  <p className="text-xs text-slate-400 mt-1">High-Speed Parallel Streaming • 16 MB Chunks</p>
                  <p className="text-[11px] text-theatre-softPink mt-3">
                    Direct Cloudflare R2 multipart upload • Automatic cleanup on exit
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                    onChange={handleFileUpload}
                    disabled={uploadState.isUploading}
                    className="hidden"
                  />
                </div>

                {/* Live High-Speed Parallel Progress & Speed Meter */}
                {uploadState.isUploading && (
                  <div className="p-4 rounded-2xl bg-theatre-dark/80 border border-theatre-gold/30 space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-theatre-gold animate-ping" />
                        <span>Uploading (4x Parallel Streams)</span>
                      </span>
                      <span className="font-mono text-theatre-gold text-sm font-bold">
                        {uploadState.progress}%
                      </span>
                    </div>

                    {/* Monotonic Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-theatre-pink via-theatre-gold to-emerald-400 transition-all duration-300"
                        style={{ width: `${uploadState.progress}%` }}
                      />
                    </div>

                    {/* Speed Meter, ETA, and Cancel */}
                    <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <Gauge className="w-3.5 h-3.5 text-theatre-gold" />
                        <span className="font-bold text-white">{uploadState.speed}</span>
                      </div>

                      <div className="text-[11px] font-mono text-slate-400">
                        {uploadState.eta}
                      </div>

                      <button
                        onClick={handleCancelUpload}
                        className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    </div>

                    {/* Background Exploratory Hint */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[11px] text-emerald-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-theatre-gold flex-shrink-0" />
                        <span>Upload runs in background! You can close this anytime!</span>
                      </span>
                      <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-xl bg-theatre-gold text-theatre-darkest text-xs font-bold hover:brightness-110 active:scale-95 transition"
                      >
                        Close & Search Key 🗝️
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Film className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                <p className="font-semibold text-white">Waiting for Host to Select Movie</p>
                <p className="text-xs mt-1">The room host can upload a video up to 700 MB.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
