# RabbitMQ Message Expiry Time (Message TTL)

## Overview

RabbitMQ supports **Time To Live (TTL)** for messages.

TTL answers:

``` text
How long may a message remain in a queue before it expires?
```

There are two important ways to configure it:

``` text
1. Queue-level message TTL -> x-message-ttl
2. Per-message TTL         -> expiration
```

Expired messages can also be sent to a **Dead Letter Exchange (DLX)**
when dead lettering is configured.

------------------------------------------------------------------------

# 1. Queue-Level Message TTL

A queue can define:

``` text
x-message-ttl
```

The value is in milliseconds.

Example:

``` text
x-message-ttl = 60000
```

means:

``` text
60 seconds
```

All messages in that queue are subject to this TTL.

``` text
Producer
   |
   v
Exchange
   |
   v
time-q
x-message-ttl = 60000
   |
   | waits too long
   v
Expired
```

Mental model:

``` text
x-message-ttl
-> How long may messages remain in this queue?
```

------------------------------------------------------------------------

# 2. Per-Message TTL

A publisher can assign TTL to an individual message using the:

``` text
expiration
```

property.

Example:

``` text
Message A -> expiration = 10000
Message B -> expiration = 30000
Message C -> expiration = 60000
```

Conceptually:

``` text
Message A -> 10 seconds
Message B -> 30 seconds
Message C -> 60 seconds
```

This allows messages in the same queue to have different lifetimes.

Mental model:

``` text
expiration
-> How long may this specific message remain queued?
```

------------------------------------------------------------------------

# 3. x-message-ttl vs expiration

The main difference is **scope**.

``` text
x-message-ttl
-> Queue-level policy applied to messages in that queue.

expiration
-> TTL assigned to one specific published message.
```

Example:

``` text
Queue:
time-q

x-message-ttl = 60000
```

versus:

``` text
Message A -> expiration = 10000
Message B -> expiration = 30000
```

------------------------------------------------------------------------

# 4. What If Both Are Configured?

If both a queue TTL and a per-message TTL apply, the **shorter effective
TTL wins**.

Example:

``` text
Queue TTL   = 60000 ms
Message TTL = 20000 ms

Effective TTL = 20000 ms
```

So the message expires after approximately:

``` text
20 seconds
```

Another example:

``` text
Queue TTL   = 30000 ms
Message TTL = 60000 ms

Effective TTL = 30000 ms
```

Mental model:

``` text
Effective TTL = shortest applicable TTL
```

------------------------------------------------------------------------

# 5. What Happens When a Message Expires?

Suppose:

``` text
x-message-ttl = 30000
```

If the message remains queued long enough to expire:

``` text
Message
   |
   v
Queue
   |
   | TTL expires
   v
Expired
```

If no dead-lettering is configured, RabbitMQ eventually discards the
expired message.

If a DLX is configured, the message can be dead-lettered.

------------------------------------------------------------------------

# 6. Message Expiry + Dead Letter Exchange

Queue configuration:

``` text
Queue:
time-q

x-message-ttl = 30000

x-dead-letter-exchange = expired.exchange
```

Then:

``` text
Producer
   |
   v
Main Exchange
   |
   v
time-q
   |
   | TTL expires
   v
expired.exchange
   |
   v
expired-messages.queue
```

The dead-letter reason is:

``` text
expired
```

This connects Message TTL directly with the Dead Lettering concepts.

------------------------------------------------------------------------

# 7. Example with a Fanout DLX

Suppose:

``` text
Main Exchange:
amq.direct
```

routes messages to:

``` text
time-q
```

The queue has:

``` text
x-message-ttl = 60000
x-dead-letter-exchange = expired.exchange
```

The DLX is:

``` text
expired.exchange
Type: fanout
```

and it is bound to:

``` text
expired-messages.queue
```

Flow:

``` text
Publisher
    |
    v
amq.direct
    |
    v
time-q
    |
    | Wait 60 seconds
    |
    | TTL expires
    v
expired.exchange
    |
    | Fanout
    v
expired-messages.queue
```

------------------------------------------------------------------------

# 8. Practical Example: Verification Notification

Suppose a verification notification is useful for only five minutes.

Configure:

``` text
Queue:
verification.queue

x-message-ttl = 300000
```

because:

``` text
300000 ms = 5 minutes
```

