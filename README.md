# 🚀 Secure Biometric Chat Platform

Welcome to the Secure Chat project. This repository contains the source code for a highly secure, end-to-end encrypted chat platform that uses real-time facial recognition as an active biometric lock barrier.

## 📂 Project Structure

This project has been cleanly separated into distinct environments to ensure production-readiness while preserving historical R&D.

- **`frontend/`**: The modern, production-ready React web application. This folder contains the entire final product designed to be deployed.
- **`legacy-python-prototype/`**: The initial backend validation prototype written in Python (using sockets and OpenCV). Kept strictly for historical documentation.
- **`docs/`**: Project documentation, initial prompts, and system reports.

---

## 🌐 1. Deploying the Web Client (`frontend/`)

The application is built using **Vite + React + Tailwind CSS** and is explicitly designed to be deployed directly from the `frontend/` folder to platforms like Vercel.

### Cloud Deployment Instructions (e.g. Vercel)
1. Import this repository into your hosting platform.
2. Set the **Framework Preset** to `Vite`.
3. Set the **Root Directory** to `frontend`.
4. Ensure the **Build Command** is `npm run build` and **Output Directory** is `dist`.

### Local Setup & Development 

#### Supabase Database Setup
1. Create a new project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard and run:

```sql
-- Profiles
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  has_face_registered BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Faces
CREATE TABLE public.faces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  encoding JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES auth.users(id),
  receiver_id UUID,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Environment Setup
Create a `.env` file inside the `frontend/` folder with your Supabase credentials:
```env
VITE_SUPABASE_URL=YOUR_URL
VITE_SUPABASE_ANON_KEY=YOUR_KEY
```

#### Run the Project Locally
Ensure you have Node.js installed, then navigate into the frontend directory:
```bash
cd frontend
npm install
npm run dev
```
The app will be available at `http://localhost:8080` (or the port specified in your terminal).

---

## 🐍 2. Legacy Prototype (`legacy-python-prototype/`)

Before migrating to a serverless web architecture, the core facial recognition logic and AES encryption mechanics were validated using a pure Python Socket architecture. 

All Python components (OpenCV scripts, server sockets, GUI clients, face databases) have been moved to the `legacy-python-prototype/` folder. Note that **this code is strictly for archival and reference purposes** and is not used by the production web app.

---

## 📄 License
This project is licensed under the terms described in the `LICENSE` file.
