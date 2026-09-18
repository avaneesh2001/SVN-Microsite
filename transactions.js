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

export const UPI_PAYMENT_CONFIG = Object.freeze({
  mode: 'upi_intent',
  vpa: '8588993989@ptyes',
  payeeName: 'Sangeet Vidya Niketan',
  transactionReferencePrefix: 'GC-TEST',
  transactionNote: 'Contribution to Sangeet Vidya Niketan',
  currency: 'INR',
  showDeveloperControls: false,
  desktopMessage: 'Please open this page on your phone to pay by UPI.'
});

const overlay = document.querySelector('#transaction-overlay');
const dialog = overlay.querySelector('.transaction-dialog');
const progress = overlay.querySelector('.transaction-progress');
const content = overlay.querySelector('.transaction-content');
const closeButton = overlay.querySelector('.transaction-close');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let transaction = null;
let returnFocus = null;
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

const isMobileUPIEnabled = () => {
  const userAgent = navigator?.userAgent || '';
  return /android|iphone|ipad|ipod|mobile/i.test(userAgent) || window.matchMedia('(pointer: coarse)').matches;
};

export const UPIIntentButton = () => `<button class="upi-action upi-intent-trigger" type="button"><span><strong>PAY BY UPI</strong></span><span class="upi-action-arrow" aria-hidden="true">↗</span></button>`;

export const UPIPaymentOptions = ({ amount }) => `<div class="upi-payment-panel"><div class="upi-payment-total"><span>Amount to pay</span><strong>${formatINR(amount)}</strong></div><div class="upi-payment-actions">${UPIIntentButton()}</div><div class="payment-status-region">${PaymentStatus({ state: 'waiting', message: 'Payment verification happens after you return to this page.' })}</div></div>`;

export const PaymentSuccess = ({ title, message }) => `<div class="status-mark" aria-hidden="true">✓</div><p class="transaction-kicker">Demo payment success</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">${escapeHTML(title)}</h2><p class="transaction-lede">${escapeHTML(message)}</p>`;

function DeveloperPaymentControls() {
  if (!UPI_PAYMENT_CONFIG.showDeveloperControls) return '';
  return `<details class="developer-controls"><summary>Developer test controls</summary><div class="developer-controls-body"><p>Demo only — these controls do not verify or capture payment.</p><div><button type="button" data-action="simulate-success">Demo payment success</button><button type="button" data-action="simulate-failure">Demo payment failure</button></div></div></details>`;
}

export function createDonation() {
  return {
    type: 'donation', contributionType: 'GENERAL_CONTRIBUTION', step: 0, screen: 'flow', dirty: false,
    donation: { tier: 'General Contribution', amount: 0, otherAmount: '' },
    contact: { name: '', email: '', mobile: '', acknowledgement: true },
    demoReference: ''
  };
}

