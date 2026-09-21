import membershipData from './membership-tiers.json';

const paymentButtons = Object.freeze({
  MEMBER_11000: 'pl_TejejECoKJiUGY',
  PATRON_25000: 'pl_Tejn5pE3kCWvPt',
  BENEFACTOR_51000: 'pl_TejpIVSniPgaAl',
  FELLOW_110000: 'pl_TejqWJfFRrNL6l',
  LEGACY_500000: 'pl_TejsSWaRUW6DnB'
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

export function initTransactions() {
  const dialog = document.querySelector('#contribution-payment-dialog');
  const closeButton = document.querySelector('#contribution-dialog-close');
  let returnFocus = null;

  const showContributionNotice = (amount, name, trigger) => {
    if (!dialog) return;
    document.querySelector('#contribution-selected-name').textContent = name;
    document.querySelector('#contribution-selected-amount').textContent = formatINR(amount);
    returnFocus = trigger;
    dialog.showModal();
  };

  if (closeButton) closeButton.onclick = () => dialog.close();
  if (dialog) dialog.onclose = () => returnFocus?.focus();

  const membershipGrid = document.querySelector('#membership-tiers');

  if (membershipGrid) {
    membershipGrid.innerHTML = membershipData.tiers.map(tier => `
      <article class="tier ${tier.code === 'LEGACY_500000' ? 'tier-open legacy-tier' : ''}">
        ${tier.badge ? `<span class="tier-badge">${escapeHTML(tier.badge)}</span>` : ''}
        <h2>${escapeHTML(tier.name)}</h2>
        <p class="tier-amount">${formatINR(tier.amount)}</p>
        <p class="tier-impact">${escapeHTML(tier.description)}</p>
        <ul class="tier-benefits">${tier.benefitLabels.map(benefit => `<li>${escapeHTML(benefit)}</li>`).join('')}</ul>
        ${paymentButtons[tier.code]
          ? `<form class="tier-payment-button" data-payment-button-id="${paymentButtons[tier.code]}" aria-label="Pay for ${escapeHTML(tier.name)}"><p class="tier-payment-status" role="status">Loading payment button…</p></form>`
          : `<button class="tier-btn membership-trigger" type="button" data-membership-tier="${tier.code}">${escapeHTML(tier.cta)}</button>`}
      </article>
    `).join('');

    membershipGrid.querySelectorAll('.membership-trigger').forEach(trigger => {
      trigger.onclick = () => {
        const selectedTier = membershipData.tiers.find(tier => tier.code === trigger.dataset.membershipTier);
        if (!selectedTier) return;

        showContributionNotice(selectedTier.amount, selectedTier.name, trigger);
      };
    });
  }

  // Append live scripts after rendering; scripts inside innerHTML do not execute.
  document.querySelectorAll('.tier-payment-button').forEach(form => {
    if (form.querySelector('script[data-payment_button_id]')) return;
    form.onsubmit = event => event.preventDefault();
    const status = form.querySelector('.tier-payment-status');
    const paymentScript = document.createElement('script');
    paymentScript.src = 'https://checkout.razorpay.com/v1/payment-button.js';
    paymentScript.setAttribute('data-payment_button_id', form.dataset.paymentButtonId);
    paymentScript.async = true;
    paymentScript.onload = () => { status.hidden = true; };
    paymentScript.onerror = () => {
      status.textContent = 'Unable to load payments. Please refresh and try again.';
    };
    form.appendChild(paymentScript);
  });
}
