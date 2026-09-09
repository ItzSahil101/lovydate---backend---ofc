const { S3Client } = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const https = require('https');
const http = require('http');
const env = require('../../config/env');

// Allow self-signed certificates for custom S3/MinIO endpoints unless strictly enforced
const rejectUnauthorized = process.env.S3_SSL_REJECT_UNAUTHORIZED === 'true';

const httpsAgent = new https.Agent({
  rejectUnauthorized,
  keepAlive: true,
});

const httpAgent = new http.Agent({
  keepAlive: true,
});

const s3Client = new S3Client({
  endpoint: env.s3.endpoint,
  region: env.s3.region || 'us-east-1',
  credentials: {
    accessKeyId: env.s3.accessKey || '',
    secretAccessKey: env.s3.secretKey || '',
  },
  forcePathStyle: true,
  requestHandler: new NodeHttpHandler({
    httpsAgent,
    httpAgent,
  }),
});

module.exports = {
  s3Client,
};
