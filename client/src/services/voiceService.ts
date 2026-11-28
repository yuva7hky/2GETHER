/**
 * 2GETHER WebRTC Peer-to-Peer Voice Chat Service
 * Ultra low-latency crystal clear voice communication for two hearts.
 * Supports: Free TURN fallback (Metered OpenRelay), Keepalive NAT Ping, Auto-Reconnect,
 *           AudioContext Autoplay Unlock, Push-to-Talk, Tap Mute/Unmute, Speaking Waves & Cinema Ducking.
 */

import { Socket } from 'socket.io-client';
import { useAppStore } from '../store/useAppStore';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

class VoiceService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private socket: Socket | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isCleaningUp = false;
  private isAudioBlockedByAutoplay = false;
  private silentTrack: MediaStreamTrack | null = null;

  // Voice Activity Detection (AnalyserNode)
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadInterval: ReturnType<typeof setInterval> | null = null;
  private isCurrentlySpeaking = false;

  // Cinema volume ducking state
  private originalMovieVolume = 1.0;
  private isDucked = false;

  /**
   * Initializes WebRTC voice signaling listeners with Socket.IO
   */
  public init(socket: Socket): void {
    this.socket = socket;
    this.isCleaningUp = false;
    this.setupSignaling();
    this.setupAutoplayUnlock();

    // Create hidden remote audio playback element
    if (!this.remoteAudioElement && typeof document !== 'undefined') {
      let audio = document.getElementById('2gether-remote-voice') as HTMLAudioElement | null;
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = '2gether-remote-voice';
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        document.body.appendChild(audio);
      }
      audio.muted = false;
      audio.volume = 1.0;
      this.remoteAudioElement = audio;
    }
  }

  /**
   * Global listener for user interaction to unlock browser autoplay policy for AudioContext & Remote Audio
   */
  private setupAutoplayUnlock(): void {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      // Resume AudioContext if suspended
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      // Resume remote audio element if blocked by browser autoplay
      if (this.remoteAudioElement && (this.remoteAudioElement.paused || this.isAudioBlockedByAutoplay)) {
        if (this.remoteAudioElement.srcObject) {
          this.remoteAudioElement.muted = false;
          this.remoteAudioElement.volume = 1.0;
          this.remoteAudioElement
            .play()
            .then(() => {
              this.isAudioBlockedByAutoplay = false;
            })
            .catch(() => {});
        }
      }
    };

    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public unlockAudio(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    if (this.remoteAudioElement && this.remoteAudioElement.srcObject) {
      this.remoteAudioElement.muted = false;
      this.remoteAudioElement.volume = 1.0;
      this.remoteAudioElement.play().catch(() => {});
    }
  }

  private setupSignaling(): void {
    if (!this.socket) return;

    // Receive WebRTC Offer
    this.socket.on('webrtc:offer', async (payload: { sdp: RTCSessionDescriptionInit }) => {
      console.log('[VoiceService] Received WebRTC offer');
      try {
        await this.handleOffer(payload.sdp);
      } catch (err: any) {
        console.error('[VoiceService] Error handling offer:', err);
      }
    });

    // Receive WebRTC Answer
    this.socket.on('webrtc:answer', async (payload: { sdp: RTCSessionDescriptionInit }) => {
      console.log('[VoiceService] Received WebRTC answer');
      try {
        if (this.peerConnection && payload.sdp) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await this.flushIceCandidates();
        }
      } catch (err: any) {
        console.error('[VoiceService] Error handling answer:', err);
      }
    });

    // Receive ICE candidate
    this.socket.on('webrtc:ice-candidate', async (payload: { candidate: RTCIceCandidateInit }) => {
      try {
        if (!payload.candidate) return;
        if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } else {
          // Queue ICE candidate until remote description is set
          this.iceCandidatesQueue.push(payload.candidate);
        }
      } catch (err: any) {
        console.warn('[VoiceService] Warning adding ICE candidate:', err);
      }
    });

    // Partner requested WebRTC Restart (e.g. after network drop / reconnect)
    this.socket.on('webrtc:restart', async () => {
      console.log('[VoiceService] Partner requested WebRTC restart');
      if (useAppStore.getState().isHost) {
        await this.restartCall();
      }
    });

    // Receive Partner Speaking State
    this.socket.on('webrtc:voice-activity', (payload: { isSpeaking: boolean }) => {
      useAppStore.getState().setRemoteSpeaking(payload.isSpeaking);
      this.handleCinemaDucking();
    });
  }

  private async flushIceCandidates(): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.iceCandidatesQueue.length > 0) {
      const candidate = this.iceCandidatesQueue.shift();
      if (candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[VoiceService] Queued ICE candidate error:', e);
        }
      }
    }
  }

  /**
   * Generates a zero-volume silent audio track via Web Audio to keep WebRTC transceiver bidirectional (sendrecv)
   */
  private getOrCreateSilentTrack(): MediaStreamTrack | null {
    if (this.silentTrack && this.silentTrack.readyState === 'live') {
      return this.silentTrack;
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const dst = ctx.createMediaStreamDestination();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      this.silentTrack = dst.stream.getAudioTracks()[0] || null;
      return this.silentTrack;
    } catch (e: any) {
      console.warn('[VoiceService] Could not generate silent audio track:', e.message);
      return null;
    }
  }

  /**
   * Safely attaches a track onto the peer connection's audio transceiver
   */
  private attachTrackToPeer(pc: RTCPeerConnection | null, track: MediaStreamTrack | null): void {
    if (!pc || !track) return;
    try {
      const senders = pc.getSenders();
      const alreadySending = senders.some((s) => s.track === track || (s.track && s.track.id === track.id));
      if (alreadySending) return;

      const audioSender = senders.find((s) => s.track?.kind === 'audio' || s.track === null);
      if (audioSender) {
        audioSender.replaceTrack(track).catch(() => {});
      } else {
        try {
          pc.addTrack(track);
        } catch (err: any) {
          console.warn('[VoiceService] addTrack safe warning:', err.message);
        }
      }
    } catch (e: any) {
      console.warn('[VoiceService] attachTrackToPeer warning:', e.message);
    }
  }

  /**
   * Safely attaches or replaces local audio tracks onto a peer connection without throwing duplicate sender errors
   */
  private attachStreamToPeer(pc: RTCPeerConnection | null, stream: MediaStream | null): void {
    if (!pc || !stream) return;
    try {
      const senders = pc.getSenders();
      stream.getAudioTracks().forEach((track) => {
        const alreadyAdded = senders.some((s) => s.track === track || (s.track && s.track.id === track.id));
        if (alreadyAdded) return;

        const audioSender = senders.find((s) => s.track?.kind === 'audio' || s.track === null);
        if (audioSender) {
          audioSender.replaceTrack(track).catch(() => {});
        } else {
          try {
            pc.addTrack(track, stream);
          } catch (trackErr: any) {
            console.warn('[VoiceService] addTrack safe warning:', trackErr.message);
          }
        }
      });
    } catch (e: any) {
      console.warn('[VoiceService] attachStreamToPeer warning:', e.message);
    }
  }

  /**
   * Requests microphone access and prepares local audio track
   */
  public async ensureLocalMedia(): Promise<MediaStream | null> {
    if (this.localStream) {
      return this.localStream;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.localStream = stream;

      // Start muted by default until user un-mutes or holds push-to-talk
      const isMuted = useAppStore.getState().isMicMuted;
      this.setMuted(isMuted);

      // If peer connection already exists, attach or replace audio track safely
      if (this.peerConnection) {
        this.attachStreamToPeer(this.peerConnection, stream);
      }

      // Setup VAD (Voice Activity Detection)
      this.setupVAD(stream);

      return stream;
    } catch (err: any) {
      console.warn('[VoiceService] Microphone access denied or unavailable:', err.message);
      return null;
    }
  }

  /**
   * Voice Activity Detection (AnalyserNode) to detect when local player is talking
   */
  private setupVAD(stream: MediaStream): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);

      if (this.vadInterval) clearInterval(this.vadInterval);
      this.vadInterval = setInterval(() => {
        if (!this.analyser) return;

        // If mic is muted, not speaking
        if (useAppStore.getState().isMicMuted) {
          if (this.isCurrentlySpeaking) {
            this.setSpeaking(false);
          }
          return;
        }

        this.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const average = sum / buffer.length;
        const speakingNow = average > 32; // Intentional voice threshold

        if (speakingNow !== this.isCurrentlySpeaking) {
          this.setSpeaking(speakingNow);
        }
      }, 100);
    } catch (e: any) {
      console.warn('[VoiceService] VAD setup warning:', e.message);
    }
  }

  private setSpeaking(speaking: boolean): void {
    this.isCurrentlySpeaking = speaking;
    useAppStore.getState().setLocalSpeaking(speaking);

    // Broadcast speaking activity to partner for visual waves
    if (this.socket && this.socket.connected) {
      this.socket.emit('webrtc:voice-activity', { isSpeaking: speaking });
    }

    this.handleCinemaDucking();
  }

  /**
   * Cinema Audio Ducking: slightly reduces movie volume during active speech
   */
  private handleCinemaDucking(): void {
    const { isLocalSpeaking, isRemoteSpeaking, activeVideoElement } = useAppStore.getState();
    if (!activeVideoElement) return;

    const anyoneSpeaking = isLocalSpeaking || isRemoteSpeaking;

    if (anyoneSpeaking && !this.isDucked) {
      this.isDucked = true;
      this.originalMovieVolume = activeVideoElement.volume;
      activeVideoElement.volume = Math.max(0.4, this.originalMovieVolume * 0.75);
    } else if (!anyoneSpeaking && this.isDucked) {
      this.isDucked = false;
      activeVideoElement.volume = this.originalMovieVolume;
    }
  }

  /**
   * Keepalive DataChannel setup: Sends a small ping every 5 seconds to keep mobile UDP NAT pinholes open
   */
  private setupDataChannel(dc: RTCDataChannel): void {
    this.dataChannel = dc;
    dc.onopen = () => {
      console.log('[VoiceService] WebRTC keepalive data channel active');
      if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = setInterval(() => {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          try {
            this.dataChannel.send('p');
          } catch {}
        }
      }, 5000);
    };

    dc.onclose = () => {
      if (this.keepAliveInterval) {
        clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = null;
      }
    };
  }

  /**
   * Creates WebRTC Peer Connection and attaches tracks
   */
  private async createPeer(): Promise<RTCPeerConnection> {
    if (this.peerConnection) {
      return this.peerConnection;
    }

    this.iceCandidatesQueue = [];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnection = pc;

    // Send local ICE candidates to partner
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('webrtc:ice-candidate', { candidate: event.candidate });
      }
    };

    // Receive remote audio track
    pc.ontrack = (event) => {
      console.log('[VoiceService] Received remote audio track');
      if (this.remoteAudioElement) {
        const stream = (event.streams && event.streams[0]) || (event.track ? new MediaStream([event.track]) : null);
        if (stream) {
          this.remoteAudioElement.srcObject = stream;
          this.remoteAudioElement.muted = false;
          this.remoteAudioElement.volume = 1.0;
          this.remoteAudioElement
            .play()
            .then(() => {
              this.isAudioBlockedByAutoplay = false;
            })
            .catch((err) => {
              console.log('[VoiceService] Remote audio autoplay deferred until user interaction:', err.message);
              this.isAudioBlockedByAutoplay = true;
            });
          useAppStore.getState().setVoiceConnected(true);
        }
      }
    };

    // Listen to ICE Connection State
    pc.oniceconnectionstatechange = () => {
      console.log('[VoiceService] ICE state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        useAppStore.getState().setVoiceConnected(true);
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      } else if (pc.iceConnectionState === 'disconnected') {
        useAppStore.getState().setVoiceConnected(false);
        this.scheduleAutoReconnect(3000);
      } else if (pc.iceConnectionState === 'failed') {
        useAppStore.getState().setVoiceConnected(false);
        this.scheduleAutoReconnect(500);
      }
    };

    // Listen to Peer Connection State
    pc.onconnectionstatechange = () => {
      console.log('[VoiceService] Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        useAppStore.getState().setVoiceConnected(true);
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      } else if (pc.connectionState === 'disconnected') {
        useAppStore.getState().setVoiceConnected(false);
        this.scheduleAutoReconnect(3000);
      } else if (pc.connectionState === 'failed') {
        useAppStore.getState().setVoiceConnected(false);
        this.scheduleAutoReconnect(500);
      }
    };

    // Ensure bidirectional audio transceiver is configured upfront
    try {
      const hasAudio = pc.getTransceivers().some((t) => t.receiver?.track?.kind === 'audio');
      if (!hasAudio) {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }
    } catch (e: any) {
      console.warn('[VoiceService] addTransceiver warning:', e.message);
    }

    // Attach local microphone audio track if available and unmuted; otherwise attach silent track to ensure sendrecv
    if (this.localStream && !useAppStore.getState().isMicMuted) {
      this.attachStreamToPeer(pc, this.localStream);
    } else {
      const silent = this.getOrCreateSilentTrack();
      if (silent) {
        this.attachTrackToPeer(pc, silent);
      }
      this.ensureLocalMedia().catch(() => {});
    }

    return pc;
  }

  /**
   * Auto-reconnect scheduler on temporary disconnect or drop
   */
  private scheduleAutoReconnect(delayMs: number): void {
    if (this.isCleaningUp || this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      if (this.isCleaningUp || !this.socket || !this.socket.connected) return;
      if (!useAppStore.getState().otherPlayer) return;

      console.log('[VoiceService] Auto-reconnecting WebRTC voice...');
      const isHost = useAppStore.getState().isHost;
      if (isHost) {
        await this.restartCall();
      } else {
        this.socket.emit('webrtc:restart');
      }
    }, delayMs);
  }

  /**
   * Restarts the WebRTC call (cleans up stale peer and re-initiates)
   */
  public async restartCall(): Promise<void> {
    if (this.isCleaningUp) return;
    console.log('[VoiceService] Restarting WebRTC voice call...');
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.dataChannel = null;
    await this.callPartner();
  }

  /**
   * Host initiates WebRTC call offer to the joined guest
   */
  public async callPartner(): Promise<void> {
    try {
      const pc = await this.createPeer();

      // Create Keepalive DataChannel
      const dc = pc.createDataChannel('keepalive');
      this.setupDataChannel(dc);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      if (this.socket) {
        console.log('[VoiceService] Sending WebRTC offer to partner');
        this.socket.emit('webrtc:offer', { sdp: offer });
      }
    } catch (err: any) {
      console.error('[VoiceService] Error calling partner:', err);
    }
  }

  /**
   * Guest answers incoming offer from host
   */
  private async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = await this.createPeer();

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.flushIceCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (this.socket) {
      console.log('[VoiceService] Sending WebRTC answer to partner');
      this.socket.emit('webrtc:answer', { sdp: answer });
    }
  }

  /**
   * Toggle or set microphone mute state
   */
  public setMuted(muted: boolean): void {
    useAppStore.getState().setMicMuted(muted);

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    // Ensure audio sender is attached to the peer connection safely
    if (this.peerConnection) {
      if (!muted && this.localStream) {
        this.attachStreamToPeer(this.peerConnection, this.localStream);
      } else if (muted) {
        const silent = this.getOrCreateSilentTrack();
        if (silent) {
          this.attachTrackToPeer(this.peerConnection, silent);
        }
      }
    }

    if (muted && this.isCurrentlySpeaking) {
      this.setSpeaking(false);
    }
  }

  /**
   * Push-to-Talk activation (on press down)
   */
  public startPushToTalk(): void {
    this.unlockAudio();
    this.ensureLocalMedia().then(() => {
      this.setMuted(false);
    });
  }

  /**
   * Push-to-Talk release (on release up)
   */
  public stopPushToTalk(): void {
    this.setMuted(true);
  }

  /**
   * Cleanup on room exit
   */
  public cleanup(): void {
    this.isCleaningUp = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.silentTrack) {
      try {
        this.silentTrack.stop();
      } catch {}
      this.silentTrack = null;
    }

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
    }

    this.iceCandidatesQueue = [];
    useAppStore.getState().setVoiceConnected(false);
    useAppStore.getState().setLocalSpeaking(false);
    useAppStore.getState().setRemoteSpeaking(false);
  }
}

export const voiceService = new VoiceService();
