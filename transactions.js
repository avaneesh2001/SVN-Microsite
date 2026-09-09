import membershipData from './membership-tiers.json';

export const EVENT_CONFIG = {
  title: 'Anand Utsav',
  description: 'A forthcoming gathering presented by Sangeet Vidya Niketan. Programme and booking details will be announced.',
  date: 'To be announced',
  time: 'To be announced',
  venue: 'To be announced',
  tickets: [
    { id: 'general', name: 'General Admission', price: 500 },
    { id: 'premium', name: 'Premium Seating', price: 1000 },
    { id: 'patron', name: 'Patron Seating', price: 2500 }
  ],
  maximumTickets: 10
};

export const MEMBERSHIP_CONFIG = Object.freeze(Object.fromEntries(membershipData.tiers.map(tier => [tier.code,Object.freeze(tier)])));

export const ORGANISATION_SETTINGS = Object.freeze({
  tax_receipt_policy: { status: 'PENDING_CA_CONFIRMATION', eligibleAmountMode: 'NOT_AUTOMATICALLY_EQUAL_TO_PAYMENT', form10BD10BEAmountSource: 'CONFIRMED_ELIGIBLE_DONATION_AMOUNT' }
});

// Manual UPI configuration. Gateway verification is not connected yet.
export const UPI_PAYMENT_CONFIG = Object.freeze({
  mode: 'manual_upi',
  vpa: '8588993989@ptyes',
  payeeName: 'Sangeet Vidya Niketan',
  transactionReferencePrefix: 'GC-TEST',
  transactionNote: 'Contribution to Sangeet Vidya Niketan',
  currency: 'INR',
  showDeveloperControls: true
});

const overlay = document.querySelector('#transaction-overlay');
const dialog = overlay.querySelector('.transaction-dialog');
const progress = overlay.querySelector('.transaction-progress');
const content = overlay.querySelector('.transaction-content');
const closeButton = overlay.querySelector('.transaction-close');
const qrOverlay = document.querySelector('#upi-qr-overlay');
const qrDialog = qrOverlay.querySelector('.upi-qr-dialog');
const qrContent = qrOverlay.querySelector('.upi-qr-content');
const qrCloseButton = qrOverlay.querySelector('.upi-qr-close');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let transaction = null;
let returnFocus = null;
let qrReturnFocus = null;
let intentFallbackTimer = 0;

const formatINR = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount || 0));
const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const reference = prefix => `${prefix}-DEMO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
const ticketTotal = () => EVENT_CONFIG.tickets.reduce((sum, ticket) => sum + transaction.booking.quantities[ticket.id], 0);
const bookingSubtotal = () => EVENT_CONFIG.tickets.reduce((sum, ticket) => sum + ticket.price * transaction.booking.quantities[ticket.id], 0);
const selectedTickets = () => EVENT_CONFIG.tickets.filter(ticket => transaction.booking.quantities[ticket.id] > 0);

export function createUPIIntent({ vpa, payeeName, transactionReference, amount, note, currency = 'INR' }) {
  const numericAmount = Number(amount);
  if (!vpa || !payeeName || !transactionReference || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('A VPA, payee, transaction reference, and positive amount are required.');
  }
  const parameters = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    tr: transactionReference,
    am: numericAmount.toFixed(2),
    cu: currency,
    tn: note
  });
  return `upi://pay?${parameters.toString()}`;
}

export const PaymentStatus = ({ state = 'waiting', message = '' } = {}) => {
  const labels = { waiting: 'Waiting for payment', success: 'Payment successful', failed: 'Payment failed' };
  const label = labels[state] || labels.waiting;
  return `<div class="payment-status payment-status--${state}" role="status" aria-live="polite" data-payment-status="${state}"><span class="payment-status-dot" aria-hidden="true"></span><div><strong>${label}</strong>${message ? `<span>${escapeHTML(message)}</span>` : ''}</div></div>`;
};

export const UPIIntentButton = () => `<button class="upi-action upi-intent-trigger" type="button"><span class="upi-action-index" aria-hidden="true">01</span><span><strong><span class="mobile-payment-label">Open UPI App</span><span class="desktop-payment-label">Pay via UPI App</span></strong><small><span class="mobile-payment-label">Choose an installed UPI app</span><span class="desktop-payment-label">Open UPI app if supported</span></small></span><span class="upi-action-arrow" aria-hidden="true">↗</span></button>`;

export const UPIQRCode = ({ amount, transactionReference, vpa, payeeName, note, currency = 'INR' }) => {
  const futureQrPayload = createUPIIntent({ vpa, payeeName, transactionReference, amount, note, currency });
  return `<p class="transaction-kicker">Pay by UPI</p><h2 class="upi-qr-heading" id="upi-qr-title">Pay ${formatINR(amount)}</h2><p class="upi-placeholder-label">Dummy QR code · Test only</p><div class="fake-qr upi-qr-code" data-placeholder="true" data-qr-payload="${escapeHTML(futureQrPayload)}" role="img" aria-label="Non-scannable placeholder QR code for demonstration only"></div><p class="upi-qr-scan" id="upi-qr-description">Scan using any UPI app</p><p class="upi-app-list">Google Pay <span>•</span> BHIM <span>•</span> PhonePe <span>•</span> Any UPI App</p><p class="upi-reference">Test reference ${escapeHTML(transactionReference)}</p><div class="qr-payment-status">${PaymentStatus({ state: 'waiting', message: 'The QR is a placeholder and cannot be used for payment.' })}</div>${DeveloperPaymentControls()}<button class="modal-button upi-qr-cancel" type="button">Cancel</button>`;
};

