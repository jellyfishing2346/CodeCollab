# Deployment Instructions for CodeCollab Frontend (Next.js)

## 1. Project Structure
- Your frontend is in the `frontend/` folder and uses Next.js (confirmed by `package.json` and `next.config.js`).

## 2. Vercel Setup
- In the Vercel dashboard, set the project root to `frontend/`.
- Vercel will auto-detect Next.js and use `next build`.
- If needed, set the build command to `next build` manually.

## 3. Environment Variables
- Add all variables from `.env.local` to the Vercel dashboard (Settings > Environment Variables).
- For production, update `NEXT_PUBLIC_WEBSOCKET_URL` to your backend's public URL (not `localhost`).

## 4. Backend Deployment
- Deploy your backend (Socket.IO server) to a platform like Render, Railway, Fly.io, or Heroku.
- Get the public URL for your backend and update your frontend `.env.local` and Vercel environment variable accordingly.

## 5. Final Steps
- Push your code to GitHub, GitLab, or Bitbucket.
- Import your repo into Vercel and deploy.
- Test your app live!

---
For backend deployment instructions or troubleshooting, ask GitHub Copilot for step-by-step help.
