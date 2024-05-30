const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');
const jwt = require('jsonwebtoken');
const config = require('../../config/auth');
// const Product = require('../../models/product');
oracledb.fetchAsString = [oracledb.CLOB];

const productRoute = express.Router();

function getQueryString(params, logicOnly, haveDefaultLogic) {
  let where = '';
  let page = '';
  let sort = '';
  Object.keys(params).forEach((t) => {
    const keyDetail = paramsKey.find((k) => {
      return k.keys.includes(t);
    });
    switch (keyDetail?.type) {
      case 'logic':
        if (where.length === 0 && !haveDefaultLogic) {
          where += `where ${generateWhereLogicQuery(keyDetail, params, t)} `;
        } else {
          where += `and ${generateWhereLogicQuery(keyDetail, params, t)} `;
        }
        break;
      case 'page':
        if (t === 'limit') {
          page += `FETCH NEXT ${params[t]} ROWS ONLY `;
        } else {
          page = `OFFSET ${params[t]} ROWS`.concat(' ', page);
        }
        break;
      case 'sort':
        if (t === 'order_by') {
          sort += `ORDER BY ${params[t]} `;
        } else {
          sort += params[t] + ', pd.create_Date';
        }
        break;
      default:
        break;
    }
  });
  if (page.trim().length === 0) {
    page = `FETCH NEXT 28 ROWS ONLY `;
  } else if (sort.trim().length === 0) {
    sort = `ORDER BY CREATE_DATE DESC`;
  }
  if (logicOnly) return where;
  return where + sort + ' ' + page;
}

function generateWhereLogicQuery(keyDetail, paramsList, param) {
  if (keyDetail?.compare === 'text') {
    return `pd.id in (select product_detail_id from product_category where ${param.replace(
      '_name',
      '_id',
    )} in (SELECT id FROM ${
      param.includes('category') ? 'categories' : param.replace('_name', 's')
    } where name like '%${paramsList[param]}%'))`;
  }
  if (keyDetail?.compare === 'number') {
    if (param === 'id')
      return `pd.id ${
        Array.isArray(paramsList[param])
          ? `in (${paramsList[param]})`
          : `= ${paramsList[param]} `
      }`;
    return `pd.id in (select product_detail_id from product_category where ${param} in (SELECT id FROM ${
      param.includes('category') ? 'categories' : param.replace('_id', 's')
    } where ${
      Array.isArray(paramsList[param])
        ? `${param} in (${paramsList[param]}))`
        : `${param}  = ${paramsList[param]}) `
    })`;
  }
  if (keyDetail?.compare === 'range') {
    return param.includes('start')
      ? `pd.price >= ${paramsList[param]}`
      : `pd.price <= ${paramsList[param]}`;
  }
  return;
}

paramsKey = [
  {
    keys: ['category_id', 'brand_id', 'type_id', 'feature_id', 'id'],
    type: 'logic',
    compare: 'number',
  },
  {
    keys: ['category_name'],
    type: 'logic',
    compare: 'text',
  },
  {
    keys: ['start_price', 'end_price'],
    type: 'logic',
    compare: 'range',
  },
  {
    keys: ['limit', 'offset'],
    type: 'page',
  },
  {
    keys: ['order_by', 'sort_by'],
    type: 'sort',
  },
];

