const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const sqlite3 = require('sqlite3');
const { MEMBERSHIP_TIERS, ORGANISATION_SETTINGS } = require('./membership-config.cjs');

const app = express();
const port = Number(process.env.PORT || 8787);
const dataDirectory = process.env.SVN_DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });
const database = new sqlite3.Database(path.join(dataDirectory, 'golden-circle.sqlite'));

const run = (sql, params = []) => new Promise((resolve, reject) => database.run(sql, params, function(error) { error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID }); }));
const get = (sql, params = []) => new Promise((resolve, reject) => database.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const exec = sql => new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
const now = () => new Date().toISOString();
const id = prefix => `${prefix}_${crypto.randomUUID()}`;
const receiptNumber = () => `SVN-${new Date().getUTCFullYear()}-${crypto.randomInt(100000,999999)}`;

const initialise = async () => {
  await exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await run('INSERT OR REPLACE INTO organisation_settings(setting_key,setting_value_json,updated_at) VALUES(?,?,?)', ['tax_receipt_policy',JSON.stringify(ORGANISATION_SETTINGS.tax_receipt_policy),now()]);
};

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/api/membership-tiers', (_request, response) => response.json({ tiers: Object.values(MEMBERSHIP_TIERS), membershipPeriod: 'one_year_from_enrolment' }));
app.get('/api/organisation-settings/tax-receipt-policy', (_request, response) => response.json(ORGANISATION_SETTINGS.tax_receipt_policy));

app.post('/api/checkouts/membership', async (request, response, next) => {
  try {
    const tier = MEMBERSHIP_TIERS[request.body?.membershipTier];
    if (!tier) return response.status(400).json({ error: 'INVALID_MEMBERSHIP_TIER' });
    const donorId = id('donor'), donationId = id('donation'), membershipId = id('membership'), createdAt = now();
    await run('BEGIN IMMEDIATE');
    try {
      const contact = { name: '', email: '', mobile: '' };
      await run('INSERT INTO donors(id,full_name,email,mobile,city,pan,message,created_at) VALUES(?,?,?,?,?,?,?,?)',[donorId,contact.name.trim(),contact.email.trim(),contact.mobile.trim(),'','','',createdAt]);
      await run('INSERT INTO donations(id,donor_id,transaction_type,amount,payment_status,created_at) VALUES(?,?,?,?,?,?)',[donationId,donorId,'GOLDEN_CIRCLE_MEMBERSHIP',tier.amount,'pending',createdAt]);
      await run('INSERT INTO memberships(id,membership_tier,membership_amount,membership_status,donor_id,donation_id,benefits_json,created_at) VALUES(?,?,?,?,?,?,?,?)',[membershipId,tier.code,tier.amount,'pending',donorId,donationId,JSON.stringify(tier.benefits),createdAt]);
      await run('COMMIT');
    } catch (error) { await run('ROLLBACK'); throw error; }
    const accessToken = crypto.randomBytes(32).toString('hex');
    await run('INSERT INTO checkout_access(donation_id,token_hash) VALUES(?,?)', [donationId, crypto.createHash('sha256').update(accessToken).digest('hex')]);
    response.status(201).json({ accessToken, checkoutId: donationId, membershipId, membershipTier: tier.code, amount: tier.amount, currency: 'INR', paymentStatus: 'pending', paymentProvider: null, nextAction: 'PAYMENT_PROVIDER_CONFIGURATION_REQUIRED' });
  } catch (error) { next(error); }
});

app.post('/api/checkouts/contribution', async (request, response, next) => {
  try {
    const amount = Number(request.body?.amount);
    if (!Number.isInteger(amount) || amount < 100) return response.status(400).json({ error: 'INVALID_CONTRIBUTION_AMOUNT' });
    const donorId = id('donor'), donationId = id('donation'), createdAt = now(), contact = { name: '', email: '', mobile: '' };
    await run('INSERT INTO donors(id,full_name,email,mobile,city,pan,message,created_at) VALUES(?,?,?,?,?,?,?,?)',[donorId,contact.name.trim(),contact.email.trim(),contact.mobile.trim(),'','','',createdAt]);
    await run('INSERT INTO donations(id,donor_id,transaction_type,amount,payment_status,created_at) VALUES(?,?,?,?,?,?)',[donationId,donorId,'GENERAL_CONTRIBUTION',amount,'pending',createdAt]);
    const accessToken = crypto.randomBytes(32).toString('hex');
    await run('INSERT INTO checkout_access(donation_id,token_hash) VALUES(?,?)', [donationId, crypto.createHash('sha256').update(accessToken).digest('hex')]);
    response.status(201).json({ accessToken, checkoutId: donationId, amount, currency: 'INR', paymentStatus: 'pending', paymentProvider: null, nextAction: 'PAYMENT_PROVIDER_CONFIGURATION_REQUIRED' });
  } catch (error) { next(error); }
});

async function finalizeVerifiedPayment({ donationId, gatewayPaymentId }) {
  if (!donationId || !gatewayPaymentId) throw new Error('Verified gateway identifiers are required');
  const donation = await get('SELECT * FROM donations WHERE id=?',[donationId]);
  if (!donation || donation.payment_status !== 'pending') throw new Error('Donation is not pending');
  const receipt = receiptNumber(), verifiedAt = now();
  await run('BEGIN IMMEDIATE');
  try {
    await run('UPDATE donations SET payment_status=?,gateway_payment_id=?,receipt_number=?,verified_at=? WHERE id=?',['verified',gatewayPaymentId,receipt,verifiedAt,donationId]);
    if (donation.transaction_type === 'GOLDEN_CIRCLE_MEMBERSHIP') {
      const start = new Date(verifiedAt), expiry = new Date(verifiedAt);
      expiry.setUTCFullYear(expiry.getUTCFullYear()+1); expiry.setUTCDate(expiry.getUTCDate()-1);
      await run('UPDATE memberships SET membership_start_date=?,membership_expiry_date=?,membership_status=?,receipt_number=? WHERE donation_id=?',[start.toISOString().slice(0,10),expiry.toISOString().slice(0,10),'active',receipt,donationId]);
    }
    await run('COMMIT');
  } catch (error) { await run('ROLLBACK'); throw error; }
  return { donationId, receiptNumber: receipt, paymentStatus: 'verified' };
}

// These routes read server-owned state; no browser endpoint can mark a payment verified.
const authorisedCheckout = async (request, response) => {
  response.set('Cache-Control', 'no-store');
  const token = (request.get('Authorization') || '').replace(/^Bearer /, '');
  const donation = await get('SELECT d.* FROM donations d JOIN checkout_access a ON a.donation_id=d.id WHERE d.id=? AND a.token_hash=?', [request.params.id, crypto.createHash('sha256').update(token).digest('hex')]);
  if (!donation) response.status(404).json({ error: 'CHECKOUT_NOT_FOUND' });
  return donation;
};
app.get('/api/checkouts/:id/status', async (request, response, next) => {
  try {
    const donation = await authorisedCheckout(request, response);
    if (!donation) return;
    response.json({ paymentStatus: donation.payment_status, receiptNumber: donation.receipt_number });
  } catch (error) { next(error); }
});
app.post('/api/checkouts/:id/receipt-request', async (request, response, next) => {
  try {
    const donation = await authorisedCheckout(request, response);
    if (!donation) return;
    if (donation.payment_status !== 'verified') return response.status(409).json({ error: 'PAYMENT_NOT_VERIFIED' });
    const fields = ['name','email','pan','address','city','postalCode','country'];
    const details = {};
    for (const key of fields) {
      const value = request.body?.[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 500) return response.status(400).json({ error: 'INVALID_RECEIPT_DETAILS' });
      details[key] = value.trim();
    }
    details.pan = details.pan.toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(details.pan) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) return response.status(400).json({ error: 'INVALID_RECEIPT_DETAILS' });
    await run('INSERT INTO tax_receipt_requests(donation_id,details_json,requested_at) VALUES(?,?,?) ON CONFLICT(donation_id) DO UPDATE SET details_json=excluded.details_json, requested_at=excluded.requested_at', [donation.id, JSON.stringify(details), now()]);
    response.status(202).json({ status: 'pending_review' });
  } catch (error) { next(error); }
});

app.use('/SVN-Microsite', express.static(path.join(__dirname, '..', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use((request, response, next) => {
  if (request.method === 'GET' && !request.path.startsWith('/api/')) return response.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  next();
});
app.use((error, _request, response, _next) => { console.error(error); response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' }); });

if (require.main === module) initialise().then(() => app.listen(port, () => console.log(`Golden Circle server listening on http://localhost:${port}`))).catch(error => { console.error(error); process.exit(1); });

module.exports = { app, initialise, database, finalizeVerifiedPayment };
