import 'dotenv/config';
import { s3Client } from './src/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

async function run() {
  const data = readFileSync('./some-local-image.jpg');
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: 'test-folder/test.jpg',
      Body: data,
      ContentType: 'image/jpeg',
    }));
    console.log('✅ Upload succeeded');
  } catch (err) {
    console.error('❌ Upload failed', err);
  }
}

run();
