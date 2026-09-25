# 023 - RabbitMQ Policies and Operator Policies

# Part 1 - Why Policies Were Introduced

When a client declares a Queue, it can provide optional arguments.

Example:

```typescript
await channel.assertQueue('orders.queue', {
  durable: true,
  arguments: {
    'x-message-ttl': 60000,
    'x-max-length': 10000,
  },
});
```

The client is effectively telling RabbitMQ:

```text
Create orders.queue

Message TTL = 60 seconds
Max Length  = 10,000 messages
```

The problem is that operational configuration can become tightly coupled to application declarations.

```text
Application
    |
    | queue.declare
    |
    +-- Message TTL
    +-- Max Length
    +-- DLX
    |
    v
RabbitMQ Queue
```

Suppose the operations team later wants to change:

```text
Message TTL

60 seconds
    |
    v
5 minutes
```

If the setting is hardcoded as a queue argument, changing it can require changing application configuration/code and dealing with queue redeclaration compatibility.

RabbitMQ Policies provide a better mechanism for many operational settings.

---

# Part 2 - What Is a Policy?

A **Policy** is configuration managed by RabbitMQ that is automatically applied to matching resources.

Instead of putting every operational setting in application code:

```text
Application
    |
    +-- TTL
    +-- Max Length
    +-- DLX
    |
    v
Queue
```

we can separate responsibilities:

```text
Application
    |
    | Declare / Use Resource
    v
RabbitMQ Queue
    ^
    |
RabbitMQ Policy
    |
    +-- TTL
    +-- Max Length
    +-- DLX
```

This creates a useful separation:

```text
Application
-> Declares and uses messaging topology

RabbitMQ Administrator
-> Controls operational configuration
```

---

# Part 3 - How Policies Work

A RabbitMQ Policy contains several important properties:

```text
Policy
|
+-- Name
+-- Pattern
+-- Apply To
+-- Priority
+-- Definition
```

## Name

The name identifies the Policy.

Example:

```text
orders-policy
```

---

## Pattern

The pattern is a regular expression used to select matching resources.

Example:

```regex
^orders\.
```

This can match:

```text
orders.queue           YES
orders.payment.queue   YES
orders.email.queue     YES

booking.queue          NO
payment.queue          NO
```

A single Policy can therefore affect many resources.

---

## Apply To

`Apply To` determines which resource type the Policy targets.

Depending on the supported policy configuration, this can target resources such as queues or exchanges.

Example:

```text
Apply To = queues
```

Conceptually:

```text
Policy
  |
  +-> Queue A
  +-> Queue B
  +-> Queue C
```

while unrelated resources remain unaffected.

---

## Definition

The **Definition** contains the actual configuration applied by the Policy.

Examples include supported settings such as:

```text
message-ttl
max-length
dead-letter-exchange
overflow
```

Example:

```text
message-ttl = 60000
max-length  = 10000
```

A useful mental model is:

```text
Policy
|
+-- WHO?
|     |
|     +-> Pattern
|
+-- WHAT RESOURCE TYPE?
|     |
|     +-> Apply To
|
+-- WHAT CONFIGURATION?
      |
      +-> Definition
```

---

## Priority

A resource can match more than one regular Policy.

Example:

```text
Policy A
Pattern  = ^orders\.
Priority = 1

Policy B
Pattern  = ^orders\.payment
Priority = 10
```

Resource:

```text
orders.payment.queue
```

matches both.

RabbitMQ uses Policy priority as part of determining the effective matching regular Policy.

Conceptually:

```text
Policy A -> Priority 1
                \
                 -> orders.payment.queue
                /
Policy B -> Priority 10
```

The higher-priority matching regular Policy wins according to RabbitMQ's Policy rules.

---

# Part 4 - Policies vs Queue Arguments

## Queue Arguments

Arguments are provided by the client during declaration.

```text
Client
  |
  +-- x-message-ttl
  +-- x-max-length
  |
  v
Queue
```

Example:

```typescript
await channel.assertQueue('orders.queue', {
  arguments: {
    'x-message-ttl': 60000,
  },
});
```

## Policies

Policies are managed centrally in RabbitMQ.

```text
Administrator
      |
      v
Policy
      |
      v
Matching Resources
```

This means operational configuration can often be changed without modifying application code.

A useful rule of thumb:

```text
Operational setting likely to change
        |
        v
Prefer a Policy when supported

Resource characteristic that must be fixed
at declaration time
        |
        v
Use an appropriate declaration argument
```

Not every `x-argument` can be represented by a Policy, and some declaration properties cannot be changed dynamically.

