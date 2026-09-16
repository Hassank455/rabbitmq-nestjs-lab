export const LAB04_EXCHANGE = 'lab04.orders.direct';

/**
 * These strings ARE the routing keys.
 * The dot is just a naming convention here — a direct exchange
 * does NOT understand dots. It only compares whole strings.
 */
export const LAB04_KEYS = {
  created: 'order.created',
  paid: 'order.paid',
  cancelled: 'order.cancelled',
} as const;

/**
 * The whole lab lives in this table:
 * each service owns ONE queue and picks WHICH keys it wants.
 * The publisher never sees this file.
 */
export const LAB04_SUBSCRIPTIONS = {
  warehouse: ['order.paid'],
  email: ['order.paid', 'order.cancelled'],
  audit: ['order.created', 'order.paid', 'order.cancelled'],
  analytics: ['order.created'],
} as const;

export type Lab04Service = keyof typeof LAB04_SUBSCRIPTIONS;

export const LAB04_ALL_SERVICES = Object.keys(
  LAB04_SUBSCRIPTIONS,
) as Lab04Service[];

/** Each service owns exactly one queue. The publisher never uses this. */
export const lab04QueueFor = (service: Lab04Service): string =>
  `lab04.${service}`;

export interface OrderEvent {
  orderId: number;
  type: string; // mirrors the routing key, so the payload is self-describing
  total: number;
  createdAt: string;
}