export const UPIPaymentOptions = ({ amount }) => `<div class="upi-payment-panel"><div class="upi-payment-total"><span>Amount to pay</span><strong>${formatINR(amount)}</strong></div><div class="upi-payment-actions">${UPIIntentButton()}<button class="upi-action upi-qr-trigger" type="button"><span class="upi-action-index" aria-hidden="true">02</span><span><strong>Show UPI QR</strong><small>Placeholder QR · Not yet enabled</small></span><span class="upi-action-arrow" aria-hidden="true">＋</span></button></div><p class="upi-safety-note">The UPI app option uses the configured Sangeet Vidya Niketan account. Automatic verification is not connected, and the displayed QR remains a non-scannable placeholder.</p><div class="payment-status-region">${PaymentStatus({ state: 'waiting', message: 'Choose a payment option. Manual UPI payments cannot yet be verified automatically.' })}</div>${DeveloperPaymentControls()}</div>`;

export const PaymentSuccess = ({ title, message }) => `<div class="status-mark" aria-hidden="true">✓</div><p class="transaction-kicker">Demo payment success</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">${escapeHTML(title)}</h2><p class="transaction-lede">${escapeHTML(message)}</p>`;

function DeveloperPaymentControls() {
  if (!UPI_PAYMENT_CONFIG.showDeveloperControls) return '';
  return `<details class="developer-controls"><summary>Developer test controls</summary><div class="developer-controls-body"><p>Demo only — these controls do not verify or capture payment.</p><div><button type="button" data-action="simulate-success">Demo payment success</button><button type="button" data-action="simulate-failure">Demo payment failure</button></div></div></details>`;
}

export function createDonation() {
  return {
    type: 'donation', step: 0, screen: 'flow', dirty: false,
    donation: { tier: 'General Contribution', amount: 0, otherAmount: '' },
    contact: { name: '', email: '', mobile: '', city: '', pan: '', message: '', acknowledgement: true },
    demoReference: ''
  };
}

export function createMembership(tierCode) {
  const tier = MEMBERSHIP_CONFIG[tierCode];
  if (!tier) throw new Error('Unknown membership tier');
  return {
    type: 'membership', step: 0, screen: 'flow', dirty: false,
    membership: { membership_tier: tier.code, membership_amount: tier.amount, membership_start_date: '', membership_expiry_date: '', membership_status: 'pending', donor_id: '', donation_id: '', receipt_number: '', tierCode: tier.code, tierName: tier.name, amount: tier.amount, benefits: tier.benefits },
    contact: { name: '', email: '', mobile: '', city: '', pan: '', message: '', acknowledgement: true },
    demoReference: '', receiptNumber: ''
  };
}

export function createEventBooking() {
  return {
    type: 'event_booking', step: 0, screen: 'flow', dirty: false,
    booking: { quantities: Object.fromEntries(EVENT_CONFIG.tickets.map(ticket => [ticket.id, 0])), attendees: [] },
    contact: { name: '', email: '', mobile: '' },
    demoReference: ''
  };
}

const stepNames = () => transaction.type === 'event_booking'
  ? ['Tickets', 'Details', 'Review', 'Payment']
  : ['Contribution', 'Details', 'Review', 'Payment'];

const renderProgress = () => {
  if (transaction.screen === 'discard') { progress.innerHTML = ''; return; }
  progress.innerHTML = stepNames().map((name, index) => `<span class="progress-step ${index < transaction.step ? 'complete' : index === transaction.step ? 'active' : ''}">${name}</span>`).join('');
};

const setView = markup => {
  renderProgress();
  content.style.animation = 'none';
  content.innerHTML = markup;
  void content.offsetWidth;
  content.style.animation = '';
  requestAnimationFrame(() => (content.querySelector('#transaction-title') || dialog).focus({ preventScroll: true }));
};

const buttons = (primary, primaryAction, secondary = '', secondaryAction = '') => `
  <div class="modal-actions">
    ${secondary ? `<button class="modal-button" type="button" data-action="${secondaryAction}">${secondary}</button>` : ''}
    <button class="modal-button primary" type="button" data-action="${primaryAction}">${primary}</button>
  </div>`;

const summaryRow = (label, value, className = '') => `<div class="summary-row"><span>${label}</span><strong class="${className}">${escapeHTML(value)}</strong></div>`;
const emailRow = email => `<div class="summary-row"><span>Email</span><strong><a href="mailto:${encodeURIComponent(email)}">${escapeHTML(email)}</a></strong></div>`;

