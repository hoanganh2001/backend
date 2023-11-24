const express = require('express');

const userRoute = express.Router();
const db = require('../../config/db');
const config = require('../../config/auth');

var jwt = require('jsonwebtoken');
var bcrypt = require('bcryptjs');
const oracledb = require('oracledb');

oracledb.fetchAsString = [oracledb.CLOB];

userRoute.post('/login', (req, res) => {
  db.connect().then(async (connect) => {
    const sqlQuery = `Select * from user_account where name = '${req.body.username}'`;
    connect.execute(sqlQuery, {}, { resultSet: true }, (err, result) => {
      if (err) {
        console.error(err.message);
        res.status(500).send('Error getting data from DB');
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRow((err, row) => {
        if (err) throw err;

        if (row) {
          row = Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
          );
          if (row.password === req.body.password) {
            const options = {
              maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days,
              httpOnly: false,
              secure: true,
              sameSite: 'None',
            };
            const token = jwt.sign({ id: row.id }, config.secret, {
              algorithm: 'HS256',
              allowInsecureKeySizes: true,
              expiresIn: 30 * 24 * 60 * 60 * 1000, // 24 hours
            });
            res.cookie('SessionID', token, options);
            res.status(200).json({
              status: 'success',
              message: 'You have successfully logged in.',
            });
          } else {
            res.status(401).send({
              accessToken: null,
              message: 'Invalid Password!',
            });
          }
        } else {
          res.json({ message: 'fail' });
        }
        db.doRelease(connect);
      });
    });
  });
});

userRoute.post('/sign-up', (req, res) => {
  db.connect().then(async (connect) => {
    const sqlQuery = `INSERT INTO USER_ACCOUNT (NAME, EMAIL, PASSWORD,CREATE_DATE) VALUES(:name,:email,:password,:create_date)`;
    connect.execute(
      sqlQuery,
      Object.values(req.body),
      { autoCommit: true },
      (err, result) => {
        if (err) {
          console.error(err.message);
          response.status(500).send('Error saving employee to DB');
          doRelease(connection);
          return;
        }
        res.json({ message: 'success' });
        db.doRelease(connect);
      },
    );
  });
});

userRoute.get('/my-profile', (req, res) => {
  const session_id = req.cookies.SessionID;
  console.log(session_id);
  jwt.verify(session_id, config.secret, async (err, decoded) => {
    if (err) {
      console.log(err);
      // if token has been altered or has expired, return an unauthorized error
      return res
        .status(401)
        .json({ message: 'This session has expired. Please login' });
    }
    const { id } = decoded;
    db.connect().then(async (connect) => {
      const sqlQuery = `Select ud.*,ua.email as email from user_detail ud left join user_account ua on ud.user_id = ua.id where ud.user_id = ${id}`;
      connect.execute(sqlQuery, {}, { resultSet: true }, (err, result) => {
        if (err) {
          console.error(err.message);
          res.status(500).send('Error getting data from DB');
          db.doRelease(connect);
          return;
        }
        result.resultSet.getRow((err, row) => {
          if (err) throw err;
          if (row) {
            row = Object.fromEntries(
              Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
            );
          }
          res.status(200).json({
            data: row,
          });
        });
      });
    });
  });

  // db.connect().then(async (connect) => {
  //   const sqlQuery = `Select * from user_detail where id = ${req.query.id}`;
  //   connect.execute(sqlQuery, {}, { resultSet: true }, (err, result) => {
  //     if (err) {
  //       console.error(err.message);
  //       res.status(500).send('Error getting data from DB');
  //       db.doRelease(connect);
  //       return;
  //     }
  //     result.resultSet.getRow((err, row) => {
  //       if (err) throw err;

  //       if (row) {
  //         row = Object.fromEntries(
  //           Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
  //         );
  //         if (row.password === req.body.password) {
  //           const options = {
  //             maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days,
  //             httpOnly: false,
  //             secure: true,
  //             sameSite: 'None',
  //           };
  //           const token = jwt.sign({ id: row.id }, config.secret, {
  //             algorithm: 'HS256',
  //             allowInsecureKeySizes: true,
  //             expiresIn: 86400, // 24 hours
  //           });
  //           res.cookie('SessionID', token, options);
  //           res.status(200).json({
  //             status: 'success',
  //             message: 'You have successfully logged in.',
  //           });
  //         } else {
  //           res.status(401).send({
  //             accessToken: null,
  //             message: 'Invalid Password!',
  //           });
  //         }
  //       } else {
  //         res.json({ message: 'fail' });
  //       }
  //       db.doRelease(connect);
  //     });
  //   });
  // });
});

module.exports = userRoute;
