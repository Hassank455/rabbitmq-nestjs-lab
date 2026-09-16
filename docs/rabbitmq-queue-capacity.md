# 013 - RabbitMQ - Queue Capacity

## Overview

RabbitMQ allows us to limit how much data a queue can hold.

One of the most common queue arguments is:

``` text
x-max-length
```

It limits the maximum number of **ready messages** that can be stored in
a queue.

For example:

``` text
Queue: max-q
x-max-length = 3
```

Conceptually:

``` text
max-q

[ Message 1 ]
[ Message 2 ]
[ Message 3 ]

Maximum Length = 3
```

When another message arrives while the queue is already at its limit,
RabbitMQ must apply an **overflow behavior**.

------------------------------------------------------------------------

## Why Limit Queue Capacity?

Without a limit, a slow or unavailable consumer can allow messages to
accumulate for a long time.

``` text
Publisher
   |
   v
RabbitMQ Queue
   |
   +--> Message 1
   +--> Message 2
   +--> Message 3
   +--> Message 4
   +--> ...
   +--> Message 100000
```

This can increase:

``` text
Memory usage
Disk usage
Queue latency
Recovery time
Operational risk
```

Queue limits provide a safety boundary.

------------------------------------------------------------------------

# x-max-length

`x-max-length` defines the maximum number of ready messages allowed in
the queue.

Example:

``` text
x-max-length = 3
```

When:

``` text
count < max
```

RabbitMQ accepts messages normally.

``` text
Publisher
    |
    v
RabbitMQ
    |
    v
max-q

[ M1 ]
[ M2 ]

count = 2
max   = 3
```

Another message can be accepted:

``` text
[ M1 ]
[ M2 ]
[ M3 ]
```

Now:

``` text
count = max = 3
```

The queue has reached its configured capacity.

------------------------------------------------------------------------

# What Happens When the Queue Is Full?

RabbitMQ uses an **overflow strategy**.

Two important behaviors are:

``` text
drop-head
reject-publish
```

There is also:

``` text
reject-publish-dlx
```

which is useful when dead-lettering is configured.

------------------------------------------------------------------------

# 1. Default Overflow: drop-head

The default behavior for a classic queue with a maximum length is
conceptually:

``` text
drop-head
```

Suppose:

``` text
x-max-length = 3
```

Current queue:

``` text
HEAD                      TAIL
 |                          |
 v                          v

[ M1 ] [ M2 ] [ M3 ]
```

Now the publisher sends:

``` text
M4
```

Because the queue is full, RabbitMQ removes messages from the head as
needed to make room.

Conceptually:

``` text
Before:

[ M1 ] [ M2 ] [ M3 ]

New message:

M4
```

RabbitMQ removes the oldest message:

``` text
M1 -> removed
```

Then stores M4:

``` text
[ M2 ] [ M3 ] [ M4 ]
```

So the mental model is:

``` text
Queue Full
   |
   v
New Message Arrives
   |
   v
Remove Oldest Message(s)
   |
   v
Store New Message
```

This matches the idea shown in the first diagram:

``` text
count = max

Publisher
   |
 Publish
   v
RabbitMQ
   |
   v
Delete Oldest
```

------------------------------------------------------------------------

# Important: The Publisher May Not Know

With the default `drop-head` behavior, the incoming message can still be
accepted while an older message is removed.

Therefore:

``` text
Publisher successfully publishes M4
```

does not mean:

``` text
Every older message is still waiting in the queue.
```

This matters when losing old messages is unacceptable.

------------------------------------------------------------------------

# 2. Overflow: reject-publish

Instead of deleting old messages, RabbitMQ can reject new publications
when the queue has reached its limit.

Configure:

``` text
x-overflow = reject-publish
```

Suppose:

``` text
x-max-length = 3
x-overflow   = reject-publish
```

Queue:

``` text
[ M1 ] [ M2 ] [ M3 ]
```

Publisher sends:

``` text
M4
```

RabbitMQ does not make room by deleting M1.

Conceptually:

``` text
[ M1 ] [ M2 ] [ M3 ]

M4
 |
 v

REJECTED
```

The existing messages remain:

``` text
[ M1 ] [ M2 ] [ M3 ]
```

This corresponds to the second diagram:

``` text
count = max

Publisher
   |
 Publish
   v
RabbitMQ
   |
   +----> Publication rejected
```

With **Publisher Confirms**, the publisher can receive a negative
acknowledgement when the publication is rejected due to the queue
overflow behavior.

------------------------------------------------------------------------

# drop-head vs reject-publish

``` text
drop-head

Queue:
[M1] [M2] [M3]

Publish M4

        |
        v

Remove M1

        |
        v

[M2] [M3] [M4]
```

Compared with:

