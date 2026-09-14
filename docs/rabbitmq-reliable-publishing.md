# RabbitMQ Reliable Publishing

## Overview

When a publisher sends a message to RabbitMQ, simply calling `publish()`
does not by itself give the application complete information about what
happened to that message.

Reliable publishing is about detecting important publishing outcomes and
deciding how the application should react.

The two key RabbitMQ mechanisms are:

``` text
Publisher Confirms
-> Did RabbitMQ confirm the publish?

Publisher Returns
-> Was the message unroutable?
```

A useful mental model is:

``` text
Publisher
   |
   | Publish
   v
RabbitMQ
   |\
   | \
   |  \ Routing failure
   |   -> Return
   |
   -> Publisher Confirm
      ACK / NACK
```

These mechanisms solve different problems and are often used together.

------------------------------------------------------------------------

# 1. The Basic Publishing Flow

The normal flow begins with:

``` text
Publisher
   |
   | Publish
   v
Exchange
   |
   | Routing
   v
Queue
```

However, several things can go wrong.

For example:

``` text
1. RabbitMQ may fail to confirm the publish.

2. The exchange may receive the message but find no matching route.

3. The application may lose its connection before knowing the result.
```

Reliable publishing gives the publisher better visibility into these
situations.

------------------------------------------------------------------------

# 2. Publisher Confirms

**Publisher Confirms** allow RabbitMQ to tell the publisher whether a
published message was successfully handled by the broker according to
the confirm semantics.

The publisher first enables confirm mode on the channel.

Conceptually:

``` text
Publisher
   |
   | Publish Message
   v
RabbitMQ
   |
   | ACK
   v
Publisher
```

or:

``` text
Publisher
   |
   | Publish Message
   v
RabbitMQ
   |
   | NACK
   v
Publisher
```

The important results are:

``` text
ACK
-> RabbitMQ positively confirmed the publish.

NACK
-> RabbitMQ could not positively confirm the publish.
```

------------------------------------------------------------------------

# 3. Publisher ACK

A publisher ACK is a positive confirmation from RabbitMQ.

Example:

``` text
1. Publisher sends Message A

2. RabbitMQ accepts and processes the publish

3. RabbitMQ sends ACK

4. Publisher marks Message A as confirmed
```

Flow:

``` text
Publisher
   |
   | Message A
   v
RabbitMQ
   |
   | ACK
   v
Publisher

Message A = Confirmed
```

The application can now remove the message from its collection of
outstanding/unconfirmed publishes.

------------------------------------------------------------------------

# 4. Publisher NACK

RabbitMQ can negatively acknowledge a publish using a publisher NACK.

Conceptually:

``` text
Publisher
   |
   | Message B
   v
RabbitMQ
   |
   | NACK
   v
Publisher
```

The publisher now knows that the message was not positively confirmed.

The application can decide what to do next, for example:

``` text
Log the failure
Retry carefully
Store the message for later recovery
Raise an alert
```

Retries should be designed carefully because uncertain outcomes can
create duplicate messages.

This is one reason consumers should often be designed to be
**idempotent**.

------------------------------------------------------------------------

# 5. Publisher Confirm Does Not Mean Consumer ACK

This distinction is extremely important.

``` text
Publisher Confirm
!=
Consumer Acknowledgement
```

Publisher confirms happen between:

``` text
Publisher <-> RabbitMQ
```

Consumer acknowledgements happen between:

``` text
RabbitMQ <-> Consumer
```

Complete picture:

``` text
Publisher
   |
   | Publish
   v
RabbitMQ
   |
   | Publisher ACK
   v
Publisher

Meanwhile:

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

They answer different questions.

``` text
Publisher Confirm:
"Did RabbitMQ confirm my publish?"

Consumer ACK:
"Did the consumer successfully process/accept this delivery?"
```

A publisher ACK does **not** mean:

``` text
The consumer received the message.

The consumer processed the message.

The business operation succeeded.
```

------------------------------------------------------------------------

# 6. Publisher Returns

Publisher Returns solve a different problem.

Suppose a publisher sends a message to an exchange using a Routing Key
that matches no binding.

Example:

``` text
Exchange:
payment.exchange

Type:
direct
```

Bindings:

``` text
payment.success -> success.queue
payment.failed  -> failed.queue
```

Publisher sends:

``` text
routing_key = payment.refunded
```

RabbitMQ checks:

``` text
payment.refunded == payment.success -> NO
payment.refunded == payment.failed  -> NO
```

Therefore the message is **unroutable**.

------------------------------------------------------------------------

# 7. The mandatory Flag

To ask RabbitMQ to return an unroutable published message, the publisher
can publish with:

``` text
mandatory = true
```

Conceptually:

``` text
Publisher
   |
   | Publish
   | mandatory = true
   v
