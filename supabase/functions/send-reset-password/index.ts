// DEPRECATED: Reset de senha agora é feito via chat Tawk.to + admin-reset-password
// Mantido para referência. Não mais em uso.

/*
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // ... function body removed — see git history for original
});
*/

Deno.serve(async (req) => {
  return new Response(JSON.stringify({ ok: false, error: 'deprecated' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
  });
});
