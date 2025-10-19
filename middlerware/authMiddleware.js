// 🔒 Middleware to check if user is authenticated
export const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized. Please log in." });
  }
  next();
};

// 🔒 Middleware to check if user has admin role
export const requireAdmin = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized. Please log in." });
  }
  
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden. Admin access only." });
  }
  
  next();
};

// 🔒 Middleware to check if user has coach role
export const requireCoach = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized. Please log in." });
  }
  
  if (req.session.user.role !== "coach" && req.session.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden. Coach access only." });
  }
  
  next();
};

// 🔒 Middleware to check if user is a regular user
export const requireUser = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized. Please log in." });
  }
  
  if (req.session.user.role !== "user") {
    return res.status(403).json({ message: "Forbidden. User access only." });
  }
  
  next();
};

// 🔒 Middleware to check role dynamically
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Unauthorized. Please log in." });
    }
    
    if (!allowedRoles.includes(req.session.user.role)) {
      return res.status(403).json({ 
        message: `Forbidden. Required role: ${allowedRoles.join(" or ")}` 
      });
    }
    
    next();
  };
};