Exchange
   |
   X No matching route
   |
   v
Return Message
   |
   v
Publisher
```

The publisher can register a return handler/callback and react to the
returned message.

Mental model:

``` text
mandatory = true

means approximately:

"If this message cannot be routed, return it to me."
```

------------------------------------------------------------------------

# 8. Return Example

Suppose:

``` text
Exchange:
booking.exchange

Type:
direct
```

Binding:

``` text
booking.confirmed -> confirmed.queue
```

Publisher sends:

``` text
routing_key = booking.cancelled
mandatory = true
```

But there is no binding for:

``` text
booking.cancelled
```

Flow:

``` text
Publisher
   |
   | booking.cancelled
   v
booking.exchange
   |
   X No matching binding
   |
   | Return
   v
Publisher
```

The publisher now knows that the message could not be routed to a
destination.

------------------------------------------------------------------------

# 9. Return vs Confirm

This is one of the most important concepts in Reliable Publishing.

A Return and a Publisher Confirm answer different questions.

``` text
Return
-> Could RabbitMQ route this message?

Confirm
-> Did RabbitMQ confirm this publish?
```

Therefore, an unroutable message can be returned to the publisher while
the publishing operation can still receive a publisher confirmation.

Conceptually:

``` text
Publisher
   |
   | (1) Publish
   v
RabbitMQ
   |
   | Message is unroutable
   |
   | (2) Return
   v
Publisher

RabbitMQ
   |
   | (3) Confirm
   v
Publisher
```

So this assumption is incorrect:

``` text
Publisher ACK
=
Message definitely reached the intended queue
```

Instead, treat routing feedback and publishing confirmation as separate
signals.

------------------------------------------------------------------------

# 10. Successful Routing Scenario

Suppose the publisher sends:

``` text
routing_key = booking.confirmed
```

and a matching binding exists.

Flow:

``` text
Publisher
   |
   | Publish
   v
booking.exchange
   |
   | Match
   v
confirmed.queue
```

With Publisher Confirms enabled:

``` text
RabbitMQ
   |
   | ACK
   v
Publisher
```

There is no Return because the message was routable.

Conceptually:

``` text
Publish
   |
   v
Routed Successfully
   |
   +--> Queue
   |
   +--> Publisher Confirm
```

------------------------------------------------------------------------

# 11. Unroutable Scenario

Suppose:

``` text
mandatory = true
```

and no binding matches.

Then:

``` text
Publisher
   |
   | Publish
   v
Exchange
   |
   X No Route
   |
   +--> Return to Publisher

RabbitMQ
   |
   +--> Publisher Confirm
```

This is why an application using reliable publishing should not treat
publisher confirms as a replacement for unroutable-message handling.

------------------------------------------------------------------------

# 12. Alternate Exchange vs Publisher Return

You previously learned about the **Alternate Exchange (AE)**.

Both concepts can deal with unroutable messages, but differently.

## Publisher Return

``` text
Exchange
   |
   X No Route
   |
   v
Publisher
```

The message is returned to the publisher when the applicable
mandatory-return behavior is used.

## Alternate Exchange

``` text
Main Exchange
   |
   X No Route
   |
   v
Alternate Exchange
   |
   v
Fallback Queue
```

The broker tries another exchange instead of immediately treating the
message as returned to the publisher.

Mental model:

``` text
Publisher Return
-> Let the publisher handle the unroutable message.

Alternate Exchange
-> Let RabbitMQ attempt fallback routing.
```

------------------------------------------------------------------------

# 13. Publisher Confirm vs Alternate Exchange vs DLX

These three concepts solve different problems.

``` text
Publisher Confirm
-> Publishing reliability between Publisher and RabbitMQ.

Alternate Exchange
-> Handles messages an exchange cannot route normally.

Dead Letter Exchange
-> Handles messages dead-lettered from queues.
```

Architecture:

``` text
Publisher
   |
   | Publish
   v
Exchange
   |
   +---------------- No Route ----------------> Alternate Exchange
   |
   | Routed
   v
Queue
   |
   +---------------- Dead Letter -------------> DLX
```

Publisher confirms operate around the publishing side of this flow.

------------------------------------------------------------------------

# 14. Persistent Messages

Reliable publishing is also commonly discussed together with message
durability.

A publisher can mark messages as persistent when appropriate.

Conceptually:

``` text
Persistent Message
+
Durable Queue
+
Durable Exchange where applicable
+
Publisher Confirms
```

provides stronger durability characteristics than simply publishing a
transient message and assuming it is safe.

However:

``` text
Persistent Message
!=
Publisher Confirm
```

They solve different concerns.

``` text
Persistence
-> How the message should survive broker persistence/recovery scenarios.

