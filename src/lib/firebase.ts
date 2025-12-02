import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyBgFrnYEhFA-UubYMxPNhGllXwPcrET5aw",
  authDomain: "viewfindr-233b0.firebaseapp.com",
  projectId: "viewfindr-233b0",
  storageBucket: "viewfindr-233b0.firebasestorage.app",
  messagingSenderId: "379704472200",
  appId: "1:379704472200:web:04e4b10648c37e1848253d",
  measurementId: "G-VFK6G47T45"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics - only initialize in browser and if supported
export const analyticsPromise = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);

