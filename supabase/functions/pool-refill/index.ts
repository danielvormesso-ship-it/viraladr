import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Measure thumbnail dimensions (JPEG/PNG header only, ~500 bytes) ──
async function measureThumb(coverUrl: string): Promise<{ w: number; h: number } | null> {
  if (!coverUrl) return null;
  try {
    const res = await fetch(coverUrl, {
      headers: { 'Range': 'bytes=0-511' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok && res.status !== 206) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // JPEG SOF0 (0xFFC0) or SOF2 (0xFFC2)
    for (let i = 0; i < bytes.length - 9; i++) {
      if (bytes[i] === 0xFF && (bytes[i + 1] === 0xC0 || bytes[i + 1] === 0xC2)) {
        const h = (bytes[i + 5] << 8) | bytes[i + 6];
        const w = (bytes[i + 7] << 8) | bytes[i + 8];
        if (w > 0 && h > 0) return { w, h };
      }
    }
    // PNG IHDR
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      if (w > 0 && h > 0) return { w, h };
    }
    return null;
  } catch { return null; }
}

// ── PRESET_HASHTAGS: grupo → sub-hashtags (espelho do frontend) ──
const PRESET_HASHTAGS: Record<string, { tags: string[]; group: string }> = {
  'pegadinha':        { tags: ['pegadinha','pegadinhas','pegadinhaviral','pegadinhadetiktok','pegadinhaengraçada','trollagempesada','pegadinhacaseira','pegadinhanorua','peganinguem','pegadinhasbrasileiras','pegadinhareal','armadilha','trote','trolei','trolagem','zuei','zoei','flagrante','pegadinhacomcriança','pegadinhacomnamorado','pegadinhacomamigo','pegadinhapesada','pegadinhacriativa'], group: 'humor' },
  'humor':            { tags: ['humor','humorbrasil','humorbr','engraçado','piada','piadas','coisasengraçadas','videoengraçado','humornegro','rir','humorbrasileiro','humornacional','comediabr','comediante','humoristabr','esquete','esquetedivertido','piadaboa','videocomedia','videohumor','risos','risonho','gracinha','humortiktok','humorbom'], group: 'humor' },
  'comédia':          { tags: ['comedia','comediante','standupbr','comediabrasil','esquete','standup','comediabrasileira','humorista','parodiabr','imitacao'], group: 'humor' },
  'memes':            { tags: ['memes','memesbr','memesbrasil','memestiktok','memeviral','meme','memesengracados','memebrasileiro','memezeiro','shitpost'], group: 'humor' },
  'zoeira':           { tags: ['zoeira','zueira','zueirabr','zoeirasemfim','zoou','zuou','zoando','zuando','zoeirabrasil','bagunceiro','zoeiraboa','zueiragem','zuerando','zoar','zueira2024','zuerinha','engraçado','muitoengraçado','zueirando','brincardezoar','zoeiratiktok','zueirabrasil','zoeiramaster'], group: 'humor' },
  'risada':           { tags: ['risada','risadasgarantidas','morrendoderir','rachandoderir','morriderir','risadacontagiante','naoaguento','rirdemais','gargalhada','chorei'], group: 'humor' },
  'fail':             { tags: ['fail','fails','epicfail','failarmy','deuruim','deuerrado','foimalfeito','errou','failbrasil','queda'], group: 'humor' },
  'trollagem':        { tags: ['trollbr','trollei','trollando','trollou','zuando','troll','trollagemboa','trolleigeral','prankbr','brincadeira','trollagem2024','trollagempesada','trollagemepica','trollagemviral','trollagembr','trollagembrasil','trollagemreal','trolleigeral','trolloudemais','trolleibonito','prankviral','prankbrasil','pregabr'], group: 'humor' },
  'viral':            { tags: ['viral','viralbrasil','viralizou','viralvideo','ficouViral','videosviral','oqueviralizou','bombou','estourou','viralhoje','viraldobrasil','videoviral','videosvirais','viralidade','viralizando','conteudoviral','videoviraldobrasil','viralbr','viralnanet','viralnow','viraltop','viralissimo','maisvirais'], group: 'viral' },
  'fyp':              { tags: ['fyp','foryou','foryoupage','fy','fypシ','pfrvc','paravocê','recomendado','fypbrasil','apareca'], group: 'viral' },
  'trending':         { tags: ['trending','trend','trendbr','trendtiktok','emalta','tendencia','tendencias','trendingnow','trendbrasil','hypado'], group: 'viral' },
  'storytime':        { tags: ['storytime','storytimebr','minhahistoria','contando','relato','desabafo','historia','historiareal','confissao','storytelling'], group: 'viral' },
  'parati':           { tags: ['parati','paravoce','recomendados','prapagina','aparecapramim','pravc','pfrvc','tepareceu','recomendo','vaipracima'], group: 'viral' },
  'viraltiktok':      { tags: ['viraltiktok','tiktokviral','tiktokbrasil','tiktokbr','tiktokers','tiktokmemes','tiktok2024','tiktokhits','tiktokfamous','conteudoviral'], group: 'viral' },
  'dancinha':         { tags: ['dancinha','dancinhastiktok','dancinhaviral','danca','dançando','passinhos','coreografia','dancabr','dancatiktok','passinho','dancinha2024','dançatiktok','coreografiabr','passinhotiktok','dancetrend','dançarina','bailarina','dancinhatiktok','dancebr','dancinhabr','dancinhanova','passinhoviral','coreografianova'], group: 'lifestyle' },
  'novelinha':        { tags: ['novelinha','novelinhatiktok','atuando','cenadetiktok','dramatiktok','atuacaotiktok','dublagemtiktok','novelinhabr','atriz','ator','novelinha2024','draminha','dramazinho','historinha','historiabr','contandohistoria','storytime','storytimebr','novelinhareal','novelinhadrama','mininovela','novelacurta','dramatiktokbr'], group: 'lifestyle' },
  'satisfying':       { tags: ['satisfying','satisfatório','satisfyingvideo','oddlysatisfying','satisfyingbr','satisfacao','tãosatisfatório','limpeza','organizando','satisfyingclean'], group: 'lifestyle' },
  'asmr':             { tags: ['asmr','asmrbr','asmrbrasil','asmrsounds','asmrrelaxante','asmreating','asmrslime','asmrsoap','asmrcutting','asmrcomida'], group: 'lifestyle' },
  'rotina':           { tags: ['rotina','minharodina','rotinadiaria','rotinaprodutiva','dayinmylife','rotinademanha','rotinadanoite','rotinareal','meudia','vidadeadulto'], group: 'lifestyle' },
  'viagem':           { tags: ['viagem','viagembrasil','turismo','destinos','lugarlindo','viajando','destino','lugaresincriveis','praias','nordeste','viajandopelomundo','mochilao','roteirodeviagem','praiabr','destinos2024','turismonobrasil','hotelreview','viajandosozinha','destinobrasileiro','viagembarata','feriasbr','praiaparadisiaca','trilha','aventura','explorandobrasil'], group: 'lifestyle' },
  'música':           { tags: ['musica','musicabrasileira','musicanova','cantando','cover','sertanejo','funk','pagode','forró','mpb','musicabr','covervocal','showbr','performancemusical','karaokebr','cantandobem','vozlinda','violao','guitarrabr','bateria','musicaaoviavo','talentomusical','cantora','cantor','vocalcover'], group: 'lifestyle' },
  'ia transforma':    { tags: ['iatransforma','iatrend','inteligenciaartificial','iatiktok','aiart','iabrasileira','chatgpt','midjourney','aitrend','iafilme'], group: 'ia_novela' },
  'filtro ia':        { tags: ['filtrodeia','filtroai','filtroiatiktok','filtrointeligente','aimakeup','filtronovo','filtroviral','filtrodebeleza','filtroderosto','filtrotransforma'], group: 'ia_novela' },
  'novela ia':        { tags: ['noveladeia','novelaia','ianovela','personagemdeia','aidrama','iaenovela','iaatriz','personagemIA','novelacomIA','dramatransforma'], group: 'ia_novela' },
  'frutas ia':        { tags: ['frutasia','frutadeia','frutainteligencia','fruitai','iafrutas','frutasreais','frutahumana','frutapersonagem','frutaviral','iafruta'], group: 'ia_novela' },
  'novela antiga':    { tags: ['novelaantiga','novelasantigas','cenasdenovela','novelabrasileira','novela90','novela80','novelaclassica','novelaglobo','globo','redemancao'], group: 'ia_novela' },
  'cenas icônicas':   { tags: ['cenasiconica','cenasinesqueciveis','cenasclassicas','cenasepicas','cenasmarcantes','cenadenovela','cenafamosa','cenaviral','cenalendaria','cenadramática'], group: 'ia_novela' },
  'animalia ia':      { tags: ['animaliaia','animaisIA','petdeia','bichoia','animalinteligente','cachorroia','gatoia','animaltransforma','petai','iaanimal','animalfofoia','criaturaspeculiares','animaissurreais','faunaia','animaisincriveis','faunafantastica','criaturafantastica','animaiscriativos','bichofofoia','animalia2024'], group: 'ia_novela' },
  'frutinovela':      { tags: ['frutasia','frutas','novelafrutas','moranguete','abacatudo','bananildo','noveladefrutas','frutasIA','frutinovela','frutasanimadas','frutacomrosto','frutafalante','frutabr','frutadramática','noveladefruta','frutaengraçada','frutahumana','moranguetenovela','abacatudoenovela','frutameme','frutapersonagem','frutaviral','frutascriativas','iafruta','frutasdoamor'], group: 'novelas' },
  'mininovela':       { tags: ['mininovela','novelinha','novelatiktok','dramabr','novelabrasileira','micronovela','novelacurta','dramatiktok','dramabrasil','serietiktok','novelinhabr','draminha','dramazinho','historinha','contandohistoria','storytimebr','novelinhareal','novelinhadrama','dramatiktokbr','novelacurtabr','historiadramática','seriebr','webserie','noveladetiktok','dramabrasileiro','novelaresumida','conflitofamiliar','traicaonovela','episodiotiktok','novelaedit','dramaresumido'], group: 'novelas' },
  'cortesdenovela':   { tags: ['cortesdenovela','cortesdeserie','cortesdefilme','trechosdefilmes','trechosdeseries','cenasdenovela','cortesvirais','cortesbr','cenasiconicas','melhoresceanas','cortesnovela','cenafamosa','cenadramática','cortesdemovie','melhoresmomentosnovela','cenasclassicas','trechosfamosos','cortesbrasileiros','novelacorte','cenadetelenovela','cortesdesbt','cortesdeglobo','cenaviral','trechoicônico','cenaemocional'], group: 'novelas' },
  'novelaglobo':      { tags: ['novelaglobo','novela','novelasdaglobo','novelassbt','globo','sbt','recordtv','telenovela','novelasdatarde','novelabr'], group: 'novelas' },
  'organização':      { tags: ['organizacao','arrumandoacasa','rotinadelimpeza','casaarrumada','limpezadecasa','decoracao','cantinhodecorado','diydecoração','antesedepoisdicasa','organizador'], group: 'casa' },
  'unboxing':         { tags: ['unboxing','unboxingbr','unboxingbrasil','abrindoprodutos','abrindocaixas','abrindominhacaixa','unboxingtiktok','recebidos','recebidosdomes','jabá'], group: 'casa' },
  'decoração':        { tags: ['decoracao','decoracaodecasa','homedecor','casanova','transformacaodacasa','moveis','decoracaobr','decoracaosimples','cantinhodecorado','diydecoração','casadecorada','ambientedecor','interiorbr','saladesign','quartodecorado','cozinhadecorada','banheirodecorado','varandadecorada','iluminacaodecor','decorbr','decoracaomoderna','projetodecor','designdeinteriores','casabonita','movelplanejado'], group: 'casa' },
  'reforma':          { tags: ['reforma','reformadecasa','reformabr','antesedepoisreforma','reformabarata','movelplanejado','projetodecor','reformacasa','obrareforma','reformando','reformabarata','diyreforma','reformaapartamento','reformacozinha','reformabanheiro','pinturaparede','reformaquarto','antesedepois','obraemlcasa','reformasimples','casareformada','reformagastoupouco','reformafacil','construcao','pedreiro'], group: 'casa' },
  'faxina':           { tags: ['faxina','faxinacompleta','limpezadacasa','casalimpa','limpezaprofunda','faxinadacasa','rotinadelimpeza','limpandoacasa','faxinabr','faxinarapida','produtosdelimpeza','dicasdelimpeza','casabrilhando','limpezaorganizada','faxinapesada','faxinadedomingo','antesedepoisdelimpeza','limpezabr','limpeiminacasa','casacheirosa','rotinafaxina','limpezadecozinha','limpezadebanheiro','faxinadiarista','limpandotudo'], group: 'casa' },
  'diarista':         { tags: ['diarista','diaristabrasileira','diaristaprofissional','faxineira','limpezadomestica','diaristabr','limpeiminacasa','casacheirosa','limpandotudo','faxinapesada','diaristaemcasa','faxineirabr','diaristarotina','servicodomestico','limpezaprofissional','diaristadodia','trabalhodomestico','limparparamim','faxinacompleta','rotinadadiarista','diaristabrasil','limpezadecasa','minhafaxina','trabalhadoradomestica','diaristareal'], group: 'casa' },
  'motivação':        { tags: ['motivacao','motivacional','frases','superacao','forcadevontade','motivacaodiaria','frasedodia','inspiracao','naodesista','acredite','foco','disciplina','determinacao','mindsetbr','empreendedorismo','guerreiro','vencedor','nuncadesista','forçaegarra','pensepositivo','motivacaobr','hustlebr','mentalidade','autoconfianca','crescimentopessoal'], group: 'dicas' },
  'receita':          { tags: ['receita','receitafacil','receitarapida','receitadehoje','cozinhando','cozinha','comida','gastronomia','receitacaseira','receitafit'], group: 'dicas' },
  'dica':             { tags: ['dica','dicas','dicautil','dicadodia','dicaboa','dicaspráticas','dicavaliosa','dicasparavida','hackdevida','saibamais'], group: 'dicas' },
  'curiosidade':      { tags: ['curiosidade','curiosidades','vocesabia','fatocurioso','mundocurioso','sabiaque','fatosinteressantes','incrivel','naoesabia','ciencia','descoberta','curiosidadebr','curiosidademundo','fatoincrivel','curiosidadehistoria','fatochocante','curiosidadenatureza','cienciacuriosa','mundoincrivel','curiosidadedodia','sabiadessa','fatoreal','informacaoutil','culturageral','mundocuriosobr'], group: 'dicas' },
  'fitness':          { tags: ['fitness','treino','academia','treinoemmcasa','musculacao','maromba','treinopesado','hipertrofia','treinoab','cardio'], group: 'dicas' },
  'saúde':            { tags: ['saude','saudavel','bemestar','vidasaudavel','alimentacao','alimentacaosaudavel','nutricao','dieta','emagrecer','corpoperfeito'], group: 'dicas' },
  'hack':             { tags: ['hack','lifehack','hacksdecasa','hackdetiktok','truque','truques','facilitaavida','gambiarra','solucao','dicahack','lifehackbr','comoresolver','jeitofacil','dicagenial','vocenaosabia','hackdomomento','truquerapido','dicasimples','gambiarra2024','atalho'], group: 'dicas' },
  'tutorial':         { tags: ['tutorial','tutorialtiktok','comofazer','passoapasso','aprenda','aprendacomigo','facavocemesmo','diy','howto','tutorial2024','dicascasa','aprendanotiktok','facildefazer','dicasuteis','tutorialbr','comofazerisso','dicasdoidas','truqueparafazer','tutorialdiy','comoaprender','dicaspraticas','aprendizagemtiktok'], group: 'dicas' },
  'react':            { tags: ['react','reaction','reacao','reagindo','reacttiktok','reactbr','primeirareacao','reactvideo','reactmemes','reaçãobr','reagindoavideo','reactchocante','reactengraçado','reactbrasil','primeiraimpressao','reaçãoreal','reactnovela','reactmusica','reacttiktokbr','reagindoamemes','reagindoavideos','reactdrama','reactcomedia','vidareact','reactfail'], group: 'hook' },
  'desafio':          { tags: ['desafio','desafioviralbr','challenge','desafioviral','aceitedesafio','challengebr','desafiodancinha','desafionovo','tentativa','desafioimpossivel','desafiotiktok','challengeviral','desafiobr','desafiomaluco','desafiocomida','desafiocaseiro','desafioamigos','tenteiisso','desafioengraçado','desafio2024','challengebrasil','desafiopedreiro','desafiodificil','desafiocriativo','desafiodefitness'], group: 'hook' },
  'antes e depois':   { tags: ['antesedepois','antes_e_depois','beforeandafter','transformacao','resultado','antesdepois','antesxdepois','evolucao','mudei','comparacao','glowuptiktok','transformacaototal','mudancaradical','virououtrapessoa','antesdepoisreforma','antesdepoisrosto','antesdepoiscasa','antesdepoiscabelo','transformacaobr','mudancavisual'], group: 'hook' },
  'transformação':    { tags: ['transformacao','transformacaovisual','glow','glowup','mudanca','mudancadrastica','evolucao','transformei','antesedepois','mudeidemais'], group: 'hook' },
  'chocante':         { tags: ['chocante','choquei','inacreditavel','absurdo','impressionante','naoacredito','chocado','queisso','impossivel','surreal'], group: 'hook' },
  'exposed':          { tags: ['exposed','expondo','verdade','revelando','desmascarando','exposto','revelacao','segredo','mentira','descubra'], group: 'hook' },
  'polêmico':         { tags: ['polemico','polemica','controverso','opiniaoimpopular','debate','treta','briga','discussao','tretinha','opiniao'], group: 'hook' },
  'ninguém esperava': { tags: ['ninguemesperava','inesperado','surpresa','plottwist','reviravolta','ngmesperava','finalinesperado','surpreendente','ninguemviu','pegoudesprevenido'], group: 'hook' },
  'oddly satisfying': { tags: ['oddlysatisfying','satisfyingvideos','tãosatisfatório','satisfyingclean','satisfyingasmr','satisfyingslime','satisfyingfood','satisfyingcraft','satisfyingcutting','satisfyingpaint','satisfyingsoap','satisfyingcandy','satisfyingmachine','satisfyingart','satisfyingnature','satisfyingprocess','satisfyingrepair','satisfyingpeel','satisfyingmix','satisfyingbr','hipnotizante','satisfacaovisual','limpezasatisfying','organizandoarmario','cortesatisfying'], group: 'satisfying' },
  'relaxante':        { tags: ['relaxante','relaxar','calma','pazsinterior','meditacao','tranquilidade','relaxamento','paz','relax','dormir','sonsrelaxantes','natureza','chuvacaindo','sonslanatureza','relaxarbr','vidatranquila','momentodepaz','calmaria','somrelaxante','relaxantevisual','relaxantemental','relaxandoamente','terapia','zenmode','relaxandoemcasa'], group: 'satisfying' },
  'você sabia?':      { tags: ['vocesabia','sabiaque','fato','fatosinteressantes','incrivel','sabiadessa','curiosidadedomundo','fatoreal','verdadeounao','informacao'], group: 'satisfying' },
  'fato curioso':     { tags: ['fatocurioso','fatoscuriosos','curiosidadesdomundo','naoesabia','mundocurioso','fatosdomundo','planetaterra','cienciacuriosa','universocurioso','ninguémsabia'], group: 'satisfying' },
};

// ── Brazilian content detection (full port from frontend Index.tsx isBrazilianContent) ──
const NON_BR_AUTHOR_PATTERNS = /^(the_|mr_|mrs_|miss_|queen|king|vibes_|baby_|princess|prince|daddy|mommy|babe\d)/i;
const NON_BR_CONTENT_PATTERNS = /\b(kpop|k-pop|kpopfyp|babymonster|blackpink|twice|bts|stray ?kids|enhypen|aespa|itzy|newjeans|nct|seventeen|exo|red ?velvet|mamamoo|ateez|txt|ive|le ?sserafim|fancam|stan|bias|oppa|unnie|noona|hyung|aegyo|hallyu|comeback|teaser|choreo|idol|trainee|debut|maknae|selca|mukbang|pinay|pinoy|habibi|mashallah|tuto facile|apprend|yaparsam|bercanda|serius|ne yap|loquendo|pedrosanchez|dimision|angola.*portugal|portugal.*angola|romania|anglia|deutschland|polska|česko|magyarország)\b/i;
const FOREIGN_LANG_PATTERNS = /\b(yapay[ıi]m|anla[dğ]|kadar[ıi]m|bercanda|serius|luôn|aussi|facile|apprend[sr]?|miejmy|nadzieje|przeszyl|polska|kurwa|dobra|bardzo|teraz|tylko|jeszcze|ludzie|gdzie|kiedy|dlaczego|wszystko|niczego|naprawde|c'est|donc|alors|cette|avec|pour|dans|nous|vous|leur|quand|chez|sont|tout|tres|même|être|faire|comme|peut|maniere|manière|nouvell|questa|quello|dieser|diese|terima ?kasih|salamat|construccion|encuentro|siempre|porque|cuando|donde|también|tambien|aunque|todavía|todavia|necesito|puedo|quiero|jefesito|enamorado|sprawiaj|kobiety|szpach|legiobb|zagad|sprawia|piéces|essentielles|dressing|mignon|minimalist|setup|organisez|rangement|ikea hack|centavos|despensa|action diy|pièces)\b/i;
const FOREIGN_SENTENCE_PATTERNS = /\b(du |de la |les |des |une |un |est |et |en |au |aux |sur |sous |par |qui |que |il |elle |nous |vous |ils |elles |mon |ton |son |mes |tes |ses |notre |votre |leur |ce |cet |ces |el |la |los |las |del |al |con |sin |por |para |pero |como |más |muy |tiene |puede |hay |donde |cuando |quien |ese |eso |esta |estos |estas |aquí |allí )\b/gi;
const CJK_PATTERN = /[\u3000-\u9FFF\uAC00-\uD7AF\u3040-\u309F\u30A0-\u30FF]/;
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;
const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F]/;
const OTHER_SCRIPT_PATTERN = /[\u0E00-\u0E7F\u0900-\u097F\u0B80-\u0BFF\u1000-\u109F]/;
const ENG_WORDS_PATTERN = /\b(the|you|this|that|with|from|have|are|was|for|not|but|what|all|can|her|one|our|out|day|get|has|him|his|how|its|may|new|now|old|see|way|who|did|got|let|say|she|too|use|love|like|just|your|follow|thank|please|comment|share|watch|look|girl|boy|we|i love|construction|trucks|challenge|always|never|keep|how to|i love the)\b/gi;
const FOREIGN_EN_WORDS = /\b(the|this|that|when|with|your|have|from|they|what|are|you|for|and|its|were|been|would|could|should|their|about|into|over|then|them|these|those|will|just|like|make|know|time|very|back|also|only|come|than|most|find|here|thing|many|some|take|want|give|good|look|think|after|work|call|first|need|keep|help|every|still|between|never|start|last|might|next|under|right|tell|does|turn|another|same|each|feel|before|follow|show|live|scary|elevator|prank|challenge|funny|amazing|awesome|incredible|watch|check|guys|hey|omg|wtf|lol|bro|dude|girl|how|why|really|actually|literally|basically|people|money|world|gone|wrong|wait|part|real|best|worst|ever|must|much|most|didn|wasn|won|isn|don|can|fun|try|home|love|princess|dance|dancing|music|song|cute|sweet|hot|cool|old|new|big|little|small|long|short|high|low|fast|slow|happy|sad|mad|bad|let|get|put|set|run|sit|stand|move|play|hit|cut|buy|sell|kill|win|lose|eat|drink|sleep)\b/gi;
const FOREIGN_ES_WORDS = /\b(pero|muy|esto|hola|gracias|hermano|bueno|jaja|amigo|novia|pareja|siempre|cuando|donde|también|tambien|porque|aunque|todavía|todavia|necesito|puedo|quiero|tiene|puede|vamos|mejor|peor|nunca|otra|otro|mismo|aquí|ahora|entonces|después|antes|todos|nada|algo|alguien|nadie|mucho|poco|demasiado|bastante|cada|algún|ningún|cualquier|bromas|broma|loquendo|dimision|dimisión|gobierno|presidente|elecciones|espana|españa|companero|compañero|chicos|chicas|mira esto|increíble|increible|verdad|cuidado|peligro|tonto|tonta|guapo|guapa|novio|chistoso|chistosa|gracioso|graciosa|jajaja|miren|playa)\b/gi;
const FOREIGN_FLAG_PATTERN = /🇦🇴|🇵🇹|🇪🇸|🇦🇷|🇨🇴|🇲🇽|🇨🇱|🇵🇪|🇻🇪|🇪🇨|🇺🇾/g;
const FOREIGN_FR_WORDS = /\b(c'est|avec|pour|dans|nous|vous|leur|quand|chez|sont|tout|très|même|être|faire|comme|peut|donc|alors|cette|aussi|encore|entre|après|avant|rien|toujours|jamais|quelque|chaque|depuis|pendant|sans|vers|ici|ailleurs|bonjour|merci|oui|salut|putain|merde|trop|voilà|quoi|bah|ouais|nan|chéri|chérie|les|jeudis|théâtre|theatre|sensation|échecs|checs|magnifique|formidable|incroyable)\b/gi;
const FOREIGN_IT_WORDS = /\b(questa|quello|perché|anche|dove|cosa|ogni|tutto|niente|qualcosa|qualcuno|nessuno|troppo|abbastanza|già|adesso|dopo|insieme|senza|contro|circa|pensi|voglio|posso|male|grazie|ciao|buongiorno|allora|molto|bello|ragazza|ragazzi|andiamo|stai|faccio|vuoi|sai|vieni|aspetta|scattano|macchina|bellissimo|bellissima|buonasera|perfetto|perfetta|mangiare|piace|prego)\b/gi;
const FOREIGN_DE_WORDS = /\b(dieser|diese|dieses|nicht|aber|auch|noch|oder|wenn|dass|weil|schon|immer|wieder|vielleicht|zwischen|gegen|unter|über|jetzt|heute|morgen|gestern|zusammen|ich|du|er|sie|wir|das|ist|bin|hab|macht|schau|guck|alter|krass|digga|bitte|danke|ja|nein|deutsche|türkische|trkische|ehefrauen|metern|rechts|winken|strasse|straße|wunderbar|gemütlich|kindergarten|bürgergeld|brgergeld|kreativ)\b/gi;
const BR_POSITIVE_CHARS = /[ãáàâéêíóôõúüç]/;
const BR_POSITIVE_WORDS = /\b(kkk+|mano|cara|gente|demais|muito|pra|né|tá|tô|vou|vai|faz|bora|slk|tmj|vlw|pqp|mds|então|voce|ninguem|obrigad|bonit|danç|dançando|pegadinha|zoeira|humor|comedia|risada|brasil|garota|menina|mulher|gostosa|linda|gata|novinha|solteira|treino|treinar|cabelo|maquiagem|roupa|look|arrasou|amei|perfeita|maravilhosa|marido|namorad|namoral|partiu|saudade|churrasco|pagode|sertanejo|funk|forró|baile|favela|praia|carnaval|família|irmã|mãe|jeitinho|boa noite|bom dia|oii|olá|oi |hein|eita|uai|oxe|vish|krl|pqp|carai|poha|slc|mlk|mina|meu deus|socorro)\b/i;
const BR_HASHTAGS_PATTERN = /#(parati|dancinha|novelinha|tiktokbr|brasilvibes|brasileira|brasileiro|mulherlinda|mulherbonita|gatinha|novinha|dancafeminina|garotadançando|corpofeminino|shape|treino|academia|sertanejo|funk|pagode|humor|comedia|zoeira|pegadinha|risada|desafio|react|chocante|exposed|polemico|motivacao|receita|dica|curiosidade|rotina|viagem|musica|piseiroforr[oó]|bregafunk|asmeninadotiktok|dancinhasdotiktok|jeitinhobrasileiro|bolotinha|morena|morenalinda|pretinha|carioca|paulista|mineira|nordestina|sulista|gaúcha|flamengo|corinthians|palmeiras|recife|salvador|fortaleza|riodejaneiro|saopaulo|curitiba|belemdo[pP]ara)\b/i;

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
  video_width?: number;
  video_height?: number;
  region?: string | null;
}

const EMPTY_TITLE_RE = /^(v[ií]deo\s*sem\s*t[ií]tulo|sem\s*t[ií]tulo|video\s*sem\s*titulo|)$/i;

// Grupos visuais/sonoros — conteúdo universal, não precisa ser BR
const VISUAL_SONIC_GROUPS = new Set(['relaxante', 'satisfying', 'oddly satisfying', 'asmr']);

// Filtro primário por region (dado oficial do TikTok via TikWM)
// Retorna: true=estrangeiro, false=BR, null=sem dado (usar fallback)
function isForeignByRegion(v: PoolVideo): boolean | null {
  const region = v.region?.toUpperCase();
  if (!region) return null;
  if (region === 'BR') return false;
  return true;
}

// Soft check para grupos visuais — só rejeita lixo extremo (scripts não-latinos, kpop/anime)
function isHardForeign(v: PoolVideo): boolean {
  const title = (v.title || '').toLowerCase();
  const author = (v.author || '').toLowerCase();
  const text = `${title} ${author}`;

  if (EMPTY_TITLE_RE.test(title.trim())) return true;
  if (CJK_PATTERN.test(text)) return true;
  if (CYRILLIC_PATTERN.test(text)) return true;
  if (ARABIC_PATTERN.test(text)) return true;
  if (OTHER_SCRIPT_PATTERN.test(text)) return true;
  if (NON_BR_CONTENT_PATTERNS.test(text)) return true;

  return false;
}

// Returns true if content is NOT Brazilian (should be rejected)
function isForeignContent(v: PoolVideo): boolean {
  const title = (v.title || '').toLowerCase();
  const rawTitle = v.title || '';
  const author = (v.author || '').toLowerCase();
  const text = `${title} ${author}`;

  // Reject empty/generic titles
  if (EMPTY_TITLE_RE.test(title.trim())) return true;

  // Reject if foreign country flags present
  if (FOREIGN_FLAG_PATTERN.test(rawTitle)) return true;

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

  // ── CRITÉRIO C — Palavras culinárias/culturais estrangeiras (rejeição imediata) ──
  const FOREIGN_CULINARY = /\b(recette|magret|canard|patate douce|lavaş|tavuk|yemek|gastronomía|cocina casera|risotto fatto|plat du jour|cuisine terminé|recette facile|rapide à faire|ne yemek yapsam|ricetta italiana|pasta al dente)\b/i;
  if (FOREIGN_CULINARY.test(text)) return true;

  // ── CRITÉRIO D — Palavras fortes de outras línguas (rejeição imediata) ──
  const FOREIGN_STRONG = /\b(couteau|chêne|promenade|forêt|bellissimo|bellissima|buonasera|buongiorno|andiamo|ragazzi|ragazza|perfetto|mangiare|magnifique|formidable|wunderbar|gemütlich|kindergarten|intelligenz|vergleich|incroyable|fantastique|merveilleux)\b/i;
  if (FOREIGN_STRONG.test(text)) return true;

  // Reject high English density (4+ words)
  const engMatches = text.match(ENG_WORDS_PATTERN);
  if (engMatches && engMatches.length >= 4) return true;

  // Count foreign language words
  const enCount = (text.match(FOREIGN_EN_WORDS) || []).length;
  const esCount = (text.match(FOREIGN_ES_WORDS) || []).length;
  const frCount = (text.match(FOREIGN_FR_WORDS) || []).length;
  const itCount = (text.match(FOREIGN_IT_WORDS) || []).length;
  const deCount = (text.match(FOREIGN_DE_WORDS) || []).length;
  const totalForeign = enCount + esCount + frCount + itCount + deCount;

  // Reject if 2+ words in any single foreign language
  if (enCount >= 2 || esCount >= 2 || frCount >= 2 || itCount >= 2 || deCount >= 2) return true;

  // ── Separação de acentos: ã/õ/ç são EXCLUSIVOS do português BR ──
  const BR_EXCLUSIVE_CHARS = /[ãõç]/;
  const hasBrExclusive = BR_EXCLUSIVE_CHARS.test(text);
  const hasSharedAccent = /[áàâéêíóôúü]/.test(text);
  const hasBrWord = BR_POSITIVE_WORDS.test(text);
  const hasBrHashtag = BR_HASHTAGS_PATTERN.test(title);

  // ── CRITÉRIO B — 1 palavra estrangeira + nenhum sinal BR exclusivo → rejeitar ──
  if (totalForeign >= 1 && !hasBrWord && !hasBrHashtag && !hasBrExclusive) return true;

  // Reject English-dominant: 3+ EN without Portuguese signal
  const PORTUGUESE_WORDS = /\b(de|que|para|com|pelo|pela|eu|você|nós|ele|ela|não|sim|brasil|muito|tambem|também|aqui|agora|depois|antes|porque|por que|mas|isso|mesmo|mesma|meu|minha|seu|sua|esse|essa|nosso|nossa|fazer|como|onde|quando)\b/i;
  if (enCount >= 3 && !PORTUGUESE_WORDS.test(text) && !hasBrExclusive) return true;

  // ── CRITÉRIO E — Título curto sem sinal BR ──
  const titleText = title.replace(/#\w+/g, '').replace(/[^\w\s]/g, '').trim();
  if (titleText.length < 15 && !hasBrWord && !hasBrHashtag && !hasBrExclusive && !hasSharedAccent) return true;

  // ── Positive signals ──
  if (hasBrExclusive) return false;        // ã/õ/ç = BR exclusivo
  if (hasBrWord) return false;              // kkk, mano, cara, etc.
  if (hasBrHashtag) return false;           // #parati, #tiktokbr, etc.
  // Acento compartilhado (à/é/ê/etc.) SÓ conta se NÃO tem palavra estrangeira
  if (hasSharedAccent && totalForeign === 0) return false;

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
    const body = await req.json();
    const hashtag_group = body.hashtag_group;
    const target = Math.min(Math.max(Number(body.target) || 200, 50), 1000);

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

    // ── 1. Read existing pool tiktok_ids ──
    const { data: existingPool } = await adminClient
      .from('hashtag_pool')
      .select('tiktok_id, niche_approved')
      .eq('hashtag_group', groupKey);
    const existingIds = new Set((existingPool || []).map((r: any) => r.tiktok_id));
    const approvedIds = new Set((existingPool || []).filter((r: any) => r.niche_approved).map((r: any) => r.tiktok_id));

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

    // Helper: scrape a batch of tags
    const scrapeTags = async (tags: string[], opts: { cursor?: boolean; sortType?: number; limit?: number }) => {
      const vids: (PoolVideo & { source_hashtag: string })[] = [];
      const cursors = new Map<string, { cursor: string | null; exhausted: boolean }>();
      const perTag = opts.limit || Math.ceil((target * 3) / Math.max(tags.length, 1));
      const PARALLEL = 5;
      for (let i = 0; i < tags.length; i += PARALLEL) {
        const batch = tags.slice(i, i + PARALLEL);
        const results = await Promise.all(
          batch.map(async (tag) => {
            try {
              const body: any = { hashtag: tag, limit: perTag, light: true };
              if (opts.cursor) body.cursor = cursorMap.get(tag) || null;
              if (opts.sortType) body.sort_type = opts.sortType;
              const res = await fetch(`${supabaseUrl}/functions/v1/scrape-tiktok-apify`, {
                signal: AbortSignal.timeout(60000),
                method: 'POST',
                headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              if (!res.ok) return { tag, videos: [] as PoolVideo[], nextCursor: null, exhausted: true };
              const data = await res.json();
              const videos: PoolVideo[] = (data.videos || []).filter((v: any) => v.tiktok_id).map((v: any) => ({
                tiktok_id: v.tiktok_id, title: v.title || '', thumbnail: v.thumbnail || null,
                views: v.views || 0, likes: v.likes || 0, comments: v.comments || 0, shares: v.shares || 0,
                duration: v.duration || null, author: v.author || null,
                video_url: v.video_url || null, source_url: v.source_url || null,
                video_width: v.video_width || undefined, video_height: v.video_height || undefined,
                region: v.region || undefined,
              }));
              return { tag, videos, nextCursor: data.next_cursor || null, exhausted: !data.next_cursor };
            } catch { return { tag, videos: [] as PoolVideo[], nextCursor: null, exhausted: true }; }
          })
        );
        for (const r of results) {
          cursors.set(r.tag, { cursor: r.nextCursor, exhausted: r.exhausted });
          for (const v of r.videos) vids.push({ ...v, source_hashtag: r.tag });
        }
      }
      return { videos: vids, cursors };
    };

    // ── 3. THREE-LAYER SCRAPING ──
    const allVideos: (PoolVideo & { source_hashtag: string })[] = [];
    const newCursors = new Map<string, { cursor: string | null; exhausted: boolean }>();
    const topTags = preset.tags.slice(0, 5); // Use top 5 tags for layers 1 & 2
    let refreshedCount = 0;

    // Layer 1: Popular (sort_type=1, no cursor) — viral hits
    console.log(`[pool-refill] Layer 1: Popular for ${groupKey} (${topTags.length} tags)`);
    const layer1 = await scrapeTags(topTags, { sortType: 1, limit: 200 });
    for (const v of layer1.videos) {
      if (!existingIds.has(v.tiktok_id)) allVideos.push(v);
    }
    // Refresh URLs for already-approved videos (no Gemini cost)
    const layer1Existing = layer1.videos.filter(v => approvedIds.has(v.tiktok_id) && v.video_url);
    if (layer1Existing.length > 0) {
      for (let i = 0; i < layer1Existing.length; i += 50) {
        const batch = layer1Existing.slice(i, i + 50).map(v => ({
          hashtag_group: groupKey, tiktok_id: v.tiktok_id,
          video_url: v.video_url, fetched_at: new Date().toISOString(),
        }));
        await adminClient.from('hashtag_pool').upsert(batch, { onConflict: 'hashtag_group,tiktok_id' });
        refreshedCount += batch.length;
      }
    }
    console.log(`[pool-refill] Layer 1: ${allVideos.length} new popular, ${refreshedCount} URLs refreshed`);

    // Layer 2: Recent (no cursor, no sort_type)
    console.log(`[pool-refill] Layer 2: Recent for ${groupKey}`);
    const layer2 = await scrapeTags(topTags, { limit: 200 });
    for (const v of layer2.videos) {
      if (!existingIds.has(v.tiktok_id) && !allVideos.some(av => av.tiktok_id === v.tiktok_id)) {
        allVideos.push(v);
      }
    }
    // Refresh URLs for already-approved videos
    const layer2Existing = layer2.videos.filter(v => approvedIds.has(v.tiktok_id) && v.video_url);
    if (layer2Existing.length > 0) {
      for (let i = 0; i < layer2Existing.length; i += 50) {
        const batch = layer2Existing.slice(i, i + 50).map(v => ({
          hashtag_group: groupKey, tiktok_id: v.tiktok_id,
          video_url: v.video_url, fetched_at: new Date().toISOString(),
        }));
        await adminClient.from('hashtag_pool').upsert(batch, { onConflict: 'hashtag_group,tiktok_id' });
        refreshedCount += batch.length;
      }
    }
    console.log(`[pool-refill] Layer 2: ${allVideos.length} total new, ${refreshedCount} total refreshed`);

    // Layer 3: Cursor-deep (only if layers 1+2 added <20 new)
    if (allVideos.length < 20) {
      const activeTags = preset.tags.filter(t => !exhaustedSet.has(t));
      if (activeTags.length > 0) {
        console.log(`[pool-refill] Layer 3: Cursor-deep for ${groupKey} (${activeTags.length} active tags)`);
        const layer3 = await scrapeTags(activeTags, { cursor: true });
        for (const [tag, c] of layer3.cursors) newCursors.set(tag, c);
        for (const v of layer3.videos) {
          if (!existingIds.has(v.tiktok_id) && !allVideos.some(av => av.tiktok_id === v.tiktok_id)) {
            allVideos.push(v);
          }
        }
        console.log(`[pool-refill] Layer 3: ${allVideos.length} total new`);
      }
    }

    console.log(`[pool-refill] Scraped ${allVideos.length} new + ${refreshedCount} refreshed for group=${groupKey}`);

    // ── 4. Dedup by tiktok_id ──
    const seenIds = new Set<string>();
    const deduped = allVideos.filter(v => {
      if (seenIds.has(v.tiktok_id)) return false;
      seenIds.add(v.tiktok_id);
      return true;
    });

    // ── 5. Apply foreign content filter + calculate br_score ──
    const skipBrFilter = VISUAL_SONIC_GROUPS.has(groupKey);
    let regionBrCount = 0, regionForeignCount = 0, fallbackCount = 0;
    const brFiltered = skipBrFilter
      ? deduped.filter(v => !isHardForeign(v))
      : deduped.filter(v => {
          const byRegion = isForeignByRegion(v);
          if (byRegion === true) { regionForeignCount++; return false; }
          if (byRegion === false) { regionBrCount++; return true; }
          fallbackCount++;
          return !isForeignContent(v);
        });
    const withScores = brFiltered.map(v => ({ ...v, br_score: calcBrScore(v) }));
    console.log(`[pool-refill] BR filter (${skipBrFilter ? 'soft' : 'region+fallback'}): ${brFiltered.length}/${deduped.length} passed (region_br=${regionBrCount} region_foreign=${regionForeignCount} fallback=${fallbackCount})`);

    // ── 6. Call filter-by-niche ONLY for truly new videos (Gemini optimization) ──
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

        const nicheRes = await fetch(`${supabaseUrl}/functions/v1/filter-by-niche`, { signal: AbortSignal.timeout(60000),
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ videos: nicheVideos, nicheDescription, nicheKeywords: preset.tags.slice(0, 10), hashtag_group: groupKey }),
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

    // ── 7. Measure thumbnail aspect ratio in parallel (batches of 10) ──
    const MEASURE_PARALLEL = 10;
    let measuredCount = 0, verticalCount = 0, rejectedAspect = 0, measureFailed = 0;
    for (let i = 0; i < withScores.length; i += MEASURE_PARALLEL) {
      const batch = withScores.slice(i, i + MEASURE_PARALLEL);
      const dims = await Promise.all(batch.map(v => measureThumb(v.thumbnail || '')));
      for (let j = 0; j < batch.length; j++) {
        const d = dims[j];
        if (d) {
          batch[j].video_width = d.w;
          batch[j].video_height = d.h;
          measuredCount++;
          if (d.h >= d.w * 1.6) verticalCount++;
        } else {
          measureFailed++;
        }
      }
    }
    // Filter out non-vertical when dimensions are known
    const verticalVideos = withScores.filter(v => {
      const w = v.video_width || 0;
      const h = v.video_height || 0;
      if (w > 0 && h > 0 && h < w * 1.6) { rejectedAspect++; return false; }
      return true;
    });
    console.log(`[pool-refill] Aspect: measured=${measuredCount} vertical=${verticalCount} rejected=${rejectedAspect} failed=${measureFailed} kept=${verticalVideos.length}/${withScores.length}`);

    // ── 8. Upsert into hashtag_pool ──
    const rows = verticalVideos.map(v => ({
      hashtag_group: groupKey, tiktok_id: v.tiktok_id, title: v.title, thumbnail: v.thumbnail,
      views: v.views, likes: v.likes, comments: v.comments, shares: v.shares,
      duration: v.duration, author: v.author, video_url: v.video_url, source_url: v.source_url,
      source_hashtag: v.source_hashtag, br_score: v.br_score,
      video_width: v.video_width || null, video_height: v.video_height || null,
      video_region: v.region?.toUpperCase() || null,
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
        refreshed_urls: refreshedCount,
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