---

# Part 5 - Example Policy

Suppose we have:

```text
orders.created.queue
orders.payment.queue
orders.notification.queue
```

We want all queues beginning with `orders.` to have:

```text
Message TTL = 60 seconds
Max Length  = 10,000
```

Conceptually:

```text
orders-policy

Pattern:
^orders\.

Definition:
message-ttl = 60000
max-length  = 10000
```

The Policy applies to:

```text
orders.created.queue       YES
orders.payment.queue       YES
orders.notification.queue  YES

booking.queue              NO
email.queue                NO
```

Example CLI command:

```bash
rabbitmqctl set_policy \
  orders-policy \
  "^orders\." \
  '{"message-ttl":60000,"max-length":10000}' \
  --apply-to queues \
  --priority 10
```

---

# Part 6 - Operator Policies

RabbitMQ also supports **Operator Policies**.

An Operator Policy is designed to let RabbitMQ operators enforce guardrails on resources.

Conceptually, there are multiple sources of configuration:

```text
Client Arguments
       |
Regular Policy
       |
Operator Policy
       |
       v
Effective Resource Configuration
```

A regular Policy is mainly useful for centrally managed operational configuration.

An Operator Policy is particularly useful for protecting the RabbitMQ cluster from application configurations that could consume excessive resources.

---

# Part 7 - Why Operator Policies Are Useful

Imagine an application requests:

```text
max-length = 1,000,000
```

but the RabbitMQ operator wants to enforce:

```text
max-length = 100,000
```

For supported overlapping numeric limits, RabbitMQ generally uses the more restrictive value.

Conceptually:

```text
Application:
1,000,000

Operator Policy:
100,000

       |
       v

Effective limit:
100,000
```

The goal is:

```text
Application Flexibility
          +
Cluster Safety
```

---

# Part 8 - Regular Policy vs Operator Policy

```text
Regular Policy
|
+-> Operational configuration
+-> Centrally managed
+-> Matches resources using patterns
+-> Useful for settings such as TTL, DLX, limits, etc.

Operator Policy
|
+-> Administrator-enforced guardrails
+-> Protects RabbitMQ resources
+-> Restricts application configuration where supported
+-> Has special precedence rules
```

An Operator Policy is **not simply a regular Policy with a higher priority**.

It is a separate configuration layer with its own precedence behavior.

---

# Part 9 - Configuration Precedence Mental Model

Conceptually:

```text
Application Arguments
        |
        v
Regular Policy
        |
        v
Operator Policy
        |
        v
Effective Configuration
```

But the exact merge behavior depends on the setting.

For supported numeric limits, RabbitMQ commonly chooses the lower/more restrictive value when an Operator Policy and another configuration source overlap.

Therefore, do not think:

```text
Operator Policy always blindly replaces everything
```

Instead think:

```text
Operator Policy
-> Administrative guardrail
-> Effective-value rules depend on the setting
```

---

# Part 10 - Booking Platform Example

Suppose a Booking Service declares:

```text
booking.processing
```

The application can focus on using the Queue:

```text
Booking Service
      |
      | declare/use
      v
booking.processing
```

A regular Policy can manage operational behavior:

```text
booking-policy
      |
      +-- Message TTL
      +-- Dead Letter Exchange
      +-- Max Length
```

An Operator Policy can enforce infrastructure limits:

```text
booking-operator-policy
      |
      +-- Maximum allowed resource limits
      +-- Cluster protection
```

Complete mental model:

```text
Booking Service
      |
      v
booking.processing
      ^
      |
Regular Policy
      |
      +-- TTL
      +-- DLX

Operator Policy
      |
      +-- Safety Limits
      +-- Cluster Guardrails
```

---

# Part 11 - The Main Difference

Remember these three sentences:

```text
Arguments
-> The application says:
   "Configure my resource like this."

Regular Policy
-> The RabbitMQ administrator says:
   "Matching resources should use this configuration."

Operator Policy
-> The RabbitMQ operator says:
   "These infrastructure guardrails must be respected."
```

---

# Summary

Policies were introduced to avoid hardcoding every operational RabbitMQ setting inside application declarations.

```text
Application
    |
    v
RabbitMQ Resources
    ^
    |
Regular Policies
    ^
    |
Operator Policies / Guardrails
```

The main idea is **separation of concerns**:

- The application declares and uses messaging resources.
- Regular Policies centrally manage supported operational settings.
- Operator Policies enforce infrastructure-level safety limits.

This makes RabbitMQ configuration easier to manage and allows operators to change many settings without modifying application code.
