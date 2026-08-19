// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDKNg9FT3Dfx5OV9KmyVIOrezYkydugQgc",
  authDomain: "cpserc-attendance-5f22e.firebaseapp.com",
  projectId: "cpserc-attendance-5f22e",
  storageBucket: "cpserc-attendance-5f22e.firebasestorage.app",
  messagingSenderId: "948999206182",
  appId: "1:948999206182:web:41a6d9b6e175295b803de7",
  measurementId: "G-39CK6JCZEG"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);