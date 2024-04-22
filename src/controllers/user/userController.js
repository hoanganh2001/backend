const express = require('express');

const userRoute = express.Router();
const db = require('../../config/db');
const config = require('../../config/auth');
const authMiddleware = require('../../middleware/index');

var jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const sendEmail = require('../../utils/sendEmails');

const oracledb = require('oracledb');
const dayjs = require('dayjs');

oracledb.fetchAsString = [oracledb.CLOB];

userRoute.post('/login', (req, res) => {
  db.connect().then(async (connect) => {
    const sqlQuery = `Select ua.*, r.name as role from user_account ua left join role r on ua.role_id = r.id where ua.name = '${req.body.username}'`;
    connect.execute(sqlQuery, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRow((err, row) => {
        if (err) throw err;

        if (row) {
          row = Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
          );
          delete row['otp'];
          if (row.password === req.body.password) {
            delete row['password'];
            if (row.status === 0) {
              res.status(401).json({
                accessToken: null,
                message:
                  'Tài khoản chưa được kích hoạt, check mail để kích hoạt hoặc liên hệ với admin để được hỗ trợ!',
              });
              db.doRelease(connect);
              return;
            }
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
            const updateQuery = `update user_account set last_signin = '${new Date().toISOString()}' where id = ${
              row.id
            }`;
            connect.execute(updateQuery, {}, { autoCommit: true });
            res.json({
              status: 'success',
              isSuccess: true,
              message: 'You have successfully logged in.',
              role: row.role,
            });
          } else {
            res.status(401).json({
              accessToken: null,
              message: 'Invalid Password!',
            });
          }
        } else {
          res.json({ message: 'Username không tồn tại!' });
        }
        db.doRelease(connect);
        return;
      });
    });
  });
});

userRoute.post('/sign-up', (req, res) => {
  const bodyData = req.body;
  bodyData['id'] = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };

  db.connect().then(async (connect) => {
    const checkUserExist = `SELECT * FROM USER_ACCOUNT WHERE NAME = :name OR EMAIL = :email`;
    connect.execute(
      checkUserExist,
      [bodyData.name, bodyData.email],
      (err, result) => {
        if (err) {
          res.status(500).json({
            message: { message: err.message | 'Error get data from DB' },
          });
          db.doRelease(connect);
          return;
        }
        if (result.rows.length > 0) {
          res.status(400).json({ message: 'Tài khoản hoặc email đã tồn tại!' });
          db.doRelease(connect);
          return;
        }
        const sqlQuery = `
        DECLARE
          user_id number;
        Begin
          INSERT INTO USER_ACCOUNT (NAME, EMAIL, PASSWORD,CREATE_DATE,ROLE_ID,STATUS) VALUES(:name,:email,:password,:create_date,2,0)
          returning id into user_id;
          :id := user_id;
        end;
          `;
        connect.execute(
          sqlQuery,
          bodyData,
          { autoCommit: true },
          async (err, result) => {
            if (err) {
              res.status(500).json({ message: 'Error saving employee to DB' });
              db.doRelease(connect);
              return;
            }
            const id = result.outBinds.id;
            await sendEmail({
              to: bodyData.email,
              subject: 'Active account',
              message: `<p>Hi there, you have create account in our Website. Please confirm to active the account</p>
                        <p>Active here: <a href="http://${req.get(
                          'host',
                        )}/api/active-account?id=${id}">Active</a></p>
                        <p>If not you please, ignore this. Thank you for your time!</p>`,
            }).catch((err) => {
              throw err;
            });
            res.status(200).json({
              success: true,
              message:
                'Tạo tài khoản thành công. Chúng tôi đã gửi 1 email đến mail của bạn, hãy xác nhận email để sử dụng tài khoản',
            });
            db.doRelease(connect);
          },
        );
      },
    );
  });
});

