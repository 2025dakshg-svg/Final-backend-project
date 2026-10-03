const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let enabled = false;

function getServiceAccount() {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (filePath) {
    const candidatePaths = [
      filePath,
      path.resolve(process.cwd(), filePath),
      path.resolve(__dirname, '..', '..', filePath),
      path.resolve(__dirname, '..', '..', '..', filePath),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      projectId: projectId,
      clientEmail: clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

function initFirebase() {
  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    console.log('Firebase not configured, push notifications are disabled');
    return;
  }

  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    enabled = true;
    console.log('Firebase connected');
  } catch (err) {
    console.log('Firebase init failed: ' + err.message);
  }
}

function isFirebaseReady() {
  return enabled;
}

async function verifyIdToken(idToken) {
  return admin.auth().verifyIdToken(idToken);
}

async function sendPushToToken(token, title, body, data) {
  if (!enabled || !token) return { skipped: true };

  return admin.messaging().send({
    token: token,
    notification: { title: title, body: body },
    data: data || {},
  });
}

module.exports = { initFirebase, isFirebaseReady, verifyIdToken, sendPushToToken };