const prepareCheckout = async button => {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    const membership = transaction.type === 'membership';
    const response = await fetch(membership ? '/api/checkouts/membership' : '/api/checkouts/contribution', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(membership ? { membershipTier: transaction.membership.tierCode, contact: transaction.contact } : { amount: transaction.donation.amount, contact: transaction.contact })
    });
    if (!response.ok) throw new Error('Checkout service unavailable');
    transaction.checkout = await response.json();
    if (membership) transaction.membership.amount = transaction.checkout.amount;
    else transaction.donation.amount = transaction.checkout.amount;
    transaction.checkoutUnavailable = false;
  } catch {
    transaction.checkout = null;
    transaction.checkoutUnavailable = true;
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
  transaction.step = 3;
  renderCurrent();
};

const renderDonationContribution = () => {
  if (transaction.type === 'membership') {
    const tier = MEMBERSHIP_CONFIG[transaction.membership.tierCode];
    setView(`<p class="transaction-kicker">Golden Circle Membership</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">${tier.name}</h2><p class="fixed-membership-amount">${formatINR(tier.amount)}</p><p class="transaction-lede">Annual Golden Circle Membership</p><p class="field-label">Membership includes</p><ul class="modal-benefits">${tier.benefitLabels.map(benefit => `<li>${benefit}</li>`).join('')}</ul><p class="membership-validity">Golden Circle membership is valid for one year from the date of enrolment.</p><p class="form-error" role="alert" aria-live="polite"></p>${buttons('Continue','continue-donation')}`);
  } else {
    setView(`<p class="transaction-kicker">General Contribution</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Make a Contribution</h2><p class="transaction-lede">Support Sangeet Vidya Niketan without enrolling in Golden Circle membership.</p><div class="field other-amount"><label for="other-donation">Contribution amount</label><input id="other-donation" type="number" inputmode="numeric" min="100" step="1" value="${escapeHTML(transaction.donation.otherAmount)}" placeholder="Minimum ₹100"></div><p class="general-contribution-warning">A contribution below ₹10,000 does not create Golden Circle membership.</p><p class="form-error" role="alert" aria-live="polite"></p>${buttons('Continue','continue-donation')}`);
    content.querySelector('#other-donation').addEventListener('input', event => {
      transaction.donation.otherAmount = event.target.value;
      transaction.donation.amount = Number(event.target.value || 0);
      transaction.dirty = true;
    });
  }
  content.querySelector('[data-action="continue-donation"]').addEventListener('click', () => {
    if (transaction.type === 'donation' && transaction.donation.amount < 100) {
      content.querySelector('.form-error').textContent = 'Enter a demonstration amount of at least ₹100.';
      content.querySelector('#other-donation').focus();
      return;
    }
    transaction.step = 1; transaction.dirty = true; renderCurrent();
  });
};

const contactField = (id, label, type = 'text', required = true, value = '', extra = '') => {
  const control = id === 'message'
    ? `<textarea id="${id}" name="${id}" ${extra}>${escapeHTML(value)}</textarea>`
    : `<input id="${id}" name="${id}" type="${type}" value="${escapeHTML(value)}" ${required ? 'required' : ''} ${extra}>`;
  return `<div class="field ${id === 'message' ? 'full' : ''}"><label for="${id}">${label}${required ? '' : ' · Optional'}</label>${control}</div>`;
};

const bindLiveFields = target => {
  content.querySelectorAll('input[name],textarea[name]').forEach(input => input.addEventListener('input', event => {
    target[event.target.name] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    transaction.dirty = true;
  }));
  content.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener('change', event => {
    target[event.target.name] = event.target.checked; transaction.dirty = true;
  }));
};

const renderDonationDetails = () => {
  const c = transaction.contact;
  const membership = transaction.type === 'membership';
  setView(`<p class="transaction-kicker">${membership ? 'Golden Circle Membership' : 'General Contribution'}</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">${membership ? 'Member Details' : 'Donor Details'}</h2><p class="transaction-lede">These details remain only in this open browser session and are not submitted.</p><form class="form-grid" id="donor-form" novalidate>${contactField('name','Full Name','text',true,c.name,'autocomplete="name"')}${contactField('email','Email','email',true,c.email,'autocomplete="email"')}${contactField('mobile','Mobile Number','tel',true,c.mobile,'autocomplete="tel" inputmode="tel" pattern="[0-9+ ()-]{8,18}"')}${contactField('city','City','text',true,c.city,'autocomplete="address-level2"')}${contactField('pan','PAN','text',false,c.pan,'maxlength="10"')}${contactField('message','Message / dedication','text',false,c.message)}<label class="check-field"><input type="checkbox" name="acknowledgement" ${c.acknowledgement ? 'checked' : ''}>I would like to receive an acknowledgement by email</label></form><p class="form-error" role="alert" aria-live="polite"></p>${buttons(membership ? 'Review Membership' : 'Review Contribution','review-donation','Back','back')}`);
  bindLiveFields(c);
  content.querySelector('[data-action="back"]').addEventListener('click', () => { transaction.step = 0; renderCurrent(); });
  content.querySelector('[data-action="review-donation"]').addEventListener('click', () => {
    const form = content.querySelector('#donor-form');
    if (!form.checkValidity()) { content.querySelector('.form-error').textContent = 'Please complete the required details correctly.'; form.reportValidity(); return; }
    transaction.step = 2; renderCurrent();
  });
};

