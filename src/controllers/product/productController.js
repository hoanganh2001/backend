const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');

// const Product = require('../../models/product');

const productRoute = express.Router();

productRoute.get('/products', (req, res) => {
  db.connect().then(async (connect) => {
    const where = req.query.category_name
      ? `in (SELECT id FROM categories where name like '%${req.query.category_name}%')`
      : req.query.category_id
      ? `= ${req.query.category_id} `
      : '';
    const logic =
      (req.query.category_id || req.query.category_name
        ? `where pd.id in (select product_detail_id from product_category where category_id ${where}) `
        : '') +
      (req.query.brand_id ? `and pd.brand_id = ${req.query.brand_id}` : '');
    const pageLimit = `FETCH NEXT ${
      req.query.limit ? req.query.limit : 10
    } ROWS ONLY `;
    const pageOffset =
      ' ' +
      (req.query.offset && req.query.offset > 0
        ? `OFFSET ${req.query.offset} ROWS `
        : '');
    const sort_by =
      (req.query.sort_by
        ? `ORDER BY ${req.query.sort_by.toUpperCase()}`
        : 'ORDER BY CREATE_DATE') +
      ` ${req.query.order_by ? req.query.order_by : 'DESC'}`;
    const query =
      `SELECT pd.* FROM product_detail pd ` +
      logic +
      sort_by +
      pageOffset +
      pageLimit;

    const lengthQuery =
      `SELECT count(pd.id)  as length
    FROM product_detail  pd
     ` + logic;
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
            limit: parseInt(req.query.limit),
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
