# AI QA Automation Platform — Stripe Billing & Subscriptions (Phase 3)

**Author:** Senior Principal Engineer  
**Status:** **PHASE 3 COMPLETE & VERIFIED**

---

## 1. Stripe Billing Architecture

```
                                ┌─────────────────────────┐
                                │   Angular Frontend UI   │
                                └────────────┬────────────┘
                                             │ REST API
                                             ▼
                                ┌─────────────────────────┐
                                │     BillingService      │
                                └──────┬────────────┬─────┘
                                       │            │
             ┌─────────────────────────┘            └─────────────────────────┐
             ▼                                                                ▼
┌─────────────────────────┐                                      ┌─────────────────────────┐
│ Real Stripe Node.js SDK │                                      │ Stripe Webhook Handler  │
│ (Customer, Checkout,    │                                      │ (express.raw Buffer +   │
│  Billing Portal)        │                                      │  signature verification)│
└────────────┬────────────┘                                      └────────────┬────────────┘
             │                                                                │
             └──────────────────────────┬─────────────────────────────────────┘
                                        ▼
                         ┌──────────────────────────────┐
                         │ PostgreSQL Database (Prisma) │
                         │ - Subscription               │
                         │ - UsageRecord                │
                         └──────────────────────────────┘
```

---

## 2. Environment Configuration

| Variable | Description |
| :--- | :--- |
| `STRIPE_SECRET_KEY` | Stripe Secret Key (`sk_test_*` in test mode). |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Secret (`whsec_*` for signature validation). |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Publishable Key (`pk_test_*`). |
| `STRIPE_STARTER_PRICE_ID` | Stripe Price ID for Starter Plan. |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for Pro Plan. |
| `STRIPE_ENTERPRISE_PRICE_ID` | Stripe Price ID for Enterprise Plan. |

---

## 3. Stripe Customer & Subscription Lifecycle

- **Organization Mapping**: Each platform `Organization` is linked to a single Stripe Customer ID (`stripeCustomerId` in `Subscription` table). `ensureStripeCustomer()` creates customers idempotently.
- **Checkout Flow**: Frontend calls `POST /api/billing/checkout` -> Backend creates real Stripe Checkout Session (`stripe.checkout.sessions.create()`) -> User completes checkout on Stripe -> State updated via Webhooks.
- **Billing Portal**: Frontend calls `POST /api/billing/portal` -> Backend creates Stripe Billing Portal Session (`stripe.billingPortal.sessions.create()`).
- **Subscription States**: `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `UNPAID`.

---

## 4. Webhook Security & Idempotency

- **Raw Request Body**: Endpoint `POST /api/billing/webhook` uses `express.raw({ type: 'application/json' })` registered BEFORE JSON parsers.
- **Signature Verification**: Validates requests via `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)`. Invalid or missing signatures return `HTTP 400 Bad Request`.
- **Idempotency**: Webhook event IDs (`event.id`) are tracked in memory (`processedEvents` set) and persisted to avoid duplicate processing on Stripe retries.

---

## 5. Webhook Events Supported

1. `checkout.session.completed`: Updates subscription plan and status upon payment.
2. `customer.subscription.created`: Maps initial subscription status.
3. `customer.subscription.updated`: Syncs active/past_due status changes.
4. `customer.subscription.deleted`: Marks subscription status as `CANCELED`.
5. `invoice.payment_failed`: Marks subscription status as `PAST_DUE`.

---

## 6. Usage Metering & Quota Enforcement

- **Quota Limits**:
  - `STARTER`: 100 executions/month
  - `PRO`: 5,000 executions/month
  - `ENTERPRISE`: 100,000 executions/month
- **Server-Side Enforcement**: `checkQuotaLimit()` checks monthly execution count against quota limit and returns `HTTP 402 Payment Required` when exceeded.

---

## 7. Automated Test Suite

- **Unit & Resiliency Suite**: `tests/stripe-billing.test.js` (8 test scenarios).
- **Live Integration Testing**: Enable by setting `RUN_STRIPE_INTEGRATION_TESTS=true` and configuring `STRIPE_SECRET_KEY`.
