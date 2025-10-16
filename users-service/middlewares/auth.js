const jwt = require("jsonwebtoken")

const handleTokenError = (req, res, status, message) => {
  res.status(status).json({ message })
}

const verifyToken = (req, res) => {
  const token = req.header('x-auth-token')

  if (!token) {
    return handleTokenError(req, res, 401, 'No token, authorization Denied')
  }
  try {
    console.log("token verif: ", token, process.env.JWT_SECRET)
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    return decoded
  } catch (e) {
    console.log(e)
    return handleTokenError(req, res, 400, 'Session Expired, login again!')
  }
}

const auth = async (req, res, next) => {
  if (verifyToken(req, res)) {
    next()
  }
}

const authRole = (roles) => (req, res, next) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return

  if (!req.user) {
    return res.status(401).json({ message: 'Session expired' })
  }

  const allowedUser = roles.find(rol => rol === req.user.role)
  if (allowedUser === req.user.role) {
    return next()
  }

  return res.status(401).json({ message: 'Unauthorized' })
}

module.exports = { auth, authRole }