const renderDonationReview = () => {
  const c = transaction.contact;
  const membership = transaction.type === 'membership';
  const amount = membership ? transaction.membership.amount : transaction.donation.amount;
  const opening = membership ? summaryRow('Membership tier',transaction.membership.tierName) : summaryRow('Contribution type','General Contribution');
  setView(`<p class="transaction-kicker">${membership ? 'Golden Circle Membership' : 'General Contribution'}</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">${membership ? 'Membership Summary' : 'Contribution Summary'}</h2><div class="summary">${opening}${summaryRow('Amount',formatINR(amount),'summary-amount')}${summaryRow(membership ? 'Member' : 'Donor',c.name)}${summaryRow('Mobile',c.mobile)}${emailRow(c.email)}${summaryRow('City',c.city)}${c.pan ? summaryRow('PAN',c.pan.toUpperCase()) : ''}${c.message ? summaryRow('Dedication',c.message) : ''}</div>${membership ? '<p class="membership-validity">The displayed membership amount is fixed by the selected tier and cannot be edited in checkout.</p>' : ''}${buttons('Proceed to Payment','payment','Edit Details','edit')}`);
  content.querySelector('[data-action="edit"]').addEventListener('click', () => { transaction.step = 1; renderCurrent(); });
  content.querySelector('[data-action="payment"]').addEventListener('click', event => prepareCheckout(event.currentTarget));
};

const renderTicketSelection = () => {
  setView(`<p class="transaction-kicker">${EVENT_CONFIG.title}</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Select Booking</h2><span class="demo-label">Sample pricing for demonstration only</span><div class="ticket-list">${EVENT_CONFIG.tickets.map(ticket => `<article class="ticket-choice"><h3>${ticket.name}</h3><p>${formatINR(ticket.price)}</p><div class="quantity"><button type="button" data-ticket="${ticket.id}" data-change="-1" aria-label="Remove one ${ticket.name} ticket">−</button><output id="quantity-${ticket.id}" aria-live="polite">${transaction.booking.quantities[ticket.id]}</output><button type="button" data-ticket="${ticket.id}" data-change="1" aria-label="Add one ${ticket.name} ticket">+</button></div></article>`).join('')}</div><div class="ticket-totals"><span><b id="ticket-count">${ticketTotal()}</b> tickets selected</span><strong id="ticket-subtotal">${formatINR(bookingSubtotal())}</strong></div><p class="form-error" role="alert" aria-live="polite"></p>${buttons('Continue','continue-booking')}`);
  const updateTicketUI = () => {
    const total = ticketTotal();
    EVENT_CONFIG.tickets.forEach(ticket => {
      content.querySelector(`#quantity-${ticket.id}`).textContent = transaction.booking.quantities[ticket.id];
      content.querySelector(`[data-ticket="${ticket.id}"][data-change="-1"]`).disabled = transaction.booking.quantities[ticket.id] === 0;
      content.querySelector(`[data-ticket="${ticket.id}"][data-change="1"]`).disabled = total >= EVENT_CONFIG.maximumTickets;
    });
    content.querySelector('#ticket-count').textContent = total;
    content.querySelector('#ticket-subtotal').textContent = formatINR(bookingSubtotal());
  };
  content.querySelectorAll('[data-ticket]').forEach(button => button.addEventListener('click', () => {
    const current = transaction.booking.quantities[button.dataset.ticket];
    const next = Math.max(0, current + Number(button.dataset.change));
    if (button.dataset.change === '1' && ticketTotal() >= EVENT_CONFIG.maximumTickets) return;
    transaction.booking.quantities[button.dataset.ticket] = next;
    transaction.dirty = true; updateTicketUI();
  }));
  updateTicketUI();
  content.querySelector('[data-action="continue-booking"]').addEventListener('click', () => {
    if (!ticketTotal()) { content.querySelector('.form-error').textContent = 'Select at least one demonstration ticket.'; return; }
    transaction.booking.attendees = Array.from({ length: ticketTotal() }, (_, index) => transaction.booking.attendees[index] || '');
    transaction.step = 1; renderCurrent();
  });
};

const renderBookingDetails = () => {
  const c = transaction.contact;
  setView(`<p class="transaction-kicker">${EVENT_CONFIG.title}</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Booking Details</h2><p class="transaction-lede">Enter a primary contact and one name for each attendee.</p><form class="form-grid" id="booking-form" novalidate>${contactField('name','Full Name','text',true,c.name,'autocomplete="name"')}${contactField('email','Email','email',true,c.email,'autocomplete="email"')}${contactField('mobile','Mobile Number','tel',true,c.mobile,'autocomplete="tel" inputmode="tel" pattern="[0-9+ ()-]{8,18}"')}<div class="attendees"><p class="attendees-title">Attendee information</p>${transaction.booking.attendees.map((name,index) => `<div class="field"><label for="attendee-${index}">Attendee ${index + 1} · Name</label><input id="attendee-${index}" name="attendee-${index}" value="${escapeHTML(name)}" required></div>`).join('')}</div></form><p class="form-error" role="alert" aria-live="polite"></p>${buttons('Review Booking','review-booking','Back','back')}`);
  bindLiveFields(c);
  content.querySelectorAll('[name^="attendee-"]').forEach(input => input.addEventListener('input', event => {
    transaction.booking.attendees[Number(event.target.name.split('-')[1])] = event.target.value; transaction.dirty = true;
  }));
  content.querySelector('[data-action="back"]').addEventListener('click', () => { transaction.step = 0; renderCurrent(); });
  content.querySelector('[data-action="review-booking"]').addEventListener('click', () => {
    const form = content.querySelector('#booking-form');
    if (!form.checkValidity()) { content.querySelector('.form-error').textContent = 'Please complete the contact and attendee details correctly.'; form.reportValidity(); return; }
    transaction.step = 2; renderCurrent();
  });
};

