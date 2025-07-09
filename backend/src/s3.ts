// s3.ts
import { S3Client } from '@aws-sdk/client-s3';

export const s3Client = new S3Client({
  // 1️⃣ Prefer the env var you added in Railway / .env …
  region: process.env.AWS_REGION
          // 2️⃣ … and fall back to the SAME region as your bucket
          ?? 'eu-north-1',                 // ← Stockholm, where abou-schedule-photos lives
  // endpoint: 'https://<accountid>.r2.cloudflarestorage.com', // only for R2/MinIO
  // forcePathStyle: true,
});
