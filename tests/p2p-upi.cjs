const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'transactions.js'), 'utf8');
const membershipData = require('../membership-tiers.json');
const expected = 'upi://pay?pa=8588993989%40ptyes&pn=Sangeet%20Vidya%20Niketan&am=1.00&cu=INR';
assert.doesNotMatch(source, /PaymentRequest|tez\.google|merchant|\bmc\s*:|\btr\s*:|\burl\s*:|transaction\.checkout|\/api\/checkouts|fetch\(|XMLHttpRequest|Payment successful/i);

// Execute the frontend with a minimal DOM and observe synchronous navigations.
for (const testMode of [true, false]) {
  const navigations = [];
  const button = code => ({ dataset: { membershipTier: code }, setAttribute() {} });
  const tierButtons = membershipData.tiers.map(tier => button(tier.code));
  const sponsorButton = button();
  const input = { value: '1234', reportValidity() {}, focus() {} };
  const notice = { hidden: true };
  const grid = { innerHTML: '', querySelectorAll: () => tierButtons };
  const elements = { '#membership-tiers': grid, '#other-contribution-amount': input, '.contribute-now-trigger': sponsorButton, '#upi-test-notice': notice };
  const context = vm.createContext({
    membershipData, URLSearchParams,
    document: { querySelector: selector => elements[selector] },
    window: { location: { set href(value) { navigations.push(value); } } }
  });
  vm.runInContext(source.replace(/^import .*;\n/, '').replace(/export /g, '').replace(/P2P_TEST_MODE = (?:true|false)/, `P2P_TEST_MODE = ${testMode}`), context);
  assert.equal(vm.runInContext('createP2PUpiUrl(1)', context), expected);
  for (const invalid of ['0', '-1', 'NaN', 'Infinity', 'null']) {
    assert.throws(() => vm.runInContext(`createP2PUpiUrl(${invalid})`, context));
  }
  vm.runInContext('initTransactions(); initTransactions();', context);
  assert.equal(notice.hidden, !testMode);
  tierButtons.forEach((trigger, index) => {
    const before = navigations.length;
    trigger.onclick();
    assert.equal(navigations.length, before + 1, 'Exactly one immediate launch per click after repeat initialization');
    const uri = new URL(navigations.at(-1));
    assert.deepEqual([...uri.searchParams.keys()], ['pa', 'pn', 'am', 'cu']);
    assert.equal(uri.searchParams.get('am'), (testMode ? 1 : membershipData.tiers[index].amount).toFixed(2));
  });
  sponsorButton.onclick();
  assert.equal(new URL(navigations.at(-1)).searchParams.get('am'), testMode ? '1.00' : '1234.00');
  const before = navigations.length;
  input.value = '';
  sponsorButton.onclick();
  assert.equal(navigations.length, before);
}
console.log(`PASS: P2P URI, minimal fields, synchronous single-click launch, test/tier/custom amounts and invalid input.\n${expected}`);
