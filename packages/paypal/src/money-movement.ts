// Capture and void. Importable only by packages/executor (dependency-cruiser rule) and
// usable only when the process role is "executor" (transport guard). Callers must pass a
// deterministic request ID and an explicit amount: never PayPal's 115% overage default.

import { PayPalTransport, type PayPalResponse, type TransportOptions } from "./transport.ts";

export class MoneyMovementClient {
  readonly #t: PayPalTransport;

  constructor(o: Omit<TransportOptions, "role">) {
    this.#t = new PayPalTransport({ ...o, role: "executor" });
  }

  captureAuthorization(authorizationId: string, amount: { currency_code: string; value: string }, requestId: string): Promise<PayPalResponse> {
    return this.#t.send("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, {
      body: { amount, final_capture: true },
      requestId,
      label: "capture-authorization",
      allowFail: true,
    });
  }

  voidAuthorization(authorizationId: string, requestId: string): Promise<PayPalResponse> {
    return this.#t.send("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
      body: {},
      requestId,
      label: "void-authorization",
      allowFail: true,
    });
  }
}
