'use strict';

class ContactDeliveryError extends Error {
  constructor(message, cause) {
    super(message || 'Contact inquiry delivery failed');
    this.name = 'ContactDeliveryError';
    this.code = 'CONTACT_DELIVERY_FAILED';
    this.cause = cause;
  }
}

class ContactMailer {
  constructor(options) {
    if (!options || !options.transport || !options.fromEmail || !options.toEmail) {
      throw new Error('ContactMailer requires transport, fromEmail, and toEmail');
    }

    this.transport = options.transport;
    this.fromEmail = options.fromEmail;
    this.toEmail = options.toEmail;
  }

  sendInquiry(inquiry) {
    var message = {
      from: this.fromEmail,
      to: this.toEmail,
      replyTo: inquiry.email,
      subject: 'New contact inquiry from ' + inquiry.name,
      text: renderPlainTextInquiry(inquiry)
    };

    return this.transport.sendMail(message).catch(function(error) {
      throw new ContactDeliveryError(undefined, error);
    });
  }
}

function renderPlainTextInquiry(inquiry) {
  return [
    'New contact inquiry',
    '',
    'Name: ' + inquiry.name,
    'Email: ' + inquiry.email,
    '',
    'Message:',
    inquiry.message
  ].join('\n');
}

module.exports = {
  ContactMailer: ContactMailer,
  ContactDeliveryError: ContactDeliveryError,
  renderPlainTextInquiry: renderPlainTextInquiry
};
