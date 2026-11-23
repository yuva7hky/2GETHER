import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  PutBucketCorsCommand,
  HeadObjectCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import type { Response } from 'express';
import { config } from '../config/index.js';

export const MAX_FILE_SIZE_BYTES = 700 * 1024 * 1024; // 700 MB maximum limit
export const CHUNK_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB default chunk size for high-speed uploads

export const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/ogg',
  'application/octet-stream', // Fallback for raw video uploads
];

export const ALLOWED_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mkv', '.ogv'];

export class MovieService {
  private s3Client: S3Client | null = null;

  constructor() {
    if (config.hasR2 && config.R2_ENDPOINT && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY) {
      try {
        this.s3Client = new S3Client({
          region: 'auto',
          endpoint: config.R2_ENDPOINT,
          credentials: {
            accessKeyId: config.R2_ACCESS_KEY_ID,
            secretAccessKey: config.R2_SECRET_ACCESS_KEY,
          },
          forcePathStyle: true,
        });
        console.log('[MovieService] Initialized with live Cloudflare R2 S3 storage.');

        // Initial sweep for abandoned ongoing multipart sessions & schedule recurring sweep
        setTimeout(() => this.cleanupStaleMultipartUploads(), 2000);
        setInterval(() => this.cleanupStaleMultipartUploads(), 10 * 60 * 1000); // Every 10 minutes

        // Schedule periodic purge of old movies (older than 3 hours) to strictly protect Cloudflare R2 10 GB free limit
        setTimeout(() => this.purgeStaleRoomMovies(3), 5000);
        setInterval(() => this.purgeStaleRoomMovies(3), 30 * 60 * 1000); // Every 30 minutes

        // Configure R2 bucket CORS for seamless direct browser uploads
        setTimeout(() => this.configureR2Cors(), 1500);
      } catch (err: any) {
        console.warn('[MovieService] Failed to initialize live S3 client, using dev fallback:', err.message);
        this.s3Client = null;
      }
    } else {
      console.log('[MovieService] No live R2 credentials configured. Running in local simulation mode.');
    }
  }

