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
      res.status(500).json({ message: 'Wrong format Input' });
      return;
    }
    const product = bindValue.pop();
    const productCheck = await connect.execute(
      `Select id from product_detail where id in (${product.map(
        (t) => t.id,
      )}) and quantity > 0`,
      {},
    );
    if (product.length > productCheck.rows.length) {
      res
        .status(500)
        .json({ message: 'Có sản phẩm không đủ số lượng hoặc đã hết!' });
      return;
    }
    let updateProduct = '';
    product.forEach((e) => {
      updateProduct += `INSERT INTO ORDERS_DETAIL(PRODUCT_ID,QUANTITY,PRICE,DISCOUNT,ORDER_ID) VALUES (${e.id},${e.quantity},${e.price},${e.discount},order_id);
      UPDATE PRODUCT_DETAIL pd SET pd.QUANTITY = pd.QUANTITY - ${e.quantity} where pd.id = ${e.id};`;
    });
    bindValue.push({ type: oracledb.NUMBER, dir: oracledb.BIND_OUT });
    const query = `
    DECLARE
      order_id number;
    begin
      INSERT INTO ORDERS(USER_ID,NAME,ADDRESS,EMAIL,PHONE_NUMBER,NOTE,PAYMENT,COUPON,CREATE_DATE,STATUS)
      VALUES(${id}, :name, :address,:email,:phone_number,:note,:payment,:coupon,:create_date,1)
      returning id into order_id;
      :id := order_id;
      ${updateProduct}
    end;`;
    connect.execute(query, bindValue, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      const orderId = result.outBinds[0];
      res.status(200).json({
        message: 'Bạn đã đặt hàng thành công!',
        isLogIn: !!id,
        isSuccess: true,
        orderId: orderId,
      });
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
  SELECT o.ID, o.NAME, o.PHONE_NUMBER, o.EMAIL, o.USER_ID, o.ADDRESS, o.NOTE, o.COUPON, o.CREATE_DATE, o.UPDATE_DATE, o.PAYMENT, s.name as STATUS, 
  (select listagg(od.product_id || '--' || pd.name || '--' || im.file_id || '--' || od.quantity || '--' || od.price || '--' || od.discount , ';') within group (order by od.product_id) "product" from ORDERS_DETAIL od left join product_detail pd on od.product_id = pd.id LEFT JOIN images im ON pd.thumbnail= im.id where od.order_id = o.id) as product 
  FROM ORDERS o
  LEFT JOIN STATUS s ON o.status= s.id
  WHERE o.user_id = ${id}
  ORDER BY o.CREATE_DATE desc`;
  console.log(query);
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
        console.log(rows);
        rows = rows.map((item) => {
          item.PRODUCT = item.PRODUCT.split(';').map((t) =>
            t.split('--').map((e) => {
              return isNaN(e) ? e : +e;
            }),
          );
          return Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
          );
        });
        console.log(rows);

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
  db.connect().then(async (connect) => {
    const queryCheckStatus = `select status from orders where id = ${req.body.id}`;
    const status = await connect.execute(queryCheckStatus, {});
    if (status.rows[0].STATUS === 3 || status.rows[0].STATUS === 4) {
      res.status(400).json({ message: 'Status is not satisfy!' });
      db.doRelease(connect);
      return;
    }
    const query = `
    UPDATE ORDERS SET STATUS = 4, note = '${req.body.message}', update_date = '${req.body.date}'
    WHERE user_id = ${id} AND id = ${req.body.id}`;
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
async function getTemplateHtml() {
  console.log('Loading template file in memory');
  try {
    const invoicePath = path.resolve('./invoice-template.html');
    return await readFile(invoicePath, 'utf8');
  } catch (err) {
    console.log(err);
    return Promise.reject('Could not load html template');
  }
}

orderRoute.get('/order/invoice', async (req, res) => {});

module.exports = orderRoute;
