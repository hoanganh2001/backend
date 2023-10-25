const express = require("express");
const News = require('../../models/news')


const newsRoute = express.Router();

newsRoute.get('/news-lastest', (req,res)=>{
    News.find({},{},{limit: 5,skip: 0,sort: {create_date: -1}})
    .then((news) => {
        res.json({data: news})
    })
    .catch((err)=> {
        res.status(400).json({error: err})
    })
})

newsRoute.get('/news-list', (req,res)=>{
    const paginatorOtion = {limit: req.query.limit,skip: req.query.skip + 5}
    const resData = {data: [], meta: {length: 0}}
    News.countDocuments({}).then((count)=>{resData.meta.length = count - 5;})
    News.find({},'_id name img create_date view author',paginatorOtion).sort({create_date: -1})
    .then((news) => {
        resData.data = news;
        res.json(resData);
    })
    .catch((err)=> {
        res.status(400).json({error: err})
    })
})

newsRoute.get('/new', (req,res)=>{
    const newId = req.query.id
    News.findById(newId)
    .then((news) => {
        res.json({data:news});
    })
    .catch((err)=> {
        res.status(400).json({error: err})
    })
})

module.exports = newsRoute