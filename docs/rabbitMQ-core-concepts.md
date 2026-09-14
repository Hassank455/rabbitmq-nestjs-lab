# RabbitMQ Core Concepts

## Overview

RabbitMQ is a **Message Broker** that allows different applications or services to communicate asynchronously using messages.

The basic RabbitMQ flow is:

```text
Producer / Publisher
        |
        | Publish Message
        v
     Exchange
        |
        | Routing
        v
      Queue
        |
        | Consume Message
        v
Consumer / Subscriber
```

A more complete representation is:

```text
Producer
   |
   | publish(message, routing_key)
   v
Exchange
   |
   | Binding + Routing Rules
   v
Queue
   |
   | consume
   v
Consumer
```

---

# 1. Broker

A **Message Broker** is a software component that acts as an intermediary between applications that send messages and applications that receive them.

In our case:

```text
RabbitMQ = Message Broker
```

Instead of services communicating directly:

```text
Order Service --------> Email Service
```

they communicate through the broker:

```text
Order Service
     |
     | Message
     v
  RabbitMQ
     |
     v
Email Service
```

The broker is responsible for receiving, routing, queueing, and delivering messages.

### Why use a Message Broker?

A message broker helps achieve:

- Loose coupling between services
- Asynchronous communication
- Better scalability
- Better fault tolerance
- Buffering when consumers are temporarily slow or unavailable

Example:

```text
Booking Service
      |
      | BookingConfirmed
      v
   RabbitMQ
      |
      +------> Email Worker
      |
      +------> Notification Worker
      |
      +------> Analytics Worker
```

The Booking Service does not need to communicate directly with every other service.

---

# 2. Producer / Publisher

A **Producer**, also commonly called a **Publisher**, is an application or service that sends messages to RabbitMQ.

Example:

```text
Order Service
```

may publish:

```json
{
  "event": "OrderCreated",
  "orderId": 123,
  "customerId": 50
}
```

Conceptually:

```text
Producer
   |
   | Publish Message
   v
RabbitMQ
```

In RabbitMQ, the producer normally publishes the message to an **Exchange**, not directly to a queue.

```text
Producer
   |
   v
Exchange
```

The producer does not necessarily need to know which queue will receive the message.

This creates **loose coupling** between producers and consumers.

---

# 3. Consumer / Subscriber

A **Consumer** is an application, service, or worker that receives and processes messages from a queue.

Example:

```text
Email Worker
```

could consume:

```text
OrderCreated
```

and send an email to the customer.

The flow is:

```text
Queue
  |
  | Deliver Message
  v
Consumer
```

Example:

```text
Producer
   |
   v
Exchange
   |
   v
Queue
   |
   v
Email Consumer
```

### Consumer vs Subscriber

The terms are related but are not always exactly identical.

In RabbitMQ terminology, **Consumer** is generally the more precise term.

A consumer consumes messages from a queue.

The term **Subscriber** is commonly used when discussing the broader **Publish/Subscribe (Pub/Sub)** messaging pattern.

So:

```text
RabbitMQ terminology:
Producer / Publisher
Consumer

Messaging pattern terminology:
Publisher
Subscriber
```

---

# 4. Publish / Subscribe (Pub/Sub)

**Publish/Subscribe**, usually called **Pub/Sub**, is a messaging pattern where a publisher sends an event without knowing which consumers are interested in it.

Multiple subscribers can independently receive the same event.

Example:

```text
                OrderCreated
                     |
                     v
                  Exchange
                 /    |    \
                /     |     \
               v      v      v
          Queue A  Queue B  Queue C
             |        |        |
             v        v        v
           Email    Analytics Notification
```

The publisher simply says:

```text
"Order 123 has been created."
```

It does not say:

```text
"Email Service, send an email."

"Analytics Service, update analytics."

"Notification Service, send a notification."
```

Instead, interested consumers subscribe through their queues.

This reduces coupling between services.

### Important

Pub/Sub does **not** mean that multiple consumers reading from the **same queue** will all receive the same message.

For example:

```text
             Queue
            /     \
           v       v
      Consumer A Consumer B
```

Normally, RabbitMQ distributes messages between these consumers.

This is closer to the **Competing Consumers / Work Queue** pattern.

For true Pub/Sub behavior, each subscriber typically has its own queue:

```text
             Exchange
             /      \
            v        v
         Queue A   Queue B
            |        |
            v        v
      Consumer A  Consumer B
```

Now both consumers can receive a copy of the same published event.

---

# 5. Exchange

An **Exchange** receives messages from producers and decides where those messages should be routed.

```text
Producer
   |
   | Message
   v
Exchange
   |
   | Routing Decision
   v
Queue
```

An Exchange normally does not store messages.

Its main responsibility is:

> Receive messages and route them to one or more queues.

The routing behavior depends on:

- Exchange type
- Routing Key
- Bindings

RabbitMQ provides several exchange types:

```text
Direct Exchange
Topic Exchange
Fanout Exchange
Headers Exchange
```

