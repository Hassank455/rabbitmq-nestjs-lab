# RabbitMQ Multi-Tenancy & Virtual Hosts

## 1. What is Multi-Tenancy?

**Multi-Tenancy** means allowing multiple applications, teams,
environments, or tenants to use the same RabbitMQ broker while keeping
their messaging resources logically isolated.

RabbitMQ provides this isolation using **Virtual Hosts (vhosts)**.

A Virtual Host is a separate logical namespace inside RabbitMQ.

``` text
RabbitMQ Broker
|
+-- vhost: /booking
|   +-- Exchanges
|   +-- Queues
|   +-- Bindings
|   +-- Messages
|
+-- vhost: /foodlify
|   +-- Exchanges
|   +-- Queues
|   +-- Bindings
|   +-- Messages
|
+-- vhost: /
```

The applications use the same RabbitMQ broker, but their messaging
resources are separated.

## 2. What Does a Virtual Host Contain?

A vhost provides a logical boundary for:

-   Exchanges
-   Queues
-   Bindings
-   Messages
-   Client connections
-   User permissions
-   Resource limits

For example, both `/booking` and `/foodlify` can contain an
`orders.queue`. They are completely different queues because they belong
to different vhosts.

``` text
/booking/orders.queue
/foodlify/orders.queue
```

## 3. Default Virtual Host

RabbitMQ normally includes the default vhost:

``` text
/
```

For real applications, you can create dedicated vhosts:

``` text
/booking
/foodlify
/notifications
```

You can also separate environments:

``` text
/booking-dev
/booking-staging
/booking-production
```

## 4. Why Use Virtual Hosts?

Without vhosts, resources from different applications share one
namespace.

With vhosts:

``` text
RabbitMQ
|
+-- /booking
|   +-- orders.queue
|   +-- payment.queue
|
+-- /foodlify
    +-- orders.queue
    +-- notification.queue
```

This provides cleaner organization and logical isolation.

## 5. Connections Belong to a Virtual Host

When a client connects to RabbitMQ, it connects to a **specific vhost**.

A connection to `/booking` works with resources inside `/booking`,
assuming the connected user has the required permissions.

It cannot directly access queues in `/foodlify` using that same
connection.

## 6. User Permissions

Permissions are configured per user and per vhost.

Example:

``` text
User: booking-service
VHost: /booking
```

The user can be allowed to access `/booking` while having no access to
`/foodlify`.

RabbitMQ permissions are commonly divided into:

``` text
Configure
Write
Read
```

-   **Configure**: create, modify, or delete matching resources.
-   **Write**: publish messages to matching exchanges/resources.
-   **Read**: consume/read from matching queues/resources.

## 7. Creating a Virtual Host

Using `rabbitmqctl`:

``` bash
rabbitmqctl add_vhost booking
```

List vhosts:

``` bash
rabbitmqctl list_vhosts
```

Delete a vhost:

``` bash
rabbitmqctl delete_vhost booking
```

Deleting a vhost removes the RabbitMQ resources contained in it, so it
should be done carefully.

## 8. Creating a User and Permissions

Create a user:

``` bash
rabbitmqctl add_user booking_user mypassword
```

Give the user permissions on the `booking` vhost:

``` bash
rabbitmqctl set_permissions -p booking booking_user ".*" ".*" ".*"
```

The three regular expressions represent:

``` text
configure
write
read
```

So `" .* "` patterns conceptually mean access to all matching resources
in that vhost.

## 9. Connecting to a Virtual Host

Example AMQP connection:

``` text
amqp://booking_user:mypassword@localhost:5672/booking
```

This specifies:

``` text
User     : booking_user
Password : mypassword
Host     : localhost
Port     : 5672
VHost    : booking
```

## 10. NestJS / amqplib Example

``` typescript
import * as amqp from 'amqplib';

const connection = await amqp.connect(
  'amqp://booking_user:mypassword@localhost:5672/booking',
);

const channel = await connection.createChannel();

await channel.assertQueue('orders.queue', {
  durable: true,
});
```

The queue belongs to:

``` text
vhost: /booking
queue: orders.queue
```

