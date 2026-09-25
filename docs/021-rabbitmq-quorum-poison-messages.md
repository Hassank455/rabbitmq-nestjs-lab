# 021 - RabbitMQ - Quorum Poison Messages

## What is a Poison Message?

A **Poison Message** is a message that repeatedly fails when a consumer
tries to process it.

Example:

``` json
{
  "bookingId": 123,
  "amount": "INVALID"
}
```

If the consumer expects a numeric amount:

``` text
Quorum Queue
     |
     v
Consumer
     |
     X Error
     |
     v
NACK + Requeue
     |
     v
Quorum Queue
```

Without protection, this can become an endless loop.

## Requeue Loop

``` typescript
channel.nack(msg, false, true);
```

The final:

``` text
true
```

means:

``` text
requeue = true
```

Therefore:

``` text
Message -> Consumer -> Error -> Requeue
   ^                              |
   |______________________________|
```

This can waste CPU, network bandwidth and consumer capacity.

## Quorum Poison Message Handling

Quorum Queues provide built-in mechanisms to protect against repeated
failed deliveries.

RabbitMQ can track delivery attempts and expose information such as:

``` text
x-delivery-count
```

A **delivery limit** prevents a poison message from being requeued
forever.

``` text
Attempt 1 -> failed
Attempt 2 -> failed
Attempt 3 -> failed
...
Delivery Limit reached
```

## DL or Drop

The diagram's:

``` text
DL or Drop
```

means that when the applicable delivery limit is exceeded, the message
can be:

``` text
Dead Lettered -> when a DLX is configured
```

or otherwise:

``` text
Dropped
```

Conceptually:

``` text
Poison Message
      |
      v
Delivery Limit
      |
   +--+--+
   |     |
   v     v
  DLX   Drop
```

For important business messages, a DLX is usually preferable because the
failed message can be inspected instead of silently disappearing.

## Example

``` text
booking.queue
     |
     v
Consumer
     |
     X failed
     |
     v
Requeue
     |
    ...
     |
Delivery Limit exceeded
     |
     v
booking.dlx
     |
     v
booking.failed.queue
```

Now the broken message is isolated from normal processing.

## Retry vs Poison Message

Not every failure means a message is poison.

Transient failures:

``` text
Provider timeout
Temporary database outage
Temporary network error
```

may succeed later.

Persistent failures:

``` text
Invalid payload
Missing required data
Unsupported business state
Corrupted message
```

may never succeed without intervention.

A useful model:

``` text
Transient Failure
-> controlled retry

Repeated / Permanent Failure
-> Dead Letter
```

## Consumer Example

``` typescript
await channel.consume(
  'booking.queue',
  async (msg) => {
    if (!msg) return;

    try {
      const event = JSON.parse(msg.content.toString());

      await bookingService.process(event);

      channel.ack(msg);
    } catch (error) {
      channel.nack(msg, false, true);
    }
  },
);
```

`ack()` means processing succeeded.

`nack(..., true)` requests requeueing.

When failures repeat, the Quorum Queue's poison-message protection
becomes important.

## Production Flow

``` text
Main Queue
    |
    v
Consumer
    |
    X
    |
    v
Retry
    |
    v
Delivery Limit
    |
    v
DLX
    |
    v
Dead Letter Queue
```

The DLQ can then be monitored, inspected, repaired, or carefully
replayed.

## Booking Example

``` text
booking.created
      |
      v
booking.queue
      |
      v
Booking Worker
      |
      X invalid provider data
      |
      v
Retries
      |
      v
Delivery Limit
      |
      v
booking.dlx
      |
      v
booking.failed.queue
```

Normal booking messages can continue while the problematic event is
isolated.

## Poison Handling vs Dead Letter Strategy

These concepts are related but different:

``` text
Poison Message Handling
-> when should repeated delivery stop?

DLX
-> where should a dead-lettered message go?

Dead Letter Strategy
-> how reliably should RabbitMQ transfer it?
```

Combined:

``` text
Repeated Failure
      |
      v
Delivery Limit
      |
      v
Dead Letter
      |
      v
DLX
      |
      v
Dead Letter Queue
```

## Important Mental Model

Do not think:

``` text
Every failed message -> immediately DLQ
```

Think:

``` text
Failure
   |
   +-> recoverable?
   |      -> Retry
   |
   +-> repeatedly/permanently failing?
          -> Dead Letter
```

The main idea is:

> **Quorum Queue poison-message handling protects the system from
> messages that repeatedly fail and would otherwise be requeued
> forever.**

RabbitMQ versions have evolved in their delivery-count behavior and
defaults, so exact production settings should be checked against the
deployed RabbitMQ version.
