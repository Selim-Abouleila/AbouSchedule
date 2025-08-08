import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCSbHXaKndxWg_oiUsQz-f2oN_X1Sqlm-Y",
  authDomain: "abouschedule.firebaseapp.com",
  projectId: "abouschedule",
  storageBucket: "abouschedule.firebasestorage.app",
  messagingSenderId: "306741580359",
  appId: "1:306741580359:web:db97a506b0ca7bef189762",
  measurementId: "G-RM60EE50BL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging
const messaging = getMessaging(app);

export { messaging, getToken, onMessage }; 