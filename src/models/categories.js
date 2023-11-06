const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Category = new Schema({
  id: ObjectId,
  name: String,
});

module.exports = mongoose.model('Category', Category);
