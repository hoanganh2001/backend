const express = require('express');
const db = require('../../config/db');
const adminRoute = express.Router();
const uploadFile = require('../../services/uploadGGDr.service');
const formidable = require('formidable');
const oracledb = require('oracledb');

function getQueryString(params, logicOnly, haveDefaultLogic, sortDFByName) {
  let where = '';
  let page = '';
  let sort = '';
  Object.keys(params).forEach((t) => {
    const keyDetail = paramsKey.find((k) => {
      return k.keys.includes(t);
    });
    switch (keyDetail?.type) {
      case 'logic':
        if (where.length === 0 && !haveDefaultLogic) {
          where += `where ${generateWhereLogicQuery(keyDetail, params, t)} `;
        } else {
          where += `and ${generateWhereLogicQuery(keyDetail, params, t)} `;
        }
        break;
      case 'page':
        if (t === 'limit') {
          page += `FETCH NEXT ${params[t]} ROWS ONLY `;
        } else {
          page = `OFFSET ${params[t]} ROWS`.concat(' ', page);
        }
        break;
      case 'sort':
        if (t === 'order_by') {
          sort = sort.length = 0
            ? `ORDER BY ${params[t]} `
            : `ORDER BY ${params[t]} ` + sort;
        } else {
          sort +=
            (params['order_by'] === 'price'
              ? params[t] === 'desc'
                ? params[t] + ' nulls last'
                : params[t] + ' nulls first'
              : params[t]) + ', pd.create_Date';
        }
        break;
      default:
        break;
    }
  });
  if (page.trim().length === 0) {
    page = `FETCH NEXT 28 ROWS ONLY `;
  } else if (sort.trim().length === 0) {
    sort = sortDFByName ? `ORDER BY NAME` : `ORDER BY CREATE_DATE DESC`;
  }
  if (logicOnly) return where;
  return where + sort + ' ' + page;
}

function generateWhereLogicQuery(keyDetail, paramsList, param) {
  if (keyDetail?.compare === 'text') {
    return param.includes('category')
      ? `pd.id in (select product_detail_id from product_category where ${param.replace(
          '_name',
          '_id',
        )} in (SELECT id FROM ${
          param.includes('category')
            ? 'categories'
            : param.replace('_name', 's')
        } where name like '%${paramsList[param]}%'))`
      : `LOWER(pd.${param}) like '%${paramsList[param].toLowerCase()}%'`;
  }
  if (keyDetail?.compare === 'number') {
    if (param === 'id')
      return `pd.id ${
        Array.isArray(paramsList[param])
          ? `in (${paramsList[param]})`
          : `= ${paramsList[param]}`
      }`;
    return `pd.id in (select product_detail_id from product_category where ${param} in (SELECT id FROM ${
      param.includes('category') ? 'categories' : param.replace('_id', 's')
    } where ${
      Array.isArray(paramsList[param])
        ? `${param} in (${paramsList[param]}))`
        : `${param}  = ${paramsList[param]}) `
    })`;
  }
  if (keyDetail?.compare === 'range') {
    return param.includes('start')
      ? `pd.price >= ${paramsList[param]}`
      : `pd.price <= ${paramsList[param]}`;
  }
  return;
}

paramsKey = [
  {
    keys: ['category_id', 'brand_id', 'type_id', 'feature_id', 'id'],
    type: 'logic',
    compare: 'number',
  },
  {
    keys: ['category_name', 'name'],
    type: 'logic',
    compare: 'text',
  },
  {
    keys: ['start_price', 'end_price'],
    type: 'logic',
    compare: 'range',
  },
  {
    keys: ['limit', 'offset'],
    type: 'page',
  },
  {
    keys: ['order_by', 'sort_by'],
    type: 'sort',
  },
];

