const admin = require('firebase-admin');
const logger = require('../utils/logger');

let initialized = false;

function initFirebase() {
  if (initialized) return admin;

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  initialized = true;
  logger.info('Firebase Admin SDK initialized');
  return admin;
}

/**
 * Verify a Firebase ID token and return the decoded token claims.
 */
async function verifyFirebaseToken(idToken) {
  const app = initFirebase();
  return app.auth().verifyIdToken(idToken);
}

/**
 * Push a real-time notification to a user's Firebase Realtime Database path.
 * Path: /notifications/{userId}/{notificationId}
 */
async function pushRealtimeNotification(userId, notification) {
  const app = initFirebase();
  const db = app.database();
  const ref = db.ref(`notifications/${userId}`).push();
  await ref.set({
    ...notification,
    id: ref.key,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    isRead: false,
  });
  return ref.key;
}

module.exports = { initFirebase, verifyFirebaseToken, pushRealtimeNotification };
