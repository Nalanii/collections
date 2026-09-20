# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Firebase setup

This app is wired to the Firebase project `collections-tracker-nls`.

1. Copy `.env.example` to `.env.local`.
2. Fill in the values from the Firebase console (Project settings → General →
   Your apps → SDK setup and configuration) or ask a project maintainer for
   them.

## Deploy

```bash
npm run deploy
```

This builds the app and deploys Hosting + Firestore rules/indexes to the
`collections-tracker-nls` Firebase project. Requires the Firebase CLI
(`npm install -g firebase-tools`) and being logged in (`firebase login`).