adminRoute.get('/products', async (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `SELECT * FROM product_detail pd left join product_list pl on pd.id= pl.id ` +
      getQueryString(req.query);
    const lengthQuery =
      `SELECT count(pd.id) as length FROM product_detail pd ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRows((err, rows) => {
        if (err) throw err;
        rows = rows.map((item) => {
          return Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
          );
        });
        res.json({
          data: rows,
          meta: {
            limit: parseInt(req.query.limit ? req.query.limit : 28),
            offset: parseInt(req.query.offset ? req.query.offset : 0),
            length: length,
          },
        });
      });
      db.doRelease(connect);
    });
  });
});

adminRoute.get('/product/:id', async (req, res) => {
  const productID = req.params.id;
  db.connect().then(async (connect) => {
    const query =
      `SELECT pd.*, pct.category_id,pct.type_id, pct.feature_id,img_2.file_id
      FROM product_detail pd
      LEFT JOIN (
          SELECT img.product_id,
          LISTAGG(img.id||','||img.file_id, ';')  as file_id
          FROM images img group by img.product_id) img_2 
      on pd.id = img_2.product_id
      LEFT JOIN (
          SELECT pc.product_detail_id, 
          pc.category_id, 
          LISTAGG(pc.type_id, ', ')  as type_id,
          LISTAGG(pc.feature_id, ', ')  as feature_id
          FROM product_category  pc
          GROUP BY pc.product_detail_id, pc.category_id) pct
      ON pd.id = pct.product_detail_id
      ` + getQueryString(req.params, true);
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRow((err, row) => {
        if (err) throw err;
        row = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
        );
        if (row['file_id']) {
          const fileIDToArr = row['file_id'].split(';').map((t) =>
            t.split(',').map((e) => {
              return isNaN(+e) ? e : +e;
            }),
          );
          row['file_id'] =
            fileIDToArr.length > 1 ? fileIDToArr : fileIDToArr[0] || [];
        }
        if (row['type_id']) {
          const typeIDToArr = row['type_id'].split(';').map((t) =>
            t.split(',').map((e) => {
              return isNaN(+e) ? e : +e;
            }),
          );
          row['type_id'] =
            typeIDToArr.length > 1 ? typeIDToArr : typeIDToArr[0] || [];
        }
        if (row['feature_id']) {
          const featureIDToArr = row['feature_id'].split(';').map((t) =>
            t.split(',').map((e) => {
              return isNaN(+e) ? e : +e;
            }),
          );
          row['feature_id'] =
            featureIDToArr.length > 1
              ? featureIDToArr
              : featureIDToArr[0] || [];
        }
        res.json({
          data: row,
        });
      });
      db.doRelease(connect);
    });
  });
});

adminRoute.delete('/product/:id', async (req, res) => {
  const productId = req.params.id;
  const query = `
    begin
        DELETE FROM PRODUCT_CATEGORY WHERE PRODUCT_DETAIL_ID = ${productId};
        DELETE FROM IMAGES WHERE PRODUCT_ID = ${productId};
        DELETE FROM PRODUCT_DETAIL WHERE ID = ${productId};
    end;
  `;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      const message = result.rowsAffected ? 'success' : 'fail';
      res.status(200).json({ message: message });
      db.doRelease(connect);
    });
  });
});

adminRoute.post('/product', async (req, res) => {
  const detailValue = req.body.detail;
  detailValue['id'] = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
  const typeValue = req.body.type;
  const fileList = req.body.files;
  const longgerArr =
    typeValue.type.length >= typeValue.feature.length ? 'type' : 'feature';
  let insertCategory = ``;

  if (typeValue.type || typeValue.feature) {
    typeValue[longgerArr].forEach((t, i) => {
      insertCategory = `
      INSERT INTO PRODUCT_CATEGORY(PRODUCT_DETAIL_ID,CATEGORY_ID,TYPE_ID,FEATURE_ID)
      VALUES(product_id,${typeValue.category},${
        longgerArr === 'type'
          ? t
          : typeValue['type'][i]
          ? typeValue['type'][i]
          : null
      },${
        longgerArr === 'feature'
          ? t
          : typeValue['feature'][i]
          ? typeValue['feature'][i]
          : null
      });`;
    });
  } else {
    insertCategory = `
    INSERT INTO PRODUCT_CATEGORY(PRODUCT_DETAIL_ID,CATEGORY_ID)
      VALUES(product_id,${typeValue.category});
    `;
  }
  const query = `
   DECLARE
      product_id number;
    begin
      INSERT INTO PRODUCT_DETAIL(NAME,PRICE,DISCOUNT,QUANTITY,CREATE_DATE,BRAND_ID,SPECIFICATION,DESCRIPTION)
      VALUES(:name,:price,:discount,:quantity,:create_date,:brand_id,:specification,:description)
      returning id into product_id;
      :id := product_id;
      ${insertCategory}     
    end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, detailValue, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      const id = result.outBinds.id;
      res.status(200).json({ message: 'success', product_id: id });
      db.doRelease(connect);
    });
  });
  return;
});

