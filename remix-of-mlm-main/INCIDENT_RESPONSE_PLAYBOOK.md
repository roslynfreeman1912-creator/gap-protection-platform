# GAP Protection — Incident Response Playbook

## Classification

| Severity | Response Time | Escalation |
|----------|--------------|------------|
| P1 — Critical | 15 min | CEO + CTO immediately |
| P2 — High | 1 hour | CTO + Security Lead |
| P3 — Medium | 4 hours | Security Lead |
| P4 — Low | 24 hours | Engineering team |

## Scenario 1: Service Role Key Compromise

**Severity**: P1 — Critical
**Blast Radius**: TOTAL SYSTEM COMPROMISE

### Immediate Actions (0-15 min)
1. **ENABLE MAINTENANCE MODE**: Set `MAINTENANCE_MODE=true` in Supabase env
2. **Rotate Service Role Key**: Supabase Dashboard → Settings → API → Regenerate service_role key
3. **Update all Edge Functions**: Redeploy with new key
4. **Invalidate all sessions**: `supabase.auth.admin.signOut()` for all users
5. **Check audit_log**: `SELECT * FROM audit_log WHERE created_at > '[compromise_time]' ORDER BY created_at DESC`

### Investigation (15 min - 4 hours)
1. Check wallet balances vs financial_ledger: `SELECT * FROM check_wallet_drift()`
2. Check commission anomalies: `SELECT * FROM check_commission_anomalies()`
3. Review all admin actions in audit_log
4. Check if any new admin/super_admin roles were created
5. Check if PII was decrypted: `SELECT * FROM audit_log WHERE action = 'PII_DECRYPT'`

### Recovery
1. If wallet drift detected: Freeze affected wallets, manual reconciliation
2. If unauthorized commissions: Mark as 'cancelled', reverse wallet credits
3. If PII exposed: DSGVO Article 33 notification within 72 hours

---

## Scenario 2: Admin Account Compromise

**Severity**: P1 — Critical

### Immediate Actions
1. Disable compromised admin: `UPDATE profiles SET status = 'suspended' WHERE id = '[admin_id]'`
2. Remove all roles: `DELETE FROM user_roles WHERE user_id = '[admin_id]'`
3. Force password reset via Supabase Auth admin
4. Review all actions by this admin in audit_log
5. Check for unauthorized role grants, profile changes, withdrawals

---

## Scenario 3: Fraudulent Commission Activity

**Severity**: P2 — High

### Detection
- `check_commission_anomalies()` returns results
- Unusual commission velocity (>10/hour for single partner)
- Commission amounts exceeding matrix maximums

### Response
1. Run `SELECT * FROM check_commission_anomalies()`
2. Identify affected transactions and partners
3. Set commissions to 'cancelled': `UPDATE commissions SET status = 'cancelled' WHERE id IN (...)`
4. Reverse wallet credits if already credited
5. Flag partner accounts for manual review
6. Cross-reference with financial_ledger for full audit trail

---

## Scenario 4: Data Breach / PII Exposure

**Severity**: P1 — Critical (DSGVO)

### Legal Requirements
- **72-hour notification**: Must notify supervisory authority (Datenschutzbehörde)
- **Without undue delay**: Must notify affected individuals if high risk

### Technical Response
1. Identify scope: Which tables, which records, which time period
2. Check if plaintext PII exists: `SELECT id FROM profiles WHERE iban IS NOT NULL AND iban != ''`
3. Check decrypt audit: `SELECT * FROM audit_log WHERE action = 'PII_DECRYPT'`
4. Verify encryption key was not exposed
5. If key exposed: Re-encrypt all PII with new key

### Documentation Required
- Nature of breach
- Categories/count of affected individuals
- Likely consequences
- Measures taken

---

## Scenario 5: Wallet Balance Manipulation

**Severity**: P1 — Critical

### Detection
- `check_wallet_drift()` returns non-zero drift
- Unexpected wallet_transactions entries
- financial_ledger shows unmatched entries

### Response
1. **FREEZE**: Set `MAINTENANCE_MODE=true`
2. Run drift detection: `SELECT * FROM check_wallet_drift()`
3. Compare wallet_transactions vs financial_ledger
4. Identify manipulation vector (which function, which user)
5. Restore correct balances from financial_ledger
6. File fraud report if external actor

---

## Contact List

| Role | Contact | Backup |
|------|---------|--------|
| CEO | [configured] | — |
| CTO | [configured] | — |
| Security Lead | [configured] | — |
| Supabase Support | support@supabase.com | — |
| DSGVO Officer | [configured] | — |
| Legal Counsel | [configured] | — |

## Post-Incident

1. Conduct post-mortem within 48 hours
2. Document root cause, timeline, impact
3. Implement preventive measures
4. Update this playbook if needed
5. Brief stakeholders/investors if required
