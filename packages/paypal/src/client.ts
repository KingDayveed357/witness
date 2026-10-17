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

  /** Read-only: a payout batch and its items (status per item). */
  getPayoutBatch(batchId: string): Promise<PayPalResponse> {
    return this.#t.send("GET", `/v1/payments/payouts/${encodeURIComponent(batchId)}`, { label: "get-payout-batch" });
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

  /** Submit reviewer-approved evidence (multipart, JSON in part "input"). Not money movement. */
  provideEvidence(disputeId: string, notes: string, requestId: string): Promise<PayPalResponse> {
    return this.#t.send("POST", `/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-evidence`, {
      multipartInput: { evidences: [{ evidence_type: "OTHER", notes }] },
      requestId,
      label: "provide-evidence",
    });
  }

  /** Sandbox only: ask PayPal to move the dispute to the evidence stage. */
  requireEvidence(disputeId: string, requestId: string): Promise<PayPalResponse> {
    return this.#t.send("POST", `/v1/customer/disputes/${encodeURIComponent(disputeId)}/require-evidence`, { body: { action: "SELLER_EVIDENCE" }, requestId, label: "require-evidence" });
  }

  /** Sandbox only: settle the dispute. Its result is a simulated verdict and is labelled as such. */
  adjudicate(disputeId: string, outcome: "SELLER_FAVOR" | "BUYER_FAVOR", requestId: string): Promise<PayPalResponse> {
    return this.#t.send("POST", `/v1/customer/disputes/${encodeURIComponent(disputeId)}/adjudicate`, { body: { adjudication_outcome: outcome }, requestId, label: "adjudicate" });
  }

  /**
   * POST /v1/notifications/verify-webhook-signature (required fields verified against the schema).
   * PayPal requires webhook_event to be posted back exactly as received, so the raw body is embedded
   * verbatim rather than re-serialised. Mock (simulator) events cannot be verified this way (PayPal docs).
   */
  async verifyWebhookSignature(h: WebhookHeaders, webhookId: string, rawEvent: string, requestId: string): Promise<boolean> {
    const head = JSON.stringify({ ...h, webhook_id: webhookId });
    const rawBody = `${head.slice(0, -1)},"webhook_event":${rawEvent}}`;
    const r = await this.#t.send<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      rawBody,
      requestId,
      label: "verify-webhook-signature",
      allowFail: true,
    });
    return r.ok && r.data?.verification_status === "SUCCESS";
  }
}
