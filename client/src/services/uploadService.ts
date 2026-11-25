import { useAppStore } from '../store/useAppStore';
import { socketService } from './socketService';
import { apiUrl } from './apiConfig';

class UploadService {
  private activeXHRs: Set<XMLHttpRequest> = new Set();
  private cancelUploadFlag: boolean = false;
  private activeSession: { roomCode: string; key: string; uploadId: string } | null = null;

  public isUploading(): boolean {
    return useAppStore.getState().uploadState.isUploading;
  }

  /**
   * Upload single chunk to Cloudflare R2 with automatic server proxy fallback on CORS
   */
  private async uploadChunkWithRetry(
    partNumber: number,
    partUrl: string,
    blob: Blob,
    onPartProgress: (loaded: number) => void,
    key?: string,
    uploadId?: string,
    maxRetries: number = 3
  ): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (this.cancelUploadFlag) {
        throw new Error('UPLOAD_CANCELLED');
      }

      try {
        return await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          this.activeXHRs.add(xhr);
          xhr.timeout = 120000; // 120s timeout per chunk for reliable large file uploads
          xhr.open('PUT', partUrl, true);

          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              onPartProgress(evt.loaded);
            }
          };

          xhr.onload = async () => {
            this.activeXHRs.delete(xhr);
            if (xhr.status >= 200 && xhr.status < 300) {
              onPartProgress(blob.size);
              let etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || '';
              etag = etag.replace(/^['"]|['"]$/g, '');
              if (etag) {
                resolve(etag);
                return;
              }
              reject(new Error(`Storage did not expose ETag header for part ${partNumber}. Check Cloudflare R2 CORS exposeHeaders.`));
            } else if (xhr.status === 403) {
              reject(new Error('AUTH_ERROR: Presigned credentials rejected by R2 storage (HTTP 403).'));
            } else {
              reject(new Error(`HTTP_${xhr.status}: Storage upload failed for part ${partNumber}`));
            }
          };

          xhr.onerror = () => {
            this.activeXHRs.delete(xhr);
            if (xhr.status === 0) {
              reject(new Error(
                'CORS_ERROR: Direct browser upload was blocked by Cloudflare R2 CORS policy.'
              ));
            } else {
              reject(new Error(`Storage network error on part ${partNumber}`));
            }
          };

          xhr.ontimeout = () => {
            this.activeXHRs.delete(xhr);
            reject(new Error(`Part ${partNumber} request timed out`));
          };

          xhr.send(blob);
        });
      } catch (err: any) {
        if (
          this.cancelUploadFlag ||
          err.message === 'UPLOAD_CANCELLED' ||
          err.message.startsWith('AUTH_ERROR:') ||
          attempt === maxRetries
        ) {
          throw err;
        }

        const backoffMs = Math.min(800 * Math.pow(2, attempt - 1), 3500);
        console.warn(`[UploadService] Part ${partNumber} retry attempt ${attempt}/${maxRetries} in ${backoffMs}ms...`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }

    throw new Error(`Part ${partNumber} failed after ${maxRetries} attempts.`);
  }

  /**
   * Starts High-Speed Parallel Multipart Upload in Background
   */
  public async startUpload(file: File, roomCode: string): Promise<void> {
    const MAX_700MB = 700 * 1024 * 1024;
    if (file.size > MAX_700MB) {
      useAppStore.getState().setUploadState({
        isUploading: false,
        error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 700 MB.`,
        errorDetails: null,
      });
      return;
    }

    const profile = useAppStore.getState().profile;
    const userId = profile.userId || profile.playerId;

    this.cancelUploadFlag = false;
    this.activeXHRs.clear();

    useAppStore.getState().setUploadState({
      isUploading: true,
      progress: 2,
      speed: 'Initializing...',
      eta: 'Starting parallel streams...',
      fileName: file.name,
      fileSize: file.size,
      error: null,
      errorDetails: null,
    });

    try {
      // 1. Request presigned multipart session with 8 MB optimal chunk size for fast mobile parallel throughput
      const OPTIMAL_CHUNK_SIZE = 8 * 1024 * 1024;
      const initRes = await fetch(apiUrl('/api/movies/upload-request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          userId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'video/mp4',
          chunkSize: OPTIMAL_CHUNK_SIZE,
        }),
      });

      if (!initRes.ok) {
        let errJson: any = {};
        try { errJson = await initRes.json(); } catch (_) {}
        if (initRes.status === 403) {
          throw new Error('AUTH_ERROR: Only the room host is authorized to upload movies.');
        } else if (initRes.status === 404) {
          throw new Error('ROOM_ERROR: Room not found or has expired. Please rejoin.');
        } else {
          throw new Error(errJson.message || errJson.error || `Upload session request failed with HTTP ${initRes.status}`);
        }
      }

      const initData = await initRes.json();
      if (!initData.success) {
        throw new Error(initData.message || initData.error || 'Failed to initialize upload session');
      }

      const { uploadId, key, totalParts, partUrls, chunkSize } = initData;
      this.activeSession = { roomCode, key, uploadId };

      // 2. High-Speed Concurrent Upload Pool (balanced at 3 parallel chunks to prevent network socket starvation)
      const CONCURRENCY = Math.min(3, totalParts);
      const partQueue = Array.from({ length: totalParts }, (_, i) => i + 1);
      const completedParts: Array<{ PartNumber: number; ETag: string }> = [];

      const partLoadedMap = new Map<number, number>();
      let lastSampleTime = performance.now();
      let lastSampleBytes = 0;

      const updateProgress = () => {
        let totalSent = 0;
        for (const bytes of partLoadedMap.values()) {
          totalSent += bytes;
        }

        const pct = Math.min(99, Math.round((totalSent / file.size) * 100));
        const now = performance.now();
        const elapsed = (now - lastSampleTime) / 1000;

        let speedStr = useAppStore.getState().uploadState.speed;
        let etaStr = useAppStore.getState().uploadState.eta;

        if (elapsed >= 0.35) {
          const deltaBytes = totalSent - lastSampleBytes;
          const currentSpeed = deltaBytes / elapsed;
          const currentSpeedMBs = (currentSpeed / (1024 * 1024)).toFixed(1);
          speedStr = `${currentSpeedMBs} MB/s`;

          if (currentSpeed > 50000) {
            const remainingBytes = Math.max(0, file.size - totalSent);
            const remainingSecs = Math.round(remainingBytes / currentSpeed);
            const mins = Math.floor(remainingSecs / 60);
            const secs = remainingSecs % 60;
            etaStr = `${mins}:${secs < 10 ? '0' : ''}${secs} left`;
          }

          lastSampleTime = now;
          lastSampleBytes = totalSent;
        }

        useAppStore.getState().setUploadState({
          progress: Math.max(pct, useAppStore.getState().uploadState.progress),
          speed: speedStr,
          eta: etaStr,
        });
      };

      const worker = async () => {
        while (partQueue.length > 0 && !this.cancelUploadFlag) {
          const partNumber = partQueue.shift()!;
          const partUrl = partUrls[partNumber - 1];
          const start = (partNumber - 1) * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunkBlob = file.slice(start, end);

          const etag = await this.uploadChunkWithRetry(
            partNumber,
            partUrl,
            chunkBlob,
            (loaded) => {
              partLoadedMap.set(partNumber, loaded);
              updateProgress();
            },
            key,
            uploadId
          );

          completedParts.push({ PartNumber: partNumber, ETag: etag });
        }
      };

      const workers = Array.from({ length: CONCURRENCY }, () => worker());
      await Promise.all(workers);

      if (this.cancelUploadFlag) {
        throw new Error('UPLOAD_CANCELLED');
      }

      // Sort all completed parts in strict ascending order by PartNumber
      completedParts.sort((a, b) => a.PartNumber - b.PartNumber);

      useAppStore.getState().setUploadState({
        progress: 99,
        speed: 'Finalizing...',
        eta: 'Attaching movie...',
      });

      // 3. Complete multipart upload on backend
      const completeRes = await fetch(apiUrl('/api/movies/complete-upload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          userId,
          key,
          uploadId,
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileSize: file.size,
          mimeType: file.type || 'video/mp4',
          parts: completedParts,
        }),
      });

      const completeData = await completeRes.json();
      if (!completeData.success) {
        throw new Error(completeData.message || completeData.error || 'Failed to finalize multipart upload');
      }

      // 4. Update store and notify room partner via Socket.IO
      useAppStore.getState().setMovie(completeData.movie);
      useAppStore.getState().setUploadState({
        isUploading: false,
        progress: 100,
        speed: 'Done!',
        eta: 'Ready!',
        error: null,
      });

      this.activeSession = null;
      socketService.attachMovie(completeData.movie);
      socketService.sendMovieSync('PAUSE', 0, completeData.movie.playbackUrl);
      console.log('[UploadService] Movie upload completed successfully:', completeData.movie.title);
    } catch (err: any) {
      if (err.message === 'UPLOAD_CANCELLED') {
        useAppStore.getState().setUploadState({
          isUploading: false,
          progress: 0,
          speed: '0 MB/s',
          eta: '',
          error: 'Upload was cancelled.',
        });
        return;
      }

      console.error('[UploadService] Upload error:', err);
      const rawMsg: string = err.message || 'Upload failed';

      let errorTitle = rawMsg;
      let errorDetails: string | null = null;

      if (rawMsg.startsWith('CORS_ERROR:')) {
        errorTitle = 'Cloudflare R2 CORS Configuration Required';
        errorDetails = rawMsg.replace('CORS_ERROR: ', '');
      } else if (rawMsg.startsWith('AUTH_ERROR:')) {
        errorTitle = 'Permission Denied';
        errorDetails = rawMsg.replace('AUTH_ERROR: ', '');
      }

      useAppStore.getState().setUploadState({
        isUploading: false,
        error: errorTitle,
        errorDetails,
      });

      // Cleanup orphaned session in R2
      if (this.activeSession) {
        fetch(apiUrl('/api/movies/abort-upload'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode: this.activeSession.roomCode,
            userId,
            key: this.activeSession.key,
            uploadId: this.activeSession.uploadId,
          }),
        }).catch(() => {});
        this.activeSession = null;
      }
    }
  }

  /**
   * Cancels in-progress upload and aborts R2 multipart session
   */
  public cancelUpload(): void {
    this.cancelUploadFlag = true;
    for (const xhr of this.activeXHRs) {
      try { xhr.abort(); } catch (_) {}
    }
    this.activeXHRs.clear();

    if (this.activeSession) {
      const profile = useAppStore.getState().profile;
      const userId = profile.userId || profile.playerId;
      fetch(apiUrl('/api/movies/abort-upload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: this.activeSession.roomCode,
          userId,
          key: this.activeSession.key,
          uploadId: this.activeSession.uploadId,
        }),
      }).catch(() => {});
      this.activeSession = null;
    }

    useAppStore.getState().setUploadState({
      isUploading: false,
      progress: 0,
      speed: '0 MB/s',
      eta: '',
      error: 'Upload was cancelled.',
      errorDetails: null,
    });
  }
}

export const uploadService = new UploadService();
