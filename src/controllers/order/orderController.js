const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');
const jwt = require('jsonwebtoken');
const config = require('../../config/auth');

oracledb.fetchAsString = [oracledb.CLOB];

const orderRoute = express.Router();

orderRoute.post('/check-out', async (req, res) => {
  db.connect().then(async (connect) => {
    const session_id = req.cookies.SessionID;
    const id = session_id
      ? await jwt.verify(session_id, config.secret, async (err, decoded) => {
          if (err) {
            // if token has been altered or has expired, return an unauthorized error
            return res.status(401).json({
              message: err.message,
            });
          }
          return decoded.id;
        })
      : null;
    const bindValue = Object.values(req.body);
    if (!bindValue) {
      res.status(400).json({ message: 'Wrong format Input' });
      return;
    }
    const product = bindValue.pop();
    let updateProduct = '';
    product.forEach((e) => {
      updateProduct += `INSERT INTO ORDERS_DETAIL(PRODUCT_ID,QUANTITY,PRICE,DISCOUNT,ORDER_ID) VALUES (${e.id},${e.quantity},${e.price},${e.discount},order_id);`;
    });
    const query = `
    DECLARE
      order_id number;
    begin
      INSERT INTO ORDERS(USER_ID,NAME,ADDRESS,EMAIL,PHONE_NUMBER,NOTE,PAYMENT,COUPON,CREATE_DATE,STATUS)
      VALUES(${id}, :name, :address,:email,:phone_number,:note,:payment,:coupon,:create_date,1)
      returning id into order_id;
      ${updateProduct}     
    end;`;
    connect.execute(query, bindValue, { autoCommit: true }, (err, result) => {
      if (err) {
        res
          .status(500)
          .json({ message: err.message | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: result, isLogIn: !!id });
      db.doRelease(connect);
    });
  });
});

orderRoute.get('/order', async (req, res) => {
  const session_id = req.cookies.SessionID;
  if (!session_id) {
    return res.status(400).json({
      message: 'Please login!',
    });
  }
  const id = await jwt.verify(
    session_id,
    config.secret,
    async (err, decoded) => {
      if (err) {
        // if token has been altered or has expired, return an unauthorized error
        return res.status(401).json({
          message: err.message | 'This session has expired. Please login',
        });
      }
      return decoded.id;
    },
  );
  const query = `
  SELECT o.ID, o.NAME, o.PHONE_NUMBER, o.EMAIL, o.USER_ID, o.ADDRESS, o.NOTE, o.COUPON, o.CREATE_DATE, o.PAYMENT, s.name as STATUS, 
    (select listagg(od.product_id || ',' || pd.name || ',' || pd.thumbnail || ',' || od.quantity || ',' || od.price || ',' || od.discount , ';') within group (order by od.product_id) "product" from ORDERS_DETAIL od left join product_detail pd on od.product_id = pd.id where od.order_id = o.id) as product 
  FROM ORDERS o
  LEFT JOIN STATUS s ON o.status= s.id
  WHERE o.user_id = ${id}
  ORDER BY o.CREATE_DATE desc`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res
          .status(500)
          .json({ message: err.message | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRows((err, rows) => {
        if (err) throw err;
        rows = rows.map((item) => {
          item.PRODUCT = item.PRODUCT.split(';').map((t) =>
            t.split(',').map((e) => {
              return isNaN(+e) ? e : +e;
            }),
          );
          return Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
          );
        });
        res.json({
          data: rows,
        });
      });
      db.doRelease(connect);
    });
  });
});

orderRoute.post('/order/cancel', async (req, res) => {
  const session_id = req.cookies.SessionID;
  if (!req.body.id) {
    return res.status(404).json({
      message: 'Dont have id!',
    });
  }
  if (!session_id) {
    return res.status(400).json({
      message: 'Please login!',
    });
  }
  const id = await jwt.verify(
    session_id,
    config.secret,
    async (err, decoded) => {
      if (err) {
        // if token has been altered or has expired, return an unauthorized error
        return res.status(401).json({
          message: err.message | 'This session has expired. Please login',
        });
      }
      return decoded.id;
    },
  );
  const query = `
  UPDATE ORDERS SET STATUS = 4
  WHERE user_id = ${id} AND id = ${req.body.id}`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res
          .status(500)
          .json({ message: err.message | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      if (result.rowsAffected === 1) {
        res.json({ message: 'success' });
      } else {
        res.json({ message: 'something wrong' });
      }
      db.doRelease(connect);
    });
  });
});

module.exports = orderRoute;
