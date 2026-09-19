# RabbitMQ Users and Permissions

## 1. Overview

RabbitMQ uses **users**, **virtual hosts (vhosts)**, and **permissions** to control who can access messaging resources and what operations they are allowed to perform.

A user does not automatically have access to every queue or exchange. Permissions are assigned **per user and per virtual host**.

```text
RabbitMQ Broker
|
+-- /booking
|   +-- booking_user
|       +-- Configure
|       +-- Write
|       +-- Read
|
+-- /foodlify
    +-- foodlify_user
        +-- Configure
        +-- Write
        +-- Read
```

This is especially useful when multiple applications or teams share the same RabbitMQ broker.

---

## 2. The Guest User

RabbitMQ commonly creates a default user named:

```text
guest
```

with the default password:

```text
guest
```

The `guest` user is intended mainly for local development. By default, RabbitMQ restricts remote connections for this user, so production applications should normally use dedicated users with appropriate permissions.

Example development connection:

```text
amqp://guest:guest@localhost:5672/
```

For a real application, prefer something like:

```text
booking_user
payment_service
notification_service
```

---

## 3. Creating a User

Using RabbitMQ CLI:

```bash
rabbitmqctl add_user booking_user strong_password
```

List users:

```bash
rabbitmqctl list_users
```

Delete a user:

```bash
rabbitmqctl delete_user booking_user
```

Change a password:

```bash
rabbitmqctl change_password booking_user new_password
```

---

## 4. Permissions Are Assigned Per Virtual Host

Suppose we have:

```text
User: booking_user
VHost: /booking
```

Giving this user permissions on `/booking` does not automatically give access to `/foodlify`.

```text
booking_user
     |
     +-- /booking    -> allowed
     |
     +-- /foodlify   -> not allowed
```

This is one of the main mechanisms RabbitMQ uses for logical isolation.

---

## 5. The Three Main Permissions

RabbitMQ resource permissions are based on three regular expressions:

```text
Configure
Write
Read
```

### Configure

Controls operations that create, modify, or delete matching resources.

Typical examples include:

```text
exchange.declare
exchange.delete
queue.declare
queue.delete
```

### Write

Controls operations that write/publish to matching resources.

The most common example is:

```text
basic.publish -> Exchange
```

### Read

Controls operations that read or consume from matching resources.

Examples:

```text
basic.get     -> Queue
basic.consume -> Queue
queue.purge   -> Queue
```

---

## 6. Permissions Use Regular Expressions

RabbitMQ permissions are not simply boolean values such as:

```text
read = true
write = true
```

Instead, each permission is a **regular expression** matched against resource names.

For example:

```text
Configure: .*
Write:     .*
Read:      .*
```

`.*` matches all resource names, so the user has broad access inside that vhost.

---

## 7. Restricting Access to a Specific Resource

Suppose we use:

```regex
^(amq\.fanout)$
```

This matches exactly:

```text
amq.fanout
```

but not:

```text
orders.exchange
payments.exchange
amq.direct
```

Therefore, regular expressions allow fine-grained resource access.

Another example:

```regex
^orders\..*
```

could match names such as:

```text
orders.created
orders.updated
orders.queue
```

but not:

```text
payments.queue
notifications.queue
```

---

## 8. Giving Full Permissions

Suppose the vhost is:

```text
booking
```

and the user is:

```text
booking_user
```

We can grant full matching resource permissions with:

```bash
rabbitmqctl set_permissions -p booking booking_user ".*" ".*" ".*"
```

The order is:

```text
rabbitmqctl set_permissions -p <vhost> <user> <configure> <write> <read>
```

So:

```text
".*" -> Configure
".*" -> Write
".*" -> Read
```

---

## 9. Viewing Permissions

List permissions for all vhosts:

```bash
rabbitmqctl list_permissions
```

List permissions for a specific vhost:

```bash
rabbitmqctl list_permissions -p booking
```

List permissions for a specific user:

```bash
rabbitmqctl list_user_permissions booking_user
```

---

## 10. Clearing Permissions