productRoute.get('/products', async (req, res) => {
  const session_id = req.cookies.SessionID;
  const id = session_id
    ? await jwt.verify(session_id, config.secret, async (err, decoded) => {
        if (err) {
          // if token has been altered or has expired, return an unauthorized error
          return res.status(401).json({
            message: err.message | 'This session has expired. Please login',
          });
        }
        return decoded.id;
      })
    : null;
  db.connect().then(async (connect) => {
    const query =
      `SELECT pd.*${
        id
          ? `, 
      (select count(fp.id) from favorite_product fp where fp.user_id = ${id} and fp.product_id = pd.id)
      as FAVORITE`
          : ''
      }, im.file_id as thumbnail_url FROM product_detail pd left join images im on pd.thumbnail = im.id
      ` + getQueryString(req.query);
    const lengthQuery =
      `SELECT count(pd.id) as length FROM product_detail pd ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error!' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRows((err, rows) => {
        if (err) throw err;
        rows = rows.map((item) => {
          item['FAVORITE'] = Boolean(item['FAVORITE']);
          return Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
          );
        });
        res.json({
          data: rows,
          meta: {
            limit: parseInt(req.query.limit ? req.query.limit : 28),
            offset: parseInt(req.query.offset ? req.query.offset : 0),
            length: length,
          },
        });
      });
      db.doRelease(connect);
    });
  });
});

productRoute.get('/promotional-product', async (req, res) => {
  const session_id = req.cookies.SessionID;
  const id = session_id
    ? await jwt.verify(session_id, config.secret, async (err, decoded) => {
        if (err) {
          // if token has been altered or has expired, return an unauthorized error
          return res.status(401).json({
            message: err.message | 'This session has expired. Please login',
          });
        }
        return decoded.id;
      })
    : null;
  db.connect().then(async (connect) => {
    const query =
      `SELECT pd.*${
        id
          ? `, 
      (select count(fp.id) from favorite_product fp where fp.user_id = ${id} and fp.product_id = pd.id)
      as FAVORITE`
          : ''
      } , im.file_id as thumbnail_url FROM product_detail pd left join images im on pd.thumbnail = im.id where gift_id is not null or discount is not null ` +
      getQueryString(req.query, false, true);
    const lengthQuery =
      `SELECT count(id) as length FROM product_detail pd where gift_id is not null or discount is not null ` +
      getQueryString(req.query, true, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
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
          return Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
          );
        });
        res.json({
          data: rows,
          meta: {
            limit: parseInt(req.query.limit ? req.query.limit : 28),
            offset: parseInt(req.query.offset ? req.query.offset : 0),
            length: length,
          },
        });
      });
      db.doRelease(connect);
    });
  });
});

productRoute.get('/product-detail/:id', (req, res) => {
  const productId = req.params.id;
  db.connect().then(async (connect) => {
    connect.execute(
      `select pd.*,brands.name as brand_name, 
      (SELECT LISTAGG(img.id||','||img.file_id, ';')  as file_id
      FROM images img  where img.product_id = ${productId} group by img.product_id) as image
      from product_detail pd left join brands on pd.brand_id = brands.id where pd.id = ${productId}`,
      {},
      { resultSet: true },
      (err, result) => {
        if (err) {
          res.status(500).json({ message: 'Internal Server Error!' });
          db.doRelease(connect);
          return;
        }
        result.resultSet.getRow((err, row) => {
          if (err) throw err;
          row = Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
          );
          Object.keys(row).forEach((key) => {
            if (row[key]?.type?.columnTypeName.toLowerCase() === 'nclob') {
              row[key].getData().then((value) => {
                row[key] = value;
              });
            }
            if (key.toLowerCase() === 'image') {
              row[key] = row[key]?.split(';').map((i) => {
                const imgItem = i.split(',');
                return {
                  id: imgItem[0],
                  file_id: imgItem[1],
                };
              });
            }
          }),
            res.json({ data: row });
          db.doRelease(connect);
          return;
        });
      },
    );
  });
});

productRoute.post('/product-favorite/:id', async (req, res) => {
  const productId = req.params.id;
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
    declare
      l_exst number;
    begin
      SELECT COUNT(*) INTO l_exst FROM FAVORITE_PRODUCT WHERE USER_ID = ${id} AND PRODUCT_ID = ${productId};
      if l_exst = 1 
      then
        DELETE FROM FAVORITE_PRODUCT WHERE USER_ID = ${id} AND PRODUCT_ID = ${productId};
      else
        INSERT INTO FAVORITE_PRODUCT(USER_ID, PRODUCT_ID) VALUES(${id},${productId});
      end if;
    end;
  `;

  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error!' });
        db.doRelease(connect);
        return;
      }
      const message = result.rowsAffected ? 'success' : 'fail';
      res.status(200).json({ message: message, isLogIn: !!id });
      db.doRelease(connect);
    });
  });
});

productRoute.get('/product-favorite', async (req, res) => {
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
  db.connect().then(async (connect) => {
    const query =
      `SELECT pd.*, im.file_id as thumbnail_url, 1 as FAVORITE FROM FAVORITE_PRODUCT fp inner join product_detail pd on pd.id = fp.product_id left join images im on pd.thumbnail = im.id WHERE USER_ID = ${id}` +
      getQueryString(req.query, true);
    const lengthQuery =
      `SELECT count(pd.id) as length FROM FAVORITE_PRODUCT pd WHERE USER_ID = ${id}` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error!' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRows((err, rows) => {
        if (err) throw err;
        rows = rows.map((item) => {
          item['FAVORITE'] = Boolean(item['FAVORITE']);
          return Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
          );
        });
        res.json({
          data: rows,
          meta: {
            limit: parseInt(req.query.limit ? req.query.limit : 28),
            offset: parseInt(req.query.offset ? req.query.offset : 0),
            length: length,
          },
        });
      });
      db.doRelease(connect);
    });
  });
});
module.exports = productRoute;
