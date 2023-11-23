const express = require('express');
const cors = require('cors');

const db = require('./config/db');
const bodyParser = require('body-parser');

const productRoute = require('./controllers/product/productController');
const brandRoute = require('./controllers/brand/brandController');
const categoryRoute = require('./controllers/category/categoryController');
const newsRoute = require('./controllers/new/newController');
const userRoute = require('./controllers/user/userController');

db.createPool();
const corsOptions = {
  origin: 'http://localhost:4200',
  credentials: true,
  exposedHeaders: '*',
};
const app = new express();
const port = 3000;

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/api', productRoute);
app.use('/api', brandRoute);
app.use('/api', categoryRoute);
app.use('/api', newsRoute);
app.use('/api', cors(corsOptions), userRoute);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
