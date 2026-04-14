import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── PRESET_HASHTAGS: grupo → sub-hashtags (espelho do frontend) ──
const PRESET_HASHTAGS: Record<string, { tags: string[]; group: string }> = {
  'pegadinha':        { tags: ['pegadinha','pegadinhas','pegadinhaviral','pegadinhadetiktok','pegadinhaengraçada','trollagempesada','pegadinhacaseira','pegadinhanorua','peganinguem','pegadinhasbrasileiras','pegadinhareal','camerascondida','camaraescondida','armadilha','trote','trolei','trolagem','zuei','zoei','flagrante'], group: 'humor' },
  'humor':            { tags: ['humor','humorbrasil','humorbr','engraçado','piada','piadas','coisasengraçadas','videoengraçado','humornegro','rir'], group: 'humor' },
  'comédia':          { tags: ['comedia','comediante','standupbr','comediabrasil','esquete','standup','comediabrasileira','humorista','parodiabr','imitacao'], group: 'humor' },
  'memes':            { tags: ['memes','memesbr','memesbrasil','memestiktok','memeviral','meme','memesengracados','memebrasileiro','memezeiro','shitpost'], group: 'humor' },
  'zoeira':           { tags: ['zoeira','zueira','zueirabr','zoeirasemfim','zoou','zuou','zoando','zuando','zoeirabrasil','bagunceiro'], group: 'humor' },
  'risada':           { tags: ['risada','risadasgarantidas','morrendoderir','rachandoderir','morriderir','risadacontagiante','naoaguento','rirdemais','gargalhada','chorei'], group: 'humor' },
  'fail':             { tags: ['fail','fails','epicfail','failarmy','deuruim','deuerrado','foimalfeito','errou','failbrasil','queda'], group: 'humor' },
  'trollagem':        { tags: ['trollbr','trollei','trollando','trollou','zuando','troll','trollagemboa','trolleigeral','prankbr','brincadeira'], group: 'humor' },
  'viral':            { tags: ['viral','viralbrasil','viralizou','viralvideo','ficouViral','videosviral','oqueviralizou','bombou','estourou','viralhoje'], group: 'viral' },
  'fyp':              { tags: ['fyp','foryou','foryoupage','fy','fypシ','pfrvc','paravocê','recomendado','fypbrasil','apareca'], group: 'viral' },
  'trending':         { tags: ['trending','trend','trendbr','trendtiktok','emalta','tendencia','tendencias','trendingnow','trendbrasil','hypado'], group: 'viral' },
  'storytime':        { tags: ['storytime','storytimebr','minhahistoria','contando','relato','desabafo','historia','historiareal','confissao','storytelling'], group: 'viral' },
  'parati':           { tags: ['parati','paravoce','recomendados','prapagina','aparecapramim','pravc','pfrvc','tepareceu','recomendo','vaipracima'], group: 'viral' },
  'viraltiktok':      { tags: ['viraltiktok','tiktokviral','tiktokbrasil','tiktokbr','tiktokers','tiktokmemes','tiktok2024','tiktokhits','tiktokfamous','conteudoviral'], group: 'viral' },
  'dancinha':         { tags: ['dancinha','dancinhastiktok','dancinhaviral','danca','dançando','passinhos','coreografia','dancabr','dancatiktok','passinho'], group: 'lifestyle' },
  'novelinha':        { tags: ['novelinha','novelinhatiktok','atuando','cenadetiktok','dramatiktok','atuacaotiktok','dublagemtiktok','novelinhabr','atriz','ator'], group: 'lifestyle' },
  'satisfying':       { tags: ['satisfying','satisfatório','satisfyingvideo','oddlysatisfying','satisfyingbr','satisfacao','tãosatisfatório','limpeza','organizando','satisfyingclean'], group: 'lifestyle' },
  'asmr':             { tags: ['asmr','asmrbr','asmrbrasil','asmrsounds','asmrrelaxante','asmreating','asmrslime','asmrsoap','asmrcutting','asmrcomida'], group: 'lifestyle' },
  'rotina':           { tags: ['rotina','minharodina','rotinadiaria','rotinaprodutiva','dayinmylife','rotinademanha','rotinadanoite','rotinareal','meudia','vidadeadulto'], group: 'lifestyle' },
  'viagem':           { tags: ['viagem','viagembrasil','turismo','destinos','lugarlindo','viajando','destino','lugaresincriveis','praias','nordeste'], group: 'lifestyle' },
  'música':           { tags: ['musica','musicabrasileira','musicanova','cantando','cover','sertanejo','funk','pagode','forró','mpb'], group: 'lifestyle' },
  'ia transforma':    { tags: ['iatransforma','iatrend','inteligenciaartificial','iatiktok','aiart','iabrasileira','chatgpt','midjourney','aitrend','iafilme'], group: 'ia_novela' },
  'filtro ia':        { tags: ['filtrodeia','filtroai','filtroiatiktok','filtrointeligente','aimakeup','filtronovo','filtroviral','filtrodebeleza','filtroderosto','filtrotransforma'], group: 'ia_novela' },
  'novela ia':        { tags: ['noveladeia','novelaia','ianovela','personagemdeia','aidrama','iaenovela','iaatriz','personagemIA','novelacomIA','dramatransforma'], group: 'ia_novela' },
  'frutas ia':        { tags: ['frutasia','frutadeia','frutainteligencia','fruitai','iafrutas','frutasreais','frutahumana','frutapersonagem','frutaviral','iafruta'], group: 'ia_novela' },
  'novela antiga':    { tags: ['novelaantiga','novelasantigas','cenasdenovela','novelabrasileira','novela90','novela80','novelaclassica','novelaglobo','globo','redemancao'], group: 'ia_novela' },
  'cenas icônicas':   { tags: ['cenasiconica','cenasinesqueciveis','cenasclassicas','cenasepicas','cenasmarcantes','cenadenovela','cenafamosa','cenaviral','cenalendaria','cenadramática'], group: 'ia_novela' },
  'animalia ia':      { tags: ['animaliaia','animaisIA','petdeia','bichoia','animalinteligente','cachorroia','gatoia','animaltransforma','petai','iaanimal'], group: 'ia_novela' },
  'organização':      { tags: ['organizacao','arrumandoacasa','rotinadelimpeza','casaarrumada','limpezadecasa','decoracao','cantinhodecorado','diydecoração','antesedepoisdicasa','organizador'], group: 'casa' },
  'unboxing':         { tags: ['unboxing','unboxingbr','unboxingbrasil','abrindoprodutos','abrindocaixas','abrindominhacaixa','unboxingtiktok','recebidos','recebidosdomes','jabá'], group: 'casa' },
  'motivação':        { tags: ['motivacao','motivacional','frases','superacao','forcadevontade','motivacaodiaria','frasedodia','inspiracao','naodesista','acredite'], group: 'dicas' },
  'receita':          { tags: ['receita','receitafacil','receitarapida','receitadehoje','cozinhando','cozinha','comida','gastronomia','receitacaseira','receitafit'], group: 'dicas' },
  'dica':             { tags: ['dica','dicas','dicautil','dicadodia','dicaboa','dicaspráticas','dicavaliosa','dicasparavida','hackdevida','saibamais'], group: 'dicas' },
  'curiosidade':      { tags: ['curiosidade','curiosidades','vocesabia','fatocurioso','mundocurioso','sabiaque','fatosinteressantes','incrivel','naoesabia','ciencia'], group: 'dicas' },
  'fitness':          { tags: ['fitness','treino','academia','treinoemmcasa','musculacao','maromba','treinopesado','hipertrofia','treinoab','cardio'], group: 'dicas' },
  'saúde':            { tags: ['saude','saudavel','bemestar','vidasaudavel','alimentacao','alimentacaosaudavel','nutricao','dieta','emagrecer','corpoperfeito'], group: 'dicas' },
  'hack':             { tags: ['hack','lifehack','hacksdecasa','hackdetiktok','truque','truques','facilitaavida','gambiarra','solucao','dicahack'], group: 'dicas' },
  'tutorial':         { tags: ['tutorial','tutorialtiktok','comofazer','passoapasso','aprenda','aprendacomigo','facavocemesmo','diy','howto','tutorial2024'], group: 'dicas' },
  'react':            { tags: ['react','reaction','reacao','reagindo','reacttiktok','reactbr','primeirareacao','reactvideo','reactmemes','reaçãobr'], group: 'hook' },
  'desafio':          { tags: ['desafio','desafioviralbr','challenge','desafioviral','aceitedesafio','challengebr','desafiodancinha','desafionovo','tentativa','desafioimpossivel'], group: 'hook' },
  'antes e depois':   { tags: ['antesedepois','antes_e_depois','beforeandafter','transformacao','resultado','antesdepois','antesxdepois','evolucao','mudei','comparacao'], group: 'hook' },
  'transformação':    { tags: ['transformacao','transformacaovisual','glow','glowup','mudanca','mudancadrastica','evolucao','transformei','antesedepois','mudeidemais'], group: 'hook' },
  'chocante':         { tags: ['chocante','choquei','inacreditavel','absurdo','impressionante','naoacredito','chocado','queisso','impossivel','surreal'], group: 'hook' },
  'exposed':          { tags: ['exposed','expondo','verdade','revelando','desmascarando','exposto','revelacao','segredo','mentira','descubra'], group: 'hook' },
  'polêmico':         { tags: ['polemico','polemica','controverso','opiniaoimpopular','debate','treta','briga','discussao','tretinha','opiniao'], group: 'hook' },
  'ninguém esperava': { tags: ['ninguemesperava','inesperado','surpresa','plottwist','reviravolta','ngmesperava','finalinesperado','surpreendente','ninguemviu','pegoudesprevenido'], group: 'hook' },
  'oddly satisfying': { tags: ['oddlysatisfying','satisfyingvideos','tãosatisfatório','satisfyingclean','satisfyingasmr','satisfyingslime','satisfyingfood','satisfyingcraft','satisfyingcutting','satisfyingpaint'], group: 'satisfying' },
  'relaxante':        { tags: ['relaxante','relaxar','calma','pazsinterior','meditacao','tranquilidade','relaxamento','paz','relax','dormir'], group: 'satisfying' },
  'você sabia?':      { tags: ['vocesabia','sabiaque','fato','fatosinteressantes','incrivel','sabiadessa','curiosidadedomundo','fatoreal','verdadeounao','informacao'], group: 'satisfying' },
  'fato curioso':     { tags: ['fatocurioso','fatoscuriosos','curiosidadesdomundo','naoesabia','mundocurioso','fatosdomundo','planetaterra','cienciacuriosa','universocurioso','ninguémsabia'], group: 'satisfying' },
};