userRoute.get('/active-account', (req, res) => {
  const { id } = req.query;
  db.connect().then(async (connect) => {
    const checkIsActived = `SELECT * FROM USER_ACCOUNT WHERE id = ${id} and status = 1`;
    await connect.execute(checkIsActived, {}, (err, result) => {
      if (err) {
        res.status(500).json({
          message: { message: 'Internal Server Error' },
        });
        res.send('<script>window.close();</script > ');
        db.doRelease(connect);
        return;
      }

      if (result.rows.length > 0) {
        console.log(2);

        res.send('<script>window.close();</script > ');
        db.doRelease(connect);
        return;
      }
    });
    const sqlQuery = `update USER_ACCOUNT set STATUS = 1 where id = ${id}`;
    await connect.execute(
      sqlQuery,
      {},
      { autoCommit: true },
      async (err, result) => {
        if (err) {
          res.send('<h2>Có lỗi xảy ra khi kích hoạt!</h2> ');
          db.doRelease(connect);
          return;
        }
        res.send('<script>window.close();</script > ');
        db.doRelease(connect);
        return;
      },
    );
  });
});

userRoute.get('/my-profile', [authMiddleware.verifyToken], (req, res) => {
  const id = req.userId;
  db.connect().then(async (connect) => {
    const sqlQuery = `Select ua.name, ua.address, ua.phone ,ua.email as email from user_account ua where ua.id = ${id}`;
    connect.execute(sqlQuery, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res
          .status(500)
          .json({ message: err.message | 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRow((err, row) => {
        if (err) throw err;
        if (!row) {
          res.status(200).json({
            message: 'You do not update information! Please update info!',
          });
          db.doRelease(connect);
          return;
        }

        row = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
        );
        res.status(200).json({
          data: row,
        });
        db.doRelease(connect);
        return;
      });
    });
  });
});

const detailKey = ['name', 'address', 'phone'];

userRoute.post(
  '/update-my-profile',
  [authMiddleware.verifyToken],
  (req, res) => {
    const id = req.userId;
    let passMessage = '';
    db.connect().then(async (connect) => {
      const checkUser = `SELECT * FROM user_account WHERE ID = :id`;
      connect.execute(checkUser, [id], (err, result) => {
        if (err) {
          res
            .status(500)
            .json({ message: err.message | 'Internal Server Error' });
          db.doRelease(connect);
          return;
        }
        if (result.rows.length > 0) {
          if (req.body.old_password && req.body.new_password) {
            const changePass = `update user_account set password = '${req.body.new_password}' where id = ${id} and password like '${req.body.old_password}'`;
            connect.execute(
              changePass,
              {},
              { autoCommit: true },
              (err, result) => {
                if (err) {
                  res.status(500).json({
                    message: err.message | 'Internal Server Error',
                  });
                  db.doRelease(connect);
                  return;
                }
                passMessage =
                  result.rowsAffected === 1
                    ? 'change pass success!'
                    : 'Wrong Old pass!';
              },
            );
          }
          let info = '';
          const body = req.body;
          Object.keys(body).forEach((t) => {
            if (detailKey.includes(t))
              info += `${info.length === 0 ? '' : ', '}${t} = ${
                body[t] ? "'" + body[t] + "'" : null
              }`;
          });
          const updateInfo = `
            BEGIN
              update USER_ACCOUNT set ${info} WHERE ID = ${id};
              UPDATE USER_ACCOUNT SET EMAIL = '${req.body.email}' WHERE ID = ${id} AND EMAIL NOT LIKE '${req.body.email}';
            END;`;
          connect.execute(
            updateInfo,
            {},
            { autoCommit: true },
            (err, result) => {
              if (err) {
                console.log(err);
                res
                  .status(500)
                  .json({ message: 'Error saving employee to DB' });
                db.doRelease(connect);
                return;
              }
              res.status(200).json({
                message: 'success update info!',
                password: passMessage,
              });
              db.doRelease(connect);
              return;
            },
          );
        } else {
          res
            .status(500)
            .json({ message: err.message | 'Internal Server Error' });
          db.doRelease(connect);
          return;
        }
      });
    });
  },
);

