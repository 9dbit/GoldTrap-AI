import express from 'express';
import pg from 'pg';
import crypto from 'crypto';

const app = express();
app.use(express.json({limit:'256kb'}));
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const INGEST_TOKEN = process.env.INGEST_TOKEN || '';
const pool = DATABASE_URL ? new pg.Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;

async function initDb(){
 if(!pool) return;
 await pool.query(`CREATE TABLE IF NOT EXISTS telemetry_events(
  id BIGSERIAL PRIMARY KEY, received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_time TIMESTAMPTZ, strategy_version TEXT, event TEXT NOT NULL, symbol TEXT,
  magic BIGINT, side TEXT, positions INT, volume NUMERIC, bid NUMERIC, ask NUMERIC,
  spread_points NUMERIC, basket_pl NUMERIC, weighted_be NUMERIC, requested_tp NUMERIC,
  last_entry NUMERIC, note TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb
 ); CREATE INDEX IF NOT EXISTS telemetry_events_time_idx ON telemetry_events(received_at DESC);
 CREATE INDEX IF NOT EXISTS telemetry_events_event_idx ON telemetry_events(event);`);
}

function auth(req,res,next){
 if(!INGEST_TOKEN) return res.status(503).json({error:'ingest_not_configured'});
 const supplied=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 const a=Buffer.from(supplied), b=Buffer.from(INGEST_TOKEN);
 if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'unauthorized'});
 next();
}

app.get('/health', async (_req,res)=>{
 let db='disabled';
 if(pool){ try { await pool.query('select 1'); db='ok'; } catch { db='error'; } }
 res.status(db==='error'?503:200).json({service:'goldtrap-ai',version:'0.1.0',status:db==='error'?'degraded':'ok',database:db,execution:'read-only'});
});

app.post('/v1/telemetry',auth,async(req,res)=>{
 if(!pool) return res.status(503).json({error:'database_not_configured'});
 const p=req.body||{};
 if(!p.event) return res.status(400).json({error:'event_required'});
 const vals=[p.event_time||null,p.strategy_version||null,p.event,p.symbol||null,p.magic||null,p.side||null,p.positions||null,p.volume||null,p.bid||null,p.ask||null,p.spread_points||null,p.basket_pl||null,p.weighted_be||null,p.requested_tp||null,p.last_entry||null,p.note||null,p];
 const q=`INSERT INTO telemetry_events(event_time,strategy_version,event,symbol,magic,side,positions,volume,bid,ask,spread_points,basket_pl,weighted_be,requested_tp,last_entry,note,payload) VALUES(${vals.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id,received_at`;
 const r=await pool.query(q,vals); res.status(202).json({accepted:true,...r.rows[0]});
});

app.get('/v1/status',async(_req,res)=>{
 if(!pool) return res.json({service:'goldtrap-ai',database:false,events:0});
 const r=await pool.query(`SELECT count(*)::int events,max(received_at) last_event FROM telemetry_events`);
 res.json({service:'goldtrap-ai',database:true,...r.rows[0],execution:'read-only'});
});

app.get('/v1/events',async(req,res)=>{
 if(!pool) return res.status(503).json({error:'database_not_configured'});
 const limit=Math.min(Math.max(Number(req.query.limit)||50,1),500);
 const r=await pool.query(`SELECT id,received_at,event_time,strategy_version,event,symbol,magic,side,positions,volume,bid,ask,spread_points,basket_pl,weighted_be,requested_tp,last_entry,note FROM telemetry_events ORDER BY received_at DESC LIMIT $1`,[limit]);
 res.json({events:r.rows});
});

app.get('/v1/analysis/summary',async(req,res)=>{
 if(!pool) return res.status(503).json({error:'database_not_configured'});
 const hours=Math.min(Math.max(Number(req.query.hours)||24,1),24*90);
 const r=await pool.query(`SELECT count(*)::int events,avg(spread_points) avg_spread_points,min(basket_pl) min_basket_pl,max(basket_pl) max_basket_pl,count(*) FILTER (WHERE event='GRID_FILLED')::int grid_fills,count(*) FILTER (WHERE event LIKE 'TP_%')::int tp_events FROM telemetry_events WHERE received_at > now()-($1||' hours')::interval`,[hours]);
 res.json({hours,...r.rows[0]});
});

initDb().then(()=>app.listen(PORT,()=>console.log(`GoldTrap AI listening on ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
