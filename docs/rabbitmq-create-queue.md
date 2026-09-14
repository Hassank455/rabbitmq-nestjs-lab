# RabbitMQ - Creating and Configuring Queues

## Overview

A **Queue** is a buffer inside RabbitMQ that holds messages until
consumers process them.

``` text
Producer -> Exchange -> Queue -> Consumer
```

The **Exchange routes** the message, while the **Queue holds** it until
it is processed.

When creating a queue, important properties include:

-   Name
-   Exclusive
-   Durability
-   Auto Delete
-   Arguments
    -   `x-expires`
    -   `x-message-ttl`
    -   `x-max-length`

------------------------------------------------------------------------

# 1. Queue Name

Every queue has a name that identifies it inside a RabbitMQ virtual
host.

Example:

``` text
booking.confirmation.queue
email.queue
payment.queue
```

With the Default Exchange, the queue name can also be used as the
Routing Key:

``` text
exchange = ""
routing_key = "email.queue"
```

RabbitMQ then routes the message to:

``` text
email.queue
```

RabbitMQ can also generate a unique queue name when an application
declares a queue using an empty name. This is useful for temporary
queues.

### Mental Model

``` text
Name -> Identifies the queue
```

------------------------------------------------------------------------

# 2. Exclusive

An **exclusive queue** is scoped to the connection that declared it.

``` text
exclusive = true
```

It is deleted when that connection closes.

``` text
Connection
    |
    | declares
    v
Exclusive Queue
    |
    | connection closes
    v
Queue Deleted
```

Exclusive queues are useful for temporary use cases such as:

-   Temporary subscribers
-   RPC reply queues
-   Connection-specific queues

A common temporary configuration is:

``` text
name       = generated
durable    = false
exclusive  = true
autoDelete = true
```

### Mental Model

``` text
Exclusive -> Queue belongs to one connection
```

------------------------------------------------------------------------

# 3. Durability

Durability determines whether the **queue definition survives a RabbitMQ
broker restart**.

## Durable

``` text
durable = true
```

The queue survives a broker restart.

``` text
RabbitMQ
   |
   | Restart
   v
Queue Still Exists
```

This is appropriate for long-lived application queues.

## Transient / Non-Durable

``` text
durable = false
```

The queue does not survive a broker restart and may need to be declared
again.

### Important

A durable queue does **not** automatically mean that every message
survives a restart.

``` text
Durable Queue != Persistent Message
```

Queue durability and message persistence are separate concepts.

For reliable messaging, you may need to consider:

``` text
Durable Exchange
+
Durable Queue
+
Persistent Messages
+
Publisher Confirms
```

### Mental Model

``` text
Durable -> Should the queue survive a broker restart?
```

------------------------------------------------------------------------

# 4. Auto Delete

An **auto-delete queue** can be automatically removed when it is no
longer being used by consumers according to RabbitMQ's queue lifecycle
rules.

``` text
autoDelete = true
```

Conceptually:

``` text
Queue
  |
  v
Consumer

Consumer disconnects
  |
  v
Queue can be automatically deleted
```

This is useful for temporary subscriber queues.

A typical long-lived queue often uses:

``` text
durable    = true
autoDelete = false
```

## Exclusive vs Auto Delete

They are related but different:

``` text
Exclusive
-> Queue lifecycle is tied to its declaring connection.

Auto Delete
-> Queue lifecycle is tied to consumer usage.
```

### Mental Model

``` text
Auto Delete -> Remove temporary queue after consumer use ends
```

------------------------------------------------------------------------

# 5. Queue Arguments

Queue arguments provide additional behavior.

Common examples are:

``` text
x-expires
x-message-ttl
x-max-length
```

They solve different problems:

``` text
x-expires
-> Lifetime of an unused QUEUE

x-message-ttl
-> Lifetime of MESSAGES

x-max-length
-> Maximum number of ready MESSAGES
```

------------------------------------------------------------------------

# 6. x-expires

`x-expires` defines how long an **unused queue** may remain before
RabbitMQ automatically deletes it.

The value is specified in milliseconds.

Example:

``` text
x-expires = 60000
```

means approximately:

``` text
60 seconds
```

Conceptually:

``` text
Queue becomes unused
        |
        | 60 seconds
        v
Queue Deleted
```

This is useful for dynamically created queues that should eventually be
cleaned up if abandoned.

### Important

`x-expires` applies to the **queue**, not to individual messages.

``` text
x-expires -> Queue expiration
```

### Mental Model

``` text
x-expires
-> How long may this unused queue exist?
```

------------------------------------------------------------------------

# 7. x-message-ttl

TTL means:

``` text
Time To Live
```

`x-message-ttl` specifies how long messages may stay in the queue before
they expire.

The value is specified in milliseconds.

