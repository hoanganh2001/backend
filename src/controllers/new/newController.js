const express = require('express');

const newsRoute = express.Router();
const db = require('../../config/db');
const oracledb = require('oracledb');

oracledb.fetchAsString = [oracledb.CLOB];
newsRoute.get('/news-lastest', (req, res) => {
  db.connect().then(async (connect) => {
    const sqlQuery = `Select n.*, im.file_id as image from news n left join images im on n.thumbnail_id = im.id order by create_date OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY `;
    connect.execute(sqlQuery, {}, { resultSet: true }, (err, result) => {
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
        res.json({ data: rows });
        db.doRelease(connect);
      });
    });
  });
});

newsRoute.get('/news-list', (req, res) => {
  db.connect().then(async (connect) => {
    const sqlQuery = `Select n.*, im.file_id as image from news n left join images im on n.thumbnail_id = im.id order by create_date OFFSET ${
      req.query.offset + 5
    } ROWS FETCH NEXT ${req.query.limit} ROWS ONLY `;
    console.log(sqlQuery);
    const lengthQuery = `SELECT count(id) as length FROM news`;
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(sqlQuery, {}, { resultSet: true }, (err, result) => {
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
        res.json({ data: rows, meta: length - 5 });
        db.doRelease(connect);
      });
    });
  });
});

newsRoute.get('/new/:id', (req, res) => {
  const newId = req.params.id;
  db.connect().then(async (connect) => {
    const sqlQuery = `Select n.*, im.file_id as image from news n left join images im on n.thumbnail_id = im.id where n.id = ${newId} `;
    connect.execute(sqlQuery, {}, { resultSet: true }, (err, result) => {
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
        res.json({ data: rows });
        db.doRelease(connect);
      });
    });
  });
});

module.exports = newsRoute;
