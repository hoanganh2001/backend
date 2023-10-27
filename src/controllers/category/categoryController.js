const express = require("express");
const Category = require('../../models/categorys')


const categoryRoute = express.Router();

categoryRoute.get('/categorys', (req,res)=>{
    const paginatorOtion = {limit: req.query.limit,skip: req.query.skip}
    Category.find({},{},paginatorOtion)
    .then((category) => {
        res.json({data: category})
    })
    .catch((err)=> {
        res.status(400).json({error: err})
    })
})

module.exports = categoryRoute