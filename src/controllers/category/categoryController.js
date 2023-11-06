const express = require('express');
const db = require('../../config/db');
const oracledb = require('oracledb');

const categoryRoute = express.Router();

categoryRoute.get('/categories', (req, res) => {
  let features;
  db.connect().then(async (connect) => {
    const types = await connect.execute(
      `SELECT t.id,t.name, ct.name as category_type_header, ct.category_id as category_id, cs.name as category_name FROM types t
    left join category_type ct on ct.id = t.category_type_id
    left join categories cs on cs.id = ct.category_id`,
      {},
      { resultSet: true },
    );
    const typeRes = [];
    types.resultSet.getRows((err, rows) => {
      rows.forEach((t) => {
        const pos = typeRes.findIndex((item) => item.id === t.category_id);
        if (pos >= 0) {
          typeRes[pos].type?.typeList.push({
            id: t.id,
            name: t.name,
          });
        } else {
          typeRes.push({
            id: t.category_id,
            name: t.category_name,
            type: {
              typeHeader: t.category_type_header,
              typeList: [
                {
                  id: t.id,
                  name: t.name,
                },
              ],
            },
          });
        }
      });
    });
    console.log(typeRes);
    // connect.execute(
    //   `SELECT t.id,t.name, ct.name as category_type_header, ct.category_id as category_id, cs.name as category_name FROM types t
    // left join category_type ct on ct.id = t.category_type_id
    // left join categories cs on cs.id = ct.category_id`,
    //   {},
    //   { resultSet: true },
    //   (err, result) => {
    //     if (err) {
    //       console.error(err.message);
    //       res.status(500).send('Error getting data from DB');
    //       db.doRelease(connect);
    //       return;
    //     }
    //     result.resultSet.getRows((err, rows) => {
    //       if (err) throw err;
    //       types = rows.map((item) => {
    //         return Object.fromEntries(
    //           Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]),
    //         );
    //       });
    //       const typeRes = [];

    //       types?.forEach((t) => {
    //         const pos = typeRes.findIndex((item) => item.id === t.category_id);
    //         if (pos >= 0) {
    //           typeRes[pos].type?.typeList.push({
    //             id: t.id,
    //             name: t.name,
    //           });
    //         } else {
    //           typeRes.push({
    //             id: t.category_id,
    //             name: t.category_name,
    //             type: {
    //               typeHeader: t.category_type_header,
    //               typeList: [
    //                 {
    //                   id: t.id,
    //                   name: t.name,
    //                 },
    //               ],
    //             },
    //           });
    //         }
    //       });
    //     });
    //   },
    // );
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
