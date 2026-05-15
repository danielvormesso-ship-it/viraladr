import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── 1. Pool por categoria (paginado) ──
  const all: any[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('hashtag_pool')
      .select('hashtag_group, niche_approved, fetched_at, br_score')
      .range(from, from + pageSize - 1)
    if (error) return new Response(JSON.stringify({error}), {status: 500})
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  const now = Date.now()
  const eightHoursAgo = now - 8 * 60 * 60 * 1000
  const groups: Record<string, any> = {}

  for (const v of all) {
    const g = v.hashtag_group || 'sem_grupo'
    if (!groups[g]) groups[g] = {
      total: 0, aprovados: 0, frescos: 0, serviveis: 0,
      ultimo_refill: null
    }
    groups[g].total++
    if (v.niche_approved) groups[g].aprovados++
    const fetchedMs = new Date(v.fetched_at).getTime()
    const fresco = fetchedMs > eightHoursAgo
    if (fresco) groups[g].frescos++
    if (v.niche_approved && fresco) groups[g].serviveis++
    if (!groups[g].ultimo_refill || fetchedMs > new Date(groups[g].ultimo_refill).getTime()) {
      groups[g].ultimo_refill = v.fetched_at
    }
  }

  const por_categoria = Object.entries(groups)
    .map(([k, v]) => ({ categoria: k, ...v }))
    .sort((a: any, b: any) => {
      const na = (a as any).categoria as string
      const nb = (b as any).categoria as string
      return na.localeCompare(nb)
    })

  // ── 2. Cron jobs status ──
  let crons = null
  let cron_runs = null
  try {
    const { data: cronData } = await supabase.rpc('exec_sql' as any, {
      query: "SELECT jobname, schedule, active FROM cron.job ORDER BY jobname"
    })
    crons = cronData

    const { data: runData } = await supabase.rpc('exec_sql' as any, {
      query: `SELECT j.jobname, jrd.status, jrd.start_time, jrd.end_time,
                     jrd.end_time - jrd.start_time AS duracao,
                     jrd.return_message
              FROM cron.job_run_details jrd
              JOIN cron.job j ON j.jobid = jrd.jobid
              WHERE jrd.start_time > now() - interval '24 hours'
              ORDER BY jrd.start_time DESC
              LIMIT 30`
    })
    cron_runs = runData
  } catch (e) {
    // exec_sql RPC might not exist — try raw SQL via pg
    crons = 'exec_sql RPC not available'
    cron_runs = 'exec_sql RPC not available'
  }

  // ── 3. Fallback: query cron via direct table access ──
  if (crons === 'exec_sql RPC not available') {
    try {
      const { data: c1 } = await supabase.from('cron.job' as any).select('jobname, schedule, active')
      crons = c1 || 'table not accessible via PostgREST'
    } catch { crons = 'not accessible' }
    try {
      const { data: c2 } = await supabase
        .from('cron.job_run_details' as any)
        .select('jobid, status, start_time, end_time, return_message')
        .gte('start_time', new Date(Date.now() - 24*60*60*1000).toISOString())
        .order('start_time', { ascending: false })
        .limit(30)
      cron_runs = c2 || 'table not accessible via PostgREST'
    } catch { cron_runs = 'not accessible' }
  }

  return new Response(JSON.stringify({
    total_no_pool: all.length,
    total_categorias: Object.keys(groups).length,
    total_servivel_agora: por_categoria.reduce((s: number, c: any) => s + c.serviveis, 0),
    por_categoria,
    crons,
    cron_runs_24h: cron_runs
  }, null, 2), { headers: { 'Content-Type': 'application/json' }})
})
