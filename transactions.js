import membershipData from './membership-tiers.json';

export const UPI_PAYMENT_CONFIG = Object.freeze({
  vpa: '8588993989@ptyes',
  payeeName: 'Sangeet Vidya Niketan',
  currency: 'INR'
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

export function createP2PUpiUrl() {
  const params = new URLSearchParams({
    pa: UPI_PAYMENT_CONFIG.vpa,
    pn: UPI_PAYMENT_CONFIG.payeeName,
    cu: UPI_PAYMENT_CONFIG.currency
  });

  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

export function payByUpi(trigger = null) {
  const upiUrl = createP2PUpiUrl();

  if (trigger) {
    trigger.dataset.upiUrl = upiUrl;
    trigger.setAttribute('data-upi-url', upiUrl);
  }

  if (typeof window !== 'undefined') {
    window.location.href = upiUrl;
  }
}

export function initTransactions() {
  const copyButton = document.querySelector('[data-copy-upi-id]');
  const copyStatus = document.querySelector('#upi-copy-status');
  if (copyButton) {
    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(UPI_PAYMENT_CONFIG.vpa);
        if (copyStatus) copyStatus.textContent = 'UPI ID copied';
      } catch {
        if (copyStatus) copyStatus.textContent = `Copy this UPI ID manually: ${UPI_PAYMENT_CONFIG.vpa}`;
      }
    };
  }

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

        payByUpi(trigger);
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

      payByUpi(sponsorButton);
    };
  }
}
