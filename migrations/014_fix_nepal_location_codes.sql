UPDATE user_locations
SET country_code = 'NP'
WHERE UPPER(COALESCE(country_code, '')) = 'US'
  AND latitude BETWEEN 26.3 AND 30.5
  AND longitude BETWEEN 80.0 AND 88.3;