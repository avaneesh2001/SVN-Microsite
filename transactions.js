import membershipData from './membership-tiers.json';

export const UPI_PAYMENT_CONFIG = Object.freeze({
  vpa: 'sangeetvidyaniketan@ptyes',
  payeeName: 'Sangeet Vidya Niketan',
  mobile: '+91 85957 93989',
  currency: 'INR',
  transactionNote: '',
  fallbackMessage: 'Open Google Pay, PhonePe, BHIM or any UPI app and transfer directly.'
});

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

export function createUpiUrl(amount) {
  const numericAmount = clampAmount(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('A valid contribution amount is required.');
  }

  const params = new URLSearchParams({
    pa: String(UPI_PAYMENT_CONFIG.vpa).trim(),
    pn: String(UPI_PAYMENT_CONFIG.payeeName).trim(),
    am: Number(numericAmount).toFixed(2),
    cu: String(UPI_PAYMENT_CONFIG.currency || 'INR').trim()
  });

  return `upi://pay?${params.toString()}`;
}

export function buildUpiUrl(amount) {
  return createUpiUrl(amount);
}

export function revealUpiFallback() {
  const panel = document.querySelector('#upi-fallback-panel');
  if (!panel) return;

  panel.hidden = false;
  panel.classList.add('is-visible');
  const copyButton = panel.querySelector('[data-copy-upi-id]');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(UPI_PAYMENT_CONFIG.vpa);
        copyButton.textContent = 'Copied';
        setTimeout(() => { copyButton.textContent = 'Copy UPI ID'; }, 1800);
      } catch {
        copyButton.textContent = 'Copy UPI ID';
      }
    }, { once: true });
  }
}

export function payByUpi(amount, trigger = null) {
  const numericAmount = clampAmount(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

  const upiUrl = createUpiUrl(numericAmount);

  if (trigger) {
    trigger.dataset.upiUrl = upiUrl;
    trigger.setAttribute('data-upi-url', upiUrl);
  }

  if (typeof window !== 'undefined') {
    window.location.href = upiUrl;
  }
}

export function initTransactions() {
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
      trigger.addEventListener('click', () => {
        const selectedTier = membershipData.tiers.find(tier => tier.code === trigger.dataset.membershipTier);
        if (!selectedTier) return;

        payByUpi(selectedTier.amount, trigger);
      });
    });
  }

  const customAmountInput = document.querySelector('#other-contribution-amount');
  const sponsorButton = document.querySelector('.contribute-now-trigger');

  if (customAmountInput && sponsorButton) {
    sponsorButton.addEventListener('click', () => {
      const customAmount = Number(customAmountInput.value || 0);
      if (!Number.isFinite(customAmount) || customAmount <= 0) {
        customAmountInput.reportValidity();
        customAmountInput.focus();
        return;
      }

      payByUpi(customAmount, sponsorButton);
    });
  }
}
