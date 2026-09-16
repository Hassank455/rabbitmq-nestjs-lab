# RabbitMQ Consumer Prefetch

## Overview

**Consumer Prefetch** controls how many messages RabbitMQ can deliver
without receiving acknowledgements for them.

``` text
Unacked <= Prefetch Count
```

For example:

``` text
Prefetch = 3

RabbitMQ
   |
   +--> Message 1 [Unacked]
   +--> Message 2 [Unacked]
   +--> Message 3 [Unacked]
   |
   X Wait for acknowledgement capacity
```

Prefetch is especially important with **Manual Acknowledgements**.

## Why Prefetch?

Imagine a consumer that processes messages by calling an external API
and database.

``` text
RabbitMQ -> Consumer -> REST API
                    -> Database
```

Without an appropriate limit, too much outstanding work can put pressure
on memory, CPU, database connections, HTTP connections, and downstream
services.

Prefetch provides **backpressure**.

## ACK and Prefetch

With:

``` text
Prefetch = 3
```

three deliveries may be unacknowledged:

``` text
Message 1
Message 2
Message 3
```

After:

``` text
ACK Message 1
```

one slot becomes available, so RabbitMQ can deliver Message 4.

``` text
Message 2 [Unacked]
Message 3 [Unacked]
Message 4 [Unacked]
```

Think of Prefetch as a window of outstanding deliveries.

## Ready vs Unacked

Prefetch does not limit queue size.

``` text
Queue = 10,000 messages
Prefetch = 5
```

You might have:

``` text
Ready  = 9,995
Unacked = 5
```

`Ready` messages are waiting in the queue. `Unacked` messages were
delivered but have not yet been acknowledged.

## Prefetch Is Not Concurrency

This is important:

``` ts
channel.prefetch(10);
```

does **not automatically mean** that ten messages are processed in
parallel.

``` text
Prefetch
-> Controls outstanding unacknowledged deliveries.

Concurrency
-> Controls how many tasks the application actually processes simultaneously.
```

You can have:

``` text
Prefetch = 10
Concurrency = 1
```

or:

``` text
Prefetch = 10
Concurrency = 5
```

depending on the consumer implementation.

## Multiple Consumers

Suppose:

``` text
              Queue
             /                 v       v
      Consumer A  Consumer B
```

With an effective prefetch of 2 per consumer:

``` text
Consumer A:
Message 1
Message 3
Unacked = 2

Consumer B:
Message 2
Message 4
Unacked = 2
```

If Consumer B ACKs a message first, it has capacity for another
delivery. This helps avoid accumulating excessive outstanding work at a
slow consumer.

## Backpressure

``` text
Prefetch
   |
   v
Limits Unacked Deliveries
   |
   v
Controls Outstanding Work
   |
   v
Creates Backpressure
```

This is useful when consumers depend on databases, REST APIs, or other
limited resources.

## prefetch(1)

``` ts
channel.prefetch(1);
```

Conceptually:

``` text
RabbitMQ -> Message 1 -> Consumer
                         |
                         | Process
                         v
                        ACK
                         |
RabbitMQ -> Message 2 ---+
```

Only one outstanding unacknowledged delivery is allowed under that
effective limit.

## prefetch(10)

``` ts
channel.prefetch(10);
```

RabbitMQ can allow up to ten outstanding unacknowledged deliveries
according to the effective QoS scope.

After an ACK frees capacity, another delivery can be sent.

## prefetch(0)

``` ts
channel.prefetch(0);
```

In RabbitMQ, zero means **no prefetch limit from that setting**.

It does not mean:

``` text
Send zero messages.
```

Mental model:

``` text
Prefetch = 0
-> No limit
```

Use this carefully for expensive workloads.

## Choosing a Prefetch Value

There is no universal best number.

Consider:

``` text
Processing time
Application concurrency
CPU
Memory
Database connection pool
External API limits
Network latency
Number of consumers
Message size
```

A practical approach:

