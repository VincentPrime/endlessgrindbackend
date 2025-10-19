import express from "express";
import cors from "cors";
import session from "express-session";
import authRoutes from "./routes/authroutes/authRoutes.js";
import { requireAdmin, requireCoach, requireAuth } from "./middlerware/authMiddleware.js";
import coachRouter from "./routes/coachRoutes/coachRouter.js"
import promoRoutes from "./routes/promoRoutes/promoRoutes.js"

const app = express();
const PORT = 4000;

// Middleware
app.use(express.json());

// CORS - allow credentials
app.use(
  cors({
    origin: "http://localhost:3000", // Your Next.js frontend
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], 
    credentials: true,
  })
);

// Session configuration
app.use(
  session({
    secret: "your-secret-key-change-this-in-production", // Change this!
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", promoRoutes)
app.use("/api", coachRouter)

// Example protected routes - Add these based on your needs

// 🔒 Admin-only routes
app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json({ message: "List of all users", user: req.session.user });
});

app.get("/api/admin/coaches", requireAdmin, (req, res) => {
  res.json({ message: "List of all coaches", user: req.session.user });
});

// 🔒 Coach-only routes  
app.get("/api/coach/clients", requireCoach, (req, res) => {
  res.json({ message: "List of my clients", user: req.session.user });
});

// 🔒 Any authenticated user
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