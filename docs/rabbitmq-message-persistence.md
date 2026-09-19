# RabbitMQ - Message Persistence

## Overview

**Message Persistence** controls whether a RabbitMQ message is intended
to survive a broker restart.

There are two related but different concepts:

``` text
Queue Durability
      ↓
Does the QUEUE survive RabbitMQ restart?

Message Persistence
      ↓
Is the MESSAGE published with persistence semantics?
```

For messages that should survive a normal RabbitMQ restart, the basic
combination is:

``` text
Durable Queue
     +
Persistent Message
```

------------------------------------------------------------------------

## 1. Queue Durability

A queue can be:

``` text
Durable
Transient
```

### Durable Queue

A durable queue survives a RabbitMQ broker restart.

``` ts
await channel.assertQueue('orders', {
  durable: true,
});
```

``` text
RabbitMQ Running
      ↓
orders queue exists
      ↓
RabbitMQ Restart
      ↓
orders queue still exists
```

### Transient Queue

A transient queue does not survive a broker restart.

``` ts
await channel.assertQueue('orders', {
  durable: false,
});
```

``` text
RabbitMQ Running
      ↓
orders queue exists
      ↓
RabbitMQ Restart
      ↓
queue disappears
```

------------------------------------------------------------------------

## 2. Message Delivery Mode

AMQP messages have a **delivery mode**:

``` text
1 → Non-persistent
2 → Persistent
```

With `amqplib`, we commonly write:

``` ts
{
  persistent: true
}
```

which corresponds to persistent delivery mode.

------------------------------------------------------------------------

## 3. Non-Persistent Message

``` ts
channel.sendToQueue(
  'orders',
  Buffer.from(JSON.stringify(order)),
  {
    persistent: false,
  },
);
```

A non-persistent message is not intended to survive a broker restart.

Important: do not interpret this as "RAM only." RabbitMQ can use memory
and disk internally for different reasons. The important point is that a
non-persistent message does not receive the persistence guarantee of a
persistent message.

------------------------------------------------------------------------

## 4. Persistent Message

``` ts
channel.sendToQueue(
  'orders',
  Buffer.from(JSON.stringify(order)),
  {
    persistent: true,
  },
);
```

When routed to a suitable durable queue, the message is designed to
survive a normal broker restart.

``` text
Publisher
    ↓
Exchange
    ↓
Durable Queue
    ↓
Persistent Message
```

------------------------------------------------------------------------

## 5. The Four Important Combinations

  -----------------------------------------------------------------------
  Queue                   Delivery Mode           Result after restart
  ----------------------- ----------------------- -----------------------
  Durable                 Non-persistent          Queue survives, message
                                                  is not guaranteed to
                                                  survive

  Durable                 Persistent              Queue and persistent
                                                  message are designed to
                                                  survive

  Transient               Non-persistent          Queue and message do
                                                  not survive

  Transient               Persistent              Queue disappears, so
                                                  message persistence
                                                  cannot preserve the
                                                  queued message
  -----------------------------------------------------------------------

The important configuration is:

``` text
Queue = Durable
Message = Persistent
```

------------------------------------------------------------------------

## 6. Durable Queue + Non-Persistent Message

``` ts
await channel.assertQueue('orders', {
  durable: true,
});

channel.sendToQueue(
  'orders',
  Buffer.from('Order Created'),
  {
    persistent: false,
  },
);
```

After restart:

``` text
Queue
  ↓
still exists

Message
  ↓
not guaranteed to survive
```

Queue durability alone is not enough to make its messages persistent.

------------------------------------------------------------------------

## 7. Durable Queue + Persistent Message

``` ts
await channel.assertQueue('orders', {
  durable: true,
});

channel.sendToQueue(
  'orders',
  Buffer.from('Order Created'),
  {
    persistent: true,
  },
);
```

Now:

``` text
Durable Queue
      +
Persistent Message
      ↓
Designed to survive broker restart
```

------------------------------------------------------------------------

## 8. Transient Queue + Non-Persistent Message

``` ts
await channel.assertQueue('temporary-jobs', {
  durable: false,
});

channel.sendToQueue(
  'temporary-jobs',
  Buffer.from('Temporary Job'),
  {
    persistent: false,
  },
);
```

After RabbitMQ restarts:

``` text
Queue disappears
Message disappears
```

This can be useful when losing temporary queued work is acceptable.

------------------------------------------------------------------------

## 9. Transient Queue + Persistent Message

``` ts
await channel.assertQueue('temporary-jobs', {
  durable: false,
});

channel.sendToQueue(
  'temporary-jobs',
  Buffer.from('Important Job'),
  {
    persistent: true,
  },
);
```

The message is marked persistent, but:

``` text
Queue = Transient
      ↓
Queue disappears after restart
```

Therefore:

``` text
Transient Queue
      +
Persistent Message
      ↓
Does not provide useful restart durability
```

------------------------------------------------------------------------

## 10. Real Example --- Order Processing

Suppose we have:

``` text
POST /orders
      ↓
Order Service
      ↓
RabbitMQ
      ↓
orders queue
      ↓
Order Worker
```

