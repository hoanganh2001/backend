const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Product = new Schema({
  id: ObjectId,
  img: String,
  name: String,
  cost: Number,
  discount: Number,
  view: Number,
  category: ObjectId,
});

module.exports = mongoose.model('Product', Product);
