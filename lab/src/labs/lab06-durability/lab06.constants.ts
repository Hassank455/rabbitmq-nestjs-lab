/** 'on' / 'off' env flag with a default. */
const flag = (name: string, fallback: boolean): boolean => {
  const value = process.env[name];
  return value === undefined ? fallback : value === 'on';
};

/** durable exchange + durable queue. Survive a BROKER restart. */
export const LAB06_DURABLE = flag('LAB06_DURABLE', true);

/** deliveryMode 2. The message itself is written to disk. */
export const LAB06_PERSISTENT = flag('LAB06_PERSISTENT', true);

// A different name per mode, on purpose: RabbitMQ refuses to redeclare
// an existing queue with a different `durable` value (PRECONDITION_FAILED).
const mode = LAB06_DURABLE ? 'durable' : 'transient';

export const LAB06_EXCHANGE = `lab06.billing.${mode}`;
export const LAB06_QUEUE = `lab06.invoices.${mode}`;
export const LAB06_ROUTING_KEY = 'invoice.created';

export interface InvoiceMessage {
  invoiceId: number;
  amount: number;
  persistent: boolean;
  createdAt: string;
}
