const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');

const categoryRoute = express.Router();

categoryRoute.get('/categories', (req, res) => {
  db.connect().then(async (connect) => {
    const categoryRes = [];

    const types = await connect.execute(
      `SELECT t.id,t.name, ct.name as category_type_header, ct.category_id as category_id, cs.name as category_name FROM types t
    left join category_type ct on ct.id = t.category_type_id
    left join categories cs on cs.id = ct.category_id`,
      {},
      { resultSet: true },
    );
    types.resultSet.getRows((err, rows) => {
      if (err) {
        console.error(err.message);
        res.status(500).send('Error getting data from DB');
        db.doRelease(connect);
        return;
      }
      rows = rows.map((item) => {
        return Object.fromEntries(
          Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
        );
      });
      rows.forEach((t) => {
        const pos = categoryRes.findIndex((item) => item.id === t.category_id);
        if (pos >= 0) {
          const typePos = categoryRes[pos].type.findIndex((item) => {
            return item.typeHeader === t.category_type_header;
          });
          if (typePos >= 0) {
            categoryRes[pos]?.type[typePos]?.typeList.push({
              id: t.id,
              name: t.name,
            });
          } else {
            categoryRes[pos].type.push({
              typeHeader: t.category_type_header,
              typeList: [
                {
                  id: t.id,
                  name: t.name,
                },
              ],
            });
          }
        } else {
          categoryRes.push({
            id: t.category_id,
            name: t.category_name,
            type: [
              {
                typeHeader: t.category_type_header,
                typeList: [
                  {
                    id: t.id,
                    name: t.name,
                  },
                ],
              },
            ],
            feature: [
              {
                featureHeader: '',
                featureList: [],
              },
            ],
          });
        }
      });
    });

    const features = await connect.execute(
      `SELECT f.id,f.name, cf.name as category_feature_header, cf.category_id as category_id, cs.name as category_name FROM features f
    left join category_feature cf on cf.id = f.category_feature_id
    left join categories cs on cs.id = cf.category_id`,
      {},
      { resultSet: true },
    );
    features.resultSet.getRows((err, rows) => {
      if (err) {
        console.error(err.message);
        res.status(500).send('Error getting data from DB');
        db.doRelease(connect);
        return;
      }
      rows = rows.map((item) => {
        return Object.fromEntries(
          Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
        );
      });
      rows.forEach((t) => {
        const pos = categoryRes.findIndex((item) => item.id === t.category_id);
        const featurePos = categoryRes[pos].feature.findIndex((item) => {
          return item.featureHeader === t.category_feature_header;
        });

        console.log(categoryRes[pos].feature);
        if (featurePos >= 0) {
          categoryRes[pos]?.feature[featurePos]?.featureList.push({
            id: t.id,
            name: t.name,
          });
        } else {
          if (categoryRes[pos].feature.length > 1) {
            categoryRes[pos].feature.push({
              featureHeader: t.category_type_header,
              featureList: [
                {
                  id: t.id,
                  name: t.name,
                },
              ],
            });
          } else {
            categoryRes[pos].feature[0].featureHeader =
              t.category_feature_header;
            categoryRes[pos]?.feature[featurePos]?.featureList.push({
              id: t.id,
              name: t.name,
            });
          }
        }
        categoryRes[pos].feature?.featureList?.push({
          id: t.id,
          name: t.name,
        });
      });
      res.json({ data: categoryRes });
    });
    db.doRelease(connect);
  });
  // [ {
  //   id: ,
  //   name: ,
  //   typeHeader: ,
  //   type: [
  //     {
  //       id:
  //       name:
  //     }
  //   ]
  // }]
});

module.exports = categoryRoute;
