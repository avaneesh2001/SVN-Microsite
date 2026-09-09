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

const validateContact = contact => contact && ['name','email','mobile','city'].every(key => typeof contact[key] === 'string' && contact[key].trim());

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/api/membership-tiers', (_request, response) => response.json({ tiers: Object.values(MEMBERSHIP_TIERS), membershipPeriod: 'one_year_from_enrolment' }));
app.get('/api/organisation-settings/tax-receipt-policy', (_request, response) => response.json(ORGANISATION_SETTINGS.tax_receipt_policy));

app.post('/api/checkouts/membership', async (request, response, next) => {
  try {
    const tier = MEMBERSHIP_TIERS[request.body?.membershipTier];
    if (!tier) return response.status(400).json({ error: 'INVALID_MEMBERSHIP_TIER' });
    if (!validateContact(request.body.contact)) return response.status(400).json({ error: 'INVALID_CONTACT_DETAILS' });
    const donorId = id('donor'), donationId = id('donation'), membershipId = id('membership'), createdAt = now();
    await run('BEGIN IMMEDIATE');
    try {
      const contact = request.body.contact;
      await run('INSERT INTO donors(id,full_name,email,mobile,city,pan,message,created_at) VALUES(?,?,?,?,?,?,?,?)',[donorId,contact.name.trim(),contact.email.trim(),contact.mobile.trim(),contact.city.trim(),contact.pan?.trim()||null,contact.message?.trim()||null,createdAt]);
      await run('INSERT INTO donations(id,donor_id,transaction_type,amount,payment_status,created_at) VALUES(?,?,?,?,?,?)',[donationId,donorId,'membership',tier.amount,'pending',createdAt]);
      await run('INSERT INTO memberships(id,membership_tier,membership_amount,membership_status,donor_id,donation_id,benefits_json,created_at) VALUES(?,?,?,?,?,?,?,?)',[membershipId,tier.code,tier.amount,'pending',donorId,donationId,JSON.stringify(tier.benefits),createdAt]);
      await run('COMMIT');
    } catch (error) { await run('ROLLBACK'); throw error; }
    response.status(201).json({ checkoutId: donationId, membershipId, membershipTier: tier.code, amount: tier.amount, currency: 'INR', paymentStatus: 'pending', paymentProvider: null, nextAction: 'PAYMENT_PROVIDER_CONFIGURATION_REQUIRED' });
  } catch (error) { next(error); }
});

app.post('/api/checkouts/contribution', async (request, response, next) => {
  try {
    const amount = Number(request.body?.amount);
    if (!Number.isInteger(amount) || amount < 100) return response.status(400).json({ error: 'INVALID_CONTRIBUTION_AMOUNT' });
    if (!validateContact(request.body.contact)) return response.status(400).json({ error: 'INVALID_CONTACT_DETAILS' });
    const donorId = id('donor'), donationId = id('donation'), createdAt = now(), contact = request.body.contact;
    await run('INSERT INTO donors(id,full_name,email,mobile,city,pan,message,created_at) VALUES(?,?,?,?,?,?,?,?)',[donorId,contact.name.trim(),contact.email.trim(),contact.mobile.trim(),contact.city.trim(),contact.pan?.trim()||null,contact.message?.trim()||null,createdAt]);
    await run('INSERT INTO donations(id,donor_id,transaction_type,amount,payment_status,created_at) VALUES(?,?,?,?,?,?)',[donationId,donorId,'general_contribution',amount,'pending',createdAt]);
    response.status(201).json({ checkoutId: donationId, amount, currency: 'INR', paymentStatus: 'pending', paymentProvider: null, nextAction: 'PAYMENT_PROVIDER_CONFIGURATION_REQUIRED' });
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
    if (donation.transaction_type === 'membership') {
      const start = new Date(verifiedAt), expiry = new Date(verifiedAt);
      expiry.setUTCFullYear(expiry.getUTCFullYear()+1); expiry.setUTCDate(expiry.getUTCDate()-1);
      await run('UPDATE memberships SET membership_start_date=?,membership_expiry_date=?,membership_status=?,receipt_number=? WHERE donation_id=?',[start.toISOString().slice(0,10),expiry.toISOString().slice(0,10),'active',receipt,donationId]);
    }
    await run('COMMIT');
  } catch (error) { await run('ROLLBACK'); throw error; }
  return { donationId, receiptNumber: receipt, paymentStatus: 'verified' };
}

app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use((request, response, next) => {
  if (request.method === 'GET' && !request.path.startsWith('/api/')) return response.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  next();
});
app.use((error, _request, response, _next) => { console.error(error); response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' }); });

if (require.main === module) initialise().then(() => app.listen(port, () => console.log(`Golden Circle server listening on http://localhost:${port}`))).catch(error => { console.error(error); process.exit(1); });

module.exports = { app, initialise, database, finalizeVerifiedPayment };
