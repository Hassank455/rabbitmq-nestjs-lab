# RabbitMQ Alternate Exchange

## Overview

An **Alternate Exchange (AE)** is a fallback exchange that receives
messages when another exchange cannot route them to any queue or
exchange.

The main idea is:

``` text
Producer
   |
   | Publish
   v
Main Exchange
   |
   | Try to route
   X No matching destination
   |
   v
Alternate Exchange
   |
   v
Alternate Queue
   |
   v
Consumer
```

The Alternate Exchange helps prevent **unroutable messages** from being
silently lost.

------------------------------------------------------------------------

# 1. What Is an Unroutable Message?

An **unroutable message** is a message that successfully reaches an
exchange, but the exchange cannot find a matching destination according
to its routing rules.

Example:

``` text
Exchange: booking.exchange
Type: direct
```

Bindings:

``` text
booking.confirmed -> confirmed.queue
booking.cancelled -> cancelled.queue
```

The producer publishes:

``` text
routing_key = booking.failed
```

There is no binding for:

``` text
booking.failed
```

Therefore:

``` text
Producer
   |
   | booking.failed
   v
booking.exchange
   |
   X No matching binding
```

The message reached the exchange successfully, but the exchange could
not route it.

------------------------------------------------------------------------

# 2. Alternate Exchange

We can configure the main exchange with an Alternate Exchange.

Example:

``` text
Main Exchange:
booking.exchange

Argument:
alternate-exchange = booking.unrouted.exchange
```

Now the flow becomes:

``` text
Producer
   |
   | booking.failed
   v
booking.exchange
   |
   X No matching destination
   |
   v
booking.unrouted.exchange
   |
   v
booking.unrouted.queue
```

Instead of leaving the message unroutable at the main exchange, RabbitMQ
sends it to the configured Alternate Exchange.

------------------------------------------------------------------------

# 3. Configuring an Alternate Exchange

The Alternate Exchange is configured as an argument on the **main
exchange**.

Conceptually:

``` text
alternate-exchange = fallback.exchange
```

Example:

``` text
Exchange:
booking.exchange

Type:
direct

Arguments:
alternate-exchange = booking.ae
```

Architecture:

``` text
                  booking.exchange
                   /           \
                  /             \
       matched message       unroutable message
              |                    |
              v                    v
       booking.queue          booking.ae
                                  |
                                  v
                         booking.unrouted.queue
```

------------------------------------------------------------------------

# 4. Alternate Exchange Is a Normal Exchange

An Alternate Exchange is **not a special RabbitMQ exchange type**.

It is a normal exchange being used as a fallback destination.

For example, an Alternate Exchange can be:

``` text
direct
topic
fanout
headers
```

A common choice is a **Fanout Exchange** when all unroutable messages
should go to a fallback queue.

Example:

``` text
booking.exchange
       |
       X Unroutable
       |
       v
booking.ae
Type: fanout
       |
       v
booking.unrouted.queue
```

Because Fanout ignores the Routing Key, it can conveniently send every
message arriving at the AE to its bound fallback queue(s).

------------------------------------------------------------------------

# 5. Direct Exchange Example

Suppose:

``` text
Exchange:
payment.exchange

Type:
direct
```

Bindings:

``` text
payment.success -> success.queue

payment.failed -> failure.queue
```

Producer publishes:

``` text
routing_key = payment.refunded
```

RabbitMQ checks:

``` text
payment.refunded == payment.success  -> NO
payment.refunded == payment.failed   -> NO
```

Therefore:

``` text
payment.exchange
       |
       X No Match
       |
       v
payment.unrouted.exchange
       |
       v
payment.unrouted.queue
```

The message can now be inspected instead of being ignored as unroutable.

------------------------------------------------------------------------

# 6. Topic Exchange Example

Suppose:

``` text
Exchange:
booking.events

Type:
topic
```

Bindings:

``` text
booking.flight.* -> flight.queue

booking.hotel.* -> hotel.queue
```

Producer sends:

``` text
routing_key = payment.card.failed
```

Neither binding matches.

``` text
booking.flight.*  ❌

booking.hotel.*   ❌
```

Therefore:

``` text
Producer
   |
   | payment.card.failed
   v
booking.events
   |
   X No Match
   |
   v
alternate.exchange
   |
   v
unrouted.queue
```

------------------------------------------------------------------------

# 7. Why Use an Alternate Exchange?

Without an Alternate Exchange:

``` text
Producer
   |
   v
Exchange
   |
   X No Route
```

The application needs another strategy if it wants to detect or recover
the unroutable message.

With an Alternate Exchange:

``` text
Producer
   |
   v
Exchange
   |
   X No Route
   |
   v
Alternate Exchange
   |
   v
Unrouted Queue
```

This gives us a place to:

-   Inspect unexpected Routing Keys
-   Detect incorrect bindings
-   Monitor routing problems
-   Debug producer configuration
-   Preserve unroutable messages
-   Alert when unexpected events appear

------------------------------------------------------------------------

# 8. Alternate Exchange vs Dead Letter Exchange

This distinction is extremely important.

## Alternate Exchange

