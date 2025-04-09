import admin from "firebase-admin";
import { readFileSync } from "fs";

// קריאה של קובץ service account (הורד מה-Firebase Console → Settings → Service accounts)
const serviceAccount = JSON.parse(
  readFileSync("./server/serviceAccountKey.json", "utf-8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "hazard-detection-cf392.appspot.com"
});
console.log("✅ Firebase Admin initialized (Firestore + Storage)");

export const db = admin.firestore();
export const bucket = admin.storage().bucket();
