# 018 - RabbitMQ - Topic Write Permissions

## 1. What are Topic Write Permissions?

RabbitMQ **Topic Write Permissions** provide more fine-grained
authorization for publishing to a **topic exchange**.

Normal RabbitMQ `write` permission answers:

> Is this user allowed to publish to this exchange?

Topic write permission adds another check:

> Is this user allowed to publish using this routing key?

So the authorization flow is approximately:

``` text
Publisher
    |
    | Regular Write Permission
    | Can the user write to this exchange?
    v
Topic Exchange
    |
    | Topic Write Permission
    | Can the user use this routing key?
    v
Routing
    |
    v
Queue
```

------------------------------------------------------------------------

## 2. Why Do We Need It?

Imagine several services publish to the same topic exchange:

``` text
events.topic
```

But each service should only publish events belonging to its own domain.

``` text
order-service
    -> order.*

payment-service
    -> payment.*

notification-service
    -> notification.*
```

Without topic permissions, a service that has write access to
`events.topic` could potentially publish using routing keys belonging to
another service.

Topic permissions allow us to restrict this.

------------------------------------------------------------------------

## 3. Example

Suppose we have:

``` text
Exchange: amq.topic
Queue: q1
Binding Key: log.error
```

Architecture:

``` text
Publisher
    |
    | publish
    v
amq.topic
    |
    | log.error
    v
q1
```

Now suppose the publisher is only allowed to publish with:

``` text
log.info
```

but tries to publish:

``` text
Routing Key: log.error
```

RabbitMQ rejects the operation.

``` text
Allowed:

log.info

Attempt:

log.error

Result:

DENIED
```

The queue binding may be correct, but the publisher is not authorized to
use that routing key.

------------------------------------------------------------------------

## 4. Allowed Example

If the user's topic write permission allows:

``` text
log.error
```

and the publisher sends:

``` text
Routing Key: log.error
```

the permission check succeeds.

``` text
Publisher
    |
    | log.error
    v
amq.topic
    |
    | log.error
    v
q1
```

Result:

``` text
ALLOWED
```

RabbitMQ can then perform the normal topic routing process.

------------------------------------------------------------------------

## 5. Regular Write Permission vs Topic Write Permission

These are two different authorization checks.

### Regular Write Permission

Controls access to the **exchange/resource**.

Example conceptually:

``` text
Write regexp:

^events\.topic$
```

This answers:

``` text
Can this user publish to events.topic?
```

### Topic Write Permission

Controls which **routing keys** may be used when publishing through a
topic exchange.

Example:

``` text
^log\.info$
```

This answers:

``` text
Can this user publish using routing key log.info?
```

Therefore:

``` text
Regular Write Permission
        +
Topic Write Permission
        =
More fine-grained publishing authorization
```

------------------------------------------------------------------------

## 6. Two Permission Checks

Suppose:

``` text
Exchange = amq.topic
Routing Key = log.error
```

RabbitMQ conceptually checks:

``` text
1. Does the user have WRITE permission for amq.topic?

2. Does the user's TOPIC WRITE permission allow log.error?
```

Both relevant authorization checks must succeed.

Example:

``` text
Write permission:
^amq\.topic$

Topic write permission:
^log\.info$
```

Publishing:

``` text
amq.topic
routing key = log.error
```

results in:

``` text
Exchange permission -> allowed
Routing key permission -> denied

Final result -> denied
```

------------------------------------------------------------------------

## 7. Regular Expressions

RabbitMQ permissions use **regular expressions**.

To allow exactly:

``` text
log.error
```

you can use:

``` regex
^log\.error$
```

To allow exactly:

``` text
log.info
```

use:

``` regex
^log\.info$
```

To allow routing keys beginning with `log.`:

``` regex
^log\..*
```

Examples that match:

``` text
log.info
log.error
log.warning
log.debug
```

Examples that do not match:

``` text
order.created
payment.failed
user.created
```

------------------------------------------------------------------------

## 8. Important: Regex Is Not a Topic Binding Pattern

Do not confuse RabbitMQ topic binding patterns with permission regex.

A topic binding can look like:

``` text
log.*
```

or:

``` text
log.#
```

These use RabbitMQ topic wildcard rules.

Topic permissions use **regular expressions**.

For example:

``` regex
^log\..*$
```

So these are different concepts:

``` text
Topic Binding:
log.*

Permission Regex:
^log\..*$
```

------------------------------------------------------------------------

## 9. Topic Exchange Routing Still Works Normally

Topic write permission does not replace the exchange routing algorithm.

It happens as an authorization check before RabbitMQ routes the message
normally.

For example:

``` text
Publisher
    |
    | routing key: log.error
    v
amq.topic
    |
    | Permission Check
    |
    +---- denied ----> publish rejected
    |
    +---- allowed
             |
             v
       Normal Topic Routing
             |
             v
            q1
```

------------------------------------------------------------------------

## 10. Example with Multiple Services

Consider:

``` text
Exchange: application.events
```

Three services publish to it:

``` text
Order Service
Payment Service
Notification Service
```

We want:

``` text
Order Service
    -> order.created
    -> order.updated
    -> order.cancelled

Payment Service
    -> payment.created
    -> payment.succeeded
    -> payment.failed

Notification Service
    -> notification.email
    -> notification.sms
    -> notification.push
```

Topic write permissions can enforce these boundaries.

Conceptually:

``` text
order-service
    topic write regex:
    ^order\..*$

payment-service
    topic write regex:
    ^payment\..*$

notification-service
    topic write regex:
    ^notification\..*$
```

Now `payment-service` can publish:

``` text
payment.failed
```

but should not be allowed to publish:

