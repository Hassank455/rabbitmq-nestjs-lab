export const LAB03_EXCHANGE = 'lab03.orders.fanout';

export const LAB03_SERVICES = ['email', 'sms', 'analytics'] as const;

export type Lab03Service = (typeof LAB03_SERVICES)[number];

/** Each service owns exactly one queue. The publisher never uses this. */
export const lab03QueueFor = (service: Lab03Service): string =>
  `lab03.${service}`;

export interface OrderCreatedEvent {
  orderId: number;
  customerId: number;
  total: number;
  createdAt: string;
}
