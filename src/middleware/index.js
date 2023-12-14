const jwt = require('jsonwebtoken');
const db = require('../config/db');
const config = require('../config/auth');

verifyToken = (req, res, next) => {
  const session_id = req.cookies.SessionID;
  if (!session_id) {
    return res.status(403).send({
      message: 'No token provided!',
    });
  }
  jwt.verify(session_id, config.secret, async (err, decoded) => {
    if (err) {
      // if token has been altered or has expired, return an unauthorized error
      return res.status(401).json({
        message: err.message | 'This session has expired. Please login',
      });
    }
    req.userId = decoded.id;
    next();
  });
};

isAdmin = async (req, res, next) => {
  try {
    const session_id = req.cookies.SessionID;
    if (!session_id) {
      return res.status(403).send({
        message: 'No token provided!',
      });
    }
    const { id } = jwt.decode(session_id);
    db.connect().then(async (connect) => {
      const query = `Select r.name as role from user_account ua left join role r on ua.role_id = r.id where ua.id = ${id}`;
      const result = await connect.execute(query, {}, { resultSet: true });
      if (!result) {
        return res.status(500).send({
          message: 'Unable to connect to database!',
        });
      }
      const userRole = (await result.resultSet.getRow()).ROLE;
      if (userRole === 'admin') {
        req.userId = id;
        db.doRelease(connect);
        return next();
      }
      db.doRelease(connect);

      return res.status(403).send({
        message: 'Require Admin Role!',
      });
    });
  } catch (error) {
    db.doRelease(connect);
    return res.status(500).send({
      message: 'Unable to validate User role!',
    });
  }
};

const authMiddleware = { verifyToken, isAdmin };

module.exports = authMiddleware;
