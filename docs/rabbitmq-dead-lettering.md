# RabbitMQ Dead Messages and Dead Lettering

## Overview

A **Dead Message** (dead-lettered message) is a message that can no
longer continue through its normal queue flow because a dead-lettering
condition occurred.

RabbitMQ can republish such a message to a **Dead Letter Exchange
(DLX)**, which can route it to a **Dead Letter Queue (DLQ)**.

``` text
Producer
   |
   v
Main Exchange
   |
   v
Main Queue
   |
   v
Consumer
   |
   | Failure
   v
NACK / Reject
requeue = false
   |
   v
Dead Letter Exchange
   |
   v
Dead Letter Queue
```

------------------------------------------------------------------------

# 1. Dead Message

A message may become dead-lettered when:

-   A consumer rejects or negatively acknowledges it with
    `requeue = false`.
-   Its message TTL expires.
-   A queue length limit causes it to be removed.
-   A supported delivery limit is exceeded.

Example:

``` text
Main Queue
    |
    v
Consumer
    |
    | Processing Failed
    v
NACK(requeue=false)
    |
    v
Dead Letter Exchange
```

------------------------------------------------------------------------

# 2. Dead Letter Exchange (DLX)

A **Dead Letter Exchange** receives messages that are dead-lettered from
another queue.

A DLX is **not a special exchange type**. It is a normal RabbitMQ
exchange used for dead-letter routing.

It may be:

``` text
direct
topic
fanout
headers
```

Example:

``` text
booking.queue
     |
     | Dead Letter
     v
booking.dlx
     |
     v
booking.dead.queue
```

------------------------------------------------------------------------

# 3. Dead Letter Queue (DLQ)

A **Dead Letter Queue** is a normal queue used to hold dead-lettered
messages.

``` text
DLX = Routes dead-lettered messages

DLQ = Holds dead-lettered messages
```

A DLQ is useful for:

-   Investigating failures
-   Monitoring problematic messages
-   Debugging
-   Manual recovery
-   Controlled retries
-   Isolating poison messages

------------------------------------------------------------------------

# 4. x-dead-letter-exchange

A queue can define:

``` text
x-dead-letter-exchange
```

This tells RabbitMQ which exchange should receive messages dead-lettered
from that queue.

Example:

``` text
Queue: booking.queue

x-dead-letter-exchange = booking.dlx
```

Flow:

``` text
booking.queue
     |
     | Dead Letter
     v
booking.dlx
```

The DLX then applies its normal exchange routing rules.

------------------------------------------------------------------------

# 5. x-dead-letter-routing-key

A queue can also define:

``` text
x-dead-letter-routing-key
```

This specifies the Routing Key RabbitMQ should use when republishing the
dead-lettered message to the DLX.

Example:

``` text
x-dead-letter-exchange = booking.dlx
x-dead-letter-routing-key = booking.failed
```

Then:

``` text
booking.queue
     |
     | Dead Letter
     v
booking.dlx
     |
     | routing_key = booking.failed
     v
booking.dead.queue
```

If `booking.dlx` is a Direct Exchange, the DLQ might have:

``` text
binding_key = booking.failed
```

If no custom dead-letter routing key is configured, RabbitMQ normally
uses the message's original routing key(s) when dead-lettering it.

------------------------------------------------------------------------

# 6. ACK

ACK means:

``` text
"I successfully processed this message."
```

Flow:

``` text
Queue
  |
  v
Consumer
  |
  | Success
  v
ACK
  |
  v
Message Removed
```

------------------------------------------------------------------------

# 7. NACK with requeue = true

``` text
NACK(requeue=true)
```

means:

``` text
"I failed to process this message.
Put it back for another delivery attempt."
```

``` text
Queue
  |
  v
Consumer
  |
  | Failure
  v
NACK(requeue=true)
  |
  v
Requeue
```

Be careful: repeatedly requeueing a permanently failing message can
create an infinite redelivery loop.

``` text
Queue -> Consumer -> FAIL -> Requeue
  ^                             |
  |_____________________________|
```

------------------------------------------------------------------------

# 8. NACK with requeue = false

``` text
NACK(requeue=false)
```

means:

``` text
"I cannot process this message.
Do not put it back into this queue."
```

If a DLX is configured:

``` text
Main Queue
    |
    v
Consumer
    |
    | FAIL
    v
NACK(requeue=false)
    |
    v
DLX
    |
    v
DLQ
```

`Reject(requeue=false)` can similarly cause an individual message to be
dead-lettered.

------------------------------------------------------------------------

# 9. Message TTL and Dead Lettering

Suppose:

``` text
x-message-ttl = 60000
```

A message that waits too long can expire.

If the queue has a DLX configured:

``` text
Main Queue
    |
    | TTL Expired
    v
Dead Letter Exchange
    |
    v
Dead Letter Queue
```

