const { google } = require('googleapis');
const fs = require('fs');
const { resolve } = require('path');

const FOLDER_ID = '1aHCngO3_VGA3eMQl7Ilo8A9m0hGEb89K';

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
        parents: [FOLDER_ID],
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

const uploadFile = { upload, deleteFile };
module.exports = uploadFile;
