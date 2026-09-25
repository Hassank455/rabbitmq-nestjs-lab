# 022 - RabbitMQ Streams - Retention

## Core Idea

In a RabbitMQ Stream, reading a message does not remove it as it normally would in a traditional queue.

```text
Queue:
Message -> Consumer -> ACK -> Message removed

Stream:
Message -> Consumer -> Read
                    |
                    v
             Message remains
                    |
                    v
             Retention Policy
```

Therefore, **retention** determines when old Stream data becomes eligible for deletion.

---

## x-max-age

`x-max-age` defines how long data should be retained in the Stream.

Examples:

```text
30m -> 30 minutes
12h -> 12 hours
7D  -> 7 days
```

Example:

```text
x-max-age = 7D
```

This means RabbitMQ keeps approximately the most recent seven days of Stream data, subject to segment-based cleanup.

Example:

```text
booking.events

Monday    -> M1
Tuesday   -> M2
Wednesday -> M3
...
```

With:

```text
x-max-age = 7D
```

old data becomes eligible for deletion after it falls outside the retention window.

---

## x-max-length-bytes

`x-max-length-bytes` defines the maximum amount of data that should be retained in the Stream.

Conceptually:

```text
Stream

[M1][M2][M3][M4] ... [Mn]

        Maximum Size
             |
             v

Old segments become eligible for removal
```

This is especially useful for large event logs because it prevents Stream storage from growing indefinitely.

Example:

```text
x-max-length-bytes = 10 GB
```

Conceptually, RabbitMQ keeps the retained Stream data within that configured storage limit by removing old segments as needed.

---

## x-stream-max-segment-size-bytes

RabbitMQ does not store an entire Stream as one huge file.

Instead, Stream storage is divided into **segments**.

```text
Stream

Segment 1
[M1 ... M1000]

Segment 2
[M1001 ... M2000]

Segment 3
[M2001 ... M3000]
```

`x-stream-max-segment-size-bytes` controls the target maximum size of each segment file.

Example:

```text
x-stream-max-segment-size-bytes = 500 MB
```

Conceptually:

```text
booking.events

+----------------+
| Segment 1      |
| ~500 MB        |
+----------------+

+----------------+
| Segment 2      |
| ~500 MB        |
+----------------+

+----------------+
| Segment 3      |
| ~500 MB        |
+----------------+
```

This matters because Stream retention cleanup operates at the **segment level**.

Therefore, reaching an age or size threshold does not necessarily mean an individual message is deleted immediately at that exact moment.

---

## Using Retention Settings Together

A Stream can use retention settings together.

For example:

```text
booking.events
```

Requirements:

```text
Keep events for a limited period
Limit total retained storage
Control segment size
```

Mental model:

```text
booking.events
       |
       +-- x-max-age
       |      |
       |      +-> How long should data be retained?
       |
       +-- x-max-length-bytes
       |      |
       |      +-> How much data should be retained?
       |
       +-- x-stream-max-segment-size-bytes
              |
              +-> How large should each segment be?
```

---

## Queue vs Stream

The most important distinction is:

```text
Queue
ACK determines message removal

Stream
Retention determines data removal
```

With a Queue:

```text
Message -> Consumer -> ACK -> Removed
```

With a Stream:

```text
Message -> Consumer -> Read
                    |
                    +-> Message remains available
                            |
                            +-> Replay is possible
                            |
                            +-> Retention eventually removes old data
```

This is one of the main reasons Streams are useful for event history, replay, large fan-outs, and large logs.

---

## Summary

```text
x-max-age
-> Controls retention by time

x-max-length-bytes
-> Controls retention by total stored size

x-stream-max-segment-size-bytes
-> Controls the size of Stream storage segments
```

The key idea is:

> **Consumers do not remove Stream messages by reading them. Retention rules determine how long Stream data remains available.**
