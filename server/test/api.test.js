/**
 * Tests de bout en bout de l'API (base PostgreSQL de test + PayDunya simulé).
 * Lancer : npm test   (DATABASE_URL_TEST pour choisir la base, par défaut barkelou_test)
 */
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST || 'postgres://postgres@localhost:5432/barkelou_test'

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

const { pool, migrate, one } = await import('../db.js')
const { createApp } = await import('../app.js')
const { mock } = await import('../lib/paydunya.js')
const { invalidateSettings } = await import('../lib/settings.js')

let server
let base

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await migrate()
  invalidateSettings()
  server = createApp().listen(0)
  base = `http://localhost:${server.address().port}/api`
})
after(async () => {
  server.close()
  await pool.end()
})

/** Petit client HTTP avec mémoire de cookie (un « navigateur ») */
function agent() {
  let cookie = ''
  const call = async (method, path, body, { headers = {}, csrf = true, form = false } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(csrf ? { 'X-Barkelou': '1' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: form ? body : body ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  }
  return {
    get: (p, o) => call('GET', p, null, o),
    post: (p, b, o) => call('POST', p, b, o),
    put: (p, b, o) => call('PUT', p, b, o),
    patch: (p, b, o) => call('PATCH', p, b, o),
    del: (p, o) => call('DELETE', p, null, o),
  }
}

const PASSWORD = 'motdepasse-solide-1'
let phoneN = 1000
async function newUser(name = 'Awa Diop', phone) {
  const a = agent()
  const p = phone || `77${String(++phoneN).padStart(7, '0')}`
  const r = await a.post('/auth/register', { name, phone: p, password: PASSWORD })
  assert.equal(r.status, 201, JSON.stringify(r.data))
  a.user = r.data.user
  return a
}

async function newAdmin() {
  const a = await newUser('Admin Barkelou')
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [a.user.id])
  return a
}

const STORY = 'Une histoire suffisamment longue pour passer la validation du serveur.'
async function newCampaign(owner, extra = {}) {
  const r = await owner.post('/campaigns', { title: 'Cagnotte de test', category: 'solidarite', story: STORY, goal: 1_000_000, ...extra })
  assert.equal(r.status, 201, JSON.stringify(r.data))
  return r.data.campaign
}

/** Paie une participation via le simulateur et l'IPN signée */
async function pay(campaignId, amount, opts = {}) {
  const donor = agent()
  const r = await donor.post('/payments', { campaignId, amount, name: 'Moussa Ndiaye', channel: 'wave' })
  assert.equal(r.status, 201, JSON.stringify(r.data))
  mock.settle(r.data.token, opts.outcome || 'completed', { tamperAmount: opts.tamperAmount })
  const body = new URLSearchParams({ 'data[hash]': opts.hash || mock.hash(), 'data[invoice][token]': r.data.token, 'data[status]': 'completed' })
  const ipn = await donor.post('/payments/ipn', body.toString(), { form: true, csrf: false })
  return { ...r.data, ipnStatus: ipn.status }
}

/* ------------------------------------------------------------------ */

test('inscription : mot de passe faible et numéro invalide refusés, doublon refusé', async () => {
  const a = agent()
  assert.equal((await a.post('/auth/register', { name: 'Test', phone: '771112233', password: 'court' })).status, 400)
  assert.equal((await a.post('/auth/register', { name: 'Test', phone: '601112233', password: PASSWORD })).status, 400)
  assert.equal((await a.post('/auth/register', { name: 'Test', phone: '771112233', password: PASSWORD })).status, 201)
  assert.equal((await agent().post('/auth/register', { name: 'Autre', phone: '+221 77 111 22 33', password: PASSWORD })).status, 400)
  const me = await a.get('/auth/me')
  assert.equal(me.data.user.phone, '771112233')
  assert.equal(me.data.user.password_hash, undefined)
})

test('CSRF : en-tête manquant ou origine étrangère refusés', async () => {
  const a = agent()
  assert.equal((await a.post('/auth/login', { phone: '771112233', password: PASSWORD }, { csrf: false })).status, 403)
  assert.equal((await a.post('/auth/login', { phone: '771112233', password: PASSWORD }, { headers: { Origin: 'https://pirate.example' } })).status, 403)
})

test('connexion : verrouillage après 5 échecs, même avec le bon mot de passe', async () => {
  const u = await newUser()
  const a = agent()
  for (let i = 0; i < 5; i++) assert.equal((await a.post('/auth/login', { phone: u.user.phone, password: 'mauvais-mdp' })).status, 400)
  assert.equal((await a.post('/auth/login', { phone: u.user.phone, password: PASSWORD })).status, 429)
})

test('cagnotte : image falsifiée refusée, modification interdite aux autres', async () => {
  const owner = await newUser()
  const fake = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`
  assert.equal((await owner.post('/campaigns', { title: 'Image piégée', category: 'projet', story: STORY, goal: 50_000, cover: fake })).status, 400)
  const c = await newCampaign(owner)
  const intruder = await newUser('Intrus')
  assert.equal((await intruder.patch(`/campaigns/${c.id}`, { title: 'Piratée !!' })).status, 403)
  assert.equal((await intruder.del(`/campaigns/${c.id}`)).status, 403)
})

test('paiement : commission déduite, IPN vérifiée, montants publics corrects', async () => {
  const owner = await newUser()
  const c = await newCampaign(owner)
  const p = await pay(c.id, 10_000)
  assert.equal(p.ipnStatus, 200)
  assert.equal(p.total_charged, 10_000)
  assert.equal(p.commission, 500) // 5 % par défaut
  const st = await agent().get(`/payments/${p.token}`)
  assert.equal(st.data.status, 'paid')
  const pub = await agent().get(`/campaigns/${c.slug}`)
  assert.equal(pub.data.campaign.raised, 10_000)
  assert.equal(pub.data.balance, undefined) // le solde n'est visible que par le propriétaire
  const mine = await owner.get(`/campaigns/${c.slug}`)
  assert.equal(mine.data.balance.available, 9_500)
})

test('paiement : IPN à la signature invalide ignorée', async () => {
  const owner = await newUser()
  const c = await newCampaign(owner)
  const p = await pay(c.id, 5_000, { hash: 'deadbeef' })
  assert.equal(p.ipnStatus, 401)
  const k = await one('SELECT status FROM contributions WHERE provider_token = $1', [p.token])
  assert.equal(k.status, 'pending')
})

test('paiement : montant payé différent du montant attendu → rejeté', async () => {
  const owner = await newUser()
  const c = await newCampaign(owner)
  const p = await pay(c.id, 50_000, { tamperAmount: 100 })
  const k = await one('SELECT status FROM contributions WHERE provider_token = $1', [p.token])
  assert.equal(k.status, 'failed')
  const mine = await owner.get(`/campaigns/${c.slug}`)
  assert.equal(mine.data.balance.available, 0)
})

test('paiement : limites min/max et cagnotte clôturée', async () => {
  const owner = await newUser()
  const c = await newCampaign(owner)
  const d = agent()
  assert.equal((await d.post('/payments', { campaignId: c.id, amount: 100, name: 'Test', channel: 'wave' })).status, 400)
  assert.equal((await d.post('/payments', { campaignId: c.id, amount: 99_000_000, name: 'Test', channel: 'wave' })).status, 400)
  await owner.patch(`/campaigns/${c.id}`, { status: 'closed' })
  assert.equal((await d.post('/payments', { campaignId: c.id, amount: 5_000, name: 'Test', channel: 'wave' })).status, 400)
})

test('retrait : mot de passe, solde, numéro du compte et autres propriétaires contrôlés', async () => {
  const owner = await newUser()
  const c = await newCampaign(owner)
  await pay(c.id, 20_000) // net 19 000
  const base = { amount: 5_000, method: 'wave', phone: owner.user.phone }
  assert.equal((await owner.post(`/campaigns/${c.id}/withdrawals`, { ...base, password: 'faux' })).status, 400)
  assert.equal((await owner.post(`/campaigns/${c.id}/withdrawals`, { ...base, amount: 50_000, password: PASSWORD })).status, 400)
  assert.equal((await owner.post(`/campaigns/${c.id}/withdrawals`, { ...base, phone: '781234567', password: PASSWORD })).status, 400)
  const intruder = await newUser('Voleur')
  assert.equal((await intruder.post(`/campaigns/${c.id}/withdrawals`, { ...base, phone: intruder.user.phone, password: PASSWORD })).status, 403)

  const ok = await owner.post(`/campaigns/${c.id}/withdrawals`, { ...base, password: PASSWORD })
  assert.equal(ok.status, 201, JSON.stringify(ok.data))
  assert.equal(ok.data.withdrawal.status, 'success')
  const bal = await owner.get(`/campaigns/${c.id}/balance`)
  assert.equal(bal.data.balance.available, 14_000)
})

test('retrait : 5 demandes simultanées ne peuvent pas dépasser le solde', async () => {
  const owner = await newUser()
  const c = await newCampaign(owner)
  await pay(c.id, 10_000) // net 9 500
  const results = await Promise.all(
    Array.from({ length: 5 }, () => owner.post(`/campaigns/${c.id}/withdrawals`, { amount: 6_000, method: 'wave', phone: owner.user.phone, password: PASSWORD }))
  )
  assert.equal(results.filter((r) => r.status === 201).length, 1)
  const bal = await owner.get(`/campaigns/${c.id}/balance`)
  assert.equal(bal.data.balance.available, 3_500)
})

test('retrait échoué chez l’opérateur : le solde est restitué', async () => {
  const owner = await newUser('Owner Echec', '771234000') // numéro « …000 » : échec simulé
  const c = await newCampaign(owner)
  await pay(c.id, 10_000)
  const r = await owner.post(`/campaigns/${c.id}/withdrawals`, { amount: 9_500, method: 'orange', phone: owner.user.phone, password: PASSWORD })
  assert.equal(r.data.withdrawal.status, 'failed')
  const bal = await owner.get(`/campaigns/${c.id}/balance`)
  assert.equal(bal.data.balance.available, 9_500)
})

test('admin : accès refusé aux utilisateurs, paramètres protégés par mot de passe, secrets chiffrés', async () => {
  const user = await newUser()
  assert.equal((await user.get('/admin/overview')).status, 403)
  assert.equal((await agent().get('/admin/settings')).status, 401)

  const admin = await newAdmin()
  assert.equal((await admin.put('/admin/settings', { commission_rate: 3 })).status, 400) // sans mot de passe
  assert.equal((await admin.put('/admin/settings', { commission_rate: 80, password: PASSWORD })).status, 400) // hors limites
  const ok = await admin.put('/admin/settings', { commission_rate: 3, paydunya_master_key: 'MASTER-SECRET-1234', password: PASSWORD })
  assert.equal(ok.status, 200, JSON.stringify(ok.data))
  assert.equal(ok.data.settings.paydunya_master_key, '')
  assert.equal(ok.data.settings.paydunya_master_key_hint, '••••1234')
  const raw = await one(`SELECT value FROM settings WHERE key = 'paydunya_master_key'`)
  assert.ok(!JSON.stringify(raw.value).includes('MASTER-SECRET'))
  const pub = await agent().get('/settings')
  assert.equal(pub.data.commission_rate, 3)
  assert.equal(pub.data.paydunya_master_key, undefined)
  await admin.put('/admin/settings', { commission_rate: 5, password: PASSWORD })
})

test('admin : frais payés par le donateur', async () => {
  const admin = await newAdmin()
  await admin.put('/admin/settings', { fee_payer: 'donor', password: PASSWORD })
  const owner = await newUser()
  const c = await newCampaign(owner)
  const p = await pay(c.id, 10_000)
  assert.equal(p.total_charged, 10_500)
  const mine = await owner.get(`/campaigns/${c.slug}`)
  assert.equal(mine.data.balance.available, 10_000)
  await admin.put('/admin/settings', { fee_payer: 'organizer', password: PASSWORD })
})

test('admin : retraits en validation manuelle, approbation puis paiement', async () => {
  const admin = await newAdmin()
  await admin.put('/admin/settings', { withdrawal_mode: 'manual', withdrawal_fee_rate: 1, password: PASSWORD })
  const owner = await newUser()
  const c = await newCampaign(owner)
  await pay(c.id, 10_000)
  const r = await owner.post(`/campaigns/${c.id}/withdrawals`, { amount: 9_000, method: 'wave', phone: owner.user.phone, password: PASSWORD })
  assert.equal(r.data.withdrawal.status, 'pending_review')
  assert.equal(r.data.withdrawal.payout, 8_910)
  assert.equal((await owner.post(`/admin/withdrawals/${r.data.withdrawal.id}/approve`, { password: PASSWORD })).status, 403)
  const ap = await admin.post(`/admin/withdrawals/${r.data.withdrawal.id}/approve`, { password: PASSWORD })
  assert.equal(ap.data.withdrawal.status, 'success')
  assert.equal((await admin.post(`/admin/withdrawals/${r.data.withdrawal.id}/approve`, { password: PASSWORD })).status, 400)
  await admin.put('/admin/settings', { withdrawal_mode: 'automatic', withdrawal_fee_rate: 0, password: PASSWORD })
})

test('admin : suspension d’un compte = déconnexion immédiate ; suspension d’une cagnotte = retraits bloqués', async () => {
  const admin = await newAdmin()
  const owner = await newUser()
  const c = await newCampaign(owner)
  await pay(c.id, 10_000)
  await admin.patch(`/admin/campaigns/${c.id}`, { status: 'suspended' })
  assert.equal((await owner.post(`/campaigns/${c.id}/withdrawals`, { amount: 5_000, method: 'wave', phone: owner.user.phone, password: PASSWORD })).status, 403)
  assert.equal((await agent().get(`/campaigns/${c.slug}`)).status, 404)
  await admin.patch(`/admin/users/${owner.user.id}`, { status: 'suspended' })
  assert.equal((await owner.get('/auth/me')).data.user, null)
})

test('maintenance : paiements bloqués, lecture possible', async () => {
  const admin = await newAdmin()
  const owner = await newUser()
  const c = await newCampaign(owner)
  await admin.put('/admin/settings', { maintenance_mode: true, password: PASSWORD })
  assert.equal((await agent().post('/payments', { campaignId: c.id, amount: 5_000, name: 'Test', channel: 'wave' })).status, 503)
  assert.equal((await agent().get('/campaigns')).status, 200)
  await admin.put('/admin/settings', { maintenance_mode: false, password: PASSWORD })
})

test('injection SQL dans la recherche sans effet', async () => {
  const r = await agent().get(`/campaigns?q=${encodeURIComponent("'; DROP TABLE users; --")}`)
  assert.equal(r.status, 200)
  assert.ok(await one('SELECT 1 FROM users LIMIT 1'))
})
