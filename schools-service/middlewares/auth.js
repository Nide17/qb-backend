const jwt = require('jsonwebtoken');
const { handleError } = require('../utils/error');

const verifyToken = (req) => {
  const token = req.header('x-auth-token');
  if (!token) throw { status: 401, message: 'Token missing: Authorization denied!' };

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded) throw { status: 401, message: 'Token is not valid' };
    req.user = decoded;
    return decoded;
  } catch {
    throw { status: 401, message: 'Token is not valid or expired' };
  }
};

const auth = (req, res, next) => {
  try {
    verifyToken(req);
    return next();
  } catch (_err) {
    return handleError(res, _err);
  }
};

const authRole = (roles) => (req, res, next) => {
  try {
    verifyToken(req);
    if (!req.user) throw { status: 401, message: 'Session expired' };
    if (Array.isArray(roles) && roles.includes(req.user.role)) return next();
    throw { status: 403, message: 'Unauthorized' };
  } catch (_err) {
    return handleError(res, _err);
  }
};

module.exports = { auth, authRole };