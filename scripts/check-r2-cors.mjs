import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } from '../server/node_modules/@aws-sdk/client-s3/dist-cjs/index.js';
import fs from 'fs';

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

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

async function main() {
  const bucket = env.R2_BUCKET_NAME || '2gether-movies';
  console.log(`Checking CORS for bucket: ${bucket}`);

  try {
    const cors = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log('Current CORS configuration:');
    console.log(JSON.stringify(cors.CORSRules, null, 2));
  } catch (err) {
    console.log(`GetBucketCors failed: [${err.name}] ${err.message}`);

    console.log('Attempting to apply CORS configuration via S3 PutBucketCors API...');
    try {
      const putResult = await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [
                  'http://localhost:5173',
                  'http://127.0.0.1:5173',
                  'http://localhost:4000',
                  'http://127.0.0.1:4000',
                ],
                AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST', 'DELETE'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        })
      );
      console.log('PutBucketCors succeeded via S3 API!', putResult);
    } catch (putErr) {
      console.log(`PutBucketCors failed via S3 API: [${putErr.name}] ${putErr.message}`);
    }
  }
}

main().catch(console.error);