  /**
   * Sets CORS rules on Cloudflare R2 bucket so web browsers (e.g. Vercel) can upload directly
   */
  public async configureR2Cors(): Promise<void> {
    if (!this.s3Client || !config.R2_BUCKET_NAME) return;
    try {
      console.log(`[MovieService] Configuring CORS for R2 bucket: ${config.R2_BUCKET_NAME}...`);
      await this.s3Client.send(
        new PutBucketCorsCommand({
          Bucket: config.R2_BUCKET_NAME,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: ['*'],
                AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag', 'etag', 'Content-Length'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        })
      );
      console.log('[MovieService] Cloudflare R2 CORS configured successfully (AllowedOrigins: *).');
    } catch (err: any) {
      console.warn('[MovieService] Could not auto-apply R2 CORS via API (credentials may lack PutBucketCors permission):', err.message);
    }
  }

  /**
   * Direct server-side upload of a multipart chunk (failsafe fallback when browser direct R2 upload has CORS issues)
   */
  public async uploadPartDirect(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer
  ): Promise<string> {
    if (!this.s3Client || !config.R2_BUCKET_NAME) {
      throw new Error('Cloudflare R2 storage is not connected');
    }
    const res = await this.s3Client.send(
      new UploadPartCommand({
        Bucket: config.R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      })
    );
    const etag = (res.ETag || '').replace(/^['"]|['"]$/g, '');
    return etag || `etag_part_${partNumber}`;
  }

  public isConnected(): boolean {
    return this.s3Client !== null;
  }

  /**
   * Validates video file size, MIME type and extension
   */
  public validateVideoFile(fileName: string, fileSize: number, mimeType: string): void {
    if (!fileSize || fileSize <= 0) {
      throw new Error('Invalid file size. File must be greater than 0 bytes.');
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
      throw new Error(`File size (${sizeMB} MB) exceeds maximum allowed limit of 700 MB.`);
    }

    const ext = path.extname(fileName).toLowerCase();
    const isExtensionAllowed = ALLOWED_EXTENSIONS.includes(ext);
    const isMimeAllowed = ALLOWED_MIME_TYPES.some((m) => mimeType.toLowerCase().startsWith('video/') || mimeType === m);

    if (!isExtensionAllowed && !isMimeAllowed) {
      throw new Error(`Unsupported video format (${ext}). Supported formats: MP4, WebM, MOV, MKV.`);
    }
  }

  /**
   * Initializes high-speed presigned multipart upload session directly to Cloudflare R2
   * Uses Promise.all to generate all presigned part URLs in parallel
   */
  public async initMultipartUpload(
    roomCode: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    requestedChunkSize?: number
  ): Promise<{ uploadId: string; key: string; totalParts: number; chunkSize: number; partUrls: string[] }> {
    this.validateVideoFile(fileName, fileSize, mimeType);

    const safeBaseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `rooms/${roomCode}/movies/${Date.now()}_${safeBaseName}`;

    // Respect min 5 MB, max 32 MB chunk sizing
    let chunkSize = CHUNK_SIZE_BYTES;
    if (requestedChunkSize && requestedChunkSize >= 5 * 1024 * 1024 && requestedChunkSize <= 32 * 1024 * 1024) {
      chunkSize = requestedChunkSize;
    }

    const totalParts = Math.max(1, Math.ceil(fileSize / chunkSize));

    if (!this.s3Client) {
      // Local dev simulation mode
      return {
        uploadId: `dev-upload-${Date.now()}`,
        key,
        totalParts,
        chunkSize,
        partUrls: Array.from({ length: totalParts }, (_, i) => `/api/movies/mock-part/${i + 1}`),
      };
    }

    const createCommand = new CreateMultipartUploadCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
      ContentType: mimeType || 'video/mp4',
    });

    const createRes = await this.s3Client.send(createCommand);
    const uploadId = createRes.UploadId;

    if (!uploadId) {
      throw new Error('Failed to obtain UploadId from Cloudflare R2 storage');
    }

    // High-speed parallel generation of presigned PUT URLs for all parts
    const partUrls: string[] = await Promise.all(
      Array.from({ length: totalParts }, async (_, i) => {
        const partNumber = i + 1;
        const uploadPartCommand = new UploadPartCommand({
          Bucket: config.R2_BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });

        // 6-hour window for upload
        return getSignedUrl(this.s3Client!, uploadPartCommand, { expiresIn: 21600 });
      })
    );

    return {
      uploadId,
      key,
      totalParts,
      chunkSize,
      partUrls,
    };
  }

  /**
   * Finalizes the multipart upload on Cloudflare R2
   */
  public async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: Array<{ ETag: string; PartNumber: number }>
  ): Promise<{ key: string; playbackUrl: string }> {
    if (!this.s3Client) {
      return {
        key,
        playbackUrl: `/api/movies/mock-stream/${key}`,
      };
    }

    // Query Cloudflare R2 directly for the authoritative list of uploaded parts and their true ETags!
    // This completely prevents "InvalidPart" errors when browser direct CORS masked ETag response headers on 500MB uploads.
    let finalParts = parts;
    try {
      const listRes = await this.s3Client.send(
        new ListPartsCommand({
          Bucket: config.R2_BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
        })
      );
      if (listRes.Parts && listRes.Parts.length > 0) {
        finalParts = listRes.Parts.map((p) => ({
          PartNumber: p.PartNumber!,
          ETag: p.ETag!,
        }));
        console.log(`[MovieService] Verified ${finalParts.length} parts directly from R2 storage.`);
      }
    } catch (listErr: any) {
      console.warn('[MovieService] ListParts notice, using client provided parts:', listErr.message);
    }

    // Sort parts sequentially by part number (strict S3/R2 requirement)
    const sortedParts = finalParts
      .map((p) => ({
        PartNumber: Number(p.PartNumber),
        ETag: p.ETag.replace(/^['"]|['"]$/g, ''), // clean quotation marks if present
      }))
      .sort((a, b) => a.PartNumber - b.PartNumber);

    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    });

    await this.s3Client.send(completeCommand);
    const playbackUrl = await this.getPlaybackUrl(key);

    return { key, playbackUrl };
  }

  /**
   * Aborts an incomplete multipart upload and frees temporary storage
   */
  public async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    if (!this.s3Client) return;

    try {
      const abortCommand = new AbortMultipartUploadCommand({
        Bucket: config.R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
      });
      await this.s3Client.send(abortCommand);
      console.log(`[MovieService] Aborted multipart upload session: ${uploadId} (key: ${key})`);
    } catch (err: any) {
      console.warn(`[MovieService] Warning aborting upload ${uploadId}:`, err.message);
    }
  }

