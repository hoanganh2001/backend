const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');

// const Product = require('../../models/product');

const productRoute = express.Router();

function getQueryString(params, logicOnly) {
  let where = '';
  let page = '';
  let sort = '';
  Object.keys(params).forEach((t) => {
    const keyDetail = paramsKey.find((k) => {
      return k.keys.includes(t);
    });
    switch (keyDetail?.type) {
      case 'logic':
        if (where.length === 0) {
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
  if (page.length === 0) {
    page = `FETCH NEXT 28 ROWS ONLY `;
  } else if (sort.length === 0) {
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
    keys: ['category_id', 'brand_id', 'type_id', 'feature_id'],
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

productRoute.get('/products', (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `SELECT pd.* FROM product_detail pd ` + getQueryString(req.query);
    const lengthQuery =
      `SELECT count(pd.id) as length FROM product_detail pd ` +
      getQueryString(req.query, true);
    console.log(query);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        console.error(err.message);
        res.status(500).send('Error getting data from DB');
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
productRoute.get('/product-detail/', (req, res) => {
  console.log(1);
  console.log(req);
});
module.exports = productRoute;
