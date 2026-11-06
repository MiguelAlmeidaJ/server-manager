import Fastify from 'fastify';
import postgres from 'postgres';
import { z, ZodError } from 'zod';
import { timingSafeEqual, randomBytes, createHash } from 'node:crypto';

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

await sql`CREATE TABLE IF NOT EXISTS server_agent_credentials (server_id uuid PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE, token_hash text NOT NULL, issued_at timestamptz NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS server_scan_status (server_id uuid PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE, scanned_at timestamptz NOT NULL, hostname text, observation_count integer NOT NULL DEFAULT 0)`;
await sql`CREATE TABLE IF NOT EXISTS observed_ports (server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE, port integer NOT NULL CHECK(port BETWEEN 1 AND 65535), protocol text NOT NULL CHECK(protocol IN ('tcp','udp')), bind_address text NOT NULL, pid integer, process_name text, state text, scanned_at timestamptz NOT NULL, PRIMARY KEY(server_id,port,protocol,bind_address))`;

app.addHook('onRequest', async (req,reply)=>{
 if(req.url==='/api/agents/report' && req.method==='POST')return;
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
const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const serverSchema=z.object({name:z.string().trim().min(1).max(120),ipAddress:z.string().trim().min(1).max(100),os:z.enum(['linux','windows','other']).default('linux'),environment:z.enum(['production','staging','development']).default('production')});
const applicationSchema=z.object({name:z.string().trim().min(1).max(120),serverId:id,technology:z.string().max(120).optional(),domain:z.string().max(255).optional()});
const reservationSchema=z.object({serverId:id,applicationId:id.optional(),port:z.number().int().min(1).max(65535),protocol:z.enum(['tcp','udp']).default('tcp'),bindAddress:z.string().min(1).max(100).default('0.0.0.0')});
const overlaps=(a:string,b:string)=>a===b||['0.0.0.0','::','*'].includes(a)||['0.0.0.0','::','*'].includes(b);
app.get('/api/health',async()=>({status:'ok'}));
app.get('/api/servers',async()=>sql`SELECT id,name,ip_address AS "ipAddress",os,environment,created_at AS "createdAt" FROM servers ORDER BY name`);
app.post('/api/servers',async req=>{const s=serverSchema.parse(req.body);const rows=await sql`INSERT INTO servers(name,ip_address,os,environment) VALUES(${s.name},${s.ipAddress},${s.os},${s.environment}) RETURNING *`;return rows[0]});
app.put('/api/servers/:id',async(req,reply)=>{
 const {id:serverId}=z.object({id}).parse(req.params);
 const s=serverSchema.parse(req.body);
 const rows=await sql`UPDATE servers SET name=${s.name},ip_address=${s.ipAddress},os=${s.os},environment=${s.environment} WHERE id=${serverId} RETURNING id,name,ip_address AS "ipAddress",os,environment`;
 return rows.length?rows[0]:reply.code(404).send({error:'Server not found'});
});
app.delete('/api/servers/:id',async(req,reply)=>{const {id:serverId}=z.object({id}).parse(req.params);const rows=await sql`DELETE FROM servers WHERE id=${serverId} RETURNING id`;return rows.length?{deleted:true}:reply.code(404).send({error:'Not found'})});
app.get('/api/applications',async()=>sql`SELECT id,server_id AS "serverId",name,technology,domain FROM applications ORDER BY name`);
app.post('/api/applications',async req=>{const a=applicationSchema.parse(req.body);const rows=await sql`INSERT INTO applications(server_id,name,technology,domain) VALUES(${a.serverId},${a.name},${a.technology??null},${a.domain??null}) RETURNING *`;return rows[0]});
app.put('/api/applications/:id',async(req,reply)=>{
 const {id:appId}=z.object({id}).parse(req.params);
 const a=applicationSchema.parse(req.body);
 const result=await sql.begin(async tx=>{
   const existing=await tx`SELECT id,server_id FROM applications WHERE id=${appId} FOR UPDATE`;
   if(!existing.length)return {status:404,error:'Application not found'};
   if(existing[0].server_id!==a.serverId){
     const attached=await tx`SELECT id FROM port_reservations WHERE application_id=${appId} LIMIT 1`;
     if(attached.length)return {status:409,error:'Remove application port reservations before changing its server'};
   }
   const rows=await tx`UPDATE applications SET server_id=${a.serverId},name=${a.name},technology=${a.technology??null},domain=${a.domain??null} WHERE id=${appId} RETURNING id,server_id AS "serverId",name,technology,domain`;
   return {status:200,data:rows[0]};
 });
 return 'error' in result?reply.code(result.status).send({error:result.error}):result.data;
});
app.delete('/api/applications/:id',async(req,reply)=>{const {id:appId}=z.object({id}).parse(req.params);const rows=await sql`DELETE FROM applications WHERE id=${appId} RETURNING id`;return rows.length?{deleted:true}:reply.code(404).send({error:'Not found'})});
app.get('/api/ports/reservations',async()=>sql`SELECT id,server_id AS "serverId",application_id AS "applicationId",port,protocol,bind_address AS "bindAddress" FROM port_reservations ORDER BY port`);
app.post('/api/ports/suggest',async(req,reply)=>{
 const q=z.object({serverId:id,protocol:z.enum(['tcp','udp']).default('tcp'),bindAddress:z.string().default('0.0.0.0'),start:z.number().int().min(1).max(65535).default(3000),end:z.number().int().min(1).max(65535).default(3999)}).parse(req.body);
 if(q.end<q.start||q.end-q.start>5000)return reply.code(400).send({error:'Invalid range'});
 const used=await sql`SELECT port,bind_address FROM port_reservations WHERE server_id=${q.serverId} AND protocol=${q.protocol}`;
 const status=await sql`SELECT scanned_at FROM server_scan_status WHERE server_id=${q.serverId}`;
 const fresh=status.length && Date.now()-new Date(status[0].scanned_at).getTime()<5*60*1000;
 const observed=fresh?await sql`SELECT port,bind_address FROM observed_ports WHERE server_id=${q.serverId} AND protocol=${q.protocol}`:[];
 let chosen:number|null=null;
 for(let port=q.start;port<=q.end;port++){if(!used.some(p=>p.port===port&&overlaps(p.bind_address,q.bindAddress))&&!observed.some(p=>p.port===port&&overlaps(p.bind_address,q.bindAddress))){chosen=port;break}}
 return {port:chosen,source:fresh?'reservations-and-fresh-snapshot':'reservations-only',scannedAt:status[0]?.scanned_at??null,warning:fresh?'Snapshot is not a guarantee of availability; recheck bind at launch':'No fresh scan (5 minute freshness window). Live sockets are not checked'};
});
app.put('/api/ports/reservations/:id',async(req,reply)=>{
 const {id:reservationId}=z.object({id}).parse(req.params);
 const r=reservationSchema.parse(req.body);
 const result=await sql.begin(async tx=>{
   const old=await tx`SELECT id,application_id FROM port_reservations WHERE id=${reservationId} FOR UPDATE`;
   if(!old.length)return {status:404,error:'Reservation not found'};
   const lockKeys=[r.serverId+':'+r.protocol+':'+r.port];
   for(const key of lockKeys)await tx`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
   if(r.applicationId){
     const appServer=await tx`SELECT server_id FROM applications WHERE id=${r.applicationId}`;
     if(!appServer.length||appServer[0].server_id!==r.serverId)return {status:400,error:'Application must belong to the selected server'};
   }
   const others=await tx`SELECT bind_address FROM port_reservations WHERE server_id=${r.serverId} AND protocol=${r.protocol} AND port=${r.port} AND id<>${reservationId}`;
   if(others.some(p=>overlaps(p.bind_address,r.bindAddress)))return {status:409,error:'Port already reserved on this server'};
   const rows=await tx`UPDATE port_reservations SET server_id=${r.serverId},application_id=${r.applicationId??null},port=${r.port},protocol=${r.protocol},bind_address=${r.bindAddress} WHERE id=${reservationId} RETURNING id,server_id AS "serverId",application_id AS "applicationId",port,protocol,bind_address AS "bindAddress"`;
   return {status:200,data:rows[0]};
 });
 return 'error' in result?reply.code(result.status).send({error:result.error}):result.data;
});
app.post('/api/ports/reservations',async(req,reply)=>{
 const r=reservationSchema.parse(req.body);
 const result=await sql.begin(async tx=>{
   if(r.applicationId){
     const existingApplication=await tx`SELECT server_id FROM applications WHERE id=${r.applicationId}`;
     if(!existingApplication.length||existingApplication[0].server_id!==r.serverId)return {error:'Application must belong to the selected server',status:400};
   }
   await tx`SELECT pg_advisory_xact_lock(hashtext(${r.serverId+':'+r.protocol+':'+r.port}))`;
   const existing=await tx`SELECT bind_address FROM port_reservations WHERE server_id=${r.serverId} AND protocol=${r.protocol} AND port=${r.port}`;
   if(existing.some(p=>overlaps(p.bind_address,r.bindAddress)))return null;
   const rows=await tx`INSERT INTO port_reservations(server_id,application_id,port,protocol,bind_address) VALUES(${r.serverId},${r.applicationId??null},${r.port},${r.protocol},${r.bindAddress}) RETURNING *`;
   return rows[0];
 });
 return result && 'error' in result?reply.code(result.status).send({error:result.error}):result?reply.code(201).send(result):reply.code(409).send({error:'Port reservation conflicts'});
});
app.delete('/api/ports/reservations/:id',async(req,reply)=>{const {id:reservationId}=z.object({id}).parse(req.params);const rows=await sql`DELETE FROM port_reservations WHERE id=${reservationId} RETURNING id`;return rows.length?{deleted:true}:reply.code(404).send({error:'Not found'})});

const agentRecord=z.object({
  port:z.number().int().min(1).max(65535),
  protocol:z.enum(['tcp','udp']),
  bindAddress:z.string().min(1).max(100),
  pid:z.number().int().min(0).nullable().optional(),
  processName:z.string().max(255).nullable().optional(),
  state:z.string().max(50).nullable().optional()
});
const reportSchema=z.object({serverId:id,hostname:z.string().max(255).optional(),ports:z.array(agentRecord).max(15000)});
app.post('/api/servers/:id/agent-token',async(req,reply)=>{
  const {id:serverId}=z.object({id}).parse(req.params);
  const existing=await sql`SELECT id FROM servers WHERE id=${serverId}`;
  if(!existing.length)return reply.code(404).send({error:'Server not found'});
  const raw=randomBytes(32).toString('hex');
  await sql`INSERT INTO server_agent_credentials (server_id,token_hash,issued_at) VALUES(${serverId},${tokenHash(raw)},now()) ON CONFLICT(server_id) DO UPDATE SET token_hash=excluded.token_hash,issued_at=now()`;
  return {serverId,token:raw,warning:'Save this token securely. It is shown only once; regenerating revokes the old token.'};
});
app.delete('/api/servers/:id/agent-token',async(req)=>{
  const {id:serverId}=z.object({id}).parse(req.params);
  await sql`DELETE FROM server_agent_credentials WHERE server_id=${serverId}`;
  return {revoked:true};
});
app.post('/api/agents/report',{bodyLimit:2*1024*1024},async(req,reply)=>{
  const body=reportSchema.parse(req.body);
  const raw=req.headers['x-agent-token'];
  if(typeof raw!=='string'||raw.length!==64)return reply.code(401).send({error:'Agent unauthorized'});
  const credential=await sql`SELECT token_hash FROM server_agent_credentials WHERE server_id=${body.serverId}`;
  if(!credential.length)return reply.code(401).send({error:'Agent unauthorized'});
  const presented=Buffer.from(tokenHash(raw),'hex');
  const stored=Buffer.from(String(credential[0].token_hash),'hex');
  if(stored.length!==presented.length||!timingSafeEqual(stored,presented))return reply.code(401).send({error:'Agent unauthorized'});
  // Deduplicate observations before insertion. No partial snapshot is committed.
  const unique=new Map<string,z.infer<typeof agentRecord>>();
  for(const record of body.ports)unique.set([record.port,record.protocol,record.bindAddress].join('|'),record);
  const collected=[...unique.values()];
  await sql.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock(hashtext(${body.serverId+':scan'}))`;
    await tx`DELETE FROM observed_ports WHERE server_id=${body.serverId}`;
    for(const rec of collected){
      await tx`INSERT INTO observed_ports(server_id,port,protocol,bind_address,pid,process_name,state,scanned_at) VALUES(${body.serverId},${rec.port},${rec.protocol},${rec.bindAddress},${rec.pid??null},${rec.processName??null},${rec.state??null},now())`;
    }
    await tx`INSERT INTO server_scan_status(server_id,scanned_at,hostname,observation_count) VALUES(${body.serverId},now(),${body.hostname??null},${collected.length}) ON CONFLICT(server_id) DO UPDATE SET scanned_at=excluded.scanned_at,hostname=excluded.hostname,observation_count=excluded.observation_count`;
  });
  return {received:collected.length};
});
app.get('/api/ports/observed',async(req)=>{
  const query=z.object({serverId:id.optional()}).parse(req.query);
  return sql`SELECT o.server_id AS "serverId",o.port,o.protocol,o.bind_address AS "bindAddress",o.pid,o.process_name AS "processName",o.state,o.scanned_at AS "scannedAt" FROM observed_ports o WHERE (${query.serverId??null}::uuid IS NULL OR o.server_id=${query.serverId??null}::uuid) ORDER BY o.port LIMIT 20000`;
});
app.get('/api/servers/scan-status',async()=>sql`SELECT server_id AS "serverId",scanned_at AS "scannedAt",hostname,observation_count AS "observationCount" FROM server_scan_status ORDER BY scanned_at DESC`);

await app.listen({host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??3333)});
