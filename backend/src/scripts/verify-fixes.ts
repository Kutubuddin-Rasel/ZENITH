async function verify() {
  const BASE_URL = 'http://127.0.0.1:3000';
  const email = `test-${Date.now()}@example.com`;
  const password = 'Password123!';

  console.log('1. Creating test user...');
  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Test User' }),
  });

  if (!registerRes.ok) {
    console.error('Failed to register:', await registerRes.text());
    // Try login if register fails (user might exist)
    console.log('Register failed, trying login...');
  } else {
    console.log('User registered.');
  }

  console.log('2. Logging in...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!loginRes.ok) {
    console.error('Failed to login:', await loginRes.text());
    return;
  }

  const loginData = (await loginRes.json()) as { access_token: string };
  const token = loginData.access_token;
  console.log('Logged in. Token received.');

  console.log(
    '3. Testing Smart Defaults API (GET /api/smart-defaults/behavior-pattern)...',
  );
  const smartDefaultsRes = await fetch(
    `${BASE_URL}/api/smart-defaults/behavior-pattern`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (smartDefaultsRes.ok) {
    console.log(
      '✅ Smart Defaults API Success:',
      await smartDefaultsRes.json(),
    );
  } else {
    console.error(
      '❌ Smart Defaults API Failed:',
      smartDefaultsRes.status,
      await smartDefaultsRes.text(),
    );
  }

  console.log('4. Testing Onboarding API (GET /api/onboarding/steps)...');
  const onboardingRes = await fetch(`${BASE_URL}/api/onboarding/steps`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (onboardingRes.ok) {
    console.log('✅ Onboarding API Success:', await onboardingRes.json());
  } else {
    console.error(
      '❌ Onboarding API Failed:',
      onboardingRes.status,
      await onboardingRes.text(),
    );
  }
}

verify().catch(console.error);
