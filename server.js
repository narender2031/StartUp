'use strict';

var nodemailer = require('nodemailer');
var loadConfig = require('./src/config').loadConfig;
var createApp = require('./src/app').createApp;
var ContactMailer = require('./src/services/contact-mailer').ContactMailer;

var config = loadConfig();
var transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: config.smtp.auth
});

var mailer = new ContactMailer({
  transport: transport,
  fromEmail: config.contact.fromEmail,
  toEmail: config.contact.toEmail
});

var app = createApp({
  mailer: mailer,
  trustProxy: config.trustProxy
});

app.listen(config.port, function() {
  console.log('Server listening on port ' + config.port);
});
