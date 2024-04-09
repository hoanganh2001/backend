const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');
const searchRoute = express.Router();

searchRoute.get('/search', async (req, res) => {
  const searchParam = req.query.name;
  db.connect().then(async (connect) => {
    try {
      const productQuery = `SELECT pd.id, pd.name, pd.price, pd.discount,im.file_id as IMAGE from product_detail pd left join images im on pd.thumbnail = im.id where lower(pd.name) like lower('%${searchParam}%')`;
      const newQuery = `SELECT n.id, n.name, im.file_id as IMAGE from news n left join images im on n.THUMBNAIL_ID = im.id where lower(n.name) like lower('%${searchParam}%')`;

      const productResult = await connect.execute(productQuery, {});
      const productList =
        productResult.rows.length > 0
          ? productResult.rows.map((item) => {
              return Object.fromEntries(
                Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
              );
            })
          : [];
      const newResult = await connect.execute(newQuery, {});
      const newList =
        newResult.rows.length > 0
          ? newResult.rows.map((item) => {
              return Object.fromEntries(
                Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
              );
            })
          : [];
      res.status(200).json({
        data: { products: productList, news: newList },
      });
      db.doRelease(connect);
      return;
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: 'Error getting data from DB' });
      db.doRelease(connect);
      return;
    }
  });
});

module.exports = searchRoute;
