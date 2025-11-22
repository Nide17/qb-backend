const jwt = require("jsonwebtoken");

/**
 * Verifies JWT from header and attaches decoded user to req.user
 */
function verifyToken(req) {
  const token = req.header("x-auth-token");

  if (!token) {
    let error = new Error("Token missing: Authorization denied!");
    error.status = 401;
    throw error;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    req.user = decoded;
    return decoded;
  } catch (err) {  // eslint-disable-line no-unused-vars
    let error = new Error("Token is not valid or expired");
    error.status = 401;
    error.code = "TOKEN_EXPIRED";
    throw error;
  }
}

/**
 * Authentication middleware (protect routes)
 */
function auth(req, res, next) {
  try {
    verifyToken(req);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Authorization middleware (role-based)
 */
function authRole(roles = []) {
  return (req, res, next) => {
    try {
      verifyToken(req);

      if (!req.user) {
        const error = new Error("Session expired");
        error.status = 401;
        throw error;
      }

      if (!Array.isArray(roles) || roles.length === 0) {
        return next(); // no restrictions
      }

      if (roles.includes(req.user.role)) {
        return next();
      }

      const error = new Error("Unauthorized");
      error.status = 403;
      throw error;
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { auth, authRole };
