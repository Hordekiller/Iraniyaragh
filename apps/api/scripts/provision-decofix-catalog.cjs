/* Owner-authorized SSH maintenance, not a development seed or an HTTP authentication path. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { PrismaClient, Prisma } = require('@prisma/client');
const runtime = process.env.DECOFIX_RUNTIME_DIR ?? path.resolve(__dirname, '../dist/src');
const { AuthPermissionService } = require(path.join(runtime, 'modules/auth/auth-permission.service'));
const { AuditLogService } = require(path.join(runtime, 'modules/audit/audit-log.service'));
const { DoorCatalogService } = require(path.join(runtime, 'modules/custom-door-orders/door-catalog.service'));
const { priceDoors } = require(path.join(runtime, 'modules/custom-door-orders/door-pricing'));
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { DoorMaterialWriteDto, DoorModelWriteDto } = require(path.join(runtime, 'modules/custom-door-orders/door.dto'));
const db = new PrismaClient();
const mode = process.argv[2] ?? '--plan';
const requestId = `owner-decofix-${randomUUID()}`;
const manifest = JSON.parse(fs.readFileSync(process.env.DECOFIX_MANIFEST_PATH ?? path.join(__dirname, 'decofix-catalog/manifest.json'), 'utf8'));
const fail = message => { throw new Error(message); };
const required = ['catalog.write', 'pricing.write'];

async function operator(client) {
  const users = await client.user.findMany({ where: { status: 'ACTIVE', deletedAt: null, roleAssignments: { some: { revokedAt: null } } }, select: { id: true }, take: 30 });
  const permissionService = new AuthPermissionService(client);
  const allowed = [];
  for (const user of users) {
    const permissions = await permissionService.effectivePermissionKeys(user.id);
    if (required.every(permission => permissions.has(permission))) allowed.push(user.id);
  }
  if (allowed.length !== 1) fail('A unique active authorized catalog/pricing maintenance operator is required.');
  return allowed[0];
}
function materialInput(color) {
  return { code: color.code, title: `شیشه ${color.title} ۴ میل — دکوفیکس`, category: 'GLASS', active: true, expectedVersion: 0, variantId: null,
    configuration: { unit: 'M2', rate: manifest.rateIrrPerM2, validUntil: null, specifications: 'تعرفه پایه ساخت دکوفیکس به ازای هر مترمربع؛ شیشه ۴ میلی‌متر. تصویر نمونه ساخته‌شده و آزمایشی است؛ نوع، رنگ، موجودی و امکان ساخت باید پیش از تأیید نهایی سفارش توسط مدیر بررسی شوند.', color: color.title, thicknessMm: 4, processingFee: '0', stockUnit: null } };
}
function modelInput(ids) {
  return { code: manifest.modelCode, title: manifest.modelTitle, type: 'DECOFIX', active: true, expectedVersion: 0, imageMediaId: null,
    configuration: { technical: null, manualApproval: true, slots: [{ key: 'glass', title: 'رنگ شیشه ۴ میل', materialIds: ids, required: true }], incompatible: [],
      components: [{ slot: 'glass', basis: 'AREA', multiplier: 1, divisor: 1, widthDeductionMm: 0, heightDeductionMm: 0, wasteBps: 0, minimumQuantity: '0' }],
      labor: { fixed: '0', perSquareMeter: '0' }, additional: [], taxBps: 0, discount: '0', minimumTotal: '0' } };
}
async function verify(client) {
  const model = await client.doorModel.findUnique({ where: { code: manifest.modelCode } });
  const materials = await client.doorMaterial.findMany({ where: { code: { in: manifest.colors.map(color => color.code) } } });
  if (!model || materials.length !== manifest.colors.length) fail('Catalog is incomplete.');
  const ids = manifest.colors.map(color => {
    const material = materials.find(row => row.code === color.code), expected = materialInput(color);
    if (!material || material.title !== expected.title || material.category !== expected.category || !material.active || material.variantId !== null || !isDeepStrictEqual(material.configuration, expected.configuration)) fail('An existing material differs; no operator edits will be overwritten.');
    return material.id;
  });
  const expected = modelInput(ids);
  const { deposit: _legacyDeposit, ...storedConfiguration } = model.configuration;
  if (model.type !== 'DECOFIX' || model.title !== expected.title || !model.active || model.imageMediaId !== null || !isDeepStrictEqual(storedConfiguration, expected.configuration)) fail('The existing model differs; no operator edits will be overwritten.');
  const publicModels = [{ ...model, imageUrl: null }];
  for (const [widthMm, heightMm, quantity, total] of [[1000,1000,1,'100000000'],[500,1000,1,'50000000'],[800,2000,2,'320000000']]) {
    const quote = priceDoors([{ modelId: model.id, widthMm, heightMm, quantity, selections: [{slot:'glass',materialId:ids[0]}], notes:'' }], publicModels, materials);
    if (quote.calculatedTotal !== total || quote.total !== null) fail('Price or technical approval reconciliation failed.');
  }
  return { type: 'DECOFIX', models: 1, colors: materials.length, thicknessMm: 4, unit: 'M2', rateIrr: manifest.rateIrrPerM2, rateToman: '10000000', manualApproval: true, paymentAutoEnabled: false, pricingReconciled: true };
}
(async () => {
  if (!['--plan','--apply','--verify'].includes(mode)) fail('Use --plan, --apply or --verify.');
  if (manifest.rateIrrPerM2 !== '100000000' || manifest.colors.length !== 16 || new Set(manifest.colors.map(color => color.code)).size !== 16 || manifest.colors.some(color => !/^decofix-glass-[a-z-]+-4mm$/.test(color.code) || !/^[a-z-]+$/.test(color.key))) fail('Unexpected owner manifest.');
  for (const color of manifest.colors) {
    if (validateSync(plainToInstance(DoorMaterialWriteDto, materialInput(color)), { whitelist: true, forbidNonWhitelisted: true }).length) fail('Material manifest does not satisfy the deployed API contract.');
  }
  if (validateSync(plainToInstance(DoorModelWriteDto, modelInput(manifest.colors.map(color => color.code))), { whitelist: true, forbidNonWhitelisted: true }).length) fail('Model manifest does not satisfy the deployed API contract.');
  const actorId = await operator(db);
  if (mode === '--plan') { console.log(JSON.stringify({ mode:'plan',operatorAuthorized:true,existingModels:await db.doorModel.count(),existingMaterials:await db.doorMaterial.count(),plannedModels:1,plannedColors:16,type:'DECOFIX',rateTomanPerM2:'10000000',thicknessMm:4,manualApproval:true })); return; }
  if (mode === '--apply') {
    if (process.env.DECOFIX_CATALOG_AUTHORIZED !== 'true') fail('Explicit authorized maintenance mode is required after a verified restore backup.');
    await db.$transaction(async tx => {
      if (await operator(tx) !== actorId) fail('Maintenance operator changed.');
      const existing = await tx.doorModel.count() + await tx.doorMaterial.count();
      if (existing) { await verify(tx); return; }
      // Domain commands keep their validation and immutable revisions, in one outer transaction.
      const service = new DoorCatalogService({ $transaction: operation => operation(tx) }, new AuditLogService(db), undefined);
      const ids=[];
      for (const color of manifest.colors) ids.push(await service.writeMaterial(actorId,requestId,materialInput(color)));
      await service.writeModel(actorId,requestId,modelInput(ids));
      await new AuditLogService(db).record({actorId,requestId,action:'custom-door.catalog.operator-provisioned',entityType:'DECOFIX_CATALOG',entityId:manifest.modelCode,metadata:{source:'owner-authorized-ssh-maintenance',manifestRevision:manifest.revision,models:1,colors:16,rateIrrPerM2:manifest.rateIrrPerM2,manualApproval:true}},tx);
      await verify(tx);
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000,maxWait:10000});
  }
  console.log(JSON.stringify({mode,...await verify(db)}));
})().catch(error=>{console.error(error.message?.includes('operator') || error.message?.includes('Catalog') || error.message?.includes('manifest') || error.message?.includes('reconciliation') || error.message?.includes('maintenance') || error.message?.includes('differs') ? error.message : `Provisioning failed (${error.name}); transaction rolled back.`);process.exitCode=1}).finally(()=>db.$disconnect());
