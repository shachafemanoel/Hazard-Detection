import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import { createClient } from 'redis';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Redis client
let redisClient;
let isRedisConnected = false;

if (process.env.REDIS_HOST && process.env.REDIS_PASSWORD) {
  redisClient = createClient({
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT) || 6379,
      connectTimeout: 10000,
    },
  });

  redisClient
    .connect()
    .then(() => {
      isRedisConnected = true;
      console.log('✅ ReportUploadService: Connected to Redis');
    })
    .catch((err) => {
      console.error('🔥 ReportUploadService: Failed to connect to Redis:', err);
    });
} else {
  console.log('⚠️ ReportUploadService: Redis not configured.');
}

/**
 * Uploads a report to Cloudinary and saves the metadata to Redis.
 *
 * @param {object} options - The options for the upload.
 * @param {object} options.file - The file object from multer (containing a buffer).
 * @param {string} options.file.buffer - The image buffer.
 * @param {string} options.filename - The name for the uploaded file.
 * @param {object} options.metadata - The report metadata.
 * @returns {Promise<object>} The full report object.
 */
export async function uploadReport({ file, filename, metadata }) {
  if (!file || !file.buffer) {
    throw new Error('A file buffer is required.');
  }

  // 1. Upload to Cloudinary
  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'detections',
        public_id: filename,
        resource_type: 'image',
        transformation: [{ quality: 'auto:good' }, { fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });

  if (!uploadResult || !uploadResult.secure_url) {
    throw new Error('Failed to upload image to Cloudinary.');
  }

  // 2. Create the report object
  const reportId = Date.now();
  const report = {
    id: reportId,
    ...metadata,
    image: {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      width: uploadResult.width,
      height: uploadResult.height,
    },
    createdAt: new Date().toISOString(),
  };

  // 3. Store in Redis
  if (isRedisConnected) {
    try {
      const reportKey = `report:${reportId}`;
      await redisClient.json.set(reportKey, '$', report);
      console.log(`💾 Report saved to Redis: ${reportKey}`);
    } catch (err) {
      console.error('🔥 Failed to save report to Redis:', err);
      // Decide if this should be a fatal error or just a warning
      // For now, we'll just log it and continue.
    }
  } else {
    console.log('⚠️ Redis not connected. Report not saved.');
  }

  // 4. Return the full report object
  return report;
}
