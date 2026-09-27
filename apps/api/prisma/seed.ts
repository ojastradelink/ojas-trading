/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface SeedData {
  products: { code: string; name: string; unit: string }[];
  parties: { name: string; type: string; city: string | null; phone: string | null; notes: string | null }[];
  direct: any[];
  degum: any[];
}

const data: SeedData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf-8'),
);

// ── Permission catalogue ────────────────────────────────────────────────────
const RESOURCES = [
  'dashboard', 'party', 'product', 'deal', 'degum', 'audit', 'user', 'settings',
];
const ACTIONS = ['read', 'create', 'update', 'delete'];
const EXTRA = ['report:export'];

function permissionKeys(): string[] {
  const k = new Set<string>();
  for (const r of RESOURCES) for (const a of ACTIONS) k.add(`${r}:${a}`);
  for (const e of EXTRA) k.add(e);
  return [...k];
}

const ROLE_POLICY: Record<string, (k: string) => boolean> = {
  ADMIN: () => true,
  MANAGEMENT: (k) => k.endsWith(':read') || k === 'report:export',
  TRADER: (k) =>
    k.startsWith('dashboard') || k.startsWith('party') || k.startsWith('product') ||
    k.startsWith('deal:') || k.startsWith('degum:'),
  // Finance records duty / final payment; Operations tracks vessels — both fill in Degum details.
  FINANCE: (k) =>
    k.startsWith('dashboard') || k === 'report:export' ||
    k === 'party:read' || k === 'product:read' || k === 'deal:read' || k === 'degum:read' || k === 'degum:update',
  OPERATIONS: (k) =>
    k.startsWith('dashboard') || k === 'deal:read' || k === 'party:read' || k === 'product:read' ||
    k === 'degum:read' || k === 'degum:update',
  VIEWER: (k) => k.endsWith(':read'),
};
const ROLES = [
  { key: 'ADMIN', name: 'Administrator', description: 'Full access' },
  { key: 'MANAGEMENT', name: 'Management', description: 'Oversight + reports' },
  { key: 'TRADER', name: 'Trader', description: 'Create & manage deals' },
  { key: 'FINANCE', name: 'Finance', description: 'Brokerage & reports' },
  { key: 'OPERATIONS', name: 'Operations', description: 'Deal logistics' },
  { key: 'VIEWER', name: 'Viewer', description: 'Read-only' },
];

