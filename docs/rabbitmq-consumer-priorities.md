# RabbitMQ --- Consumer Priorities

## Overview

When multiple consumers consume from the **same queue**, RabbitMQ
normally distributes messages between the available consumers.

**Consumer Priority** lets us tell RabbitMQ which consumer should be
preferred.

Example:

``` text
Consumer 1 → Priority = 10
Consumer 2 → Priority = 5
Consumer 3 → Priority = 0
```

RabbitMQ prefers the consumer with the **highest priority**, as long as
that consumer is currently able to receive another message.

------------------------------------------------------------------------

## Basic Idea

Without consumer priorities:

``` text
                ┌──> Consumer 1
Queue ──────────┼──> Consumer 2
                └──> Consumer 3
```

RabbitMQ distributes work between available consumers.

With consumer priorities:

``` text
Consumer 1 → Priority 10  ← highest priority
Consumer 2 → Priority 5
Consumer 3 → Priority 0   ← lowest priority
```

RabbitMQ first tries to deliver messages to **Consumer 1**.

If Consumer 1 cannot currently accept more messages, RabbitMQ tries
Consumer 2.

If Consumer 2 also cannot accept more messages, RabbitMQ can deliver to
Consumer 3.

------------------------------------------------------------------------

## Consumer Priority + Prefetch

Consumer Priority becomes especially important when combined with
**prefetch**.

Suppose:

``` text
Consumer 1 → Priority = 10
Consumer 2 → Priority = 5
Consumer 3 → Priority = 0

Prefetch Count = 3
```

Prefetch means a consumer can have at most 3 unacknowledged messages at
that moment.

For example:

``` text
Consumer 1

M1 → processing
M2 → processing
M3 → processing

Unacked = 3
Prefetch = 3
```

Consumer 1 has reached its prefetch limit.

RabbitMQ cannot send another message to Consumer 1 until one of those
messages is acknowledged.

So RabbitMQ looks for another available consumer.

``` text
Consumer 1
Priority = 10
Unacked = 3
FULL
       ↓
Consumer 2
Priority = 5
AVAILABLE
```

The next message can therefore go to Consumer 2.

------------------------------------------------------------------------

## Example With 9 Messages

Assume 9 messages arrive quickly and none of the consumers sends an ACK
while RabbitMQ is initially distributing them.

Configuration:

``` text
Consumer 1 → Priority 10
Consumer 2 → Priority 5
Consumer 3 → Priority 0

Prefetch = 3
```

A simplified distribution can look like this:

``` text
Queue
 │
 ├── M1 ──> Consumer 1
 ├── M2 ──> Consumer 1
 ├── M3 ──> Consumer 1
 │
 │    Consumer 1 reached prefetch = 3
 │
 ├── M4 ──> Consumer 2
 ├── M5 ──> Consumer 2
 ├── M6 ──> Consumer 2
 │
 │    Consumer 2 reached prefetch = 3
 │
 ├── M7 ──> Consumer 3
 ├── M8 ──> Consumer 3
 └── M9 ──> Consumer 3
```

This is a useful conceptual example, but real delivery timing depends on
when consumers ACK messages and become available again.

------------------------------------------------------------------------

## What Happens After an ACK?

Suppose Consumer 1 currently has:

``` text
M1
M2
M3

Unacked = 3
```

Then it finishes M1 and sends:

``` text
ACK M1
```

Now:

``` text
Unacked = 2
Prefetch = 3
```

Consumer 1 has capacity again.

Because Consumer 1 has the highest priority:

``` text
Priority = 10
```

RabbitMQ will prefer it for the next eligible delivery over
lower-priority consumers.

So priorities are not simply:

> Consumer 1 receives everything forever.

The more accurate rule is:

> RabbitMQ prefers the highest-priority consumer that is currently
> active and eligible to receive another delivery.

------------------------------------------------------------------------

## Setting Consumer Priority in amqplib

Consumer priority is configured when registering the consumer.

Example:

``` ts
await channel.consume(
  'orders',
  async (msg) => {
    if (!msg) return;

    try {
      const data = JSON.parse(msg.content.toString());

      console.log('Processing:', data);

      // Do the work...

      channel.ack(msg);
    } catch (error) {
      channel.nack(msg, false, false);
    }
  },
  {
    noAck: false,

    arguments: {
      'x-priority': 10,
    },
  },
);
```

The important part is:

``` ts
arguments: {
  'x-priority': 10,
}
```

This consumer has priority `10`.

------------------------------------------------------------------------

## Example With Three Consumers

### Consumer 1

