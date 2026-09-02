# StreamKit frontend

An original Next.js interface for analyzing supported media links and saving media you have permission to download. It supports 17 services: YouTube, Instagram, TikTok, X, Facebook, Cocofun, MediaFire, CapCut, Google Drive, Kuaishou, Rednote, Douyin, SnackVideo, Pinterest, SoundCloud, Spotify, and Threads.

## Run locally

```bash
npm ci
copy .env.example .env.local
npm run dev
```

No backend is required. The app uses the same third-party provider as the referenced project by default. The Vercel server route resolves supported links and streams the selected file, so browsers do not need CORS access to the provider.

## Deploy on Vercel

1. Import this repository in Vercel; its framework preset is detected automatically.
2. Deploy. No environment variable is required. The provider endpoints are hard-coded server-side in the Vercel route.
3. The frontend calls `/api/provider/analyze` and `/api/provider/download`; Vercel resolves the third-party media URL and returns the file as an attachment.

The providers are external and unofficial, so availability, rate limits, terms, and response formats can change without notice. Large downloads are also subject to Vercel function limits.
