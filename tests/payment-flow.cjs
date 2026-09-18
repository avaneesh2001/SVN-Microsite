const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const transactionSource = fs.readFileSync(path.join(__dirname, '..', 'transactions.js'), 'utf8');
assert.doesNotMatch(transactionSource, /upi:\/\/pay\?/i, 'The broken merchant UPI intent must be removed until the MCC and gateway are configured');
assert.match(transactionSource, /revealUpiFallback\(|payByUpi\(|sangeetvidyaniketan@ptyes|Open Google Pay, PhonePe, BHIM or any UPI app and pay to the UPI ID above/i, 'The manual UPI fallback must be active');
assert.doesNotMatch(transactionSource, /8588993989@ptyes|8588993989/i, 'The stale VPA must never be in the project again');
assert.doesNotMatch(transactionSource, /merchantCategoryCode|returnUrl|PaymentRequest|https:\/\/tez\.google\.com\/pay|createTransactionRef|tr:|mc:|url:/i, 'The merchant UPI launch logic must not be active until the bank/MCC is configured');
assert.match(transactionSource, /copyButton\.textContent = 'UPI ID copied'|UPI ID copied/i, 'The manual UPI copy action must show the copied confirmation');
assert.doesNotMatch(transactionSource, /transaction-overlay|Pay by UPI|PAY BY UPI|Open your installed UPI app|payment-status-region|Waiting for payment|Review Contribution|donor information form|modal-button/i, 'The intermediate payment modal and pre-payment flow must be removed');

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
