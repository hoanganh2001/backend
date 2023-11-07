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
    const query =
      `SELECT * FROM brands ORDER BY NAME ASC` + pageOffset + pageLimit;

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
