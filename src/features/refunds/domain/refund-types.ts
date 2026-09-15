import { z } from "zod";

/** Stripe-supported reason codes. The amount is always the full order total. */
export const refundRequestSchema = z.object({
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).optional(),
});

export type RefundReason = z.infer<typeof refundRequestSchema>["reason"];

export type RefundRequestError =
  | { code: "NOT_FOUND"; status: 404 }
  | { code: "NOT_REFUNDABLE"; status: 409; message: string }
  | { code: "PAYMENT_REFERENCE_MISSING"; status: 409; message: string }
  | { code: "REFUND_ALREADY_REQUESTED"; status: 409; message: string }
  | { code: "VALIDATION"; status: 400; message: string }
  | { code: "STRIPE_UNAVAILABLE"; status: 502; message: string };

export type RefundRequestResult =
  | {
      ok: true;
      refundRequestId: string;
      status: "pending";
    }
  | {
      ok: false;
      error: RefundRequestError;
    };

export type StripeRefundStatus = "pending" | "succeeded" | "failed";
