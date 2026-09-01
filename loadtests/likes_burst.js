import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 1000 },
    { duration: '40s', target: 5000 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<100', 'p(99)<250'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api/v1';
const TEST_TOKEN = __ENV.TEST_TOKEN || 'mock_jwt_token';

export default function () {
  const targetUserId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const idempotencyKey = `like-${__VU}-${Date.now()}`;

  const params = {
    headers: {
      Authorization: `Bearer ${TEST_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
  };

  const res = http.post(`${BASE_URL}/users/${targetUserId}/like`, null, params);

  check(res, {
    'status is 200 or 400': (r) => r.status === 200 || r.status === 400,
    'response has data or error': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data !== undefined || body.error !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);
}
