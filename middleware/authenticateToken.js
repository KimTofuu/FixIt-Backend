// backend/middleware/authenticateToken.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: Token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('JWT Verification Error:', err.message);
      return res.status(403).json({ message: 'Forbidden: Invalid or expired token' });
    }
    
    // DEBUG: Log what's in the token
    console.log('Decoded Token:', decoded);
    
    // Set req.user to the decoded payload
    req.user = decoded;
    
    // DEBUG: Log what userController will see
    console.log('req.user.userId:', req.user.userId);
    
    next();
  });
}

function isAdmin(req, res, next) {
  console.log('isAdmin Check - User Payload:', req.user);
  if (req.user && req.user.role === 'admin') {
    console.log('isAdmin Check: SUCCESS');
    next();
  } else {
    console.log('isAdmin Check: FAILED - User is not an admin or role is missing.');
    res.status(403).json({ message: 'Forbidden: Admin access required' });
  }
}

module.exports = {
  authenticateToken,
  isAdmin,
};