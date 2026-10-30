# Client progress preview on Vercel

This repository is configured to publish a static client preview on Vercel. Public pages and a labelled student tour work without a backend. Real accounts, payments, emails, and uploads continue to require the Node application with persistent database/file storage; they are not deployed by this preview configuration.

## Deploy the existing GitHub repository

1. Open https://vercel.com/new and sign in with GitHub.
2. Import `defibherry123-crypto/Eartokeysmusic`. If it is not listed, grant Vercel access to that repository using its GitHub integration.
3. Select **Other** as the framework and leave **Root Directory** at the repository root (`./`). The committed `vercel.json` supplies the build/output settings. Click **Deploy**.

Settings, if the dashboard asks for them:

| Setting | Value |
| --- | --- |
| Framework | Other |
| Root Directory | `./` (repository root) |
| Node.js | 24.x |
| Install Command | `npm --prefix eartokeys-backend ci` |
| Build Command | `npm run build:preview` |
| Output Directory | `dist` |
| Environment variables | None for the design preview |

Share the resulting production `https://…vercel.app` address with the client. **Student Preview** in the top banner opens the student area without asking the client to create an account. **Sign In Design** and **Sign Up Design** show those layouts. The clip in the lesson player is labelled as a sample. Booking/community interactions are local previews. Profile edits and progress in the preview are temporary browser state, not server records. Account/password forms and payment/upload actions explain that a backend is required rather than sending data to a live service.

Importing this existing repository connects Vercel's Git integration: subsequent pushes to `main` rebuild the client URL automatically. For local website development, keep using `npm start` in `eartokeys-backend`; that continues to use the real backend and is unaffected by preview mode.

## Build locally

From the repository root, using Node 24:

```powershell
npm run build:preview
npx serve dist
```

The build opens an isolated in-memory database to generate public catalogue fixtures from the seed definitions. It never reads the local database, `.env`, uploaded storage, account records, credentials, or payment history. It copies only `eartokeys-backend/public/`, the preview adapter, and the tracked sample clip into `dist/`. Search indexing is discouraged with `robots.txt`, a robots meta tag, and the Vercel response header.

## Full live application

The existing SQLite database and local media uploads need persistent disk. Do not run this backend using disposable Vercel function storage for real users. A full production setup needs a persistent Node host for the API/media, or a migration to a hosted database and object storage, plus real mail/payment/provider credentials. This preview does not claim to provide that production setup.