Flow:

``` text
Verification Service
        |
        v
notification.exchange
        |
        v
verification.queue
        |
        | Maximum 5 minutes
        v
Notification Consumer
```

If the message expires and a DLX is configured:

``` text
verification.queue
        |
        | Expired
        v
notification.expired.exchange
        |
        v
notification.expired.queue
```

------------------------------------------------------------------------

# 9. Queue Expiration vs Message Expiration

Do not confuse:

``` text
x-expires
```

with:

``` text
x-message-ttl
```

They control different things.

## x-expires

Controls the lifetime of an **unused queue**.

``` text
Unused Queue
    |
    | x-expires reached
    v
Queue Deleted
```

## x-message-ttl

Controls how long **messages** may remain in a queue.

``` text
Message
   |
   | x-message-ttl reached
   v
Message Expired
```

Mental model:

``` text
x-expires
-> QUEUE lifetime

x-message-ttl
-> MESSAGE lifetime
```

------------------------------------------------------------------------

# 10. TTL Is Not a Consumer Processing Timeout

TTL controls how long a message may remain queued.

It does not mean:

``` text
"The consumer has 30 seconds to finish its business logic."
```

These are separate concerns.

Conceptually:

``` text
Message waiting in Queue
        |
        | TTL applies to queue residence
        v
Delivered to Consumer
```

Application processing timeouts must be handled separately.

------------------------------------------------------------------------

# 11. TTL for Delayed Retries

Message TTL is commonly combined with Dead Letter Exchanges to create
delayed retries.

Example:

``` text
Main Queue
    |
    v
Consumer
    |
    | FAIL
    v
Retry Queue
    |
    | x-message-ttl = 30000
    | Wait 30 seconds
    v
DLX
    |
    v
Main Exchange
    |
    v
Main Queue
```

This gives:

``` text
Fail
  |
  v
Wait 30 seconds
  |
  v
Retry
```

instead of:

``` text
Fail -> Immediate Requeue -> Fail -> Immediate Requeue -> ...
```

which can create a fast retry loop.

------------------------------------------------------------------------

# 12. Retry Example

Suppose:

``` text
retry.queue

x-message-ttl = 30000
x-dead-letter-exchange = booking.exchange
```

Flow:

``` text
booking.queue
     |
     v
Consumer
     |
     | Failed
     v
retry.exchange
     |
     v
retry.queue
     |
     | 30-second TTL
     v
Message Expires
     |
     | Dead-lettered
     v
booking.exchange
     |
     v
booking.queue
     |
     v
Consumer retries processing
```

The Retry Queue acts as a temporary waiting area.

------------------------------------------------------------------------

# 13. Important Notes

TTL values are represented in milliseconds.

``` text
1000   -> 1 second
30000  -> 30 seconds
60000  -> 1 minute
300000 -> 5 minutes
```

Expired messages can be dead-lettered when the queue has a DLX
configured.

Queue-level and per-message TTL can coexist:

``` text
Queue TTL   = 60 seconds
Message TTL = 20 seconds

Effective TTL = 20 seconds
```

And remember:

``` text
x-message-ttl
-> Messages

x-expires
-> Queue
```

------------------------------------------------------------------------

# 14. Mental Model

When configuring message expiration, ask:

``` text
Should all messages in this queue share a TTL?

YES
-> x-message-ttl


Should individual messages have different TTL values?

YES
-> expiration


What should happen after expiration?

Discard?

or

Dead Letter Exchange?


Am I using TTL for:

stale-message cleanup?

or

delayed retry?
```

------------------------------------------------------------------------

# Final Summary

``` text
TTL
-> Time To Live.

x-message-ttl
-> Queue-level TTL for messages.

expiration
-> Per-message TTL.

Both configured
-> Shorter effective TTL wins.

Expired Message
-> Message exceeded its allowed queue lifetime.

Expired + DLX configured
-> Message is dead-lettered.

x-expires
-> Controls unused queue lifetime.

x-message-ttl
-> Controls message lifetime.
```

The simplest mental model:

``` text
x-message-ttl
= "Messages in this queue may wait for X time."

expiration
= "This specific message may wait for X time."
```

With dead lettering:

``` text
Message
   |
   v
Queue
   |
   | TTL expires
   v
DLX
   |
   v
Expired Messages Queue
```
