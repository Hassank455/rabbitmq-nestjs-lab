# RabbitMQ Exchange

An **Exchange** receives messages from producers and routes them to
queues or other exchanges based on routing rules.

The Exchange does not normally store messages.

## Exchange Types

RabbitMQ provides four main exchange types:

-   Direct
-   Topic
-   Fanout
-   Headers

### Direct Exchange

A Direct Exchange routes messages using exact matching between the
**Routing Key** and **Binding Key**.

``` text
Routing Key: booking.confirmed
Binding Key: booking.confirmed
→ MATCH
```

### Topic Exchange

A Topic Exchange routes messages using pattern-based matching between
Routing Keys and Binding Keys.

``` text
Routing Key: booking.confirmed
Binding Key: booking.*
→ MATCH
```

### Fanout Exchange

A Fanout Exchange routes a copy of the message to all queues bound to
the exchange.

It ignores the Routing Key.

### Headers Exchange

A Headers Exchange routes messages based on message headers instead of
the Routing Key.

------------------------------------------------------------------------

## Durability

### Durable

A durable Exchange survives a RabbitMQ broker restart.

``` text
durable = true
```

### Transient / Non-Durable

A non-durable Exchange does not survive a broker restart and must be
declared again.

``` text
durable = false
```

> Exchange durability does not automatically make messages persistent.

------------------------------------------------------------------------

## Auto Delete

When:

``` text
autoDelete = true
```

RabbitMQ can automatically delete the Exchange after it has been used
and no bindings remain.

This is useful for temporary Exchanges.

Long-lived production Exchanges are commonly configured as:

``` text
durable = true
autoDelete = false
```

------------------------------------------------------------------------

## Internal Exchange

An internal Exchange cannot be used as a normal direct publishing
destination by producers.

It is primarily useful for **Exchange-to-Exchange routing**.

``` text
Producer
   |
   v
Exchange A
   |
   v
Internal Exchange B
   |
   v
Queue
```

------------------------------------------------------------------------

## Arguments

Exchange arguments provide additional configuration and behavior.

One important argument is:

``` text
alternate-exchange
```

------------------------------------------------------------------------

## Alternate Exchange

An **Alternate Exchange** handles messages that the original Exchange
cannot route to any destination.

The important distinction is that the message successfully reaches the
original Exchange, but the Exchange cannot find a matching destination.

``` text
Producer
   |
   | routing_key = booking.failed
   v
Main Exchange
   |
   X No matching binding
   |
   v
Alternate Exchange
   |
   v
Unrouted Messages Queue
```

For example, suppose `booking.exchange` has these bindings:

``` text
booking.confirmed → confirmed.queue
booking.cancelled → cancelled.queue
```

If a message arrives with:

``` text
routing_key = booking.failed
```

and there is no matching binding, RabbitMQ can route it to the
configured Alternate Exchange.

------------------------------------------------------------------------

## Mental Model

``` text
Exchange Type
→ HOW should the message be routed?

Durable
→ Should the Exchange survive a broker restart?

Auto Delete
→ Should RabbitMQ automatically remove the Exchange when it is no longer in use?

Internal
→ Can producers publish directly to this Exchange?

Alternate Exchange
→ Where should an unroutable message go?
```
