# KLH Canteen Frontend

React + Vite + TailwindCSS frontend for the KLH Pantry App.

## Local dev

```bash
cp .env.example .env   # point VITE_API_URL at your local backend (default http://localhost:4000)
npm install
npm run dev
```

Requires the backend (klh-canteen-backend) running locally.

## Deploy (Vercel)

1. Push this repo to GitHub.
2. In Vercel, "Add New" → "Project" → import this repo.
3. Framework preset: Vite. Build command: `npm run build`. Output dir: `dist`.
4. Set env var `VITE_API_URL` to the deployed backend URL
   (e.g. `https://klh-canteen-backend.onrender.com`).
5. Deploy. `vercel.json` handles SPA client-side routing on refresh.