export function createMembership(tierCode) {
  const tier = MEMBERSHIP_CONFIG[tierCode];
  if (!tier) throw new Error('Unknown membership tier');
  return {
    type: 'membership', contributionType: 'GOLDEN_CIRCLE_MEMBERSHIP', step: 0, screen: 'flow', dirty: false,
    membership: { membership_tier: tier.code, membership_amount: tier.amount, membership_start_date: '', membership_expiry_date: '', membership_status: 'pending', donor_id: '', donation_id: '', receipt_number: '', tierCode: tier.code, tierName: tier.name, amount: tier.amount, benefits: tier.benefits },
    contact: { name: '', email: '', mobile: '', acknowledgement: true },
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
  : ['Contribution', 'Payment'];

const renderProgress = () => {
  if (['discard', 'verified', 'receipt'].includes(transaction.screen)) { progress.innerHTML = ''; return; }
  progress.innerHTML = stepNames().map((name, index) => `<span class="progress-step ${index < (transaction.type === 'event_booking' ? transaction.step : transaction.step === 3 ? 1 : 0) ? 'complete' : index === (transaction.type === 'event_booking' ? transaction.step : transaction.step === 3 ? 1 : 0) ? 'active' : ''}"><span class="desktop-progress-label">${name}</span><span class="mobile-progress-label">${name === 'Contribution' ? 'Amount' : name}</span></span>`).join('');
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
  const checkoutTransaction = transaction;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    const membership = transaction.type === 'membership';
    const response = await fetch(membership ? '/api/checkouts/membership' : '/api/checkouts/contribution', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(membership ? { membershipTier: transaction.membership.tierCode } : { amount: transaction.donation.amount })
    });
    if (!response.ok) throw new Error('Checkout service unavailable');
    const checkout = await response.json();
    if (transaction !== checkoutTransaction) return;
    transaction.checkout = checkout;
    if (membership) transaction.membership.amount = transaction.checkout.amount;
    else transaction.donation.amount = transaction.checkout.amount;
    transaction.checkoutUnavailable = false;
  } catch {
    if (transaction !== checkoutTransaction) return;
    transaction.checkout = null;
    transaction.checkoutUnavailable = true;
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
  if (transaction !== checkoutTransaction) return;
  transaction.step = 3;
  transaction.screen = 'flow';
  renderCurrent();
  schedulePaymentCheck();
};

const renderDonationContribution = () => {
  if (transaction.type === 'membership') {
    const tier = MEMBERSHIP_CONFIG[transaction.membership.tierCode];
    setView(`<p class="transaction-kicker">Golden Circle Membership</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">${tier.name}</h2><p class="fixed-membership-amount">${formatINR(tier.amount)}</p><p class="transaction-lede">${escapeHTML(tier.description)}</p><p class="field-label">Membership includes</p><ul class="modal-benefits">${tier.benefitLabels.map(benefit => `<li>${benefit}</li>`).join('')}</ul><p class="form-error" role="alert" aria-live="polite"></p>${buttons('Continue','continue-donation')}`);
  } else {
    setView(`<p class="transaction-kicker">General Contribution</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Make a Contribution</h2><p class="transaction-lede">Support Sangeet Vidya Niketan without enrolling in Golden Circle membership.</p><div class="field other-amount"><label for="other-donation">Contribution amount</label><input id="other-donation" type="number" inputmode="numeric" min="100" step="1" value="${escapeHTML(transaction.donation.otherAmount)}" placeholder="Minimum ₹100"></div><p class="general-contribution-warning">A contribution below ₹11,000 does not create Golden Circle membership.</p><p class="form-error" role="alert" aria-live="polite"></p>${buttons('Continue','continue-donation')}`);
    content.querySelector('#other-donation').addEventListener('input', event => {
      transaction.donation.otherAmount = event.target.value;
      transaction.donation.amount = Number(event.target.value || 0);
      transaction.dirty = true;
    });
  }
  content.querySelector('[data-action="continue-donation"]').addEventListener('click', () => {
    if (transaction.type === 'donation' && transaction.donation.amount < 100) {
      content.querySelector('.form-error').textContent = 'Enter an amount of at least ₹100.';
      content.querySelector('#other-donation').focus();
      return;
    }
    transaction.dirty = true; prepareCheckout(content.querySelector('[data-action="continue-donation"]'));
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
  document.querySelectorAll('.payment-status-region').forEach(region => {
    if (region.offsetParent !== null) region.innerHTML = PaymentStatus({ state, message });
  });
};

const bindDeveloperControls = root => {
  root.querySelectorAll('[data-action="simulate-success"]').forEach(button => button.addEventListener('click', () => {
    updatePaymentStatus('success', 'Developer simulation only. No gateway confirmation was received.');
    processPayment(transaction, 'success');
  }));
  root.querySelectorAll('[data-action="simulate-failure"]').forEach(button => button.addEventListener('click', () => {
    updatePaymentStatus('failed', 'Developer simulation only. No payment was captured.');
    processPayment(transaction, 'failure');
  }));
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
    updatePaymentStatus('waiting', 'If no UPI app opened, please visit this page on a phone with a UPI app installed and tap PAY BY UPI.');
  }, 1400);
};

const renderPayment = () => {
  const eventBooking = transaction.type === 'event_booking';
  const membership = transaction.type === 'membership';
  const heading = eventBooking ? 'Complete Your Booking' : 'Payment';
  const amount = eventBooking ? bookingSubtotal() : membership ? transaction.membership.amount : transaction.donation.amount;
  const label = eventBooking ? EVENT_CONFIG.title : membership ? 'Golden Circle Membership' : 'General Contribution';
  const serverState = transaction.checkout ? '' : '<p class="server-state warning">Payment service is unavailable. Please try again later.</p>';
  if (eventBooking) {
    setView(`<p class="transaction-kicker">${label}</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">${heading}</h2><span class="demo-label">Demo Payment Flow</span><p class="transaction-lede">Demonstration total: <strong class="summary-amount">${formatINR(amount)}</strong>. Event payments are not enabled and no payment request will be made.</p>${PaymentStatus({ state: 'waiting', message: 'Use the developer controls to test the sample booking confirmation.' })}${DeveloperPaymentControls()}`);
    bindDeveloperControls(content);
    return;
  }
  if (!isMobileUPIEnabled()) {
    setView(`<p class="transaction-kicker">${label}</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Pay by UPI</h2><p class="transaction-lede">${escapeHTML(UPI_PAYMENT_CONFIG.desktopMessage)}</p>${serverState}`);
    return;
  }
  setView(`<p class="transaction-kicker">${label}</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Pay by UPI</h2><p class="transaction-lede">Open your installed UPI app and complete the payment securely.</p>${serverState}${UPIPaymentOptions({ amount })}`);
  content.querySelector('.upi-intent-trigger').addEventListener('click', event => attemptUPIIntent(event.currentTarget));
  if (!transaction.checkout) content.querySelectorAll('.upi-action').forEach(button => { button.disabled = true; });
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
  setView(`<p class="transaction-kicker">Preview</p><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Payment Receipt</h2><div class="acknowledgement"><p class="ticket-brand">Sangeet Vidya Niketan · The Golden Circle</p><h3 class="ticket-title">Thank You</h3><p>This sample receipt acknowledges a demonstration contribution from <strong>${escapeHTML(transaction.contact.name)}</strong>.</p><div class="summary">${typeRows}${summaryRow('Contribution Amount',formatINR(amount))}${summaryRow('Reference',transaction.demoReference)}</div><p class="ticket-warning">Sample ordinary receipt only · Not an official 80G receipt</p></div>${buttons('Done','done','Back','back-success')}`);
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
  if (transaction.screen === 'verified') return renderVerifiedSuccess();
  if (transaction.screen === 'receipt') return renderReceiptForm();
  if (transaction.screen === 'success') return renderSuccess();
  if (transaction.screen === 'failure') return renderFailure();
  if (transaction.screen === 'acknowledgement') return renderAcknowledgement();
  if (transaction.screen === 'ticket') return renderTicket();
  if (transaction.step === 3) return renderPayment();
  if (transaction.type !== 'event_booking') return renderDonationContribution();
  return [renderTicketSelection,renderBookingDetails,renderBookingReview][transaction.step]();
};

const openTransaction = (nextTransaction, trigger) => {
  transaction = nextTransaction;
  returnFocus = trigger;
  overlay.hidden = false;
  document.body.classList.add('modal-open');
  if (transaction.screen === 'preparing') setView('<h2 class="transaction-heading" id="transaction-title" tabindex="-1">Preparing payment…</h2>');
  else renderCurrent();
  dialog.focus({ preventScroll: true });
};

const closeTransaction = force => {
  if (!transaction) return;
  if (!force && transaction.dirty && !['success','verified','receipt','acknowledgement','ticket'].includes(transaction.screen)) {
    if (transaction.screen === 'discard') return closeTransaction(true);
    transaction.previousScreen = transaction.screen;
    transaction.screen = 'discard';
    renderCurrent();
    return;
  }
  window.clearTimeout(paymentCheckTimer);
  window.clearTimeout(intentFallbackTimer);
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
closeButton.addEventListener('click', requestClose);
overlay.addEventListener('mousedown', event => { if (event.target === overlay) requestClose(); });

export function initTransactions() {
  const membershipGrid = document.querySelector('#membership-tiers');
  membershipGrid.innerHTML = membershipData.tiers.map(tier => `<article class="tier ${tier.code === 'LEGACY_500000' ? 'tier-open legacy-tier' : ''}">${tier.badge ? `<span class="tier-badge">${escapeHTML(tier.badge)}</span>` : ''}<h2>${escapeHTML(tier.name)}</h2><p class="tier-amount">${formatINR(tier.amount)}</p><p class="tier-impact">${escapeHTML(tier.description)}</p><ul class="tier-benefits">${tier.benefitLabels.map(benefit => `<li>${escapeHTML(benefit)}</li>`).join('')}</ul><button class="tier-btn membership-trigger" type="button" data-membership-tier="${tier.code}">${escapeHTML(tier.cta)}</button></article>`).join('');
  let selectedTier = '';
  document.querySelectorAll('.contribution-tier').forEach(trigger => trigger.addEventListener('click', () => {
    selectedTier = trigger.dataset.membershipTier;
    document.querySelectorAll('.contribution-tier').forEach(option => option.setAttribute('aria-pressed', String(option === trigger)));
    document.querySelector('#other-contribution-amount').value = '';
  }));
  document.querySelector('#other-contribution-amount').addEventListener('input', () => {
    selectedTier = '';
    document.querySelectorAll('.contribution-tier').forEach(option => option.setAttribute('aria-pressed', 'false'));
  });
  document.querySelectorAll('.membership-trigger').forEach(trigger => trigger.addEventListener('click', () => startContribution(createMembership(trigger.dataset.membershipTier), trigger)));
  document.querySelector('.contribute-now-trigger').addEventListener('click', event => {
    const otherAmount = Number(document.querySelector('#other-contribution-amount').value || 0);
    const nextTransaction = selectedTier ? createMembership(selectedTier) : createDonation();
    if (!selectedTier && otherAmount) {
      nextTransaction.donation.otherAmount = String(otherAmount);
      nextTransaction.donation.amount = otherAmount;
    }
    const amountInput = document.querySelector('#other-contribution-amount');
    if (!amountInput.value || !amountInput.checkValidity()) { amountInput.reportValidity(); amountInput.focus(); return; }
    startContribution(nextTransaction, event.currentTarget);
  });
}


const startContribution = (next, trigger) => {
  next.screen = 'preparing';
  openTransaction(next, trigger);
  prepareCheckout(trigger);
};
let paymentCheckTimer = 0;
const schedulePaymentCheck = () => {
  window.clearTimeout(paymentCheckTimer);
  if (!transaction?.checkout || transaction.screen !== 'flow') return;
  paymentCheckTimer = window.setTimeout(checkPayment, 4000);
};
const checkPayment = async () => {
  const current = transaction;
  if (!current?.checkout) return;
  try {
    const response = await fetch(`/api/checkouts/${encodeURIComponent(current.checkout.checkoutId)}/status`, {
      headers: { Authorization: `Bearer ${current.checkout.accessToken}` }, cache: 'no-store'
    });
    if (response.ok) {
      const status = await response.json();
      if (transaction !== current) return;
      if (status.paymentStatus === 'verified') {
        current.verifiedPayment = status;
        current.screen = 'verified';
        renderCurrent();
        return;
      }
    }
  } catch { /* Keep pending until the server can verify payment. */ }
  if (transaction === current) schedulePaymentCheck();
};
const renderVerifiedSuccess = () => {
  if (!transaction.verifiedPayment) return;
  setView(`<div class="status-state"><div class="status-mark" aria-hidden="true">✓</div><h2 class="transaction-heading" id="transaction-title" tabindex="-1">Payment successful.</h2><p class="transaction-lede">Thank you for nurturing the arts.</p><p class="transaction-lede">Would you like an 80G receipt?</p>${buttons('Yes, I would like an 80G receipt','receipt','No, thank you','done')}</div>`);
  content.querySelector('[data-action="done"]').onclick = () => closeTransaction(true);
  content.querySelector('[data-action="receipt"]').onclick = () => { transaction.screen = 'receipt'; renderCurrent(); };
};
const renderReceiptForm = () => {
  if (!transaction.verifiedPayment) return;
  setView(`<h2 class="transaction-heading" id="transaction-title" tabindex="-1">80G receipt details</h2><p class="transaction-lede">Share your details for SVN's tax documentation process.</p><form id="receipt-form" class="form-grid">${contactField('name','Full name')}${contactField('email','Email','email')}${contactField('pan','PAN','text',true,'','pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" maxlength="10"')}${contactField('address','Full address')}${contactField('city','City')}${contactField('postalCode','Postal code','text',true,'','autocomplete="postal-code"')}${contactField('country','Country')}<p class="form-error" role="alert"></p><button class="modal-button primary" type="submit">Submit receipt request</button></form>${buttons('Back','back')}`);
  content.querySelector('[data-action="back"]').onclick = () => { transaction.screen = 'verified'; renderCurrent(); };
  content.querySelector('#receipt-form').onsubmit = async event => {
    event.preventDefault();
    const current = transaction;
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const response = await fetch(`/api/checkouts/${encodeURIComponent(current.checkout.checkoutId)}/receipt-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.checkout.accessToken}` },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      if (!response.ok) throw new Error('Unable to save');
      if (transaction !== current) return;
      setView(`<h2 class="transaction-heading" id="transaction-title" tabindex="-1">Receipt request received</h2><p class="transaction-lede">SVN will review your details and the eligible donation amount through its existing tax documentation process.</p>${buttons('Done','done')}`);
      content.querySelector('[data-action="done"]').onclick = () => closeTransaction(true);
    } catch {
      if (transaction === current) form.querySelector('.form-error').textContent = 'Your request could not be saved. Please try again.';
    } finally { button.disabled = false; }
  };
};
