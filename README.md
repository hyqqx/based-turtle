# Based Turtle 🐢

A tiny tamagotchi turtle living on Base. Feed it, wash it, send it to the sea and grow it from Baby to Giant.

Built as a Farcaster Mini App (Base App) on Next.js.

## Stack

- Next.js 15 + React 19
- @farcaster/miniapp-sdk
- wagmi + viem (Base chain)

## Structure

- `app/page.tsx` — the game screen
- `app/page.module.css` — game styles
- `farcaster.config.ts` — Mini App manifest (name, icons, category)
- `app/.well-known/farcaster.json/route.ts` — serves the manifest
- `public/turtle-*.png` — branding assets

## Env

No secrets required to run. Optional:

- `NEXT_PUBLIC_URL` — override the app root URL (auto-detected on Vercel)

Real keys, when they appear later, live in Vercel Environment Variables and are never committed (`.env*` is gitignored).
