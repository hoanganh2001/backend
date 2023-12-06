const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');
const adminRoute = express.Router();
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
          : `= ${paramsList[param]}) `
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
adminRoute.get('/products', async (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `SELECT pd.*,pc.category_id,c.name as category_name FROM product_detail pd inner join product_category pc on pd.id = pc.product_detail_id inner join categories c on c.id = pc.category_id 
        ` + getQueryString(req.query);
    const lengthQuery =
      `SELECT count(pd.id) as length FROM product_detail pd ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
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

adminRoute.delete('/product/:id', async (req, res) => {
  const productId = req.params.id;
  const query = `
    begin
        DELETE FROM PRODUCT_CATEGORY WHERE PRODUCT_DETAIL_ID = ${productId};
        DELETE FROM PRODUCT_DETAIL WHERE ID = ${productId};
    end;
  `;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res
          .status(500)
          .json({ message: err.message | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      console.log(result);
      const message = result.rowsAffected ? 'success' : 'fail';
      res.status(200).json({ message: message });
      db.doRelease(connect);
    });
  });
});

module.exports = adminRoute;
