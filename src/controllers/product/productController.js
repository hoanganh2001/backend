const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');

// const Product = require('../../models/product');

const productRoute = express.Router();

productRoute.get('/products', (req, res) => {
  db.connect().then((connect) => {
    const where = req.query.category_name
      ? `in (SELECT id FROM categories where name like '%${req.query.category_name}%')`
      : req.query.category_id
      ? `= ${req.query.category_id}`
      : '';
    const logic =
      req.query.category_id || req.query.category_name
        ? `where pd.id in (select product_detail_id from product_category where category_id ${where})`
        : '';
    const pageLimit = `FETCH NEXT ${
      req.query.limit ? req.query.limit : 10
    } ROWS ONLY `;
    const pageOffset =
      ' ' + (req.query.offset ? `OFFSET ${req.query.offset} ROWS` : '');
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
        res.json({ data: rows });
      });
      db.doRelease(connect);
    });
  });
  // const paginatorOtion = { limit: req.query.limit, skip: req.query.skip };
  // const sortOption = [[req.query.sort_by, req.query.order_by]];
  // let searchOption;
  // if (req.query.category) searchOption = { category: req.query.category };
  // Product.find(searchOption, {}, paginatorOtion)
  //   .sort(sortOption)
  //   .then((products) => {
  //     res.json({ data: products });
  //   })
  //   .catch((err) => {
  //     res.status(400).json({ error: err });
  //   });
});

module.exports = productRoute;
