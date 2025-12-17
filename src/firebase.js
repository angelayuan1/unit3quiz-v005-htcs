import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

function requiredEnv(name) {
  const v = import.meta.env[name]
  if (!v) {
    throw new Error(
      `Missing ${name}. Create a .env.local file with your Firebase web config values (see env.example).`,
    )
  }
  return v
}

export let firebaseInitError = null
export let firebaseApp = null
export let auth = null
export let db = null

try {
  const firebaseConfig = {
    apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
    authDomain: requiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: requiredEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: requiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requiredEnv('VITE_FIREBASE_APP_ID'),
  }

  firebaseApp = initializeApp(firebaseConfig)
  auth = getAuth(firebaseApp)
  db = getFirestore(firebaseApp)
} catch (err) {
  firebaseInitError = err instanceof Error ? err.message : String(err)
}


