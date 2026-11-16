import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import { MovieMetadata } from '../types/index.js';

export const MAX_FILE_SIZE_BYTES = 700 * 1024 * 1024; // 700 MB
export const CHUNK_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per part

export class MovieService {
  private s3Client: S3Client | null = null;

  constructor() {
    if (config.hasR2) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.R2_ACCESS_KEY_ID!,
          secretAccessKey: config.R2_SECRET_ACCESS_KEY!,
        },
      });
    }
  }

  /**
   * Initializes a multipart upload session for files up to 700MB
   */
  public async initMultipartUpload(
    roomCode: string,
    fileName: string,
    fileSize: number,
    mimeType: string
  ): Promise<{ uploadId: string; key: string; totalParts: number; partUrls: string[] }> {
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size ${fileSize} exceeds maximum limit of 700 MB`);
    }

    const key = `rooms/${roomCode}/movie_${Date.now()}_${encodeURIComponent(fileName)}`;
    const totalParts = Math.ceil(fileSize / CHUNK_SIZE_BYTES);

    if (!this.s3Client) {
      // In dev fallback mode when R2 credentials are not yet configured:
      // Return structured response with mock URLs so upload workflow can be validated
      return {
        uploadId: `dev-upload-${Date.now()}`,
        key,
        totalParts,
        partUrls: Array.from({ length: totalParts }, (_, i) => `/api/movies/mock-part/${i + 1}`),
      };
    }

    const createCommand = new CreateMultipartUploadCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
    });

    const createRes = await this.s3Client.send(createCommand);
    const uploadId = createRes.UploadId;

    if (!uploadId) {
      throw new Error('Failed to obtain UploadId from storage provider');
    }

    // Generate presigned URLs for each chunk
    const partUrls: string[] = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const uploadPartCommand = new UploadPartCommand({
        Bucket: config.R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });

      const signedUrl = await getSignedUrl(this.s3Client, uploadPartCommand, { expiresIn: 3600 });
      partUrls.push(signedUrl);
    }

    return { uploadId, key, totalParts, partUrls };
  }

  /**
   * Finalizes the multipart upload
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

    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    });

    await this.s3Client.send(completeCommand);
    const playbackUrl = await this.getPlaybackUrl(key);

    return { key, playbackUrl };
  }

  /**
   * Generates a signed playback URL for the cinema screen
   */
  public async getPlaybackUrl(key: string): Promise<string> {
    if (!this.s3Client) {
      return `/api/movies/mock-stream/${key}`;
    }

    const command = new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    });

    // 4-hour playback window
    return await getSignedUrl(this.s3Client, command, { expiresIn: 14400 });
  }

  /**
   * Deletes a movie from Cloudflare R2 upon room closure or manual deletion
   */
  public async deleteMovie(key: string): Promise<void> {
    if (!this.s3Client) return;

    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: config.R2_BUCKET_NAME,
        Key: key,
      });
      await this.s3Client.send(deleteCommand);
      console.log(`[MovieService] Deleted movie storage key: ${key}`);
    } catch (err) {
      console.error(`[MovieService] Error deleting key ${key}:`, err);
    }
  }
}

export const movieService = new MovieService();
