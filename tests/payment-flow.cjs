const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const transactionSource = fs.readFileSync(path.join(__dirname, '..', 'transactions.js'), 'utf8');
assert.match(transactionSource, /upi:\/\/pay\?/i, 'UPI intent URI must be generated for mobile payments');
assert.match(transactionSource, /buildUpiUrl\(|payByUpi\(|tr=|unique.*reference|window\.location\.href = buildUpiUrl\(|window\.location\.href = payByUpi\(/i, 'Direct UPI launch and unique transaction reference must be present');
assert.match(transactionSource, /8588993989@ptyes/i, 'The SVN VPA must be set for the direct UPI launcher');
assert.match(transactionSource, /Pay directly by UPI|Open Google Pay, PhonePe, BHIM|\+91 85889 93989/i, 'Fallback payment instructions must mirror the old SVN donor guidance');
assert.doesNotMatch(transactionSource, /transaction-overlay|Pay by UPI|PAY BY UPI|Open your installed UPI app|payment-status-region|Waiting for payment|modal-button|Review Contribution|donor information form/i, 'The intermediate payment modal and pre-payment flow must be removed');
assert.doesNotMatch(transactionSource, /preventDefault\(\)\s*;\s*stopPropagation\(\)\s*;\s*window\.location\.href = buildUpiUrl\(/i, 'Direct launch should remain immediate and not blocked by another click intercept');

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