Remove a user's permissions from a vhost:

```bash
rabbitmqctl clear_permissions -p booking booking_user
```

This does not necessarily delete the user. It removes that user's resource permissions for the selected vhost.

---

## 11. Permission Checks by AMQP Operation

Different RabbitMQ/AMQP operations require different permissions.

| Operation | Condition | Configure | Write | Read |
|---|---|---|---|---|
| `exchange.declare` | `passive=false` | exchange | - | - |
| `exchange.declare` | `passive=true` | - | - | - |
| `exchange.declare` | with Alternate Exchange | exchange | alternate exchange | exchange |
| `exchange.delete` | | exchange | - | - |
| `queue.declare` | `passive=false` | queue | - | - |
| `queue.declare` | `passive=true` | - | - | - |
| `queue.declare` | with DLX | queue | dead-letter exchange | queue |
| `queue.delete` | | queue | - | - |
| `exchange.bind` | | - | destination exchange | source exchange |
| `exchange.unbind` | | - | destination exchange | source exchange |
| `queue.bind` | | - | queue | exchange |
| `queue.unbind` | | - | queue | exchange |
| `basic.publish` | | - | exchange | - |
| `basic.get` | | - | - | queue |
| `basic.consume` | | - | - | queue |
| `queue.purge` | | - | - | queue |

The important point is that **Configure, Write, and Read are checked against resources involved in the operation**.

---

## 12. Example: Publishing a Message

Suppose the producer executes:

```typescript
channel.publish(
  'orders.exchange',
  'orders.created',
  Buffer.from(JSON.stringify(message)),
);
```

RabbitMQ checks the user's **Write** permission against:

```text
orders.exchange
```

Conceptually:

```text
Publisher
   |
   | basic.publish
   v
orders.exchange
   ^
   |
Write permission required
```

The producer does not need Read permission just to publish to the exchange.

---

## 13. Example: Consuming a Message

Suppose the consumer executes:

```typescript
channel.consume('orders.queue', (msg) => {
  // process message
});
```

RabbitMQ checks the user's **Read** permission against:

```text
orders.queue
```

Conceptually:

```text
orders.queue
     |
     | basic.consume
     v
 Consumer

Read permission required
```

---

## 14. Example: Declaring a Queue

```typescript
await channel.assertQueue('orders.queue', {
  durable: true,
});
```

This normally performs a queue declaration.

RabbitMQ checks **Configure** permission against:

```text
orders.queue
```

So a user may be allowed to consume an existing queue but not allowed to create new queues.

---

## 15. Queue Bind Permission

Consider:

```typescript
await channel.bindQueue(
  'orders.queue',
  'orders.exchange',
  'orders.created',
);
```

The operation connects:

```text
orders.exchange
       |
       | binding
       v
orders.queue
```

For `queue.bind`, RabbitMQ checks permissions involving both resources:

```text
Write -> queue
Read  -> exchange
```

This demonstrates why Write and Read permissions are not simply synonyms for "producer" and "consumer".

They are authorization checks associated with specific AMQP operations and resources.

---

## 16. Dead Letter Exchange Permission Example

Suppose we declare:

```typescript
await channel.assertQueue('orders.queue', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'orders.dlx',
  },
});
```

This operation references both:

```text
orders.queue
orders.dlx
```

RabbitMQ may therefore need to verify permissions involving the queue and the configured dead-letter exchange.

This is why advanced queue declarations can require more than just Configure permission on the queue itself.

---

## 17. Alternate Exchange Permission Example

An exchange can reference an Alternate Exchange:

```text
orders.exchange
      |
      | unroutable message
      v
orders.ae
```

Declaring an exchange with an Alternate Exchange can involve permission checks on both the declared exchange and the referenced alternate exchange.

This follows the same general principle:

> RabbitMQ checks permissions on the resources affected or referenced by an operation.

---

## 18. Producer-Only User Example

Suppose a service only needs to publish to exchanges beginning with `orders.`.

A restricted permission model could conceptually be:

```text
Configure: ^$
Write:     ^orders\..*
Read:      ^$
```

