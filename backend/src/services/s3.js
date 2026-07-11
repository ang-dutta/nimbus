const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  // LocalStack support for local dev
  ...(process.env.S3_ENDPOINT && {
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
  }),
});

const BUCKET = process.env.S3_BUCKET_NAME;

/**
 * Generate a presigned PUT URL for direct client-to-S3 upload.
 * The file key is returned — it should be stored in the DB.
 */
async function generateUploadUrl(s3Key, contentType, expiresIn = 300) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}

/**
 * Generate a presigned GET URL for downloading/previewing a file.
 * Default expiry: 15 minutes.
 */
async function generateDownloadUrl(s3Key, expiresIn = 900, filename = null) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ...(filename && {
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    }),
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned GET URL for in-browser preview (no forced download).
 */
async function generatePreviewUrl(s3Key, expiresIn = 900) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete an S3 object by key.
 */
async function deleteObject(s3Key) {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key });
  await s3Client.send(command);
  logger.info(`S3 object deleted: ${s3Key}`);
}

/**
 * Check if an S3 object exists and get its metadata.
 */
async function headObject(s3Key) {
  try {
    const command = new HeadObjectCommand({ Bucket: BUCKET, Key: s3Key });
    return await s3Client.send(command);
  } catch (err) {
    if (err.name === 'NotFound') return null;
    throw err;
  }
}

/**
 * Build the versioned S3 key for a file version.
 * e.g. files/{fileId}/v{versionNumber}/{originalFileName}
 */
function buildVersionedKey(fileId, versionNumber, fileName) {
  return `files/${fileId}/v${versionNumber}/${fileName}`;
}

module.exports = {
  generateUploadUrl,
  generateDownloadUrl,
  generatePreviewUrl,
  deleteObject,
  headObject,
  buildVersionedKey,
};
