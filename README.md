# Job Application Tracker

A tiny React and Node.js app for tracking job applications. Sign in with a phone OTP delivered by Minimoth, then add applications and update their status.

## Requirements

- Node.js 20+
- A Minimoth API key

## Run locally

1. In `backend`, copy `.env.example` to `.env` and set `MINIMOTH_API_KEY`.
2. In `frontend`, copy `.env.example` to `.env`.
3. Install and start the backend:

   ```sh
   cd backend
   npm install
   npm run dev
   ```

4. In another terminal, install and start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

5. Open the local URL printed by Vite. The backend creates `tracker.db` automatically.

The frontend calls `/api`; Vite proxies those requests to the backend during local development. Keep the Minimoth API key in the backend `.env` only. A Minimoth test key (`mm_test_...`) accepts `000000` for OTP verification.
