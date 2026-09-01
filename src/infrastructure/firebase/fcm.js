const admin = require('firebase-admin');
const { query } = require('../database/pool');

let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK initialized via Application Default Credentials');
    } else {
      console.log('ℹ️ Firebase Admin SDK: No credentials in environment yet, push notifications will operate in staging mode.');
    }
  } catch (err) {
    console.warn('⚠️ Firebase Admin SDK initialization error:', err.message);
  }
}

initFirebase();

async function saveDeviceToken(userId, deviceToken, platform = 'android') {
  if (!userId || !deviceToken) return;
  try {
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
    const res = await query(
      `SELECT device_token FROM user_devices WHERE user_id = $1`,
      [userId]
    );
    if (res.rows.length === 0) return;

    const tokens = res.rows.map((r) => r.device_token);

    if (firebaseInitialized && admin.apps.length > 0) {
      const message = {
        tokens,
        notification: {
          title,
          body,
        },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      };
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`[FCM] Sent push notification to ${userId}: ${response.successCount} success`);
    } else {
      console.log(`[FCM Mock] Push notification for ${userId}: "${title}" - "${body}" (Tokens: ${tokens.length})`);
    }
  } catch (err) {
    console.warn(`[FCM] Push send error for user ${userId}:`, err.message);
  }
}

module.exports = {
  saveDeviceToken,
  removeDeviceToken,
  sendPushToUser,
};