Publisher Confirm
-> Feedback to the publisher about the publish.
```

------------------------------------------------------------------------

# 15. Reliable Publishing and Retries

Suppose the publisher does not receive a definitive successful outcome.

The application may retry.

But imagine this scenario:

``` text
Publisher
   |
   | Message A
   v
RabbitMQ

RabbitMQ successfully handles Message A

BUT

connection is lost before Publisher receives confirmation
```

The publisher may not know whether RabbitMQ received the message.

If it retries:

``` text
Message A
Message A
```

could potentially be observed more than once downstream.

Therefore reliable messaging systems often combine publishing
reliability with:

``` text
Idempotency
Deduplication where needed
Message IDs
Safe retry policies
```

------------------------------------------------------------------------

# 16. Idempotent Consumer

Suppose the publisher retries the same booking event.

``` json
{
  "messageId": "msg-1001",
  "bookingId": "B500",
  "event": "BookingConfirmed"
}
```

The consumer may receive the same logical message more than once.

An idempotent consumer can detect that:

``` text
msg-1001
```

was already processed.

Then:

``` text
First delivery
-> Process

Duplicate delivery
-> Ignore safely / return previous result
```

This is an important part of designing reliable distributed systems.

------------------------------------------------------------------------

# 17. Practical Booking Example

Suppose a Booking Service publishes:

``` text
BookingConfirmed
```

Architecture:

``` text
Booking Service
      |
      | Publish
      | mandatory = true
      v
booking.events
      |
      | routing_key = booking.confirmed
      v
notification.queue
```

The publisher tracks the publish until RabbitMQ confirms it.

Successful scenario:

``` text
Booking Service
      |
      | Publish
      v
RabbitMQ
      |
      | Route
      v
notification.queue

RabbitMQ
      |
      | ACK
      v
Booking Service
```

If the Routing Key is wrong:

``` text
Booking Service
      |
      | booking.confirm
      v
booking.events
      |
      X No matching binding
      |
      | Return
      v
Booking Service
```

The service can now log and alert on the routing configuration problem
instead of silently assuming the event reached its intended destination.

------------------------------------------------------------------------

# 18. Reliable Publishing Mental Model

When publishing an important message, ask several separate questions.

``` text
1. Did RabbitMQ confirm the publish?

   -> Publisher Confirm


2. Could the exchange route the message?

   -> mandatory + Return handling
   or an Alternate Exchange strategy


3. Should the message survive relevant broker restart/recovery scenarios?

   -> Persistence + durable topology as appropriate


4. What happens if the result is uncertain and I retry?

   -> Idempotency / deduplication strategy
```

------------------------------------------------------------------------

# 19. Common Mistakes

## Mistake 1

Assuming:

``` text
publish()
=
message safely delivered
```

Do not make this assumption for important messages.

## Mistake 2

Assuming:

``` text
Publisher ACK
=
Consumer processed message
```

Incorrect.

## Mistake 3

Assuming:

``` text
Publisher ACK
=
Message definitely reached the intended queue
```

Routing feedback is a separate concern; handle unroutable messages
appropriately.

## Mistake 4

Retrying indefinitely without considering duplicates.

Retries should be designed together with idempotency.

------------------------------------------------------------------------

# 20. Final Summary

``` text
Reliable Publishing
-> Techniques that let publishers detect and handle publishing outcomes.

Publisher Confirm
-> RabbitMQ confirms publishes with ACK/NACK semantics.

Publisher ACK
-> Positive publisher confirmation.

Publisher NACK
-> Negative publisher confirmation.

mandatory = true
-> Requests return behavior for messages that cannot be routed as required.

Publisher Return
-> Notifies the publisher about an unroutable message.

Publisher Confirm != Consumer ACK

Return != Confirm

Alternate Exchange
-> Broker-side fallback routing for unroutable messages.

DLX
-> Handles messages dead-lettered from queues.
```

The simplest mental model is:

``` text
                     Publisher
                         |
                         | Publish
                         v
                      RabbitMQ
                      /      \
                     /        \
             Routing Result   Publish Result
                  |                |
                  v                v
               Return         ACK / NACK
          when applicable
```

For an important production message, think about the complete chain:

``` text
Publisher Confirms
+
Unroutable Message Handling
+
Appropriate Persistence
+
Safe Retries
+
Idempotent Consumers
```