It is not created globally across all RabbitMQ vhosts.

## 11. Same Queue Name in Different Virtual Hosts

Application A:

``` text
vhost: /booking
queue: orders.queue
```

Application B:

``` text
vhost: /foodlify
queue: orders.queue
```

RabbitMQ sees:

``` text
RabbitMQ
|
+-- /booking
|   +-- orders.queue
|
+-- /foodlify
    +-- orders.queue
```

The queues are independent, and messages in one do not automatically
appear in the other.

## 12. Example: Multiple Applications

``` text
RabbitMQ Broker
|
+-- /booking
|   +-- flight-search.queue
|   +-- booking.queue
|   +-- payment.queue
|
+-- /foodlify
|   +-- order.queue
|   +-- payment.queue
|   +-- notification.queue
|
+-- /analytics
    +-- events.queue
    +-- reports.queue
```

Each application can have its own user:

``` text
booking_user   -> /booking
foodlify_user  -> /foodlify
analytics_user -> /analytics
```

This is a common form of logical multi-tenancy.

## 13. Environment Isolation

Virtual hosts can also separate development environments:

``` text
RabbitMQ
|
+-- /booking-dev
+-- /booking-staging
+-- /booking-production
```

Each environment can use the same resource names without conflicts.

## 14. VHost Limits

RabbitMQ can apply resource limits to virtual hosts.

The purpose is to prevent one application or tenant from consuming
excessive broker resources.

Conceptually:

``` text
/booking
|
+-- connections
+-- queues
+-- resource limits
```

## 15. Important: VHosts Are Logical Isolation

A vhost is **not another RabbitMQ server**.

``` text
RabbitMQ Broker
|
+-- /booking
+-- /foodlify
+-- /analytics
```

All of these still belong to the same RabbitMQ deployment.

Therefore, vhosts provide logical namespace and permission isolation,
but not complete infrastructure isolation.

If the broker becomes unavailable, applications using its vhosts may all
be affected.

## 16. Virtual Host vs Queue

A queue stores messages:

``` text
Queue
+-- Messages
```

A virtual host contains RabbitMQ resources:

``` text
Virtual Host
|
+-- Exchanges
+-- Queues
+-- Bindings
+-- Permissions
```

So:

``` text
Virtual Host != Queue
```

The hierarchy is approximately:

``` text
RabbitMQ Broker
      |
      v
Virtual Host
      |
      v
Exchange
      |
      v
Queue
      |
      v
Messages
```

## 17. Virtual Host vs Docker Container

A **Virtual Host** provides logical isolation inside RabbitMQ:

``` text
RabbitMQ Container
|
+-- /booking
+-- /foodlify
+-- /analytics
```

Separate containers provide stronger process/infrastructure isolation:

``` text
RabbitMQ Container A
+-- Booking

RabbitMQ Container B
+-- Foodlify
```

Using vhosts is lighter because applications can share the same RabbitMQ
deployment.

## 18. Practical Booking Platform Example

Your booking platform could use:

``` text
vhost: /booking
```

with resources such as:

``` text
search.jobs
booking.created
payment.processing
notification.email
```

Another application can use:

``` text
vhost: /foodlify
```

with its own resources.

``` text
RabbitMQ
|
+-- /booking
|   +-- search.jobs
|   +-- booking.created
|   +-- payment.processing
|   +-- notification.email
|
+-- /foodlify
    +-- orders.created
    +-- payment.processing
    +-- notification.email
```

Even identical queue names remain separate because their vhosts are
different.

## 19. Summary

**Multi-Tenancy** allows multiple applications or tenants to share
RabbitMQ while keeping their messaging resources logically separated.

RabbitMQ primarily provides this through **Virtual Hosts**.

A vhost isolates namespaces/resources such as:

-   Exchanges
-   Queues
-   Bindings
-   Messages
-   Permissions
-   Connections

The key idea is:

``` text
RabbitMQ Broker
      |
      v
Virtual Hosts
      |
      v
Logical isolation between applications
```

Virtual hosts are therefore one of RabbitMQ's main mechanisms for
organizing and isolating multiple applications on the same broker.