Each exchange type uses different routing rules.

Example:

```text
Producer
   |
   | routing_key = "booking.confirmed"
   v
Booking Exchange
   |
   | Routing Rules
   v
Booking Queue
```

---

# 6. Queue

A **Queue** is a buffer inside RabbitMQ that holds messages until consumers process them.

```text
Exchange
   |
   v
+---------------------------+
| Queue                     |
|                           |
| Message 1                 |
| Message 2                 |
| Message 3                 |
+---------------------------+
              |
              v
           Consumer
```

If the consumer is temporarily slow, messages can accumulate in the queue.

Example:

```text
Producer
   |
   v
Exchange
   |
   v
Queue

[Message 1]
[Message 2]
[Message 3]
[Message 4]

   |
   v

Consumer
```

The queue therefore acts as a buffer between message producers and consumers.

### Important distinction

The **Exchange decides where the message should go**.

The **Queue holds the message until it can be consumed**.

```text
Exchange = Routing

Queue = Buffering / Waiting
```

---

# 7. Binding

A **Binding** is a relationship between an Exchange and a Queue.

It tells RabbitMQ:

> This queue is connected to this exchange according to these routing rules.

Conceptually:

```text
Exchange
   |
   | Binding
   |
   v
Queue
```

For example:

```text
                booking.exchange
                       |
                       |
          Binding: booking.confirmed
                       |
                       v
               notification.queue
```

The binding may contain a **Binding Key**.

Example:

```text
Binding Key:

booking.confirmed
```

This can be used by the exchange when deciding whether a message should be routed to that queue.

An exchange can have multiple bindings:

```text
                   Exchange
                  /    |    \
                 /     |     \
                v      v      v
             Queue A Queue B Queue C
```

Each connection represents a binding.

---

# 8. Routing

**Routing** is the process of deciding which queue or queues should receive a message.

Routing happens inside the Exchange.

```text
Producer
   |
   | Message
   v
Exchange
   |
   | Routing Decision
   |
   +------> Queue A
   |
   +------> Queue B
```

RabbitMQ can use a **Routing Key** to make this decision.

For example, the producer publishes:

```text
Message:

BookingConfirmed

Routing Key:

booking.confirmed
```

The exchange receives:

```text
Message
+
Routing Key
```

and compares the routing information with its bindings.

Example:

```text
Producer
   |
   | routing_key = booking.confirmed
   v
Exchange
   |
   |
   +--- binding_key = booking.confirmed ---> Notification Queue
   |
   +--- binding_key = booking.cancelled ---> Refund Queue
```

Because the routing key is:

```text
booking.confirmed
```

the message is routed to:

```text
Notification Queue
```

The exact routing behavior depends on the **Exchange Type**.

---

# 9. Binding Key vs Routing Key

These two concepts are easy to confuse.

### Routing Key

The **Producer** sends a Routing Key with the message.

Example:

```text
booking.confirmed
```

### Binding Key

A **Binding** can define a Binding Key that describes which messages the queue is interested in.

Example:

```text
booking.confirmed
```

The exchange compares them according to its exchange type.

Example with a Direct Exchange:

```text
Producer

Message:
BookingConfirmed

Routing Key:
booking.confirmed

        |
        v

     Exchange

        |
        | Compare
        |
        | routing_key == binding_key
        v

Binding Key:
booking.confirmed

        |
        v

Notification Queue
```

Therefore:

```text
Routing Key
    |
    v
Exchange
    |
    | matches against
    v
Binding Key
    |
    v
Queue
```

---

# 10. Complete RabbitMQ Flow

Putting everything together:

```text
                    RabbitMQ Broker
        +------------------------------------+
        |                                    |
        |                                    |
        |     Exchange                       |
        |        |                           |
        |        | Routing                   |
        |        |                           |
        |        | Binding                   |
        |        v                           |
        |      Queue                         |
        |        |                           |
        |        | Deliver                   |
        |        v                           |
        +------------------------------------+
                 |
                 v
              Consumer
```

More accurately:

```text
Producer
   |
   | 1. Publish Message
   |    + Routing Key
   v
Exchange
   |
   | 2. Check Exchange Type
   | 3. Check Bindings
   | 4. Apply Routing Rules
   v
Queue
   |
   | 5. Store/Buffer Message
   |
   | 6. Deliver Message
   v
Consumer
   |
   | 7. Process Message
   v
ACK
```

---

# Mental Model

A simple mental model is:

```text
Producer
   |
   | creates the message
   v
Exchange
   |
   | decides where it goes
   v
Queue
   |
   | holds it until processed
   v
Consumer
   |
   | processes it
   v
ACK
```

And remember:

```text
RabbitMQ = Broker

Producer = Sends messages

Exchange = Routes messages

Binding = Connects Exchange to Queue

Routing Key = Information used for routing

Queue = Holds messages

Consumer = Processes messages

Pub/Sub = One published event can be delivered
          to multiple independent subscribers
```