``` text
Choose a controlled starting value
        |
        v
Measure throughput and latency
        |
        v
Observe CPU / Memory / DB / APIs
        |
        v
Tune Prefetch
```

## Consumer Crash

Suppose:

``` text
Prefetch = 3
```

and three messages are unacknowledged when the consumer crashes.

When the channel/connection closes, RabbitMQ requeues outstanding
unacknowledged deliveries so they can be redelivered.

``` text
Consumer
   |
   X Crash
   |
   v
Unacked Deliveries
   |
   v
Requeued
   |
   v
Redelivery
```

Consumers should therefore be designed to handle duplicate/redelivered
messages safely, often using idempotency.

## amqplib Example

``` ts
const channel = await connection.createChannel();

await channel.prefetch(5);

await channel.consume(
  'orders.queue',
  async (msg) => {
    if (!msg) return;

    try {
      await processOrder(msg);
      channel.ack(msg);
    } catch (error) {
      channel.nack(msg, false, false);
    }
  },
  { noAck: false },
);
```

Conceptually:

``` text
prefetch(5)
   |
   v
Controlled outstanding deliveries
   |
   v
processOrder()
   |
   +--> Success -> ACK
   |
   +--> Failure -> NACK
```

## Practice Lab

For a worker:

``` bash
CONSUMERS=on
WORKER_NAME=W1
WORKER_DELAY=1000
PREFETCH=5
```

experiment with:

``` text
PREFETCH=1
PREFETCH=2
PREFETCH=5
PREFETCH=10
PREFETCH=0
```

Observe in RabbitMQ Management:

``` text
Ready Messages
Unacked Messages
Processing Rate
Message Distribution
```

## Prefetch Count and global

Some AMQP clients expose:

``` ts
channel.prefetch(count, global);
```

The second parameter relates to the QoS scope. RabbitMQ's prefetch
behavior has RabbitMQ-specific semantics around consumer-level and
channel-level limits.

A common RabbitMQ application pattern is:

``` ts
channel.prefetch(count);
```

Use `global=true` only when you specifically need its scope and
understand the behavior for your RabbitMQ/client version.

## Prefetch vs Rate Limiting

``` text
Prefetch
-> Limits outstanding unacknowledged deliveries.

Rate Limiting
-> Limits operations per unit of time.
```

Therefore:

``` text
Prefetch = 10
```

does not mean:

``` text
10 messages per second
```

## Prefetch vs Queue Max Length

``` text
Prefetch
-> Limits outstanding deliveries.

x-max-length
-> Limits queue length.
```

They solve different problems.

## Too High vs Too Low

Very high prefetch can cause:

``` text
High memory usage
Poor work distribution
Too much outstanding work
Downstream pressure
More work to recover after consumer failure
```

Very low prefetch can underutilize a consumer that is capable of safely
processing more work.

``` text
Too High -> Can overload or hoard work
Too Low  -> Can underutilize capacity
Good Value -> Depends on workload and measurements
```

## Final Mental Model

``` text
RabbitMQ Queue
      |
      v
Prefetch Limit
      |
      v
Consumer
  /       \
 v         v
API       Database
  \       /
   v     v
 Processing
      |
 +----+----+
 |         |
ACK      NACK
 |
 v
Capacity becomes available
 |
 v
RabbitMQ can deliver more
```

## Final Summary

``` text
Consumer Prefetch
-> Controls outstanding unacknowledged deliveries.

Prefetch = 1
-> One outstanding unacked delivery under that limit.

Prefetch = 10
-> Up to ten outstanding unacked deliveries
   according to the effective QoS scope.

Prefetch = 0
-> No prefetch limit from that setting.

ACK
-> Frees acknowledgement capacity.

Prefetch != Concurrency
Prefetch != Rate Limit
Prefetch != Queue Length
```

The simplest mental model:

``` text
Prefetch = 5

RabbitMQ:
"I can allow up to 5 unacknowledged deliveries."

Consumer:
"When I ACK one, capacity becomes available for another."
```
