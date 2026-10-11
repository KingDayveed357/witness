// Public surface: no capture or void here. Those live in "@witness/paypal/money-movement".
export { PayPalClient, type WebhookHeaders } from "./client.ts";
export { PayPalHttpError, PayPalNetworkError, MoneyMovementForbidden, assertSandbox, SANDBOX_HOST, type PayPalResponse } from "./transport.ts";
