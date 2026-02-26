# Credits System Deep Dive

Status: Stable  
Design: Ledger-based accounting

---

# 1. Core Principle

Credits are NEVER stored as a number on User.

They are calculated:

SUM(CreditsLedger.delta)

This prevents:
- Desync
- Double-spend
- Client manipulation
- Race conditions

---

# 2. CreditsLedger Model

Fields:
- id
- userId
- delta (positive or negative)
- reason
- ref
- createdAt

Unique constraint:
@@unique([userId, ref])

Purpose:
Prevent duplicate Stripe webhook credits.

---

# 3. Credit Sources

## Signup Bonus
+25 credits

## Daily Login Bonus
+10 credits
Guarded by:
lastDailyBonusAt

## Stripe Purchase
+X credits
Ref = stripeEventId

## Donation Fulfillment
+X credits to user
-X credits from pool

## Rewrite / PDF Export
Negative delta

---

# 4. Idempotency

Stripe retries happen.

Solution:
Use event.id as ref.
Unique constraint prevents double credit.

If P2002:
Ignore safely.

---

# 5. Calculating Credits

Server-side:

aggregate({
  _sum: { delta: true }
})

Never trust client state.

---

# 6. Future Improvements

- Separate “free” vs “paid” credit classification
- Credit expiration for free credits
- Premium-only donation eligibility

---

# 7. Why Ledger > Counter

Ledger:
- Auditable
- Reversible
- Transparent
- Immutable history

Counter:
- Error prone
- Vulnerable
- Hard to debug

Ledger wins.

---

End of file.