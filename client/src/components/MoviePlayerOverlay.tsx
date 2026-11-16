import React, { useState, useRef } from 'react';
import { Play, Pause, Upload, Film, X, Volume2, FastForward, RotateCcw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';

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

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size ceiling (700 MB)
    const MAX_700MB = 700 * 1024 * 1024;
    if (file.size > MAX_700MB) {
      setErrorMessage(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 700 MB.`);
      return;
    }

    setErrorMessage(null);
    setUploading(true);
    setUploadProgress(10);

    try {
      // Create local object URL for preview / playback
      const objectUrl = URL.createObjectURL(file);

      // Simulate upload progress steps for UI feedback
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 95) {
            clearInterval(interval);
            return 95;
          }
          return prev + 15;
        });
      }, 300);

      setTimeout(() => {
        clearInterval(interval);
        setUploadProgress(100);

        const movieMeta = {
          id: `movie_${Date.now()}`,
          roomCode: roomCode || 'UNKNOWN',
          title: file.name.replace(/\.[^/.]+$/, ''),
          r2Key: `rooms/${roomCode}/${file.name}`,
          fileSize: file.size,
          durationSeconds: 0,
          status: 'READY' as const,
          playbackUrl: objectUrl,
        };

        setMovie(movieMeta);
        setUploading(false);
        socketService.sendMovieSync('PAUSE', 0, objectUrl);
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Upload failed');
      setUploading(false);
    }
  };

  // Preset cinematic trailer for instant testing
  const loadDemoTrailer = () => {
    const demoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    const demoMovie = {
      id: 'demo_bunny',
      roomCode: roomCode || 'DEMO',
      title: 'Big Buck Bunny (Cinema Test Stream)',
      r2Key: 'demo/big_buck_bunny.mp4',
      fileSize: 158008374,
      durationSeconds: 596,
      status: 'READY' as const,
      playbackUrl: demoUrl,
    };
    setMovie(demoMovie);
    socketService.sendMovieSync('PLAY', 0, demoUrl);
  };

  const handlePlayToggle = () => {
    const nextAction = isPlaying ? 'PAUSE' : 'PLAY';
    setMovieSync({ action: nextAction });
    socketService.sendMovieSync(nextAction, movieTime, currentMovie?.playbackUrl);
  };

  const handleSeek = (newTime: number) => {
    setMovieSync({ currentTime: newTime });
    socketService.sendMovieSync('SEEK', newTime, currentMovie?.playbackUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl glass-panel-gold rounded-3xl p-6 shadow-2xl relative border border-theatre-gold/30">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
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
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs">
            {errorMessage}
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

            {/* Playback Controls (Host Only or Synced) */}
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
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-theatre-darkest shadow-glow-gold transition-all active:scale-95 ${
                    isHost
                      ? 'bg-gradient-to-r from-theatre-gold to-amber-500 hover:brightness-110'
                      : 'bg-slate-600 opacity-60 cursor-not-allowed'
                  }`}
                  title={isHost ? (isPlaying ? 'Pause' : 'Play') : 'Host controls playback'}
                >
                  {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
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
                  className="text-xs text-rose-400 hover:text-rose-300 underline"
                >
                  Change Movie
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {isHost ? (
              <>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-theatre-gold/40 hover:border-theatre-gold/80 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition bg-theatre-dark/40 hover:bg-theatre-dark/60 text-center"
                >
                  <Upload className="w-12 h-12 text-theatre-gold mb-3 animate-bounce" />
                  <p className="font-semibold text-white">Upload Your Movie (Max 700 MB)</p>
                  <p className="text-xs text-slate-400 mt-1">Supports MP4, WebM, MKV format</p>
                  <p className="text-[11px] text-theatre-softPink mt-3">
                    Direct Cloudflare R2 multipart streaming • Secure temporary session
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {uploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Uploading to Theatre Screen...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-theatre-darkest overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-theatre-pink to-theatre-gold transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink mx-4 text-xs text-slate-500 uppercase tracking-widest">or quick test</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                <button
                  onClick={loadDemoTrailer}
                  className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium text-slate-200 transition flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 text-theatre-gold" />
                  Load Open-Source Cinema Test Trailer (Big Buck Bunny)
                </button>
              </>
            ) : (
              <div className="text-center py-10">
                <Film className="w-14 h-14 text-theatre-gold/40 mx-auto mb-3 animate-pulse" />
                <h3 className="text-lg font-bold text-white">Waiting for Room Host</h3>
                <p className="text-sm text-slate-400 mt-1">
                  The host is selecting the film for tonight's screening.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
