export const LAB08_EXCHANGE = 'lab08.orders';
export const LAB08_QUEUE = 'lab08.orders.work';
export const LAB08_ROUTING_KEY = 'order.placed';

/**
 * Dead-letter side.
 * fanout on purpose: a dead-lettered message keeps its ORIGINAL routing key,
 * and a fanout exchange ignores routing keys, so nothing can be dropped here.
 */
export const LAB08_DLX = 'lab08.orders.dlx';
export const LAB08_DLQ = 'lab08.orders.dlq';

/**
 * ok     → processed and acked
 * poison → rejected with requeue: false → dead-lettered
 */
export type OrderKind = 'ok' | 'poison';

export interface OrderMessage {
  orderId: number;
  kind: OrderKind;
}

/** on = declare everything, but never consume (lets messages expire). */
export const LAB08_PAUSED = process.env.LAB08_PAUSED === 'on';

/** Simulated work time. */
export const LAB08_DELAY = Number(process.env.LAB08_DELAY ?? 300);

/** GET /lab08/dlq never holds more than this many messages at once. */
export const LAB08_PEEK_LIMIT = 50;
