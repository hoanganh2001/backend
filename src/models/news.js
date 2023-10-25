const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const New = new Schema({
    id: ObjectId,
    img: String,
    name: String,
    content: String,
    author: String,
    view: Number,
    create_date: String
  });
  
  module.exports = mongoose.model('New', New)
  