# RabbitMQ Consumer Acknowledgements

## Overview

A **Consumer Acknowledgement** tells RabbitMQ what happened after a
message was delivered to a consumer.

The key question is:

``` text
When can RabbitMQ consider this delivery successfully processed?
```

There are two main acknowledgement modes:

``` text
1. Automatic Acknowledgement
2. Manual Acknowledgement
```

With manual acknowledgement, the consumer can send:

``` text
ACK
NACK
Reject
```

------------------------------------------------------------------------

# 1. Automatic Acknowledgement

With automatic acknowledgement (`noAck = true` / `autoAck` depending on
the client), RabbitMQ considers the message successfully delivered as
soon as it sends it to the consumer.

``` text
Queue
  |
  | Deliver
  v
Consumer

RabbitMQ:
"Delivery sent -> no acknowledgement is required."
```

Example:

``` text
Queue
  |
  | Message #15
  v
Consumer
  |
  X Application crashes before finishing
```

Because automatic acknowledgement was enabled, RabbitMQ does not wait
for confirmation from the application.

This creates a risk:

``` text
Message delivered
      |
      v
RabbitMQ considers delivery complete
      |
      v
Consumer crashes
      |
      v
Work may be lost
```

### When is Auto Ack useful?

It can be appropriate when:

-   Message loss is acceptable.
-   Processing is extremely simple.
-   Maximum throughput is more important than delivery reliability.

For important business operations, manual acknowledgements are usually
safer.

------------------------------------------------------------------------

# 2. Manual Positive Acknowledgement (ACK)

With manual acknowledgement, RabbitMQ delivers the message but waits for
the consumer to explicitly acknowledge successful processing.

``` text
Queue
  |
  | Deliver
  v
Consumer
  |
  | Process message
  |
  | Success
  v
ACK
  |
  v
RabbitMQ considers the delivery successfully processed
```

Example:

``` text
Order Queue
    |
    v
Order Consumer
    |
    | Validate order
    | Save to database
    | Create transaction
    |
    v
Success
    |
    v
ACK
```

Mental model:

``` text
ACK
=
"I successfully processed this delivery."
```

------------------------------------------------------------------------

# 3. Unacknowledged Messages

When using manual acknowledgements, a delivered message remains
**unacknowledged** until RabbitMQ receives an ACK, NACK, Reject, or the
delivery is otherwise recovered because the channel/connection closes.

Conceptually:

``` text
Ready
  |
  | Deliver
  v
Unacked
  |
  | ACK
  v
Completed
```

In RabbitMQ Management UI you may see states such as:

``` text
Ready
Unacked
Total
```

Example:

``` text
Queue contains 10 messages

Consumer receives 3 messages

Ready  = 7
Unacked = 3
Total  = 10
```

The three unacked messages are currently outstanding deliveries to
consumers.

------------------------------------------------------------------------

# 4. What If the Consumer Crashes Before ACK?

Suppose:

``` text
Queue
  |
  v
Consumer
  |
  | Processing...
  X Crash
```

No ACK was sent.

When RabbitMQ detects that the consumer's channel or connection has
closed, outstanding unacknowledged deliveries are automatically requeued
and can be delivered again.

``` text
Consumer A
    |
    | receives Message #20
    v
Processing
    |
    X Crash
    |
    | No ACK
    v
RabbitMQ requeues/re-delivers
    |
    v
Consumer B
```

This is one of the major benefits of manual acknowledgements.

------------------------------------------------------------------------

# 5. Redelivery

Because an unacknowledged delivery can be delivered again, consumers
must be prepared for **redelivery**.

Example:

``` text
Consumer
   |
   | Save payment
   |
   X Crash before ACK
```

The database operation might already have succeeded.

RabbitMQ did not receive the ACK, so the message may be delivered again:

``` text
Same Message
    |
    v
Consumer
    |
    v
Save payment AGAIN?
```

This is why reliable consumers should usually be **idempotent**.

Mental model:

``` text
Manual ACK improves reliability
but
does not guarantee exactly-once processing.
```

A common delivery model is:

``` text
At-least-once delivery
```

Therefore:

``` text
Consumer should safely handle duplicate deliveries.
```

------------------------------------------------------------------------

# 6. Negative Acknowledgement (NACK)

A consumer can tell RabbitMQ that processing failed using a negative
acknowledgement.

Conceptually:

``` text
Queue
  |
  v
Consumer
  |
  | Processing failed
  v
NACK
```

But NACK requires an important decision:

``` text
requeue = true
```

or:

``` text
requeue = false
```

------------------------------------------------------------------------

# 7. NACK with requeue=true

Example:

``` text
NACK
requeue = true
```

means:

``` text
"I failed to process this delivery.
Make it available for delivery again."
```

Flow:

``` text
Queue
  |
  v
Consumer
  |
  X Failure
  |
  | NACK
  | requeue=true
  v
Queue
  |
  v
Consumer again
```

This can be useful for temporary failures.

Example:

``` text
External API temporarily unavailable
Database temporarily unavailable
Short transient network problem
```

However, blindly using `requeue=true` can create a retry loop:

