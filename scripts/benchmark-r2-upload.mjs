/**
 * Benchmark Script: Cloudflare R2 Multipart Upload Optimization
 * Compares Chunk Sizes (10 MB, 16 MB, 32 MB) and Concurrency (Sequential vs 3 vs 4)
 */

import fs from 'fs';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand
} from '../server/node_modules/@aws-sdk/client-s3/dist-cjs/index.js';
import { getSignedUrl } from '../server/node_modules/@aws-sdk/s3-request-presigner/dist-cjs/index.js';

const envContent = fs.readFileSync('server/.env', 'utf-8');
const env = Object.fromEntries(
  envContent
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.substring(0, idx).trim(), l.substring(idx + 1).trim()];
    })
);

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = env.R2_BUCKET_NAME || '2gether-movies';

async function performUploadBenchmark({ testFileSizeMB, chunkSizeMB, concurrency }) {
  const fileSizeBytes = testFileSizeMB * 1024 * 1024;
  const chunkSizeBytes = chunkSizeMB * 1024 * 1024;
  const totalParts = Math.max(1, Math.ceil(fileSizeBytes / chunkSizeBytes));
  const key = `benchmark/test_${Date.now()}_${chunkSizeMB}MB_c${concurrency}.bin`;

  // 1. Create multipart upload
  const createRes = await s3Client.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: 'application/octet-stream',
    })
  );
  const uploadId = createRes.UploadId;

  // 2. Presign URLs in parallel
  const presignStart = performance.now();
  const partUrls = await Promise.all(
    Array.from({ length: totalParts }, async (_, i) => {
      const partNumber = i + 1;
      const cmd = new UploadPartCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      return getSignedUrl(s3Client, cmd, { expiresIn: 3600 });
    })
  );
  const presignDurationMs = performance.now() - presignStart;

  // 3. Prepare chunks
  const dummyChunk = Buffer.alloc(chunkSizeBytes, 'X');

  // 4. Upload parts with concurrency
  const uploadStart = performance.now();
  const completedParts = [];
  const partQueue = Array.from({ length: totalParts }, (_, i) => i + 1);

  async function worker() {
    while (partQueue.length > 0) {
      const partNumber = partQueue.shift();
      const partUrl = partUrls[partNumber - 1];
      const start = (partNumber - 1) * chunkSizeBytes;
      const currentChunkSize = Math.min(chunkSizeBytes, fileSizeBytes - start);
      const chunkData = currentChunkSize === chunkSizeBytes ? dummyChunk : dummyChunk.subarray(0, currentChunkSize);

      const res = await fetch(partUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunkData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed for part ${partNumber}: HTTP ${res.status}`);
      }

      const etag = (res.headers.get('ETag') || res.headers.get('etag') || '').replace(/^['"]|['"]$/g, '');
      completedParts.push({ PartNumber: partNumber, ETag: etag });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, totalParts) }, () => worker());
  await Promise.all(workers);
  const uploadDurationMs = performance.now() - uploadStart;

  // 5. Complete multipart upload
  completedParts.sort((a, b) => a.PartNumber - b.PartNumber);
  await s3Client.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: completedParts },
    })
  );

  // 6. Clean up benchmark object
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );

  const speedMBs = (testFileSizeMB / (uploadDurationMs / 1000)).toFixed(2);
  return {
    testFileSizeMB,
    chunkSizeMB,
    concurrency,
    totalParts,
    presignDurationMs: presignDurationMs.toFixed(1),
    uploadDurationMs: uploadDurationMs.toFixed(1),
    speedMBs,
  };
}

async function runAllBenchmarks() {
  console.log('========================================================================');
  console.log('⚡ CLOUDFLARE R2 MULTIPART UPLOAD PERFORMANCE BENCHMARK');
  console.log('========================================================================\n');

  const configs = [
    // Baseline: Old sequential upload (Concurrency 1, 10 MB chunks)
    { testFileSizeMB: 50, chunkSizeMB: 10, concurrency: 1, label: 'Baseline: Sequential (10 MB chunks)' },
    // Optimized: Parallel 3 workers (10 MB chunks)
    { testFileSizeMB: 50, chunkSizeMB: 10, concurrency: 3, label: 'Optimized: 3x Parallel (10 MB chunks)' },
    // Optimized: Parallel 3 workers (16 MB chunks)
    { testFileSizeMB: 50, chunkSizeMB: 16, concurrency: 3, label: 'Optimized: 3x Parallel (16 MB chunks)' },
    // Optimized: Parallel 4 workers (16 MB chunks)
    { testFileSizeMB: 50, chunkSizeMB: 16, concurrency: 4, label: 'Optimized: 4x Parallel (16 MB chunks)' },
    // Optimized: Parallel 3 workers (32 MB chunks)
    { testFileSizeMB: 50, chunkSizeMB: 32, concurrency: 3, label: 'Optimized: 3x Parallel (32 MB chunks)' },
  ];

  const results = [];

  for (const cfg of configs) {
    console.log(`Running benchmark: ${cfg.label}...`);
    try {
      const res = await performUploadBenchmark(cfg);
      results.push({ ...cfg, ...res });
      console.log(` -> Completed in ${(res.uploadDurationMs / 1000).toFixed(2)}s | Speed: ${res.speedMBs} MB/s | Presign: ${res.presignDurationMs}ms\n`);
    } catch (err) {
      console.error(` -> Failed: ${err.message}\n`);
    }
  }

  console.log('========================================================================');
  console.log('📊 BENCHMARK COMPARISON TABLE (50 MB Test Video)');
  console.log('========================================================================');
  console.log('| Configuration                       | Chunks | Concurrency | Time (s) | Speed (MB/s) | Speedup |');
  console.log('|-------------------------------------|--------|-------------|----------|--------------|---------|');

  const baselineTime = results[0] ? parseFloat(results[0].uploadDurationMs) : 1;

  for (const r of results) {
    const timeSec = (parseFloat(r.uploadDurationMs) / 1000).toFixed(2);
    const speedup = (baselineTime / parseFloat(r.uploadDurationMs)).toFixed(2) + 'x';
    const labelPad = r.label.padEnd(35);
    const chunksPad = String(r.totalParts).padStart(6);
    const concPad = String(r.concurrency).padStart(11);
    const timePad = timeSec.padStart(8);
    const speedPad = (r.speedMBs + ' MB/s').padStart(12);
    const speedupPad = speedup.padStart(7);
    console.log(`| ${labelPad} | ${chunksPad} | ${concPad} | ${timePad} | ${speedPad} | ${speedupPad} |`);
  }
  console.log('========================================================================\n');
}

runAllBenchmarks().catch(console.error);
