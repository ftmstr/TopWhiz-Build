import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

/**
 * TUR118: real disposable PostgreSQL16 effective-function-EXECUTE graph.
 *
 * An existing SECURITY DEFINER function changes its owner (TUR117),
 * preserving its OID, effective EXECUTE grant to a GROUP, and rewriting
 * grantor metadata. An unrelated LOGIN inherits EXECUTE via group
 * membership; REVOKE EXECUTE FROM the LOGIN alone cannot remove this access.
 * Membership revocation cuts it off; INHERIT FALSE/SET TRUE still allows
 * the same LOGIN to SET ROLE group and cancel a foreign request.
 *
 * Intentionally vulnerable SQL function exists ONLY in disposable test.
 * It is not a production cancellation authorization design.
 */
const db = (() => { try { return new URL(process.env.TEST_DATABASE_URL || ''); } catch { return null; } })();
if (process.env.CI !== 'true' || process.env.TUR118_DISPOSABLE_PG16 !== '1' ||
    !db || db.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(db.hostname) ||
    db.port !== '5432' || db.pathname !== '/topwhiz_test' ||
    decodeURIComponent(db.username) !== 'topwhiz_test' || db.search || db.hash) {
  throw Error('TUR118 requires explicit disposable localhost PostgreSQL16');
}

const id = randomBytes(5).toString('hex');
const roleNames = ['victim', 'old_owner', 'new_owner', 'executor_group',
  'broker', 'spectator', 'guardian_owner', 'guardian_reader']
  .map(name => 'tw118_' + name + '_' + id);
const secrets = roleNames.map(() => randomBytes(20).toString('hex'));
const schema = 'tw118_gate_' + id;
const guard = 'tw118_guard_' + id;
const signature = schema + '.cancel_foreign(integer)';
const call = 'SELECT ' + schema + '.cancel_foreign($1) AS cancelled';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForSql(root, pid, fragment) {
  for (let i = 0; i < 150; i++) {
    const row = (await root.query(
      'SELECT state,query FROM pg_stat_activity WHERE pid=$1', [pid]
    )).rows[0];
    if (row?.state === 'active' && row.query.includes(fragment)) return;
    await wait(25);
  }
  throw Error('real PostgreSQL16 victim SQL never became active: ' + fragment);
}

async function beginLiveSql(client, root, pid, marker, seconds) {
  // A non-thenable wrapper avoids async Promise-adoption: do not await the
  // SQL before cancellation. See the CI-diagnosed TUR098 regression.
  const completion = client.query(
    'SELECT pg_sleep(' + seconds + '),' + marker + ' AS marker'
  ).then(row => ({ marker: row.rows[0].marker }), error => ({ error }));
  await waitForSql(root, pid, 'pg_sleep(' + seconds + ')');
  return { completion };
}

async function expectDenied(promise, code = '42501') {
  await assert.rejects(promise, error => error?.code === code);
}

async function roleSnapshot(root) {
  return (await root.query(
    'SELECT oid::text AS oid,proowner::regrole::text AS owner,' +
    'proacl::text AS acl,prosecdef,proconfig FROM pg_proc ' +
    'WHERE oid=$1::regprocedure', [signature]
  )).rows[0];
}

async function functionAllowed(root, role) {
  return (await root.query(
    'SELECT has_function_privilege($1,$2,$3) AS allowed',
    [role, signature, 'EXECUTE']
  )).rows[0].allowed;
}

async function membership(root, member, group) {
  return (await root.query(
    'SELECT pg_has_role($1,$2,$3) AS inheriting,' +
    'pg_has_role($1,$2,$4) AS settable',
    [member, group, 'USAGE', 'SET']
  )).rows[0];
}

