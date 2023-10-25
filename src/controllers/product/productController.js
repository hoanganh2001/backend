const express = require("express");
const Product = require('../../models/product')


const productRoute = express.Router();

productRoute.get('/products', (req,res)=>{
    Product.find({})
    .then((products) => {
        res.json(products)
    })
    .catch((err)=> {
        res.status(400).json({error: error})
    })
})

module.exports = productRoute