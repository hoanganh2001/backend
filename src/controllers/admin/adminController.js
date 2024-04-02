const express = require('express');
const db = require('../../config/db');
const adminRoute = express.Router();
const uploadFile = require('../../services/uploadGGDr.service');
const formidable = require('formidable');
const oracledb = require('oracledb');

function getQueryString(
  params,
  logicOnly,
  haveDefaultLogic,
  sortDFByName,
  table,
) {
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
            ? `ORDER BY ${table ? table + '.' : ''}${params[t]} `
            : `ORDER BY ${table ? table + '.' : ''}${params[t]} ` + sort;
        } else {
          sort +=
            (params['order_by'] === 'price'
              ? params[t] === 'desc'
                ? params[t] + ' nulls last'
                : params[t] + ' nulls first'
              : params[t]) + `, ${table ? table + '.' : ''}create_date`;
        }
        break;
      default:
        break;
    }
  });
  if (page.trim().length === 0) {
    page = `FETCH NEXT 28 ROWS ONLY `;
  } else if (sort.trim().length === 0) {
    sort = sortDFByName
      ? `ORDER BY ${table ? table + '.' : ''}NAME`
      : `ORDER BY ${table ? table + '.' : ''}CREATE_DATE DESC`;
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

// api for product management
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
          Object.entries(row)?.map(([k, v]) => [k.toLowerCase(), v]),
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

// api for categories management
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

// api for orders management
adminRoute.get('/orders', async (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `SELECT o.*, s.name as status_name,
      (select listagg ('id|' || od.product_id || ',' || 'name|' ||  pd.name || ',' || 'image|' || im.file_id || ',' || 'quantity|' || od.quantity || ',' || 'price|' || od.price || ',' || 'discount|' || od.discount ,';') within group (order by od.product_id) "product" 
      from ORDERS_DETAIL od left join product_detail pd on od.product_id = pd.id left join images im on pd.thumbnail = im.id
      where od.order_id = o.id) as product 
      from orders o left join status s on o.status = s.id
      ` + getQueryString(req.query);
    const lengthQuery =
      `SELECT count(o.id) as length FROM orders o ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
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
                return e.split('|').map((i) => {
                  return isNaN(+i) ? i : i ? +i : null;
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

adminRoute.put('/order/:id/onway', async (req, res) => {
  const orderID = req.params.id;
  const update_date = req.body.params['date'];
  if (!orderID) {
    res.status(404).json({ message: 'Do not have order!' });
    return;
  }
  db.connect().then(async (connect) => {
    const query = `select status from orders where id = ${orderID}`;
    const status = await connect.execute(query, {});
    if (status.rows[0].STATUS === 1) {
      const updateQuery = `update orders set status = 2, update_date = '${update_date}' where id = ${orderID}`;
      connect.execute(updateQuery, {}, { autoCommit: true }, (err, result) => {
        if (err) {
          res.status(500).json({ message: err | 'Error getting data from DB' });
          db.doRelease(connect);
          return;
        }
        res.status(200).json({ message: 'success' });
        db.doRelease(connect);
      });
    } else {
      res.status(500).json({ message: 'Status is not satisfy!' });
      db.doRelease(connect);
      return;
    }
  });
});

adminRoute.put('/order/:id/success', async (req, res) => {
  const orderID = req.params.id;
  const update_date = req.body.params['date'];
  if (!orderID) {
    res.status(404).json({ message: 'Do not have order!' });
    return;
  }
  db.connect().then(async (connect) => {
    const query = `select status from orders where id = ${orderID}`;
    const status = await connect.execute(query, {});
    if (status.rows[0].STATUS === 2) {
      const updateQuery = `update orders set status = 3, update_date = '${update_date}' where id = ${orderID}`;
      connect.execute(updateQuery, {}, { autoCommit: true }, (err, result) => {
        if (err) {
          res.status(500).json({ message: err | 'Error getting data from DB' });
          db.doRelease(connect);
          return;
        }
        res.status(200).json({ message: 'success' });
        db.doRelease(connect);
      });
    } else {
      res.status(500).json({ message: 'Status is not satisfy!' });
      db.doRelease(connect);
      return;
    }
  });
});

adminRoute.put('/order/:id/cancel', async (req, res) => {
  const orderID = req.params.id;
  const update_date = req.body.params['date'];
  if (!orderID) {
    res.status(404).json({ message: 'Do not have order!' });
    return;
  }
  db.connect().then(async (connect) => {
    const query = `select status from orders where id = ${orderID}`;
    const status = await connect.execute(query, {});
    if (status.rows[0].STATUS !== 3 || status.rows[0].STATUS !== 4) {
      const updateQuery = `update orders set status = 4, update_date = '${update_date}' where id = ${orderID}`;
      connect.execute(updateQuery, {}, { autoCommit: true }, (err, result) => {
        if (err) {
          res.status(500).json({ message: err | 'Error getting data from DB' });
          db.doRelease(connect);
          return;
        }
        res.status(200).json({ message: 'success' });
        db.doRelease(connect);
      });
    } else {
      res.status(200).json({ message: 'Status is not satisfy!' });
      db.doRelease(connect);
      return;
    }
  });
});

adminRoute.delete('/order/:id', async (req, res) => {
  const orderID = req.params.id;
  if (!orderID) {
    res.status(404).json({ message: 'Do not have order!' });
    return;
  }

  db.connect().then(async (connect) => {
    const query = `select status from orders where id = ${orderID}`;
    const status = await connect.execute(query, {});
    if (status.rows[0].STATUS === 4) {
      const delQuery = `
      Begin
        DELETE FROM orders_detail WHERE order_id = ${+orderID};
        DELETE FROM orders WHERE id = ${+orderID};
      End;`;
      connect.execute(delQuery, {}, { autoCommit: true }, (err, result) => {
        if (err) {
          console.log(err);
          res.status(500).json({ message: 'Error getting data from DB' });
          db.doRelease(connect);
          return;
        }
        const message = result.rowsAffected ? 'success' : 'fail';
        res.status(200).json({ message: message });
        db.doRelease(connect);
        return;
      });
    } else {
      res.status(500).json({ message: 'Cannot delete this order!' });
      db.doRelease(connect);
      return;
    }
  });
});

// api for news management
adminRoute.get('/news', async (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `select n.*, im.file_id as thumbnail_url, ua.name as author from NEWS n left join images im on n.thumbnail_id = im.id left join user_account ua on n.author_id = ua.id
    ` + getQueryString(req.query, undefined, undefined, undefined, 'n');
    const lengthQuery =
      `SELECT count(n.id) as length FROM news n ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
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

adminRoute.delete('/new/:id', async (req, res) => {
  const newId = req.params.id;
  if (!newId) {
    res.status(404).json({ message: 'Do not have new!' });
    return;
  }
  const query = `
    begin
        DELETE FROM news WHERE id = ${newId};
    end;
  `;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
});

adminRoute.post('/new', async (req, res) => {
  const newValue = req.body;
  newValue['id'] = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
  const query = `
   DECLARE
      new_id number;
    begin
      INSERT INTO news(NAME,AUTHOR_ID,CONTENT,CREATE_DATE,UPDATE_DATE)
      VALUES(:name,:author_id,:content,:create_date,:update_date)
      returning id into new_id;
      :id := new_id;
    end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, newValue, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      const id = result.outBinds.id;
      console.log(result);
      res.status(200).json({ message: 'success', new_id: id });
      db.doRelease(connect);
    });
  });
  return;
});

adminRoute.post('/new/:id/images', async (req, res) => {
  const newID = req.params.id;
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
  const query = `
       declare
        img_id number;
       begin
         INSERT INTO IMAGES(FILE_ID, NEW_ID) VALUES ('${idImages[0]}',${newID})
         returning id into img_id;
          update news set thumbnail_id = img_id where id = ${newID};
       end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
});

adminRoute.put('/new/:id', async (req, res) => {
  const newID = req.params.id;
  const newValue = req.body;
  let info = '';
  Object.keys(newValue).forEach((t) => {
    info += `${info.length === 0 ? '' : ', '}${t} = ${
      newValue[t]
        ? isNaN(+newValue)
          ? "'" + newValue[t] + "'"
          : newValue[t]
        : null
    }`;
  });
  console.log(info);
  const query = `
  begin
    UPDATE news SET ${info} WHERE ID = ${newID};
  end;`;
  console.log(query);

  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
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

// api for user management
adminRoute.get('/users', async (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `select ua.*,r.name as role_name from user_account ua left join role r on ua.role_id = r.id
      ` + getQueryString(req.query, null, null, null, 'ua');
    const lengthQuery =
      `SELECT count(id) as length FROM user_account ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
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
          delete item['PASSWORD'];
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

adminRoute.post('/user', async (req, res) => {
  const userData = req.body;
  userData['id'] = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
  const query = `
   DECLARE
      user_id number;
    begin
      INSERT INTO user_account(NAME,PASSWORD,EMAIL,PHONE,CREATE_DATE,ADDRESS,ROLE_ID,STATUS)
      VALUES(:name,:password,:email,:phone,:create_date,:address,:role_id,1)
      returning id into user_id;
      :id := user_id;
    end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, userData, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: err | 'Error getting data from DB' });
        db.doRelease(connect);
        return;
      }
      const id = result.outBinds.id;
      console.log(result);
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
  return;
});

adminRoute.put('/user/:id', async (req, res) => {
  const userID = req.params.id;
  const userValue = req.body;
  let info = '';
  Object.keys(userValue).forEach((t) => {
    info += `${info.length === 0 ? '' : ', '}${t} = ${
      userValue[t]
        ? isNaN(+userValue)
          ? "'" + userValue[t] + "'"
          : userValue[t]
        : null
    }`;
  });
  const query = `
  begin
    UPDATE user_account SET ${info} WHERE ID = ${userID};
  end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
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

adminRoute.put('/user/status/:id', async (req, res) => {
  const userID = req.params.id;
  const status = req.body.status;
  const query = `
  begin
    UPDATE user_account SET status = ${status} WHERE ID = ${userID};
  end;`;

  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
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

adminRoute.put('/user/change-password/:id', async (req, res) => {
  const userID = req.params.id;
  db.connect().then(async (connect) => {
    const changePass = `update user_account set password = '${req.body.new_password}' where id = ${userID}`;
    connect.execute(changePass, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({
          message: err.message | 'Error getting data from DB',
        });
        db.doRelease(connect);
        return;
      }
      passMessage =
        result.rowsAffected === 1 ? 'Change pass success!' : 'Wrong Old pass!';
      res.status(200).json({ message: passMessage });
      db.doRelease(connect);
    });
  });
  return;
});
module.exports = adminRoute;
