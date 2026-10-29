'use strict';

var rateLimit = require('express-rate-limit');
var ContactDeliveryError = require('../services/contact-mailer').ContactDeliveryError;

var ALLOWED_FIELDS = ['name', 'email', 'message'];
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var DEFAULT_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
};

function createContactRouter(options) {
  options = options || {};
  if (!options.mailer || typeof options.mailer.sendInquiry !== 'function') {
    throw new Error('createContactRouter requires a mailer with sendInquiry()');
  }

  var express = require('express');
  var router = express.Router();
  var limiter = createLimiter(options.rateLimit);

  router.post('/contact', limiter, contactHandler(options.mailer));

  return router;
}

function createLimiter(overrides) {
  var settings = Object.assign({}, DEFAULT_RATE_LIMIT, overrides || {});
  settings.handler = function(req, res) {
    sendError(res, 429, 'RATE_LIMITED', 'Too many contact requests. Please try again later.');
  };
  return rateLimit(settings);
}

function contactHandler(mailer) {
  return function(req, res, next) {
    var validation = validateContactInquiry(req.body);
    if (!validation.valid) {
      return sendError(res, 400, 'INVALID_CONTACT_INQUIRY', 'Contact inquiry is invalid.', validation.fields);
    }

    return mailer.sendInquiry(validation.value).then(function() {
      res.status(202).json({ status: 'accepted' });
    }).catch(function(error) {
      if (error instanceof ContactDeliveryError || error.code === 'CONTACT_DELIVERY_FAILED') {
        return sendError(res, 502, 'CONTACT_DELIVERY_FAILED', 'Contact inquiry could not be delivered.');
      }
      return next(error);
    });
  };
}

function validateContactInquiry(body) {
  var fields = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalid({ body: 'Request body must be a JSON object.' });
  }

  Object.keys(body).forEach(function(key) {
    if (ALLOWED_FIELDS.indexOf(key) === -1) {
      fields[key] = 'Unknown field.';
    }
  });

  var name = normalizeString(body.name);
  var email = normalizeString(body.email);
  var message = normalizeString(body.message);

  if (name === undefined) {
    fields.name = 'Name is required.';
  } else if (name.length < 1 || name.length > 100) {
    fields.name = 'Name must be between 1 and 100 characters.';
  } else if (/\r|\n/.test(name)) {
    fields.name = 'Name must be a single line.';
  }

  if (email === undefined) {
    fields.email = 'Email is required.';
  } else if (email.length < 1 || email.length > 254 || !EMAIL_PATTERN.test(email) || /\r|\n/.test(email)) {
    fields.email = 'Email must be a valid single-line address no longer than 254 characters.';
  }

  if (message === undefined) {
    fields.message = 'Message is required.';
  } else if (message.length < 1 || message.length > 5000) {
    fields.message = 'Message must be between 1 and 5000 characters.';
  }

  if (Object.keys(fields).length > 0) {
    return invalid(fields);
  }

  return {
    valid: true,
    value: {
      name: name,
      email: email,
      message: message
    }
  };
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.trim();
}

function invalid(fields) {
  return {
    valid: false,
    fields: fields
  };
}

function sendError(res, status, code, message, fields) {
  var body = {
    error: {
      code: code,
      message: message
    }
  };

  if (fields && Object.keys(fields).length > 0) {
    body.error.fields = fields;
  }

  return res.status(status).json(body);
}

module.exports = {
  createContactRouter: createContactRouter,
  contactHandler: contactHandler,
  validateContactInquiry: validateContactInquiry,
  sendError: sendError
};