``` text
reject-publish

Queue:
[M1] [M2] [M3]

Publish M4

        |
        v

Reject M4

Queue remains:

[M1] [M2] [M3]
```

Quick comparison:

  Behavior           Old Messages               New Message
  ------------------ -------------------------- -------------
  `drop-head`        Oldest removed as needed   Accepted
  `reject-publish`   Kept                       Rejected

------------------------------------------------------------------------

# 3. reject-publish-dlx

RabbitMQ also supports:

``` text
reject-publish-dlx
```

This combines rejecting publications because of overflow with
dead-lettering behavior when a Dead Letter Exchange is configured.

Conceptually:

``` text
Publisher
   |
   | M4
   v
Main Queue (FULL)
   |
   | reject
   v
Dead Letter Exchange
   |
   v
Dead Letter Queue
```

This can be useful when you do not want overflowed messages to simply
disappear.

------------------------------------------------------------------------

# Queue Capacity + Dead Letter Exchange

Queue length limits can work with the Dead Letter Exchange mechanism.

Example:

``` text
Main Queue
x-max-length = 3

Dead Letter Exchange:
orders.dlx
```

Queue initially:

``` text
[M1] [M2] [M3]
```

With a dead-letter configuration and an applicable overflow/dead-letter
behavior, messages removed or rejected due to queue capacity can be
routed through the configured DLX according to RabbitMQ's rules.

Conceptually:

``` text
Main Queue
   |
   | Dead-lettered message
   v
DLX
   |
   v
Overflow / Dead Letter Queue
```

This is useful for:

``` text
Investigation
Auditing
Recovery workflows
Monitoring unexpected backlog
```

------------------------------------------------------------------------

# x-max-length vs x-max-length-bytes

RabbitMQ can limit queues in two common ways.

## Maximum number of messages

``` text
x-max-length
```

Example:

``` text
x-max-length = 1000
```

Meaning:

``` text
Maximum ready messages = 1000
```

## Maximum size in bytes

``` text
x-max-length-bytes
```

Example:

``` text
x-max-length-bytes = 10485760
```

Approximately:

``` text
10 MB
```

This limits the queue based on message-body size rather than just
message count.

------------------------------------------------------------------------

# Why x-max-length-bytes Can Matter

Consider two queues:

``` text
Queue A:
1000 messages
Each message = 1 KB

Queue B:
1000 messages
Each message = 5 MB
```

Both have:

``` text
Message Count = 1000
```

But their storage requirements are dramatically different.

Therefore, depending on the workload, you may care about both:

``` text
Message Count
+
Message Size
```

------------------------------------------------------------------------

# Ready vs Unacked Messages

This is important when learning queue capacity.

Suppose:

``` text
x-max-length = 3
```

and the queue shows:

``` text
Ready   = 3
Unacked = 5
```

Do not assume:

``` text
Total queue capacity = Ready + Unacked = 8
```

The maximum-length behavior is primarily concerned with messages ready
in the queue; messages already delivered to consumers and waiting for
acknowledgement are tracked separately.

Mental model:

``` text
Queue

Ready:
[M1] [M2] [M3]

-----------------

Consumer

Unacked:
[M4] [M5]
```

This is another reason `x-max-length` and Consumer Prefetch solve
different problems.

------------------------------------------------------------------------

# Queue Capacity vs Consumer Prefetch

We previously learned:

``` text
Consumer Prefetch
```

controls outstanding unacknowledged deliveries.

Queue capacity controls how many messages the queue can retain under its
configured limit.

``` text
x-max-length
        |
        v
Queue Storage / Ready Messages
```

while:

``` text
prefetch
    |
    v
Outstanding Unacked Deliveries
```

They solve different problems.

Example:

``` text
x-max-length = 1000
prefetch     = 10
```

Conceptually:

``` text
RabbitMQ Queue
(up to configured capacity)
        |
        | up to effective prefetch
        v
Consumer
        |
        v
Processing
        |
        v
ACK
```

------------------------------------------------------------------------

# Queue Capacity vs Message TTL

These are also different.

``` text
x-max-length
```

limits:

``` text
How many messages can remain ready in the queue
```

while:

``` text
x-message-ttl
```

limits:

``` text
How long a message can remain eligible in the queue
```

Example:

``` text
x-max-length = 1000
x-message-ttl = 60000
```

Meaning conceptually:

``` text
Maximum ready messages = 1000
Message TTL            = 60 seconds
```

So a message can leave because:

``` text
Queue capacity behavior
```

or:

``` text
Message expiration
```

depending on what happens first.

------------------------------------------------------------------------

# amqplib Example --- Default Overflow

``` ts
await channel.assertQueue('max-q', {
  durable: true,
  arguments: {
    'x-max-length': 3,
  },
});
```

Conceptually:

``` text
Maximum ready messages = 3
Overflow = default behavior
```

