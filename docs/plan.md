أفضل طريقة تتعلم RabbitMQ هي إنك **تبني عليه بإيدك**، مش بس تقرأ المفاهيم. بما إنك شغال Backend بـ Node.js، أنصحك تعمل mini-project صغير وتتدرج فيه.

ممكن تمشي بهذا الترتيب:

1. **شغّل RabbitMQ محليًا باستخدام Docker**

```bash
docker run -d \
  --hostname rabbitmq \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management
```

بعدها افتح:

```text
http://localhost:15672
```

والـ default login:

```text
username: guest
password: guest
```

2. ابدأ بأبسط سيناريو:

```text
Producer
   |
   v
 Queue
   |
   v
Consumer
```

اعمل مشروعين Node.js:

```text
producer.js
consumer.js
```

الـ producer يرسل:

```json
{
  "orderId": 123,
  "event": "ORDER_CREATED"
}
```

والـ consumer يقرأ الرسالة ويطبعها.

3. بعد ما تفهم Queue مباشرة، انتقل إلى **Exchange + Binding + Routing Key**:

```text
Producer
   |
   v
 Exchange
   |
 Routing Key
   |
   v
 Queue
   |
 Consumer
```

جرّب بنفسك أنواع الـ exchanges بالترتيب:

```text
Direct Exchange
Fanout Exchange
Topic Exchange
Headers Exchange
```

مثلاً مع `direct`:

```text
order.created  -> order_queue
order.cancelled -> cancellation_queue
```

4. بعدها اعمل مثال واقعي أقرب لمشاريعك:

```text
Order Service
      |
      | order.created
      v
   RabbitMQ
   /      \
  v        v
Email    Payment
Worker   Worker
```

يعني عند إنشاء Order:

```json
{
  "orderId": 5001,
  "customerId": 82,
  "total": 120
}
```

RabbitMQ يوزع العمل على أكثر من consumer.

5. بعد ذلك ابدأ تتعمد تعمل مشاكل حتى تتعلم RabbitMQ فعليًا. جرّب:

```text
Consumer crashes
Consumer is slow
Message processing fails
RabbitMQ restarts
Duplicate message arrives
Queue fills up
```

وهنا تعلم هذه الأشياء:

```text
ACK / NACK
Manual acknowledgment
Prefetch
Durable Queue
Persistent Message
Retry Queue
Dead Letter Exchange
Dead Letter Queue
TTL
Idempotent Consumer
Publisher Confirms
```

مثلاً أهم تجربة جدًا:

```text
Producer
   |
   v
Main Queue
   |
   v
Consumer
   |
   X processing failed
   |
   v
Retry Queue
   |
   | after 10 seconds
   v
Main Queue
```

وبعد عدد معين من المحاولات:

```text
Main Queue
   |
   X failed
   v
DLQ
```

هنا تبدأ فعلًا تفهم RabbitMQ production-style.

وبما إنك بتدرس System Design، أنصحك تعمل مشروع تدريبي اسمه مثلًا:

```text
rabbitmq-lab
```

وتقسمه:

```text
rabbitmq-lab/
├── 01-hello-queue/
├── 02-work-queues/
├── 03-fanout/
├── 04-direct-exchange/
├── 05-topic-exchange/
├── 06-acknowledgment/
├── 07-prefetch/
├── 08-retry/
├── 09-dead-letter-queue/
├── 10-message-ttl/
├── 11-publisher-confirms/
├── 12-idempotent-consumer/
└── 13-real-order-system/
```

ولو بدك تدريب فعلي، أقترح نعمله مع بعض كـ **RabbitMQ Lab** خطوة بخطوة: أنا أعطيك Task بدون الحل، أنت تنفذه، تبعثلي الكود أو النتيجة، وأنا أراجعها وننتقل للي بعدها.

أول تمرين يكون:

```text
Task #1

Create:
- Node.js Producer
- Node.js Consumer
- RabbitMQ Queue: notifications

Producer sends:

{
  "userId": 10,
  "message": "Welcome to the platform"
}

Consumer receives the message and logs:

Notification sent to user 10
```

وبعدها نخليه أصعب تدريجيًا إلى أن نوصل لـ **retry + DLQ + idempotency + backpressure + real booking/order architecture**.
