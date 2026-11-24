/**
 * 2GETHER WebRTC Peer-to-Peer Voice Chat Service
 * Ultra low-latency crystal clear voice communication for two hearts.
 * Supports: Push-to-Talk, Tap Mute/Unmute, Speaking Waves Detection & Cinema Ducking.
 */

import { Socket } from 'socket.io-client';
import { useAppStore } from '../store/useAppStore';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

class VoiceService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private socket: Socket | null = null;

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
    this.setupSignaling();

    // Create hidden remote audio playback element
    if (!this.remoteAudioElement && typeof document !== 'undefined') {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.id = '2gether-remote-voice';
      document.body.appendChild(audio);
      this.remoteAudioElement = audio;
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
        }
      } catch (err: any) {
        console.error('[VoiceService] Error handling answer:', err);
      }
    });

    // Receive ICE candidate
    this.socket.on('webrtc:ice-candidate', async (payload: { candidate: RTCIceCandidateInit }) => {
      try {
        if (this.peerConnection && payload.candidate) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (err: any) {
        console.warn('[VoiceService] Warning adding ICE candidate:', err);
      }
    });

    // Receive Partner Speaking State
    this.socket.on('webrtc:voice-activity', (payload: { isSpeaking: boolean }) => {
      useAppStore.getState().setRemoteSpeaking(payload.isSpeaking);
      this.handleCinemaDucking();
    });
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

      this.audioContext = new AudioCtx();
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
        const speakingNow = average > 32; // Intentional voice threshold (ignores ambient fan / room hum)

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
   * Creates WebRTC Peer Connection and attaches tracks
   */
  private async createPeer(): Promise<RTCPeerConnection> {
    if (this.peerConnection) {
      return this.peerConnection;
    }

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
      console.log('[VoiceService] Received remote audio stream');
      if (this.remoteAudioElement && event.streams[0]) {
        this.remoteAudioElement.srcObject = event.streams[0];
        useAppStore.getState().setVoiceConnected(true);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[VoiceService] Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        useAppStore.getState().setVoiceConnected(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        useAppStore.getState().setVoiceConnected(false);
      }
    };

    // Attach local microphone audio track
    const stream = await this.ensureLocalMedia();
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    return pc;
  }

  /**
   * Host initiates WebRTC call offer to the joined guest
   */
  public async callPartner(): Promise<void> {
    try {
      const pc = await this.createPeer();
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
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
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

    if (muted && this.isCurrentlySpeaking) {
      this.setSpeaking(false);
    }
  }

  /**
   * Push-to-Talk activation (on press down)
   */
  public startPushToTalk(): void {
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

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
    }

    useAppStore.getState().setVoiceConnected(false);
    useAppStore.getState().setLocalSpeaking(false);
    useAppStore.getState().setRemoteSpeaking(false);
  }
}

export const voiceService = new VoiceService();
