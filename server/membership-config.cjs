const membershipData = require('../membership-tiers.json');

const MEMBERSHIP_TIERS = Object.freeze(Object.fromEntries(
  membershipData.tiers.map(tier => [tier.code, Object.freeze(tier)])
));

const ORGANISATION_SETTINGS = Object.freeze({
  tax_receipt_policy: {
    status: 'PENDING_CA_CONFIRMATION',
    eligibleAmountMode: 'NOT_AUTOMATICALLY_EQUAL_TO_PAYMENT',
    form10BD10BEAmountSource: 'CONFIRMED_ELIGIBLE_DONATION_AMOUNT'
  }
});

module.exports = { MEMBERSHIP_TIERS, ORGANISATION_SETTINGS };
