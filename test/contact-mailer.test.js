'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var ContactMailer = require('../src/services/contact-mailer').ContactMailer;
var ContactDeliveryError = require('../src/services/contact-mailer').ContactDeliveryError;
var renderPlainTextInquiry = require('../src/services/contact-mailer').renderPlainTextInquiry;

function inquiry() {
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'Please contact me about analytics.'
  };
}

test('ContactMailer sends configuration-owned headers with visitor address only as Reply-To', async function() {
  var sentMessages = [];
  var transport = {
    sendMail: function(message) {
      sentMessages.push(message);
      return Promise.resolve({ accepted: ['contact@example.com'] });
    }
  };
  var mailer = new ContactMailer({
    transport: transport,
    fromEmail: 'website@example.com',
    toEmail: 'contact@example.com'
  });

  var result = await mailer.sendInquiry(inquiry());

  assert.deepEqual(result, { accepted: ['contact@example.com'] });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].from, 'website@example.com');
  assert.equal(sentMessages[0].to, 'contact@example.com');
  assert.equal(sentMessages[0].replyTo, 'ada@example.com');
  assert.equal(sentMessages[0].subject, 'New contact inquiry from Ada Lovelace');
  assert.match(sentMessages[0].text, /Name: Ada Lovelace/);
  assert.match(sentMessages[0].text, /Email: ada@example.com/);
  assert.match(sentMessages[0].text, /Please contact me about analytics\./);
});

test('renderPlainTextInquiry includes normalized inquiry fields without HTML', function() {
  assert.equal(renderPlainTextInquiry(inquiry()), [
    'New contact inquiry',
    '',
    'Name: Ada Lovelace',
    'Email: ada@example.com',
    '',
    'Message:',
    'Please contact me about analytics.'
  ].join('\n'));
});

test('ContactMailer translates transport failures to typed delivery errors without leaking details', async function() {
  var providerError = new Error('provider secret details');
  var mailer = new ContactMailer({
    transport: {
      sendMail: function() {
        return Promise.reject(providerError);
      }
    },
    fromEmail: 'website@example.com',
    toEmail: 'contact@example.com'
  });

  await assert.rejects(
    function() {
      return mailer.sendInquiry(inquiry());
    },
    function(error) {
      assert.ok(error instanceof ContactDeliveryError);
      assert.equal(error.code, 'CONTACT_DELIVERY_FAILED');
      assert.equal(error.message, 'Contact inquiry delivery failed');
      assert.equal(error.cause, providerError);
      return true;
    }
  );
});
