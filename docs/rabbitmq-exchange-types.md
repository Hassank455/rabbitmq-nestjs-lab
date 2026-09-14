# RabbitMQ Exchange Types

## Overview

An **Exchange** receives messages from producers and decides where those
messages should be routed.

The exchange type defines **how RabbitMQ matches a published message
with the queues bound to the exchange**.

The main exchange types are:

1.  Default Exchange
2.  Direct Exchange
3.  Fanout Exchange
4.  Topic Exchange
5.  Headers Exchange

``` text
Producer
   |
   v
Exchange
   |
   | Routing Rules
   v
Queue(s)
   |
   v
Consumer(s)
```

------------------------------------------------------------------------

# 1. Default Exchange

RabbitMQ has a special built-in **Direct Exchange** called the **Default
Exchange**.

Its name is an empty string:

``` text
""
```

Every queue is automatically bound to the Default Exchange using the
**queue name as the binding key**.

If a producer publishes to the Default Exchange using the queue name as
the Routing Key, RabbitMQ routes the message to that queue.

## Example

``` text
Queue name = email.queue

exchange = ""
routing_key = "email.queue"
```

Flow:

``` text
Producer
   |
   | exchange = ""
   | routing_key = email.queue
   v
Default Exchange
   |
   | queue-name match
   v
email.queue
   |
   v
Email Consumer
```

### Mental Model

``` text
Default Exchange = Route by Queue Name
```

------------------------------------------------------------------------

# 2. Direct Exchange

A **Direct Exchange** routes messages using an **exact match** between
the Routing Key and Binding Key.

``` text
Routing Key == Binding Key
```

## Example

``` text
Exchange: booking.exchange
Type: direct
```

Bindings:

``` text
booking.confirmed → confirmation.queue
booking.cancelled → cancellation.queue
booking.failed    → failure.queue
```

Producer publishes:

``` text
routing_key = booking.confirmed
```

Result:

``` text
booking.exchange
      |
      | booking.confirmed
      |
      +---- booking.confirmed ---> confirmation.queue ✅
      +---- booking.cancelled ---> cancellation.queue
      +---- booking.failed ------> failure.queue
```

Only the binding with the exact matching key receives the message.

## Multiple Queues with the Same Binding Key

Direct Exchange does not necessarily mean one queue only.

``` text
             booking.exchange
                    |
        routing_key = booking.confirmed
                    |
          +---------+---------+
          |                   |
          v                   v
    email.queue      notification.queue
```

If both queues use:

``` text
binding_key = booking.confirmed
```

both queues receive a copy.

### Use Cases

Direct Exchange works well for clearly defined categories:

``` text
payment.success
payment.failed
payment.refunded
```

### Mental Model

``` text
Direct = Exact Match
```

------------------------------------------------------------------------

# 3. Fanout Exchange

A **Fanout Exchange** sends a copy of every published message to **all
queues bound to the exchange**.

The Routing Key is ignored for routing.

## Example

A booking is confirmed and several systems need the event:

``` text
                 BookingConfirmed
                        |
                        v
                 Fanout Exchange
                /       |        \
               v        v         v
          email.queue analytics.queue notification.queue
               |        |         |
               v        v         v
             Email   Analytics  Notification
```

Every bound queue receives a copy.

## Fanout and Pub/Sub

Fanout is commonly used for the **Publish/Subscribe** pattern.

Each independent subscriber normally has its own queue:

``` text
Publisher
    |
    v
Fanout Exchange
   /    |     \
  v     v      v
 Q1     Q2     Q3
 |      |      |
 v      v      v
C1     C2      C3
```

Multiple consumers sharing one queue normally compete for messages
rather than each receiving a copy.

### Use Cases

Examples include:

``` text
BookingConfirmed
UserRegistered
CacheInvalidated
SystemConfigurationChanged
```

### Mental Model

``` text
Fanout = Broadcast
```

------------------------------------------------------------------------

# 4. Topic Exchange

A **Topic Exchange** routes messages using patterns.

Like Direct Exchange, it uses Routing Keys and Binding Keys, but it
supports wildcard matching.

Routing Keys are commonly dot-separated:

``` text
booking.flight.confirmed
booking.hotel.cancelled
payment.card.failed
```

## Wildcards

### `*`

Matches **exactly one word**.

``` text
booking.*
```

Matches:

``` text
booking.confirmed
booking.cancelled
booking.failed
```

Does not match:

``` text
booking.flight.confirmed
```

### `#`

Matches **zero or more words**.

``` text
booking.#
```

Can match:

``` text
booking
booking.confirmed
booking.flight.confirmed
booking.hotel.cancelled
```

## Example

``` text
Exchange: booking.events
Type: topic
```

Bindings:

``` text
Queue A → booking.flight.*
Queue B → booking.hotel.*
Queue C → booking.#
```

Producer publishes:

``` text
routing_key = booking.flight.confirmed
```

Result:

