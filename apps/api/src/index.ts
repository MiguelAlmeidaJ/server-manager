import Fastify from 'fastify';
import postgres from 'postgres';
import { z, ZodError } from 'zod';
import { timingSafeEqual } from 'node:crypto';

const secret = process.env.ADMIN_API_TOKEN;
const url = process.env.DATABASE_URL;
if (!secret || secret.length < 32 || !url) throw new Error('Set ADMIN_API_TOKEN (32+ chars) and DATABASE_URL');
const sql = postgres(url);
const app = Fastify({ logger: true });

await sql`CREATE TABLE IF NOT EXISTS servers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, ip_address text NOT NULL,
 os text NOT NULL DEFAULT 'linux', environment text NOT NULL DEFAULT 'production', created_at timestamptz DEFAULT now()
)`;
await sql`CREATE TABLE IF NOT EXISTS applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
 name text NOT NULL, technology text, domain text, created_at timestamptz DEFAULT now()
)`;
await sql`CREATE TABLE IF NOT EXISTS port_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
 application_id uuid REFERENCES applications(id) ON DELETE SET NULL, port integer NOT NULL CHECK(port BETWEEN 1 AND 65535),
 protocol text NOT NULL CHECK(protocol IN ('tcp','udp')), bind_address text NOT NULL DEFAULT '0.0.0.0',
 created_at timestamptz DEFAULT now(), UNIQUE(server_id,port,protocol,bind_address)
)`;

app.addHook('onRequest', async (req,reply)=>{
 if(req.url==='/api/health')return;
 const input=Buffer.from(req.headers.authorization?.replace(/^Bearer /,'')??'');
 const valid=Buffer.from(secret);
 if(input.length!==valid.length||!timingSafeEqual(input,valid))return reply.code(401).send({error:'Unauthorized'});
});
app.setErrorHandler((err,_req,reply)=>{
 if(err instanceof ZodError)return reply.code(400).send({error:'Validation failed',details:err.flatten()});
 if(err && typeof err === 'object' && 'code' in err && err.code==='23503')return reply.code(400).send({error:'Referenced item not found'});
 if(err && typeof err === 'object' && 'code' in err && err.code==='23505')return reply.code(409).send({error:'Already exists'});
 app.log.error(err);return reply.code(500).send({error:'Internal server error'});
});
const id=z.string().uuid();
const serverSchema=z.object({name:z.string().trim().min(1).max(120),ipAddress:z.string().trim().min(1).max(100),os:z.enum(['linux','windows','other']).default('linux'),environment:z.enum(['production','staging','development']).default('production')});
const applicationSchema=z.object({name:z.string().trim().min(1).max(120),serverId:id,technology:z.string().max(120).optional(),domain:z.string().max(255).optional()});
const reservationSchema=z.object({serverId:id,applicationId:id.optional(),port:z.number().int().min(1).max(65535),protocol:z.enum(['tcp','udp']).default('tcp'),bindAddress:z.string().min(1).max(100).default('0.0.0.0')});
const overlaps=(a:string,b:string)=>a===b||['0.0.0.0','::','*'].includes(a)||['0.0.0.0','::','*'].includes(b);
app.get('/api/health',async()=>({status:'ok'}));
app.get('/api/servers',async()=>sql`SELECT id,name,ip_address AS "ipAddress",os,environment,created_at AS "createdAt" FROM servers ORDER BY name`);
app.post('/api/servers',async req=>{const s=serverSchema.parse(req.body);const rows=await sql`INSERT INTO servers(name,ip_address,os,environment) VALUES(${s.name},${s.ipAddress},${s.os},${s.environment}) RETURNING *`;return rows[0]});
app.delete('/api/servers/:id',async(req,reply)=>{const {id:serverId}=z.object({id}).parse(req.params);const rows=await sql`DELETE FROM servers WHERE id=${serverId} RETURNING id`;return rows.length?{deleted:true}:reply.code(404).send({error:'Not found'})});
app.get('/api/applications',async()=>sql`SELECT id,server_id AS "serverId",name,technology,domain FROM applications ORDER BY name`);
app.post('/api/applications',async req=>{const a=applicationSchema.parse(req.body);const rows=await sql`INSERT INTO applications(server_id,name,technology,domain) VALUES(${a.serverId},${a.name},${a.technology??null},${a.domain??null}) RETURNING *`;return rows[0]});
app.delete('/api/applications/:id',async(req,reply)=>{const {id:appId}=z.object({id}).parse(req.params);const rows=await sql`DELETE FROM applications WHERE id=${appId} RETURNING id`;return rows.length?{deleted:true}:reply.code(404).send({error:'Not found'})});
app.get('/api/ports/reservations',async()=>sql`SELECT id,server_id AS "serverId",application_id AS "applicationId",port,protocol,bind_address AS "bindAddress" FROM port_reservations ORDER BY port`);
app.post('/api/ports/suggest',async(req,reply)=>{
 const q=z.object({serverId:id,protocol:z.enum(['tcp','udp']).default('tcp'),bindAddress:z.string().default('0.0.0.0'),start:z.number().int().min(1).max(65535).default(3000),end:z.number().int().min(1).max(65535).default(3999)}).parse(req.body);
 if(q.end<q.start||q.end-q.start>5000)return reply.code(400).send({error:'Invalid range'});
 const used=await sql`SELECT port,bind_address FROM port_reservations WHERE server_id=${q.serverId} AND protocol=${q.protocol}`;
 let chosen:number|null=null;
 for(let port=q.start;port<=q.end;port++){if(!used.some(p=>p.port===port&&overlaps(p.bind_address,q.bindAddress))){chosen=port;break}}
 return {port:chosen,source:'reservations-only',warning:'Live sockets are not checked'};
});
app.post('/api/ports/reservations',async(req,reply)=>{
 const r=reservationSchema.parse(req.body);
 const result=await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(hashtext(${r.serverId+':'+r.protocol+':'+r.port}))`;
   const existing=await tx`SELECT bind_address FROM port_reservations WHERE server_id=${r.serverId} AND protocol=${r.protocol} AND port=${r.port}`;
   if(existing.some(p=>overlaps(p.bind_address,r.bindAddress)))return null;
   const rows=await tx`INSERT INTO port_reservations(server_id,application_id,port,protocol,bind_address) VALUES(${r.serverId},${r.applicationId??null},${r.port},${r.protocol},${r.bindAddress}) RETURNING *`;
   return rows[0];
 });
 return result?reply.code(201).send(result):reply.code(409).send({error:'Port reservation conflicts'});
});
app.delete('/api/ports/reservations/:id',async(req,reply)=>{const {id:reservationId}=z.object({id}).parse(req.params);const rows=await sql`DELETE FROM port_reservations WHERE id=${reservationId} RETURNING id`;return rows.length?{deleted:true}:reply.code(404).send({error:'Not found'})});
await app.listen({host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??3333)});
