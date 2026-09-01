import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 2000 },
    { duration: '1m', target: 5000 },
    { duration: '1m', target: 10000 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<150', 'p(99)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api/v1';
const TEST_TOKEN = __ENV.TEST_TOKEN || 'mock_jwt_token';

export default function () {
  const params = {
    headers: {
      Authorization: `Bearer ${TEST_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  const res = http.get(`${BASE_URL}/discovery?limit=20`, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has items array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        return false;
      }
    },
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(1);
}
