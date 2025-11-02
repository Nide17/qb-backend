const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

const createTransporter = () => {

  return nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    pool: true,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    maxConnections: 20,
    maxMessages: Infinity
  });
};

const sendActualMail = async (transporter, mailOptions, retries) => {
  for (let i = 0; i < retries; i++) {
    try {
      const info = await new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            reject(error);
          } else {
            resolve(info);
          }
        });
      });
      console.log('Email sent: ' + info?.response);
      return info;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed: ${error}`);
      if (i === retries - 1) throw error;
    }
  }
};

const sendEmail = async (email, subject, payload, template, retries = 3) => {
  try {
    const transporter = createTransporter();
    const source = fs.readFileSync(path.join(__dirname, template), 'utf8');
    const compiledTemplate = handlebars.compile(source);
    const mailOptions = {
      from: '"quizblog.rw(Quiz-Blog)" <quizblog.rw@gmail.com>',
      to: email,
      subject: subject,
      html: compiledTemplate(payload),
    };
    return await sendActualMail(transporter, mailOptions, retries);
  } catch (error) {
    console.error(`Failed to send email to ${email}: ${error.message}`);
    // Rethrow the error or handle it in another way
    throw { 'message': `Failed to send email to ${email}.`, 'status': 500 };
  }
};

const sendHtmlEmail = async (email, subject, html, retries = 3) => {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: '"quizblog.rw(Quiz-Blog)" <quizblog.rw@gmail.com>',
      to: email,
      subject: subject,
      html: html,
    };
    return await sendActualMail(transporter, mailOptions, retries);
  } catch (error) {
    console.error(`Failed to send email to ${email}: ${error.message}`);
    throw { 'message': `Failed to send email to ${email}.`, 'status': 500 };
  }
};

module.exports = { sendEmail, sendHtmlEmail };
