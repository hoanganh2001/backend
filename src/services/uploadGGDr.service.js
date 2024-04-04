const { google } = require('googleapis');
const fs = require('fs');
const { resolve } = require('path');

const FOLDER_IMAGE_ID = '1aHCngO3_VGA3eMQl7Ilo8A9m0hGEb89K';
const FOLDER_INVOICE_ID = '1Ep8nk30DXVHSrvbdkKekBdzM9DSeeWxp';

upload = async (fileList) => {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'ggKey.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const driveService = google.drive({
    version: 'v3',
    auth,
  });
  const ids = [];
  await Promise.all(
    fileList.map(async (f, i) => {
      const requestBody = {
        name: f.originalFilename,
        fields: 'id',
        parents: [FOLDER_IMAGE_ID],
      };
      const media = {
        mimeType: f.mimetype,
        body: fs.createReadStream(f.filepath),
      };
      try {
        const response = await driveService.files.create({
          resource: requestBody,
          media: media,
        });
        ids.push(response.data.id);
      } catch (err) {
        reject(err);
      }
    }),
  );
  return ids;
};

uploadOrder = async (file, fileName) => {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'ggKey.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const driveService = google.drive({
    version: 'v3',
    auth,
  });
  const requestBody = {
    name: fileName,
    fields: 'id',
    parents: [FOLDER_INVOICE_ID],
  };
  const media = {
    mimeType: 'application/pdf',
    body: file,
  };
  try {
    const response = await driveService.files.create({
      resource: requestBody,
      media: media,
    });
    return response?.data?.id;
  } catch (err) {
    console.log(err);
  }
  return;
};

deleteFile = async (fileList) => {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'ggKey.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const driveService = google.drive({
    version: 'v3',
    auth,
  });
  await Promise.all(
    fileList.map(async (f) => {
      try {
        const response = await driveService.files.delete({
          fileId: f,
        });
        resolve(response);
      } catch (err) {
        reject(err);
      }
    }),
  );
};

exportPdf = async (fileId) => {
  // Get credentials and build service
  // TODO (developer) - Use appropriate auth mechanism for your app
  const auth = new google.auth.GoogleAuth({
    keyFile: 'ggKey.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const service = google.drive({ version: 'v3', auth });

  try {
    const file = await service.files.get({
      fileId: fileId,
      alt: 'media',
    });
    const fileName = await service.files.get({
      fileId: fileId,
      fields: 'name',
    });
    return file.data;
  } catch (err) {
    throw err;
  }
};

const uploadFile = { upload, deleteFile, uploadOrder, exportPdf };
module.exports = uploadFile;