``` text
Consume
   |
   v
Fail
   |
   v
NACK + requeue=true
   |
   v
Consume
   |
   v
Fail
   |
   v
NACK + requeue=true
   |
   v
...
```

This can consume CPU and broker resources without solving the underlying
problem.

For controlled retries, a Retry Queue + TTL + DLX strategy is often
better.

------------------------------------------------------------------------

# 8. NACK with requeue=false

Example:

``` text
NACK
requeue = false
```

means:

``` text
"I failed to process this delivery,
and do not put it back into the original queue."
```

If a Dead Letter Exchange is configured:

``` text
Consumer
   |
   | Failure
   v
NACK
requeue=false
   |
   v
Dead Letter Exchange
   |
   v
Dead Letter Queue
```

This connects Consumer Acknowledgements with the **Dead Lettering**
concepts.

Example:

``` text
orders.queue
   |
   v
Order Consumer
   |
   X Invalid message
   |
   | NACK
   | requeue=false
   v
orders.dlx
   |
   v
orders.dlq
```

If no DLX is configured, a rejected/nacked message with `requeue=false`
is discarded.

------------------------------------------------------------------------

# 9. ACK vs NACK

The simplest comparison:

``` text
ACK
-> Processing succeeded.

NACK
-> Processing failed.
```

Then NACK has another decision:

``` text
NACK + requeue=true
-> Try delivering it again.

NACK + requeue=false
-> Do not return it to the original queue.
   Dead-letter it if a DLX is configured.
```

------------------------------------------------------------------------

# 10. Reject

RabbitMQ also supports:

``` text
basic.reject
```

Conceptually it is similar to negatively acknowledging one message.

``` text
Reject
  |
  +-- requeue=true
  |
  +-- requeue=false
```

The important difference from `basic.nack` is that `basic.nack` supports
acknowledging/rejecting multiple outstanding deliveries using the
`multiple` option, while `basic.reject` operates on a single delivery.

Mental model:

``` text
ACK
-> Success

NACK
-> Failure, supports multiple deliveries

Reject
-> Failure for one delivery
```

------------------------------------------------------------------------

# 11. The multiple Flag

RabbitMQ acknowledgements use delivery tags.

Example:

``` text
Delivery Tag 1
Delivery Tag 2
Delivery Tag 3
Delivery Tag 4
Delivery Tag 5
```

Normally:

``` text
ACK tag=5, multiple=false
```

acknowledges only delivery tag 5.

But:

``` text
ACK tag=5, multiple=true
```

acknowledges all outstanding deliveries on that channel up to and
including tag 5.

Conceptually:

``` text
1  ACK
2  ACK
3  ACK
4  ACK
5  ACK
```

This can reduce acknowledgement overhead when processing batches.

The same general multiple concept is available with `basic.nack`.

------------------------------------------------------------------------

# 12. Delivery Tags

Each delivery on a channel receives a:

``` text
deliveryTag
```

Example:

``` text
Message A -> deliveryTag = 1
Message B -> deliveryTag = 2
Message C -> deliveryTag = 3
```

The consumer uses this tag when acknowledging the delivery.

Conceptually:

``` text
Consumer receives:
Message + deliveryTag

Consumer processes message

Consumer:
ACK(deliveryTag)
```

Delivery tags are scoped to their channel.

Therefore, a delivery must be acknowledged on the same channel where it
was delivered.

------------------------------------------------------------------------

# 13. Consumer ACK vs Publisher Confirm

This distinction is extremely important.

## Publisher Confirm

Communication:

``` text
Publisher <-> RabbitMQ
```

Question:

``` text
Did RabbitMQ confirm my publish?
```

Conceptually:

``` text
Publisher
   |
   | Publish
   v
RabbitMQ
   |
   | Publisher Confirm
   v
Publisher
```

## Consumer Acknowledgement

Communication:

``` text
Consumer <-> RabbitMQ
```

Question:

``` text
Was this delivery successfully processed by the consumer?
```

Conceptually:

``` text
RabbitMQ
   |
   | Deliver
   v
Consumer
   |
   | ACK / NACK
   v
RabbitMQ
```

Therefore:

``` text
Publisher Confirm
!=
Consumer ACK
```

Complete picture:

``` text
Publisher
   |
   | Publish
   v
RabbitMQ
   |
   | Publisher Confirm
   v
Publisher


RabbitMQ
   |
   | Deliver
   v
Consumer
   |
   | Consumer ACK
   v
RabbitMQ
```

------------------------------------------------------------------------

# 14. Consumer ACK + DLX

Suppose:

``` text
orders.queue
```

has:

``` text
x-dead-letter-exchange = orders.dlx
```

The consumer receives an invalid order.

``` text
orders.queue
     |
     v
Consumer
     |
     | Validation fails
     v
NACK
requeue=false
     |
     v
orders.dlx
     |
     v
orders.dlq
```

Now the failed message is preserved for:

``` text
Investigation
Monitoring
Manual recovery
Controlled retry
```

------------------------------------------------------------------------

# 15. Consumer ACK + Retry Queue