This connects directly to the queue concept:

``` text
x-message-ttl
-> How long may a message wait?
```

------------------------------------------------------------------------

# 10. Queue Length and Dead Lettering

Suppose:

``` text
x-max-length = 1000
```

When the queue exceeds its configured maximum length, messages removed
because of the limit can be dead-lettered.

``` text
Queue reaches limit
        |
        v
Message removed
        |
        v
DLX
        |
        v
DLQ
```

The exact behavior can also depend on the queue overflow configuration.

------------------------------------------------------------------------

# 11. Complete Booking Example

Configuration:

``` text
Main Queue:
booking.queue

x-dead-letter-exchange = booking.dlx
x-dead-letter-routing-key = booking.failed
```

DLX:

``` text
booking.dlx
Type: direct
```

DLQ binding:

``` text
booking.dead.queue
binding_key = booking.failed
```

Complete flow:

``` text
Producer
   |
   | BookingConfirmed
   v
booking.exchange
   |
   v
booking.queue
   |
   v
Booking Consumer
   |
   | Processing Failed
   v
NACK(requeue=false)
   |
   v
booking.dlx
   |
   | booking.failed
   v
booking.dead.queue
```

The failed message is now isolated from normal booking processing.

------------------------------------------------------------------------

# 12. Why Use a DLQ?

Consider a permanently invalid message.

Without a controlled failure strategy:

``` text
Queue
  |
  v
Consumer
  |
  | FAIL
  v
Requeue
  |
  v
Consumer
  |
  | FAIL
  v
Requeue
  |
  ...
```

This can create a **poison message loop**.

With a DLQ:

``` text
Main Queue
    |
    v
Consumer
    |
    | Permanent Failure
    v
DLX
    |
    v
DLQ
```

Normal processing can continue while the problematic message is
isolated.

------------------------------------------------------------------------

# 13. DLX vs DLQ

Do not confuse them:

``` text
DLX
-> Exchange responsible for routing dead-lettered messages.

DLQ
-> Queue responsible for holding dead-lettered messages.
```

Mental model:

``` text
DLX = Router
DLQ = Buffer / Storage
```

------------------------------------------------------------------------

# 14. Alternate Exchange vs Dead Letter Exchange

These are different concepts.

## Alternate Exchange

Used when an **Exchange cannot route a newly published message**.

``` text
Producer
   |
   v
Main Exchange
   |
   X No Matching Binding
   |
   v
Alternate Exchange
```

## Dead Letter Exchange

Used when a message associated with a **Queue later becomes
dead-lettered**.

``` text
Main Queue
   |
   | Rejected / Expired / Limit Exceeded
   v
Dead Letter Exchange
```

Mental model:

``` text
Alternate Exchange
-> Exchange routing problem.

Dead Letter Exchange
-> Queue/message lifecycle problem.
```

------------------------------------------------------------------------

# 15. Dead Lettering and Retry

DLX/DLQ concepts can also participate in retry architectures.

Simplified retry flow:

``` text
Main Queue
    |
    v
Consumer
    |
    | Failed
    v
Retry Exchange
    |
    v
Retry Queue
    |
    | TTL
    v
Main Exchange
    |
    v
Main Queue
```

After a bounded number of attempts, a permanently failing message can be
sent to a final DLQ:

``` text
Main Queue
    |
    v
Consumer
    |
    | Repeated Failure
    v
Final DLX
    |
    v
Dead Letter Queue
```

Retry policies should be bounded to avoid infinite retry loops.

------------------------------------------------------------------------

# 16. ACK / NACK Mental Model

``` text
ACK
-> Success. Remove the message.

NACK(requeue=true)
-> Failed. Put it back for redelivery.

NACK(requeue=false)
-> Failed. Do not requeue.
   Dead-letter it when a DLX is configured.
```

------------------------------------------------------------------------

# Final Mental Model

``` text
                 Normal Flow

Producer
   |
   v
Exchange
   |
   v
Main Queue
   |
   v
Consumer
   |
   +-------------------+
   |                   |
Success              Failure
   |                   |
   v                   v
 ACK           NACK(requeue=false)
                       |
                       v
                      DLX
                       |
                       v
                      DLQ
```

Summary:

``` text
Dead Message
-> A message that has been dead-lettered.

DLX
-> Routes dead-lettered messages.

DLQ
-> Holds dead-lettered messages.

x-dead-letter-exchange
-> Defines the destination exchange for dead-lettered messages.

x-dead-letter-routing-key
-> Defines the routing key used when dead-lettering.

ACK
-> Successful processing.

NACK(requeue=true)
-> Failed; retry by requeueing.

NACK(requeue=false)
-> Failed; do not requeue and dead-letter when configured.
```
