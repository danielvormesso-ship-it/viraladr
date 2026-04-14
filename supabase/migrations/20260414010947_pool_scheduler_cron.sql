-- Habilitar pg_cron e pg_net (necessários para cron HTTP)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Agendar pool-scheduler a cada 30 minutos
SELECT cron.schedule(
  'pool-scheduler-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsgvvihcabhnkwandjic.supabase.co/functions/v1/pool-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZ3Z2aWhjYWJobmt3YW5kamljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Njk5MDksImV4cCI6MjA5MTQ0NTkwOX0.s11UhSaBEJ6DxCkwSApXJPfKtcF0IJ4PYIQR6ACi2n0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
