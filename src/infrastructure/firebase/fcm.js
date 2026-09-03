require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { query } = require('../database/pool');

let firebaseApp = null;

function initFirebase() {
  if (firebaseApp || getApps().length > 0) {
    firebaseApp = getApps()[0];
    return;
  }

  try {
    let serviceAccount = null;

    // 1. Check direct FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVIC_ACCOUNT in env (JSON string or file path)
    const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVIC_ACCOUNT;
    if (rawEnv) {
      let raw = rawEnv.trim();
      if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
        raw = raw.slice(1, -1).trim();
      }

      if (raw.startsWith('{')) {
        serviceAccount = JSON.parse(raw);
      } else {
        const resolvedPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
        if (fs.existsSync(resolvedPath)) {
          serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        }
      }
    }

    // 2. Check GOOGLE_APPLICATION_CREDENTIALS
    if (!serviceAccount && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const gPath = path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
        ? process.env.GOOGLE_APPLICATION_CREDENTIALS
        : path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (fs.existsSync(gPath)) {
        serviceAccount = JSON.parse(fs.readFileSync(gPath, 'utf8'));
      }
    }

    // 3. Check local default file in backend root
    if (!serviceAccount) {
      const defaultPaths = [
        path.resolve(process.cwd(), 'serviceAccountKey.json'),
        path.resolve(process.cwd(), 'firebase-service-account.json'),
        path.resolve(__dirname, '../../../serviceAccountKey.json'),
      ];
      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
          break;
        }
      }
    }

    if (serviceAccount) {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log('✅ Firebase Admin SDK initialized successfully');
      return;
    }

    console.log('ℹ️ Firebase Admin SDK: No credentials in environment yet, push notifications will operate in staging mode.');
  } catch (err) {
    console.warn('⚠️ Firebase Admin SDK initialization error:', err.message);
  }
}

let tableEnsured = false;
async function ensureUserDevicesTable() {
  if (tableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS user_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_token TEXT NOT NULL,
        platform VARCHAR(32) DEFAULT 'android',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, device_token)
      );
      CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_devices_device_token ON user_devices(device_token);
    `);
    tableEnsured = true;
  } catch (err) {
    // Non-fatal if table already exists or migrations handle it
  }
}

async function saveDeviceToken(userId, deviceToken, platform = 'android') {
  if (!userId || !deviceToken) return;
  try {
    await ensureUserDevicesTable();
    // 1. Remove this device token from other users (e.g. previous logged-out account on same device)
    await query(
      `DELETE FROM user_devices WHERE device_token = $1 AND user_id != $2`,
      [deviceToken, userId]
    );

    // 2. Upsert token for current user
    await query(
      `INSERT INTO user_devices (user_id, device_token, platform, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, device_token) DO UPDATE SET updated_at = NOW(), platform = $3`,
      [userId, deviceToken, platform]
    );
  } catch (err) {
    console.error('Error saving device token:', err);
  }
}

async function removeDeviceToken(userId, deviceToken) {
  try {
    await query(
      `DELETE FROM user_devices WHERE user_id = $1 AND device_token = $2`,
      [userId, deviceToken]
    );
  } catch (err) {
    console.error('Error removing device token:', err);
  }
}

async function sendPushToUser(userId, { title, body, data = {} }) {
  try {
    await ensureUserDevicesTable();
    const res = await query(
      `SELECT DISTINCT device_token FROM user_devices WHERE user_id = $1 AND device_token IS NOT NULL`,
      [userId]
    );
    if (res.rows.length === 0) return;

    // Deduplicate tokens
    const tokens = [...new Set(res.rows.map((r) => r.device_token).filter(Boolean))];
    if (tokens.length === 0) return;

    if (firebaseApp || getApps().length > 0) {
      const messaging = getMessaging(firebaseApp || getApps()[0]);
      const message = {
        tokens,
        notification: {
          title,
          body,
        },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v ?? '')])
        ),
      };
      const response = await messaging.sendEachForMulticast(message);
      console.log(`[FCM] Sent push notification to ${userId}: ${response.successCount} success, ${response.failureCount} failed`);
    } else {
      console.log(`[FCM Mock] Push notification for ${userId}: "${title}" - "${body}" (Tokens: ${tokens.length})`);
    }
  } catch (err) {
    console.warn(`[FCM] Push send error for user ${userId}:`, err.message);
  }
}

async function broadcastPushNotification({ title, body, data = {}, userIds = null }) {
  try {
    await ensureUserDevicesTable();
    let sql = `SELECT DISTINCT device_token FROM user_devices WHERE device_token IS NOT NULL`;
    const params = [];
    if (userIds && Array.isArray(userIds)) {
      if (userIds.length === 0) {
        console.log(`[FCM Broadcast] Empty audience list for "${title}", skipped.`);
        return { totalTokens: 0, sent: 0 };
      }
      params.push(userIds);
      sql += ` AND user_id = ANY($1::uuid[])`;
    }
    const res = await query(sql, params);
    if (res.rows.length === 0) {
      console.log(`[FCM Broadcast] No device tokens found to receive broadcast "${title}"`);
      return { totalTokens: 0, sent: 0 };
    }

    const tokens = [...new Set(res.rows.map((r) => r.device_token).filter(Boolean))];
    if (tokens.length === 0) return { totalTokens: 0, sent: 0 };

    if (firebaseApp || getApps().length > 0) {
      const messaging = getMessaging(firebaseApp || getApps()[0]);
      for (let i = 0; i < tokens.length; i += 500) {
        const chunk = tokens.slice(i, i + 500);
        const message = {
          tokens: chunk,
          notification: { title, body },
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])),
        };
        await messaging.sendEachForMulticast(message);
      }
      console.log(`[FCM Broadcast] Broadcasted "${title}" to ${tokens.length} distinct devices.`);
    } else {
      console.log(`[FCM Broadcast] Staging broadcast: "${title}" to ${tokens.length} distinct devices.`);
    }
    return { totalTokens: tokens.length, sent: tokens.length };
  } catch (err) {
    console.error('[FCM Broadcast] Error broadcasting push:', err);
    return { error: err.message };
  }
}

module.exports = {
  saveDeviceToken,
  removeDeviceToken,
  sendPushToUser,
  broadcastPushNotification,
};
