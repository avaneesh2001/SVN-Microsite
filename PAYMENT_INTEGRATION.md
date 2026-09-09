# Payment integration boundary

The browser can hand a `upi://pay` URI for the configured Sangeet Vidya Niketan account to an installed UPI app. The QR remains deliberately non-scannable. The website does not verify payments, activate database memberships, or issue official receipts.

## Frontend UPI adapter

`UPI_PAYMENT_CONFIG` in [`transactions.js`](./transactions.js) is the source for the configured VPA, payee, note, currency, and reference prefix. It currently uses `8588993989@ptyes` for `Sangeet Vidya Niketan`. This enables manual UPI app handoff but does not provide payment verification.

The payment interface is separated into `UPIPaymentOptions`, `UPIIntentButton`, `UPIQRCode`, `PaymentStatus`, and `PaymentSuccess`. `createUPIIntent()` generates the UPI URI from configurable values. The QR graphic is presentation-only and contains no encoded account or payment data.

The collapsed “Developer test controls” can simulate success or failure so confirmation, sample receipt, and email-ready UI states can be tested. A simulated success is marked `demo_confirmed`; it must never be interpreted as a gateway confirmation.

## Server-authoritative checkout

Run the production-style server with:

```bash
npm start
```

Membership checkout accepts only `membershipTier`. The server resolves the amount from [`membership-tiers.json`](./membership-tiers.json), so a browser-supplied or modified amount is ignored. General contributions use a separate endpoint and never create membership records.

- `GET /api/membership-tiers`
- `POST /api/checkouts/membership`
- `POST /api/checkouts/contribution`
- `GET /api/organisation-settings/tax-receipt-policy`

Checkout creates pending donor, donation, and—where applicable—membership records. It does not claim payment success.

## Adding a gateway

Select a provider such as Razorpay (or another UPI-capable gateway) and configure its credentials only on the server. Keep the existing frontend component boundary and replace the demo adapter with a provider adapter that must:

1. Create an order using the amount returned by the server-owned membership configuration.
2. Send the gateway order identifier to the browser.
3. Verify the provider webhook signature on the server.
4. Match the webhook amount, currency, and order to the pending donation.
5. Call `finalizeVerifiedPayment({ donationId, gatewayPaymentId })` only after those checks pass.

The finalizer marks payment verified, assigns the ordinary receipt number, and activates membership with its start and expiry dates. Never call it from a browser request that merely claims success.

## Tax receipts

`eligible_80g_amount` intentionally remains `NULL`. The `tax_receipt_policy` setting is `PENDING_CA_CONFIRMATION`, and Form 10BD/10BE data must use a separately confirmed eligible amount. An ordinary payment receipt must not be described as an official 80G receipt.
