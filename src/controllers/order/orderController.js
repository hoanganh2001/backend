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
      updateProduct += `INSERT INTO ORDERS_DETAIL(PRODUCT_ID,QUANTITY,ORDER_ID) VALUES (${e.id},${e.quantity},order_id);`;
    });
    const query = `
    DECLARE
      order_id number;
    begin
      INSERT INTO ORDERS(USER_ID,NAME,ADDRESS,EMAIL,PHONE_NUMBER,NOTE,PAYMENT,COUPON,CREATE_DATE)
      VALUES(${id}, :name, :address,:email,:phone_number,:note,:payment,:coupon,:create_date)
      returning id into order_id;
      ${updateProduct}     
    end;`;
    connect.execute(query, bindValue, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
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
  SELECT o.*, 
  (select listagg(od.quantity || ',' || od.product_id, ';') within group (order by od.product_id) "product" from ORDERS_DETAIL od where od.order_id = o.id) as product 
  FROM ORDERS o 
WHERE o.user_id = ${id}`;
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
            t.split(',').map((e) => +e),
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

module.exports = orderRoute;
