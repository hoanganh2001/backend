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
      `SELECT b.*, im.file_id as thumbnail_url from BRANDS b left join images im on b.image = im.id ${where} ORDER BY NAME ASC` +
      pageOffset +
      pageLimit;

    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
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
        res.json({ data: rows });
      });
      db.doRelease(connect);
    });
  });
});

brandRoute.get('/categories-of-brand', (req, res) => {
  if (!req.query.brand_id) {
    res.status(404).send('Do not have brand id');
    return;
  }
  db.connect().then((connect) => {
    const where = `where pd.brand_id = ${req.query.brand_id}`;

    const query = `SELECT pc.category_id as id, c.name FROM product_detail pd left join product_category pc on pd.id = pc.product_detail_id left join categories c on c.id = pc.category_id
      where pd.brand_id = ${req.query.brand_id} group by pc.category_id, c.name  ORDER BY id ASC`;

    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
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
        res.json({ data: rows });
      });
      db.doRelease(connect);
    });
  });
});

brandRoute.get('/brands-with-category', (req, res) => {
  if (!req.query.category_id) {
    res.status(404).send('Do not have brand id');
    return;
  }
  db.connect().then((connect) => {
    const query = `SELECT pd.brand_id as id, b.name FROM product_category pc 
    left join product_detail pd on pd.id = pc.product_detail_id 
    left join brands b on b.id = pd.brand_id 
    where pc.category_id = ${req.query.category_id} 
    group by pd.brand_id, b.name
    order by b.name`;

    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
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
        res.json({ data: rows });
      });
      db.doRelease(connect);
    });
  });
});

module.exports = brandRoute;
