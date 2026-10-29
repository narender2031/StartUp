'use strict';

var express = require('express');
var path = require('path');
var createContactRouter = require('./routes/contact').createContactRouter;
var sendError = require('./routes/contact').sendError;

var JSON_LIMIT = '16kb';

function createApp(options) {
  options = options || {};
  if (!options.mailer) {
    throw new Error('createApp requires a contact mailer');
  }

  var app = express();
  var publicRoot = options.publicRoot || path.resolve(__dirname, '..');

  app.set('trust proxy', options.trustProxy || false);

  app.use('/api', requireJsonContent);
  app.use('/api', express.json({ limit: options.jsonLimit || JSON_LIMIT }));
  app.use('/api', createContactRouter({
    mailer: options.mailer,
    rateLimit: options.rateLimit
  }));

  app.use(express.static(publicRoot));

  app.use('/api', function(req, res) {
    sendError(res, 404, 'NOT_FOUND', 'API route not found.');
  });

  app.use(function(error, req, res, next) {
    if (res.headersSent) {
      return next(error);
    }

    if (error && error.type === 'entity.too.large') {
      return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    }

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return sendError(res, 400, 'MALFORMED_JSON', 'Request body must be valid JSON.');
    }

    if (req.path.indexOf('/api') === 0) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    }

    return next(error);
  });

  return app;
}

function requireJsonContent(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  if (!req.is('application/json')) {
    return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body must use application/json.');
  }

  return next();
}

module.exports = {
  createApp: createApp,
  requireJsonContent: requireJsonContent
};
