const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Brand = new Schema({
    id: ObjectId,
    img: String,
    name: String,
  });
  
  module.exports = mongoose.model('Brand', Brand)
  