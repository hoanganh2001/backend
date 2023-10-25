const express = require("express")
const db = require("./config/db")
const productRoute = require("./controllers/product/productController")
const bodyParser = require('body-parser');
const cors = require('cors');
const brandRoute = require("./controllers/brand/brandController");
const newsRoute = require("./controllers/new/newController");

db.connect()
const corsOptions = {
  origin: "*",
  credentials: true,
  methods: ["GET","PUT","POST","DELETE"],
  allowedHeaders: "*",
  exposedHeaders: "*",
}
const app = new express()
const port = 3000

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true, 
}));

app.use('/api',productRoute)
app.use('/api',brandRoute)
app.use('/api',newsRoute)

app.get('/', (req, res) => {
  res.send('Hello World!')
})


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})