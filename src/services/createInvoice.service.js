const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const utils = require('util');
const hb = require('handlebars');
const readFile = utils.promisify(fs.readFile);
const sellerData = require('../config/order');
const uploadFile = require('./uploadGGDr.service');
const dayjs = require('dayjs');
const toObject = require('dayjs/plugin/toObject');
const convertNumToText = require('../utils/convertNumToText');
const formatNumber = require('../utils/formatNumber');

const defaultData = {
  seller: sellerData,
  customer: {
    name: '',
    address: '',
    payment: '',
  },
  dateFull: '',
  date: {
    years: '',
    months: '',
    date: '',
  },
  orderData: {
    id: '',
    products: [
      {
        id: null,
        name: '',
        quantity: null,
        unitPrice: null,
        priceBeforeVAT: null,
        VAT: null,
        VAtprice: null,
        Amount: null,
      },
    ],
    totalAmountBeforeVAT: 0,
    totalVAtprice: 0,
    total: 0,
    totalInWord: '',
  },
};

create = async (data, fileName) => {
  return await getTemplateHtml()
    .then(async (res) => {
      // Now we have the html code of our template in res object
      // you can check by logging it on console

      const template = hb.compile(res, { strict: true });
      // we have compile our code with handlebars
      const result = template(data);
      // We can use this to add dyamic data to our handlebas template at run time from database or API as per need. you can read the official doc to learn more https://handlebarsjs.com/
      const html = result;

      // we are using headless mode
      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      // We set the page content as the generated html by handlebars
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
      });
      // we Use pdf function to generate the pdf in the same folder as this file.
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true, //<---
        scale: 1,
        landscape: false,
        pageRanges: '',
      });
      const Readable = require('stream').Readable;

      const s = new Readable();
      s.push(pdf);
      s.push(null);
      const id = await uploadFile.uploadOrder(s, fileName);
      await browser.close();
      return id;
    })
    .catch((err) => {
      console.error(err);
    });
};

async function getTemplateHtml() {
  console.log('Loading template file in memory');
  try {
    const invoicePath = path.resolve('./invoice-template.html');
    return await readFile(invoicePath, 'utf8');
  } catch (err) {
    console.log(err);
    return Promise.reject('Could not load html template');
  }
}

function generateData(order, createdDate) {
  dayjs.extend(toObject);
  const data = structuredClone(defaultData);
  const productDefault = structuredClone(defaultData.orderData.products[0]);
  Object.keys(data.customer).forEach((t) => {
    data.customer[t] = order[t];
  });
  const currentDate = dayjs(createdDate);
  const currentDateObject = dayjs(createdDate).toObject();
  Object.keys(data.date).forEach((t) => {
    data.date[t] = currentDateObject[t];
  });
  data.dateFull = dayjs(currentDate).format('DD/MM/YYYY');
  data.orderData.id = order.id;
  data.orderData.products = order.product.map((item, index) => {
    const productDefault = structuredClone(defaultData.orderData.products[0]);
    productDefault.id = item.id;
    productDefault.name = item.name;
    productDefault.quantity = item.quantity;
    productDefault.unitPrice = item.price * (item.discount ? item.discount : 1);
    productDefault.priceBeforeVAT =
      productDefault.quantity * productDefault.unitPrice;
    productDefault.VAT = 10;
    productDefault.VAtprice =
      productDefault.priceBeforeVAT * productDefault.VAT;
    productDefault.Amount =
      productDefault.priceBeforeVAT + productDefault.VAtprice;
    data.orderData.totalAmountBeforeVAT += productDefault.priceBeforeVAT;
    data.orderData.totalVAtprice += productDefault.priceBeforeVAT;
    data.orderData.total += productDefault.Amount;
    if (index === order.product.length - 1) {
      data.orderData.totalInWord = convertNumToText(data.orderData.total);
      data.orderData.totalAmountBeforeVAT = formatNumber(
        data.orderData.totalAmountBeforeVAT,
        ',',
      );
      data.orderData.totalVAtprice = formatNumber(
        data.orderData.totalVAtprice,
        ',',
      );
      data.orderData.total = formatNumber(data.orderData.total, ',');
    }
    Object.keys(productDefault).forEach((t) => {
      productDefault[t] = isNaN(+productDefault[t])
        ? productDefault[t]
        : formatNumber(productDefault[t], ',');
    });
    return productDefault;
  });
  return data;
}

const createInvoice = { create, generateData };
module.exports = createInvoice;
