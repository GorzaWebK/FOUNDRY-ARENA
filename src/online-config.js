// Online services. Leave FIREBASE_CONFIG as null and the game uses its built-in
// peer-to-peer lobby for public rooms and the leaderboard (works with no setup,
// but it's only as trustworthy as the players). Put a Firebase project's web
// config here and the leaderboard and room list move to Firebase, guarded by the
// server-side rules in firebase/database.rules.json. Setup steps: README,
// "Online backend (Firebase)".
//
// These values are not secret: every Firebase web app ships them to the browser.
// What protects the data is the database rules.

export const FIREBASE_CONFIG = null;
// export const FIREBASE_CONFIG = {
//   apiKey: '...',
//   authDomain: 'your-project.firebaseapp.com',
//   databaseURL: 'https://your-project-default-rtdb.firebaseio.com',
//   projectId: 'your-project',
//   appId: '...',
// };