const renderBookingReview = () => {
  const ticketRows = selectedTickets().map(ticket => summaryRow(ticket.name,`${transaction.booking.quantities[ticket.id]} × ${formatINR(ticket.price)}`)).join('');
  setView(`<p class="transaction-kicker">Booking Review</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Anand Utsav</h2><div class="summary">${ticketRows}${summaryRow('Attendees',transaction.booking.attendees.join(', '))}${summaryRow('Primary contact',transaction.contact.name)}${summaryRow('Mobile',transaction.contact.mobile)}${summaryRow('Email',transaction.contact.email)}${summaryRow('Subtotal',formatINR(bookingSubtotal()))}${summaryRow('Total',formatINR(bookingSubtotal()),'summary-amount')}</div>${buttons('Proceed to Payment','payment','Edit','edit')}`);
  content.querySelector('[data-action="edit"]').addEventListener('click', () => { transaction.step = 1; renderCurrent(); });
  content.querySelector('[data-action="payment"]').addEventListener('click', () => { transaction.step = 3; renderCurrent(); });
};

const currentPaymentAmount = () => transaction.type === 'event_booking'
  ? bookingSubtotal()
  : transaction.type === 'membership' ? transaction.membership.amount : transaction.donation.amount;

const currentUPIReference = () => {
  if (!transaction.upiReference) {
    transaction.upiReference = transaction.checkout?.checkoutId || reference(UPI_PAYMENT_CONFIG.transactionReferencePrefix);
  }
  return transaction.upiReference;
};

const updatePaymentStatus = (state, message) => {
  if (!transaction) return;
  transaction.paymentStatus = state;
  document.querySelectorAll('.payment-status-region,.qr-payment-status').forEach(region => {
    if (region.offsetParent !== null) region.innerHTML = PaymentStatus({ state, message });
  });
};

const bindDeveloperControls = root => {
  root.querySelectorAll('[data-action="simulate-success"]').forEach(button => button.addEventListener('click', () => {
    updatePaymentStatus('success', 'Developer simulation only. No gateway confirmation was received.');
    closeQRCode(false);
    processPayment(transaction, 'success');
  }));
  root.querySelectorAll('[data-action="simulate-failure"]').forEach(button => button.addEventListener('click', () => {
    updatePaymentStatus('failed', 'Developer simulation only. No payment was captured.');
    closeQRCode(false);
    processPayment(transaction, 'failure');
  }));
};

const closeQRCode = (restoreFocus = true) => {
  if (qrOverlay.hidden) return;
  window.clearTimeout(intentFallbackTimer);
  qrOverlay.hidden = true;
  qrContent.innerHTML = '';
  dialog.inert = false;
  overlay.removeAttribute('aria-hidden');
  if (restoreFocus) qrReturnFocus?.focus({ preventScroll: true });
  qrReturnFocus = null;
};

const openQRCode = trigger => {
  if (!transaction) return;
  qrReturnFocus = trigger || document.activeElement;
  qrContent.innerHTML = UPIQRCode({
    amount: currentPaymentAmount(),
    transactionReference: currentUPIReference(),
    vpa: UPI_PAYMENT_CONFIG.vpa,
    payeeName: UPI_PAYMENT_CONFIG.payeeName,
    note: UPI_PAYMENT_CONFIG.transactionNote,
    currency: UPI_PAYMENT_CONFIG.currency
  });
  qrOverlay.hidden = false;
  dialog.inert = true;
  overlay.setAttribute('aria-hidden', 'true');
  qrContent.querySelector('.upi-qr-cancel').addEventListener('click', () => closeQRCode(true));
  bindDeveloperControls(qrContent);
  requestAnimationFrame(() => qrDialog.focus({ preventScroll: true }));
};