------------------------------------------------------------------------

# amqplib Example --- reject-publish

``` ts
await channel.assertQueue('max-q', {
  durable: true,
  arguments: {
    'x-max-length': 3,
    'x-overflow': 'reject-publish',
  },
});
```

Now:

``` text
Queue Full
    |
    v
New Publication
    |
    v
Reject Publication
```

------------------------------------------------------------------------

# Example with DLX

``` ts
await channel.assertExchange('orders.dlx', 'direct', {
  durable: true,
});

await channel.assertQueue('orders.queue', {
  durable: true,
  arguments: {
    'x-max-length': 1000,
    'x-overflow': 'reject-publish-dlx',
    'x-dead-letter-exchange': 'orders.dlx',
  },
});
```

You would also create/bind the destination queue according to your
routing design.

Conceptually:

``` text
Publisher
   |
   v
orders.queue
   |
   | Capacity / dead-letter behavior
   v
orders.dlx
   |
   v
Dead Letter Queue
```

------------------------------------------------------------------------

# Example: Orders System

Imagine an order-processing worker.

``` text
API
 |
 v
Publisher
 |
 v
orders.exchange
 |
 v
orders.queue
 |
 v
Order Worker
```

Normally:

``` text
Publish Rate ~= Processing Rate
```

But suppose the database becomes slow:

``` text
Publish Rate = 500 msg/s
Consumer Rate = 50 msg/s
```

Then:

``` text
Queue Backlog
     |
     v
Grows
     |
     v
Grows
     |
     v
Grows
```

A configured queue capacity provides a boundary:

``` text
x-max-length = 10000
```

When that limit is reached, the configured overflow strategy determines
what happens next.

This does **not** fix the slow consumer. It only defines how RabbitMQ
handles the capacity boundary.

------------------------------------------------------------------------

# Important Design Question

Before choosing an overflow strategy, ask:

``` text
Which is worse?

Losing old messages?

or

Rejecting new messages?
```

For some workloads:

``` text
Latest data is most important
```

so dropping older data may be acceptable.

For other workloads:

``` text
Every command/order/payment event matters
```

so silently discarding older work may be unacceptable.

In those cases you usually need stronger reliability design involving
mechanisms such as:

``` text
Publisher Confirms
Dead Lettering
Monitoring
Retries
Idempotency
Backpressure
Appropriate queue sizing
```

------------------------------------------------------------------------

# Queue Capacity Is Not Rate Limiting

If:

``` text
x-max-length = 1000
```

this does NOT mean:

``` text
1000 messages per second
```

It means:

``` text
Queue capacity limit = 1000 ready messages
```

Rate limiting is a different concept.

------------------------------------------------------------------------

# Queue Capacity Is Not Prefetch

Similarly:

``` text
x-max-length = 1000
```

does NOT mean:

``` text
Consumer receives 1000 messages at once
```

Consumer delivery pressure is controlled separately, for example with:

``` text
prefetch
```

------------------------------------------------------------------------

# Practical Mental Model

Think of a parking lot.

``` text
Queue = Parking Lot
Messages = Cars
x-max-length = Number of Parking Spaces
```

Example:

``` text
Parking spaces = 3

[Car 1] [Car 2] [Car 3]
```

A fourth car arrives.

With:

``` text
drop-head
```

conceptually:

``` text
Oldest car leaves
New car enters
```

With:

``` text
reject-publish
```

conceptually:

``` text
Parking lot stays full
New car cannot enter
```

------------------------------------------------------------------------

# Final Flow

``` text
Publisher
    |
    v
Exchange
    |
    v
Queue
    |
    +--> count < max
    |        |
    |        v
    |     Accept
    |
    +--> count reaches capacity
             |
             v
       Overflow Strategy
          /       \
         v         v
    drop-head   reject-publish
       |             |
       v             v
 Remove oldest   Reject new
 as needed       publication
```

------------------------------------------------------------------------

# Final Summary

``` text
Queue Capacity
-> Limits how much data a queue retains.

x-max-length
-> Maximum number of ready messages.

x-max-length-bytes
-> Maximum queue size based on message-body bytes.

Default overflow behavior
-> drop-head

drop-head
-> Remove messages from the head as needed
-> Make room for newer messages.

reject-publish
-> Keep existing queued messages.
-> Reject new publications when capacity is reached.

reject-publish-dlx
-> Reject publication and support dead-letter routing
   when DLX is configured.

Queue Capacity != Prefetch
Queue Capacity != Message TTL
Queue Capacity != Rate Limit
```

The simplest mental model is:

``` text
x-max-length = 3

Queue:
[M1] [M2] [M3]

If M4 arrives:

drop-head:
[M2] [M3] [M4]

reject-publish:
[M1] [M2] [M3]
M4 -> rejected
```
