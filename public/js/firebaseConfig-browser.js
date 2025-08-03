// Firebase configuration for browser compatibility
// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDnOyo4XtWdbyb_X2nTa-qVLVLvrGw4t3k",
  authDomain: "hazard-detection-cf392.firebaseapp.com",
  projectId: "hazard-detection-cf392",
  storageBucket: "hazard-detection-cf392.appspot.com",
  messagingSenderId: "617952034976",
  appId: "1:617952034976:web:e88bec86deb03e19806681",
  measurementId: "G-7XW2Z26JQ5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Make Firebase utilities globally available
if (typeof window !== 'undefined') {
  window.db = db;
  window.storage = storage;
  window.ref = ref;
  window.uploadBytes = uploadBytes;
  window.getDownloadURL = getDownloadURL;
}

console.log("🔥 Firebase initialized successfully");