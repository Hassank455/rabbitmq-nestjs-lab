# 019 - RabbitMQ - Quorum Queues

## What is a Quorum Queue?

A **Quorum Queue** is a durable, replicated RabbitMQ queue designed for **high availability and data safety**.

Quorum Queues use the **Raft consensus algorithm**. A queue is replicated across multiple RabbitMQ nodes, with one member acting as the **leader** and the others as **followers**.

```text
                         ┌── Node A - Leader
Publisher ──► Exchange ──►
                         ├── Node B - Follower
                         └── Node C - Follower
```

If the leader fails, another replica can become leader as long as the required majority is available.

---

## Why Do We Need Quorum Queues?

Consider an important event:

```text
payment.requested
```

With a Quorum Queue:

```text
                    payment.queue
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Node A       Node B       Node C
          Leader       Follower     Follower
```

The queue state is replicated, reducing dependence on a single RabbitMQ node.

Good candidates include:

```text
booking.created
payment.requested
order.created
reservation.confirmed
```

---

## Core Characteristics

A useful mental model is:

```text
Quorum Queue
=
Durability
+
Replication
+
Consensus
+
Leader Election
```

Quorum Queues are designed for important workloads where message safety and availability matter.

---

## Leader and Followers

A Quorum Queue has one leader and multiple followers.

```text
orders.queue

Node A → Leader
Node B → Follower
Node C → Follower
```

Conceptually:

```text
Publisher
    │
    ▼
 Leader
    │
    ├────► Follower
    └────► Follower
```

RabbitMQ handles this replication internally.

---

## What Happens if the Leader Fails?

Initially:

```text
Node A → Leader
Node B → Follower
Node C → Follower
```

If Node A fails:

```text
Node A ❌
Node B
Node C
```

the remaining members can elect a new leader if they still form a majority.

```text
Node B → New Leader
Node C → Follower
```

---

## What Does Quorum Mean?

A **quorum** is a majority of members.

```text
3 members → majority = 2
5 members → majority = 3
```

With three members, the queue can tolerate one unavailable member while retaining a majority.

Odd replication factors such as 3 or 5 are common because adding replicas also adds:

- Network traffic
- Disk I/O
- CPU usage
- Storage usage

---

## Raft Consensus

Quorum Queues use **Raft** so distributed queue members can agree on their state.

The main concepts to understand are:

```text
Leader
Followers
Replication
Majority
Leader Election
```

You do not implement Raft yourself; RabbitMQ handles it.

---

## Creating a Quorum Queue with amqplib

```typescript
await channel.assertQueue('booking.queue', {
  durable: true,
  arguments: {
    'x-queue-type': 'quorum',
  },
});
```

The key argument is:

```typescript
'x-queue-type': 'quorum'
```

---

## Classic Queue vs Quorum Queue

A simplified comparison:

| Feature | Classic Queue | Quorum Queue |
|---|---|---|
| Durable queues | Yes | Yes |
| Non-durable queues | Yes | No |
| Exclusive queues | Yes | No |
| Replication by queue type | No | Yes |
| Raft consensus | No | Yes |
| Leader election | Not the same model | Yes |
| Data-safety focus | General purpose | Strong |
| Message TTL | Supported | Supported |
| Queue length limits | Supported | Supported |
| Dead lettering | Supported | Supported |
| Consumer priorities | Supported | Supported |

> RabbitMQ capabilities evolve between versions, so detailed feature comparisons should be checked against the version being deployed.

---

## Durable Queue vs Quorum Queue

This distinction is important.

```typescript
await channel.assertQueue('orders', {
  durable: true,
});
```

`durable: true` means the **queue definition survives broker restart**.

It does not by itself provide:

```text
Replication
Raft consensus
Majority
Leader election
```

A Quorum Queue adds these distributed-system properties.

```text
Durable
   └── survives restart

Quorum
   ├── durable
   ├── replicated
   ├── Raft
   ├── majority
   └── leader election
```

---

## Persistent Messages

For important messages, reliability is an end-to-end concern.

```typescript
channel.sendToQueue(
  'booking.queue',
  Buffer.from(JSON.stringify(message)),
  {
    persistent: true,
  },
);
```

A strong design can combine:

