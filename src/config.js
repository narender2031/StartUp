'use strict';

var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function required(env, key, errors) {
  var value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(key);
    return undefined;
  }
  return value.trim();
}

function optionalInteger(env, key, defaultValue, errors, options) {
  var raw = env[key];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }

  var value = Number(raw);
  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    errors.push(key);
    return defaultValue;
  }
  return value;
}

function parseBoolean(env, key, defaultValue, errors) {
  var raw = env[key];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }

  var normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  errors.push(key);
  return defaultValue;
}

function parseTrustProxy(env, errors) {
  var raw = env.TRUST_PROXY;
  if (raw === undefined || raw === '') {
    return false;
  }

  var normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  var numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric;
  }

  var parts = String(raw).split(',').map(function(part) {
    return part.trim();
  }).filter(Boolean);

  if (parts.length > 0) {
    return parts;
  }

  errors.push('TRUST_PROXY');
  return false;
}

function requiredEmail(env, key, errors) {
  var value = required(env, key, errors);
  if (value && (value.length > 254 || !EMAIL_PATTERN.test(value))) {
    errors.push(key);
  }
  return value;
}

function loadConfig(env) {
  env = env || process.env;
  var errors = [];

  var config = {
    port: optionalInteger(env, 'PORT', 3000, errors, { min: 1, max: 65535 }),
    trustProxy: parseTrustProxy(env, errors),
    smtp: {
      host: required(env, 'SMTP_HOST', errors),
      port: optionalInteger(env, 'SMTP_PORT', 587, errors, { min: 1, max: 65535 }),
      secure: parseBoolean(env, 'SMTP_SECURE', false, errors),
      auth: {
        user: required(env, 'SMTP_USER', errors),
        pass: required(env, 'SMTP_PASS', errors)
      }
    },
    contact: {
      fromEmail: requiredEmail(env, 'CONTACT_FROM_EMAIL', errors),
      toEmail: requiredEmail(env, 'CONTACT_TO_EMAIL', errors)
    }
  };

  if (errors.length > 0) {
    var uniqueErrors = Array.from(new Set(errors));
    throw new Error('Invalid configuration: ' + uniqueErrors.join(', '));
  }

  return config;
}

module.exports = {
  loadConfig: loadConfig
};