An Alternate Exchange is used when:

``` text
An Exchange cannot route a newly published message.
```

Flow:

``` text
Producer
   |
   v
Main Exchange
   |
   X No matching destination
   |
   v
Alternate Exchange
   |
   v
Fallback Queue
```

The problem happens during:

``` text
EXCHANGE ROUTING
```

------------------------------------------------------------------------

## Dead Letter Exchange

A Dead Letter Exchange is used when a message was already associated
with a queue and later became dead-lettered.

For example:

``` text
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
   | Failed
   v
NACK(requeue=false)
   |
   v
Dead Letter Exchange
   |
   v
Dead Letter Queue
```

Other dead-lettering conditions can include:

``` text
Message TTL expired

Queue length limit caused removal

Supported delivery limit exceeded
```

The problem happens during:

``` text
QUEUE / MESSAGE LIFECYCLE
```

------------------------------------------------------------------------

# 9. AE vs DLX Mental Model

``` text
Alternate Exchange
-> Message could not ENTER a destination queue.

Dead Letter Exchange
-> Message was associated with a queue,
   but later became dead-lettered.
```

Or:

``` text
AE
Producer -> Exchange -> X -> Alternate Exchange


DLX
Producer -> Exchange -> Queue -> Problem
                              |
                              v
                             DLX
```

------------------------------------------------------------------------

# 10. Alternate Exchange vs Dead Letter Queue

Do not confuse:

``` text
Alternate Exchange
Dead Letter Exchange
Dead Letter Queue
```

They have different responsibilities.

``` text
Alternate Exchange (AE)
-> Handles unroutable messages from an exchange.

Dead Letter Exchange (DLX)
-> Routes messages dead-lettered from queues.

Dead Letter Queue (DLQ)
-> Holds dead-lettered messages.
```

------------------------------------------------------------------------

# 11. Complete Booking Example

Suppose our booking system has:

``` text
Exchange:
booking.exchange

Type:
direct
```

Bindings:

``` text
booking.confirmed -> booking.confirmed.queue

booking.cancelled -> booking.cancelled.queue
```

Configure:

``` text
alternate-exchange = booking.unrouted.exchange
```

The Alternate Exchange:

``` text
booking.unrouted.exchange

Type:
fanout
```

is bound to:

``` text
booking.unrouted.queue
```

Now the producer accidentally publishes:

``` text
routing_key = booking.refund
```

There is no matching binding.

RabbitMQ does:

``` text
Producer
   |
   | booking.refund
   v
booking.exchange
   |
   | Search for matching binding
   X
No Match
   |
   v
booking.unrouted.exchange
   |
   v
booking.unrouted.queue
   |
   v
Monitoring / Recovery Consumer
```

The message is preserved for investigation.

------------------------------------------------------------------------

# 12. Alternate Exchange Can Also Fail to Route

An important point:

The Alternate Exchange still uses normal exchange routing rules.

Therefore, it is possible for the Alternate Exchange itself to have no
matching destination.

Example:

``` text
Main Exchange
     |
     X
     |
     v
Alternate Exchange
     |
     X No matching binding
```

This is why a Fanout Alternate Exchange with a bound fallback queue is
often a simple design when the goal is to capture every unroutable
message.

------------------------------------------------------------------------

# 13. Example Architecture with Both AE and DLX

A production system can use both concepts.

``` text
                         No Route
                            |
                            v
Producer -> Main Exchange ------> Alternate Exchange
                 |
                 | Successfully Routed
                 v
              Main Queue
                 |
                 v
              Consumer
                 |
                 | Processing Failure
                 v
                DLX
                 |
                 v
                DLQ
```

They protect against different failure scenarios.

### Scenario A

``` text
Wrong Routing Key
```

Result:

``` text
Alternate Exchange
```

### Scenario B

``` text
Consumer cannot process message
```

Result:

``` text
Dead Letter Exchange
```

------------------------------------------------------------------------

# 14. Mental Model

When deciding between AE and DLX, ask:

``` text
Did the Exchange fail to find a destination?

YES
-> Alternate Exchange
```

versus:

``` text
Did the message reach a Queue and later become dead-lettered?

YES
-> Dead Letter Exchange
```

------------------------------------------------------------------------

# Final Summary

``` text
Alternate Exchange (AE)
-> Fallback exchange for unroutable messages.

alternate-exchange
-> Exchange argument that defines the fallback exchange.

Unroutable Message
-> Message received by an exchange that cannot be routed
   to a matching destination.

AE
-> Handles Exchange routing failures.

DLX
-> Handles messages dead-lettered from queues.

DLQ
-> Holds dead-lettered messages.
```

The simplest mental model:

``` text
Alternate Exchange
= "I received the message, but I don't know where to route it."

Dead Letter Exchange
= "The message was associated with a queue, but it cannot continue normally."
```

Complete picture:

``` text
                       NO ROUTE
                          |
                          v
Producer -> Exchange ------------> Alternate Exchange
                |
                | ROUTED
                v
              Queue
                |
                v
             Consumer
                |
                | FAILURE / DEAD-LETTER
                v
               DLX
                |
                v
               DLQ
```
