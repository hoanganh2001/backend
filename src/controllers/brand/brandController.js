const express = require("express");
const Brand = require('../../models/brands')


const brandRoute = express.Router();

brandRoute.get('/brands', (req,res)=>{
    const paginatorOtion = {limit: req.query.limit,skip: req.query.skip}
    Brand.find({},{},paginatorOtion)
    .then((brand) => {
        res.json({data: brand})
    })
    .catch((err)=> {
        res.status(400).json({error: err})
    })
})

module.exports = brandRoute