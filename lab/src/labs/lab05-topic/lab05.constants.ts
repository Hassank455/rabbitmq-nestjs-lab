export const LAB05_EXCHANGE = 'lab05.events.topic';

/**
 * Routing key convention for this lab:  <entity>.<action>.<region>
 *
 * The dots become MEANINGFUL here. A direct exchange treats
 * 'order.paid.eu' as one opaque string; a topic exchange splits it
 * into the words ['order', 'paid', 'eu'] and matches word by word.
 *
 *   *  = exactly one word  (the word must exist)
 *   #  = zero or more words
 */
export const LAB05_SUBSCRIPTIONS = {
  audit: ['#'], // literally everything
  orders: ['order.#'], // any order event, any region
  compliance: ['*.*.eu'], // any 3-word key ending in eu
  payments: ['order.paid.*', 'payment.#'], // two patterns, one queue
  alerts: ['*.failed.*'], // a wildcard in the MIDDLE
} as const;

export type Lab05Service = keyof typeof LAB05_SUBSCRIPTIONS;

export const LAB05_ALL_SERVICES = Object.keys(
  LAB05_SUBSCRIPTIONS,
) as Lab05Service[];

export const lab05QueueFor = (service: Lab05Service): string =>
  `lab05.${service}`;

export interface DomainEvent {
  eventId: number;
  routingKey: string;
  createdAt: string;
}