``` text
booking.events
      |
      | booking.flight.confirmed
      |
      +---- booking.flight.* ---> Queue A ✅
      +---- booking.hotel.* ----> Queue B ❌
      +---- booking.# ----------> Queue C ✅
```

Queue A and Queue C receive the message.

## Logging Example

Bindings:

``` text
log.info  → info.queue
log.error → error.queue
log.*     → all-logs.queue
```

For:

``` text
routing_key = log.error
```

Matches:

``` text
log.error ✅
log.*     ✅
log.info  ❌
```

Therefore both `error.queue` and `all-logs.queue` receive the message.

### Direct vs Topic

``` text
Direct:
routing_key = booking.confirmed
binding_key = booking.confirmed
→ Exact Match

Topic:
routing_key = booking.confirmed
binding_key = booking.*
→ Pattern Match
```

### Mental Model

``` text
Topic = Pattern Matching
```

------------------------------------------------------------------------

# 5. Headers Exchange

A **Headers Exchange** routes messages based on **message headers**
rather than the Routing Key.

Example message metadata:

``` text
type     = booking
status   = confirmed
priority = high
country  = PS
```

Queues define header conditions in their binding arguments.

## x-match

The `x-match` argument controls how header conditions are evaluated.

The most important values to learn first are:

``` text
all
any
```

RabbitMQ also supports:

``` text
all-with-x
any-with-x
```

These variants affect whether `x-` prefixed headers participate in
matching.

## x-match = all

All specified binding headers must match.

Binding:

``` text
x-match = all
type    = booking
status  = confirmed
```

Message:

``` text
type   = booking
status = confirmed
```

Result:

``` text
MATCH ✅
```

Think:

``` text
type == booking
AND
status == confirmed
```

If only one condition matches, the message does not match the binding.

## x-match = any

At least one specified header must match.

Binding:

``` text
x-match  = any
type     = booking
priority = high
```

Message:

``` text
type     = payment
priority = high
```

Result:

``` text
MATCH ✅
```

because `priority = high` matches.

Think:

``` text
type == booking
OR
priority == high
```

## Complete Example

Queue A:

``` text
x-match  = all
type     = booking
priority = high
```

Queue B:

``` text
x-match  = any
type     = payment
priority = high
```

Message headers:

``` text
type     = booking
priority = high
```

Result:

``` text
Headers Exchange
       |
       | type=booking
       | priority=high
       |
       +------> Queue A ✅
       |
       +------> Queue B ✅
```

Queue A matches because all its conditions match.

Queue B matches because at least one condition matches.

### Use Cases

Headers Exchange is useful when routing depends on several independent
metadata attributes:

``` text
format   = pdf
language = en
priority = high
```

### Mental Model

``` text
Headers = Metadata Matching
```

------------------------------------------------------------------------

# Exchange Types Comparison

  -------------------------------------------------------------------------
  Exchange          Routing Method    Routing Key       Typical Use
  ----------------- ----------------- ----------------- -------------------
  Default           Queue name exact  Yes               Simple direct queue
                    match                               publishing

  Direct            Exact matching    Yes               Specific
                                                        categories/events

  Fanout            Broadcast         Ignored           Pub/Sub

  Topic             Pattern matching  Yes               Flexible
                                                        hierarchical
                                                        routing

  Headers           Header matching   Not used for      Metadata-based
                                      routing           routing
  -------------------------------------------------------------------------

------------------------------------------------------------------------

# Booking Platform Example

Assume a travel platform publishes:

``` text
booking.flight.confirmed
```

## Direct

``` text
booking.flight.confirmed
        |
        v
flight-confirmation.queue
```

The binding must match exactly.

## Fanout

``` text
BookingConfirmed
       |
       v
Fanout Exchange
   /       |        \
  v        v         v
Email   Analytics  Notification
Queue     Queue       Queue
```

Every bound queue receives a copy.

## Topic

Bindings:

``` text
booking.flight.* → Flight Consumer
booking.hotel.*  → Hotel Consumer
booking.#        → Analytics Consumer
```

For:

``` text
booking.flight.confirmed
```

both:

``` text
booking.flight.*
booking.#
```

match.

## Headers

Routing could instead depend on:

``` text
bookingType = flight
priority    = high
country     = PS
```

without encoding all metadata into a Routing Key.

------------------------------------------------------------------------

# Final Mental Model

``` text
Default = Queue Name

Direct  = Exact Match

Fanout  = Broadcast

Topic   = Pattern Match

Headers = Metadata Match
```

## Important Notes

1.  An Exchange routes messages; it does not normally store them.
2.  Direct and Topic Exchanges use Routing Keys.
3.  Fanout ignores the Routing Key for routing.
4.  Headers Exchange routes using message headers.
5.  A message can be routed to more than one queue.
6.  Multiple consumers on the same queue normally compete for messages.
7.  For Pub/Sub, each independent subscriber usually has its own queue.
8.  Topic `*` matches exactly one word.
9.  Topic `#` matches zero or more words.
10. The Default Exchange is a special built-in Direct Exchange named
    `""`.
