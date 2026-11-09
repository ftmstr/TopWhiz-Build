# TUR026 Queue recovery report
Broker ACK, database COMMIT and local stream EOF are separate observations. None alone establishes end-recipient receipt, and uncertain COMMIT plus concurrent Queue/DLQ lease/retry can duplicate effects.
No broker, PostgreSQL, Queue or DLQ integration was exercised by the new synthetic test. Keep idempotency, fencing and reconciliation NO-GO until independent evidence exists.
