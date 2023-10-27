const express = require('express');
const Product = require('../../models/product');

const productRoute = express.Router();

productRoute.get('/products', (req, res) => {
  const paginatorOtion = { limit: req.query.limit, skip: req.query.skip };
  const sortOption = [[req.query.sort_by, req.query.order_by]];
  let searchOption;
  if (req.query.category) searchOption = { category: req.query.category };
  Product.find(searchOption, {}, paginatorOtion)
    .sort(sortOption)
    .then((products) => {
      res.json({ data: products });
    })
    .catch((err) => {
      res.status(400).json({ error: err });
    });
});

module.exports = productRoute;
