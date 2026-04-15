// Desabilitado — admin criado manualmente via Supabase Dashboard
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: 'This function has been disabled for security reasons.' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
