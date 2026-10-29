'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var request = require('supertest');
var createApp = require('../src/app').createApp;
var ContactDeliveryError = require('../src/services/contact-mailer').ContactDeliveryError;

function createMailer(options) {
  options = options || {};
  var calls = [];
  return {
    calls: calls,
    sendInquiry: function(inquiry) {
      calls.push(inquiry);
      if (options.reject) {
        return Promise.reject(options.reject);
      }
      return Promise.resolve(options.acceptance || { accepted: ['ops@example.com'] });
    }
  };
}

function appFor(mailer, options) {
  return createApp(Object.assign({
    mailer: mailer,
    rateLimit: {
      limit: 50,
      windowMs: 60 * 1000,
      validate: false
    }
  }, options || {}));
}

test('POST /api/contact accepts valid JSON after normalizing fields and invokes mailer', async function() {
  var mailer = createMailer();
  var app = appFor(mailer);

  var response = await request(app)
    .post('/api/contact')
    .set('Content-Type', 'application/json')
    .send({
      name: '  Ada Lovelace  ',
      email: '  ada@example.com  ',
      message: '  Please contact me.  '
    });

  assert.equal(response.status, 202);
  assert.deepEqual(response.body, { status: 'accepted' });
  assert.deepEqual(mailer.calls, [{
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'Please contact me.'
  }]);
});

test('POST /api/contact rejects missing, invalid, and unknown fields', async function() {
  var mailer = createMailer();
  var app = appFor(mailer);

  var response = await request(app)
    .post('/api/contact')
    .set('Content-Type', 'application/json')
    .send({
      name: 'Mallory\nInjected',
      email: 'not-an-email',
      extra: 'unexpected'
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_CONTACT_INQUIRY');
  assert.equal(response.body.error.fields.name, 'Name must be a single line.');
  assert.equal(response.body.error.fields.email, 'Email must be a valid single-line address no longer than 254 characters.');
  assert.equal(response.body.error.fields.message, 'Message is required.');
  assert.equal(response.body.error.fields.extra, 'Unknown field.');
  assert.equal(mailer.calls.length, 0);
});

test('POST /api/contact rejects malformed JSON with stable error envelope', async function() {
  var mailer = createMailer();
  var app = appFor(mailer);

  var response = await request(app)
    .post('/api/contact')
    .set('Content-Type', 'application/json')
    .send('{"name":');

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: {
      code: 'MALFORMED_JSON',
      message: 'Request body must be valid JSON.'
    }
  });
  assert.equal(mailer.calls.length, 0);
});

test('POST /api/contact rejects non-JSON bodies before delivery', async function() {
  var mailer = createMailer();
  var app = appFor(mailer);

  var response = await request(app)
    .post('/api/contact')
    .set('Content-Type', 'text/plain')
    .send('name=Ada');

  assert.equal(response.status, 415);
  assert.equal(response.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  assert.equal(mailer.calls.length, 0);
});

test('POST /api/contact rejects oversized JSON safely', async function() {
  var mailer = createMailer();
  var app = appFor(mailer, { jsonLimit: '100b' });

  var response = await request(app)
    .post('/api/contact')
    .set('Content-Type', 'application/json')
    .send({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'x'.repeat(500)
    });

  assert.equal(response.status, 413);
  assert.deepEqual(response.body, {
    error: {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large.'
    }
  });
  assert.equal(mailer.calls.length, 0);
});

test('POST /api/contact rate limits repeated callers per app instance', async function() {
  var mailer = createMailer();
  var app = appFor(mailer, {
    rateLimit: {
      limit: 1,
      windowMs: 60 * 1000,
      validate: false
    }
  });
  var payload = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'Please contact me.'
  };

  var accepted = await request(app).post('/api/contact').send(payload);
  var throttled = await request(app).post('/api/contact').send(payload);

  assert.equal(accepted.status, 202);
  assert.equal(throttled.status, 429);
  assert.deepEqual(throttled.body, {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many contact requests. Please try again later.'
    }
  });
  assert.equal(mailer.calls.length, 1);
});

test('POST /api/contact maps mail provider failures to generic 502', async function() {
  var mailer = createMailer({ reject: new ContactDeliveryError('smtp exploded', new Error('secret host')) });
  var app = appFor(mailer);

  var response = await request(app)
    .post('/api/contact')
    .send({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'Please contact me.'
    });

  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    error: {
      code: 'CONTACT_DELIVERY_FAILED',
      message: 'Contact inquiry could not be delivered.'
    }
  });
  assert.doesNotMatch(JSON.stringify(response.body), /secret|smtp exploded/i);
});

test('API not found uses JSON envelope', async function() {
  var mailer = createMailer();
  var app = appFor(mailer);

  var response = await request(app).get('/api/unknown');

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: {
      code: 'NOT_FOUND',
      message: 'API route not found.'
    }
  });
});

test('static index and root-relative assets remain available', async function() {
  var mailer = createMailer();
  var app = appFor(mailer);

  var indexResponse = await request(app).get('/');
  var assetResponse = await request(app).get('/js/creative.js');

  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.text, /Ki4Universe/);
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.text, /Smooth scrolling/);
});