We do not want queued order work to disappear after a normal broker
restart.

Queue:

``` ts
await channel.assertQueue('orders', {
  durable: true,
});
```

Publish:

``` ts
channel.sendToQueue(
  'orders',
  Buffer.from(
    JSON.stringify({
      orderId: 1001,
      customerId: 82,
      total: 120,
    }),
  ),
  {
    persistent: true,
  },
);
```

Configuration:

``` text
orders queue
durable = true

+

order message
persistent = true
```

------------------------------------------------------------------------

## 11. Example With an Exchange

``` ts
await channel.assertExchange(
  'orders.exchange',
  'direct',
  {
    durable: true,
  },
);

await channel.assertQueue(
  'orders.queue',
  {
    durable: true,
  },
);

await channel.bindQueue(
  'orders.queue',
  'orders.exchange',
  'order.created',
);
```

Publish:

``` ts
channel.publish(
  'orders.exchange',
  'order.created',
  Buffer.from(
    JSON.stringify({
      orderId: 1001,
    }),
  ),
  {
    persistent: true,
  },
);
```

Architecture:

``` text
Publisher
    ↓
Durable Exchange
    ↓
Durable Queue
    ↓
Persistent Message
    ↓
Consumer
```

------------------------------------------------------------------------

## 12. Persistent Does Not Mean Reliable Publishing by Itself

This is very important.

``` text
persistent: true
```

answers:

> How should RabbitMQ treat this message for persistence?

It does not by itself prove to the publisher that RabbitMQ successfully
accepted the publish.

For that, we use **Publisher Confirms**.

A stronger setup is:

``` text
Durable Queue
       +
Persistent Message
       +
Publisher Confirms
```

------------------------------------------------------------------------

## 13. Publisher Confirms Example

``` ts
const channel = await connection.createConfirmChannel();

await channel.assertQueue('orders', {
  durable: true,
});

channel.sendToQueue(
  'orders',
  Buffer.from(
    JSON.stringify({
      orderId: 1001,
    }),
  ),
  {
    persistent: true,
  },
);

await channel.waitForConfirms();
```

Conceptually:

``` text
Publisher
    │
    │ Persistent Message
    ▼
RabbitMQ
    │
    │ Publisher Confirm
    ▼
Publisher
```

------------------------------------------------------------------------

## 14. Persistence vs Consumer ACK

Do not confuse these concepts:

``` text
Publisher Confirms
      ↓
Broker confirms the publish to the Publisher


Message Persistence
      ↓
Message has persistence semantics


Consumer ACK
      ↓
Consumer confirms successful processing
```

Complete mental model:

``` text
Publisher
    │
    │ Publish
    ▼
RabbitMQ
    │
    │ Publisher Confirm
    ▼
Publisher

RabbitMQ Queue
    │
    │ Deliver
    ▼
Consumer
    │
    │ Process
    ▼
ACK
    │
    ▼
RabbitMQ
```

Each mechanism solves a different problem.

------------------------------------------------------------------------

## 15. Memory vs Disk Clarification

A simplified explanation often says:

``` text
Non-persistent → Memory
Persistent     → Disk
```

This is useful as an introduction, but it is not literally how every
message is handled internally.

RabbitMQ can use memory and disk depending on its storage and
memory-management behavior.

A better mental model is:

``` text
Non-persistent
      ↓
No persistence guarantee across restart


Persistent
      ↓
Persistence semantics for restart durability
```

So avoid thinking:

``` text
Non-persistent = RAM only
Persistent = Disk only
```

------------------------------------------------------------------------

## 16. Recommended Reliability Combination

For important jobs such as:

``` text
Create Order
Process Payment
Generate Invoice
Booking Processing
Critical Notifications
```

a common design is:

``` text
Durable Exchange
        ↓
Durable Queue
        ↓
Persistent Message
        +
Publisher Confirms
        +
Manual Consumer ACK
```

These features complement each other rather than replace each other.

------------------------------------------------------------------------

## 17. Quick Comparison

  -----------------------------------------------------------------------
  Concept                 Configured On           Purpose
  ----------------------- ----------------------- -----------------------
  Durable                 Queue / Exchange        Entity survives restart

  Persistent              Message                 Message receives
                                                  persistence semantics

  Publisher Confirm       Publisher               Know whether broker
                                                  accepted the publish

  Consumer ACK            Consumer                Tell broker processing
                                                  succeeded
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 18. Common Mistake

This:

``` ts
await channel.assertQueue('orders', {
  durable: true,
});
```

does **not** automatically make every message persistent.

Queue durability and message persistence are separate settings.

For persistent messages, publish with:

``` ts
{
  persistent: true
}
```

------------------------------------------------------------------------

# Final Mental Model

``` text
QUEUE

durable: true
      ↓
Queue survives restart


MESSAGE

persistent: true
      ↓
Message receives persistence semantics
```

For important queued work:

``` text
Durable Queue
      +
Persistent Message
      +
Publisher Confirms
      +
Manual Consumer ACK
      ↓
Stronger end-to-end reliability
```

## Key Rule

> **Durability protects the queue; persistence protects the message.
> They are related, but they are not the same thing.**