const attemptUPIIntent = trigger => {
  const amount = currentPaymentAmount();
  const upiUrl = createUPIIntent({
    vpa: UPI_PAYMENT_CONFIG.vpa,
    payeeName: UPI_PAYMENT_CONFIG.payeeName,
    transactionReference: currentUPIReference(),
    amount,
    note: UPI_PAYMENT_CONFIG.transactionNote,
    currency: UPI_PAYMENT_CONFIG.currency
  });
  let appOpened = false;
  const noteAppSwitch = () => { if (document.hidden) appOpened = true; };
  document.addEventListener('visibilitychange', noteAppSwitch, { once: true });
  updatePaymentStatus('waiting', 'Attempting to open a UPI app. This website cannot yet confirm the payment automatically.');

  const intentLink = document.createElement('a');
  intentLink.href = upiUrl;
  intentLink.hidden = true;
  intentLink.setAttribute('aria-hidden', 'true');
  document.body.append(intentLink);
  intentLink.click();
  intentLink.remove();

  window.clearTimeout(intentFallbackTimer);
  intentFallbackTimer = window.setTimeout(() => {
    document.removeEventListener('visibilitychange', noteAppSwitch);
    if (!transaction || transaction.step !== 3 || appOpened) return;
    updatePaymentStatus('waiting', 'Open a UPI app on your phone and scan the QR code.');
    openQRCode(trigger);
  }, 1400);
};

const renderPayment = () => {
  const eventBooking = transaction.type === 'event_booking';
  const membership = transaction.type === 'membership';
  const heading = eventBooking ? 'Complete Your Booking' : 'Payment';
  const amount = eventBooking ? bookingSubtotal() : membership ? transaction.membership.amount : transaction.donation.amount;
  const label = eventBooking ? EVENT_CONFIG.title : membership ? 'Golden Circle Membership' : 'General Contribution';
  const serverState = eventBooking ? '' : transaction.checkout ? '<p class="server-state">A pending server record was created. The amount was resolved from the server-owned tier configuration.</p>' : '<p class="server-state warning">Server checkout is unavailable. This screen remains a UI demonstration and cannot activate membership.</p>';
  if (eventBooking) {
    setView(`<p class="transaction-kicker">${label}</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">${heading}</h2><span class="demo-label">Demo Payment Flow</span><p class="transaction-lede">Demonstration total: <strong class="summary-amount">${formatINR(amount)}</strong>. Event payments are not enabled and no payment request will be made.</p>${PaymentStatus({ state: 'waiting', message: 'Use the developer controls to test the sample booking confirmation.' })}${DeveloperPaymentControls()}`);
    bindDeveloperControls(content);
    return;
  }
  setView(`<p class="transaction-kicker">${label}</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Pay by UPI</h2><span class="demo-label">Manual UPI · Verification not connected</span><p class="transaction-lede">Choose how you would like to open the payment experience. You will never be asked to type a UPI ID.</p>${serverState}${UPIPaymentOptions({ amount })}`);
  content.querySelector('.upi-intent-trigger').addEventListener('click', event => attemptUPIIntent(event.currentTarget));
  content.querySelector('.upi-qr-trigger').addEventListener('click', event => openQRCode(event.currentTarget));
  bindDeveloperControls(content);
};

export function processPayment(currentTransaction, simulatedOutcome) {
  if (currentTransaction !== transaction) return;
  if (simulatedOutcome === 'success') handlePaymentSuccess(currentTransaction);
  else handlePaymentFailure(currentTransaction);
}

export function handlePaymentSuccess(currentTransaction) {
  currentTransaction.paymentStatus = 'success';
  currentTransaction.demoReference = reference(currentTransaction.type === 'event_booking' ? 'AU' : 'GC');
  currentTransaction.emailStatus = currentTransaction.contact.acknowledgement ? 'Demo acknowledgement queued' : 'Not requested';
  if (currentTransaction.type === 'membership') {
    const start = new Date();
    const expiry = new Date(start);
    expiry.setFullYear(expiry.getFullYear() + 1);
    expiry.setDate(expiry.getDate() - 1);
    currentTransaction.membership.membership_start_date = start.toISOString().slice(0,10);
    currentTransaction.membership.membership_expiry_date = expiry.toISOString().slice(0,10);
    currentTransaction.membership.membership_status = 'demo_confirmed';
    currentTransaction.membership.donor_id = reference('DONOR');
    currentTransaction.membership.donation_id = currentTransaction.demoReference;
    currentTransaction.membership.receipt_number = reference('RECEIPT');
    currentTransaction.receiptNumber = currentTransaction.membership.receipt_number;
  }
  currentTransaction.step = 4;
  currentTransaction.screen = 'success';
  renderCurrent();
}

export function handlePaymentFailure(currentTransaction) {
  currentTransaction.paymentStatus = 'failed';
  currentTransaction.screen = 'failure';
  renderCurrent();
}