Example:

``` text
x-message-ttl = 30000
```

means:

``` text
30 seconds
```

Conceptually:

``` text
Message enters Queue
        |
        | waits 30 seconds
        v
Message Expires
```

Example:

``` text
notification.queue
x-message-ttl = 60000
```

Messages that wait too long become expired.

Expired messages can be discarded or dead-lettered when dead-lettering
is configured.

### Use Case

Suppose a message represents temporary information:

``` text
UserIsOnline
```

Processing it much later may no longer be useful. A TTL prevents stale
messages from remaining indefinitely.

### Mental Model

``` text
x-message-ttl
-> How long may a message wait in this queue?
```

------------------------------------------------------------------------

# 8. x-max-length

`x-max-length` limits the number of **ready messages** a queue can
contain.

Example:

``` text
x-max-length = 1000
```

Conceptually:

``` text
Queue Capacity = 1000 ready messages
```

This becomes useful when producers are faster than consumers:

``` text
Producer
████████████████████

Queue
████████████

Consumer
████
```

Without a limit, the backlog can continue growing.

When the maximum length is exceeded, RabbitMQ's configured overflow
behavior determines how excess messages are handled. By default,
messages from the head of the queue can be dropped or dead-lettered when
dead lettering is configured.

### Mental Model

``` text
x-max-length
-> How many ready messages may this queue hold?
```

------------------------------------------------------------------------

# 9. x-expires vs x-message-ttl vs x-max-length

  -----------------------------------------------------------------------
  Argument                Controls                Example
  ----------------------- ----------------------- -----------------------
  `x-expires`             Queue lifetime while    Delete unused queue
                          unused                  after 60 seconds

  `x-message-ttl`         Message lifetime        Expire messages after
                                                  30 seconds

  `x-max-length`          Number of ready         Maximum 1000 ready
                          messages                messages
  -----------------------------------------------------------------------

``` text
x-expires
    |
    v
QUEUE lifetime


x-message-ttl
    |
    v
MESSAGE lifetime


x-max-length
    |
    v
QUEUE size
```

------------------------------------------------------------------------

# 10. Long-Lived Queue Example

Suppose we create:

``` text
Queue: booking.notification.queue

durable    = true
exclusive  = false
autoDelete = false

x-message-ttl = 60000
x-max-length  = 10000
```

Flow:

``` text
Booking Service
       |
       v
booking.exchange
       |
       v
booking.notification.queue
       |
       | message TTL = 60 seconds
       | max = 10,000 ready messages
       v
Notification Consumer
```

Meaning:

``` text
durable = true
-> Queue survives broker restart.

exclusive = false
-> Queue is not owned by one connection.

autoDelete = false
-> Queue remains available after consumers disconnect.

x-message-ttl = 60000
-> Waiting messages can expire after 60 seconds.

x-max-length = 10000
-> Limit the ready-message backlog.
```

------------------------------------------------------------------------

# 11. Temporary Queue Example

A temporary subscriber might use:

``` text
name       = generated
durable    = false
exclusive  = true
autoDelete = true
```

Flow:

``` text
Fanout Exchange
       |
       v
Temporary Queue
       |
       v
Consumer
```

When the declaring connection ends, the exclusive queue is removed.

This is useful for short-lived subscribers that do not need permanent
queues.

------------------------------------------------------------------------

# 12. Queue vs Exchange Durability

Do not confuse these concepts:

``` text
Durable Exchange
-> Exchange definition survives restart.

Durable Queue
-> Queue definition survives restart.

Persistent Message
-> Message is marked for persistence.
```

They address different parts of messaging reliability.

------------------------------------------------------------------------

# Queue Configuration Mental Model

When creating a queue, ask:

``` text
1. Name
   -> What identifies this queue?

2. Exclusive
   -> Should this queue belong to one connection?

3. Durable
   -> Should it survive a broker restart?

4. Auto Delete
   -> Should RabbitMQ remove it after consumer use ends?

5. x-expires
   -> Should an unused queue expire?

6. x-message-ttl
   -> How long may messages wait?

7. x-max-length
   -> How large may the ready-message backlog become?
```

------------------------------------------------------------------------

# Final Summary

``` text
Name
-> Identifies the queue.

Exclusive
-> Queue belongs to one connection.

Durable
-> Queue survives RabbitMQ restart.

Transient
-> Queue does not survive RabbitMQ restart.

Auto Delete
-> Queue can be removed after consumer use ends.

x-expires
-> Expire an unused queue.

x-message-ttl
-> Expire old messages.

x-max-length
-> Limit the number of ready messages.
```

The simplest mental model:

``` text
Exchange
-> WHERE should the message go?

Queue
-> WHERE should the message wait?

Consumer
-> WHO should process the message?
```
