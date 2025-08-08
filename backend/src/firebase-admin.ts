import admin from 'firebase-admin';

// Initialize Firebase Admin SDK using environment variables
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID || "abouschedule",
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CERT_URL
};

// Debug: Log environment variables (remove this after testing)
console.log('Firebase Config Debug:', {
  project_id: process.env.FIREBASE_PROJECT_ID,
  has_private_key: !!process.env.FIREBASE_PRIVATE_KEY,
  has_client_email: !!process.env.FIREBASE_CLIENT_EMAIL,
  has_client_id: !!process.env.FIREBASE_CLIENT_ID,
  has_cert_url: !!process.env.FIREBASE_CERT_URL
});

// Validate required environment variables
const requiredVars = [
  'FIREBASE_PRIVATE_KEY_ID',
  'FIREBASE_PRIVATE_KEY', 
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'FIREBASE_CERT_URL'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('Missing Firebase environment variables:', missingVars);
  console.error('All environment variables:', Object.keys(process.env).filter(key => key.startsWith('FIREBASE')));
  // Don't throw error for now, just log
  console.log('Continuing without Firebase validation...');
}

// Initialize the app only if we have all required variables
const hasAllVars = requiredVars.every(varName => process.env[varName]);
if (hasAllVars && !admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
  }
} else {
  console.log('Firebase Admin SDK not initialized - missing environment variables');
}

export default admin; 