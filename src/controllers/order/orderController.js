const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');
const jwt = require('jsonwebtoken');
const config = require('../../config/auth');
const uploadGGDr = require('../../services/uploadGGDr.service');
const dayjs = require('dayjs');
const vnpConfig = require('../../config/vnPay.json');
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
    if (req.body.coupon) {
      const couponCheck = await connect.execute(
        `UPDATE coupon SET quantity = QUANTITY - 1 where id = ${req.body.coupon} and quantity > 0`,
        {},
        { autoCommit: true },
      );
      if (couponCheck.rowsAffected === 0) {
        res.status(500).json({
          message: 'Có lỗi khi áp dụng mã giảm giá! Vui lòng thử lại!',
        });
        db.doRelease(connect);
        return;
      }
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
      INSERT INTO ORDERS(USER_ID,NAME,ADDRESS,EMAIL,PHONE_NUMBER,NOTE,PAYMENT,COUPON,CREATE_DATE,Amount,STATUS)
      VALUES(${id}, :name, :address,:email,:phone_number,:note,:payment,:coupon,:create_date,:amount,1)
      returning id into order_id;
      :id := order_id;
      ${updateProduct}
    end;`;
    connect.execute(query, bindValue, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error!' });
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
  const query = `SELECT o.ID, o.NAME, o.PHONE_NUMBER, o.EMAIL, o.USER_ID, o.ADDRESS, o.NOTE, o.COUPON, o.CREATE_DATE, o.UPDATE_DATE, o.PAYMENT, s.name as STATUS, o.INVOICE, o.amount, c.value as coupon_value, c.unit as coupon_unit,
  (select listagg(od.product_id || '--' || pd.name || '--' || im.file_id || '--' || od.quantity || '--' || od.price || '--' || od.discount , ';') within group (order by od.product_id) "product" from ORDERS_DETAIL od left join product_detail pd on od.product_id = pd.id LEFT JOIN images im ON pd.thumbnail= im.id where od.order_id = o.id) as product 
  FROM ORDERS o
  LEFT JOIN STATUS s ON o.status= s.id
  LEFT JOIN coupon c ON o.coupon= c.id
  WHERE o.user_id = ${id}
  ORDER BY o.CREATE_DATE desc`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        console.log(err);

        res.status(500).json({ message: 'Internal Server Error!' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRows((err, rows) => {
        if (err) throw err;
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
        res.status(500).json({ message: 'Internal Server Error!' });
        db.doRelease(connect);
        return;
      }
      if (result.rowsAffected === 1) {
        res.status(200).json({ message: 'success' });
      } else {
        res.status(500).json({ message: 'something wrong' });
      }
      db.doRelease(connect);
    });
  });
});

orderRoute.get('/order/invoice/:id', async (req, res) => {
  const invoiceID = req.params.id;
  const session_id = req.cookies.SessionID;

  if (!session_id) {
    return res.status(400).json({
      message: 'Please login!',
    });
  }
  db.connect().then(async (connect) => {
    const result = await connect.execute(
      `Select file_id from invoices where id = ${invoiceID}`,
    );

    const fileId = result.rows[0].FILE_ID;

    const file = await uploadGGDr.exportPdf(fileId);

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const iframe = `<iframe src=data:application/pdf;base64,${base64} width=100% height=100%></iframe>`;
    res.status(200).json({ data: iframe });
  });
});

orderRoute.get('/order/coupon', async (req, res) => {
  const query = `SELECT id, value, unit, quantity, start_date, expired_date from coupon where Lower(name) = '${req.query.name?.toLowerCase()}'`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
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
          res.status(404).json({ message: 'Invalid Coupon!' });
          db.doRelease(connect);
          return;
        }
        row = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
        );
        if (
          dayjs().isAfter(dayjs(row.expired_date)) ||
          dayjs().isBefore(dayjs(row.start_date))
        ) {
          res
            .status(500)
            .json({ message: 'Coupon đã hết hạn hoặc chưa bắt đầu!' });
          db.doRelease(connect);
          return;
        }
        if (row.quantity < 1) {
          res.status(500).json({ message: 'Coupon đã số lượng sử dụng!' });
          db.doRelease(connect);
          return;
        }
        res.json({
          data: {
            id: row.id,
            value: row.value,
            unit: row.unit,
          },
        });
      });
      db.doRelease(connect);
    });
  });
});

orderRoute.post('/order/create_payment_url', function (req, res, next) {
  process.env.TZ = 'Asia/Ho_Chi_Minh';

  const date = new Date();
  let createDate = dayjs(date).format('YYYYMMDDHHmmss');

  let ipAddr =
    req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket.remoteAddress;

  let tmnCode = vnpConfig['vnp_TmnCode'];
  let secretKey = vnpConfig['vnp_HashSecret'];
  let vnpUrl = vnpConfig['vnp_Url'];
  let returnUrl = vnpConfig['vnp_ReturnUrl'];
  const orderId = req.body.params.orderId;
  const amount = req.body.params.amount;
  const bankCode = req.body.params.bankCode;
  const locale = req.body.params.language;
  const currCode = 'VND';
  let vnp_Params = {};
  vnp_Params['vnp_Version'] = '2.1.0';
  vnp_Params['vnp_Command'] = 'pay';
  vnp_Params['vnp_TmnCode'] = tmnCode;
  vnp_Params['vnp_Locale'] = locale;
  vnp_Params['vnp_CurrCode'] = currCode;
  vnp_Params['vnp_TxnRef'] = orderId;
  vnp_Params['vnp_OrderInfo'] = 'Thanh toan cho ma GD:' + orderId;
  vnp_Params['vnp_OrderType'] = 'other';
  vnp_Params['vnp_Amount'] = amount * 100;
  vnp_Params['vnp_ReturnUrl'] = returnUrl;
  vnp_Params['vnp_IpAddr'] = ipAddr;
  vnp_Params['vnp_CreateDate'] = createDate;
  if (bankCode !== null && bankCode !== '') {
    vnp_Params['vnp_BankCode'] = bankCode;
  }

  vnp_Params = sortObject(vnp_Params);

  let querystring = require('qs');
  let signData = querystring.stringify(vnp_Params, { encode: false });
  let crypto = require('crypto');
  let hmac = crypto.createHmac('sha512', secretKey);
  let signed = hmac.update(new Buffer(signData, 'utf-8')).digest('hex');
  vnp_Params['vnp_SecureHash'] = signed;
  vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: false });
  res.set('Content-Type', 'text/html');
  res.send(JSON.stringify(vnpUrl));
});

orderRoute.get('/order/vnpay_return', function (req, res, next) {
  let vnp_Params = req.query;
  let secureHash = vnp_Params['vnp_SecureHash'];

  delete vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHashType'];

  vnp_Params = sortObject(vnp_Params);

  let tmnCode = vnpConfig['vnp_TmnCode'];
  let secretKey = vnpConfig['vnp_HashSecret'];
  const TransactionStatus = vnp_Params['vnp_TransactionStatus'];
  let querystring = require('qs');
  let signData = querystring.stringify(vnp_Params, { encode: false });
  let crypto = require('crypto');
  let hmac = crypto.createHmac('sha512', secretKey);
  let signed = hmac.update(new Buffer(signData, 'utf-8')).digest('hex');
  if (secureHash === signed) {
    console.log(TransactionStatus);
    //Kiem tra xem du lieu trong db co hop le hay khong va thong bao ket qua
    if (TransactionStatus == '00') {
      const orderId = req.query.vnp_TxnRef;
      db.connect().then(async (connect) => {
        const sql = `UPDATE orders SET status = 5 WHERE id = ${vnp_Params['vnp_TxnRef']}`;
        await connect.execute(sql, {}, { autoCommit: true });
        db.doRelease(connect);
      });
      res.redirect(303, 'http://localhost:4200/?payment=true');
    } else {
      res.redirect(303, 'http://localhost:4200/?payment=false');
    }
  } else {
    res.render('success', { code: '97' });
  }
});

function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
  }
  return sorted;
}
module.exports = orderRoute;
