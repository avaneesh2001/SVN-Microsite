# Payment integration boundary

The browser can hand a `upi://pay` URI for the configured Sangeet Vidya Niketan account to an installed UPI app. The contribution interface exposes only PAY BY UPI; there is no QR panel or QR fallback. The website does not verify payments, activate database memberships, or issue official receipts.

## Frontend UPI adapter

`UPI_PAYMENT_CONFIG` in [`transactions.js`](./transactions.js) is the source for the configured VPA, payee, note, currency, and reference prefix. It currently uses `8588993989@ptyes` for `Sangeet Vidya Niketan`. This enables manual UPI app handoff but does not provide payment verification.

The payment interface is separated into `UPIPaymentOptions`, `UPIIntentButton`, `PaymentStatus`, and `PaymentSuccess`. `createUPIIntent()` generates the UPI URI from configurable values. Selection opens payment directly without a contribution information, donor details or review screen.

Developer simulation controls are disabled in the public interface. The retained demo adapter can simulate success or failure for development only. A simulated success is marked `demo_confirmed`; it must never be interpreted as a gateway confirmation.

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

## Frictionless checkout and optional receipt request

Membership and contribution checkout require no contact or tax details. Anonymous donor records have empty contact values to preserve the existing relational schema. The server returns a random checkout access token; only its SHA-256 hash is stored. Keep the token in the active checkout session and send it as a Bearer authorization header.

- `GET /api/checkouts/:id/status` returns server-owned payment status.
- `POST /api/checkouts/:id/receipt-request` accepts name, email, PAN, address, city, postalCode and country only after verified payment and explicit donor opt-in.

The frontend polls status, then displays “Payment successful.” and offers an optional 80G request. Requests are stored for review in `tax_receipt_requests`; they do not issue Form 10BE or change `eligible_80g_amount`. Existing 10BD/10BE policy boundaries remain in place. The provider adapter and statutory export/issuance implementation are not present in this repository.

Live verification still requires the gateway adapter described above. Manual UPI handoff is preserved; the separate QR option, panel and automatic QR fallback have been removed. Browser return, app switch and demo controls never unlock the verified receipt flow. Static-only hosting cannot serve these API routes; use the Express server with persistent storage.