```text
Quorum Queue
+
Persistent Messages
+
Publisher Confirms
+
Manual Consumer ACK
```

---

## Publisher Confirms Still Matter

Quorum Queue replication does not replace reliable publishing.

```typescript
const channel = await connection.createConfirmChannel();
```

Think of the responsibilities separately:

```text
Publisher Confirm
→ Publisher ↔ RabbitMQ publishing reliability

Quorum Queue
→ Replication and availability inside RabbitMQ

Consumer ACK
→ RabbitMQ ↔ Consumer processing reliability
```

Together:

```text
Publisher
   │
   │ Publisher Confirm
   ▼
Quorum Queue
   │
   │ Consumer ACK
   ▼
Consumer
```

---

## Quorum Queue + Dead Letter Exchange

Quorum Queues can be configured with a DLX.

```typescript
await channel.assertQueue('booking.queue', {
  durable: true,
  arguments: {
    'x-queue-type': 'quorum',
    'x-dead-letter-exchange': 'booking.dlx',
    'x-dead-letter-routing-key': 'booking.failed',
  },
});
```

Example failure flow:

```text
booking.queue
     │
     │ nack(requeue=false)
     ▼
booking.dlx
     │
     ▼
booking.failed.queue
```

---

## Quorum Queue and Prefetch

Prefetch still controls how many unacknowledged messages a consumer can have.

```typescript
channel.prefetch(10);
```

```text
Quorum Queue → replication / availability
Prefetch     → consumer flow control
```

They solve different problems.

---

## Poison Messages

A poison message repeatedly fails processing.

```text
Message
   ↓
Consumer
   ↓
Error
   ↓
Requeue
   ↓
Consumer
   ↓
Error
```

Quorum Queues support delivery-limit mechanisms that can be combined with dead lettering so repeatedly failing messages can eventually leave the main queue.

```text
Message
   ↓
Retries
   ↓
Delivery limit reached
   ↓
DLX
   ↓
Dead Letter Queue
```

---

## When Should You Use Quorum Queues?

They are especially useful for important business workflows such as:

```text
Payments
Bookings
Orders
Reservations
Critical background jobs
```

For example:

```text
User books flight
      │
      ▼
booking.created
      │
      ▼
Quorum Queue
      │
      ▼
Booking Worker
      │
      ├── Reserve provider offer
      ├── Process payment
      └── Update booking
```

Losing such an event could leave the system in an inconsistent business state.

---

## When Might You Not Need One?

Not every message requires replicated consensus.

Examples of less critical workloads might include:

```text
temporary metrics
debug events
disposable notifications
```

The trade-off is:

```text
Higher data safety
        ↕
Higher replication cost
```

---

## Production Reliability Pattern

```text
Publisher
    │
    │ Publisher Confirms
    ▼
Exchange
    │
    ▼
Quorum Queue
    │
    │ Raft replication
    ▼
Consumer
    │
    │ Manual ACK
    ▼
Business Logic
```

Failure path:

```text
Consumer fails
      │
      ▼
NACK / rejection
      │
      ▼
Retry strategy
      │
      ▼
Delivery limit
      │
      ▼
DLX
      │
      ▼
Dead Letter Queue
```

This connects several RabbitMQ concepts:

```text
Persistence
Publisher Confirms
Consumer Acknowledgements
Prefetch
Dead Messages
DLX
Quorum Queues
```

---

## Important Mental Model

Do not think:

```text
Quorum Queue = messages can never be lost
```

Think:

```text
Quorum Queue
=
A RabbitMQ queue designed to protect queue data
and improve availability through replication
and majority-based consensus.
```

Reliable messaging usually combines multiple techniques:

```text
Quorum Queue
+
Persistent Messages
+
Publisher Confirms
+
Manual ACK
+
Idempotent Consumers
+
Retry Strategy
+
Dead Letter Queue
+
Monitoring
```

---

## Summary

```text
Quorum Queue
     │
     ├── Durable
     ├── Replicated
     ├── FIFO-oriented
     ├── Raft Consensus
     ├── Leader
     ├── Followers
     ├── Majority / Quorum
     └── Leader Election
```

The key distinction:

> **Durability protects a queue across restarts; Quorum Queues add replication and distributed consensus across RabbitMQ nodes.**