``` ts
await channel.prefetch(3);

await channel.consume(
  'orders',
  handleMessage,
  {
    noAck: false,
    arguments: {
      'x-priority': 10,
    },
  },
);
```

### Consumer 2

``` ts
await channel.prefetch(3);

await channel.consume(
  'orders',
  handleMessage,
  {
    noAck: false,
    arguments: {
      'x-priority': 5,
    },
  },
);
```

### Consumer 3

``` ts
await channel.prefetch(3);

await channel.consume(
  'orders',
  handleMessage,
  {
    noAck: false,
    arguments: {
      'x-priority': 0,
    },
  },
);
```

Conceptually:

``` text
                 ┌──> Consumer 1
                 │    Priority = 10
                 │
orders queue ────┼──> Consumer 2
                 │    Priority = 5
                 │
                 └──> Consumer 3
                      Priority = 0
```

RabbitMQ prefers Consumer 1 whenever it is eligible for another
delivery.

------------------------------------------------------------------------

## Practical Use Case --- Primary and Backup Workers

Imagine an order processing system.

You have powerful production workers:

``` text
Worker A
Priority = 10

Worker B
Priority = 10
```

You also have a slower backup worker:

``` text
Worker C
Priority = 1
```

Normally:

``` text
Queue
 │
 ├──> Worker A
 └──> Worker B

Preferred workers
```

If the preferred workers are unavailable or cannot currently accept
additional deliveries, RabbitMQ can use:

``` text
Worker C
```

This creates a useful **preferred workers + fallback workers**
architecture.

------------------------------------------------------------------------

## Same Priority

Consumers can have the same priority.

Example:

``` text
Consumer A → Priority 10
Consumer B → Priority 10
Consumer C → Priority 5
```

Consumer A and Consumer B belong to the same priority level.

RabbitMQ can distribute messages among the active consumers at that
highest available priority level.

Consumer C is used when higher-priority consumers are not eligible for
delivery.

------------------------------------------------------------------------

## Consumer Priority vs Message Priority

These are completely different concepts.

### Consumer Priority

Answers:

> Which consumer should RabbitMQ prefer?

Example:

``` text
Consumer A → priority 10
Consumer B → priority 5
```

The priority belongs to the **consumer**.

------------------------------------------------------------------------

### Message Priority

Answers:

> Which message should be processed first?

Example:

``` text
Payment Failed → Priority 10
Send Newsletter → Priority 1
```

The priority belongs to the **message**.

A priority queue must be configured appropriately, for example:

``` ts
await channel.assertQueue('tasks', {
  durable: true,
  arguments: {
    'x-max-priority': 10,
  },
});
```

Then a message can be published with a priority:

``` ts
channel.sendToQueue(
  'tasks',
  Buffer.from(JSON.stringify(data)),
  {
    priority: 10,
  },
);
```

So remember:

``` text
Consumer Priority
      ↓
Which consumer gets preferred?


Message Priority
      ↓
Which queued message gets preferred?
```

------------------------------------------------------------------------

## Important Relationship

The key relationship is:

``` text
Consumer Priority
        +
     Prefetch
        +
Acknowledgements
        ↓
Message Distribution
```

Priority determines which consumer RabbitMQ prefers.

Prefetch determines how many unacknowledged deliveries that consumer can
have.

ACKs free capacity so the consumer can receive more messages.

------------------------------------------------------------------------

## Important Notes

-   Higher number means higher consumer priority.
-   Consumer priority is configured on the **consumer**, not on the
    queue.
-   `x-priority` is used as the consumer argument.
-   RabbitMQ prefers higher-priority active consumers.
-   A higher-priority consumer that has reached its prefetch limit may
    temporarily be unable to receive more messages.
-   Lower-priority consumers can then receive work.
-   When the higher-priority consumer becomes eligible again, RabbitMQ
    prefers it again.
-   Consumer Priority and Message Priority solve different problems.

------------------------------------------------------------------------

## Quick Summary

``` text
Consumer 1
Priority = 10
Prefetch = 3
        ↓
RabbitMQ prefers it first
        ↓
3 messages are unacked
        ↓
Consumer 1 cannot currently receive another
        ↓
RabbitMQ checks Consumer 2
        ↓
Consumer 2 Priority = 5
        ↓
Messages can go to Consumer 2
        ↓
Consumer 1 ACKs a message
        ↓
Consumer 1 becomes eligible again
        ↓
RabbitMQ prefers Consumer 1 again
```

The main idea:

> **Consumer Priority controls which available consumer RabbitMQ prefers
> when multiple consumers are attached to the same queue.**
