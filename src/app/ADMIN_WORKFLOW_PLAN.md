# Admin Workflow Plan

Owner: Harley  
Status: Manual (Phase 1)

---

# 1. Current Admin Tools

- Prisma Studio
- Stripe Dashboard
- Vercel Logs

Manual actions:
- Approve donation requests
- Verify Stripe payments
- Inspect user ledger
- Monitor abuse

---

# 2. Admin Routes (Planned)

## /admin
Dashboard overview:
- Total users
- Total credits issued
- Donation pool balance
- Pending requests

## /admin/donations
- List pending DonationRequests
- Approve
- Reject
- View request reason

## /admin/users
- View ledger
- Grant manual credits
- Suspend accounts (future)

---

# 3. Admin Actions Must Be Transactional

When approving donation:

prisma.$transaction:
- Deduct pool
- Credit user
- Mark fulfilled

Never partially execute.

---

# 4. Safety Rules

Admin must:
- Verify pool balance
- Check user history
- Avoid over-granting

Future:
Add internal audit log table.

---

# 5. Moderation Philosophy

This is a support tool.
Not a welfare system.
Not a free-credit exploit.

Be compassionate.
Be firm.
Be consistent.

---

# 6. Long-Term Admin Goals

- Internal metrics dashboard
- Abuse detection flags
- Rate limit donation requests
- Soft-ban system
- Email alerts

---

End of file.