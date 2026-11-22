import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/security.js';

export const demoAcceptance = {
  canal: 'WhatsApp',
  evidencia: 'Confirmación del cliente, DEMO-01',
  responsable: 'Recepción Demo',
};

export async function startBudgetFixture({ port = 0, logger = console } = {}) {
  const database = 'reparix_test_' + randomUUID().replaceAll('-', '');
  const ownerUrl = new URL(process.env.OWNER_DATABASE_URL);
  const appUrl = new URL(process.env.DATABASE_URL);
  const admin = new pg.Client({ connectionString: ownerUrl.href, connectionTimeoutMillis: 5000 });
  ownerUrl.pathname = appUrl.pathname = '/' + database;
  let owner, pool, server, created = false;

  async function close() {
    try {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      if (pool) await pool.end();
      if (owner) await owner.end();
      if (created) await admin.query(`DROP DATABASE "${database}"`);
    } finally {
      await admin.end();
    }
  }

  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const migration = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
      encoding: 'utf8', env: { ...process.env, OWNER_DATABASE_URL: ownerUrl.href },
    });
    assert.equal(migration.status, 0, migration.error?.message ?? migration.stderr);
    owner = new pg.Client({ connectionString: ownerUrl.href });
    await owner.connect();
    pool = new pg.Pool({ connectionString: appUrl.href });
    const password = randomUUID() + '-Demo!';
    const users = {
      recepcion: { id: randomUUID(), name: 'Ana Recepción Demo', role: 'recepcion' },
      tecnico: { id: randomUUID(), name: 'Luis Técnico Demo', role: 'tecnico' },
    };
    for (const [username, user] of Object.entries(users)) {
      await owner.query(`
        INSERT INTO reparix.internal_users(id,username,display_name,password_hash,role)
        VALUES($1,$2,$3,$4,$5)`, [user.id, username, user.name, hashPassword(password), user.role]);
    }

    const origin = `http://127.0.0.1:${port || 3000}`;
    server = createApp(pool, { origin, logger }).listen(port, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;

    async function call(route, session, data, extraHeaders = {}) {
      const response = await fetch(url + '/api' + route, {
        method: data ? 'POST' : 'GET',
        headers: {
          origin, 'Content-Type': 'application/json',
          ...(session && { Cookie: session.cookie, 'X-CSRF-Token': session.csrf }),
          ...extraHeaders,
        },
        ...(data && { body: JSON.stringify(data) }),
      });
      return { status: response.status, body: await response.json(), headers: response.headers };
    }

    async function login(username) {
      const r = await call('/session', null, { username, password });
      assert.equal(r.status, 200, r.body.message);
      return { cookie: r.headers.get('set-cookie').split(';')[0], csrf: r.body.csrfToken };
    }

    async function post(route, session, data, headers) {
      const r = await call(route, session, data, headers);
      assert.equal(r.status, 201, r.body.message);
      return r.body;
    }

    const rec = await login('recepcion');
    const tech = await login('tecnico');

    async function prepareOrder(label = 'DEMO-01') {
      const { order } = await post('/orders', rec, {
        clientName: 'Cliente ficticio ' + label, phone: '5550100000', deviceType: 'Portátil',
        brand: 'Ejemplo', model: 'Modelo demo', serialNumber: label,
        reportedFault: 'El equipo no enciende', physicalCondition: 'Carcasa con marcas de uso',
        accessories: [], accessoriesConfirmed: true, physicalCheckConfirmed: true,
      }, { 'Idempotency-Key': randomUUID() });
      const route = '/orders/' + order.folio;
      const assigned = await post(route + '/assignments', rec, {
        technicianId: users.tecnico.id, expectedVersion: order.version, note: 'Asignación de prueba',
      });
      const diagnostic = await post(route + '/state', tech, {
        state: 'En diagnóstico', expectedVersion: assigned.order.version, note: 'Inicio de diagnóstico',
      });
      const assessment = {
        diagnosis: 'Conector de carga dañado', proposedWork: 'Reemplazar conector de carga',
        amount: '1500.00', currency: 'MXN', note: 'Presupuesto de prueba',
      };
      const first = await post(route + '/assessments', tech, { ...assessment, expectedVersion: diagnostic.orderVersion });
      await post(route + '/budget-communications', rec, { presupuestoId: first.currentAssessment.id });
      const second = await post(route + '/assessments', tech, {
        ...assessment, amount: '1700.00', note: 'Revisión de importe', expectedVersion: first.orderVersion,
      });
      const pending = await post(route + '/state', tech, {
        state: 'Pendiente de autorización', expectedVersion: second.orderVersion, note: 'Diagnóstico listo',
      });
      return { order, route, pending, first: first.currentAssessment, current: second.currentAssessment };
    }

    return { database, url, owner, users, password, rec, tech, close, call, login, post, prepareOrder };
  } catch (error) {
    await close();
    throw error;
  }
}