Here:

```regex
^$
```

matches only an empty resource name, so it effectively prevents normal named-resource access for that permission category.

The service can publish to matching exchanges but cannot freely declare resources or consume queues.

---

## 19. Consumer-Only User Example

Suppose a worker only needs to consume queues beginning with `orders.`.

Conceptually:

```text
Configure: ^$
Write:     ^$
Read:      ^orders\..*
```

This follows the **Principle of Least Privilege**: give each service only the permissions it actually requires.

---

## 20. Application-Specific Permissions

Imagine a booking system with:

```text
Booking Service
Payment Service
Notification Service
```

Instead of one shared RabbitMQ account:

```text
rabbitmq_user
```

we can create:

```text
booking_service_user
payment_service_user
notification_service_user
```

Then grant each user only the resources required by that service.

Example:

```text
booking_service_user
  Write: ^booking\..*
  Read:  ^booking\..*

payment_service_user
  Write: ^payment\..*
  Read:  ^payment\..*

notification_service_user
  Write: ^notification\..*
  Read:  ^notification\..*
```

The exact patterns depend on the application's topology.

---

## 21. Users + Virtual Hosts + Permissions

These three concepts work together:

```text
RabbitMQ Broker
      |
      v
Virtual Host
      |
      v
User
      |
      +-- Configure Regex
      +-- Write Regex
      +-- Read Regex
      |
      v
Queues / Exchanges / Bindings
```

Example:

```text
User: booking_user
VHost: /booking

Configure: ^booking\..*
Write:     ^booking\..*
Read:      ^booking\..*
```

The same user could theoretically have completely different permissions on another vhost.

---

## 22. NestJS / amqplib Connection

After creating the user and assigning permissions:

```typescript
import * as amqp from 'amqplib';

const connection = await amqp.connect(
  'amqp://booking_user:strong_password@localhost:5672/booking',
);

const channel = await connection.createChannel();
```

RabbitMQ authenticates:

```text
Who are you?
-> booking_user
```

Then authorizes operations according to the user's permissions in:

```text
/booking
```

Authentication and authorization are therefore separate concepts:

```text
Authentication -> Who are you?
Authorization  -> What are you allowed to do?
```

---

## 23. Common Permission Error

If a user tries to access a resource without sufficient permission, RabbitMQ can close the channel with an access-related error.

Conceptually:

```text
booking_user
     |
     | basic.publish
     v
payment.exchange
     |
     X
Write regex does not match
```

The important things to inspect are:

```text
1. Which user is connected?
2. Which vhost is the connection using?
3. Which operation failed?
4. Which resource was involved?
5. Does Configure / Write / Read regex match that resource?
```

---

## 24. Best Practices

For production systems:

- Avoid using the default `guest` account for application services.
- Create dedicated users for applications or services where appropriate.
- Assign permissions per vhost.
- Follow the Principle of Least Privilege.
- Avoid giving `.* / .* / .*` to every service unless it genuinely requires full resource access.
- Use strong credentials and keep them in environment variables or a secrets manager.
- Separate environments using dedicated vhosts or stronger infrastructure isolation when required.
- Review permissions when adding new queues, exchanges, DLXs, or Alternate Exchanges.

---

## 25. Summary

RabbitMQ authorization revolves around:

```text
User
  +
Virtual Host
  +
Configure / Write / Read regex
```

### Configure

Used for operations involving creation, modification, or deletion of matching resources.

### Write

Used when an operation writes to a matching resource, most notably publishing to an exchange.

### Read

Used when an operation reads from a matching resource, most notably consuming from a queue.

Permissions are **regular expressions**, so access can be broad:

```text
.*
```

or restricted:

```text
^orders\..*
```

The key idea is:

```text
Authentication
     |
     v
Who is the user?
     |
     v
Virtual Host
     |
     v
Authorization
     |
     +-- Configure
     +-- Write
     +-- Read
     |
     v
Allowed RabbitMQ operations/resources
```

This allows multiple applications and services to safely share RabbitMQ while controlling exactly which resources each user can access.
