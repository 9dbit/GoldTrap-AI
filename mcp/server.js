import express from 'express';
import pg from 'pg';

const app = express();
app.use(express.json({ limit: '256kb' }));
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

async function query(text, params = []) {
  if (!pool) throw new Error('database_not_configured');
  return pool.query(text, params);
}

app.get('/health', async (_req, res) => {
  try { await query('select 1'); res.json({ service: 'goldtrap-mcp', status: 'ok', database: 'ok', authority: 'read-only' }); }
  catch (e) { res.status(503).json({ service: 'goldtrap-mcp', status: 'degraded', database: 'error', error: e.message, authority: 'read-only' }); }
});

app.get('/tools', (_req,res) => res.json({
  authority:'read-only',
  tools:[
    {name:'goldtrap_status',description:'Current telemetry feed status'},
    {name:'goldtrap_recent_events',description:'Recent GoldTrap telemetry events'},
    {name:'goldtrap_summary',description:'Aggregate telemetry metrics over a time window'},
    {name:'goldtrap_grid_cycles',description:'Recent grid and take-profit lifecycle events'}
  ]
}));

app.post('/mcp', async (req,res) => {
  try {
    const { tool, arguments: args = {} } = req.body || {};
    if (tool === 'goldtrap_status') {
      const r = await query(`SELECT count(*)::int events,max(received_at) last_event FROM telemetry_events`);
      return res.json({ tool, result: { ...r.rows[0], execution: 'read-only' } });
    }
    if (tool === 'goldtrap_recent_events') {
      const limit = Math.min(Math.max(Number(args.limit)||50,1),200);
      const r = await query(`SELECT id,received_at,event_time,strategy_version,event,symbol,side,positions,volume,bid,ask,spread_points,basket_pl,weighted_be,requested_tp,last_entry,note FROM telemetry_events ORDER BY received_at DESC LIMIT $1`,[limit]);
      return res.json({ tool, result: r.rows });
    }
    if (tool === 'goldtrap_summary') {
      const hours = Math.min(Math.max(Number(args.hours)||24,1),2160);
      const r = await query(`SELECT count(*)::int events,avg(spread_points) avg_spread_points,min(basket_pl) min_basket_pl,max(basket_pl) max_basket_pl,count(*) FILTER (WHERE event='GRID_FILLED')::int grid_fills,count(*) FILTER (WHERE event LIKE 'TP_%')::int tp_events FROM telemetry_events WHERE received_at > now()-($1||' hours')::interval`,[hours]);
      return res.json({ tool, result: { hours, ...r.rows[0] } });
    }
    if (tool === 'goldtrap_grid_cycles') {
      const limit = Math.min(Math.max(Number(args.limit)||100,1),500);
      const r = await query(`SELECT id,received_at,event,side,positions,volume,basket_pl,weighted_be,requested_tp,last_entry,note FROM telemetry_events WHERE event IN ('ENTRY','GRID_FILLED','TP_SET','TP_MOVED','TP_HIT','BASKET_CLOSED') OR event LIKE 'TP_%' ORDER BY received_at DESC LIMIT $1`,[limit]);
      return res.json({ tool, result: r.rows });
    }
    return res.status(400).json({ error:'unknown_tool' });
  } catch (e) { return res.status(500).json({ error:e.message }); }
});

app.listen(PORT,'0.0.0.0',()=>console.log(`GoldTrap MCP listening on ${PORT}`));
