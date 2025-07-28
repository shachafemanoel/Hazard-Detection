import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load service account from file or environment variables
let serviceAccount;

try {
  // Try to read from multiple possible locations
  const possiblePaths = [
    path.join(__dirname, "../serviceAccountKey.json"),
    path.join(__dirname, "../../serviceAccountKey.json"),
    "./serviceAccountKey.json"
  ];
  
  let serviceAccountPath = null;
  for (const filePath of possiblePaths) {
    try {
      if (readFileSync(filePath, "utf-8")) {
        serviceAccountPath = filePath;
        break;
      }
    } catch (e) {
      // Continue trying other paths
    }
  }
  
  if (serviceAccountPath) {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
    console.log(`✅ Firebase service account loaded from: ${serviceAccountPath}`);
  } else {
    throw new Error("Service account file not found");
  }
} catch (error) {
  // Fallback to environment variables
  console.log("⚠️ Service account file not found, using environment variables");
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Create service account from individual env vars
    serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID || "hazard-detection-cf392",
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
    };
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "hazard-detection-cf392.appspot.com"
});
console.log("✅ Firebase Admin initialized (Firestore + Storage)");

export const db = admin.firestore();
export const bucket = admin.storage().bucket();
