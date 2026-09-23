export const LAB07_EXCHANGE = 'lab07.billing';
export const LAB07_QUEUE = 'lab07.payments';
export const LAB07_ROUTING_KEY = 'payment.requested';

/**
 * ok        → succeeds on the first try
 * transient → fails twice, succeeds on the 3rd delivery (network blip, lock, …)
 * poison    → NEVER succeeds (malformed payload, a bug, a deleted account)
 */
export type PaymentKind = 'ok' | 'transient' | 'poison';

export interface PaymentMessage {
  paymentId: number;
  kind: PaymentKind;
  amount: number;
}

/** What the consumer does when the work FAILS. */
export type Lab07Strategy = 'requeue' | 'drop' | 'smart' | 'hang';

export const LAB07_STRATEGY = (process.env.LAB07_STRATEGY ??
  'requeue') as Lab07Strategy;

/** 'smart' only: how many deliveries before we give up on a message. */
export const LAB07_MAX_ATTEMPTS = Number(process.env.LAB07_MAX_ATTEMPTS ?? 3);

/** Simulated work time. Keep it > 0 so the requeue loop is readable. */
export const LAB07_DELAY = Number(process.env.LAB07_DELAY ?? 500);
