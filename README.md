# RabbitMQ × NestJS Lab

Learning RabbitMQ by **building it**, one lab at a time.

Every lab is a small NestJS module with a publisher, one or more consumers, and a set of experiments you run while watching the RabbitMQ management UI. The goal is not to read about RabbitMQ, but to see each concept prove itself.

![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-FF6600?logo=rabbitmq&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

---

## Progress

| #  | Lab | What it teaches | Status |
|----|-----|-----------------|--------|
| 01 | [Hello Queue](lab/src/labs/lab01-hello-queue/README.md) | Default exchange · connection vs channel · manual ack | ✅ Done |
| 02 | [Work Queue](lab/src/labs/lab02-work-queue/README.md) | Competing consumers · prefetch · redelivery | ✅ Done |
| 03 | [Fanout Exchange](lab/src/labs/lab03-fanout/README.md) | Bindings · copy per service · exclusive queues | ✅ Done |
| 04 | [Direct Exchange](lab/src/labs/lab04-direct/README.md) | Routing keys · multiple bindings · unroutable messages | ✅ Done |
| 05 | [Topic Exchange](lab/src/labs/lab05-topic/README.md) | Wildcards `*` and `#` · pattern subscriptions | ✅ Done |
| 06 | [Durability & Reconnect](lab/src/labs/lab06-durability/README.md) | Durable queues · persistent messages · connection recovery | ✅ Done |
| 07 | [Ack / Nack / Reject](lab/src/labs/lab07-ack-nack/README.md) | Requeue · poison messages · infinite loops | ✅ Done |
| 08 | Dead Letter Exchange | DLX · DLQ · the `x-death` header | 🔜 Next |
| 09 | Retry with TTL | Delayed retries · retry tiers · head-of-queue TTL trap | ⬜ Planned |
| 10 | Unroutable Messages | `mandatory` · returns · alternate exchange | ⬜ Planned |
| 11 | Publisher Confirms | Proving the broker really received a message | ⬜ Planned |
| 12 | Idempotent Consumer | Surviving at-least-once duplicates | ⬜ Planned |
| 13 | Capstone | An order system using everything above | ⬜ Planned |

---

## Quick start

**1. Start RabbitMQ**

```bash
docker run -d --hostname rabbitmq --name rabbitmq \
  -p 5672:5672 -p 15672:15672 \
  rabbitmq:3-management
```

Management UI: <http://localhost:15672> (user `guest`, password `guest`)

**2. Run the app**

```bash
cd lab
npm install
CONSUMERS=on npm run start:dev
```

**3. Publish something**

```bash
curl -X POST http://localhost:3000/lab01/publish \
  -H 'Content-Type: application/json' -d '{"userId": 10}'
```

---

## Endpoints

| Lab | Method | Path | Body |
|-----|--------|------|------|
| 01 | `POST` | `/lab01/publish` | `{ "userId": 10, "message": "..." }` |
| 02 | `POST` | `/lab02/publish` | `{ "count": 20, "durationMs": 500 }` |
| 03 | `POST` | `/lab03/orders` | `{ "count": 6 }` |
| 04 | `POST` | `/lab04/publish` | `{ "key": "order.paid", "count": 1 }` |
| 05 | `POST` | `/lab05/publish` | `{ "key": "order.paid.eu", "count": 1 }` |
| 06 | `POST` | `/lab06/invoices` | `{ "count": 3 }` |
| 07 | `POST` | `/lab07/pay` | `{ "kind": "poison", "count": 1 }` (`ok` · `transient` · `poison`) |

## Environment variables

The same app is started several times with different settings to simulate separate services and workers.

| Variable | Default | Used in | Meaning |
|----------|---------|---------|---------|
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | all | Broker connection string |
| `PORT` | `3000` | all | HTTP port (change it to run several instances) |
| `CONSUMERS` | off | all | `on` starts the consumers |
| `WORKER_NAME` | `worker` | 02 · 03 · 04 · 05 | Label shown in logs |
| `WORKER_DELAY` | `1000` | 02 | Simulated work time in ms |
| `PREFETCH` | `0` | 02 | Max unacked messages per consumer (`0` = unlimited) |
| `SERVICES` | all | 03 | `email,sms,analytics` subset, or `none` |
| `LIVE` | off | 03 | `on` starts a live dashboard on an exclusive queue |
| `LAB04_SERVICES` | all | 04 | `warehouse,email,audit,analytics` subset, or `none` |
| `LAB05_SERVICES` | all | 05 | `audit,orders,compliance,payments,alerts` subset, or `none` |
| `LAB06_DURABLE` | `on` | 06 | Durable exchange + queue (also picks the queue name) |
| `LAB06_PERSISTENT` | `on` | 06 | `deliveryMode 2` on every message |
| `LAB06_PAUSED` | off | 06 | `on` = declare and bind, but never consume |
| `LAB06_DELAY` | `2000` | 06 | Simulated work time in ms |
| `LAB07_STRATEGY` | `requeue` | 07 | On failure: `requeue` · `drop` · `smart` · `hang` |
| `LAB07_MAX_ATTEMPTS` | `3` | 07 | `smart` only: deliveries before giving up |
| `LAB07_DELAY` | `500` | 07 | Simulated work time in ms |

Each lab owns its own service filter (`SERVICES`, `LAB04_SERVICES`, …) so that running everything at once does not make one lab's filter silence another's.

Example: two competing workers with different speeds.

```bash
CONSUMERS=on WORKER_NAME=FAST WORKER_DELAY=100  PREFETCH=1 PORT=3000 npm run start
CONSUMERS=on WORKER_NAME=SLOW WORKER_DELAY=3000 PREFETCH=1 PORT=3001 npm run start
```

---

## Project structure

```text
.
├── docs/                         Theory notes, one file per topic
│   ├── images/
│   └── linkedin/                 Post text + images for the learning journey
└── lab/                          NestJS app
    └── src/
        ├── main.ts
        ├── app.module.ts
        ├── rabbitmq/             Shared infrastructure: recovering connection, channels, consumer registry
        │   ├── rabbitmq.module.ts
        │   └── rabbitmq.service.ts
        └── labs/
            ├── lab01-hello-queue/
            ├── lab02-work-queue/
            ├── lab03-fanout/
            ├── lab04-direct/
            ├── lab05-topic/
            ├── lab06-durability/
            └── lab07-ack-nack/
```

Every lab folder follows the same layout:

| File | Role |
|------|------|
| `labXX.constants.ts` | Exchange / queue names and message types |
| `labXX.controller.ts` | The **publisher**, exposed as an HTTP endpoint |
| `labXX.consumer.ts` | The **consumers** |
| `labXX.module.ts` | Wires them together |
| `README.md` | Goal, how to run, key takeaways, gotchas |
| `diagrams/` | draw.io sources + PNG exports (open the `.drawio.png` in draw.io to edit) |

---

## Key ideas so far

- **The HTTP request never reaches the consumer.** It ends at the controller. What reaches the consumer is a message owned by the broker.
- **One connection per process, one channel per consumer.** Connections are expensive TCP sockets; channels are cheap.
- **In Node.js, `prefetch` is your concurrency limit.** amqplib never awaits the consume callback.
- **A queue shares. An exchange copies.** Many consumers on one queue split the work; every bound queue gets its own copy.
- **An exchange stores nothing.** No queue bound at publish time means the message is gone, and the publisher still gets a 201.
- **The exchange type is the routing question.** fanout: "are you bound?" · direct: "is your key exactly this?" · topic: "does your key match this pattern, word by word?"
- **Durability is three switches**, not one: durable exchange + durable queue + persistent message.
- **amqplib restores the connection. You restore the work.** Channels, consumers and topology have to be re-declared after every reconnect.
- **At-least-once is the deal.** A lost ack means the same work runs twice, so consumers must become idempotent.
- **A requeued message goes back to the front.** One message that always fails, requeued, blocks every message behind it: no error, no crash.
- **`redelivered` is a boolean, not a counter.** A retry limit has to live in the message or the broker, never in process memory.

## Selected diagrams

**Lab 02 — prefetch 0 vs prefetch 1**

![Lab 02 prefetch](lab/src/labs/lab02-work-queue/diagrams/lab02-prefetch.drawio.png)

**Lab 05 — who receives what**

![Lab 05 matching](lab/src/labs/lab05-topic/diagrams/lab05-matching.drawio.png)

**Lab 06 — what recovers after a broker restart**

![Lab 06 what recovers](lab/src/labs/lab06-durability/diagrams/lab06-what-recovers.drawio.png)

**Lab 07 — one poison message blocks the queue**

![Lab 07 poison loop](lab/src/labs/lab07-ack-nack/diagrams/lab07-poison-loop.drawio.png)

More diagrams live in each lab's `diagrams/` folder.

---

## Theory notes

| Note | Topic |
|------|-------|
| [Core concepts](docs/rabbitMQ-core-concepts.md) | Broker, producer, consumer, exchange, queue, binding, routing |
| [Creating queues](docs/rabbitmq-create-queue.md) | Exclusive, durable, auto-delete, `x-expires`, `x-message-ttl`, `x-max-length` |
| [Exchanges](docs/rabbitmq-exchange.md) | Exchange options: durability, auto-delete, internal, arguments |
| [Exchange types](docs/rabbitmq-exchange-types.md) | Default, direct, fanout, topic, headers |
| [Consumer acknowledgements](docs/rabbitmq-consumer-acknowledgements.md) | Auto vs manual ack, nack, reject, redelivery, delivery tags |
| [Dead lettering](docs/rabbitmq-dead-lettering.md) | DLX, DLQ, dead-letter routing keys, retry |
| [Message expiry](docs/rabbitmq-message-expiry-time.md) | Queue TTL vs per-message TTL, delayed retries |
| [Alternate exchange](docs/rabbitmq-alternate-exchange.md) | Catching unroutable messages |
| [Reliable publishing](docs/rabbitmq-reliable-publishing.md) | Publisher confirms, returns, `mandatory`, persistence |
| [Learning plan](docs/plan.md) | The original roadmap for this lab |

---

## Tech stack

- **Node.js** + **NestJS** + **TypeScript**
- **[amqplib](https://github.com/amqp-node/amqplib)** used directly inside a Nest provider, instead of `@nestjs/microservices`, so every exchange, binding, prefetch and ack stays visible
- **RabbitMQ 3** with the management plugin, running in Docker
