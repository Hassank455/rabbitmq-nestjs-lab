# 020 - RabbitMQ - Quorum Replicas and Dead Letter Strategy

## Quorum Replicas

A **Quorum Queue** is replicated across multiple RabbitMQ nodes. One
member is the **Leader** and the others are **Followers**.

``` text
qu-queue
├── Node A -> Leader
├── Node B -> Follower
└── Node C -> Follower
```

### x-quorum-initial-group-size

This setting controls the initial number of members when the Quorum
Queue is created.

``` text
x-quorum-initial-group-size = 3
```

If the cluster has five nodes, this does not mean the queue must exist
on all five:

``` text
Node A -> replica
Node B -> replica
Node C -> replica
Node D -> no replica
Node E -> no replica
```

### Majority

Raft requires a majority of members to make progress.

``` text
3 members -> majority = 2
5 members -> majority = 3
```

For three members:

``` text
A ✅  B ✅  C ❌
2/3 -> majority exists
```

But:

``` text
A ✅  B ❌  C ❌
1/3 -> no majority
```

### Publishing

The application publishes only once:

``` text
Publisher -> Exchange -> Quorum Queue
```

RabbitMQ internally handles:

``` text
              Leader
             /      \
        Follower   Follower
```

You do not publish manually to each replica.

``` typescript
channel.publish(
  'booking.exchange',
  'booking.created',
  Buffer.from(JSON.stringify(data)),
);
```

------------------------------------------------------------------------

# Dead Letter Strategy

## Normal Dead Lettering

``` text
Main Queue
    |
    v
   DLX
    |
    v
Dead Letter Queue
```

With important messages, we also care about failures while RabbitMQ is
forwarding a dead-lettered message.

## at-most-once

The default dead-letter strategy for Quorum Queues is conceptually:

``` text
at-most-once
```

This is simpler, but the transfer to the dead-letter destination is not
protected against every failure scenario.

``` text
Quorum Queue -> DLX -> X destination problem
```

## at-least-once

Quorum Queues can use:

``` text
dead-letter-strategy = at-least-once
```

Conceptually:

``` text
Source Quorum Queue
        |
        v
Internal Dead-Letter Consumer
        |
        v
       DLX
        |
        v
Destination Queue
        |
        v
Publisher Confirm
        |
        v
Source removes message
```

This reduces the risk of losing a message during dead-letter transfer.

### Trade-off

``` text
at-most-once
-> loss is possible in some failure scenarios

at-least-once
-> safer delivery
-> duplicates are possible
```

Therefore important consumers should often be **idempotent**.

``` typescript
if (await alreadyProcessed(message.id)) {
  channel.ack(msg);
  return;
}

await processPayment(message);
await markAsProcessed(message.id);

channel.ack(msg);
```

## Important Configuration Concepts

``` text
dead-letter-strategy = at-least-once
overflow = reject-publish
dead-letter-exchange = <exchange>
```

Historically the `stream_queue` feature flag was also relevant to this
implementation. This does **not** mean the Quorum Queue becomes a
RabbitMQ Stream.

Exact configuration details should be checked against the RabbitMQ
version used in production.

## Mental Model

``` text
Quorum Queue
    |
    ├── Replicas
    │     -> HA / Data Safety
    |
    ├── Raft
    │     -> Leader + Followers + Majority
    |
    └── Dead Letter Strategy
          ├── at-most-once
          └── at-least-once
                  |
                  -> possible duplicates
                  -> idempotent consumer
```

## Summary

`x-quorum-initial-group-size` determines the initial number of Quorum
Queue members. RabbitMQ manages replication and Raft internally.

For dead lettering, `at-least-once` provides stronger transfer
guarantees than `at-most-once`, but applications must be prepared for
possible duplicate deliveries.
