const firebaseConfig = {
  apiKey: "AIzaSyD2zvFkZbS4uSzJaPuTG0Rq9Pu9YsdB_Bg",
  authDomain: "cpserc-attendance-44b10.firebaseapp.com",
  projectId: "cpserc-attendance-44b10",
  storageBucket: "cpserc-attendance-44b10.firebasestorage.app",
  messagingSenderId: "871570128771",
  appId: "1:871570128771:web:06428c4ff449c4b51a00b6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

const ADMIN_USERNAME = "CPSERC.rizal";
const ADMIN_PASSWORD = "CPSERC-nurmalbeoneofthesecurityforsafetyofcsfjrizalphmantleforawhilejustwait";