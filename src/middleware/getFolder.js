const formidable = require('formidable');

getFiles = async (req, res, next) => {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields, files) => {
    if (err) {
      next(err);
      return;
    }
    next({ fields, files });
  });
};

module.export = { getFiles };
