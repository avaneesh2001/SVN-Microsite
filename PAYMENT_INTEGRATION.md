# Recipient-only P2P UPI test

Contribution buttons synchronously assign this exact URI to `window.location.href`:

```text
upi://pay?pa=8588993989%40ptyes&pn=Sangeet%20Vidya%20Niketan&cu=INR
```

Only `pa`, `pn`, and `cu` are sent. There is no amount, MCC, transaction reference, transaction ID, URL, note or merchant metadata. The recipient remains `8588993989@ptyes`.

`transactions.js` contains `createP2PUpiUrl`, `payByUpi`, and the button handlers in `initTransactions`. Each button has one handler even after repeat initialization. Launch is synchronous with no API call, modal, review, QR, donor form or second payment button.

Tier amounts stay visible on their cards; the custom contribution remains visible in its input. Donors enter that amount manually inside their UPI app. Copy UPI ID is a secondary inline fallback with a visible ID for manual copying if clipboard access fails.

## Real Android test — pending

In Android Chrome, tap CONTRIBUTE and choose Google Pay, PhonePe or BHIM if installed (a default app may open directly). Check the recipient, manually enter ₹1 inside the app, and test payment. Repeat with the same intent in each installed app. These real-device tests have not been performed here.

The user reports that the earlier amount-prefilled intent opened Google Pay but payment failed, while manual payment to the same ID worked. The cause is not established. If this recipient-only intent works in PhonePe/BHIM but fails in Google Pay, record that as a Google Pay-specific intent issue and keep the UPI ID unchanged.

## Payment status boundary

The static site cannot independently verify a P2P payment. App launch or return never displays payment success, activates membership, or issues a receipt. The retained Express checkout/status/receipt endpoints are separate and are not called by this launch.

## Checks

- `node tests/p2p-upi.cjs`: exact URI, allowed fields, synchronous single navigation, repeated initialization, visible amounts, copy success/failure.
- `node tests/payment-flow.cjs`: P2P checks and existing backend authorization/receipt tests.
- `npm run build`: production bundle.
