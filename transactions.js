import membershipData from './membership-tiers.json';

export const UPI_PAYMENT_CONFIG = Object.freeze({
  vpa: '8588993989@ptyes',
  payeeName: 'Sangeet Vidya Niketan',
  currency: 'INR'
});

// Enable only when explicitly testing a ₹1 payment on a real Android phone.
export const P2P_TEST_MODE = false;

const formatINR = amount => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
}).format(Number(amount || 0));

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

const clampAmount = value => {
  const numericValue = Number(String(value ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(numericValue) ? numericValue : NaN;
};

export function createP2PUpiUrl(amount) {
  const numericAmount = clampAmount(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('A valid contribution amount is required.');
  }

  const params = new URLSearchParams({
    pa: UPI_PAYMENT_CONFIG.vpa,
    pn: UPI_PAYMENT_CONFIG.payeeName,
    am: Number(numericAmount).toFixed(2),
    cu: UPI_PAYMENT_CONFIG.currency
  });

  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

export function payByUpi(amount, trigger = null) {
  const numericAmount = clampAmount(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

  const upiUrl = createP2PUpiUrl(P2P_TEST_MODE ? 1 : numericAmount);

  if (trigger) {
    trigger.dataset.upiUrl = upiUrl;
    trigger.setAttribute('data-upi-url', upiUrl);
  }

  if (typeof window !== 'undefined') {
    window.location.href = upiUrl;
  }
}

export function initTransactions() {
  const testNotice = document.querySelector('#upi-test-notice');
  if (testNotice) testNotice.hidden = !P2P_TEST_MODE;

  const membershipGrid = document.querySelector('#membership-tiers');

  if (membershipGrid) {
    membershipGrid.innerHTML = membershipData.tiers.map(tier => `
      <article class="tier ${tier.code === 'LEGACY_500000' ? 'tier-open legacy-tier' : ''}">
        ${tier.badge ? `<span class="tier-badge">${escapeHTML(tier.badge)}</span>` : ''}
        <h2>${escapeHTML(tier.name)}</h2>
        <p class="tier-amount">${formatINR(tier.amount)}</p>
        <p class="tier-impact">${escapeHTML(tier.description)}</p>
        <ul class="tier-benefits">${tier.benefitLabels.map(benefit => `<li>${escapeHTML(benefit)}</li>`).join('')}</ul>
        <button class="tier-btn membership-trigger" type="button" data-membership-tier="${tier.code}">${escapeHTML(tier.cta)}</button>
      </article>
    `).join('');

    membershipGrid.querySelectorAll('.membership-trigger').forEach(trigger => {
      trigger.onclick = () => {
        const selectedTier = membershipData.tiers.find(tier => tier.code === trigger.dataset.membershipTier);
        if (!selectedTier) return;

        payByUpi(selectedTier.amount, trigger);
      };
    });
  }

  const customAmountInput = document.querySelector('#other-contribution-amount');
  const sponsorButton = document.querySelector('.contribute-now-trigger');

  if (customAmountInput && sponsorButton) {
    sponsorButton.onclick = () => {
      const customAmount = Number(customAmountInput.value || 0);
      if (!Number.isFinite(customAmount) || customAmount <= 0) {
        customAmountInput.reportValidity();
        customAmountInput.focus();
        return;
      }

      payByUpi(customAmount, sponsorButton);
    };
  }
}
