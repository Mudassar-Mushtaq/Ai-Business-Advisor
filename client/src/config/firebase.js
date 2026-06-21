import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBhVrrOndmUPlS7WRSsvnez9XcvDATRzS4",
  authDomain: "ai-bussiness-advisor.firebaseapp.com",
  projectId: "ai-bussiness-advisor",
  storageBucket: "ai-bussiness-advisor.firebasestorage.app",
  messagingSenderId: "1065173931718",
  appId: "1:1065173931718:web:64f64e4471a18156dfa9c7",
  measurementId: "G-YWFM9ZLV04",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
