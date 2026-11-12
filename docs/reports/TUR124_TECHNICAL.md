# TOPWHIZ TUR124 — Active PostgreSQL16 SET ROLE after committed membership revocation (2026-11-12)

**Stack:** Public ftmstr/TopWhiz-Build only; TUR123 Draft PR #129 exact parent HEAD `6cb892dc379a731f33ec4491c843fe8c8fa66984` (19/19 real PR workflows SUCCESS, dedicated run #43239626439 SUCCESS). TUR124 was absent before creating this branch. New Draft PR must target TUR123 branch, never main.

## Novel experiment and falsifiable assertion
A disposable physical PostgreSQL16 instance has restricted victim, broker, independent rights-admin and spectator LOGINs, plus NOLOGIN definer/executor/relay. The broker receives only a transitive broker→relay→executor SET TRUE/INHERIT FALSE chain; executor alone holds EXECUTE on a TEST-ONLY SECURITY DEFINER cancellation function. A real node-postgres pg.Pool(max:1) A→B reuses the same backend PID and backend_start while the request identity changes.

The broker first performs `SET ROLE executor`. An independently authenticated rights-admin then REVOKEs broker→relay and COMMITs. The key novel question, distinct from TUR123, is whether **already active** `current_user=executor` survives that COMMIT even though `pg_has_role(broker,executor,'SET')` is now false. The adversarial test expects the active executor to remain authorized to call the test-only function and cancel another request B's physical SQL (57014). After `RESET ROLE`, fresh SET ROLE and direct function invocation must fail 42501, and victim B's final SQL must complete. A test failure is a failure, not a success or production proof.

Dedicated Ubuntu24 postgres:16/Node22/frozen pnpm CI also re-executes TUR123/118/117/116/115/114/113/110/107/098/097/096/095/092 PG16, TUR122–119 HTTP2 304, TUR112/111/109/108 guardian, TUR030 uncertain COMMIT, TUR019 SECDEF, TUR018 canonical original outbox SHA/route allowlist, TUR017 Queue/DLQ and TUR002 AGPL/LGPL/libvips hard holds. Existing local Next/vinext/workerd and Chromium accessibility/SEO/performance workflows remain unmodified.

**Evidence state at report commit:** local independent PG16 NOT_RUN; new real CI must be read back on exact final HEAD, including job logs. A JavaScript parse or workflow trigger alone is NOT acceptance.

Issue #22 OPEN / RELEASE NO-GO. TUR018 12 negative cases / 99,276 fictional bytes and TUR019 cross-isolate bypass are historical negative evidence, not a guarantee. Actual CDN/R2 receiver last byte, native Next/Worker Request.signal, independent production IAM, brand TOPWHIZ/TOPWIZ and source rights are NOT_PROVEN. No production changes, main merge or live services.