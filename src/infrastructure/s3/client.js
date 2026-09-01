const { S3Client } = require('@aws-sdk/client-s3');
const env = require('../../config/env');

const s3Client = new S3Client({
  endpoint: env.s3.endpoint,
  region: env.s3.region || 'us-east-1',
  credentials: {
    accessKeyId: env.s3.accessKey || '',
    secretAccessKey: env.s3.secretKey || '',
  },
  forcePathStyle: true,
});

module.exports = {
  s3Client,
};
