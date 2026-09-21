# Payment integration status

Golden Circle Patron (₹25,000) uses `pl_Tejn5pE3kCWvPt`, and Golden Circle Benefactor (₹51,000) uses `pl_TejpIVSniPgaAl`. Golden Circle Fellow (₹1,10,000) uses `pl_TejqWJfFRrNL6l`. Legacy Patron (₹5,00,000) uses `pl_TejsSWaRUW6DnB`. Golden Circle Member (₹11,000) uses `pl_TejejECoKJiUGY`. All five embed the supplied Razorpay Payment Buttons using `https://checkout.razorpay.com/v1/payment-button.js`. The script is appended to its form after tier rendering so it executes. These tiers use their hosted buttons instead of the coming-soon notice.

The actual checkout amount and payment options are controlled by that button's Razorpay Dashboard configuration, not by the displayed tier amount. A live checkout/payment has not been verified here.

Sponsor a Student uses `pl_Tejv124lsiX3hF` with the same embed loader. Its old local amount input is removed because it was not connected to the hosted checkout; Razorpay controls the amount fields.

All membership tiers now use their configured Razorpay buttons. The previous QR, direct UPI intent, recipient details and copy action remain removed.

The existing server checkout/status/receipt endpoints are separate and are not called by this embed. The site does not claim payment success, activate membership or issue receipts based on opening or closing Razorpay. Backend verification for Razorpay is not implemented.

Reference: https://razorpay.com/docs/payments/payment-button/quick-pay/
