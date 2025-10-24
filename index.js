import express from "express";
import cors from "cors";
import session from "express-session";
import authRoutes from "./routes/authroutes/authRoutes.js";
import { requireAdmin, requireCoach, requireAuth } from "./middlerware/authMiddleware.js";
import coachRouter from "./routes/coachRoutes/coachRouter.js"
import promoRoutes from "./routes/promoRoutes/promoRoutes.js"
import applicationRoutes from "./routes/applicationformroute/applicationRoutes.js"
import trainingRoutes from "./routes/trainingroute/trainingRoutes.js"
import admindashboardRoutes from "./routes/admindashboardroute/admindashboardRoutes.js"

const app = express();
const PORT = 4000;

// ✅ IMPORTANT: Set trust proxy BEFORE session middleware
app.set('trust proxy', 1);

// Middleware
app.use(express.json());

// ✅ FIXED CORS - Must be before session
app.use(
  cors({
    origin: "http://localhost:3000", // Remove array, just use string
    credentials: true, // Allow credentials
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ✅ FIXED Session configuration
app.use(
  session({
    secret: "your-secret-key-change-this-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // ✅ Must be false for localhost
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax', // ✅ Changed from 'none' to 'lax' for localhost
      path: '/', // ✅ Explicitly set path
    },
  })
);

// ✅ Add debug middleware to see cookies
app.use((req, res, next) => {
  console.log('📝 Session ID:', req.sessionID);
  console.log('👤 Session User:', req.session.user);
  console.log('🍪 Cookies:', req.headers.cookie);
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", promoRoutes)
app.use("/api", coachRouter)
app.use("/api", applicationRoutes)
app.use("/api", trainingRoutes)
app.use("/api", admindashboardRoutes)

// Protected routes
app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json({ message: "List of all users", user: req.session.user });
});

app.get("/api/admin/coaches", requireAdmin, (req, res) => {
  res.json({ message: "List of all coaches", user: req.session.user });
});

app.get("/api/coach/clients", requireCoach, (req, res) => {
  res.json({ message: "List of my clients", user: req.session.user });
});

app.get("/api/user/profile", requireAuth, (req, res) => {
  res.json({ message: "User profile", user: req.session.user });
});

// Test route
app.get("/", (req, res) => {
  res.send("Endless Grind API is running!");
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});