test('real PG16 group-inherited EXECUTE survives direct REVOKE and owner transfer, SET ROLE reopens denied caller',{ timeout: 120000 }, async () => {
  const root = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  let connected = false, pool;
  const sessions = [];
  try {
    await root.connect();
    connected = true;
    const version = Number((await root.query(
      "SELECT current_setting('server_version_num') AS v"
    )).rows[0].v);
    assert.ok(version >= 160000 && version < 170000, 'actual PostgreSQL16 required');

    for (let i = 0; i < roleNames.length; i++) {
      const login = [0, 4, 5, 6, 7].includes(i) ? 'LOGIN' : 'NOLOGIN';
      await root.query(
        'CREATE ROLE ' + roleNames[i] + ' ' + login +
        ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION' +
        (login === 'LOGIN' ? " PASSWORD '" + secrets[i] + "'" : '')
      );
    }
    // The elevated NOLOGIN owner inherits only victim-backend role rights.
    // GROUP only carries EXECUTE on test function, NOT the victim role.
    await root.query('GRANT ' + roleNames[0] + ' TO ' + roleNames[2] +
      ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
    await root.query('CREATE SCHEMA ' + schema + ' AUTHORIZATION ' + roleNames[1]);
    await root.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    await root.query('GRANT USAGE, CREATE ON SCHEMA ' + schema + ' TO ' + roleNames[2]);
    await root.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' +
      roleNames[4] + ',' + roleNames[5]);
    await root.query('CREATE SCHEMA ' + guard + ' AUTHORIZATION ' + roleNames[6]);
    await root.query('CREATE TABLE ' + guard +
      '.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
    await root.query('ALTER TABLE ' + guard + '.anchor OWNER TO ' + roleNames[6]);
    await root.query('REVOKE ALL ON SCHEMA ' + guard + ' FROM PUBLIC');
    await root.query('REVOKE ALL ON ' + guard + '.anchor FROM PUBLIC');
    await root.query('GRANT USAGE ON SCHEMA ' + guard + ' TO ' + roleNames[7]);
    await root.query('GRANT SELECT ON ' + guard + '.anchor TO ' + roleNames[7]);
    await root.query("INSERT INTO " + guard + ".anchor VALUES('fictional',true,1)");

    // Explicitly revoke built-in default PUBLIC EXECUTE for old function creator.
    await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + roleNames[1] +
      ' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
    const originalSession = (await root.query('SELECT session_user AS s')).rows[0].s;
    await root.query('SET ROLE ' + roleNames[1]);
    try {
      const identity = (await root.query(
        'SELECT session_user AS s,current_user AS c'
      )).rows[0];
      assert.equal(identity.s, originalSession);
      assert.equal(identity.c, roleNames[1]);
      await root.query('CREATE FUNCTION ' + schema +
        '.cancel_foreign(in_pid integer) RETURNS boolean ' +
        'LANGUAGE plpgsql SECURITY DEFINER ' +
        'SET search_path=pg_catalog,pg_temp AS $body$ ' +
        'BEGIN RETURN pg_catalog.pg_cancel_backend(in_pid); END; $body$');
    } finally {
      await root.query('RESET ROLE');
    }
    await root.query('REVOKE ALL ON FUNCTION ' + signature + ' FROM PUBLIC');
    await root.query('GRANT EXECUTE ON FUNCTION ' + signature + ' TO ' + roleNames[3]);
    await root.query('GRANT ' + roleNames[3] + ' TO ' + roleNames[4] +
      ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
    await root.query('GRANT ' + roleNames[3] + ' TO ' + roleNames[5] +
      ' WITH ADMIN FALSE, INHERIT FALSE, SET FALSE');

    const makeUrl = i => {
      const q = new URL(process.env.TEST_DATABASE_URL);
      q.username = roleNames[i];
      q.password = secrets[i];
      return q.href;
    };
    pool = new pg.Pool({ connectionString: makeUrl(0), max: 1, idleTimeoutMillis: 30000 });
    async function login(i) {
      const c = new pg.Client({ connectionString: makeUrl(i) });
      await c.connect();
      sessions.push(c);
      const row = (await c.query(
        "SELECT session_user,rolsuper,rolcreaterole," +
        "pg_has_role(session_user,'pg_signal_backend','member') AS broad " +
        'FROM pg_roles WHERE rolname=session_user'
      )).rows[0];
      assert.equal(row.session_user, roleNames[i]);
      assert.equal(row.rolsuper, false);
      assert.equal(row.rolcreaterole, false);
      assert.equal(row.broad, false);
      return c;
    }
    const broker = await login(4);
    const spectator = await login(5);
    const guardianOwner = await login(6);
    const guardianReader = await login(7);
    const before = await roleSnapshot(root);
    assert.equal(before.owner, roleNames[1]);
    assert.equal(before.prosecdef, true);
    assert.ok(before.proconfig?.some(c => c.startsWith('search_path=')));
    assert.equal(await functionAllowed(root, roleNames[4]), true);
    assert.equal(await functionAllowed(root, roleNames[5]), false);
    assert.deepEqual(await membership(root, roleNames[4], roleNames[3]),
      { inheriting: true, settable: false });
    assert.deepEqual(await membership(root, roleNames[5], roleNames[3]),
      { inheriting: false, settable: false });

    const A = await pool.connect();
    let pid, start;
    try {
      pid = (await A.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      start = (await root.query(
        'SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [pid]
      )).rows[0].backend_start;
      assert.equal((await A.query('SELECT 118 AS marker')).rows[0].marker, 118);
    } finally { A.release(); }

    const B = await pool.connect();
    try {
      const bPid = (await B.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const bStart = (await root.query(
        'SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [bPid]
      )).rows[0].backend_start;
      assert.equal(bPid, pid);
      assert.equal(pool.totalCount, 1);
      assert.equal(new Date(start).getTime(), new Date(bStart).getTime());
      assert.notDeepEqual(
        { pid, backend_start: new Date(start).toISOString(), epoch: 1, request: 'A' },
        { pid, backend_start: new Date(bStart).toISOString(), epoch: 2, request: 'B' }
      );
      await expectDenied(broker.query('SELECT pg_cancel_backend($1)', [pid]));
      await expectDenied(spectator.query(call, [pid]));
      const preOwner = (await beginLiveSql(B, root, pid, 1181, 1.1)).completion;
      await expectDenied(broker.query(call, [pid]));
      assert.deepEqual(await preOwner, { marker: 1181 });

      // Same function OID; PostgreSQL owner transfer rewrites ACL grantor
      // metadata (TUR117), not the group grantee's effective permission.
      await root.query('ALTER FUNCTION ' + signature + ' OWNER TO ' + roleNames[2]);
      const after = await roleSnapshot(root);
      assert.equal(after.oid, before.oid);
      assert.equal(after.owner, roleNames[2]);
      assert.notEqual(after.acl, before.acl, 'grantor changes after owner change');
      assert.equal(await functionAllowed(root, roleNames[4]), true);
      assert.equal(await functionAllowed(root, roleNames[5]), false);

      const viaGroup = (await beginLiveSql(B, root, pid, 1182, 6)).completion;
      assert.equal((await broker.query(call, [pid])).rows[0].cancelled, true);
      assert.equal((await viaGroup).error?.code, '57014');
      assert.equal((await B.query('SELECT 118 AS recovered')).rows[0].recovered, 118);

      // A direct privilege REVOKE from broker is ineffective: broker has
      // no direct grant, because EXECUTE is inherited from executor_group.
      await root.query('REVOKE EXECUTE ON FUNCTION ' + signature + ' FROM ' + roleNames[4]);
      assert.equal(await functionAllowed(root, roleNames[4]), true,
        'REVOKE broker alone cannot remove inherited group EXECUTE');
      const stillGroup = (await beginLiveSql(B, root, pid, 1183, 6)).completion;
      assert.equal((await broker.query(call, [pid])).rows[0].cancelled, true);
      assert.equal((await stillGroup).error?.code, '57014');

      // Commit revocation of role membership; already-connected broker
      // loses its inherited EXECUTE immediately on next SQL statement.
      await root.query('BEGIN');
      try {
        await root.query('REVOKE ' + roleNames[3] + ' FROM ' + roleNames[4]);
        await root.query('COMMIT');
      } catch (error) {
        await root.query('ROLLBACK').catch(() => {});
        throw error;
      }
      assert.equal(await functionAllowed(root, roleNames[4]), false);
      await expectDenied(broker.query(call, [pid]));

      // Merely disabling INHERIT is not full revocation when SET remains.
      await root.query('GRANT ' + roleNames[3] + ' TO ' + roleNames[4] +
        ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');
      assert.deepEqual(await membership(root, roleNames[4], roleNames[3]),
        { inheriting: false, settable: true });
      assert.equal(await functionAllowed(root, roleNames[4]), false);
      await expectDenied(broker.query(call, [pid]));
      await broker.query('SET ROLE ' + roleNames[3]);
      try {
        const identity = (await broker.query(
          'SELECT session_user AS s,current_user AS c'
        )).rows[0];
        assert.equal(identity.s, roleNames[4]);
        assert.equal(identity.c, roleNames[3]);
        const throughSet = (await beginLiveSql(B, root, pid, 1184, 6)).completion;
        assert.equal((await broker.query(call, [pid])).rows[0].cancelled, true);
        assert.equal((await throughSet).error?.code, '57014');
      } finally { await broker.query('RESET ROLE'); }
      await expectDenied(broker.query(call, [pid]));
      await root.query('REVOKE ' + roleNames[3] + ' FROM ' + roleNames[4]);
      const safe = (await beginLiveSql(B, root, pid, 1185, 1.2)).completion;
      await expectDenied(broker.query(call, [pid]));
      assert.deepEqual(await safe, { marker: 1185 });
    } finally { B.release(); }

    await expectDenied(spectator.query('UPDATE ' + guard +
      ".anchor SET approved=true WHERE id='fictional'"));
    await guardianOwner.query('BEGIN');
    try {
      const result = await guardianOwner.query(
        'UPDATE ' + guard + ".anchor SET approved=false,generation=2 " +
        "WHERE id='fictional' AND approved=true AND generation=1"
      );
      assert.equal(result.rowCount, 1);
      await guardianOwner.query('COMMIT');
    } catch (error) {
      await guardianOwner.query('ROLLBACK').catch(() => {});
      throw error;
    }
    const state = (await guardianReader.query(
      'SELECT approved,generation FROM ' + guard +
      ".anchor WHERE id='fictional'"
    )).rows[0];
    assert.deepEqual(state, { approved: false, generation: '2' });
    console.log(JSON.stringify({
      suite: 'TUR118_PG16_GROUP_FUNCTION_EXECUTE_REVOKE_OWNER_TRANSFER_NO_GO',
      pgMajor: 16, realPgPoolMax1: true, samePidBackendStartAfterCheckout: true,
      roleOwnerChangedStableFunctionOid: true, aclGrantorRewritten: true,
      groupExecuteInheritedWithoutDirectGrant: true,
      spectatorNonInheritingMemberDenied42501: true,
      beforeOwnerTransferFunctionCancelDenied42501: true,
      afterOwnerTransferGroupCallerCancel57014: true,
      directBrokerRevokeCannotRemoveGroupExecute: true,
      continuedGroupCancel57014: true,
      membershipRevokeCommittedDenies42501: true,
      inheritFalseSetTrueDirectDenied42501: true,
      setRoleGroupCancelledForeignRequest57014: true,
      resetRoleAndMembershipRevokeDenies42501: true,
      independentGuardianCommitGeneration: '2',
      serviceSuperuserGranted: false, globalPgSignalBackendGranted: false,
      productionRequestBoundIam: 'NOT_IMPLEMENTED',
      productionNextWorkerRequestSignal: 'NOT_PROVEN',
      osPidReuseAfterDisconnect: 'NOT_TESTED',
      remoteCdnReceiverAckLastByte: 'NOT_PROVEN',
      issue22: 'OPEN', release: 'NO_GO'
    }));
  } finally {
    await root.query('RESET ROLE').catch(() => {});
    if (pool) await pool.end().catch(() => {});
    for (const c of sessions) await c.end().catch(() => {});
    if (connected) {
      await root.query('DROP OWNED BY ' + roleNames.join(',') + ' CASCADE').catch(() => {});
      await root.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
      await root.query('DROP SCHEMA IF EXISTS ' + guard + ' CASCADE').catch(() => {});
      for (const role of [...roleNames].reverse())
        await root.query('DROP ROLE IF EXISTS ' + role).catch(() => {});
    }
    await root.end().catch(() => {});
  }
});