  /**
   * Scans and aborts all stale or abandoned ongoing multipart uploads in Cloudflare R2
   * Frees up all uncommitted multipart chunks older than maxAgeMinutes (default 180 mins so large 500MB uploads are never aborted)
   */
  public async cleanupStaleMultipartUploads(maxAgeMinutes: number = 180): Promise<number> {
    if (!this.s3Client) return 0;

    try {
      const listCommand = new ListMultipartUploadsCommand({
        Bucket: config.R2_BUCKET_NAME,
      });

      const response = await this.s3Client.send(listCommand);
      const uploads = response.Uploads || [];

      if (uploads.length === 0) {
        return 0;
      }

      const cutoffTime = Date.now() - maxAgeMinutes * 60 * 1000;
      let abortedCount = 0;

      for (const upload of uploads) {
        if (!upload.Key || !upload.UploadId) continue;

        const initiatedTime = upload.Initiated ? new Date(upload.Initiated).getTime() : 0;
        const isStale = initiatedTime < cutoffTime || upload.Key.startsWith('benchmark/');

        if (isStale) {
          try {
            await this.s3Client.send(
              new AbortMultipartUploadCommand({
                Bucket: config.R2_BUCKET_NAME,
                Key: upload.Key,
                UploadId: upload.UploadId,
              })
            );
            abortedCount++;
            console.log(`[MovieService] Swept abandoned multipart session: ${upload.Key} (id: ${upload.UploadId})`);
          } catch (abortErr: any) {
            console.warn(`[MovieService] Failed to abort stale upload ${upload.UploadId}:`, abortErr.message);
          }
        }
      }

      if (abortedCount > 0) {
        console.log(`[MovieService] Cleaned up ${abortedCount} stale ongoing multipart upload sessions.`);
      }
      return abortedCount;
    } catch (err: any) {
      console.warn('[MovieService] Sweeper warning (ListMultipartUploads):', err.message);
      return 0;
    }
  }

