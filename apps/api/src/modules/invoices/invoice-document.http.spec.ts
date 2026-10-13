import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { InvoiceDocumentController } from './invoice-document.controller';
import { InvoiceDocumentService } from './invoice-document.service';
const principal = (level: 'CUSTOMER_OTP'|'STAFF_MFA', permissions: string[], fresh = true): AuthPrincipalContext => ({ userId:'operator',sessionId:'test-session',tokenId:'test-token',
  authenticationLevel:level,permissions:new Set(permissions),authenticatedAt:new Date(Date.now()-(fresh?0:600000)),accessExpiresAt:new Date(Date.now()+600000) });
const principals = { staff:principal('STAFF_MFA',['invoices.read','invoices.issue']), reader:principal('STAFF_MFA',['invoices.read']),
  issuer:principal('STAFF_MFA',['invoices.issue']),stale:principal('STAFF_MFA',['invoices.read','invoices.issue'],false),customer:principal('CUSTOMER_OTP',['invoices.read','invoices.issue']),revoked:principal('STAFF_MFA',[]) };
const resolver={resolveBearerToken:vi.fn(async(authorization?:string)=>{const token=authorization?.replace('Bearer ','') as keyof typeof principals;if(token in principals)return principals[token];throw new AuthSessionException('AUTH_SESSION_INVALID');})};
const service={list:vi.fn(async()=>({items:[],count:0,offset:0,limit:25})),read:vi.fn(async()=>({id:'invoice'})),fromDraft:vi.fn(async()=>({id:'invoice'})),issue:vi.fn(async()=>({document:{id:'invoice'},committedVersion:1,replayed:false}))};
@Module({imports:[ApiFoundationModule],controllers:[InvoiceDocumentController],providers:[{provide:InvoiceDocumentService,useValue:service},{provide:AuthPrincipalService,useValue:resolver},
  {provide:APP_GUARD,useValue:new AuthGuard(resolver as unknown as AuthPrincipalService,{record:vi.fn(async()=>undefined)} as unknown as AuditLogService)}]})class Harness{}
describe('Invoice issuance HTTP current authorization and strict contract',()=>{
  let app:INestApplication;let origin:string;
  const call=(path:string,token?:string,body?:unknown,key='issue-test-key')=>fetch(`${origin}/api/v1/invoices/admin${path}`,{method:body===undefined?'GET':'POST',
    headers:{...(token?{authorization:`Bearer ${token}`}:{ }),'content-type':'application/json',...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  beforeAll(async()=>{app=await NestFactory.create(Harness,{logger:false});app.setGlobalPrefix('api');app.enableVersioning({type:VersioningType.URI,defaultVersion:'1'});await app.listen(0,'127.0.0.1');origin=await app.getUrl();});
  beforeEach(()=>vi.clearAllMocks());afterAll(async()=>app.close());
  it('denies anonymous, customer and revoked principals on every surface',async()=>{
    for(const [path,body] of [['/documents',undefined],['/documents/invoice',undefined],['/drafts/draft/document',undefined],['/drafts/draft/issue',{expectedVersion:0,expectedOrderVersion:1}]] as const)
      for(const token of [undefined,'customer','revoked'])expect((await call(path,token,body)).status).toBe(token?403:401);
    for(const method of Object.values(service))expect(method).not.toHaveBeenCalled();
  });
  it('requires both current read/issue and fresh staff MFA before issuance, including retries',async()=>{
    for(const token of ['reader','issuer','stale'])expect((await call('/drafts/draft/issue',token,{expectedVersion:0,expectedOrderVersion:1})).status).toBe(token==='stale'?401:403);
    expect(service.issue).not.toHaveBeenCalled();
    const response=await call('/drafts/draft/issue','staff',{expectedVersion:0,expectedOrderVersion:1});expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toBe('no-store');
    expect(service.issue).toHaveBeenCalledWith('operator',expect.any(String),'draft',{expectedVersion:0,expectedOrderVersion:1},'issue-test-key');
  });
  it.each([{number:'fake'}, {customerId:'foreign'}, {actorId:'spoof'}, {total:'1'}, {state:'PAID'}, {taxRateBps:0}, {expectedVersion:-1}, {expectedOrderVersion:1.5}, {expectedOrderVersion:undefined}])('rejects arbitrary financial/state/identity input before issuing',async patch=>{
    expect((await call('/drafts/draft/issue','staff',{expectedVersion:0,expectedOrderVersion:1,...patch})).status).toBe(400);expect(service.issue).not.toHaveBeenCalled();
  });
  it('uses bounded no-store reads and rejects owner/query/pagination injection',async()=>{
    expect((await call('/documents','reader')).status).toBe(200);expect((await call('/documents/invoice','reader')).headers.get('cache-control')).toBe('no-store');
    vi.clearAllMocks();for(const path of ['/documents?customerId=foreign','/documents?offset=-1','/documents/invoice?userId=foreign','/drafts/draft/document?customerId=foreign'])expect((await call(path,'staff')).status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();expect(service.read).not.toHaveBeenCalled();
  });
});
