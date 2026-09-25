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

app.get('/',(_req,res)=>res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GoldTrap AI</title><style>*{box-sizing:border-box}body{margin:0;background:#080b10;color:#edf2f7;font-family:Inter,system-ui,-apple-system,sans-serif}.wrap{max-width:1100px;margin:auto;padding:32px 20px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}.brand{font-weight:800;font-size:22px}.brand b{color:#d9b55b}.pill{border:1px solid #26303d;border-radius:999px;padding:8px 12px;color:#9fb0c3;font-size:12px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{background:#10151d;border:1px solid #202a36;border-radius:16px;padding:18px}.label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#718096}.value{font-size:25px;font-weight:750;margin-top:8px}.green{color:#63d69b}.amber{color:#d9b55b}.hero{padding:24px;margin-bottom:14px;background:linear-gradient(135deg,#121923,#0d1118)}.hero h1{margin:8px 0 6px;font-size:32px}.hero p{color:#8fa1b5;margin:0;line-height:1.5}.section{margin-top:14px}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #1e2732;color:#9fb0c3}.row strong{color:#e8edf3}.foot{margin-top:24px;color:#566576;font-size:12px}@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}.hero h1{font-size:27px}}</style></head><body><div class="wrap"><div class="top"><div class="brand"><b>GOLDTRAP</b> AI</div><div class="pill">READ-ONLY INTELLIGENCE</div></div><div class="card hero"><div class="label">Trading Research Control Plane</div><h1>GoldTrap vNext</h1><p>Telemetry, basket analytics and strategy research for XAUUSD. Execution remains inside MetaTrader 5.</p></div><div class="grid"><div class="card"><div class="label">Server</div><div class="value green" id="server">ONLINE</div></div><div class="card"><div class="label">Database</div><div class="value" id="db">CHECKING</div></div><div class="card"><div class="label">Events</div><div class="value" id="events">0</div></div><div class="card"><div class="label">MT5 Feed</div><div class="value amber" id="feed">WAITING</div></div></div><div class="card section"><div class="label">System</div><div class="row"><span>Strategy</span><strong>GoldTrap vNext 0.1</strong></div><div class="row"><span>Instrument</span><strong>XAUUSD</strong></div><div class="row"><span>Execution authority</span><strong>MT5 EA only</strong></div><div class="row"><span>AI access</span><strong>Read-only analytics</strong></div><div class="row"><span>Telemetry endpoint</span><strong>/v1/telemetry</strong></div></div><div class="foot">GoldTrap AI · production telemetry console · experimental trading research, not a profit guarantee</div></div><script>async function refresh(){try{const h=await fetch('/health').then(r=>r.json());document.getElementById('db').textContent=(h.database||'disabled').toUpperCase();document.getElementById('db').className='value '+(h.database==='ok'?'green':'amber');const s=await fetch('/v1/status').then(r=>r.json());document.getElementById('events').textContent=s.events||0;document.getElementById('feed').textContent=s.last_event?'CONNECTED':'WAITING';document.getElementById('feed').className='value '+(s.last_event?'green':'amber')}catch(e){document.getElementById('server').textContent='ERROR'}}refresh();setInterval(refresh,10000)</script></body></html>`));

app.get('/health', async (_req,res)=>{
 let db='disabled';
 if(pool){ try { await pool.query('select 1'); db='ok'; } catch { db='error'; } }
 res.status(db==='error'?503:200).json({service:'goldtrap-ai',version:'0.2.0',status:db==='error'?'degraded':'ok',database:db,execution:'read-only'});
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
 if(!pool) return res.json({service:'goldtrap-ai',database:false,events:0,last_event:null,execution:'read-only'});
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

initDb().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`GoldTrap AI listening on ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
