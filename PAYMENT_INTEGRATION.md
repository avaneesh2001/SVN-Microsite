# Direct P2P UPI payment

Contribution buttons synchronously assign a generic P2P `upi://pay` intent to `window.location.href`. The recipient is `8588993989@ptyes`, with payee label `Sangeet Vidya Niketan`. Only `pa`, `pn`, `am`, and `cu` are included. There is no merchant classification, MCC, transaction reference, merchant URL, Google Pay PaymentRequest, or onboarding data.

`transactions.js` contains `createP2PUpiUrl`, `payByUpi`, and the button handlers in `initTransactions`. Initialization replaces each button's click handler, so repeated initialization does not stack handlers. The launch requires no network request, donor information, modal, review, QR screen, or second payment button.

## Pending real Android test

`P2P_TEST_MODE` is currently `false`: contribution clicks use the selected tier amount or entered custom amount. Set it to `true` only for an explicit ₹1 device test; a visible notice then indicates the override. Tier values remain intact in `membership-tiers.json`.

Exact test URI:

```text
upi://pay?pa=8588993989%40ptyes&pn=Sangeet%20Vidya%20Niketan&am=1.00&cu=INR
```

Open the site in Chrome on a real Android phone with UPI apps installed, tap CONTRIBUTE, and check the app chooser or configured default UPI app, recipient and ₹1 amount. The account name displayed by the app depends on the receiving account; the `pn` label cannot establish its identity. Complete the payment only after checking the recipient. This device/payment test has not been performed here.

After the ₹1 test succeeds, set `P2P_TEST_MODE = false` in `transactions.js` and rebuild. Buttons then launch the actual selected tier or custom amount, and the test notice is hidden.

## Payment status boundary

The static website cannot verify completion of a P2P payment. Opening the app or returning to the page never displays automatic payment success, activates membership, or issues a receipt.

The retained Express checkout/status/receipt endpoints are independent backend functionality and are not called by this direct P2P launch. Their pending records require independently verified payment before any finalization; a P2P app handoff provides no such verification.

## Checks

- `node tests/p2p-upi.cjs`: exact URI, allowed fields, synchronous navigation, repeated initialization, test and actual amounts, invalid input.
- `node tests/payment-flow.cjs`: includes P2P checks and existing backend authorization/receipt tests.
- `npm run build`: production bundle.