``` text
order.cancelled
```

------------------------------------------------------------------------

## 11. Security Benefit

Without fine-grained topic authorization:

``` text
payment-service
    |
    | order.cancelled
    v
events.topic
```

A compromised or incorrectly implemented service with broad exchange
write access could publish an event belonging to another domain.

With topic write permissions:

``` text
payment-service
    |
    | order.cancelled
    v
Permission Check
    |
    X DENIED
```

This helps enforce service boundaries at the RabbitMQ authorization
layer.

------------------------------------------------------------------------

## 12. Setting Topic Permissions with rabbitmqctl

RabbitMQ provides commands for topic permissions.

General structure:

``` bash
rabbitmqctl set_topic_permissions \
  -p <vhost> \
  <user> \
  <exchange> \
  <write-regexp> \
  <read-regexp>
```

Example:

``` bash
rabbitmqctl set_topic_permissions \
  -p booking \
  payment_service \
  events.topic \
  "^payment\..*$" \
  ".*"
```

Conceptually this means:

``` text
VHost:
booking

User:
payment_service

Topic Exchange:
events.topic

Allowed write routing keys:
payment.*

Topic read pattern:
all matching values
```

The exact authorization behavior should always be considered together
with the user's normal vhost permissions.

------------------------------------------------------------------------

## 13. Listing Topic Permissions

You can inspect topic permissions with RabbitMQ CLI commands such as:

``` bash
rabbitmqctl list_topic_permissions
```

For a particular vhost:

``` bash
rabbitmqctl list_topic_permissions -p booking
```

This helps verify which users have topic-level authorization.

------------------------------------------------------------------------

## 14. Clearing Topic Permissions

Topic permissions can also be removed.

For example:

``` bash
rabbitmqctl clear_topic_permissions \
  -p booking \
  payment_service \
  events.topic
```

After removing them, authorization depends on the remaining RabbitMQ
permission configuration.

------------------------------------------------------------------------

## 15. Practical NestJS / amqplib Example

Publishing code itself remains normal.

``` typescript
const channel = this.rabbit.getChannel();

await channel.assertExchange(
  'events.topic',
  'topic',
  { durable: true },
);

channel.publish(
  'events.topic',
  'payment.failed',
  Buffer.from(
    JSON.stringify({
      paymentId: 1001,
      status: 'failed',
    }),
  ),
);
```

The application asks RabbitMQ to publish with:

``` text
Exchange:
events.topic

Routing Key:
payment.failed
```

RabbitMQ then performs the relevant permission checks.

If the user's topic write permission is:

``` regex
^payment\..*$
```

then:

``` text
payment.failed
```

matches.

But:

``` text
order.cancelled
```

does not.

------------------------------------------------------------------------

## 16. Example Permission Design

For a booking platform:

``` text
Exchange:
booking.events
```

Possible services:

``` text
Search Service
Booking Service
Payment Service
Notification Service
```

Permissions could be designed around routing-key ownership:

``` text
Search Service
    ^search\..*$

Booking Service
    ^booking\..*$

Payment Service
    ^payment\..*$

Notification Service
    ^notification\..*$
```

Example events:

``` text
search.completed

booking.created
booking.confirmed
booking.cancelled

payment.started
payment.succeeded
payment.failed

notification.email.sent
notification.push.sent
```

This gives each publisher a clearly defined event namespace.

------------------------------------------------------------------------

## 17. Topic Permission vs Binding Key

These are completely different responsibilities.

### Topic Permission

Controls authorization.

``` text
Can this user use routing key payment.failed?
```

### Binding Key

Controls message routing.

``` text
Which queues should receive payment.failed?
```

Example:

``` text
Publisher
    |
    | payment.failed
    |
    | Topic Permission
    | Is this routing key allowed?
    v
Topic Exchange
    |
    | Binding Matching
    | Which queues match?
    v
payment-failed.queue
```

So remember:

``` text
Permission = Security / Authorization

Binding = Routing
```

------------------------------------------------------------------------

## 18. Topic Write Permission Does Not Mean Queue Permission

The publisher normally publishes to an **exchange**, not directly to the
destination queue in this topic-exchange scenario.

Therefore topic write permission focuses on authorization around the
topic exchange and routing key.

The queue may be:

``` text
q1
```

but the publisher thinks in terms of:

``` text
Exchange: amq.topic
Routing Key: log.error
```

RabbitMQ decides which queues receive the message according to bindings.

------------------------------------------------------------------------

## 19. Common Mistake

A common misunderstanding is:

``` text
If q1 is bound using log.error,
the publisher can automatically publish log.error.
```

That is not necessarily true.

The binding controls routing:

``` text
log.error -> q1
```

Authorization independently controls whether the publisher is allowed to
use that routing key.

Therefore:

``` text
Valid Binding
     !=
Publish Permission
```

Both routing configuration and authorization must be valid.

------------------------------------------------------------------------

## 20. Summary

Normal RabbitMQ write permissions answer:

``` text
Can the user publish to this exchange?
```

Topic write permissions provide a more fine-grained check:

``` text
Can the user publish using this routing key?
```

Example:

``` text
Exchange:
events.topic

User:
payment-service

Allowed routing keys:
^payment\..*$
```

Allowed:

``` text
payment.created
payment.succeeded
payment.failed
```

Denied:

``` text
order.created
booking.cancelled
notification.email
```

The key idea is:

``` text
Publisher
    |
    v
Exchange Write Permission
    |
    v
Topic Write Permission
    |
    v
Topic Routing
    |
    v
Queue
```

Use topic permissions when multiple users or services share topic
exchanges but should only publish or access specific routing-key
namespaces.
