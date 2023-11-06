const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const config = {
  user: 'SYSTEM',
  password: 'hoanganh',
  connectString: 'localhost:1521/xe',
};

async function createPool() {
  try {
    conn = await oracledb.createPool(config);
    console.log('Create pool success!');
    return;
  } catch (err) {
    console.log('Create pool fail!');
    console.log(err.message);
  }
}

async function connect() {
  try {
    return await oracledb.getConnection();
  } catch (err) {
    console.log(err.message);
  }
}

function doRelease(connection) {
  connection.release(function (err) {
    if (err) {
      console.error(err.message);
    }
  });
}

module.exports = { connect, createPool, doRelease };
