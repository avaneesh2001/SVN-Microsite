const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SVN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-payment-test-'));
const { app, initialise, database, finalizeVerifiedPayment } = require('../server/index.cjs');
(async () => {
 await initialise();
 const server = app.listen(0, '127.0.0.1');
 await new Promise(resolve => server.once('listening', resolve));
 const base = `http://127.0.0.1:${server.address().port}`;
 const request = async (url, body, token) => {
  const response = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
 };
 try {
  for (const tier of require('../membership-tiers.json').tiers) {
   const checkout = await request('/api/checkouts/membership', { membershipTier: tier.code, amount: 1 });
   assert.equal(checkout.status, 201); assert.equal(checkout.data.amount, tier.amount);
  }
  assert.equal((await request('/api/checkouts/membership', { membershipTier: 'MEMBER_10000' })).status, 400);
  assert.equal((await request('/api/checkouts/contribution', { amount: 99 })).status, 400);
  const { data: checkout } = await request('/api/checkouts/contribution', { amount: 1500 });
  const url = `/api/checkouts/${checkout.checkoutId}`;
  assert.equal((await request(url + '/status')).status, 404);
  assert.equal((await request(url + '/status', null, checkout.accessToken)).data.paymentStatus, 'pending');
  const details = { name: 'Test Donor', email: 'test@example.com', pan: 'ABCDE1234F', address: 'Test address', city: 'Test city', postalCode: '110001', country: 'India' };
  assert.equal((await request(url + '/receipt-request', details, checkout.accessToken)).status, 409);
  await finalizeVerifiedPayment({ donationId: checkout.checkoutId, gatewayPaymentId: 'test-verified-provider-id' });
  assert.equal((await request(url + '/status', null, checkout.accessToken)).data.paymentStatus, 'verified');
  assert.equal((await request(url + '/receipt-request', {...details, pan:'invalid'}, checkout.accessToken)).status, 400);
  assert.equal((await request(url + '/receipt-request', details, 'incorrect-token')).status, 404);
  assert.equal((await request(url + '/receipt-request', details, checkout.accessToken)).status, 202);
  assert.equal((await request(url + '/receipt-request', details, checkout.accessToken)).status, 202);
  const row = await new Promise((resolve,reject) => database.get('SELECT eligible_80g_amount FROM donations WHERE id=?', [checkout.checkoutId], (err,row) => err ? reject(err) : resolve(row)));
  assert.equal(row.eligible_80g_amount, null);
  console.log('PASS: anonymous checkout, all tier amounts, authorization, verified-only receipt requests, validation, repeat submission and unchanged tax eligibility.');
 } finally { await new Promise(resolve => server.close(resolve)); await new Promise(resolve => database.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
