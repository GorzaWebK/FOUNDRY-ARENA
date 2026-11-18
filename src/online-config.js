// Online services. Leave FIREBASE_CONFIG as null and the game uses its built-in
// peer-to-peer lobby for public rooms and the leaderboard (works with no setup,
// but it's only as trustworthy as the players). Put a Firebase project's web
// config here and the leaderboard and room list move to Firebase, guarded by the
// server-side rules in firebase/database.rules.json. Setup steps: README,
// "Online backend (Firebase)".
//
// These values are not secret: every Firebase web app ships them to the browser.
// What protects the data is the database rules.

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAZbpZCxU6cykOywHHvSqpnRiAxfkaEuEU',
  authDomain: 'foundry-arena.firebaseapp.com',
  databaseURL: 'https://foundry-arena-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'foundry-arena',
  storageBucket: 'foundry-arena.firebasestorage.app',
  messagingSenderId: '690371517667',
  appId: '1:690371517667:web:bb6fcab88afa90b13c39d6',
};
