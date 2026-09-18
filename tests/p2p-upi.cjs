const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'transactions.js'), 'utf8');
const membershipData = require('../membership-tiers.json');
const expected = 'upi://pay?pa=8588993989%40ptyes&pn=Sangeet%20Vidya%20Niketan&cu=INR';
assert.doesNotMatch(source, /PaymentRequest|tez\.google|merchant|\b(?:am|mc|tr|tid|url|tn)\s*:|transaction\.checkout|\/api\/checkouts|fetch\(|XMLHttpRequest|Payment successful/i);

(async () => {
  const navigations = [];
  const button = code => ({ dataset: { membershipTier: code }, setAttribute() {} });
  const tierButtons = membershipData.tiers.map(tier => button(tier.code));
  const sponsorButton = button();
  const copyButton = button();
  const copyStatus = { textContent: '' };
  const copied = [];
  const clipboard = { async writeText(value) { copied.push(value); } };
  const input = { value: '1234', reportValidity() {}, focus() {} };
  const grid = { innerHTML: '', querySelectorAll: () => tierButtons };
  const elements = { '#membership-tiers': grid, '#other-contribution-amount': input, '.contribute-now-trigger': sponsorButton, '[data-copy-upi-id]': copyButton, '#upi-copy-status': copyStatus };
  const context = vm.createContext({
    membershipData, URLSearchParams, navigator: { clipboard },
    document: { querySelector: selector => elements[selector] },
    window: { location: { set href(value) { navigations.push(value); } } }
  });
  vm.runInContext(source.replace(/^import .*;\n/, '').replace(/export /g, ''), context);
  assert.equal(vm.runInContext('createP2PUpiUrl()', context), expected);
  vm.runInContext('initTransactions(); initTransactions();', context);
  tierButtons.forEach((trigger, index) => {
    const before = navigations.length;
    trigger.onclick();
    assert.equal(navigations.length, before + 1, 'Exactly one synchronous launch per click after repeat initialization');
    assert.equal(navigations.at(-1), expected);
    assert.deepEqual([...new URL(navigations.at(-1)).searchParams.keys()], ['pa', 'pn', 'cu']);
    assert.ok(grid.innerHTML.includes(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(membershipData.tiers[index].amount)), 'Tier amount remains visible');
  });
  for (const amount of ['1', '1234', '11000']) {
    input.value = amount;
    const before = navigations.length;
    sponsorButton.onclick();
    assert.equal(navigations.length, before + 1);
    assert.equal(navigations.at(-1), expected, 'Custom amount never enters URI');
    assert.equal(input.value, amount, 'Custom amount remains visible');
  }
  const before = navigations.length;
  input.value = '';
  sponsorButton.onclick();
  assert.equal(navigations.length, before);
  await copyButton.onclick();
  assert.deepEqual(copied, ['8588993989@ptyes']);
  assert.equal(copyStatus.textContent, 'UPI ID copied');
  clipboard.writeText = async () => { throw new Error('Clipboard denied'); };
  await copyButton.onclick();
  assert.equal(copyStatus.textContent, 'Copy this UPI ID manually: 8588993989@ptyes');
  assert.equal(navigations.length, before, 'Copy fallback never launches payment');
  console.log(`PASS: recipient-only URI, single-click launch, visible amounts and copy fallback.\n${expected}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