const renderSuccess = () => {
  if (transaction.type === 'donation') {
    setView(`<div class="status-state">${PaymentSuccess({ title: 'Thank You', message: 'The demo payment success state has been recorded for this general contribution.' })}<div class="summary">${summaryRow('Amount',formatINR(transaction.donation.amount),'summary-amount')}${summaryRow('Contribution type','General Contribution')}${summaryRow('Contributor',transaction.contact.name)}${summaryRow('Demo reference',transaction.demoReference)}${summaryRow('Email flow',transaction.emailStatus)}</div><p class="warning-copy">This is a demonstration only. No payment has been processed, no email has been sent and no receipt has been issued.</p>${buttons('Done','done','View Demo Acknowledgement','acknowledgement')}</div>`);
  } else if (transaction.type === 'membership') {
    const membership = transaction.membership;
    const date = iso => new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'long',year:'numeric'}).format(new Date(`${iso}T12:00:00`));
    setView(`<div class="status-state">${PaymentSuccess({ title: 'Welcome to the Golden Circle', message: 'The demo payment success state has been recorded for this annual membership.' })}<div class="summary">${summaryRow('Membership tier',membership.tierName)}${summaryRow('Amount',formatINR(membership.amount),'summary-amount')}${summaryRow('Member',transaction.contact.name)}${summaryRow('Membership begins',date(membership.membership_start_date))}${summaryRow('Valid until',date(membership.membership_expiry_date))}${summaryRow('Demo reference',transaction.demoReference)}${summaryRow('Sample receipt',transaction.receiptNumber)}${summaryRow('Email flow',transaction.emailStatus)}</div><p class="warning-copy">This is a demonstration only. No verified payment, email, active membership or official receipt has been created. Section 80G eligibility has not been calculated.</p>${buttons('Done','done','View Sample Receipt','acknowledgement')}</div>`);
  } else {
    setView(`<div class="status-state"><div class="status-mark" aria-hidden="true">✓</div><p class="transaction-kicker">Demo confirmation</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Booking Confirmed</h2><div class="summary">${summaryRow('Event',EVENT_CONFIG.title)}${summaryRow('Ticket category',selectedTickets().map(ticket=>ticket.name).join(', '))}${summaryRow('Number of tickets',ticketTotal())}${summaryRow('Attendee names',transaction.booking.attendees.join(', '))}${summaryRow('Demo amount',formatINR(bookingSubtotal()),'summary-amount')}${summaryRow('Booking reference',transaction.demoReference)}</div><div class="fake-qr large" aria-hidden="true"></div><span class="qr-caption">Demo ticket — not valid for entry</span><p class="warning-copy">This is a demonstration only. No payment has been processed and no valid booking has been issued.</p>${buttons('Done','done','View Demo Ticket','ticket')}</div>`);
  }
  content.querySelector('[data-action="done"]').addEventListener('click', () => closeTransaction(true));
  const isEvent = transaction.type === 'event_booking';
  content.querySelector(isEvent ? '[data-action="ticket"]' : '[data-action="acknowledgement"]').addEventListener('click', () => { transaction.screen = isEvent ? 'ticket' : 'acknowledgement'; renderCurrent(); });
};

const renderFailure = () => {
  setView(`<div class="status-state"><div class="status-mark" aria-hidden="true">×</div><p class="transaction-kicker">Demo payment failure</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Payment failed</h2><p class="transaction-lede">This is a simulated failure. No payment was processed.</p>${buttons('Try Again','try-again','Cancel','cancel')}</div>`);
  content.querySelector('[data-action="try-again"]').addEventListener('click', () => { transaction.screen = 'flow'; transaction.step = 3; renderCurrent(); });
  content.querySelector('[data-action="cancel"]').addEventListener('click', requestClose);
};

const renderAcknowledgement = () => {
  const membership = transaction.type === 'membership';
  const amount = membership ? transaction.membership.amount : transaction.donation.amount;
  const typeRows = membership ? `${summaryRow('Membership',transaction.membership.tierName)}${summaryRow('Receipt number',transaction.receiptNumber)}` : summaryRow('Contribution','General Contribution');
  setView(`<p class="transaction-kicker">Preview</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">${membership ? 'Sample Membership Receipt' : 'Sample Contribution Acknowledgement'}</h2><div class="acknowledgement"><p class="ticket-brand">Sangeet Vidya Niketan · The Golden Circle</p><h3 class="ticket-title">Thank You</h3><p>This sample acknowledges a demonstration ${membership ? 'membership payment' : 'contribution'} from <strong>${escapeHTML(transaction.contact.name)}</strong>.</p><div class="summary">${typeRows}${summaryRow('Demo amount',formatINR(amount))}${summaryRow('Reference',transaction.demoReference)}</div><p class="ticket-warning">Sample ordinary receipt only · Not an official 80G receipt</p></div>${buttons('Done','done','Back','back-success')}`);
  content.querySelector('[data-action="done"]').addEventListener('click', () => closeTransaction(true));
  content.querySelector('[data-action="back-success"]').addEventListener('click', () => { transaction.screen = 'success'; renderCurrent(); });
};

const renderTicket = () => {
  setView(`<p class="transaction-kicker">Ticket Preview</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Demo Ticket</h2><div class="demo-ticket"><p class="ticket-brand">Sangeet Vidya Niketan</p><h3 class="ticket-title">Anand Utsav</h3><div class="summary">${summaryRow('Booking ID',transaction.demoReference)}${summaryRow('Name',transaction.contact.name)}${summaryRow('Ticket category',selectedTickets().map(ticket=>ticket.name).join(', '))}${summaryRow('Number of guests',ticketTotal())}${summaryRow('Date',EVENT_CONFIG.date)}${summaryRow('Time',EVENT_CONFIG.time)}${summaryRow('Venue',EVENT_CONFIG.venue)}</div><div class="fake-qr large" aria-hidden="true"></div><p class="ticket-warning">Demonstration ticket — not valid for entry</p></div>${buttons('Done','done','Back','back-success')}`);
  content.querySelector('[data-action="done"]').addEventListener('click', () => closeTransaction(true));
  content.querySelector('[data-action="back-success"]').addEventListener('click', () => { transaction.screen = 'success'; renderCurrent(); });
};

