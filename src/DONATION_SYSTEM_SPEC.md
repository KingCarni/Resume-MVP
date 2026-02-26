# Donation System Specification

Owner: Harley  
Status: Phase 1 (Pool + Requests)  
Goal: Allow community-funded credits to support job seekers.

---

# 1. Philosophy

The donation system must:

- Prevent abuse
- Protect paid credits
- Avoid free-credit laundering
- Remain manually moderated
- Be transparent but not gamified

This is not a giveaway machine.
It is a support mechanism.

---

# 2. Architecture Overview

There are 3 actors:

1. Donor
2. Pool (internal user)
3. Requesting user

Flow:

Stripe Purchase → Credits added to donation_pool →  
User submits request → Admin reviews →  
If approved → Credits transferred → Mark fulfilled

---

# 3. Database Design

## DonationRequest

Fields:
- id
- userId
- requestedCredits
- reason
- status (pending, approved, rejected, fulfilled)
- reviewNote
- createdAt
- updatedAt

Indexes:
- [status, createdAt]
- [userId, createdAt]

---

## donation_pool (User)

Internal user:
ID: donation_pool
Email: donation-pool@internal.local

Purpose:
- Holds pooled credits
- Source of donation transfers

---

# 4. Stripe Donation Flow

Donation purchases:
- Use Stripe Checkout
- Metadata:
  - userId = donation_pool
  - credits = amount
  - pack = "donation"

Webhook:
- Adds credits to donation_pool ledger
- Ref = stripeEventId

Donations are real paid credits only.

Free credits CANNOT be donated.

---

# 5. Admin Review Flow (Manual)

Phase 1:
- Admin reviews Prisma Studio
- Looks at DonationRequest table
- Approves manually via DB update

Phase 2 (UI planned):
- /admin/donations
- View pending
- Approve / Reject
- Automatically:
  - Debit donation_pool
  - Credit target user
  - Mark fulfilled

---

# 6. Credit Transfer Rules

When fulfilling a donation:

Transaction:

1. Verify pool has sufficient credits
2. Insert ledger:
   - donation_pool: delta = -X
   - target_user: delta = +X
3. Mark DonationRequest fulfilled

Must use Prisma transaction.

---

# 7. Abuse Protection

Must prevent:
- Multiple rapid requests
- Self-funding via alternate accounts
- Credit farming

Planned rules:
- Minimum account age before requesting
- Cooldown between requests
- Manual admin discretion

---

# 8. Future Transparency

Optional:
- Public donation counter
- “Credits helped” counter
- Anonymous donor wall

But:
Do not gamify hardship.

---

End of file.