const express = require('express');
const db = require('../../config/db');
const adminRoute = express.Router();
const utils = require('util');
const uploadFile = require('../../services/uploadGGDr.service');
const createInvoice = require('../../services/createInvoice.service');
const formidable = require('formidable');
const oracledb = require('oracledb');
const dayjs = require('dayjs');
const sendEmail = require('../../utils/sendEmails');
const fs = require('fs');
const handlebars = require('handlebars');
const readFile = utils.promisify(fs.readFile);
const formatNumber = require('../../utils/formatNumber');

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
          where += `where ${generateWhereLogicQuery(
            keyDetail,
            params,
            t,
            table,
          )} `;
        } else {
          where += `and ${generateWhereLogicQuery(
            keyDetail,
            params,
            t,
            table,
          )} `;
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

function generateWhereLogicQuery(keyDetail, paramsList, param, table) {
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
      : `LOWER(${table ? table + '.' : ''}${param}) like '%${paramsList[
          param
        ].toLowerCase()}%'`;
  }
  if (keyDetail?.compare === 'number') {
    if (param === 'id')
      return `${table ? table + '.' : ''}id ${
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
      getQueryString(req.query, null, null, null, 'pd');
    const lengthQuery =
      `SELECT count(pd.id) as length FROM product_detail pd ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error' });
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
    const query = `SELECT pd.*, pct.category_id,pct.type_id, pct.feature_id,img_2.file_id, b.name as brand_name
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
    LEFT JOIN BRANDS b
    ON pd.brand_id = b.id
      where pd.id = ${productID}`;
    console.log(query);
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error' });
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
        UPDATE PRODUCT_DETAIL SET BRAND_ID = NULL WHERE ID = ${productId};
        UPDATE ORDERS_DETAIL SET PRODUCT_ID = NULL WHERE PRODUCT_ID = ${productId};
        DELETE FROM FAVORITE_PRODUCT WHERE PRODUCT_ID = ${productId};
        DELETE FROM PRODUCT_DETAIL WHERE ID = ${productId};
    end;
  `;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      const message = result.rowsAffected ? 'success' : 'fail';
      console.log(result);
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
      ` +
      getQueryString(req.query, null, null, true, 'c').replace(
        'ORDER',
        'group by c.id, c.name ORDER',
      );
    const lengthQuery =
      `SELECT count(id) as length from categories ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error' });
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

adminRoute.get('/category/:id', async (req, res) => {
  const categoryId = req.params.id;
  db.connect().then(async (connect) => {
    const query = `select * from categories where id = ${categoryId} `;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      result.resultSet.getRow((err, row) => {
        if (err) throw err;
        row = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
        );
        res.json({
          data: row,
        });
      });
      db.doRelease(connect);
    });
  });
});

adminRoute.post('/category', async (req, res) => {
  const typeList = req.body.type;
  const featureList = req.body.feature;
  const insertQuery = {
    type: '',
    feature: '',
  };
  typeList?.forEach((t) => {
    insertQuery['type'] += `INSERT INTO TYPES(NAME,CATEGORY_TYPE_ID)
    VALUES('${t}',category_type_id);`;
  });
  featureList?.forEach((t) => {
    insertQuery['feature'] += `INSERT INTO FEATURES(NAME,CATEGORY_FEATURE_ID)
    VALUES('${t}',category_feature_id);`;
  });
  db.connect().then(async (connect) => {
    const query = `DECLARE
    category_id number;
    category_type_id number;
    category_feature_id number;
    begin
    INSERT INTO CATEGORIES(NAME,SPECIFICATION_TEMPLATE)
    VALUES('${req.body.name}','${req.body.specification}')
    returning id into category_id;
    INSERT INTO CATEGORY_TYPE(NAME,CATEGORY_ID)
    VALUES('${req.body.name} type',category_id)
    returning id into category_type_id;
    INSERT INTO CATEGORY_FEATURE(NAME,CATEGORY_ID)
    VALUES('${req.body.name} feature',category_id)
    returning id into category_feature_id;
    ${insertQuery.type}
    ${insertQuery.feature}
    end;`;
    console.log(query);
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
      return;
    });
  });
});

adminRoute.put('/category/:id', async (req, res) => {
  const categoryId = req.params.id;
  const typeList = req.body.type;
  const featureList = req.body.feature;
  const oldTypeList = req.body.type?.filter((t) => !isNaN(+t));
  const oldFeatureList = req.body.feature?.filter((t) => !isNaN(+t));
  const insertQuery = {
    type: '',
    feature: '',
  };
  typeList?.forEach((t) => {
    if (typeof t == 'string') {
      insertQuery['type'] += `INSERT INTO TYPES(NAME,CATEGORY_TYPE_ID)
      VALUES('${t}',category_type_id);`;
    }
  });
  featureList?.forEach((t) => {
    if (typeof t == 'string') {
      insertQuery['feature'] += `INSERT INTO FEATURES(NAME,CATEGORY_FEATURE_ID)
    VALUES('${t}',category_feature_id);`;
    }
  });
  db.connect().then(async (connect) => {
    const query = `DECLARE
    category_type_id number;
    category_feature_id number;
    begin
    UPDATE CATEGORIES SET
    NAME = '${req.body.name}', SPECIFICATION_TEMPLATE = ${
      req.body.specification ? "'" + req.body.specification + "'" : 'NULL'
    } WHERE ID = ${categoryId};
    SELECT id into category_type_id FROM CATEGORY_TYPE WHERE CATEGORY_ID = ${categoryId};
    SELECT id into category_feature_id FROM CATEGORY_FEATURE WHERE CATEGORY_ID = ${categoryId};
    update TYPES set CATEGORY_TYPE_ID = NULL WHERE CATEGORY_TYPE_ID = category_type_id ${
      oldTypeList && oldTypeList.length > 0
        ? 'AND ID NOT IN (' + oldTypeList + ')'
        : ''
    };
    update FEATURES set CATEGORY_FEATURE_ID = NULL WHERE CATEGORY_FEATURE_ID = category_feature_id ${
      oldTypeList && oldTypeList.length > 0
        ? 'AND ID NOT IN (' + oldTypeList + ')'
        : ''
    };
    ${insertQuery.type}
    ${insertQuery.feature}
    end;`;
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
      return;
    });
  });
});

adminRoute.delete('/category/:id', async (req, res) => {
  const categoryId = req.params.id;
  if (!categoryId) {
    res.status(404).json({ message: 'Do not have new!' });
    return;
  }
  db.connect().then(async (connect) => {
    const checkCategory = await connect.execute(
      `Select id from product_category where CATEGORY_ID = ${categoryId}`,
    );
    if (checkCategory.rows.length > 0) {
      res.status(500).json({
        message: 'Product has this category. This category can not be deleted!',
      });
      db.doRelease(connect);
      return;
    }
    const query = `DECLARE
          category_type_id number;
          category_feature_id number;
      begin
          SELECT id into category_type_id FROM CATEGORY_TYPE WHERE CATEGORY_ID = ${categoryId};
          SELECT id into category_feature_id FROM CATEGORY_FEATURE WHERE CATEGORY_ID = ${categoryId};
          UPDATE PRODUCT_CATEGORY SET CATEGORY_ID = NULL, TYPE_ID = NULL, FEATURE_ID = NULL WHERE CATEGORY_ID = ${categoryId};
          DELETE FROM TYPES WHERE CATEGORY_TYPE_ID = category_type_id;
          DELETE FROM FEATURES WHERE CATEGORY_FEATURE_ID = category_feature_id;
          DELETE FROM CATEGORY_TYPE WHERE CATEGORY_ID = ${categoryId};
          DELETE FROM CATEGORY_FEATURE WHERE CATEGORY_ID = ${categoryId};
          DELETE FROM CATEGORIES WHERE id = ${categoryId};
      end;
    `;
    console.log(query);
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error!' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
      return;
    });
  });
});

// api for orders management
adminRoute.get('/orders', async (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `SELECT o.*, s.name as status_name, c.value as coupon_value, c.unit as coupon_unit,
      (select listagg ('id|' || od.product_id || ',' || 'name|' ||  pd.name || ',' || 'image|' || im.file_id || ',' || 'quantity|' || od.quantity || ',' || 'price|' || od.price || ',' || 'discount|' || od.discount ,';') within group (order by od.product_id) "product" 
      from ORDERS_DETAIL od left join product_detail pd on od.product_id = pd.id left join images im on pd.thumbnail = im.id
      where od.order_id = o.id) as product 
      from orders o left join status s on o.status = s.id left join coupon c on o.coupon = c.id
      ` + getQueryString(req.query, null, null, null, 'o');
    const lengthQuery =
      `SELECT count(o.id) as length FROM orders o ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error' });
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

adminRoute.put('/order/:id/confirm', async (req, res) => {
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
      const updateQuery = `update orders set status = 5, update_date = '${update_date}' where id = ${orderID}`;
      connect.execute(
        updateQuery,
        {},
        { autoCommit: true },
        async (err, result) => {
          if (err) {
            res.status(500).json({ message: 'Internal Server Error' });
            db.doRelease(connect);
            return;
          }
          const getQuery = `SELECT o.*, c.value as coupon_value, c.unit as coupon_unit,
        (select listagg ('id|' || od.product_id || ',' || 'name|' ||  pd.name || ',' || 'image|' || im.file_id || ',' || 'quantity|' || od.quantity || ',' || 'price|' || od.price || ',' || 'discount|' || od.discount ,';') within group (order by od.product_id) "product" 
        from ORDERS_DETAIL od left join product_detail pd on od.product_id = pd.id left join images im on pd.thumbnail = im.id
        where od.order_id = o.id) as product 
        from orders o left join coupon c on o.coupon = c.id where o.id = ${orderID}`;
          const orderResult = await connect.execute(getQuery);
          const sendInvoiceResult = await sendInvoice(orderResult);
          if (!sendInvoiceResult) {
            res.status(500).json({ message: 'Status is not satisfy!' });
            db.doRelease(connect);
            return;
          }
          res.status(200).json({ message: 'success', isSuccess: true });
          db.doRelease(connect);
        },
      );
    } else {
      res.status(500).json({ message: 'Status is not satisfy!' });
      db.doRelease(connect);
      return;
    }
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
    if (status.rows[0].STATUS === 5) {
      const updateQuery = `update orders set status = 2, update_date = '${update_date}' where id = ${orderID}`;
      connect.execute(updateQuery, {}, { autoCommit: true }, (err, result) => {
        if (err) {
          res.status(500).json({ message: 'Internal Server Error' });
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
      connect.execute(
        updateQuery,
        {},
        { autoCommit: true },
        async (err, result) => {
          if (err) {
            res.status(500).json({ message: 'Internal Server Error' });
            db.doRelease(connect);
            return;
          }

          res.status(200).json({ message: 'success' });
          db.doRelease(connect);
        },
      );
    } else {
      res.status(500).json({ message: 'Status is not satisfy!' });
      db.doRelease(connect);
      return;
    }
  });
});

adminRoute.put('/order/:id/invoice', async (req, res) => {
  const orderID = req.params.id;
  if (!orderID) {
    res.status(404).json({ message: 'Do not have order!' });
    return;
  }
  db.connect().then(async (connect) => {
    const query = `select status from orders where id = ${orderID}`;
    const status = await connect.execute(query, {});
    if ([2, 3, 5].includes(status.rows[0].STATUS)) {
      const getQuery = `SELECT o.*, c.value as coupon_value, c.unit as coupon_unit,
      (select listagg ('id|' || od.product_id || ',' || 'name|' ||  pd.name || ',' || 'image|' || im.file_id || ',' || 'quantity|' || od.quantity || ',' || 'price|' || od.price || ',' || 'discount|' || od.discount ,';') within group (order by od.product_id) "product" 
      from ORDERS_DETAIL od left join product_detail pd on od.product_id = pd.id left join images im on pd.thumbnail = im.id
      where od.order_id = o.id) as product 
      from orders o left join coupon c on o.coupon = c.id where o.id = ${orderID}`;
      try {
        const result = await connect.execute(getQuery, {});
        const order = result.rows.map((item) => {
          item.PRODUCT = item.PRODUCT.split(';').map((t) =>
            Object.fromEntries(
              t.split(',').map((e) => {
                return e.split('|').map((i) => {
                  return isNaN(+i) ? i : i ? +i : null;
                });
              }),
            ),
          );
          if (item['COUPON_VALUE']) {
            item['COUPON_DATA'] =
              item['COUPON_UNIT'] === 'percent'
                ? item['COUPON_VALUE'] + '%'
                : formatNumber(item['COUPON_VALUE'], ',');
          }
          return Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
          );
        })[0];
        const createdDate = dayjs();
        const fileName = `invoice_${order.id}_${dayjs(createdDate).format(
          'YYYY_MM_DD_HH_mm_ss',
        )}.pdf`;
        const invoiceId = await createInvoice.create(
          createInvoice.generateData(order, createdDate),
          fileName,
        );
        const updateInvoicequery = `
        DECLARE
          invoice_id number;
        Begin
        INSERT INTO INVOICES(FILE_ID,CREATE_DATE,ORDER_ID)
        VALUES('${invoiceId}','${createdDate.toISOString()}',${orderID})
        return id into invoice_id;
        UPDATE ORDERS SET invoice = invoice_id where id = ${orderID};
        End;`;
        await connect.execute(updateInvoicequery, {}, { autoCommit: true });
        res.status(200).json({ message: 'Created invoice successful!' });
        db.doRelease(connect);
        return;
      } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Server error!' });
        db.doRelease(connect);
        return;
      }
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
  const note = req.body.params['note'];
  if (!orderID) {
    res.status(404).json({ message: 'Do not have order!' });
    return;
  }
  db.connect().then(async (connect) => {
    const query = `select status, id, email, name from orders where id = ${orderID}`;
    const result = await connect.execute(query, {});
    if (result.rows[0].STATUS !== 3 || result.rows[0].STATUS !== 4) {
      const updateQuery = `update orders set status = 4, update_date = '${update_date}', note = '${note}' where id = ${orderID}`;
      connect.execute(
        updateQuery,
        {},
        { autoCommit: true },
        async (err, result) => {
          if (err) {
            res.status(500).json({ message: 'Internal Server Error' });
            db.doRelease(connect);
            return;
          }
          res.status(200).json({ message: 'success' });
          const userData = result.rows[0];
          await sendEmail({
            to: userData.EMAIL,
            subject: 'Order success',
            message: `<p>Hi, ${userData.NAME}</p><p>Đơn hàng ${userData.ID} của bạn đã bị hủy </p><p>Lý do: ${note}</p><p>Xin lỗi vì sự bất tiện này.</p><p>Thân ái,</p><p>3kShop</p>`,
          }).catch((err) => {
            console.log(err);
            throw err;
          });
          db.doRelease(connect);
        },
      );
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
        DELETE FROM invoices WHERE order_id = ${+orderID};
        DELETE FROM orders WHERE id = ${+orderID};
      End;`;
      connect.execute(delQuery, {}, { autoCommit: true }, (err, result) => {
        if (err) {
          console.log(err);
          res.status(500).json({ message: 'Internal Server Error!' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error!' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
        res.status(500).json({ message: 'Internal Server Error' });
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
          message: err.message | 'Internal Server Error!',
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

async function sendInvoice(result) {
  try {
    const order = result.rows.map((item) => {
      item = Object.fromEntries(
        Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
      );
      item.product = item.product.split(';').map((t) =>
        Object.fromEntries(
          t.split(',').map((e) => {
            return e.split('|').map((i) => {
              return isNaN(+i) ? i : i ? +i : null;
            });
          }),
        ),
      );
      item['create_date'] = dayjs(item['create_date']).format(
        'DD/MM/YYYY HH:mm:ss',
      );
      item['total'] = 0;
      if (item['coupon_value']) {
        item['coupon_data'] =
          item['coupon_unit'] === 'percent'
            ? item['coupon_value'] + '%'
            : formatNumber(item['coupon_value'], ',') + '₫';
        console.log(123);
      }
      item.product.forEach((t) => {
        t.image =
          (t.image?.includes('/')
            ? 'https://3kshop.vn/wp-content/uploads/fly-images/'
            : 'https://drive.google.com/thumbnail?id=') + t.image;
        item['total'] +=
          t.quantity * t.price * (t.discount ? 1 - t.discount / 100 : 1);
        if (t.discount) {
          t['newPrice'] = formatNumber(t.price * (1 - t.discount / 100), ',');
        }
        t.price = formatNumber(t.price, ',');
      });
      item['total'] = formatNumber(item['total'], ',');
      return item;
    })[0];
    console.log(order);
    const data = order;
    const html = await readFile('./index.html', { encoding: 'utf-8' });
    const template = handlebars.compile(html);
    const htmlToSend = template(data);
    console.log(123);
    await sendEmail({
      to: 'hoanganh2001hs@gmail.com',
      subject: 'Bạn đã đặt hàng thành công',
      message: htmlToSend,
    }).catch((err) => {
      console.log(err);
      throw err;
    });
    return true;
  } catch (err) {
    console.log(err);
    return err;
  }
}

// api for brands management
adminRoute.get('/brands', async (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `select b.*, im.file_id as thumbnail_url from BRANDS b left join images im on b.image = im.id
    ` + getQueryString(req.query, undefined, undefined, true, 'b');
    const lengthQuery =
      `SELECT count(b.id) as length FROM BRANDS b ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error' });
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

adminRoute.delete('/brand/:id', async (req, res) => {
  const brandId = req.params.id;
  if (!brandId) {
    res.status(404).json({ message: 'Do not have brand!' });
    return;
  }
  const query = `
    begin
        UPDATE PRODUCT_DETAIL SET brand_id = NULL WHERE brand_id = ${brandId};
        DELETE FROM brands WHERE id = ${brandId};
    end;
  `;
  console.log(query);
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error!' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
});

adminRoute.post('/brand', async (req, res) => {
  const brandValue = req.body;
  brandValue['id'] = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
  const query = `
   DECLARE
      brand_id number;
    begin
      INSERT INTO brands(NAME)
      VALUES(:name)
      returning id into brand_id;
      :id := brand_id;
    end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, brandValue, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      const id = result.outBinds.id;
      res.status(200).json({ message: 'success', brand_id: id });
      db.doRelease(connect);
    });
  });
  return;
});

adminRoute.post('/brand/:id/images', async (req, res) => {
  const brandID = req.params.id;
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
         INSERT INTO IMAGES(FILE_ID) VALUES ('${idImages[0]}')
         returning id into img_id;
          update brands set image = img_id where id = ${brandID};
       end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
});

adminRoute.put('/brand/:id', async (req, res) => {
  const brandID = req.params.id;
  const brandValue = req.body;
  let info = '';
  Object.keys(brandValue).forEach((t) => {
    info += `${info.length === 0 ? '' : ', '}${t} = ${
      brandValue[t]
        ? isNaN(+brandValue)
          ? "'" + brandValue[t] + "'"
          : brandValue[t]
        : null
    }`;
  });
  const query = `
  begin
    UPDATE brands SET ${info} WHERE ID = ${brandID};
  end;`;

  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
  return;
});

// api for brands management
adminRoute.get('/coupons', async (req, res) => {
  db.connect().then(async (connect) => {
    const query =
      `select * from COUPON c
    ` + getQueryString(req.query, undefined, undefined, true, 'c');
    const lengthQuery =
      `SELECT count(b.id) as length FROM BRANDS b ` +
      getQueryString(req.query, true);
    const length = await (
      await connect.execute(lengthQuery, {})
    ).rows[0].LENGTH;
    connect.execute(query, {}, { resultSet: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error' });
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

adminRoute.delete('/coupon/:id', async (req, res) => {
  const brandId = req.params.id;
  if (!brandId) {
    res.status(404).json({ message: 'Do not have brand!' });
    return;
  }
  const query = `
    begin
        UPDATE PRODUCT_DETAIL SET brand_id = NULL WHERE brand_id = ${brandId};
        DELETE FROM brands WHERE id = ${brandId};
    end;
  `;
  console.log(query);
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error!' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
});

adminRoute.post('/coupon', async (req, res) => {
  const couponValue = req.body;
  const query = `INSERT INTO coupon(NAME,VALUE,UNIT,QUANTITY,START_DATE,EXPIRED_DATE)
      VALUES(:name,:value,:unit,:quantity,:start_date,:expired_date)`;
  console.log(query);
  db.connect().then(async (connect) => {
    connect.execute(query, couponValue, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
  return;
});

adminRoute.put('/coupon/:id', async (req, res) => {
  const couponID = req.params.id;
  const couponValue = req.body;
  let info = '';
  Object.keys(couponValue).forEach((t) => {
    info += `${info.length === 0 ? '' : ', '}${t} = ${
      couponValue[t]
        ? isNaN(+couponValue)
          ? "'" + couponValue[t] + "'"
          : couponValue[t]
        : null
    }`;
  });
  const query = `
  begin
    UPDATE coupon SET ${info} WHERE ID = ${couponID};
  end;`;
  db.connect().then(async (connect) => {
    connect.execute(query, {}, { autoCommit: true }, (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal Server Error' });
        db.doRelease(connect);
        return;
      }
      res.status(200).json({ message: 'success' });
      db.doRelease(connect);
    });
  });
  return;
});

module.exports = adminRoute;
