const nodemailer = require("nodemailer");
const handlebars = require("handlebars");
const fs = require("fs/promises");
const path = require("path");

let cachedTransporter = null;
let templateCache = {};

// Create ONE reusable transporter
const createTransporter = () => {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      pool: true,
      maxConnections: 20,
      maxMessages: 1000,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return cachedTransporter;
};

// Load and cache templates
const loadTemplate = async (templatePath) => {
  if (templateCache[templatePath]) return templateCache[templatePath];

  const filePath = path.join(__dirname, templatePath);
  const fileContent = await fs.readFile(filePath, "utf8");
  const compiled = handlebars.compile(fileContent);

  templateCache[templatePath] = compiled;
  return compiled;
};

// Retry with exponential backoff
const sendWithRetry = async (transporter, mailOptions, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("📧 Email sent:", mailOptions.to);
      return info;
    } catch (error) {
      console.error(`❌ Email attempt ${i + 1} failed:`, error.message);

      if (i === retries - 1) throw error;

      const delay = Math.pow(2, i) * 1000; // exponential
      await new Promise((res) => setTimeout(res, delay));
    }
  }
};

const sendEmail = async (email, subject, payload, templatePath, retries = 3) => {
  try {
    const transporter = createTransporter();
    const compiledTemplate = await loadTemplate(templatePath);

    const html = compiledTemplate(payload);

    const mailOptions = {
      from: `"QuizBlog Rwanda" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      html,
    };

    return await sendWithRetry(transporter, mailOptions, retries);
  } catch (error) {
    console.error("❌ sendEmail error:", error.message);
    return { success: false, error: error.message };
  }
};

const sendHtmlEmail = async (email, subject, html, retries = 3) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"QuizBlog Rwanda" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      html,
    };

    return await sendWithRetry(transporter, mailOptions, retries);
  } catch (error) {
    console.error("❌ sendHtmlEmail error:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendEmail,
  sendHtmlEmail,
  sendWithRetry,
  createTransporter,
};