// ── Brazilian content detection (full port from frontend Index.tsx isBrazilianContent) ──
const NON_BR_AUTHOR_PATTERNS = /^(the_|mr_|mrs_|miss_|queen|king|vibes_|baby_|princess|prince|daddy|mommy|babe\d)/i;
const NON_BR_CONTENT_PATTERNS = /\b(kpop|k-pop|kpopfyp|babymonster|blackpink|twice|bts|stray ?kids|enhypen|aespa|itzy|newjeans|nct|seventeen|exo|red ?velvet|mamamoo|ateez|txt|ive|le ?sserafim|fancam|stan|bias|oppa|unnie|noona|hyung|aegyo|hallyu|comeback|teaser|choreo|idol|trainee|debut|maknae|selca|mukbang|pinay|pinoy|habibi|mashallah|tuto facile|apprend|yaparsam|bercanda|serius|ne yap)\b/i;
const FOREIGN_LANG_PATTERNS = /\b(yapay[ıi]m|anla[dğ]|kadar[ıi]m|bercanda|serius|luôn|aussi|facile|apprend[sr]?|miejmy|nadzieje|przeszyl|polska|kurwa|dobra|bardzo|teraz|tylko|jeszcze|ludzie|gdzie|kiedy|dlaczego|wszystko|niczego|naprawde|c'est|donc|alors|cette|avec|pour|dans|nous|vous|leur|quand|chez|sont|mais|tout|tres|même|être|faire|comme|peut|maniere|manière|nouvell|questa|quello|dieser|diese|terima ?kasih|salamat|construccion|encuentro|siempre|porque|cuando|donde|también|tambien|aunque|todavía|todavia|necesito|puedo|quiero|jefesito|enamorado|sprawiaj|kobiety|szpach|legiobb|zagad|sprawia|piéces|essentielles|dressing|mignon|minimalist|setup|organisez|rangement|ikea hack|centavos|despensa|action diy|pièces)\b/i;
const FOREIGN_SENTENCE_PATTERNS = /\b(du |de la |les |des |une |un |est |et |en |au |aux |sur |sous |par |qui |il |elle |nous |vous |ils |elles |mon |ton |son |mes |tes |ses |notre |votre |leur |ce |cet |ces |el |los |las |del |al |con |sin |por |para |pero |como |más |muy |tiene |puede |hay |donde |cuando |quien |ese |eso |estos |estas |aquí |allí )\b/gi;
const CJK_PATTERN = /[\u3000-\u9FFF\uAC00-\uD7AF\u3040-\u309F\u30A0-\u30FF]/;
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;
const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F]/;
const OTHER_SCRIPT_PATTERN = /[\u0E00-\u0E7F\u0900-\u097F\u0B80-\u0BFF\u1000-\u109F]/;
const ENG_WORDS_PATTERN = /\b(the|you|this|that|with|from|have|are|was|for|not|but|what|all|can|her|one|our|out|day|get|has|him|his|how|its|may|new|now|old|see|way|who|did|got|let|say|she|too|use|love|like|just|your|follow|thank|please|comment|share|watch|look|girl|boy|we|construction|trucks|challenge|always|never|keep|how to|i love the)\b/gi;
const FOREIGN_EN_WORDS = /\b(the|this|that|when|with|your|have|from|they|what|are|you|for|and|its|were|been|would|could|should|their|about|into|over|then|them|these|those|will|just|like|make|know|time|very|back|also|only|come|than|most|find|here|thing|many|some|take|want|give|good|look|think|after|work|call|first|need|keep|help|every|still|between|never|start|last|might|next|under|right|tell|does|turn|another|same|each|feel|before|follow|show|live|scary|elevator|prank|challenge|funny|amazing|awesome|incredible|watch|check|guys|hey|omg|wtf|lol|bro|dude|girl|how|why|really|actually|literally|basically|people|money|world|gone|wrong|wait|part|real|best|worst|ever|must|much|most|didn|wasn|won|isn|don|can|fun|try|home|love|princess|dance|dancing|music|song|cute|sweet|hot|cool|old|new|big|little|small|long|short|high|low|fast|slow|happy|sad|mad|bad|let|get|put|set|run|sit|stand|move|play|hit|cut|buy|sell|kill|win|lose|eat|drink|sleep)\b/gi;
const FOREIGN_ES_WORDS = /\b(pero|muy|esto|hola|gracias|hermano|bueno|jaja|amigo|novia|pareja|siempre|cuando|donde|también|tambien|porque|aunque|todavía|todavia|necesito|puedo|quiero|tiene|puede|vamos|mejor|peor|nunca|otra|otro|mismo|aquí|ahora|entonces|después|antes|todos|nada|algo|alguien|nadie|mucho|poco|demasiado|bastante|cada|algún|ningún|cualquier)\b/gi;
const FOREIGN_FR_WORDS = /\b(c'est|avec|pour|dans|nous|vous|leur|quand|chez|sont|mais|tout|très|même|être|faire|comme|peut|donc|alors|cette|aussi|encore|entre|après|avant|rien|toujours|jamais|quelque|chaque|depuis|pendant|sans|vers|ici|ailleurs|bonjour|merci|oui|salut|putain|merde|trop|voilà|quoi|bah|ouais|nan|chéri|chérie|les)\b/gi;
const FOREIGN_IT_WORDS = /\b(questa|quello|perché|anche|dove|cosa|ogni|tutto|niente|qualcosa|qualcuno|nessuno|troppo|abbastanza|già|adesso|dopo|insieme|senza|contro|circa|pensi|sono|voglio|posso|bene|male|grazie|ciao|buongiorno|allora|molto|bello|ragazza|ragazzi|andiamo|stai|faccio|vuoi|sai|vieni|aspetta)\b/gi;
const FOREIGN_DE_WORDS = /\b(dieser|diese|dieses|nicht|aber|auch|noch|oder|wenn|dass|weil|schon|immer|wieder|vielleicht|zwischen|gegen|unter|über|jetzt|heute|morgen|gestern|zusammen|ich|du|er|sie|wir|das|ist|bin|hab|macht|schau|guck|alter|krass|digga|bitte|danke|ja|nein)\b/gi;
const BR_POSITIVE_CHARS = /[ãáàâéêíóôõúüç]/;
const BR_POSITIVE_WORDS = /\b(kkk+|mano|cara|gente|demais|muito|pra|né|tá|tô|vou|vai|faz|bora|slk|tmj|vlw|pqp|mds|então|voce|ninguem|obrigad|bonit|danç|dançando|pegadinha|zoeira|humor|comedia|risada|brasil|garota|menina|mulher|gostosa|linda|gata|novinha|solteira|treino|cabelo|maquiagem|roupa|look|arrasou|amei|perfeita|maravilhosa|marido|namorad|namoral|partiu|saudade|churrasco|pagode|sertanejo|funk|forró|baile|favela|praia|carnaval|família|irmã|mãe|jeitinho|boa noite|bom dia|oii|olá|oi |hein|eita|uai|oxe|vish|krl|pqp|carai|poha|slc|mlk|mina|meu deus|socorro)\b/i;
const BR_HASHTAGS_PATTERN = /#(brasil|brasileiro|brasileira|tiktokbrasil|humorbrasil|humorbr|pegadinha|zoeira|comediabr|dancinha|novelinha)/i;

interface PoolVideo {
  tiktok_id: string;
  title: string;
  thumbnail: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  duration: string | null;
  author: string | null;
  video_url: string | null;
  source_url: string | null;
}

// Returns true if content is NOT Brazilian (should be rejected)
function isForeignContent(v: PoolVideo): boolean {
  const title = (v.title || '').toLowerCase();
  const author = (v.author || '').toLowerCase();
  const text = `${title} ${author}`;

  // Reject non-BR author patterns
  if (NON_BR_AUTHOR_PATTERNS.test(author.replace('@', ''))) return true;

  // Reject non-BR culture (kpop, anime, etc.)
  if (NON_BR_CONTENT_PATTERNS.test(text)) return true;

  // Reject foreign languages (Turkish, Polish, Indonesian, etc.)
  if (FOREIGN_LANG_PATTERNS.test(text)) return true;

  // Reject foreign sentence patterns (FR/ES/IT structures)
  const foreignSentenceMatches = text.match(FOREIGN_SENTENCE_PATTERNS);
  if (foreignSentenceMatches && foreignSentenceMatches.length >= 2) return true;

  // Reject non-latin scripts
  if (CJK_PATTERN.test(text)) return true;
  if (CYRILLIC_PATTERN.test(text)) return true;
  if (ARABIC_PATTERN.test(text)) return true;
  if (OTHER_SCRIPT_PATTERN.test(text)) return true;

  // Reject high English density
  const engMatches = text.match(ENG_WORDS_PATTERN);
  if (engMatches && engMatches.length >= 4) return true;

  // Reject if 2+ words in any single foreign language
  const enCount = (text.match(FOREIGN_EN_WORDS) || []).length;
  const esCount = (text.match(FOREIGN_ES_WORDS) || []).length;
  const frCount = (text.match(FOREIGN_FR_WORDS) || []).length;
  const itCount = (text.match(FOREIGN_IT_WORDS) || []).length;
  const deCount = (text.match(FOREIGN_DE_WORDS) || []).length;
  if (enCount >= 2 || esCount >= 2 || frCount >= 2 || itCount >= 2 || deCount >= 2) return true;

  // Require at least one positive BR signal — no signal = reject
  if (BR_POSITIVE_CHARS.test(text)) return false;
  if (BR_POSITIVE_WORDS.test(text)) return false;
  if (BR_HASHTAGS_PATTERN.test(title)) return false;

  // No positive signal → foreign
  return true;
}

function calcBrScore(v: PoolVideo): number {
  const text = `${v.title || ''} ${v.author || ''}`.toLowerCase();
  const BR_HASHTAGS = /(?:#|\b)(brasil|br|brasileiros|brasileiro|tiktokviral🇧🇷|fyp🇧🇷)/i;
  if (BR_HASHTAGS.test(text)) return 3;
  if (BR_POSITIVE_WORDS.test(text) || BR_POSITIVE_CHARS.test(text)) return 2;
  return 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hashtag_group, target = 200 } = await req.json();

    if (!hashtag_group || typeof hashtag_group !== 'string') {
      return new Response(
        JSON.stringify({ error: 'hashtag_group required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const groupKey = hashtag_group.toLowerCase();
    const preset = PRESET_HASHTAGS[groupKey];
    if (!preset) {
      return new Response(
        JSON.stringify({ error: `Unknown group: ${hashtag_group}`, available: Object.keys(PRESET_HASHTAGS) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    console.log(`[pool-refill] group=${groupKey} target=${target} subTags=${preset.tags.length}`);

    // ── 1. Read existing pool tiktok_ids to skip ──
    const { data: existingPool } = await adminClient
      .from('hashtag_pool')
      .select('tiktok_id')
      .eq('hashtag_group', groupKey);
    const existingIds = new Set((existingPool || []).map((r: any) => r.tiktok_id));

    // ── 2. Read cursors from pool_cursors ──
    const { data: cursorRows } = await adminClient
      .from('pool_cursors')
      .select('sub_hashtag, cursor_value, exhausted')
      .eq('hashtag_group', groupKey);
    const cursorMap = new Map<string, string | null>();
    const exhaustedSet = new Set<string>();
    for (const row of cursorRows || []) {
      cursorMap.set(row.sub_hashtag, row.cursor_value);
      if (row.exhausted) exhaustedSet.add(row.sub_hashtag);
    }

    // ── 3. Scrape sub-hashtags via scrape-tiktok-apify (light mode) ──
    const activeTags = preset.tags.filter(t => !exhaustedSet.has(t));
    if (activeTags.length === 0) {
      console.log(`[pool-refill] All sub-hashtags exhausted for group=${groupKey}`);
      return new Response(
        JSON.stringify({ success: true, added: 0, pool_size: existingIds.size, exhausted: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const allVideos: (PoolVideo & { source_hashtag: string })[] = [];
    const newCursors = new Map<string, { cursor: string | null; exhausted: boolean }>();
    const perTagLimit = Math.ceil((target * 3) / activeTags.length);
    const PARALLEL = 5;

    for (let i = 0; i < activeTags.length; i += PARALLEL) {
      if (allVideos.length >= target * 3) break;

      const batch = activeTags.slice(i, i + PARALLEL);
      const results = await Promise.all(
        batch.map(async (tag) => {
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/scrape-tiktok-apify`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                hashtag: tag,
                limit: perTagLimit,
                light: true,
                cursor: cursorMap.get(tag) || null,
              }),
            });

            if (!res.ok) {
              console.warn(`[pool-refill] scrape failed for #${tag}: ${res.status}`);
              return { tag, videos: [] as PoolVideo[], nextCursor: null, exhausted: true };
            }

            const data = await res.json();
            const videos: PoolVideo[] = (data.videos || [])
              .filter((v: any) => v.tiktok_id)
              .map((v: any) => ({
                tiktok_id: v.tiktok_id,
                title: v.title || '',
                thumbnail: v.thumbnail || null,
                views: v.views || 0,
                likes: v.likes || 0,
                comments: v.comments || 0,
                shares: v.shares || 0,
                duration: v.duration || null,
                author: v.author || null,
                video_url: v.video_url || null,
                source_url: v.source_url || null,
              }));

            return {
              tag,
              videos,
              nextCursor: data.next_cursor || null,
              exhausted: !data.next_cursor,
            };
          } catch (err) {
            console.warn(`[pool-refill] error scraping #${tag}:`, err);
            return { tag, videos: [] as PoolVideo[], nextCursor: null, exhausted: true };
          }
        })
      );

      for (const r of results) {
        newCursors.set(r.tag, { cursor: r.nextCursor, exhausted: r.exhausted });
        for (const v of r.videos) {
          if (!existingIds.has(v.tiktok_id)) {
            allVideos.push({ ...v, source_hashtag: r.tag });
          }
        }
      }
    }

    console.log(`[pool-refill] Scraped ${allVideos.length} new videos for group=${groupKey}`);

    // ── 4. Dedup by tiktok_id ──
    const seenIds = new Set<string>();
    const deduped = allVideos.filter(v => {
      if (seenIds.has(v.tiktok_id)) return false;
      seenIds.add(v.tiktok_id);
      return true;
    });

    // ── 5. Apply foreign content filter + calculate br_score ──
    const brFiltered = deduped.filter(v => !isForeignContent(v));
    const withScores = brFiltered.map(v => ({ ...v, br_score: calcBrScore(v) }));
    console.log(`[pool-refill] After BR filter: ${withScores.length}/${deduped.length} passed`);

    // ── 6. Call filter-by-niche for IA filtering ──
    let nicheApprovedIds = new Set<string>();
    let nicheRan = false;

    if (withScores.length > 0 && preset.group !== 'viral') {
      try {
        const nicheVideos = withScores.map(v => ({
          id: v.tiktok_id,
          title: v.title,
          author: v.author,
        }));

        const nicheDescription = `Vídeos do TikTok brasileiro sobre: ${hashtag_group}. Hashtags: ${preset.tags.slice(0, 8).map(t => '#' + t).join(', ')}`;

        const nicheRes = await fetch(`${supabaseUrl}/functions/v1/filter-by-niche`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videos: nicheVideos,
            nicheDescription,
            nicheKeywords: preset.tags.slice(0, 10),
          }),
        });

        if (nicheRes.ok) {
          const nicheData = await nicheRes.json();
          nicheApprovedIds = new Set(nicheData.approvedIds || []);
          nicheRan = true;
          console.log(`[pool-refill] Niche filter: ${nicheApprovedIds.size}/${withScores.length} approved`);
        } else {
          console.warn(`[pool-refill] Niche filter failed: ${nicheRes.status}, auto-approving all`);
        }
      } catch (err) {
        console.warn(`[pool-refill] Niche filter error, auto-approving:`, err);
      }
    }

    // ── 7. Upsert into hashtag_pool ──
    const rows = withScores.map(v => ({
      hashtag_group: groupKey,
      tiktok_id: v.tiktok_id,
      title: v.title,
      thumbnail: v.thumbnail,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
      duration: v.duration,
      author: v.author,
      video_url: v.video_url,
      source_url: v.source_url,
      source_hashtag: v.source_hashtag,
      br_score: v.br_score,
      niche_approved: nicheRan ? nicheApprovedIds.has(v.tiktok_id) : true,
    }));

    let inserted = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await adminClient
        .from('hashtag_pool')
        .upsert(batch, { onConflict: 'hashtag_group,tiktok_id' });
      if (error) {
        console.error(`[pool-refill] upsert batch ${Math.floor(i / 50) + 1} error:`, error);
      } else {
        inserted += batch.length;
      }
    }

    // ── 8. Save cursors to pool_cursors ──
    const cursorUpserts = Array.from(newCursors.entries()).map(([sub_hashtag, val]) => ({
      hashtag_group: groupKey,
      sub_hashtag,
      cursor_value: val.cursor,
      exhausted: val.exhausted,
      updated_at: new Date().toISOString(),
    }));

    if (cursorUpserts.length > 0) {
      const { error } = await adminClient
        .from('pool_cursors')
        .upsert(cursorUpserts, { onConflict: 'hashtag_group,sub_hashtag' });
      if (error) console.error(`[pool-refill] cursor upsert error:`, error);
    }

    // ── 9. Get final pool size ──
    const { count: poolSize } = await adminClient
      .from('hashtag_pool')
      .select('*', { count: 'exact', head: true })
      .eq('hashtag_group', groupKey)
      .eq('niche_approved', true);

    console.log(`[pool-refill] Done: group=${groupKey} inserted=${inserted} poolSize=${poolSize}`);

    return new Response(
      JSON.stringify({
        success: true,
        added: inserted,
        niche_approved: nicheRan ? nicheApprovedIds.size : inserted,
        pool_size: poolSize || 0,
        scraped_raw: allVideos.length,
        br_filtered: withScores.length,
        cursors_updated: cursorUpserts.length,
        exhausted_tags: Array.from(newCursors.entries()).filter(([, v]) => v.exhausted).map(([k]) => k),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[pool-refill] error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
