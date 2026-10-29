# Ki4Universe static site and contact API

This project serves the existing Bootstrap static site and adds a small Express runtime for contact inquiries.

## Setup

```sh
npm install
npm run check
npm test
gulp
```

Start the HTTP server with:

```sh
npm start
```

The app serves `index.html` and the existing root-relative assets (`/css`, `/js`, `/vendor`, `/img`) unchanged. API routes are mounted before static file serving under `/api`.

## Environment configuration

Copy `.env.example` into your deployment configuration and provide real values there. Do not commit secrets.

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port. Defaults to `3000`. |
| `TRUST_PROXY` | No | Express trust-proxy setting. Defaults to `false`. Use the exact deployed proxy hop count, boolean, or comma-separated trusted proxy list. |
| `SMTP_HOST` | Yes | SMTP host name. |
| `SMTP_PORT` | No | SMTP port. Defaults to `587`. |
| `SMTP_SECURE` | No | `true` for TLS-on-connect, `false` otherwise. Defaults to `false`. |
| `SMTP_USER` | Yes | SMTP account username. |
| `SMTP_PASS` | Yes | SMTP account password/secret. |
| `CONTACT_FROM_EMAIL` | Yes | Configured sender address for outbound mail. |
| `CONTACT_TO_EMAIL` | Yes | Recipient address for contact inquiries. |

Startup validates configuration and reports only the invalid key names, never secret values.

## Contact API

`POST /api/contact`

Headers:

```http
Content-Type: application/json
```

Request body:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "message": "Please contact me about a project."
}
```

Only `name`, `email`, and `message` are accepted. Values are trimmed before delivery.

Validation rules:

- `name`: required string, single line, 1 to 100 characters.
- `email`: required string, single line, valid email shape, up to 254 characters.
- `message`: required string, 1 to 5000 characters.
- Unknown fields are rejected.
- JSON body size is limited to 16 KB.

Success is returned only after the configured SMTP provider accepts the message:

```json
{ "status": "accepted" }
```

The visitor's email address is set as `Reply-To` only. `From` and `To` always come from environment configuration to avoid spoofing and DMARC failures.

## Error contract

All API failures use this envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe message",
    "fields": {
      "fieldName": "Validation details when applicable."
    }
  }
}
```

Status codes:

| Status | Code | When |
| --- | --- | --- |
| `400` | `INVALID_CONTACT_INQUIRY` | Missing, invalid, or unknown fields. |
| `400` | `MALFORMED_JSON` | Request body is not valid JSON. |
| `413` | `PAYLOAD_TOO_LARGE` | JSON body exceeds the configured parser limit. |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Request content type is not `application/json`. |
| `429` | `RATE_LIMITED` | Too many submissions from the same client IP. |
| `502` | `CONTACT_DELIVERY_FAILED` | SMTP delivery failed or was rejected. |
| `404` | `NOT_FOUND` | Unknown `/api` route. |
| `500` | `INTERNAL_ERROR` | Unexpected API error. |

Provider errors, credentials, stack traces, and SMTP host details are not included in API responses.

## Proxy and rate limiting

The contact endpoint is public because anonymous visitors have no identity to authenticate. Abuse controls are content type enforcement, a 16 KB JSON body limit, strict field validation, safe mail headers, and per-IP throttling.

The rate limiter keys by Express' client IP. If the service runs behind a reverse proxy, set `TRUST_PROXY` to match the actual topology before relying on the limit. A value that trusts too many hops can let callers spoof their IP; a value that trusts too few hops can group many visitors under the proxy IP.

## Operational commands

```sh
npm start       # run the Express server
npm run check   # syntax-check server, src, and test modules
npm test        # run isolated API and mailer tests with no live SMTP
gulp            # rebuild static CSS, JS, and vendor assets
```

## Deployment smoke test

With authorized SMTP settings in the deployment environment, submit a valid JSON request to `POST /api/contact`. The service should deliver one message to `CONTACT_TO_EMAIL` and return `202 {"status":"accepted"}`. Also test malformed JSON, invalid fields, non-JSON content, an oversized body, repeated requests above the rate limit, and an SMTP outage; each should return the documented safe error envelope.