For temporary failures, immediately requeueing can create a hot loop.

Instead:

``` text
Main Queue
    |
    v
Consumer
    |
    X Temporary Failure
    |
    v
Retry Queue
    |
    | TTL = 30 seconds
    v
DLX
    |
    v
Main Queue
```

This gives:

``` text
Fail
  |
  v
Wait
  |
  v
Retry
```

rather than:

``` text
Fail -> Requeue -> Fail -> Requeue -> Fail...
```

A production retry strategy should also have a maximum retry count so
poison messages do not retry forever.

------------------------------------------------------------------------

# 16. Consumer ACK and Prefetch

Manual acknowledgements work closely with **Prefetch**.

Suppose:

``` text
prefetch = 3
```

RabbitMQ can have up to three unacknowledged deliveries outstanding for
that consumer/channel according to the configured QoS scope.

Example:

``` text
RabbitMQ
   |
   +--> Message 1 -> Consumer
   +--> Message 2 -> Consumer
   +--> Message 3 -> Consumer

Unacked = 3
```

RabbitMQ waits for acknowledgements before sending more deliveries when
the prefetch limit is reached.

After:

``` text
ACK Message 1
```

another message can be delivered:

``` text
Message 4
```

Conceptually:

``` text
Prefetch
-> Controls how many unacknowledged deliveries RabbitMQ allows in flight.
```

This helps with:

``` text
Backpressure
Fair dispatch
Memory control
Consumer workload control
```

------------------------------------------------------------------------

# 17. Example: Order Processing

Suppose the consumer receives:

``` json
{
  "orderId": 1001,
  "customerId": 82,
  "total": 120
}
```

### Successful processing

``` text
Receive Message
      |
      v
Validate
      |
      v
Save Order
      |
      v
Process Business Logic
      |
      v
Success
      |
      v
ACK
```

### Permanent failure

``` text
Receive Message
      |
      v
Validate
      |
      X Invalid Data
      |
      v
NACK
requeue=false
      |
      v
DLX
      |
      v
DLQ
```

### Temporary failure

``` text
Receive Message
      |
      v
Call External Service
      |
      X Service unavailable
      |
      v
Controlled Retry Strategy
```

The exact retry implementation depends on the application's reliability
requirements.

------------------------------------------------------------------------

# 18. Common Mistake: ACK Before Processing

Avoid this:

``` text
Receive Message
      |
      v
ACK
      |
      v
Process Business Logic
      |
      X Crash
```

RabbitMQ already received the ACK.

From the broker's perspective, that delivery was successfully processed.

A safer pattern is:

``` text
Receive Message
      |
      v
Process Business Logic
      |
      v
Success
      |
      v
ACK
```

Mental model:

``` text
ACK after successful processing,
not before it.
```

------------------------------------------------------------------------

# 19. Common Mistake: Infinite Requeue

Avoid blindly doing:

``` text
catch (error) {
    NACK(requeue=true)
}
```

for every error.

A poison message can create:

``` text
Message
  |
  v
Fail
  |
  v
Requeue
  |
  v
Fail
  |
  v
Requeue
  |
  v
...
```

A better design distinguishes:

``` text
Temporary Error
-> Controlled Retry

Permanent Error
-> DLQ
```

------------------------------------------------------------------------

# 20. Reliability Mental Model

A useful production flow is:

``` text
Publisher
   |
   | Publish
   v
Exchange
   |
   v
Queue
   |
   v
Consumer
   |
   +------------------------+
   |                        |
Success                  Failure
   |                        |
   v                        v
 ACK                  Retry decision
                            |
                    +-------+-------+
                    |               |
               Temporary        Permanent
                    |               |
                    v               v
               Retry Queue      NACK/Reject
                                  requeue=false
                                      |
                                      v
                                     DLX
                                      |
                                      v
                                     DLQ
```

------------------------------------------------------------------------

# Final Summary

``` text
Automatic ACK
-> RabbitMQ does not wait for an acknowledgement from the consumer.

Manual ACK
-> Consumer explicitly confirms successful processing.

ACK
-> Success.

NACK
-> Processing failed.

NACK + requeue=true
-> Make the delivery available again.

NACK + requeue=false
-> Do not return it to the original queue.
   Dead-letter it if DLX exists.

Reject
-> Negative acknowledgement for one delivery.

Unacked
-> Delivered but not yet acknowledged.

Redelivery
-> An unacknowledged/requeued message can be delivered again.

Prefetch
-> Limits outstanding unacknowledged deliveries.

Publisher Confirm
!=
Consumer Acknowledgement.
```

The simplest mental model:

``` text
RabbitMQ -> Consumer:
"Here is a message."

Consumer -> RabbitMQ:

ACK
= "I processed it successfully."

NACK + requeue=true
= "I failed. Make it available again."

NACK + requeue=false
= "I failed. Do not put it back in the original queue."
```

And for reliable processing:

``` text
Receive
   |
   v
Process
   |
   +------ Success ------> ACK
   |
   +------ Temporary ----> Controlled Retry
   |
   +------ Permanent ----> NACK/Reject -> DLX -> DLQ
```