const num = (v: any) => Number(v ?? 0);
const r4 = (n: number) => Number(n.toFixed(4));
const dOrNull = (v: any) => (v ? new Date(v) : null);

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@ojastrading.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  // Demo products/parties/deals are opt-in. Production leaves this unset, so the
  // app boots empty (just the admin login) and redeploys never re-add samples.
  const seedDemo = process.env.SEED_DEMO === 'true';

  console.log('▶ Permissions…');
  for (const key of permissionKeys()) {
    const [resource, action] = key.split(':');
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key, resource, action } });
  }
  const allPerms = await prisma.permission.findMany();

  console.log('▶ Company…');
  const company = await prisma.company.upsert({
    where: { gstin: '27ABCDE1234F1Z5' },
    update: {},
    create: {
      name: 'Ojas Trading Co.',
      legalName: 'Ojas Edible Oils',
      gstin: '27ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      email: 'contact@ojastrading.com',
      city: 'Kandla',
      state: 'Gujarat',
    },
  });

  console.log('▶ Roles…');
  const roleByKey: Record<string, string> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { companyId_key: { companyId: company.id, key: r.key } },
      update: { name: r.name, description: r.description },
      create: { companyId: company.id, ...r, isSystem: true },
    });
    roleByKey[r.key] = role.id;
    const policy = ROLE_POLICY[r.key];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: allPerms.filter((p) => policy(p.key)).map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  console.log('▶ Admin user…');
  const admin = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: adminEmail } },
    update: {},
    create: {
      companyId: company.id,
      email: adminEmail,
      passwordHash: await argon2.hash(adminPassword),
      fullName: 'System Administrator',
      isSuperAdmin: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: roleByKey['ADMIN'] } },
    update: {},
    create: { userId: admin.id, roleId: roleByKey['ADMIN'] },
  });

  // Stop here in production: essentials (permissions/company/roles/admin) are in
  // place, and no demo data is loaded. Set SEED_DEMO=true to also seed samples.
  if (!seedDemo) {
    console.log('\n✅ Seed complete (essentials only — no demo data).');
    console.log(`   Company : ${company.name}`);
    console.log(`   Login   : ${adminEmail}`);
    return;
  }

  // ── Products (demo brokerage: ₹200/MT, split ₹100 each side) ──────────────
  console.log(`▶ Products (${data.products.length})…`);
  const DEMO_BROKERAGE = 200;
  const productByCode = new Map<string, string>();
  for (const p of data.products) {
    const row = await prisma.product.upsert({
      where: { companyId_code: { companyId: company.id, code: p.code } },
      update: { name: p.name, unit: p.unit },
      create: {
        companyId: company.id, code: p.code, name: p.name, unit: p.unit || 'MT', brokerage: DEMO_BROKERAGE,
        isDegum: p.code.trim().toUpperCase() === 'CDSBO', // CDSBO deals are degum by default
      },
    });
    productByCode.set(p.code.toLowerCase(), row.id);
  }
  const resolveProduct = async (code?: string | null) => {
    if (!code) return null;
    const hit = productByCode.get(code.toLowerCase());
    if (hit) return hit;
    const row = await prisma.product.create({
      data: { companyId: company.id, code, name: code, unit: 'MT', brokerage: DEMO_BROKERAGE, isDegum: code.trim().toUpperCase() === 'CDSBO' },
    });
    productByCode.set(code.toLowerCase(), row.id);
    return row.id;
  };

  // ── Parties (master + any referenced by deals) ──────────────────────────────
  console.log(`▶ Parties (${data.parties.length})…`);
  const partyByName = new Map<string, string>();
  for (const p of data.parties) {
    const row = await prisma.party.upsert({
      where: { companyId_name: { companyId: company.id, name: p.name } },
      update: {},
      create: { companyId: company.id, name: p.name, type: p.type as any, city: p.city, phones: p.phone ? [p.phone] : [], notes: p.notes },
    });
    partyByName.set(p.name.toLowerCase(), row.id);
  }
  const resolveParty = async (name?: string | null) => {
    if (!name) return null;
    const key = name.toLowerCase();
    if (partyByName.has(key)) return partyByName.get(key)!;
    const row = await prisma.party.create({
      data: { companyId: company.id, name, type: 'BOTH' },
    });
    partyByName.set(key, row.id);
    return row.id;
  };

  // ── Deals ───────────────────────────────────────────────────────────────────
  // The workbook rows are one-sided (a party + our side), so the demo pairs each
  // with our own firm as the other party — the same mapping the migration used.
  const ownFirm = await prisma.party.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Ojas Trading (Self)' } },
    update: { isSelf: true },
    create: { companyId: company.id, name: 'Ojas Trading (Self)', type: 'BOTH', isSelf: true, city: 'Kandla' },
  });
  const existingDeals = await prisma.deal.count({ where: { companyId: company.id } });
  if (existingDeals === 0) {
    const rows = [
      ...data.direct.map((d) => ({
        dealNo: d.dealNo, date: dOrNull(d.date), material: d.material,
        party: d.party, weSell: d.side === 'SELL', qty: num(d.quantity), rate: num(d.rate),
        port: null as string | null, shipmentMonth: null as string | null, dueDate: dOrNull(d.dueDate),
        vessel: null as string | null,
      })),
      ...data.degum.map((d) => ({
        dealNo: d.dealNo, date: dOrNull(d.dealDate), material: d.material,
        party: d.seller ?? d.buyer, weSell: false, qty: num(d.quantity), rate: num(d.buyRate),
        port: d.originPort ?? null, shipmentMonth: d.shipmentMonth ?? null, dueDate: dOrNull(d.paymentDueDate),
        vessel: (d.vessel as string | null) ?? null,
      })),
    ];
    console.log(`▶ Deals (${rows.length})…`);
    const half = DEMO_BROKERAGE / 2;
    for (const d of rows) {
      const partyId = await resolveParty(d.party);
      const deal = await prisma.deal.create({
        data: {
          companyId: company.id, dealNo: d.dealNo, date: d.date ?? new Date(),
          buyerPartyId: d.weSell ? partyId : ownFirm.id,
          sellerPartyId: d.weSell ? ownFirm.id : partyId,
          productId: await resolveProduct(d.material),
          quantity: d.qty, rate: d.rate,
          buyerBrokerage: half, sellerBrokerage: half, brokerageTotal: r4(d.qty * DEMO_BROKERAGE),
          port: d.port, shipmentMonth: d.shipmentMonth, dueDate: d.dueDate,
          createdById: admin.id,
        },
      });
      if (d.vessel) {
        await prisma.degumDetail.create({
          data: { companyId: company.id, dealId: deal.id, vesselName: d.vessel, createdById: admin.id },
        });
      }
    }
  } else {
    console.log('▶ Deals already present — skipping deal seed.');
  }

  console.log('\n✅ Seed complete.');
  console.log(`   Company : ${company.name}`);
  console.log(`   Login   : ${adminEmail} / ${adminPassword}`);
  const partyTotal = await prisma.party.count({ where: { companyId: company.id } });
  console.log(`   Parties : ${partyTotal}  Products : ${data.products.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
