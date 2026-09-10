require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  database: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/lovydate',
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '15', 10),
    statementTimeoutMs: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '5000', 10),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'lovydate_jwt_secret_dev_key',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '30', 10),
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'https://minio.lovydate.fun',
    bucket: process.env.S3_BUCKET || 'images',
    accessKey: process.env.S3_ACCESS_KEY || 'lovydate-app',
    secretKey: process.env.S3_SECRET_KEY || '',
    region: process.env.S3_REGION || 'us-east-1',
    // Endpoint, bucket and access key have LovyDate defaults. A secret key is
    // the signal that object storage is intentionally configured.
    configured: Boolean(process.env.S3_SECRET_KEY),
  },
  media: {
    publicUrl: process.env.PUBLIC_MEDIA_URL || `${process.env.PUBLIC_URL || 'https://server.lovydate.fun'}/api/v1/media`,
  },
};
