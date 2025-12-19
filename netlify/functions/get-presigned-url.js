// netlify/functions/get-presigned-url.js
const { S3 } = require('aws-sdk');

const s3 = new S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  signatureVersion: 'v4',
  s3ForcePathStyle: true,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME_STUDENTS_TEACHERS || 'teachersandlearners';


exports.handler = async (event) => {
  const { filename = 'file.bin', type = 'application/octet-stream' } =
        event.queryStringParameters || {};

  // Store directly in the bucket root (no "uploads/" prefix)
  const key = filename;


// Allow client to ask for a longer expiry for large single-PUT uploads.
// Clamp between 10 minutes and 6 hours so it can't be abused.
const ask = Number((event.queryStringParameters || {}).expires);
const expires = Number.isFinite(ask)
  ? Math.max(600, Math.min(21600, ask)) // 600s..21600s (6h)
  : 3600; // default 1 hour

const url = await s3.getSignedUrlPromise('putObject', {
  Bucket:      BUCKET,
  Key:         key,
  ContentType: type,
  Expires:     expires,
});



  return {
    statusCode: 200,
    body: JSON.stringify({ url, key }),
    headers: { 'Content-Type': 'application/json' },
  };
};
