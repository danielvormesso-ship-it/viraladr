-- Refresh stale pool URLs every 2 hours
SELECT cron.schedule(
  'pool-refresh-urls-2h',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsgvvihcabhnkwandjic.supabase.co/functions/v1/pool-refresh-urls',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZ3Z2aWhjYWJobmt3YW5kamljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Njk5MDksImV4cCI6MjA5MTQ0NTkwOX0.s11UhSaBEJ6DxCkwSApXJPfKtcF0IJ4PYIQR6ACi2n0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