const renderDiscard = () => {
  setView(`<div class="discard-panel"><p class="transaction-kicker">Demo transaction</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Discard this demo transaction?</h2><p class="transaction-lede">The information entered in this open flow will be cleared.</p>${buttons('Continue','continue-transaction','Discard','discard')}</div>`);
  content.querySelector('[data-action="continue-transaction"]').addEventListener('click', () => { transaction.screen = transaction.previousScreen; renderCurrent(); });
  content.querySelector('[data-action="discard"]').addEventListener('click', () => closeTransaction(true));
};

const renderCurrent = () => {
  if (transaction.screen === 'discard') return renderDiscard();
  if (transaction.screen === 'success') return renderSuccess();
  if (transaction.screen === 'failure') return renderFailure();
  if (transaction.screen === 'acknowledgement') return renderAcknowledgement();
  if (transaction.screen === 'ticket') return renderTicket();
  if (transaction.step === 3) return renderPayment();
  if (transaction.type !== 'event_booking') return [renderDonationContribution,renderDonationDetails,renderDonationReview][transaction.step]();
  return [renderTicketSelection,renderBookingDetails,renderBookingReview][transaction.step]();
};

const openTransaction = (nextTransaction, trigger) => {
  transaction = nextTransaction;
  returnFocus = trigger;
  overlay.hidden = false;
  document.body.classList.add('modal-open');
  renderCurrent();
  dialog.focus({ preventScroll: true });
};

const closeTransaction = force => {
  if (!transaction) return;
  if (!qrOverlay.hidden) closeQRCode(false);
  if (!force && transaction.dirty && !['success','acknowledgement','ticket'].includes(transaction.screen)) {
    if (transaction.screen === 'discard') return closeTransaction(true);
    transaction.previousScreen = transaction.screen;
    transaction.screen = 'discard';
    renderCurrent();
    return;
  }
  overlay.hidden = true;
  document.body.classList.remove('modal-open');
  content.innerHTML = '';
  progress.innerHTML = '';
  transaction = null;
  returnFocus?.focus();
  returnFocus = null;
};

const requestClose = () => closeTransaction(false);

const focusableWithin = root => [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(element => element.offsetParent !== null);
const trapFocus = (event, root) => {
  if (event.key !== 'Tab') return;
  const items = focusableWithin(root);
  if (!items.length) { event.preventDefault(); root.focus(); return; }
  const first = items[0], last = items.at(-1);
  const currentIsListed = items.includes(document.activeElement);
  if (event.shiftKey && (!currentIsListed || document.activeElement === first)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (!currentIsListed || document.activeElement === last)) { event.preventDefault(); first.focus(); }
};
dialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
  trapFocus(event, dialog);
});
qrDialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeQRCode(true); return; }
  trapFocus(event, qrDialog);
});
closeButton.addEventListener('click', requestClose);
overlay.addEventListener('mousedown', event => { if (event.target === overlay) requestClose(); });
qrCloseButton.addEventListener('click', () => closeQRCode(true));
qrOverlay.addEventListener('mousedown', event => { if (event.target === qrOverlay) closeQRCode(true); });

export function initTransactions() {
  const membershipGrid = document.querySelector('#membership-tiers');
  membershipGrid.innerHTML = membershipData.tiers.map(tier => `<article class="tier ${tier.code === 'LEGACY_500000' ? 'tier-open legacy-tier' : ''}">${tier.badge ? `<span class="tier-badge">${escapeHTML(tier.badge)}</span>` : ''}<h2>${escapeHTML(tier.name)}</h2><p class="tier-amount">${formatINR(tier.amount)}</p><p class="tier-impact">Annual Golden Circle Membership</p><p class="benefits-label">Includes</p><ul class="tier-benefits">${tier.benefitLabels.map(benefit => `<li>${escapeHTML(benefit)}</li>`).join('')}</ul><button class="tier-btn membership-trigger" type="button" data-membership-tier="${tier.code}">${escapeHTML(tier.cta)}<br>${formatINR(tier.amount)}</button></article>`).join('');
  document.querySelector('#event-description').textContent = EVENT_CONFIG.description;
  document.querySelector('#event-date').textContent = EVENT_CONFIG.date;
  document.querySelector('#event-time').textContent = EVENT_CONFIG.time;
  document.querySelector('#event-venue').textContent = EVENT_CONFIG.venue;
  document.querySelectorAll('.membership-trigger').forEach(trigger => trigger.addEventListener('click', () => openTransaction(createMembership(trigger.dataset.membershipTier), trigger)));
  document.querySelectorAll('.donation-trigger').forEach(trigger => trigger.addEventListener('click', () => openTransaction(createDonation(), trigger)));
  document.querySelector('.event-trigger').addEventListener('click', event => openTransaction(createEventBooking(), event.currentTarget));
}
