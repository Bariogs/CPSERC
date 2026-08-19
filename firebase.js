// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBou2Fgw7Zj5YVFVkLebSfZ9FbazHafANw",
  authDomain: "cpserc-attendance-a82f7.firebaseapp.com",
  projectId: "cpserc-attendance-a82f7",
  storageBucket: "cpserc-attendance-a82f7.firebasestorage.app",
  messagingSenderId: "881558379605",
  appId: "1:881558379605:web:bc236be22604e4a63788dc",
  measurementId: "G-YZ4KYGM5DL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);