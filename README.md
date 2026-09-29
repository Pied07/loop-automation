# loop-automation

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Loop Studio

A short-form video creator workspace built with Next.js, Firebase Authentication, and Firestore.

### Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without Firebase credentials, you can explore the studio in preview mode. Preview data is not persisted.

### Firebase setup

1. Create a Firebase project and register a web app.
2. Enable Email/Password under Authentication > Sign-in method.
3. Create a Cloud Firestore database.
4. Open Storage in Firebase Console and choose **Get started** to create/link the project's Storage bucket. Copy the exact bucket name shown there into `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`; do not guess it from the project ID.
5. Copy `.env.example` to `.env.local` and fill in the Firebase web app values.
6. Restart the development server.

Cloud Storage for Firebase currently requires the Blaze plan. Check Firebase's current billing terms before enabling it. Configure Storage rules so signed-in users can write only under their own `users/{userId}/assets/` path. Firestore video records are read from `users/{userId}/videos`; configure its rules to isolate each user's subcollection. Firebase web configuration is public; do not put server secrets there.

### Cloud generation setup

For generation in a cloud deployment, configure the Firebase web values above, `GEMINI_API_KEY`, image-provider credentials as available, at least one video renderer (`SHOTSTACK_API_KEY` or `JSON2VIDEO_API_KEY`), and `INNGEST_SIGNING_KEY` for completion polling. If both renderer keys are set, the app uses Shotstack only; otherwise it uses JSON2Video. It never submits the same video to both. The app limits videos to 60 seconds and 10 scenes. Generation runs remotely; local Piper or FFmpeg installations are not used by the deployed app.

Narration uses Gemini 3.8 Flash-Lite TTS and maps the selected studio voice to a Gemini voice. Its standard free tier is listed as free of charge, but paid-tier use is billed and free-tier quota can vary by account. To prevent charges, use a free-tier-only Gemini project/key with billing disabled; when its quota is exhausted, generation stops rather than falling back to Pollinations narration. A Gemini voice is a replacement voice, not the same voice identity as the former ElevenLabs library.

There is no guaranteed free cloud quota for the complete workflow. Image APIs can require paid credits or run out of free quota, and Shotstack/JSON2Video rendering is a separate service that may consume paid credits. Check each provider's billing and quota before enabling it in production. `.env.example` lists the server and client variables used by this project; never expose server API keys as `NEXT_PUBLIC_` variables.

### Meta publishing

Instagram connects through **Instagram API with Instagram Login**, so an Instagram Business or Creator account can publish Reels without a Facebook Page. Configure the Instagram App ID and exact `INSTAGRAM_REDIRECT_URI` from that Meta product in `.env`; set `INSTAGRAM_APP_SECRET`, or reuse `META_APP_SECRET` only when both IDs belong to the same Meta app. Register the callback URL in Instagram Business Login settings. Facebook publishing is separate and requires a Facebook Page with publishing access; its callback is `https://<your-host>/api/auth/callback/facebook`. Current OAuth tokens are written to `tokens.json`, which is not durable storage on serverless hosts or isolated background workers. Use persistent encrypted credential storage before relying on Meta publishing in cloud production.

Newly generated video files are never uploaded to Firebase Storage. After rendering, the app saves only each video's external renderer URL and library metadata in Firestore under `users/{userId}/videos`, so links remain available across sessions. Deploy the included user-scoped Firestore rules with `firebase deploy --only firestore:rules`. If cloud saving is unavailable, the link is kept in browser storage. YouTube, Facebook Pages, and Instagram Professional accounts are supported social targets; connected Gmail can receive the video link. The final MP4 stays at the selected renderer's URL. Scene images may use Firebase Storage as renderer inputs; narration WAV is uploaded to the selected renderer's temporary asset endpoint, not Firebase Storage.

