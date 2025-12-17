# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Firebase Authentication setup (Register to Vote)

1. **Enable Email/Password** in Firebase Console:
   - Authentication → Sign-in method → **Email/Password** → Enable
2. **Add your Firebase Web config** locally:
   - Copy `env.example` → create `.env.local` (same folder as `package.json`)
   - Fill in `VITE_FIREBASE_*` values from Firebase Console → Project settings → Your apps → Web app
3. Run:
   - `npm run dev`

### Deploying (important for Firebase config)

Vite injects `VITE_FIREBASE_*` values **at build time**. If you add/change `.env.local`, you must rebuild and redeploy:

- `npm run build`
- `firebase deploy`

## Firestore “voters” collection (optional database)

When a user registers (and agrees with the stance), the app writes a document to:
- `voters/{uid}`

Minimal **Firestore Security Rules** suggestion (Firebase Console → Firestore Database → Rules):

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /voters/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
