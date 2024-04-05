const nodeMailer = require('nodemailer');

const APP_PASSWORD = 'fvyy tqlr bkve ukzp';

const mailConfig = {
  pool: true,
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use SSL
  auth: {
    user: 'kshop9175@gmail.com',
    pass: APP_PASSWORD,
  },
  authMethod: 'LOGIN', // Specify the authentication method
};

const sendEmail = async (options) => {
  const transporter = nodeMailer.createTransport(mailConfig);

  const mailOptions = {
    from: '3KSHOP <kshop9175@gmail.com>',
    to: options.to,
    subject: options.subject,
    html: options.message,
  };
  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
