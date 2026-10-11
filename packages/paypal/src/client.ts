// The PayPal client for the API process: create and read, never capture or void.

import { PayPalTransport, type PayPalResponse, type TransportOptions } from "./transport.ts";

export interface WebhookHeaders {
  auth_algo: string;
  cert_url: string;
  transmission_id: string;
  transmission_sig: string;
  transmission_time: string;
}

export class PayPalClient {
  readonly #t: PayPalTransport;

  constructor(o: Omit<TransportOptions, "role"> & { role?: "api" | "script" }) {
    this.#t = new PayPalTransport({ ...o, role: o.role ?? "api" });
  }

  /** POST /v2/checkout/orders. With a vault_id this also authorizes (Gate 2 evidence). */
  createOrder(body: Record<string, unknown>, requestId: string): Promise<PayPalResponse> {
    return this.#t.send("POST", "/v2/checkout/orders", { body, requestId, label: "create-order" });
  }

  getOrder(orderId: string): Promise<PayPalResponse> {
    return this.#t.send("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`, { label: "get-order" });
  }

  getAuthorization(authorizationId: string): Promise<PayPalResponse> {
    return this.#t.send("GET", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`, { label: "get-authorization" });
  }

  getCapture(captureId: string): Promise<PayPalResponse> {
    return this.#t.send("GET", `/v2/payments/captures/${encodeURIComponent(captureId)}`, { label: "get-capture" });
  }

  getDispute(disputeId: string): Promise<PayPalResponse> {
    return this.#t.send("GET", `/v1/customer/disputes/${encodeURIComponent(disputeId)}`, { label: "get-dispute" });
  }

  /** POST /v1/notifications/verify-webhook-signature (required fields verified against the schema). */
  async verifyWebhookSignature(h: WebhookHeaders, webhookId: string, event: unknown, requestId: string): Promise<boolean> {
    const r = await this.#t.send<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      body: { ...h, webhook_id: webhookId, webhook_event: event },
      requestId,
      label: "verify-webhook-signature",
      allowFail: true,
    });
    return r.ok && r.data?.verification_status === "SUCCESS";
  }
}
