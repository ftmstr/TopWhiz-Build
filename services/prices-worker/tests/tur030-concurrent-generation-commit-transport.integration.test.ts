import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// Disposable PostgreSQL 16 only. No production credentials, IAM or R2 access.
const URI = process.env.TEST_DATABASE_URL;
if (!URI || !['127.0.0.1', 'localhost'].includes(new URL(URI).hostname))
  throw Error('TUR030 requires an explicit localhost disposable TEST_DATABASE_URL');

test('TUR030: two independent login sessions race a monotonic generation CAS; stale resurrection denied', async () => {
  const suffix = randomBytes(5).toString('hex');
  const schema = 'tw030_' + suffix;
  const roles = ['writer_a', 'writer_b'].map(x => 'tw030_' + x + '_' + suffix);
  const secrets = roles.map(() => randomBytes(18).toString('hex'));
  const admin = new pg.Client({ connectionString: URI });
  await admin.connect();
  const clients: pg.Client[] = [];
  try {
    for (let i = 0; i < roles.length; i++)
      await admin.query('CREATE ROLE ' + roles[i] + ' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ' + "'" + secrets[i] + "'");
    await admin.query('CREATE SCHEMA ' + schema);
    await admin.query('CREATE TABLE ' + schema + '.fence (id int PRIMARY KEY, generation bigint NOT NULL, revoked boolean NOT NULL, CHECK (generation > 0))');
    await admin.query('INSERT INTO ' + schema + '.fence VALUES (1,1,false)');
    await admin.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    for (const role of roles) {
      await admin.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' + role);
      await admin.query('GRANT SELECT,UPDATE(generation,revoked) ON ' + schema + '.fence TO ' + role);
    }
    for (let i = 0; i < roles.length; i++) {
      const url = new URL(URI!);
      url.username = roles[i]; url.password = secrets[i];
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      assert.equal((await client.query('SELECT session_user AS u')).rows[0].u, roles[i]);
      clients.push(client);
    }
    const sql = 'UPDATE ' + schema + '.fence SET generation=generation+1, revoked=true WHERE id=1 AND generation=1 AND revoked=false RETURNING generation';
    const results = await Promise.all(clients.map(c => c.query(sql)));
    assert.deepEqual(results.map(x => x.rowCount).sort(), [0, 1]);
    assert.equal((await admin.query('SELECT generation,revoked FROM ' + schema + '.fence WHERE id=1')).rows[0].generation, '2');
    assert.equal((await admin.query('SELECT revoked FROM ' + schema + '.fence WHERE id=1')).rows[0].revoked, true);
    // Stale generation cannot resurrect an already-revoked right.
    assert.equal((await clients[0].query('UPDATE ' + schema + '.fence SET revoked=false WHERE id=1 AND generation=1 RETURNING id')).rowCount, 0);
    // Owner/superuser can still bypass app CAS: this is a negative security finding, not a fix.
    await admin.query('UPDATE ' + schema + '.fence SET revoked=false, generation=1 WHERE id=1');
    assert.deepEqual((await clients[1].query('SELECT generation,revoked FROM ' + schema + '.fence WHERE id=1')).rows[0], {generation:'1',revoked:false});
    console.log(JSON.stringify({suite:'TUR030_REAL_PG16_CAS_RACE',independentLogins:2,oneWinnerOneDenied:true,staleGenerationRejected:true,privilegedOwnerBypass:true,externalIAM:'NOT_IMPLEMENTED',release:'NO_GO'}));
  } finally {
    for (const c of clients) await c.end().catch(() => {});
    await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
    for (const role of roles) await admin.query('DROP ROLE IF EXISTS ' + role).catch(() => {});
    await admin.end();
  }
});

test('TUR030: real COMMIT sent then client transport destroyed; outcome reconciled by durable readback', async () => {
  const suffix = randomBytes(5).toString('hex');
  const schema = 'tw030_ack_' + suffix;
  const admin = new pg.Client({ connectionString: URI });
  await admin.connect();
  let writer: pg.Client | undefined;
  try {
    await admin.query('CREATE SCHEMA ' + schema);
    await admin.query('CREATE TABLE ' + schema + '.receipts (token text PRIMARY KEY, generation bigint NOT NULL)');
    writer = new pg.Client({connectionString: URI});
    // Expected async socket error from intentional transport destruction must be observed,
    // not reported as an unrelated uncaught test-runner exception.
    const transportErrors: string[] = [];
    writer.on('error', err => { transportErrors.push(err.message); });
    await writer.connect();
    const token = randomBytes(16).toString('hex');
    await writer.query('BEGIN');
    await writer.query('INSERT INTO ' + schema + '.receipts VALUES ($1,2)', [token]);
    // Send real COMMIT and immediately destroy transport. This is intentionally nondeterministic:
    // COMMIT may or may not reach PG; never treat missing ACK as success or safe retry.
    const pending = writer.query('COMMIT').then(() => 'ACK').catch(() => 'UNKNOWN');
    writer.connection.stream.destroy();
    const ack = await pending;
    await writer.end().catch(() => {}); writer = undefined;
    const state = await admin.query('SELECT generation FROM ' + schema + '.receipts WHERE token=$1', [token]);
    assert.ok(state.rowCount === 0 || state.rowCount === 1);
    if (state.rowCount === 1) assert.equal(state.rows[0].generation, '2');
    assert.ok(ack === 'ACK' || ack === 'UNKNOWN');
    // Evidence is readback; transport ACK by itself is not a global publication receipt.
    console.log(JSON.stringify({suite:'TUR030_REAL_PG16_COMMIT_TRANSPORT_CUT',commitAck:ack,readback:state.rowCount===1?'COMMITTED':'NOT_VISIBLE',outcomeReconciled:true,globalLastByte:'NOT_PROVEN',release:'NO_GO'}));
  } finally {
    if (writer) {writer.connection.stream.destroy(); await writer.end().catch(() => {});}
    await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
    await admin.end();
  }
});