adminRoute.put('/product/:id', async (req, res) => {
  const productID = req.params.id;
  const detailData = req.body.detail;
  const typeValue = req.body.type;
  let insertCategory = ``;
  if (typeValue.type || typeValue.feature) {
    longgerArr =
      typeValue.type.length >= typeValue.feature.length ? 'type' : 'feature';
    typeValue[longgerArr].forEach((t, i) => {
      insertCategory = `
      UPDATE PRODUCT_CATEGORY(PRODUCT_DETAIL_ID,CATEGORY_ID,TYPE_ID,FEATURE_ID)
    VALUES(product_id,${typeValue.category},${
        longgerArr === 'type'
          ? t
          : typeValue['type'][i]
          ? typeValue['type'][i]
          : null
      },${
        longgerArr === 'feature'
          ? t
          : typeValue['feature'][i]
          ? typeValue['feature'][i]
          : null
      });`;
    });
  } else {
    insertCategory = `UPDATE PRODUCT_CATEGORY SET CATEGORY_ID = ${typeValue.category} WHERE PRODUCT_DETAIL_ID = ${productID};`;
  }
  let info = '';
  Object.keys(detailData).forEach((t) => {
    info += `${info.length === 0 ? '' : ', '}${t} = ${
      detailData[t] ? "'" + detailData[t] + "'" : null
    }`;
  });
  const query = `
  begin
    UPDATE PRODUCT_DETAIL SET ${info} WHERE ID = ${productID};
    ${insertCategory}     
  end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
  return;
});

const FOLDER_ID = '1aHCngO3_VGA3eMQl7Ilo8A9m0hGEb89K';

adminRoute.post('/product/:id/images/:thumbnail', async (req, res) => {
  const productID = req.params.id;
  const thumbnail = req.params.thumbnail;
  const form = new formidable.IncomingForm();
  try {
    [fields, files] = await form.parse(req);
    if (!files) {
      return res.status.json({ message: 'file upload must at least one' });
    }
  } catch (err) {
    res.writeHead(err.httpCode || 400, { 'Content-Type': 'text/plain' });
    res.json(String(err.message));
    return;
  }
  const idImages = await uploadFile.upload(files.ufile);
  let insertQur = '';
  let updateThumbnailOnInsert = '';
  idImages.forEach((id, i) => {
    if (i === +thumbnail)
      updateThumbnailOnInsert = 'returning id into thumbnail_id ';

    insertQur += `INSERT INTO IMAGES(FILE_ID, PRODUCT_ID) VALUES ('${id}',${productID}) ${
      updateThumbnailOnInsert !== '' ? updateThumbnailOnInsert : ''
    };`;
  });
  const query = `
       declare 
          thumbnail_id number;
       begin
         ${insertQur}
         ${
           updateThumbnailOnInsert &&
           `update product_detail set thumbnail = thumbnail_id where id = ${productID};`
         }
       end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
});

adminRoute.put('/product/:id/thumbnail/:thumbnail', async (req, res) => {
  const productID = req.params.id;
  const thumbnail = req.params.thumbnail;
  const query = `update product_detail set thumbnail = ${thumbnail} where id = ${productID}`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
});

adminRoute.delete('/product/:id/images', async (req, res) => {
  const ids = req.body['ids'];
  const productID = req.params['id'];
  const query = `DELETE FROM IMAGES WHERE PRODUCT_ID = ${productID} AND ID IN (${ids})`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      uploadFile.deleteFile(ids);

      const message = result.rowsAffected ? 'success' : 'fail';
      res.status(200).json({ message: message });
      db.doRelease(connect);
      return;
    });
  });
});

adminRoute.get('/categories', async (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `select c.id,c.name,LISTAGG(ct.id||','||ct.name, ';') as type , 
      LISTAGG(cf.id||','||cf.name, ';') as feature
      from categories c 
      left join category_type ct on c.id = ct.category_id 
      left join category_feature cf on c.id = cf.category_id 
      group by c.id,c.name
      ` + getQueryString(req.query, null, null, true);
    const lengthQuery =
      `SELECT count(c.id) as length from categories c` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    console.log(query);
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        console.log(err);
        res
          .status(500)
          .json({ message: err.Error | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRows((err, rows) => {
        if (err) throw err;
        rows = rows.map((item) => {
          item.TYPE = item.TYPE.split(';').map((t) => {
            const itemSplit = t.split(',').map((e) => {
              return isNaN(+e) ? e : +e;
            });
            return {
              id: itemSplit[0],
              name: itemSplit[1],
            };
          });
          item.FEATURE = item.FEATURE.split(';').map((t) => {
            const itemSplit = t.split(',').map((e) => {
              return isNaN(+e) ? e : +e;
            });
            return {
              id: itemSplit[0],
              name: itemSplit[1],
            };
          });
          return Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
          );
        });
        res.json({
          data: rows,
          meta: {
            limit: parseInt(req.query.limit),
            offset: parseInt(req.query.offset ? req.query.offset : 0),
            length: length,
          },
        });
      });
      db.doRelease(connect);
    });
  });
});

adminRoute.get('/orders', async (req, res) => {
  const productID = req.params.id;
  db.connect().then(async (connect) => {
    const query =
      `SELECT o.*,
      (select listagg ('id-' || od.product_id || ',' || 'name-' ||  pd.name || ',' || 'image-' || pd.thumbnail || ',' || 'quantity-' || od.quantity || ',' || 'price-' || od.price || ',' || 'discount-' || od.discount ,';') within group (order by od.product_id) "product" 
      from ORDERS_DETAIL od left join product_detail pd on od.product_id = pd.id 
      where od.order_id = o.id) as product 
      from orders o
      ` + getQueryString(req.params, true);
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRows((err, rows) => {
        if (err) throw err;
        rows = rows.map((item) => {
          item.PRODUCT = item.PRODUCT.split(';').map((t) =>
            Object.fromEntries(
              t.split(',').map((e) => {
                return e.split('-').map((e) => {
                  return isNaN(+e) ? e : e ? +e : null;
                });
              }),
            ),
          );
          return Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
          );
        });

        res.json({
          data: rows,
        });
      });
      db.doRelease(connect);
    });
  });
});

module.exports = adminRoute;