userRoute.get('/account-role', [authMiddleware.verifyToken], (req, res) => {
  const id = req.userId;
  db.connect().then(async (connect) => {
    const sqlQuery = `Select r.name as role from user_account ua left join role r on ua.role_id = r.id where ua.id = ${id}`;
    connect.execute(sqlQuery, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res
          .status(500)
          .json({ message: err.message | 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRow((err, row) => {
        if (err) throw err;
        row = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
        );
        res.json({
          data: row.role,
        });
        db.doRelease(connect);
        return;
      });
    });
  });
});

userRoute.post('/sendOTP', async (req, res) => {
  try {
    const { email } = req.body;
    // Generate a secret key with a length
    // of 20 characters
    db.connect().then(async (connect) => {
      const query = `select id from user_account where email = '${email}'`;
      const result = await connect.execute(query, {});
      if (!result.rows.length > 0) {
        res.status(404).json({ message: 'Email is not exist!', type: 'fail' });
        db.doRelease(connect);
        return;
      }
      const id = result.rows[0].ID;
      const secret = speakeasy.generateSecret({ length: 6 });

      // Generate a TOTP code using the secret key
      const otp = speakeasy.totp({
        // Use the Base32 encoding of the secret key
        secret: secret.base32,

        // Tell Speakeasy to use the Base32
        // encoding format for the secret key
        encoding: 'base32',
      });
      const currentDate = dayjs().add(1, 'minutes').toISOString();
      const updateQuery = `update user_account set otp = '${otp}', OTP_EXPIRED_DATE = '${currentDate}' where id = ${id}`;
      const updateResult = await connect.execute(
        updateQuery,
        {},
        { autoCommit: true },
      );
      if (updateResult.rowsAffected !== 1) {
        res
          .status(500)
          .json({ success: false, message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }

      // Send OTP via email
      await sendEmail({
        to: email,
        subject: 'Reset Password',
        message: `<p>Your OTP is: <strong>${otp}</strong></p><p>Your Password will expired in 1 minute</p>`,
      }).catch((err) => {
        throw err;
      });
      res.status(200).json({ success: true, message: 'OTP sent successfully' });
      db.doRelease(connect);
      return;
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
    db.doRelease(connect);
  }
});

userRoute.post('/verifyOTP', (req, res) => {
  const { email, otp } = req.body;
  db.connect().then(async (connect) => {
    try {
      const sqlQuery = `Select id,otp, otp_expired_date from user_account where email = '${email}'`;
      const verifyOTP = await connect.execute(sqlQuery, {});
      if (otp !== verifyOTP.rows[0].OTP) {
        res.status(500).json({ message: 'Wrong otp!' });
        db.doRelease(connect);
        return;
      }
      if (dayjs().isAfter(dayjs(verifyOTP.rows[0].OTP_EXPIRED_DATE))) {
        res.status(500).json({ message: 'OTP has been expired!' });
        db.doRelease(connect);
        return;
      }
      const updateQuery = `update user_account set otp = null where id = ${verifyOTP.rows[0].ID}`;
      const updateResult = await connect.execute(
        updateQuery,
        {},
        { autoCommit: true },
      );
      if (updateResult.rowsAffected !== 1) {
        res
          .status(500)
          .json({ success: false, message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({
        success: true,
        message: 'OTP verify successfully',
        id: verifyOTP.rows[0].ID,
      });
      db.doRelease(connect);
      return;
    } catch (error) {
      console.error('Error sending OTP:', error);
      res
        .status(500)
        .json({ success: false, message: 'Internal Server Error' });
      db.doRelease(connect);
      return;
    }
  });
});

userRoute.put('/reset-password', (req, res) => {
  const { id, password } = req.body;
  console.log(req);
  db.connect().then(async (connect) => {
    try {
      const updateQuery = `update user_account set password = ${password} where id = '${id}'`;
      const updateResult = await connect.execute(updateQuery, {});
      if (updateResult.rowsAffected !== 1) {
        res
          .status(500)
          .json({ success: false, message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({
        success: true,
        message: 'Reset Password successful!',
      });
      db.doRelease(connect);
      return;
    } catch (error) {
      console.error('Error sending OTP:', error);
      res
        .status(500)
        .json({ success: false, message: 'Internal Server Error' });
      db.doRelease(connect);
      return;
    }
  });
});

module.exports = userRoute;
