# SkillLens AI — Backend

Production-ready Node.js + Express + MongoDB backend for the SkillLens AI interview preparation platform.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Runtime     | Node.js 18+                         |
| Framework   | Express 4                           |
| Database    | MongoDB Atlas (via Mongoose 8)      |
| Auth        | JWT (jsonwebtoken) + bcryptjs       |
| Security    | Helmet, CORS                        |
| Dev tooling | nodemon, morgan                     |

---

## Folder Structure

```
backend/
├── config/
│   └── db.js                  ← MongoDB Atlas connection
├── controllers/
│   ├── authController.js      ← register, login, profile, logout
│   └── dashboardController.js ← dynamic dashboard stats
├── middleware/
│   ├── auth.js                ← JWT protect + adminOnly
│   ├── errorHandler.js        ← global error handler
│   └── validate.js            ← required-field checker
├── models/
│   ├── User.js                ← user schema + password hashing
│   ├── Interview.js           ← interview session schema
│   ├── Resume.js              ← resume analysis schema
│   └── Result.js              ← AI feedback/score schema
├── routes/
│   ├── authRoutes.js          ← /api/auth/*
│   ├── dashboardRoutes.js     ← /api/dashboard
│   ├── interviewRoutes.js     ← /api/interview/* (Phase 5 stub)
│   └── resumeRoutes.js        ← /api/resume/*    (Phase 4 stub)
├── .env.example
├── package.json
└── server.js                  ← entry point
```

---

## Quick Start

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Open .env and fill in your MONGO_URI and JWT_SECRET
```

Your `.env` should look like:
```
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://skilllensadmin:SkillLens%402026@skilllens.0vjdlio.mongodb.net/?appName=SkillLens
JWT_SECRET=skilllens_super_secret_key
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
```

### 3. Start development server
```bash
npm run dev
```

You should see:
```
✅  MongoDB connected: skilllens.0vjdlio.mongodb.net
🚀  SkillLens AI server running on port 5000
📡  Health: http://localhost:5000/health
```

---

## API Reference

### Health Check
```
GET /health
```
Returns server + environment status. No auth required.

---

### Authentication  `/api/auth`

#### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "fullName": "Arjun Kumar",
  "email": "arjun@example.com",
  "password": "password123",
  "college": "IIT Delhi",
  "branch": "Computer Science",
  "year": 3
}
```
Returns: `201` with `token` + `user` object.

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "arjun@example.com",
  "password": "password123"
}
```
Returns: `200` with `token` + `user` object.

#### Get Profile  *(protected)*
```
GET /api/auth/profile
Authorization: Bearer <token>
```

#### Update Profile  *(protected)*
```
PUT /api/auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "college": "IIT Bombay",
  "year": 4
}
```

#### Logout  *(protected)*
```
POST /api/auth/logout
Authorization: Bearer <token>
```

---

### Dashboard  `/api/dashboard`

#### Get Dashboard Stats  *(protected)*
```
GET /api/dashboard
Authorization: Bearer <token>
```
Returns:
```json
{
  "success": true,
  "data": {
    "totalInterviews": 27,
    "avgScore": 78,
    "resumeScore": 82,
    "improvementRate": 14,
    "recentActivity": [...]
  }
}
```

---

## Postman Testing Guide

### Step 1 — Register a new user
- Method: `POST`
- URL: `http://localhost:5000/api/auth/register`
- Body → raw → JSON:
```json
{
  "fullName": "Test User",
  "email": "test@skilllens.com",
  "password": "test1234",
  "college": "IIT Delhi",
  "branch": "CSE",
  "year": 3
}
```
- Expected: `201 Created` with token

### Step 2 — Login
- Method: `POST`
- URL: `http://localhost:5000/api/auth/login`
- Body:
```json
{
  "email": "test@skilllens.com",
  "password": "test1234"
}
```
- Copy the `token` from the response

### Step 3 — Get Profile (protected)
- Method: `GET`
- URL: `http://localhost:5000/api/auth/profile`
- Headers: `Authorization: Bearer <paste_token_here>`
- Expected: `200` with user object

### Step 4 — Dashboard
- Method: `GET`
- URL: `http://localhost:5000/api/dashboard`
- Headers: `Authorization: Bearer <token>`
- Expected: `200` with stats (all zeros until interviews exist)

### Step 5 — Test error handling
- Call `/api/auth/login` with wrong password → expect `401`
- Call `/api/auth/profile` with no token → expect `401`
- Call `/api/auth/register` with duplicate email → expect `409`

---

## Build Order (as specified)

| Phase | Feature              | Status       |
|-------|----------------------|--------------|
| 1     | Server + DB          | ✅ Done      |
| 2     | Auth (register/login)| ✅ Done      |
| 3     | Dashboard API        | ✅ Done      |
| 4     | Resume Analyzer      | 🔜 Next      |
| 5     | HR Interview         | 🔜 Phase 5   |
| 6     | Technical Interview  | 🔜 Phase 6   |
| 7     | AI Feedback Engine   | 🔜 Phase 7   |
| 8     | Analytics            | 🔜 Phase 8   |
| 9     | Admin Panel          | 🔜 Phase 9   |

---

## Security Notes

- Passwords hashed with bcryptjs (12 salt rounds)
- JWT secret never exposed in responses
- `password` field excluded from all DB queries by default (`select: false`)
- Helmet sets secure HTTP headers
- CORS restricted to `CLIENT_URL`
- Mongoose validation on all models
- Global error handler catches Mongoose + JWT errors cleanly
