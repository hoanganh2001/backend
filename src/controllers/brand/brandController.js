const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');
const brandRoute = express.Router();

brandRoute.get('/brands', (req, res) => {
  db.connect().then((connect) => {
    const pageLimit = req.query.limit
      ? `FETCH NEXT ${req.query.limit} ROWS ONLY `
      : '';
    const pageOffset =
      ' ' + (req.query.offset ? `OFFSET ${req.query.offset} ROWS` : '');

    const where = req.query.brand_name
      ? `where name like '${req.query.brand_name}'`
      : '';
    const query =
      `SELECT * FROM brands ${where} ORDER BY NAME ASC` +
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
});

brandRoute.get('/brands-categories', (req, res) => {
  if (!req.query.brand_id) {
    res.status(404).send('Do not have brand id');
    db.doRelease(connect);
    return;
  }
  db.connect().then((connect) => {
    const where = `where pd.brand_id = ${req.query.brand_id}`;

    const query = `SELECT pc.category_id as id, c.name FROM product_detail pd left join product_category pc on pd.id = pc.product_detail_id left join categories c on c.id = pc.category_id
      where pd.brand_id = ${req.query.brand_id} group by pc.category_id, c.name  ORDER BY id ASC`;

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
});

module.exports = brandRoute;