  /**
   * Generates a secure, short-lived presigned download URL for cinema playback
   */
  public async getPlaybackUrl(key: string, expiresInSeconds: number = 21600): Promise<string> {
    if (!this.s3Client) {
      return `/api/movies/mock-stream/${key}`;
    }

    const command = new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    });

    // Default: 2 hours expiration
    return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Deletes a movie object from Cloudflare R2 upon room closure or deletion
   */
  public async deleteMovie(key: string): Promise<void> {
    if (!this.s3Client) return;

    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: config.R2_BUCKET_NAME,
        Key: key,
      });
      await this.s3Client.send(deleteCommand);
      console.log(`[MovieService] Successfully deleted movie from Cloudflare R2: ${key}`);
    } catch (err: any) {
      console.error(`[MovieService] Error deleting movie key ${key}:`, err.message);
    }
  }

  /**
   * Purges ALL movie objects and in-progress multipart uploads for a given room
   * Called when a host leaves the room, closes the tab, or the room expires
   */
  public async deleteMovieByRoom(roomCode: string): Promise<void> {
    if (!this.s3Client || !config.R2_BUCKET_NAME) return;

    const normalizedCode = roomCode.trim().toUpperCase();
    const prefixes = [
      `rooms/${normalizedCode}/`,
      `rooms/${normalizedCode.toLowerCase()}/`,
    ];

    for (const prefix of prefixes) {
      try {
        // 1. Abort any ongoing multipart uploads under this room prefix
        const listMulti = await this.s3Client.send(
          new ListMultipartUploadsCommand({
            Bucket: config.R2_BUCKET_NAME,
            Prefix: prefix,
          })
        );

        if (listMulti.Uploads && listMulti.Uploads.length > 0) {
          for (const u of listMulti.Uploads) {
            if (u.Key && u.UploadId) {
              await this.abortMultipartUpload(u.Key, u.UploadId);
            }
          }
        }

        // 2. Delete all committed objects under this room prefix
        let continuationToken: string | undefined = undefined;
        do {
          const listObjects: any = await this.s3Client.send(
            new ListObjectsV2Command({
              Bucket: config.R2_BUCKET_NAME,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            })
          );

          if (listObjects.Contents && listObjects.Contents.length > 0) {
            const objectsToDelete = listObjects.Contents.filter((c: any) => c.Key).map((c: any) => ({ Key: c.Key! }));
            if (objectsToDelete.length > 0) {
              await this.s3Client.send(
                new DeleteObjectsCommand({
                  Bucket: config.R2_BUCKET_NAME,
                  Delete: { Objects: objectsToDelete },
                })
              );
              console.log(`[MovieService] Purged ${objectsToDelete.length} movie objects from R2 for prefix ${prefix}`);
            }
          }
          continuationToken = listObjects.IsTruncated ? listObjects.NextContinuationToken : undefined;
        } while (continuationToken);
      } catch (err: any) {
        console.warn(`[MovieService] Warning purging storage for prefix ${prefix}:`, err.message);
      }
    }
  }

  /**
   * Automatic background safety sweeper to prevent exceeding Cloudflare R2's 10 GB free tier.
   * Purges any movie file older than maxAgeHours (default 3 hours).
   */
  public async purgeStaleRoomMovies(maxAgeHours: number = 3): Promise<number> {
    if (!this.s3Client || !config.R2_BUCKET_NAME) return 0;
    try {
      const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
      let continuationToken: string | undefined = undefined;
      let totalPurged = 0;

      do {
        const listObjects: any = await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: config.R2_BUCKET_NAME,
            Prefix: 'rooms/',
            ContinuationToken: continuationToken,
          })
        );

        if (listObjects.Contents && listObjects.Contents.length > 0) {
          const staleObjects = listObjects.Contents
            .filter((c: any) => c.Key && c.LastModified && new Date(c.LastModified).getTime() < cutoff)
            .map((c: any) => ({ Key: c.Key! }));

          if (staleObjects.length > 0) {
            await this.s3Client.send(
              new DeleteObjectsCommand({
                Bucket: config.R2_BUCKET_NAME,
                Delete: { Objects: staleObjects },
              })
            );
            totalPurged += staleObjects.length;
            console.log(`[MovieService] Auto-purged ${staleObjects.length} stale movies (> ${maxAgeHours}h) to protect 10GB limit.`);
          }
        }
        continuationToken = listObjects.IsTruncated ? listObjects.NextContinuationToken : undefined;
      } while (continuationToken);

      return totalPurged;
    } catch (err: any) {
      console.warn('[MovieService] Warning running purgeStaleRoomMovies:', err.message);
      return 0;
    }
  }

  /**
   * HTTP Range video streaming directly from Cloudflare R2 through backend with full CORS support
   */
  public async streamVideo(key: string, rangeHeader: string | undefined, res: Response): Promise<void> {
    if (!this.s3Client || !config.R2_BUCKET_NAME) {
      res.status(500).send('Storage not configured');
      return;
    }

    try {
      // 1. Get object metadata (content length, content type)
      const head = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: config.R2_BUCKET_NAME,
          Key: key,
        })
      );

      const fileSize = head.ContentLength || 0;
      const contentType = head.ContentType || 'video/mp4';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      res.setHeader('Accept-Ranges', 'bytes');

      if (!rangeHeader) {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
        });
        const getCmd = new GetObjectCommand({
          Bucket: config.R2_BUCKET_NAME,
          Key: key,
        });
        const s3Res = await this.s3Client.send(getCmd);
        if (s3Res.Body) {
          (s3Res.Body as any).pipe(res);
        }
        return;
      }

      // 2. Parse Range header (e.g., "bytes=0-1048575")
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).send();
        return;
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      const getCmd = new GetObjectCommand({
        Bucket: config.R2_BUCKET_NAME,
        Key: key,
        Range: `bytes=${start}-${end}`,
      });

      const s3Res = await this.s3Client.send(getCmd);
      if (s3Res.Body) {
        (s3Res.Body as any).pipe(res);
      }
    } catch (err: any) {
      console.error('[MovieService] Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).send('Streaming error');
      }
    }
  }
}

export const movieService = new MovieService();
