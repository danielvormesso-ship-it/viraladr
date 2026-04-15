import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Download, ChevronUp, ChevronDown, Eye, Heart, MessageCircle, Share2, Volume2, VolumeX, Loader2, Play, Search, Hash, Shuffle, AlertTriangle, Check, Filter, LogOut, Settings, Archive, RefreshCw, Trash2, Film, Scissors, Sparkles, Wand2, X, TrendingUp, Star, Compass, Zap } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { activityTracker } from "@/lib/activityTracker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { tiktokApi, TikTokVideo, getVideoKey, getVideoMeta, dedupeVideos } from "@/lib/api/tiktok";
import { VideoEditorTab } from "@/components/VideoEditorTab";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Groups that are too generic and should SKIP niche/thumbnail AI filters
const GENERIC_GROUPS = new Set(["viral"]);

const PRESET_HASHTAGS = [
  // Humor & Entretenimento
  { tag: "pegadinha,pegadinhas,pegadinhaviral,pegadinhadetiktok,pegadinhaengraçada,trollagempesada,pegadinhacaseira,pegadinhanorua,peganinguem,pegadinhasbrasileiras,pegadinhareal,camerascondida,camaraescondida,armadilha,trote,trolei,trolagem,zuei,zoei,flagrante", emoji: "😂", label: "Pegadinha", group: "humor" },
  { tag: "humor,humorbrasil,humorbr,engraçado,piada,piadas,coisasengraçadas,videoengraçado,humornegro,rir", emoji: "🤣", label: "Humor", group: "humor" },
  { tag: "comedia,comediante,standupbr,comediabrasil,esquete,standup,comediabrasileira,humorista,parodiabr,imitacao", emoji: "😆", label: "Comédia", group: "humor" },
  { tag: "memes,memesbr,memesbrasil,memestiktok,memeviral,meme,memesengracados,memebrasileiro,memezeiro,shitpost", emoji: "🐸", label: "Memes", group: "humor" },
  { tag: "zoeira,zueira,zueirabr,zoeirasemfim,zoou,zuou,zoando,zuando,zoeirabrasil,bagunceiro", emoji: "😜", label: "Zoeira", group: "humor" },
  { tag: "risada,risadasgarantidas,morrendoderir,rachandoderir,morriderir,risadacontagiante,naoaguento,rirdemais,gargalhada,chorei", emoji: "😹", label: "Risada", group: "humor" },
  { tag: "fail,fails,epicfail,failarmy,deuruim,deuerrado,foimalfeito,errou,failbrasil,queda", emoji: "🤦", label: "Fail", group: "humor" },
  { tag: "trollbr,trollei,trollando,trollou,zuando,troll,trollagemboa,trolleigeral,prankbr,brincadeira", emoji: "👹", label: "Trollagem", group: "humor" },
  // Trends & Viral
  { tag: "viral,viralbrasil,viralizou,viralvideo,ficouViral,videosviral,oqueviralizou,bombou,estourou,viralhoje", emoji: "🔥", label: "Viral", group: "viral" },
  { tag: "fyp,foryou,foryoupage,fy,fypシ,pfrvc,paravocê,recomendado,fypbrasil,apareca", emoji: "⭐", label: "FYP", group: "viral" },
  { tag: "trending,trend,trendbr,trendtiktok,emalta,tendencia,tendencias,trendingnow,trendbrasil,hypado", emoji: "📈", label: "Trending", group: "viral" },
  { tag: "storytime,storytimebr,minhahistoria,contando,relato,desabafo,historia,historiareal,confissao,storytelling", emoji: "📖", label: "Storytime", group: "viral" },
  { tag: "parati,paravoce,recomendados,prapagina,aparecapramim,pravc,pfrvc,tepareceu,recomendo,vaipracima,paratipage,paratibrasil,recomendado,sugestao,apareceu,foryoubr,pyvbr,paravocepage", emoji: "🎯", label: "ParaTi", group: "viral" },
  { tag: "viraltiktok,tiktokviral,tiktokbrasil,tiktokbr,tiktokers,tiktokmemes,tiktok2024,tiktokhits,tiktokfamous,conteudoviral,viralizou,viralizando,bombou,bombando,estourou,hitdotiktok,topviral,trendingbr,viralbr,tiktok2025", emoji: "💥", label: "ViralTikTok", group: "viral" },
  // Lifestyle
  { tag: "dancinha,dancinhastiktok,dancinhaviral,danca,dançando,passinhos,coreografia,dancabr,dancatiktok,passinho,dancinhanova,dancetrend,coreografiafacil,dancabrasileira,dancinhafacil,dancinhafunk,dancinhapop,dancandoem,dancandosozinha,passosdedanca,dancinhahoje,dancaviraltiktok,dancefit,dancetiktokbr,dancinhaquente", emoji: "💃", label: "Dancinha", group: "lifestyle" },
  { tag: "novelinha,novelinhatiktok,atuando,cenadetiktok,dramatiktok,atuacaotiktok,dublagemtiktok,novelinhabr,atriz,ator,cena,novelinhadrama,tiktoknovela,novelinharomance,novelinhaviral,encenacao,encenando,dramatizacao,cenabr,atuacaobr,dublagemoriginal,dublandocenas,novelinhacomica,novelinhatriste", emoji: "🎬", label: "Novelinha", group: "lifestyle" },
  { tag: "satisfying,satisfatório,satisfyingvideo,oddlysatisfying,satisfyingbr,satisfacao,tãosatisfatório,limpeza,organizando,satisfyingclean,satisfyingasmr,satisfyingcutting,satisfyingslime,satisfyingfood,satisfyingcraft,limpar,limpandotudo,satisfacaovisual,hipnotizante,relaxasatisfying", emoji: "🤤", label: "Satisfying", group: "lifestyle" },
  { tag: "rotina,minharodina,rotinadiaria,rotinaprodutiva,dayinmylife,rotinademanha,rotinadanoite,rotinareal,meudia,vidadeadulto,rotinadesolteira,maemoderna,rotinadetrabalho,rotinafit,rotinaorganizada,meudiaaadia,rotinadecasal,cotidiano,meucotidiano,vidacotidiana", emoji: "🏠", label: "Rotina", group: "lifestyle" },
  { tag: "viagem,viagembrasil,turismo,destinos,lugarlindo,viajando,destino,lugaresincriveis,praias,nordeste,viajante,mochilao,viajarsozinha,viajardecarro,praiaslindas,destinosnacionais,brasilturismo,turistando,ferias,feriasbr,viajandopelomundo,roteirodeviagem,viajarbr", emoji: "✈️", label: "Viagem", group: "lifestyle" },
  { tag: "musica,musicabrasileira,musicanova,cantando,cover,sertanejo,funk,pagode,forró,mpb,rap,hiphopbr,cantar,cantora,cantor,musicabr,cantando🎤,voz,vocalbr,coverbr,musicaboa,hitbr,lançamento,musicaatual,tocando", emoji: "🎵", label: "Música", group: "lifestyle" },
  // Trends IA & Novelas
  { tag: "iatransforma,iatrend,inteligenciaartificial,iatiktok,aiart,iabrasileira,chatgpt,midjourney,aitrend,iafilme,iameme,artificialintelligence,iacriou,iadesign,iaincrivel,iareal,iaassustadora,iaviral,iamusica,imagemdeia,arteia,criatividade,futurocomia", emoji: "🤖", label: "IA Transforma", group: "ia_novela" },
  { tag: "filtrodeia,filtroai,filtroiatiktok,filtrointeligente,aimakeup,filtronovo,filtroviral,filtrodebeleza,filtroderosto,filtrotransforma,filtrodoanimal,filtroenvelhecer,filtrocrianca,filtrodemulher,filtromanga,filtroanime,filtrodobebe,filtrodivertido,filtromoda,filtrodehoje", emoji: "✨", label: "Filtro IA", group: "ia_novela" },
  { tag: "noveladeia,novelaia,ianovela,personagemdeia,aidrama,iaenovela,iaatriz,personagemIA,novelacomIA,dramatransforma,iaprotagonista,novelaartificial,iadramatica,iahistoria,personagemgeradoporia,iaelenco,iabrasileira,iacena,iaemocao,iadublagem", emoji: "📺", label: "Novela IA", group: "ia_novela" },
  { tag: "frutasia,frutadeia,frutainteligencia,fruitai,iafrutas,frutasreais,frutahumana,frutapersonagem,frutaviral,iafruta,frutacomrosto,frutaque,frutaengraçada,frutacriativa,frutafalante,frutabr,frutadegente,frutareal,iafrutaviral,frutamagica", emoji: "🍎", label: "Frutas IA", group: "ia_novela" },
  { tag: "novelaantiga,novelasantigas,cenasdenovela,novelabrasileira,novela90,novela80,novelaclassica,novelaglobo,globo,redemancao,terradosol,trechosnovela,novelassbt,novelarecord,novelainesquecivel,lacodefamilia,malhacao,mulheresdeareoia,onomedarosa,rochacortez,noveladosanos80,noveladosanos90,noveladosanos70,noveladrama,cenasclassicas,novelaseternais,roque_santeiro,tieta,pedroguerrero,tropicalia", emoji: "📼", label: "Novela Antiga", group: "ia_novela" },
  { tag: "cenasiconica,cenasinesqueciveis,cenasclassicas,cenasepicas,cenasmarcantes,cenadenovela,cenafamosa,cenaviral,cenalendaria,cenadramática,cenatensao,cenadechoro,cenaengraçada,cenadramatica,cenadeamor,cenadebeiho,cenaderevolta,cenademorte,cenaimportante,cenaemocionante,cenaeterna,cenadeglobo,cenabrasileira,cenadefilme", emoji: "🎭", label: "Cenas Icônicas", group: "ia_novela" },
  { tag: "animaliaia,animaisIA,petdeia,bichoia,animalinteligente,cachorroia,gatoia,animaltransforma,petai,iaanimal,iabicho,iacachorro,iagato,ianatureza,animaltransformado,iacomanimais,bichoincrivel,animalfofoia,iavet,pettransforma", emoji: "🐾", label: "Animalia IA", group: "ia_novela" },
  // Novelas & Séries
  { tag: "frutasia,frutas,novelafrutas,moranguete,abacatudo,bananildo,noveladefruta,frutinovela,frutosnovela,frutasIA,noveladefrutas,abacatudoenovela,moranguetenovela,frutasanimadas,frutascomIA", emoji: "🍓", label: "Frutinovela", group: "novelas" },
  { tag: "mininovela,novelinha,novelatiktok,dramabr,dramatiktok,novelabrasileira,dramabrasil,novelacurta,serietiktok,micronovela,noveladrama", emoji: "🎬", label: "Mininovela", group: "novelas" },
  { tag: "cortesdenovela,cortesdeserie,cortesdefilme,trechosdefilmes,trechosdeseries,cortesnovela,cenasdenovela,cortesbr,cortesvirais,melhoresceanas,cenasiconicas", emoji: "✂️", label: "Cortes", group: "novelas" },
  { tag: "novelaglobo,novela,novelasdaglobo,novelassbt,novelasbt,globo,sbt,recordtv,telenovela,novelabrasileira,novelasdatarde,novelabr", emoji: "📺", label: "Novela Globo/SBT", group: "novelas" },
  // Casa & Organização
  { tag: "organizacao,arrumandoacasa,rotinadelimpeza,casaarrumada,limpezadecasa,decoracao,cantinhodecorado,diydecoração,antesedepoisdicasa,organizador,minimalism,casanova,arrumandotudo,organizacaodecasa,limpezaprofunda,organizacaobr,casaorganizada,arrumacao,faxina,faxinacompleta,organizandoarmario,decoracaobr,casadecorada,decoracaosimples", emoji: "🏠", label: "Organização", group: "casa" },
  { tag: "unboxing,unboxingbr,unboxingbrasil,abrindoprodutos,abrindocaixas,abrindominhacaixa,unboxingtiktok,recebidos,recebidosdomes,jabá,recebidosamados,comprinhas,comprasonline,comprascasa,hauldecasa,haulamazon,haulshopee,organizandocompras,abrindoencomenda,encomendachegou,caixinha,caixacorreio,recebidoslindos,unboxingorganizacao,comprasorganizacao", emoji: "📦", label: "Unboxing", group: "casa" },
  { tag: "decoracao,decoracaodecasa,homedecor,casanova,transformacaodacasa,moveis,reforma,reformadecasa,reformabr,antesedepoisreforma,reformabarata,decoracaobr,decoracaosimples,cantinhodecorado,diydecoração,paineldetv,movelplanejado,instadecor,cozinhadecorada,quartodecorado,saladecor,decoracaomoderna,ambientedecorado,projetodecor,decorbr", emoji: "🎨", label: "Decoração", group: "casa" },
  { tag: "faxina,faxinacompleta,diarista,limpezadacasa,casalimpa,limpezaprofunda,faxinadacasa,rotinadelimpeza,limpandoacasa,antesedepoisdelimpeza,produtosdelimpeza,dicasdelimpeza,faxineira,limpezaorganizada,casabrilhando,limpezabr,faxinabr,diaristabrasileira,limpeiminacasa,faxinarapida,faxinapesada,limpezadomestica,casacheirosa,limpandotudo,faxinadedomingo", emoji: "🧹", label: "Faxina", group: "casa" },
  // Motivação & Dicas
  { tag: "motivacao,motivacional,frases,superacao,forcadevontade,motivacaodiaria,frasedodia,inspiracao,naodesista,acredite,foco,disciplina,determinacao,mindsetbr,mindset,empreendedorismo,hustlebr,motivacaobr,frasedemotivacao,pensepositivo,vencedor,guerreiro,forçaegarra,nuncadesista,levantaesacuda", emoji: "💪", label: "Motivação", group: "dicas" },
  { tag: "receita,receitafacil,receitarapida,receitadehoje,cozinhando,cozinha,comida,gastronomia,receitacaseira,receitafit,sobremesa,lanche,receitasimples,receitaboa,receitaprática,comidaboa,cozinhapratica,chefcaseiro,receitadebolo,receitadejantar,receitadealmoço,comidafit,receitadoce,receitasalgada,comidinhabr", emoji: "🍳", label: "Receita", group: "dicas" },
  { tag: "dica,dicas,dicautil,dicadodia,dicaboa,dicaspráticas,dicavaliosa,dicasparavida,hackdevida,saibamais,aprendacom,dicabr,dicadetiktok,dicafinanceira,dicadesaude,dicadebeleza,dicademoda,dicadecasa,dicaqueajuda,dicagratis,dicaincriavel", emoji: "💡", label: "Dica", group: "dicas" },
  { tag: "curiosidade,curiosidades,vocesabia,fatocurioso,mundocurioso,sabiaque,fatosinteressantes,incrivel,naoesabia,ciencia,descoberta,curiosidadebr,curiosidademundo,curiosidadedodia,fatoincrivel,curiosidadehistoria,fatochocante,curiosidadenatureza,curiosidadecientifica,mundocuriosobr", emoji: "🧠", label: "Curiosidade", group: "dicas" },
  { tag: "fitness,treino,academia,treinoemmcasa,musculacao,maromba,treinopesado,hipertrofia,treinoab,cardio,gym,shapebr,treinofeminino,treinodebraço,treinodegluteo,treinoback,gymlife,gymbr,treinohard,fitnessbr,corpodefinido,projetoverao,focadotreino,marombalife", emoji: "🏋️", label: "Fitness", group: "dicas" },
  { tag: "saude,saudavel,bemestar,vidasaudavel,alimentacao,alimentacaosaudavel,nutricao,dieta,emagrecer,corpoperfeito,saúdemental,saúdebr,saúdedamulher,saudedohomem,saudeemfoco,vidasana,menteesa,saúdeedoença,saúdeholistica,dietabr", emoji: "❤️", label: "Saúde", group: "dicas" },
  { tag: "hack,lifehack,hacksdecasa,hackdetiktok,truque,truques,facilitaavida,gambiarra,solucao,dicahack,macete,hackgenial,hackincrivel,hackfacil,hackbarato,hackrapido,hackbr,hackcaseiro,gambiarraboa,gambiarracriativa", emoji: "🔧", label: "Hack", group: "dicas" },
  { tag: "tutorial,tutorialtiktok,comofazer,passoapasso,aprenda,aprendacomigo,facavocemesmo,diy,howto,tutorial2024,ensinando,tutorialbr,tutorialsimples,tutorialrapido,comoeufico,comofizisso,tutorialdebeleza,tutorialdemaquiagem,tutorialdecabelo,tutorialdecasa", emoji: "📚", label: "Tutorial", group: "dicas" },
  // Hook forte
  { tag: "react,reaction,reacao,reagindo,reacttiktok,reactbr,primeirareacao,reactvideo,reactmemes,reaçãobr,reagindoavideo,reactengraçado,reactchocante,reactbrasil,reagindoatiktok,primeiraimpressao,reaçãoreal,reacttiktokbr,reactnovela,reactmusica", emoji: "😱", label: "React", group: "hook" },
  { tag: "desafio,desafioviralbr,challenge,desafioviral,aceitedesafio,challengebr,desafiodancinha,desafionovo,tentativa,desafioimpossivel,desafiocomida,desafiocasal,desafioamigos,desafioengraçado,desafioperigoso,desafiodificil,desafiocasa,challengeaceito,desafiomania,desafiobr", emoji: "🏆", label: "Desafio", group: "hook" },
  { tag: "antesedepois,antes_e_depois,beforeandafter,transformacao,resultado,antesdepois,antesxdepois,evolucao,mudei,comparacao,transformei,mudanca,evoluçãopessoal,antesedepoisreal,antesedepoisincrivel,transformacaocorporal,transformacaofacial,comparacaoreal,mudançadrástica", emoji: "✨", label: "Antes e Depois", group: "hook" },
  { tag: "transformacao,transformacaovisual,glow,glowup,mudanca,mudancadrastica,evolucao,transformei,antesedepois,mudeidemais,glowupbr,transformacaoreal,mudancaincriavel,transformacaototal,transformacaocabelo,transformacaocorpo,transformacaomaquiagem,transformacaovisualincrivel,evolucaoreal,antesxagora", emoji: "🔄", label: "Transformação", group: "hook" },
  { tag: "chocante,choquei,inacreditavel,absurdo,impressionante,naoacredito,chocado,queisso,impossivel,surreal,bizarro,chocantebr,chocantereal,muitochocante,chocantedemais,inacreditavelmas,absurdototal,naodapracrer,chocantetiktok,choquereal", emoji: "⚡", label: "Chocante", group: "hook" },
  { tag: "exposed,expondo,verdade,revelando,desmascarando,exposto,revelacao,segredo,mentira,descubra,segredorevelado,exposedtiktok,revelacaochocante,verdadeescondida,segredoobscuro,exposednofake,verdadesobre,revelei,desmascarei,segredoexposto", emoji: "🔍", label: "Exposed", group: "hook" },
  { tag: "polemico,polemica,controverso,opiniaoimpopular,debate,treta,briga,discussao,tretinha,opiniao,tretabr,polemicabr,polemicodehoje,tretadotiktok,polemicaviral,debatequente,tretaquente,opiniaoforte,controversia,brigatiktok", emoji: "🔥", label: "Polêmico", group: "hook" },
  { tag: "ninguemesperava,inesperado,surpresa,plottwist,reviravolta,ngmesperava,finalinesperado,surpreendente,ninguemviu,pegoudesprevenido,surpresareal,plottwistbr,reviravoltabr,inesperadodemais,ngmesperou,surpresamaior,reviravoltatotal,plottwisttiktok,ninguemimaginou,surpresafinal", emoji: "😲", label: "Ninguém Esperava", group: "hook" },
  // Satisfying & Curiosidades
  { tag: "oddlysatisfying,satisfyingvideos,tãosatisfatório,satisfyingclean,satisfyingasmr,satisfyingslime,satisfyingfood,satisfyingcraft,satisfyingcutting,satisfyingpaint,satisfyingsoap,satisfyingcandy,satisfyingmachine,satisfyingart,satisfyingnature,satisfyingprocess,satisfyingrepair,satisfyingpeel,satisfyingmix,satisfyingbr", emoji: "😌", label: "Oddly Satisfying", group: "satisfying" },
  { tag: "relaxante,relaxar,calma,pazsinterior,meditacao,tranquilidade,relaxamento,paz,relax,dormir,descanso,natureza,relaxando,relaxantedemais,sonoprofundo,meditacaobr,momentodepaz,relaxarmais,musicarelaxante,ambienteRelaxante,calmainterior,dormirbem", emoji: "🧘", label: "Relaxante", group: "satisfying" },
  { tag: "vocesabia,sabiaque,fato,fatosinteressantes,incrivel,sabiadessa,curiosidadedomundo,fatoreal,verdadeounao,informacao,vocesabiadisso,sabiaquebr,fatoincrivel,fatointeressante,sabiadessa,fatoverdadeiro,vocesabiaqueisso,informacaocuriosa,vocesabiabr,sabiaquenao", emoji: "🤔", label: "Você Sabia?", group: "satisfying" },
  { tag: "fatocurioso,fatoscuriosos,curiosidadesdomundo,naoesabia,mundocurioso,fatosdomundo,planetaterra,cienciacuriosa,universocurioso,ninguémsabia,fatosmundiais,fatosreais,fatoshistoricos,fatossobrenatureza,fatoscientificos,fatosincriveis,fatosaleatorios,fatossobre,fatobr,fatoraro", emoji: "💡", label: "Fato Curioso", group: "satisfying" },
];

// BR content ranking: BR hashtags → top, PT words → priority, 3+ ES words → bottom
function rankByBrazilianContent(vids: TikTokVideo[]): TikTokVideo[] {
  if (vids.length === 0) return vids;

  // Remove foreign videos completely
  const filtered = vids.filter(v => !isForeignContent(v));

  const BR_HASHTAGS = new Set(['brasil', 'br', 'brasileiros', 'brasileiro', 'tiktokviral🇧🇷', 'fyp🇧🇷', 'tiktoker']);
  const PT_WORDS = new Set(['kkk', 'né', 'tô', 'pra', 'vc', 'rsrs', 'mds', 'caramba', 'mano', 'cara', 'nossa', 'brasil', 'brasileiro', 'br', 'saudade', 'gente', 'aqui', 'também', 'então', 'muito', 'quando', 'porque']);

  const score = (v: TikTokVideo): number => {
    const text = `${v.title || ''} ${v.author || ''}`.toLowerCase();
    const words = new Set((text.match(/\b[\wáéíóúãõâêôàçñü]+\b/g) || []));
    const hashtags = (text.match(/#[\w🇧🇷áéíóúãõâêôàç]+/g) || []).map(h => h.slice(1));

    // Tier 3 — BR hashtags at top
    if (hashtags.some(h => BR_HASHTAGS.has(h) || h.includes('🇧🇷'))) return 3;

    // Tier 2 — Portuguese signal words
    if ([...PT_WORDS].some(w => words.has(w))) return 2;

    return 1; // Tier 1 — neutral
  };

  return [...filtered].sort((a, b) => score(b) - score(a));
}

// Foreign content detection — REMOVE (not rank) videos that are clearly non-Portuguese
const FOREIGN_EN_WORDS = /\b(the|this|that|when|with|your|have|from|they|what|are|you|for|and|its|were|been|would|could|should|their|about|into|over|then|them|these|those|will|just|like|make|know|time|very|back|also|only|come|than|most|find|here|thing|many|some|take|want|give|good|look|think|after|work|call|first|need|keep|help|every|still|between|never|start|last|might|next|under|right|tell|does|turn|another|same|each|feel|before|follow|show|live|scary|elevator|prank|challenge|funny|amazing|awesome|incredible|watch|check|guys|hey|omg|wtf|lol|bro|dude|girl|how|why|really|actually|literally|basically|people|money|world|gone|wrong|wait|part|real|best|worst|ever|must|much|most|didn|wasn|won|isn|don|can|fun|try|home|love|princess|dance|dancing|music|song|cute|sweet|hot|cool|old|new|big|little|small|long|short|high|low|fast|slow|happy|sad|mad|bad|let|get|put|set|run|sit|stand|move|play|hit|cut|buy|sell|kill|win|lose|eat|drink|sleep)\b/gi;
const FOREIGN_ES_WORDS = /\b(pero|muy|esto|hola|gracias|hermano|bueno|jaja|amigo|novia|pareja|siempre|cuando|donde|también|tambien|porque|aunque|todavía|todavia|necesito|puedo|quiero|tiene|puede|vamos|mejor|peor|nunca|otra|otro|mismo|aquí|ahora|entonces|después|antes|todos|nada|algo|alguien|nadie|mucho|poco|demasiado|bastante|cada|algún|ningún|cualquier|bromas|broma|loquendo|dimision|dimisión|gobierno|presidente|elecciones|espana|españa|companero|compañero|chicos|chicas|mira esto|increíble|increible|verdad|mentira|cuidado|peligro|tonto|tonta|guapo|guapa|novio|chistoso|chistosa|gracioso|graciosa|jajaja|miren)\b/gi;
const FOREIGN_FR_WORDS = /\b(c'est|avec|pour|dans|nous|vous|leur|quand|chez|sont|mais|tout|très|même|être|faire|comme|peut|donc|alors|cette|aussi|encore|entre|après|avant|rien|toujours|jamais|quelque|chaque|depuis|pendant|sans|vers|ici|ailleurs|bonjour|merci|oui|salut|putain|merde|trop|voilà|quoi|bah|ouais|nan|chéri|chérie|les)\b/gi;
const FOREIGN_IT_WORDS = /\b(questa|quello|perché|anche|dove|cosa|ogni|tutto|niente|qualcosa|qualcuno|nessuno|troppo|abbastanza|già|adesso|dopo|insieme|senza|contro|circa|pensi|sono|voglio|posso|bene|male|grazie|ciao|buongiorno|allora|molto|bello|ragazza|ragazzi|andiamo|stai|faccio|vuoi|sai|vieni|aspetta)\b/gi;
const FOREIGN_DE_WORDS = /\b(dieser|diese|dieses|nicht|aber|auch|noch|oder|wenn|dass|weil|schon|immer|wieder|vielleicht|zwischen|gegen|unter|über|jetzt|heute|morgen|gestern|zusammen|ich|du|er|sie|wir|das|ist|bin|hab|macht|schau|guck|alter|krass|digga|bitte|danke|ja|nein)\b/gi;
const BR_POSITIVE_WORDS = /\b(kkk+|mano|cara|gente|demais|muito|pra|né|tá|tô|vou|vai|faz|bora|slk|tmj|vlw|pqp|mds|então|voce|ninguem|obrigad|bonit|danç|dançando|pegadinha|zoeira|humor|comedia|risada|brasil|garota|menina|mulher|gostosa|linda|gata|novinha|solteira|treino|cabelo|maquiagem|roupa|look|arrasou|amei|perfeita|maravilhosa|saudade|churrasco|pagode|sertanejo|funk|forró|baile|favela|praia|carnaval|família|irmã|mãe|jeitinho|boa noite|bom dia|oii|olá|eita|uai|oxe|vish|krl|carai|poha|slc|mlk|mina|meu deus|socorro)\b/i;
const BR_POSITIVE_CHARS = /[ãáàâéêíóôõúüç]/;

// Flags of non-BR countries that share Portuguese/Spanish vocab: 🇦🇴🇵🇹🇪🇸🇦🇷🇨🇴🇲🇽🇨🇱🇵🇪🇻🇪🇪🇨🇺🇾
const FOREIGN_FLAG_PATTERN = /🇦🇴|🇵🇹|🇪🇸|🇦🇷|🇨🇴|🇲🇽|🇨🇱|🇵🇪|🇻🇪|🇪🇨|🇺🇾/g;

function isForeignContent(v: TikTokVideo): boolean {
  const title = (v.title || '').toLowerCase();
  const author = (v.author || '').toLowerCase();
  const rawTitle = v.title || '';
  const text = `${title} ${author}`;
  // Reject if foreign country flags present (🇦🇴🇵🇹🇪🇸🇦🇷🇨🇴🇲🇽🇨🇱🇵🇪)
  const foreignFlags = rawTitle.match(FOREIGN_FLAG_PATTERN);
  if (foreignFlags && foreignFlags.length >= 1) return true;
  // Reject non-BR author patterns
  if (NON_BR_AUTHOR_PATTERNS.test(author.replace('@', ''))) return true;
  // Reject non-BR culture (kpop, anime, etc.)
  if (NON_BR_CONTENT_PATTERNS.test(text)) return true;
  // Reject foreign languages (Turkish, Polish, Indonesian, etc.)
  if (FOREIGN_LANG_PATTERNS.test(text)) return true;
  // Reject foreign sentence patterns (FR/ES structures)
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
  // Require at least one positive BR signal
  if (BR_POSITIVE_CHARS.test(text)) return false;
  if (BR_POSITIVE_WORDS.test(text)) return false;
  if (BR_HASHTAGS_PATTERN.test(title)) return false;
  // No positive signal → foreign
  return true;
}

// Hoisted regex patterns for isBrazilianContent (avoid re-creation per call)
const NON_BR_AUTHOR_PATTERNS = /^(the_|mr_|mrs_|miss_|queen|king|vibes_|baby_|princess|prince|daddy|mommy|babe\d)/i;
const NON_BR_CONTENT_PATTERNS = /\b(kpop|k-pop|kpopfyp|babymonster|blackpink|twice|bts|stray ?kids|enhypen|aespa|itzy|newjeans|nct|seventeen|exo|red ?velvet|mamamoo|ateez|txt|ive|le ?sserafim|fancam|stan|bias|oppa|unnie|noona|hyung|aegyo|hallyu|comeback|teaser|choreo|idol|trainee|debut|maknae|selca|mukbang|pinay|pinoy|habibi|mashallah|tuto facile|apprend|yaparsam|bercanda|serius|ne yap|loquendo|pedrosanchez|dimision|angola.*portugal|portugal.*angola)\b/i;
const FOREIGN_LANG_PATTERNS = /\b(yapay[ıi]m|anla[dğ]|kadar[ıi]m|bercanda|serius|luôn|aussi|facile|apprend[sr]?|c'est|donc|alors|cette|cette|cette|cette|avec|pour|dans|nous|vous|leur|quand|chez|sont|mais|tout|tres|même|être|faire|comme|peut|j'ai|l'on|qu'il|qu'on|cette|cette|maniere|manière|nouvell|dembrasser|questa|quello|dieser|diese|terima ?kasih|salamat|salamat po|costrucion|construccion|encuentro|siempre|porque|cuando|donde|también|tambien|aunque|todavía|todavia|necesito|puedo|quiero|jefesito|enamorado|comear|sprawiaj|kobiety|szpach|legiobb|zagad|sprawia|piéces|essentielles|dressing|mignon|minimalist|setup|organisez|organisez|rangement|ikea hack|centavos|despensa|action diy|pièces)\b/i;
const FOREIGN_SENTENCE_PATTERNS = /\b(du |de la |les |des |une |un |est |et |en |au |aux |sur |sous |par |qui |que |il |elle |nous |vous |ils |elles |mon |ton |son |mes |tes |ses |notre |votre |leur |ce |cet |ces |el |la |los |las |del |al |con |sin |por |para |pero |como |más |muy |tiene |puede |hay |donde |cuando |quien |ese |eso |esta |estos |estas |aquí |allí )\b/gi;
const CJK_PATTERN = /[\u3000-\u9FFF\uAC00-\uD7AF\u3040-\u309F\u30A0-\u30FF]/;
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;
const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F]/;
const OTHER_SCRIPT_PATTERN = /[\u0E00-\u0E7F\u0900-\u097F\u0B80-\u0BFF\u1000-\u109F]/;
const ENG_WORDS_PATTERN = /\b(the|you|this|that|with|from|have|are|was|for|not|but|what|all|can|her|one|our|out|day|get|has|him|his|how|its|may|new|now|old|see|way|who|did|got|let|say|she|too|use|love|like|just|your|follow|thank|please|comment|share|watch|look|girl|boy|we|i love|construction|trucks|challenge|always|never|keep|how to|i love the)\b/gi;
const BR_CHARS_PATTERN = /[ãáàâéêíóôõúüç]/;
const BR_WORDS_PATTERN = /\b(kkk+|mano|cara|gente|demais|muito|pra|né|tá|tô|vou|vai|faz|bora|slk|tmj|vlw|pqp|mds|então|voce|ninguem|obrigad|bonit|danç|dançando|pegadinha|zoeira|humor|comedia|risada|brasil|garota|menina|mulher|gostosa|linda|gata|novinha|solteira|treino|treinar|cabelo|maquiagem|roupa|look|arrasou|amei|perfeita|maravilhosa|marido|namorad|namoral|partiu|saudade|churrasco|pagode|sertanejo|funk|forró|baile|favela|praia|carnaval|família|irmã|mãe|jeitinho|boa noite|bom dia|oii|olá|oi |hein|eita|uai|oxe|vish|krl|pqp|carai|poha|slc|mlk|mina|meu deus|socorro)\b/i;
const BR_HASHTAGS_PATTERN = /#(parati|dancinha|novelinha|tiktokbr|brasilvibes|brasileira|brasileiro|mulherlinda|mulherbonita|gatinha|novinha|dancafeminina|garotadançando|corpofeminino|shape|treino|academia|sertanejo|funk|pagode|humor|comedia|zoeira|pegadinha|risada|desafio|react|chocante|exposed|polemico|motivacao|receita|dica|curiosidade|rotina|viagem|musica|piseiroforr[oó]|bregafunk|asmeninadotiktok|dancinhasdotiktok|jeitinhobrasileiro|bolotinha|morena|morenalinda|pretinha|carioca|paulista|mineira|nordestina|sulista|gaúcha|flamengo|corinthians|palmeiras|recife|salvador|fortaleza|riodejaneiro|saopaulo|curitiba|belemdo[pP]ara)\b/i;

const Index = () => {
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const videosRef = useRef<TikTokVideo[]>([]);
  // Keep ref in sync with state so async closures always read latest
  useEffect(() => { videosRef.current = videos; }, [videos]);
  // Backstop dedup: tracks all keys+metas currently in the UI
  const videosInUIRef = useRef<{ keys: Set<string>; metas: Set<string> }>({ keys: new Set(), metas: new Set() });
  // Cursor for single hashtag scrape — persists between searches of same tag
  const singleScrapeCursorRef = useRef<{ tag: string; cursor: string | null }>({ tag: '', cursor: null });

  // Persist cursors in localStorage (survives F5/browser close, TTL 24h)
  const CURSOR_TTL = 24 * 60 * 60 * 1000;
  const saveCursor = useCallback((tag: string, cursor: string) => {
    try { localStorage.setItem(`cursor_${tag}`, JSON.stringify({ cursor, updatedAt: Date.now() })); } catch {}
  }, []);
  const loadCursor = useCallback((tag: string): string | null => {
    try {
      const raw = localStorage.getItem(`cursor_${tag}`);
      if (!raw) return null;
      const { cursor, updatedAt } = JSON.parse(raw);
      if (Date.now() - updatedAt > CURSOR_TTL) { localStorage.removeItem(`cursor_${tag}`); return null; }
      return cursor || null;
    } catch { return null; }
  }, []);

  const addVideosToUI = useCallback((newVideos: TikTokVideo[], replace = false) => {
    if (replace) {
      videosInUIRef.current = { keys: new Set(), metas: new Set() };
      const deduped = dedupeVideos(newVideos);
      for (const v of deduped) {
        videosInUIRef.current.keys.add(getVideoKey(v));
        const m = getVideoMeta(v);
        if (m !== '||') videosInUIRef.current.metas.add(m);
      }
      setVideos(deduped);
      return;
    }
    const filtered = newVideos.filter(v => {
      const key = getVideoKey(v);
      if (videosInUIRef.current.keys.has(key)) return false;
      const meta = getVideoMeta(v);
      if (meta !== '||' && videosInUIRef.current.metas.has(meta)) return false;
      videosInUIRef.current.keys.add(key);
      if (meta !== '||') videosInUIRef.current.metas.add(meta);
      return true;
    });
    if (filtered.length > 0) setVideos(prev => [...prev, ...filtered]);
  }, []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTag, setSearchTag] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagQuantities, setTagQuantities] = useState<Record<string, number>>({});
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: "single" | "merge" | "foryou"; tag?: string }>({ open: false, type: "single" });
  const [scrapeProgress, setScrapeProgress] = useState("");
  const [mergeLogs, setMergeLogs] = useState<string[]>([]);
  const [filters, setFilters] = useState({ minViews: 0, minLikes: 0, minShares: 0, minComments: 0, minDuration: 0 });
  const [showFilters, setShowFilters] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState(40);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, active: false });
  const [activeTab, setActiveTab] = useState<"busca" | "edicao">("busca");
  const [foryouQuantity, setForyouQuantity] = useState(100);
  const [aiSearchDescription, setAiSearchDescription] = useState("");
  const [aiSearchQuantity, setAiSearchQuantity] = useState(100);
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [aiSuggestedTags, setAiSuggestedTags] = useState<{ tag: string; relevance: string }[]>([]);
  const [aiContentFilter, setAiContentFilter] = useState<{ genderFilter?: string; excludeKeywords?: string[] } | null>(null);
  const [previewVideoSrc, setPreviewVideoSrc] = useState<string | null>(null);
  const [previewThumbnailSrc, setPreviewThumbnailSrc] = useState<string>("/placeholder.svg");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [discoverTopic, setDiscoverTopic] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredTags, setDiscoveredTags] = useState<{ tag: string; emoji: string; label: string; popularity_score: number; category: string }[]>([]);
  const [sortByQuality, setSortByQuality] = useState(false);
  const [nicheWarning, setNicheWarning] = useState<{ offTopicCount: number; offTopicTags: string[]; offTopicVideoIds: string[] } | null>(null);
  const [resultFilterMode, setResultFilterMode] = useState<"strict" | "ai">("strict");
  const { toast } = useToast();
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const credits = useCredits();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const requireCredits = async (): Promise<boolean> => {
    const ok = await credits.canUseCredits();
    if (!ok) setShowUpgrade(true);
    return ok;
  };


  const distributeExactTotal = useCallback((keys: string[], total: number) => {
    if (keys.length === 0) return {} as Record<string, number>;

    const normalizedTotal = Math.max(0, Math.floor(total));
    const base = Math.floor(normalizedTotal / keys.length);
    const remainder = normalizedTotal % keys.length;

    return keys.reduce<Record<string, number>>((acc, key, index) => {
      acc[key] = base + (index < remainder ? 1 : 0);
      return acc;
    }, {});
  }, []);

  const distributeAiTargets = useCallback((hashtags: { tag: string; relevance: string }[], total: number) => {
    if (hashtags.length === 0) return {} as Record<string, number>;

    const relevanceWeight: Record<string, number> = {
      alta: 3,
      media: 2,
      baixa: 1,
    };

    const ordered = [...hashtags].sort(
      (a, b) => (relevanceWeight[b.relevance] || 1) - (relevanceWeight[a.relevance] || 1)
    );
    const weights = ordered.map((item) => relevanceWeight[item.relevance] || 1);
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    const allocation = ordered.map((_, index) => Math.floor((Math.max(0, total) * weights[index]) / weightSum));

    let remainder = Math.max(0, total) - allocation.reduce((sum, value) => sum + value, 0);
    for (let index = 0; remainder > 0; index = (index + 1) % ordered.length) {
      allocation[index] += 1;
      remainder -= 1;
    }

    return ordered.reduce<Record<string, number>>((acc, item, index) => {
      acc[item.tag] = allocation[index];
      return acc;
    }, {});
  }, []);

  // Detect videos from hashtags outside the requested niche
  const detectOffTopicVideos = (videos: TikTokVideo[], requestedTags: string[]) => {
    const requestedSet = new Set(requestedTags.map(t => t.toLowerCase()));
    const offTopicTags = new Map<string, number>();
    const offTopicVideoIds: string[] = [];
    let offTopicCount = 0;

    for (const v of videos) {
      const vTag = (v as any).hashtag?.toLowerCase();
      if (vTag && !requestedSet.has(vTag)) {
        offTopicCount++;
        offTopicVideoIds.push(v.id);
        offTopicTags.set(vTag, (offTopicTags.get(vTag) || 0) + 1);
      }
    }

    if (offTopicCount > 0) {
      const topOffTopic = [...offTopicTags.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => `#${tag}`);
      setNicheWarning({ offTopicCount, offTopicTags: topOffTopic, offTopicVideoIds });
    } else {
      setNicheWarning(null);
    }
  };

  useEffect(() => {
    // Não carregar vídeos persistidos ao dar F5: sessão sempre começa limpa
    setVideos([]);
    videosInUIRef.current = { keys: new Set(), metas: new Set() };
    setCurrentIndex(0);
    setIsLoading(false);
  }, []);

  // Parse duration string "M:SS" to seconds
  const parseDuration = (d: string | null) => {
    if (!d) return 0;
    const parts = d.split(':');
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    return parseInt(d) || 0;
  };

  // Detect Brazilian content by title/author — STRICT: requires positive Portuguese signals
  const isBrazilianContent = (v: TikTokVideo): boolean => {
    const title = (v.title || '').toLowerCase();
    const author = (v.author || '').toLowerCase();
    const text = `${title} ${author}`;

    // Reject if author has clear non-BR patterns
    if (NON_BR_AUTHOR_PATTERNS.test(author.replace('@', ''))) return false;

    // Reject if contains non-BR language/culture signals
    if (NON_BR_CONTENT_PATTERNS.test(text)) return false;

    // Reject foreign languages by common words (Turkish, Indonesian, French tutorials, etc.)
    if (FOREIGN_LANG_PATTERNS.test(text)) return false;

    // Reject if title is mostly non-Portuguese (detect French/Spanish/Italian/Polish patterns)
    const foreignSentenceMatches = text.match(FOREIGN_SENTENCE_PATTERNS);
    if (foreignSentenceMatches && foreignSentenceMatches.length >= 2) return false;

     // Reject if contains CJK characters (Chinese/Japanese/Korean)
    if (CJK_PATTERN.test(text)) return false;

    // Reject if contains Cyrillic (Russian, etc.)
    if (CYRILLIC_PATTERN.test(text)) return false;

    // Reject if contains Arabic script
    if (ARABIC_PATTERN.test(text)) return false;

    // Reject Thai, Vietnamese tonal marks, Devanagari, Tamil, etc.
    if (OTHER_SCRIPT_PATTERN.test(text)) return false;

    // Reject high English density — words ambiguous with Portuguese (do/no/me/so/in/on/etc.) are excluded
    const engMatches = text.match(ENG_WORDS_PATTERN);
    if (engMatches && engMatches.length >= 4) return false;

    // Positive Portuguese indicators — at least one must be present
    if (BR_CHARS_PATTERN.test(text)) return true;
    if (BR_WORDS_PATTERN.test(text)) return true;
    // ONLY Brazilian-specific hashtags count — removed global ones (fyp, viral, trending, etc.)
    if (BR_HASHTAGS_PATTERN.test(title)) return true;

    // If no positive signal at all, reject
    return false;
  };

  // Block animations, cartoons, official TikTok accounts, and non-real-person content
  const ALWAYS_EXCLUDE_AUTHORS = ['tiktokbrasil', 'tiktok', 'tiktoklatin', 'tiktokbr'];
  const ALWAYS_EXCLUDE_KEYWORDS = [
    'animação', 'animacao', 'cartoon', 'desenho', 'vovó', 'vovo', 'personagem',
    'animated', 'animation', 'anime', 'mascote', 'fantoche', 'puppet',
    'boneco', 'boneca', 'brinquedo', 'toy', 'lego', 'minecraft',
    'lyrics', 'letra da música', 'letra da musica', 'song name', 'song:',
    'lirik', 'easy rap',
    'photoshop', 'tutorial photoshop', 'tuto facile', 'learn to',
    'gato bailando', 'cat dancing', 'dog dancing', 'pet dancing',
    'kpop', 'k-pop', 'fancam', 'stan', 'idol', 'oppa', 'bias',
    'babymonster', 'blackpink', 'twice', 'bts', 'enhypen', 'aespa',
    'itzy', 'newjeans', 'le sserafim', 'stray kids', 'seventeen',
    'pinay', 'pinoy', 'habibi', 'mashallah', 'mukbang',
    // Block music/audio-only & status/mood content
    'nostalgia', 'statusvideo', 'statusvi', 'status video', 'reflexão', 'reflexao',
    'motivação', 'motivacao', 'pensamento', 'frases', 'frase do dia',
    'videoclipe', 'clip oficial', 'official video', 'music video',
    'slowed and reverb', 'slowed +', 'slowedsongs', 'slowedandreverb',
    'remix ||', 'audio edit',
  ];

  // AI content filter: filter by gender + exclude keywords from AI + block non-real content
  const passesAiContentFilter = (v: TikTokVideo): boolean => {
    const text = `${v.title || ''} ${v.author || ''}`.toLowerCase();
    const author = (v.author || '').toLowerCase().replace('@', '');

    // Always block official/animation accounts
    if (ALWAYS_EXCLUDE_AUTHORS.some(a => author.includes(a))) return false;
    // Always block animation/cartoon/kpop/pet/tutorial keywords
    if (ALWAYS_EXCLUDE_KEYWORDS.some(k => text.includes(k))) return false;

    // Block pet/animal content universally
    const petPatterns = /\b(gato|gata bailando|cat|kitten|kitty|dog|puppy|cachorro|cachorrinho|hamster|coelho|parrot|bird|pet|animal|pássaro|tartaruga|peixe|goldfish)\b/i;
    if (petPatterns.test(text) && !/\b(gata|gatinha|gatona)\b/i.test(text.replace(/gato|gata bailando/gi, ''))) {
      // "gata" meaning hot girl is OK, but "gato bailando" (cat dancing) is not
      if (/\b(gato|cat|kitten|dog|puppy|cachorro|hamster|pet|animal|bird)\b/i.test(text)) return false;
    }

    // Block lyrics/music-only content (no visual performance)
    if (/\b(lyrics|lyric|letra|letras|song name|lirik)\b/i.test(text) && !/danç|dance|dançando/i.test(text)) return false;

    // Block tutorial/educational content unrelated to dancing
    if (/\b(tutorial|tuto|photoshop|edit|editing|apprend|learn)\b/i.test(text) && !/danç|dance|dançando/i.test(text)) return false;

    if (!aiContentFilter) return true;
    if (aiContentFilter.excludeKeywords?.length) {
      for (const word of aiContentFilter.excludeKeywords) {
        if (word && text.includes(word.toLowerCase().trim())) return false;
      }
    }
    return true;
  };

  const filteredVideos = useMemo(() => dedupeVideos(
    videos.filter(v => {
      if (v.views < filters.minViews) return false;
      if (v.likes < filters.minLikes) return false;
      if (v.shares < filters.minShares) return false;
      if (v.comments < filters.minComments) return false;
      const dur = parseDuration(v.duration);
      if (filters.minDuration > 0 && dur > 0 && dur < filters.minDuration) return false;
      if (dur > (resultFilterMode === "ai" ? 120 : 45)) return false;
      if (resultFilterMode !== "ai" && !isBrazilianContent(v)) return false;
      if (resultFilterMode !== "ai" && !passesAiContentFilter(v)) return false;
      return true;
    })
  ), [videos, filters, resultFilterMode, aiContentFilter]);
  const sortedFilteredVideos = useMemo(() => {
    const sorted = [...filteredVideos];
    if (sortByQuality) {
      sorted.sort((a, b) => tiktokApi.getQualityScore(b) - tiktokApi.getQualityScore(a));
    }
    return sorted;
  }, [filteredVideos, sortByQuality]);
  const totalFiltered = sortedFilteredVideos.length;
  const currentVideo = sortedFilteredVideos[currentIndex] || null;

  const applyNicheTitleFilter = useCallback(async (
    inputVideos: TikTokVideo[],
    description: string,
    nicheKeywords: string[],
    addLog?: (message: string) => void,
  ) => {
    if (inputVideos.length === 0 || description.trim().length <= 3) return inputVideos;

    addLog?.(`🎯 Filtro de nicho: analisando ${inputVideos.length} títulos...`);
    setScrapeProgress(`Filtro de nicho: analisando títulos...`);

    const videosWithStableIds = inputVideos.map((video) => ({
      stableId: getVideoKey(video),
      video,
    }));

    try {
      const { data, error } = await supabase.functions.invoke('filter-by-niche', {
        body: {
          videos: videosWithStableIds.map(({ stableId, video }) => ({
            id: stableId,
            title: video.title || '',
            author: video.author || '',
          })),
          nicheDescription: description,
          nicheKeywords,
        },
      });

      if (error) {
        console.warn('Niche filter error, auto-approving all:', error);
        addLog?.(`⚠️ Filtro de nicho falhou, mantendo todos os vídeos`);
        return inputVideos;
      }

      if (data?.approvedIds) {
        const approvedSet = new Set((data.approvedIds as string[]).filter(Boolean));
        const filtered = videosWithStableIds
          .filter(({ stableId }) => approvedSet.has(stableId))
          .map(({ video }) => video);
        const removed = inputVideos.length - filtered.length;
        addLog?.(
          removed > 0
            ? `🎯 Filtro de nicho: ${filtered.length} relevantes, ${removed} removidos por título irrelevante`
            : `🎯 Filtro de nicho: todos os ${filtered.length} vídeos são relevantes`
        );
        return filtered;
      }

      return inputVideos;
    } catch (error) {
      console.warn('Niche filter failed, keeping all:', error);
      addLog?.(`⚠️ Filtro de nicho falhou, mantendo todos os vídeos`);
      return inputVideos;
    }
  }, [getVideoKey]);

  const applyThumbnailValidation = useCallback(async (
    inputVideos: TikTokVideo[],
    description: string,
    addLog?: (message: string) => void,
  ) => {
    const videosWithThumbs = inputVideos.filter((video) => video.thumbnail);
    if (videosWithThumbs.length === 0 || description.trim().length <= 3) return inputVideos;

    addLog?.(`🔍 Validando ${videosWithThumbs.length} thumbnails com IA...`);
    setScrapeProgress(`Validação visual: analisando thumbnails...`);

    const videosWithStableIds = inputVideos.map((video) => ({
      stableId: getVideoKey(video),
      video,
    }));

    try {
      const { data, error } = await supabase.functions.invoke('validate-thumbnails', {
        body: {
          videos: videosWithStableIds.map(({ stableId, video }) => ({
            id: stableId,
            thumbnail: video.thumbnail,
            title: video.title || '',
          })),
          description,
        },
      });

      if (error) {
        console.warn('Thumbnail validation error, auto-approving all:', error);
        addLog?.(`⚠️ Validação visual falhou, mantendo todos os vídeos`);
        return inputVideos;
      }

      if (data?.approvedIds) {
        const approvedSet = new Set((data.approvedIds as string[]).filter(Boolean));
        const filtered = videosWithStableIds
          .filter(({ stableId }) => approvedSet.has(stableId))
          .map(({ video }) => video);
        addLog?.(`👁️ Validação visual: ${filtered.length} aprovados, ${inputVideos.length - filtered.length} rejeitados por IA`);
        return filtered;
      }

      return inputVideos;
    } catch (error) {
      console.warn('Thumbnail validation failed, keeping all:', error);
      addLog?.(`⚠️ Validação visual falhou, mantendo todos os vídeos`);
      return inputVideos;
    }
  }, [getVideoKey]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalFiltered - 1));
  }, [totalFiltered]);

  const reSearchRef = useRef<(() => void) | null>(null);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev < totalFiltered - 1) return prev + 1;
      // Just wrap to beginning, no auto re-fetch
      return 0;
    });
  }, [totalFiltered, isScraping]);

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);
  const toggleMute = useCallback(() => setIsMuted((p) => !p), []);

  const handleRemoveVideo = useCallback(() => {
    if (!currentVideo) return;
    const id = currentVideo.id;
    setVideos(prev => {
      const next = prev.filter(v => v.id !== id);
      setCurrentIndex(i => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
    tiktokApi.deleteVideos([id]).catch(err => {
      console.error('Delete error:', err);
      toast({ title: 'Erro ao remover vídeo', description: 'Não foi possível remover da base de dados.', variant: 'destructive' });
    });
  }, [currentVideo, toast]);

  const handleDismissOffTopicVideos = useCallback(() => {
    if (!nicheWarning) return;

    const idsToRemove = nicheWarning.offTopicVideoIds;
    if (idsToRemove.length === 0) {
      setNicheWarning(null);
      return;
    }

    const removalSet = new Set(idsToRemove);
    setVideos((prev) => {
      const next = prev.filter((video) => !removalSet.has(video.id));
      setCurrentIndex((index) => Math.min(index, Math.max(0, next.length - 1)));
      return next;
    });
    setNicheWarning(null);
    tiktokApi.deleteVideos(idsToRemove).catch(err => {
      console.error('Delete error:', err);
      toast({ title: 'Erro ao remover vídeos', description: 'Não foi possível remover da base de dados.', variant: 'destructive' });
    });
    toast({ title: "Vídeos dispensados", description: `${idsToRemove.length} vídeos fora do nicho foram removidos.` });
  }, [nicheWarning, toast]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const wheelCooldownRef = useRef(false);

  const handleWheelNavigate = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (wheelCooldownRef.current) return;

    wheelCooldownRef.current = true;
    if (e.deltaY > 0) handleNext();
    else handlePrev();

    window.setTimeout(() => {
      wheelCooldownRef.current = false;
    }, 240);
  }, [handlePrev, handleNext]);

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      setIsPreviewReady(false);
      setIsPreviewLoading(false);

      if (!currentVideo) {
        setPreviewVideoSrc(null);
        setPreviewThumbnailSrc('/placeholder.svg');
        return;
      }

      setPreviewThumbnailSrc(currentVideo.thumbnail || '/placeholder.svg');

      // source_url is blocked by CORS — always resolve via edge function (mode: 'url')
      const videoUrl = currentVideo.tiktok_id
        ? `https://www.tiktok.com/@user/video/${currentVideo.tiktok_id}`
        : null;
      if (!videoUrl) {
        if (!cancelled) setPreviewVideoSrc(null);
        return;
      }

      setIsPreviewLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('download-tiktok', {
          body: { video_url: videoUrl, tiktok_id: currentVideo.tiktok_id, mode: 'url' },
        });
        if (!cancelled && !error && data?.success && data?.download_url) {
          setPreviewVideoSrc(data.download_url);
        } else if (!cancelled) {
          setPreviewVideoSrc(null);
        }
      } catch (err) {
        console.warn('Falha ao resolver URL do preview:', err);
        if (!cancelled) setPreviewVideoSrc(null);
      } finally {
        if (!cancelled) setIsPreviewLoading(false);
      }
    };

    loadPreview();

    return () => { cancelled = true; };
  }, [currentVideo?.id, currentVideo?.tiktok_id, currentVideo?.thumbnail]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !previewVideoSrc) return;

    vid.currentTime = 0;
    if (isPlaying) vid.play().catch(() => {});
  }, [currentIndex, currentVideo?.id, previewVideoSrc, isPlaying]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !previewVideoSrc) return;

    if (isPlaying) vid.play().catch(() => {});
    else vid.pause();
  }, [isPlaying, previewVideoSrc]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid) vid.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); handlePrev(); break;
        case 'ArrowDown': e.preventDefault(); handleNext(); break;
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'm': case 'M': toggleMute(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, togglePlay, toggleMute]);

  // Toggle hashtag selection for merge
  const toggleTagSelection = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        setTagQuantities(q => { const copy = { ...q }; delete copy[tag]; return copy; });
        return prev.filter(t => t !== tag);
      } else {
        setTagQuantities(q => ({ ...q, [tag]: 50 }));
        return [...prev, tag];
      }
    });
  };

  const maxQty = 500;
  const setTagQty = (tag: string, qty: number) => {
    setTagQuantities(q => ({ ...q, [tag]: Math.max(10, Math.min(maxQty, qty)) }));
  };

  // Single hashtag scrape with confirmation
  const handleSingleScrapeConfirm = (tag: string) => {
    const cleanTag = tag.replace('#', '').trim();
    setConfirmDialog({ open: true, type: "single", tag: cleanTag });
  };

  // Merge scrape with confirmation
  const handleMergeConfirm = () => {
    if (selectedTags.length === 0) {
      toast({ title: "Selecione hashtags", description: "Selecione pelo menos uma hashtag para buscar.", variant: "destructive" });
      return;
    }
    setConfirmDialog({ open: true, type: "merge" });
  };

  // AI Smart Search — fully automatic: description → AI hashtags → scrape → results
  const handleAiSearch = async () => {
    if (!aiSearchDescription.trim()) {
      toast({ title: "Digite uma descrição", description: "Descreva o tipo de vídeo que quer encontrar.", variant: "destructive" });
      return;
    }
    if (!(await requireCredits())) return;

    setIsScraping(true);
    setAiSuggestedTags([]);
    setMergeLogs([]);
    setCacheStatus(null);
    setNicheWarning(null);
    setActiveTag("ia");

    const logs: string[] = [];
    const addLog = (msg: string) => { logs.push(msg); setMergeLogs([...logs]); };

    try {
      addLog(`🧠 Analisando: "${aiSearchDescription}"...`);
      setScrapeProgress("IA analisando descrição...");

      const { data, error } = await supabase.functions.invoke('ai-hashtag-suggest', {
        body: { description: aiSearchDescription, quantity: aiSearchQuantity },
      });

      if (error) throw error;
      if (!data?.success || !data?.hashtags?.length) {
        throw new Error(data?.error || "Nenhuma hashtag sugerida");
      }

      const hashtags = data.hashtags as { tag: string; relevance: string }[];
      const genderFilter = data.genderFilter || "none";
      const excludeKeywords = (data.excludeKeywords || []) as string[];
      
      // Set content filter for gender-based filtering
      setAiContentFilter({ genderFilter, excludeKeywords });
      setAiSuggestedTags(hashtags);
      
      addLog(`✨ ${hashtags.length} hashtags: ${hashtags.map((h: any) => '#' + h.tag).join(', ')}`);
      if (genderFilter !== "none") addLog(`🎯 Filtro: ${genderFilter === "female" ? "apenas feminino" : "apenas masculino"} | Excluindo: ${excludeKeywords.join(', ')}`);

      // Distribute quantity exactly without inflating the requested total
      const distributedTargets = distributeAiTargets(hashtags, aiSearchQuantity);
      const newTags: string[] = [];
      const newQty: Record<string, number> = {};

      hashtags.forEach((h: any) => {
        const qty = distributedTargets[h.tag] || 0;
        if (qty <= 0) return;
        newTags.push(h.tag);
        newQty[h.tag] = qty;
      });

      setSelectedTags(newTags);
      setTagQuantities(newQty);

      const totalTarget = aiSearchQuantity;
      const startTime = performance.now();
      addLog(`📊 Meta: ${totalTarget} vídeos`);

      const [seenIds, usedIds] = await Promise.all([
        tiktokApi.getSeenVideoIds(),
        tiktokApi.getUsedVideoIds(),
      ]);
      for (const id of usedIds) seenIds.add(id);

      // Session-wide dedup set: guarantees no tiktok_id appears twice within this search
      const sessionSeenIds = new Set<string>();
      // Track keys already inserted into UI state (survives React batching)
      const insertedKeys = new Set<string>();
      // Track TikWM cursor per hashtag so each round fetches new pages
      const cursorMap = new Map<string, string>();
      // Seed cursorMap from localStorage (cross-session persistence)
      for (const t of newTags) { const c = loadCursor(t); if (c) cursorMap.set(t, c); }

      const applyFilters = (vids: TikTokVideo[]) => vids.filter(v => {
        if (v.views < filters.minViews || v.likes < filters.minLikes) return false;
        if (v.shares < filters.minShares || v.comments < filters.minComments) return false;
        const dur = parseDuration(v.duration);
        if (filters.minDuration > 0 && dur > 0 && dur < filters.minDuration) return false;
        if (dur > 120) return false;
        if (excludeKeywords.length > 0) {
          const text = `${v.title || ''} ${v.author || ''}`.toLowerCase();
          for (const word of excludeKeywords) {
            if (word && text.includes(word.toLowerCase().trim())) return false;
          }
        }
        return true;
      });

      let totalNew = 0;

      // H: preload thumbnails in the background as soon as videos are fetched
      const preloadThumbnails = (vids: TikTokVideo[]) => {
        const urls = vids.map(v => v.thumbnail).filter(Boolean) as string[];
        let active = 0;
        let idx = 0;
        const next = () => {
          while (active < 10 && idx < urls.length) {
            active++;
            const img = new Image();
            img.onload = img.onerror = () => { active--; next(); };
            img.src = urls[idx++];
          }
        };
        next();
      };

      // D: retry pool — AI tags excluded from initial distribution (low-priority ones)
      const retryTagPool: string[] = hashtags
        .map((h: any) => h.tag)
        .filter((tag: string) => !newTags.includes(tag));

      // All hashtags in order: primary tags first, then retry pool
      const allTags = [...newTags, ...retryTagPool];
      const exhaustedTags = new Set<string>();

      addLog(`🏷️ Principais (${newTags.length}): ${newTags.map(t => '#' + t).join(', ')}`);
      if (retryTagPool.length > 0) addLog(`🔀 Retry pool (${retryTagPool.length}): ${retryTagPool.map(t => '#' + t).join(', ')}`);
      addLog(`📋 Total: ${allTags.length} hashtags`);

      // F: fetchCandidates — parallel batches of 5 hashtags at a time
      const PARALLEL_BATCH_SIZE = 5;
      const fetchCandidates = async (targetCount: number, forceRefresh: boolean) => {
        const freshVideos: TikTokVideo[] = [];
        const pendingTags = allTags.filter(tag => !exhaustedTags.has(tag));

        for (let i = 0; i < pendingTags.length; i += PARALLEL_BATCH_SIZE) {
          if (freshVideos.length >= targetCount) break;

          const batch = pendingTags.slice(i, i + PARALLEL_BATCH_SIZE);
          const remaining = targetCount - freshVideos.length;
          const perTagRequest = Math.min(Math.ceil(remaining / batch.length) * 3, 1000);

          const results = await Promise.all(
            batch.map(async (tag) => {
              try {
                const result = await tiktokApi.scrapeByHashtag(tag, perTagRequest, undefined, forceRefresh, true, cursorMap.get(tag));
                if (result?.videos) {
                  const filtered = applyFilters(result.videos);
                  const _dbgForeign = result.videos.filter(v => isForeignContent(v)).length;
                  totalNew += result.new_scraped || 0;
                  if (result.next_cursor) {
                    cursorMap.set(tag, result.next_cursor);
                    saveCursor(tag, result.next_cursor);
                  } else {
                    exhaustedTags.add(tag);
                  }
                  addLog(`  ✅ #${tag}: ${filtered.length} válidos (${result.videos.length} brutos, ${result.videos.length - filtered.length} filtrados-applyFilters, ${_dbgForeign} foreign)${exhaustedTags.has(tag) ? ' [esgotada]' : ''} cursor=${result.next_cursor ? 'sim' : 'NÃO'}`);
                  return filtered;
                } else {
                  exhaustedTags.add(tag);
                  return [];
                }
              } catch {
                addLog(`  ❌ #${tag}: falhou`);
                exhaustedTags.add(tag);
                return [];
              }
            })
          );

          for (const filtered of results) {
            freshVideos.push(...filtered);
          }
        }

        const result = dedupeVideos(freshVideos);
        preloadThumbnails(result); // H
        return result;
      };

      // E: fetch more candidates when target is large
      const OVERFETCH_MULTIPLIER = totalTarget > 50 ? 8 : 5;
      const fetchTarget = totalTarget * OVERFETCH_MULTIPLIER;
      addLog(`⏳ Buscando ~${fetchTarget} vídeos brutos para filtrar os ${totalTarget} melhores...`);
      setScrapeProgress(`Buscando ${newTags.length} hashtags sequencialmente...`);

      const existingVideoKeys = new Set(videosRef.current.map(getVideoKey));
      const seenCandidateKeys = new Set(existingVideoKeys);
      const initialRaw = await fetchCandidates(fetchTarget, videosRef.current.length > 0);
      let _dbgDupKey = 0, _dbgSeenDb = 0, _dbgSeenSession = 0;
      const initialCandidates = initialRaw.filter((video) => {
        const key = getVideoKey(video);
        if (seenCandidateKeys.has(key)) { _dbgDupKey++; return false; }
        if (video.tiktok_id && seenIds.has(video.tiktok_id)) { _dbgSeenDb++; return false; }
        if (video.tiktok_id && sessionSeenIds.has(video.tiktok_id)) { _dbgSeenSession++; return false; }
        seenCandidateKeys.add(key);
        if (video.tiktok_id) sessionSeenIds.add(video.tiktok_id);
        return true;
      });

      const phase1Time = ((performance.now() - startTime) / 1000).toFixed(1);
      addLog(`📊 Coletados: ${initialCandidates.length} vídeos novos únicos em ${phase1Time}s${existingVideoKeys.size > 0 ? ` (${existingVideoKeys.size} já carregados)` : ''}`);
      addLog(`🔍 [DEBUG] fetchCandidates retornou ${initialRaw.length} brutos → ${_dbgDupKey} dup-key, ${_dbgSeenDb} seen-db, ${_dbgSeenSession} seen-session → ${initialCandidates.length} passaram`);
      addLog(`🔍 [DEBUG] exhaustedTags após fetch inicial: ${exhaustedTags.size}/${allTags.length} — [${[...exhaustedTags].join(', ')}]`);

      let approvedVideos: TikTokVideo[] = [];
      const MAX_FILTER_ROUNDS = 6;
      let firstProgressiveInsertAt = -1; // I: track position for first index jump

      for (let round = 0; round < MAX_FILTER_ROUNDS; round++) {
        const deficit = totalTarget - approvedVideos.length;
        if (deficit <= 0) break;

        let roundCandidates: TikTokVideo[] = [];

        if (round === 0) {
          roundCandidates = initialCandidates;
          if (roundCandidates.length === 0) {
            addLog(`⚠️ Coleta inicial não trouxe vídeos novos, tentando busca forçada...`);
            continue;
          }
        } else {
          addLog(`🔁 Retry ${round}: faltam ${deficit}, buscando mais...`);
          setScrapeProgress(`Buscando +${deficit} vídeos (retry ${round})...`);
          const retryRaw = await fetchCandidates(deficit * 5, true);
          roundCandidates = retryRaw.filter((video) => {
            const key = getVideoKey(video);
            if (seenCandidateKeys.has(key)) return false;
            if (video.tiktok_id && seenIds.has(video.tiktok_id)) return false;
            if (video.tiktok_id && sessionSeenIds.has(video.tiktok_id)) return false;
            seenCandidateKeys.add(key);
            if (video.tiktok_id) sessionSeenIds.add(video.tiktok_id);
            return true;
          });
          addLog(`📊 Retry ${round}: ${roundCandidates.length} candidatos novos`);
          if (roundCandidates.length === 0) {
            addLog(`⚠️ Nenhum vídeo novo encontrado, encerrando retries`);
            break;
          }
        }

        addLog(`🤖 Filtrando com IA (rodada ${round + 1})...`);
        setScrapeProgress(`IA analisando ${roundCandidates.length} vídeos...`);

        const [nicheFiltered, thumbFiltered] = await Promise.all([
          applyNicheTitleFilter(roundCandidates, aiSearchDescription, newTags, addLog),
          applyThumbnailValidation(roundCandidates, aiSearchDescription, addLog),
        ]);

        const nicheKeys = new Set(nicheFiltered.map(getVideoKey));
        const thumbKeys = new Set(thumbFiltered.map(getVideoKey));
        const hadSignal = nicheKeys.size > 0 || thumbKeys.size > 0;
        let roundApproved = hadSignal
          ? roundCandidates.filter((video) => {
              const key = getVideoKey(video);
              return nicheKeys.has(key) || thumbKeys.has(key);
            })
          : roundCandidates;
        const _dbgNicheRejected = roundCandidates.length - roundApproved.length;
        addLog(`🔍 [DEBUG] Rodada ${round + 1}: ${roundCandidates.length} candidatos → IA aprovou ${roundApproved.length} (rejeitou ${_dbgNicheRejected}) | nicho=${nicheFiltered.length} thumb=${thumbFiltered.length} hadSignal=${hadSignal}`);

        // Remove foreign content before counting as approved so deficit compensates automatically
        const beforeForeignFilter = roundApproved.length;
        roundApproved = roundApproved.filter(v => !isForeignContent(v));
        const foreignRemoved = beforeForeignFilter - roundApproved.length;
        if (foreignRemoved > 0) addLog(`🌐 Rodada ${round + 1}: ${foreignRemoved} vídeos estrangeiros removidos`);

        const beforeApproved = approvedVideos.length;
        approvedVideos = dedupeVideos([...approvedVideos, ...roundApproved]);
        // Enforce exact limit early so progressive display never exceeds totalTarget
        if (approvedVideos.length > totalTarget) approvedVideos = approvedVideos.slice(0, totalTarget);
        const newlyAdded = approvedVideos.length - beforeApproved;
        addLog(`🎯 Rodada ${round + 1}: +${newlyAdded} aprovados (${approvedVideos.length}/${totalTarget})`);

        // I: show approved videos immediately after each round
        if (newlyAdded > 0) {
          const batchToShow = approvedVideos.slice(beforeApproved);
          if (firstProgressiveInsertAt === -1) {
            firstProgressiveInsertAt = videosRef.current.length;
            setCurrentIndex(firstProgressiveInsertAt === 0 ? 0 : firstProgressiveInsertAt);
          }
          setResultFilterMode("ai");
          addVideosToUI(rankByBrazilianContent(batchToShow));
        }
      }

      // Extra fetch rounds: if we still haven't reached totalTarget, keep trying (max 5 extra rounds)
      const MAX_EXTRA_ROUNDS = 10;
      let consecutiveEmpty = 0;
      for (let extra = 0; extra < MAX_EXTRA_ROUNDS && approvedVideos.length < totalTarget; extra++) {
        const deficit = totalTarget - approvedVideos.length;
        addLog(`🔄 Rodada extra ${extra + 1}: faltam ${deficit} vídeos, buscando mais...`);
        setScrapeProgress(`Buscando +${deficit} vídeos (extra ${extra + 1}/${MAX_EXTRA_ROUNDS})...`);
        const extraRaw = await fetchCandidates(deficit * 5, true);
        const extraCandidates = extraRaw.filter((video) => {
          const key = getVideoKey(video);
          if (seenCandidateKeys.has(key)) return false;
          if (video.tiktok_id && seenIds.has(video.tiktok_id)) return false;
          if (video.tiktok_id && sessionSeenIds.has(video.tiktok_id)) return false;
          seenCandidateKeys.add(key);
          if (video.tiktok_id) sessionSeenIds.add(video.tiktok_id);
          return true;
        });
        if (extraCandidates.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 3) {
            addLog(`⚠️ Rodada extra ${extra + 1}: pool esgotado após ${consecutiveEmpty} tentativas vazias`);
            break;
          }
          addLog(`⚠️ Rodada extra ${extra + 1}: nenhum vídeo novo, tentando com outras hashtags...`);
          continue;
        }
        consecutiveEmpty = 0;
        // Try AI filter first, but if it rejects too many, accept all candidates to complete the target
        addLog(`🤖 Filtrando ${extraCandidates.length} vídeos (extra ${extra + 1})...`);
        const [nicheFiltered, thumbFiltered] = await Promise.all([
          applyNicheTitleFilter(extraCandidates, aiSearchDescription, newTags, addLog),
          applyThumbnailValidation(extraCandidates, aiSearchDescription, addLog),
        ]);
        const nicheKeys = new Set(nicheFiltered.map(getVideoKey));
        const thumbKeys = new Set(thumbFiltered.map(getVideoKey));
        const hadSignal = nicheKeys.size > 0 || thumbKeys.size > 0;
        let extraApproved = hadSignal
          ? extraCandidates.filter(v => nicheKeys.has(getVideoKey(v)) || thumbKeys.has(getVideoKey(v)))
          : extraCandidates;
        // Remove foreign content before counting as approved
        const beforeForeignExtra = extraApproved.length;
        extraApproved = extraApproved.filter(v => !isForeignContent(v));
        const foreignRemovedExtra = beforeForeignExtra - extraApproved.length;
        if (foreignRemovedExtra > 0) addLog(`🌐 Extra ${extra + 1}: ${foreignRemovedExtra} vídeos estrangeiros removidos`);
        const beforeApproved = approvedVideos.length;
        approvedVideos = dedupeVideos([...approvedVideos, ...extraApproved]);
        if (approvedVideos.length > totalTarget) approvedVideos = approvedVideos.slice(0, totalTarget);
        const newlyAdded = approvedVideos.length - beforeApproved;
        addLog(`🎯 Extra ${extra + 1}: +${newlyAdded} aprovados (${approvedVideos.length}/${totalTarget})`);
        if (newlyAdded > 0) {
          const batchToShow = approvedVideos.slice(beforeApproved);
          if (firstProgressiveInsertAt === -1) {
            firstProgressiveInsertAt = videosRef.current.length;
            setCurrentIndex(firstProgressiveInsertAt === 0 ? 0 : firstProgressiveInsertAt);
          }
          setResultFilterMode("ai");
          addVideosToUI(rankByBrazilianContent(batchToShow));
        }
      }

      // unique is already capped — slice is a safety net
      const unique = approvedVideos.slice(0, totalTarget);

      // Mark seen so this user won't get the same videos again
      await tiktokApi.markVideosSeen(unique.filter(v => v.tiktok_id).map(v => ({ tiktok_id: v.tiktok_id!, video_meta: getVideoMeta(v) }))).catch(err => console.error('[markVideosSeen] erro:', err));

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

      if (unique.length > 0) {
        setResultFilterMode("ai");
        if (firstProgressiveInsertAt === -1) {
          setCurrentIndex(videosRef.current.length === 0 ? 0 : videosRef.current.length);
        }
        addVideosToUI(rankByBrazilianContent(unique));
        detectOffTopicVideos(unique, newTags);
        addLog(`✅ ${unique.length} vídeos${genderFilter !== "none" ? ` (${genderFilter === "female" ? "femininos" : "masculinos"})` : ""} prontos!`);
      } else if (firstProgressiveInsertAt === -1) {
        setNicheWarning(null);
        addLog(`⚠️ Nenhum vídeo passou na validação visual`);
      }

      setCacheStatus(`${unique.length} vídeos encontrados para "${aiSearchDescription}" em ${elapsed}s`);

      toast({
        title: `🧠 ${unique.length} vídeos encontrados!`,
        description: `Busca por "${aiSearchDescription}" concluída.`,
      });
    } catch (err: any) {
      console.error('AI search error:', err);
      addLog(`❌ Erro: ${err.message || 'Falha na busca'}`);
      toast({ title: "Erro na busca inteligente", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setIsScraping(false);
      setScrapeProgress("");
    }
  };

  // Keep ref updated so handleNext can trigger re-search
  reSearchRef.current = aiSearchDescription.trim() ? handleAiSearch : null;

  const executeSingleScrape = async (tag: string, forceRefresh = false, targetCount = 50) => {
    if (!(await requireCredits())) return;
    setIsScraping(true);
    setActiveTag(tag);
    setCacheStatus(null);
    activityTracker.logSearch(tag);

    let liveTarget = targetCount;
    let poolServedCount = 0;

    try {
      const mainTag = tag.includes(',') ? tag.split(',')[0].trim() : tag;

      // ── Pool: try serving from pre-built pool first ──
      const preset = PRESET_HASHTAGS.find(p => p.tag.split(',').some(t => t === mainTag) || p.tag === tag);
      const poolGroupKey = preset?.label?.toLowerCase() || null;

      if (poolGroupKey && !forceRefresh) {
        try {
          const userId = (await supabase.auth.getUser()).data.user?.id;
          if (userId) {
            const poolRequest = Math.ceil(targetCount + Math.min(targetCount * 0.5, 200)); // +50% extra (max 200)
            const poolResult = await tiktokApi.serveFromPool(poolGroupKey, userId, poolRequest);
            if (poolResult.served >= targetCount) {
              // Pool satisfied 100% — instant results
              const poolApproved = dedupeVideos(poolResult.videos).slice(0, targetCount);
              tiktokApi.markVideosSeen(poolApproved.filter(v => v.tiktok_id).map(v => ({ tiktok_id: v.tiktok_id!, video_meta: getVideoMeta(v) }))).catch(() => {});
              setResultFilterMode("strict");
              addVideosToUI(rankByBrazilianContent(poolApproved), true);
              setCurrentIndex(0);
              setCacheStatus(`Pool: ${poolApproved.length} vídeos prontos instantaneamente.`);
              toast({ title: `#${mainTag} — Do pool!`, description: `${poolApproved.length} vídeos prontos.` });
              return;
            } else if (poolResult.served > 0) {
              // Pool partial — show what we have, continue with live for deficit
              const poolApproved = dedupeVideos(poolResult.videos);
              tiktokApi.markVideosSeen(poolApproved.filter(v => v.tiktok_id).map(v => ({ tiktok_id: v.tiktok_id!, video_meta: getVideoMeta(v) }))).catch(() => {});
              setResultFilterMode("strict");
              addVideosToUI(rankByBrazilianContent(poolApproved), true);
              setCurrentIndex(0);
              poolServedCount = poolApproved.length;
              liveTarget = targetCount - poolServedCount;
              setCacheStatus(`Pool: ${poolApproved.length} prontos + buscando ${liveTarget} ao vivo...`);
            }
          }
        } catch (err) {
          // pool error — fall through to live scrape
        }
      }

      // ── Live scrape (full or deficit) ──
      // Load cursor: ref (same session) or localStorage (cross-session)
      if (singleScrapeCursorRef.current.tag !== mainTag) {
        singleScrapeCursorRef.current = { tag: mainTag, cursor: loadCursor(mainTag) };
      }
      const [result, seenIds, usedIds] = await Promise.all([
        tiktokApi.scrapeByHashtag(mainTag, liveTarget * 4, undefined, forceRefresh, true, singleScrapeCursorRef.current.cursor),
        tiktokApi.getSeenVideoIds(),
        tiktokApi.getUsedVideoIds(),
      ]);
      for (const id of usedIds) seenIds.add(id);
      // Save cursor for next search of same tag (ref + localStorage)
      if (result.next_cursor) {
        singleScrapeCursorRef.current.cursor = result.next_cursor;
        saveCursor(mainTag, result.next_cursor);
      }

      if (poolServedCount === 0) {
        if (result.from_cache) {
          setCacheStatus(`Cache ativo — #${mainTag} já foi buscada recentemente. ${result.videos_found} vídeos disponíveis.`);
        } else {
          setCacheStatus(`${result.new_scraped} novos vídeos coletados. ${result.videos_found} disponíveis.`);
        }
      }

      const unseenVideos = (result.videos || []).filter(v => v.tiktok_id && !seenIds.has(v.tiktok_id));

      // Apply niche filter based on hashtag label
      const nicheLabel = preset?.label || mainTag;
      const nicheDesc = `Vídeos do TikTok brasileiro sobre: ${nicheLabel}. Hashtag: #${mainTag}`;
      const nicheKeywords = (preset?.tag || tag).split(',').slice(0, 5);
      const nicheFiltered = await applyNicheTitleFilter(unseenVideos, nicheDesc, nicheKeywords);
      let approved = nicheFiltered.filter(v => !isForeignContent(v));

      // Retry: fetch up to 3 extra pages to reach target
      let retryCursor = result.next_cursor;
      for (let retry = 0; retry < 3 && approved.length < liveTarget && retryCursor; retry++) {
        const retryResult = await tiktokApi.scrapeByHashtag(mainTag, 200, undefined, true, true, retryCursor);
        retryCursor = retryResult.next_cursor || null;
        if (retryCursor) { singleScrapeCursorRef.current.cursor = retryCursor; saveCursor(mainTag, retryCursor); }
        const retryUnseen = (retryResult.videos || []).filter(v => v.tiktok_id && !seenIds.has(v.tiktok_id));
        if (retryUnseen.length === 0) break;
        const retryNiche = await applyNicheTitleFilter(retryUnseen, nicheDesc, nicheKeywords);
        const retryApproved = retryNiche.filter(v => !isForeignContent(v));
        approved = dedupeVideos([...approved, ...retryApproved]);
      }
      if (approved.length > liveTarget) approved = approved.slice(0, liveTarget);

      tiktokApi.markVideosSeen(approved.filter(v => v.tiktok_id).map(v => ({ tiktok_id: v.tiktok_id!, video_meta: getVideoMeta(v) }))).catch(err => console.error('[markVideosSeen] erro:', err));

      const totalApproved = poolServedCount + approved.length;

      if (approved.length > 0) {
        setResultFilterMode("strict");
        addVideosToUI(rankByBrazilianContent(approved), poolServedCount === 0);
        if (poolServedCount === 0) setCurrentIndex(0);
      } else if (poolServedCount === 0) {
        setResultFilterMode("strict");
        setVideos([]);
        videosInUIRef.current = { keys: new Set(), metas: new Set() };
        setCurrentIndex(0);
      }

      toast({
        title: poolServedCount > 0
          ? `#${mainTag} — Pool + live!`
          : (forceRefresh ? `#${mainTag} — Novos vídeos!` : (result.from_cache ? `#${mainTag} — Do cache` : `#${mainTag} — Busca concluída!`)),
        description: totalApproved < targetCount
          ? `${totalApproved} de ${targetCount} vídeos encontrados${poolServedCount > 0 ? ` (${poolServedCount} do pool)` : ''} — use Mesclar Hashtags para resultados completos.`
          : `${totalApproved} vídeos aprovados${poolServedCount > 0 ? ` (${poolServedCount} do pool)` : ''}.`,
      });
    } catch (err) {
      console.error('Scrape error:', err);
      toast({ title: "Erro na busca", description: "Não foi possível buscar vídeos.", variant: "destructive" });
    } finally {
      setIsScraping(false);
    }
  };

  const executeMergeScrape = async () => {
    if (!(await requireCredits())) return;
    setIsScraping(true);
    setCacheStatus(null);
    setNicheWarning(null);
    setMergeLogs([]);

    // Check if ALL selected presets belong to generic groups (skip niche filter)
    const allGeneric = selectedTags.every(tagStr => {
      const preset = PRESET_HASHTAGS.find(p => p.tag === tagStr);
      return preset ? GENERIC_GROUPS.has(preset.group) : false;
    });

    // Expand multi-tags (comma-separated) into individual tags with split quantities
    const expandedTags: string[] = [];
    const expandedQty: Record<string, number> = {};
    for (const tag of selectedTags) {
        if (tag.includes(',')) {
        const subTags = tag.split(',').map(t => t.trim()).filter(Boolean);
          const distributed = distributeExactTotal(subTags, tagQuantities[tag] || 50);
        subTags.forEach(st => {
            const qty = distributed[st] || 0;
            if (qty <= 0) return;
            if (!expandedTags.includes(st)) expandedTags.push(st);
            expandedQty[st] = (expandedQty[st] || 0) + qty;
        });
      } else {
        if (!expandedTags.includes(tag)) {
          expandedTags.push(tag);
        }
          expandedQty[tag] = (expandedQty[tag] || 0) + (tagQuantities[tag] || 50);
      }
    }

    let originalTarget = Object.values(expandedQty).reduce((sum, q) => sum + q, 0);
    let totalTarget = originalTarget;
    const startTime = performance.now();
    const logs: string[] = [];
    const addLog = (msg: string) => { logs.push(msg); setMergeLogs([...logs]); };

    const applyFilters = (vids: TikTokVideo[]) => vids.filter(v => {
      if (v.views < filters.minViews || v.likes < filters.minLikes) return false;
      if (v.shares < filters.minShares || v.comments < filters.minComments) return false;
      const dur = parseDuration(v.duration);
      if (filters.minDuration > 0 && dur > 0 && dur < filters.minDuration) return false;
      if (dur > 120) return false;
      return true;
    });

    const tagQtyStr = expandedTags.map(t => `#${t}(${expandedQty[t]})`).join(', ');
    addLog(`🎯 Meta: ${totalTarget} vídeos — ${tagQtyStr}`);

    // ── Pool: try serving from pre-built pool first ──
    let poolServedCount = 0;
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (userId) {
        const poolRequests: { groupKey: string; qty: number; tagStr: string }[] = [];
        for (const tagStr of selectedTags) {
          const preset = PRESET_HASHTAGS.find(p => p.tag === tagStr);
          const groupKey = preset?.label?.toLowerCase();
          if (groupKey) {
            poolRequests.push({ groupKey, qty: tagQuantities[tagStr] || 50, tagStr });
          }
        }

        if (poolRequests.length > 0) {
          addLog(`⚡ Tentando pool para ${poolRequests.map(r => r.groupKey).join(', ')}...`);
          const poolResults = await Promise.all(
            poolRequests.map(r => tiktokApi.serveFromPool(r.groupKey, userId, Math.ceil(r.qty + Math.min(r.qty * 0.5, 200))))
          );

          const poolVideos: TikTokVideo[] = [];
          for (let i = 0; i < poolResults.length; i++) {
            const result = poolResults[i];
            const req = poolRequests[i];
            if (result.served > 0) {
              poolVideos.push(...result.videos);
              addLog(`  ✅ Pool ${req.groupKey}: ${result.served}/${req.qty}`);
            } else {
              addLog(`  ⏭️ Pool ${req.groupKey}: vazio`);
            }
          }

          poolServedCount = poolVideos.length;

          if (poolServedCount >= originalTarget) {
            // Pool satisfied 100%
            const trimmed = dedupeVideos(poolVideos).slice(0, originalTarget);
            tiktokApi.markVideosSeen(trimmed.filter(v => v.tiktok_id).map(v => ({ tiktok_id: v.tiktok_id!, video_meta: getVideoMeta(v) }))).catch(() => {});
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
            addLog(`🏁 Pool completo: ${trimmed.length}/${originalTarget} em ${elapsed}s`);
            setResultFilterMode("ai");
            addVideosToUI(rankByBrazilianContent(trimmed), true);
            setCurrentIndex(0);
            setScrapeProgress("");
            setCacheStatus(`Pool: ${trimmed.length} vídeos prontos instantaneamente.`);
            activityTracker.logMerge(selectedTags);
            toast({ title: `Mescla do pool!`, description: `${trimmed.length} vídeos prontos em ${elapsed}s.` });
            setIsScraping(false);
            return;
          }

          if (poolServedCount > 0) {
            // Pool partial — show immediately, reduce quotas for live
            const deduped = dedupeVideos(poolVideos);
            tiktokApi.markVideosSeen(deduped.filter(v => v.tiktok_id).map(v => ({ tiktok_id: v.tiktok_id!, video_meta: getVideoMeta(v) }))).catch(() => {});
            addVideosToUI(rankByBrazilianContent(deduped), true);
            setCurrentIndex(0);
            addLog(`📦 Pool parcial: ${deduped.length} exibidos, buscando ${originalTarget - deduped.length} ao vivo...`);

            // Reduce expandedQty per group so live scrape targets only the deficit
            for (let i = 0; i < poolResults.length; i++) {
              const served = poolResults[i].served;
              if (served <= 0) continue;
              const tagStr = poolRequests[i].tagStr;
              if (tagStr.includes(',')) {
                const subTags = tagStr.split(',').map(t => t.trim()).filter(Boolean);
                const reducePerTag = Math.ceil(served / subTags.length);
                for (const st of subTags) {
                  if (expandedQty[st]) expandedQty[st] = Math.max(0, expandedQty[st] - reducePerTag);
                }
              } else if (expandedQty[tagStr]) {
                expandedQty[tagStr] = Math.max(0, expandedQty[tagStr] - served);
              }
            }
            totalTarget = Object.values(expandedQty).reduce((sum, q) => sum + q, 0);
          }
        }
      }
    } catch (err) {
      // pool-merge error — fall through to live scrape
      addLog(`⚠️ Pool falhou, usando busca ao vivo...`);
    }

    let totalNew = 0;

    // H: preload thumbnails in the background as soon as each batch arrives
    const preloadThumbnails = (vids: TikTokVideo[]) => {
      const urls = vids.map(v => v.thumbnail).filter(Boolean) as string[];
      let active = 0;
      let idx = 0;
      const next = () => {
        while (active < 10 && idx < urls.length) {
          active++;
          const img = new Image();
          img.onload = img.onerror = () => { active--; next(); };
          img.src = urls[idx++];
        }
      };
      next();
    };

    // Session-wide dedup set: guarantees no tiktok_id appears twice within this search
    const sessionSeenIds = new Set<string>();
    // Track TikWM cursor per hashtag so each round fetches new pages
    const cursorMap = new Map<string, string>();
    // Seed cursorMap from localStorage (cross-session persistence)
    for (const t of expandedTags) { const c = loadCursor(t); if (c) cursorMap.set(t, c); }

    // D: retry pool — sub-tags from selected presets not used in the initial expanded set
    const retryTagPool: string[] = [];
    for (const tagStr of selectedTags) {
      if (tagStr.includes(',')) {
        tagStr.split(',').map(t => t.trim()).filter(Boolean).forEach(st => {
          if (!expandedTags.includes(st) && !retryTagPool.includes(st)) retryTagPool.push(st);
        });
      }
    }

    // All hashtags in order: expanded tags first, then retry pool
    const allTags = [...expandedTags, ...retryTagPool];
    const exhaustedTags = new Set<string>();

    // F: fetchCandidates — parallel batches of 5 hashtags at a time
    // When tagQuotas is provided, respect per-hashtag limits for balanced distribution
    const PARALLEL_BATCH_SIZE = 5;
    const fetchCandidates = async (targetCount: number, forceRefresh: boolean, tagQuotas?: Record<string, number>) => {
      const freshVideos: TikTokVideo[] = [];
      const tagFetchedCount: Record<string, number> = {};

      const pendingTags = allTags.filter(tag => {
        if (exhaustedTags.has(tag)) return false;
        if (tagQuotas && tagQuotas[tag] !== undefined) {
          const already = tagFetchedCount[tag] || 0;
          return Math.ceil(tagQuotas[tag] * 3) - already > 0;
        }
        return true;
      });

      for (let i = 0; i < pendingTags.length; i += PARALLEL_BATCH_SIZE) {
        if (!tagQuotas && freshVideos.length >= targetCount) break;

        const batch = pendingTags.slice(i, i + PARALLEL_BATCH_SIZE);

        const results = await Promise.all(
          batch.map(async (tag) => {
            let tagLimit: number;
            if (tagQuotas && tagQuotas[tag] !== undefined) {
              const already = tagFetchedCount[tag] || 0;
              const remaining = Math.ceil(tagQuotas[tag] * 3) - already;
              if (remaining <= 0) return { tag, filtered: [] as TikTokVideo[] };
              tagLimit = remaining;
            } else {
              tagLimit = targetCount - freshVideos.length;
            }

            const requestAmount = Math.min(tagLimit * 6, 1000);

            try {
              const result = await tiktokApi.scrapeByHashtag(tag, requestAmount, undefined, forceRefresh, true, cursorMap.get(tag));
              if (result?.videos) {
                const filtered = applyFilters(result.videos);
                const limited = tagQuotas && tagQuotas[tag] !== undefined
                  ? filtered.slice(0, Math.ceil(tagQuotas[tag] * 3) - (tagFetchedCount[tag] || 0))
                  : filtered;
                totalNew += result.new_scraped || 0;
                if (result.next_cursor) {
                  cursorMap.set(tag, result.next_cursor);
                  saveCursor(tag, result.next_cursor);
                } else {
                  exhaustedTags.add(tag);
                }
                addLog(`  ✅ #${tag}: ${limited.length}/${result.videos.length} válidos${tagQuotas?.[tag] ? ` (quota: ${tagQuotas[tag]})` : ''}${exhaustedTags.has(tag) ? ' [esgotada]' : ''}`);
                return { tag, filtered: limited };
              } else {
                exhaustedTags.add(tag);
                return { tag, filtered: [] as TikTokVideo[] };
              }
            } catch {
              addLog(`  ❌ #${tag}: falhou`);
              exhaustedTags.add(tag);
              return { tag, filtered: [] as TikTokVideo[] };
            }
          })
        );

        for (const { tag, filtered } of results) {
          freshVideos.push(...filtered);
          tagFetchedCount[tag] = (tagFetchedCount[tag] || 0) + filtered.length;
        }
      }

      const result = dedupeVideos(freshVideos);
      preloadThumbnails(result); // H
      return result;
    };

    // E: fetch candidates with 3x overfetch (BR filter approval rate ~33%)
    const OVERFETCH_MULTIPLIER = 3;
    const fetchTarget = Math.ceil(totalTarget * OVERFETCH_MULTIPLIER);
    addLog(`⏳ Buscando ~${fetchTarget} vídeos brutos para filtrar os ${totalTarget} melhores...`);
    setScrapeProgress(`Buscando ${expandedTags.length} hashtags sequencialmente...`);

    const [seenIds, usedIds] = await Promise.all([
      tiktokApi.getSeenVideoIds(),
      tiktokApi.getUsedVideoIds(),
    ]);
    for (const id of usedIds) seenIds.add(id);
    const existingVideoKeys = new Set(videosRef.current.map(getVideoKey));
    const seenCandidateKeys = new Set(existingVideoKeys);
    const initialRaw = await fetchCandidates(fetchTarget, videosRef.current.length > 0, expandedQty);
    const initialCandidates = initialRaw.filter((video) => {
      const key = getVideoKey(video);
      if (seenCandidateKeys.has(key)) return false;
      if (video.tiktok_id && seenIds.has(video.tiktok_id)) return false;
      if (video.tiktok_id && sessionSeenIds.has(video.tiktok_id)) return false;
      seenCandidateKeys.add(key);
      if (video.tiktok_id) sessionSeenIds.add(video.tiktok_id);
      return true;
    });

    const phase1Time = ((performance.now() - startTime) / 1000).toFixed(1);
    addLog(`📊 Coletados: ${initialCandidates.length} vídeos novos únicos em ${phase1Time}s${existingVideoKeys.size > 0 ? ` (${existingVideoKeys.size} já carregados)` : ''}`);

    let approvedVideos: TikTokVideo[] = [];

    let firstProgressiveInsertAt = -1; // I: track position for first index jump

    let progressiveShownCount = 0; // tracks new videos shown from this search
    // Track keys already inserted into UI state (survives React batching)
    const insertedKeys = new Set<string>();

    const showProgressively = (batch: TikTokVideo[]) => {
      if (batch.length === 0 || progressiveShownCount >= totalTarget) return;
      // Trim so we never show more than totalTarget new videos in total
      const remaining = totalTarget - progressiveShownCount;
      const trimmed = batch.slice(0, remaining);
      progressiveShownCount += trimmed.length;
      if (firstProgressiveInsertAt === -1) {
        firstProgressiveInsertAt = videosRef.current.length;
        setCurrentIndex(firstProgressiveInsertAt === 0 ? 0 : firstProgressiveInsertAt);
      }
      setResultFilterMode("ai");
      addVideosToUI(rankByBrazilianContent(trimmed));
    };

    if (allGeneric) {
      addLog(`⚡ Hashtags genéricas detectadas — filtro de nicho desativado`);
      // Remove foreign content before counting as approved
      const filteredInitial = initialCandidates.filter(v => !isForeignContent(v));
      const foreignRemovedInit = initialCandidates.length - filteredInitial.length;
      if (foreignRemovedInit > 0) addLog(`🌐 Inicial: ${foreignRemovedInit} vídeos estrangeiros removidos`);
      // Enforce exact limit before progressive display
      approvedVideos = filteredInitial.slice(0, totalTarget);
      showProgressively(approvedVideos); // I

      const MAX_GENERIC_ROUNDS = 6;
      for (let round = 1; round < MAX_GENERIC_ROUNDS && approvedVideos.length < totalTarget; round++) {
        const deficit = totalTarget - approvedVideos.length;
        addLog(`🔁 Retry genérico ${round}: faltam ${deficit}, buscando mais...`);
        setScrapeProgress(`Buscando +${deficit} vídeos genéricos...`);
        const retryRaw = await fetchCandidates(Math.ceil(deficit * 1.5), true, expandedQty);
        const retryCandidates = retryRaw.filter((video) => {
          const key = getVideoKey(video);
          if (seenCandidateKeys.has(key)) return false;
          if (video.tiktok_id && seenIds.has(video.tiktok_id)) return false;
          if (video.tiktok_id && sessionSeenIds.has(video.tiktok_id)) return false;
          seenCandidateKeys.add(key);
          if (video.tiktok_id) sessionSeenIds.add(video.tiktok_id);
          return true;
        });
        addLog(`📊 Retry genérico ${round}: ${retryCandidates.length} candidatos novos`);
        if (retryCandidates.length === 0) break;
        // Remove foreign content before counting
        const filteredRetry = retryCandidates.filter(v => !isForeignContent(v));
        const foreignRemovedRetry = retryCandidates.length - filteredRetry.length;
        if (foreignRemovedRetry > 0) addLog(`🌐 Retry genérico ${round}: ${foreignRemovedRetry} vídeos estrangeiros removidos`);
        const before = approvedVideos.length;
        approvedVideos = dedupeVideos([...approvedVideos, ...filteredRetry]);
        // Enforce exact limit
        if (approvedVideos.length > totalTarget) approvedVideos = approvedVideos.slice(0, totalTarget);
        showProgressively(approvedVideos.slice(before)); // I
      }
    } else {
      const groupLabels = selectedTags.map(tagStr => {
        const preset = PRESET_HASHTAGS.find(p => p.tag === tagStr);
        return preset ? preset.label : null;
      }).filter(Boolean);
      const mergeNicheDescription = groupLabels.length > 0
        ? `Vídeos do TikTok brasileiro sobre: ${groupLabels.join(', ')}. Hashtags relacionadas: ${expandedTags.slice(0, 10).map(t => '#' + t).join(', ')}`
        : `Conteúdo do mesmo nicho destas hashtags do TikTok brasileiro: ${expandedTags.slice(0, 8).map((tag) => `#${tag}`).join(', ')}`;

      addLog(`🧠 Hashtags de nicho detectadas — validação por nicho ativada`);

      const MAX_FILTER_ROUNDS = 6;
      for (let round = 0; round < MAX_FILTER_ROUNDS; round++) {
        const deficit = totalTarget - approvedVideos.length;
        if (deficit <= 0) break;

        let roundCandidates: TikTokVideo[] = [];

        if (round === 0) {
          roundCandidates = initialCandidates;
          if (roundCandidates.length === 0) {
            addLog(`⚠️ Coleta inicial não trouxe vídeos novos, tentando busca forçada...`);
            continue;
          }
        } else {
          addLog(`🔁 Retry ${round}: faltam ${deficit}, buscando mais...`);
          setScrapeProgress(`Buscando +${deficit} vídeos (retry ${round})...`);
          const retryRaw = await fetchCandidates(Math.ceil(deficit * 1.5), true, expandedQty);
          roundCandidates = retryRaw.filter((video) => {
            const key = getVideoKey(video);
            if (seenCandidateKeys.has(key)) return false;
            if (video.tiktok_id && seenIds.has(video.tiktok_id)) return false;
            if (video.tiktok_id && sessionSeenIds.has(video.tiktok_id)) return false;
            seenCandidateKeys.add(key);
            if (video.tiktok_id) sessionSeenIds.add(video.tiktok_id);
            return true;
          });
          addLog(`📊 Retry ${round}: ${roundCandidates.length} candidatos novos`);
          if (roundCandidates.length === 0) {
            addLog(`⚠️ Nenhum vídeo novo encontrado, encerrando retries`);
            break;
          }
        }

        addLog(`🤖 Filtrando com IA (rodada ${round + 1})...`);
        setScrapeProgress(`IA analisando ${roundCandidates.length} vídeos...`);

        const [nicheFiltered, thumbFiltered] = await Promise.all([
          applyNicheTitleFilter(roundCandidates, mergeNicheDescription, expandedTags, addLog),
          applyThumbnailValidation(roundCandidates, mergeNicheDescription, addLog),
        ]);
        const nicheKeys = new Set(nicheFiltered.map(getVideoKey));
        const thumbKeys = new Set(thumbFiltered.map(getVideoKey));
        const hadSignal = nicheKeys.size > 0 || thumbKeys.size > 0;
        let roundApproved = hadSignal
          ? roundCandidates.filter((video) => {
              const key = getVideoKey(video);
              return nicheKeys.has(key) || thumbKeys.has(key);
            })
          : roundCandidates;

        // Remove foreign content before counting as approved
        const beforeForeignFilter = roundApproved.length;
        roundApproved = roundApproved.filter(v => !isForeignContent(v));
        const foreignRemoved = beforeForeignFilter - roundApproved.length;
        if (foreignRemoved > 0) addLog(`🌐 Rodada ${round + 1}: ${foreignRemoved} vídeos estrangeiros removidos`);

        const beforeApproved = approvedVideos.length;
        approvedVideos = dedupeVideos([...approvedVideos, ...roundApproved]);
        // Enforce exact limit so progressive display never exceeds totalTarget
        if (approvedVideos.length > totalTarget) approvedVideos = approvedVideos.slice(0, totalTarget);
        const newlyAdded = approvedVideos.length - beforeApproved;
        addLog(`🎯 Rodada ${round + 1}: +${newlyAdded} aprovados (${approvedVideos.length}/${totalTarget})`);
        showProgressively(approvedVideos.slice(beforeApproved)); // I
      }
    }

    // Extra fetch rounds: if we still haven't reached totalTarget, keep trying (max 5 extra rounds)
    const MAX_EXTRA_ROUNDS = 10;
    let consecutiveEmpty = 0;
    for (let extra = 0; extra < MAX_EXTRA_ROUNDS && approvedVideos.length < totalTarget; extra++) {
      const deficit = totalTarget - approvedVideos.length;
      addLog(`🔄 Rodada extra ${extra + 1}: faltam ${deficit} vídeos, buscando mais...`);
      setScrapeProgress(`Buscando +${deficit} vídeos (extra ${extra + 1}/${MAX_EXTRA_ROUNDS})...`);
      const extraRaw = await fetchCandidates(Math.ceil(deficit * 1.5), true, expandedQty);
      const extraCandidates = extraRaw.filter((video) => {
        const key = getVideoKey(video);
        if (seenCandidateKeys.has(key)) return false;
        if (video.tiktok_id && seenIds.has(video.tiktok_id)) return false;
        if (video.tiktok_id && sessionSeenIds.has(video.tiktok_id)) return false;
        seenCandidateKeys.add(key);
        if (video.tiktok_id) sessionSeenIds.add(video.tiktok_id);
        return true;
      });
      if (extraCandidates.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) {
          addLog(`⚠️ Rodada extra ${extra + 1}: pool esgotado após ${consecutiveEmpty} tentativas vazias`);
          break;
        }
        addLog(`⚠️ Rodada extra ${extra + 1}: nenhum vídeo novo, tentando com outras hashtags...`);
        continue;
      }
      consecutiveEmpty = 0;
      if (allGeneric) {
        // Remove foreign content before counting
        const beforeForeignG = extraCandidates.length;
        const filteredExtra = extraCandidates.filter(v => !isForeignContent(v));
        const foreignRemovedG = beforeForeignG - filteredExtra.length;
        if (foreignRemovedG > 0) addLog(`🌐 Extra ${extra + 1}: ${foreignRemovedG} vídeos estrangeiros removidos`);
        const before = approvedVideos.length;
        approvedVideos = dedupeVideos([...approvedVideos, ...filteredExtra]);
        if (approvedVideos.length > totalTarget) approvedVideos = approvedVideos.slice(0, totalTarget);
        showProgressively(approvedVideos.slice(before));
        addLog(`🎯 Extra ${extra + 1}: +${approvedVideos.length - before} aprovados (${approvedVideos.length}/${totalTarget})`);
      } else {
        addLog(`🤖 Filtrando ${extraCandidates.length} vídeos (extra ${extra + 1})...`);
        const mergeNicheDesc = selectedTags.map(t => PRESET_HASHTAGS.find(p => p.tag === t)?.label).filter(Boolean).join(', ') || expandedTags.slice(0, 8).map(t => '#' + t).join(', ');
        const [nicheFiltered, thumbFiltered] = await Promise.all([
          applyNicheTitleFilter(extraCandidates, mergeNicheDesc, expandedTags, addLog),
          applyThumbnailValidation(extraCandidates, mergeNicheDesc, addLog),
        ]);
        const nicheKeys = new Set(nicheFiltered.map(getVideoKey));
        const thumbKeys = new Set(thumbFiltered.map(getVideoKey));
        const hadSignal = nicheKeys.size > 0 || thumbKeys.size > 0;
        let extraApproved = hadSignal
          ? extraCandidates.filter(v => nicheKeys.has(getVideoKey(v)) || thumbKeys.has(getVideoKey(v)))
          : extraCandidates;
        // Remove foreign content before counting
        const beforeForeignE = extraApproved.length;
        extraApproved = extraApproved.filter(v => !isForeignContent(v));
        const foreignRemovedE = beforeForeignE - extraApproved.length;
        if (foreignRemovedE > 0) addLog(`🌐 Extra ${extra + 1}: ${foreignRemovedE} vídeos estrangeiros removidos`);
        const before = approvedVideos.length;
        approvedVideos = dedupeVideos([...approvedVideos, ...extraApproved]);
        if (approvedVideos.length > totalTarget) approvedVideos = approvedVideos.slice(0, totalTarget);
        const newlyAdded = approvedVideos.length - before;
        addLog(`🎯 Extra ${extra + 1}: +${newlyAdded} aprovados (${approvedVideos.length}/${totalTarget})`);
        showProgressively(approvedVideos.slice(before));
      }
    }

    // AI expansion: if still short, ask AI for more related hashtags and keep fetching
    if (approvedVideos.length < totalTarget) {
      const deficit = totalTarget - approvedVideos.length;
      const primaryTag = expandedTags[0] || selectedTags[0] || '';
      if (primaryTag) {
        addLog(`🧠 Faltam ${deficit} vídeos — pedindo hashtags extras à IA para "#${primaryTag}"...`);
        setScrapeProgress(`IA gerando hashtags extras...`);
        try {
          const { data: aiData } = await supabase.functions.invoke('ai-hashtag-suggest', {
            body: { description: `Preciso de 20-25 hashtags novas do TikTok sobre: ${primaryTag}. Gere hashtags DIFERENTES e VARIADAS das já usadas: ${allTags.join(', ')}. Inclua sinônimos, variações com/sem acento, hashtags compostas e de nichos relacionados.` },
          });
          const aiHashtags: string[] = (aiData?.hashtags || [])
            .map((h: any) => h.tag?.toLowerCase?.().trim())
            .filter((t: string) => t && !allTags.includes(t) && !exhaustedTags.has(t));

          if (aiHashtags.length > 0) {
            addLog(`✨ IA sugeriu ${aiHashtags.length} novas: ${aiHashtags.map(t => '#' + t).join(', ')}`);
            // Add new tags to pool
            for (const t of aiHashtags) allTags.push(t);

            // Run extra rounds with the new tags
            const AI_EXTRA_ROUNDS = 5;
            for (let aiRound = 0; aiRound < AI_EXTRA_ROUNDS && approvedVideos.length < totalTarget; aiRound++) {
              const aiDeficit = totalTarget - approvedVideos.length;
              addLog(`🔄 Rodada IA ${aiRound + 1}: faltam ${aiDeficit}, buscando novas hashtags...`);
              setScrapeProgress(`Buscando +${aiDeficit} vídeos (IA ${aiRound + 1}/${AI_EXTRA_ROUNDS})...`);
              const aiRaw = await fetchCandidates(Math.ceil(aiDeficit * 1.5), true, expandedQty);
              const aiCandidates = aiRaw.filter((video) => {
                const key = getVideoKey(video);
                if (seenCandidateKeys.has(key)) return false;
                if (video.tiktok_id && seenIds.has(video.tiktok_id)) return false;
                if (video.tiktok_id && sessionSeenIds.has(video.tiktok_id)) return false;
                seenCandidateKeys.add(key);
                if (video.tiktok_id) sessionSeenIds.add(video.tiktok_id);
                return true;
              });
              if (aiCandidates.length === 0) {
                addLog(`⚠️ Rodada IA ${aiRound + 1}: nenhum vídeo novo`);
                break;
              }
              if (allGeneric) {
                // Remove foreign content before counting
                const beforeForeignAG = aiCandidates.length;
                const filteredAi = aiCandidates.filter(v => !isForeignContent(v));
                const foreignRemovedAG = beforeForeignAG - filteredAi.length;
                if (foreignRemovedAG > 0) addLog(`🌐 IA ${aiRound + 1}: ${foreignRemovedAG} vídeos estrangeiros removidos`);
                const before = approvedVideos.length;
                approvedVideos = dedupeVideos([...approvedVideos, ...filteredAi]);
                if (approvedVideos.length > totalTarget) approvedVideos = approvedVideos.slice(0, totalTarget);
                showProgressively(approvedVideos.slice(before));
                addLog(`🎯 IA ${aiRound + 1}: +${approvedVideos.length - before} aprovados (${approvedVideos.length}/${totalTarget})`);
              } else {
                const mergeNicheDesc = selectedTags.map(t => PRESET_HASHTAGS.find(p => p.tag === t)?.label).filter(Boolean).join(', ') || expandedTags.slice(0, 8).map(t => '#' + t).join(', ');
                const [nicheFiltered, thumbFiltered] = await Promise.all([
                  applyNicheTitleFilter(aiCandidates, mergeNicheDesc, expandedTags, addLog),
                  applyThumbnailValidation(aiCandidates, mergeNicheDesc, addLog),
                ]);
                const nicheKeys = new Set(nicheFiltered.map(getVideoKey));
                const thumbKeys = new Set(thumbFiltered.map(getVideoKey));
                const hadSignal = nicheKeys.size > 0 || thumbKeys.size > 0;
                let aiApproved = hadSignal
                  ? aiCandidates.filter(v => nicheKeys.has(getVideoKey(v)) || thumbKeys.has(getVideoKey(v)))
                  : aiCandidates;
                // Remove foreign content before counting
                const beforeForeignAN = aiApproved.length;
                aiApproved = aiApproved.filter(v => !isForeignContent(v));
                const foreignRemovedAN = beforeForeignAN - aiApproved.length;
                if (foreignRemovedAN > 0) addLog(`🌐 IA ${aiRound + 1}: ${foreignRemovedAN} vídeos estrangeiros removidos`);
                const before = approvedVideos.length;
                approvedVideos = dedupeVideos([...approvedVideos, ...aiApproved]);
                if (approvedVideos.length > totalTarget) approvedVideos = approvedVideos.slice(0, totalTarget);
                const newlyAdded = approvedVideos.length - before;
                addLog(`🎯 IA ${aiRound + 1}: +${newlyAdded} aprovados (${approvedVideos.length}/${totalTarget})`);
                showProgressively(approvedVideos.slice(before));
              }
            }
          } else {
            addLog(`⚠️ IA não sugeriu hashtags novas`);
          }
        } catch (err) {
          addLog(`⚠️ Expansão IA falhou: ${err instanceof Error ? err.message : 'erro'}`);
        }
      }
    }

    // approvedVideos is already capped — slice is a safety net
    const unique = approvedVideos.slice(0, totalTarget);

    // Mark seen so this user won't get the same videos again
    await tiktokApi.markVideosSeen(unique.filter(v => v.tiktok_id).map(v => ({ tiktok_id: v.tiktok_id!, video_meta: getVideoMeta(v) }))).catch(err => console.error('[markVideosSeen] erro:', err));

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    const grandTotal = poolServedCount + unique.length;
    addLog(`🏁 Concluído: ${grandTotal}/${originalTarget} vídeos em ${elapsed}s${poolServedCount > 0 ? ` (${poolServedCount} do pool)` : ''}`);

    setResultFilterMode("ai");
    if (unique.length > 0) {
      if (firstProgressiveInsertAt === -1 && poolServedCount === 0) {
        setCurrentIndex(videosRef.current.length === 0 ? 0 : videosRef.current.length);
      }
      addVideosToUI(rankByBrazilianContent(unique));
      detectOffTopicVideos(unique, expandedTags);
    }
    setScrapeProgress("");

    setCacheStatus(poolServedCount > 0
      ? `Pool: ${poolServedCount} + Live: ${unique.length} = ${grandTotal} vídeos. Meta: ${originalTarget}.`
      : `Mesclado ${selectedTags.length} hashtags: ${unique.length} vídeos únicos (${totalNew} novos). Meta: ${originalTarget}.`);
    activityTracker.logMerge(selectedTags);
    toast({
      title: poolServedCount > 0 ? `Mescla pool + live! ${elapsed}s` : `Mescla concluída! ${elapsed}s`,
      description: `${grandTotal}/${originalTarget} vídeos de ${selectedTags.length} hashtags${poolServedCount > 0 ? ` (${poolServedCount} do pool)` : ''}.`,
    });
    setIsScraping(false);
  };

  const executeForYouScrape = async () => {
    setIsScraping(true);
    setCacheStatus(null);
    setActiveTag("foryou");
    setScrapeProgress(`Buscando ${foryouQuantity} vídeos do For You com filtros...`);
    activityTracker.logSearch('foryou');

    try {
      const [result, seenIds, usedIds] = await Promise.all([
        tiktokApi.scrapeForYou(foryouQuantity, filters),
        tiktokApi.getSeenVideoIds(),
        tiktokApi.getUsedVideoIds(),
      ]);
      for (const id of usedIds) seenIds.add(id);

      const unseenVideos = (result.videos || []).filter(v => v.tiktok_id && !seenIds.has(v.tiktok_id));
      tiktokApi.markVideosSeen(unseenVideos.filter(v => v.tiktok_id).map(v => ({ tiktok_id: v.tiktok_id!, video_meta: getVideoMeta(v) }))).catch(err => console.error('[markVideosSeen] erro:', err));

      if (unseenVideos.length > 0) {
        setResultFilterMode("strict");
        addVideosToUI(rankByBrazilianContent(unseenVideos), true);
        setCurrentIndex(0);
      }

      setCacheStatus(`${result.new_scraped} novos vídeos coletados do For You. ${result.total_available} disponíveis no total.`);
      toast({
        title: `🔥 For You — ${result.new_scraped} novos!`,
        description: `${result.total_available} vídeos disponíveis no total.`,
      });
    } catch (err) {
      console.error('FYP scrape error:', err);
      toast({ title: "Erro na busca", description: "Não foi possível buscar vídeos do For You.", variant: "destructive" });
    } finally {
      setIsScraping(false);
      setScrapeProgress("");
    }
  };

  const handleConfirmAction = () => {
    setConfirmDialog({ open: false, type: "single" });
    if (confirmDialog.type === "single" && confirmDialog.tag) {
      executeSingleScrape(confirmDialog.tag, false, tagQuantities[confirmDialog.tag] || 50);
    } else if (confirmDialog.type === "merge") {
      executeMergeScrape();
    } else if (confirmDialog.type === "foryou") {
      executeForYouScrape();
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSingleScrapeConfirm(searchTag);
  };

  const handleDownload = async () => {
    if (!currentVideo) return;
    setIsDownloading(true);
    activityTracker.logDownload(currentVideo.title, currentVideo.id);
    try {
      const result = await tiktokApi.downloadVideo(currentVideo);
      if (result.success) {
        if (currentVideo.tiktok_id) tiktokApi.markVideosUsed([{ tiktok_id: currentVideo.tiktok_id, video_meta: getVideoMeta(currentVideo) }]).catch(err => console.error('[markVideosUsed] erro:', err));
        setDownloadedCount((prev) => prev + 1);
        toast({ title: "Download concluído!", description: `"${currentVideo.title}" salvo sem marca d'água.` });
        // Remove downloaded video from preview and DB
        setVideos(prev => prev.filter(v => v.id !== currentVideo.id));
        setCurrentIndex(i => Math.min(i, videos.length - 2));
        tiktokApi.deleteVideos([currentVideo.id]).catch(err => {
          console.error('Delete error:', err);
          toast({ title: 'Erro ao remover vídeo', description: 'Não foi possível remover da base de dados.', variant: 'destructive' });
        });
      } else {
        toast({ title: "Erro no download", description: result.error || "Não foi possível baixar.", variant: "destructive" });
      }
    } catch (err) {
      console.error('Download error:', err);
      toast({ title: "Erro no download", description: "Falha ao baixar o vídeo.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBatchDownload = async (overrideCount?: number) => {
    if (!(await requireCredits())) return;
    const qty = overrideCount || batchQuantity;
    const requestedCount = Math.min(qty, totalFiltered);
    if (requestedCount <= 0) return;

    // Always slice from 0 since downloaded videos are removed from the list
    const videosToDownloadRaw = filteredVideos.slice(0, requestedCount);

    const seenVideoKeys = new Set<string>();
    const videosToDownload = videosToDownloadRaw.filter((video) => {
      const key = getVideoKey(video);
      if (seenVideoKeys.has(key)) return false;
      seenVideoKeys.add(key);
      return true;
    });

    const skippedBeforeDownload = requestedCount - videosToDownload.length;
    const batchCount = videosToDownload.length;

    if (batchCount <= 0) {
      setDownloadedCount((prev) => prev + requestedCount);
      toast({ title: "Sem novos vídeos", description: "Todos os itens deste lote eram duplicados." });
      return;
    }

    setIsDownloading(true);
    setBatchProgress({ current: 0, total: batchCount, active: true });
    activityTracker.logBatchDownload(batchCount);
    toast({
      title: "Preparando ZIP...",
      description:
        skippedBeforeDownload > 0
          ? `Baixando ${batchCount} vídeos únicos (ignorados ${skippedBeforeDownload} duplicados).`
          : `Baixando ${batchCount} vídeos sem marca d'água.`,
    });

    const zip = new JSZip();
    let successCount = 0;
    let completedCount = 0;
    let skippedBySameFile = 0;
    let directUrlCount = 0;
    let edgeFnCount = 0;
    const BATCH_SIZE = 50; // matches edge function limit
    const batchStartTime = performance.now();

    // Step 1: Resolve all download URLs — use CDN URLs directly, only call edge function for page URLs
    const urlMap = new Map<number, string>(); // index -> download_url
    const isCdnUrl = (url: string) => /tiktokcdn|tiktokcdn-eu|v\d+-webapp|tikwm\.com\/video|muscdn\.com/i.test(url);

    {
      // Separate videos with direct CDN URLs from those needing resolution
      const needsResolution: { video: typeof videosToDownload[0]; index: number }[] = [];
      for (let i = 0; i < videosToDownload.length; i++) {
        const video = videosToDownload[i];
        const directUrl = video.video_url;
        if (directUrl && isCdnUrl(directUrl)) {
          urlMap.set(i, directUrl);
          directUrlCount++;
        } else {
          needsResolution.push({ video, index: i });
        }
      }

      // Only call edge function for videos that need resolution
      if (needsResolution.length > 0) {
        const batchPayloads: { videos: any[]; batchIndex: number }[] = [];
        for (let start = 0; start < needsResolution.length; start += BATCH_SIZE) {
          const chunk = needsResolution.slice(start, start + BATCH_SIZE);
          batchPayloads.push({
            batchIndex: start,
            videos: chunk.map((item) => ({
              video_url: item.video.source_url || (item.video.tiktok_id ? `https://www.tiktok.com/@user/video/${item.video.tiktok_id}` : ''),
              tiktok_id: item.video.tiktok_id || undefined,
              index: item.index,
            })),
          });
        }

        for (let b = 0; b < batchPayloads.length; b++) {
          const payload = batchPayloads[b];

          try {
            const { data, error } = await supabase.functions.invoke('download-tiktok-batch', {
              body: { videos: payload.videos },
            });
            if (error) {
              console.error(`[Batch] Batch ${b + 1} edge function error:`, error);
            }
            if (!error && data?.results) {
              let batchOk = 0;
              let batchFail = 0;
              for (const r of data.results) {
                if (r.success && r.download_url) {
                  urlMap.set(r.index, r.download_url);
                  batchOk++;
                  edgeFnCount++;
                } else {
                  batchFail++;
                  const vid = payload.videos.find((v: any) => v.index === r.index);
                  console.warn(`[Batch] URL falhou idx=${r.index} tiktok_id=${vid?.tiktok_id || '?'} erro="${r.error || 'sem erro retornado'}" url=${vid?.video_url?.slice(0, 80) || '?'}`);
                }
              }
            }
          } catch (err) {
            console.error(`[Batch] Batch ${b + 1} failed:`, err);
          }

          setBatchProgress({
            current: Math.floor(((b + 1) / batchPayloads.length) * batchCount * 0.3),
            total: batchCount,
            active: true,
          });

          if (b < batchPayloads.length - 1) {
            await new Promise(r => setTimeout(r, 500));
          }
        }

        // Retry pass: re-resolve failed URLs in smaller batches
        const failedIndices = needsResolution
          .map(item => item.index)
          .filter(i => !urlMap.has(i));

        if (failedIndices.length > 0 && failedIndices.length < needsResolution.length) {
          const RETRY_BATCH = 20;
          for (let r = 0; r < failedIndices.length; r += RETRY_BATCH) {
            const retryChunk = failedIndices.slice(r, r + RETRY_BATCH);
            const retryVideos = retryChunk.map(idx => ({
              video_url: videosToDownload[idx].source_url || (videosToDownload[idx].tiktok_id ? `https://www.tiktok.com/@user/video/${videosToDownload[idx].tiktok_id}` : ''),
              tiktok_id: videosToDownload[idx].tiktok_id || undefined,
              index: idx,
            }));

            try {
              const { data, error } = await supabase.functions.invoke('download-tiktok-batch', {
                body: { videos: retryVideos },
              });
              if (error) {
                console.error(`[Batch] Retry edge function error:`, error);
              }
              if (!error && data?.results) {
                let retryOk = 0;
                let retryFail = 0;
                for (const res of data.results) {
                  if (res.success && res.download_url) {
                    urlMap.set(res.index, res.download_url);
                    retryOk++;
                    edgeFnCount++;
                  } else {
                    retryFail++;
                    const vid = retryVideos.find((v: any) => v.index === res.index);
                    console.warn(`[Batch] Retry falhou idx=${res.index} tiktok_id=${vid?.tiktok_id || '?'} erro="${res.error || 'sem erro retornado'}" url=${vid?.video_url?.slice(0, 80) || '?'}`);
                  }
                }
              }
            } catch (retryErr) {
              console.error(`[Batch] Retry chunk failed:`, retryErr);
            }

            if (r + RETRY_BATCH < failedIndices.length) {
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          }
        }
      }
    }

    setBatchProgress({ current: Math.floor(batchCount * 0.4), total: batchCount, active: true });

    // Step 2: Download actual video files in parallel using resolved URLs
    const CONCURRENCY = 15;
    const downloadFile = async (
      video: typeof videosToDownload[0],
      index: number
    ): Promise<{ index: number; blob: Blob; name: string; downloadUrl: string } | null> => {
      const downloadUrl = urlMap.get(index);
      if (!downloadUrl) return null;

      try {
        // Route CDN URLs through proxy to avoid CORS, fetch others directly
        let res: Response;
        if (isCdnUrl(downloadUrl)) {
          const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-video`;
          res = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ url: downloadUrl }),
          });
        } else {
          res = await fetch(downloadUrl);
        }
        if (!res.ok) return null;

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('audio') && !contentType.includes('video')) return null;

        const blob = await res.blob();
        if (blob.type && blob.type.includes('audio') && !blob.type.includes('video')) return null;
        if (blob.size < 50 * 1024) return null; // 50KB minimum (was 200KB)

        const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
        if (!String.fromCharCode(...header).includes('ftyp')) return null;

        const safeName = (video.title || 'video').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 40);
        return { index, blob, name: safeName, downloadUrl };
      } catch (err) {
        console.error(`Failed to download video ${index + 1}:`, err);
        return null;
      }
    };

    const seenDownloadUrls = new Set<string>();

    // Continuous worker pool: each worker grabs the next video as soon as it finishes
    const queue = videosToDownload.map((video, i) => ({ video, index: i }));
    let queuePos = 0;

    const worker = async () => {
      while (queuePos < queue.length) {
        const pos = queuePos++;
        const { video, index } = queue[pos];
        const result = await downloadFile(video, index);

        if (result) {
          const normalizedDownloadUrl = result.downloadUrl.split('?')[0];
          if (seenDownloadUrls.has(normalizedDownloadUrl)) {
            skippedBySameFile++;
          } else {
            seenDownloadUrls.add(normalizedDownloadUrl);
            const paddedNum = String(successCount + 1).padStart(String(batchCount).length, '0');
            zip.file(`${paddedNum}_${result.name}.mp4`, new Uint8Array(await result.blob.arrayBuffer()), { compression: 'STORE' });
            successCount++;
          }
        }

        completedCount++;
        setBatchProgress({ current: Math.min(completedCount, batchCount), total: batchCount, active: true });
      }
    };

    const workerCount = Math.min(CONCURRENCY, queue.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    if (successCount > 0) {
      toast({ title: "Gerando ZIP...", description: "Compactando vídeos..." });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const tag = activeTag || 'tiktok';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      saveAs(zipBlob, `${tag}_${successCount}videos_${timestamp}.zip`);
    }

    const totalTime = ((performance.now() - batchStartTime) / 1000).toFixed(1);
    console.log(`[Batch Download] ${successCount}/${batchCount} em ${totalTime}s | Direto: ${directUrlCount} | Edge Fn: ${edgeFnCount}`);

    // Mark downloaded videos as used (persisted in Supabase)
    const usedItems = videosToDownload.filter(v => v.tiktok_id).map(v => ({ tiktok_id: v.tiktok_id!, video_meta: getVideoMeta(v) }));
    await tiktokApi.markVideosUsed(usedItems).catch(err => console.error('[markVideosUsed] erro:', err));

    // Deduct credits for downloaded videos
    if (successCount > 0) {
      await credits.deductCredits(successCount);
    }

    // Remove downloaded videos from preview and DB
    const downloadedIds = new Set(videosToDownload.map(v => v.id));
    setVideos(prev => prev.filter(v => !downloadedIds.has(v.id)));
    setCurrentIndex(0);
    setDownloadedCount((prev) => prev + requestedCount);
    tiktokApi.deleteVideos(Array.from(downloadedIds)).catch(err => console.error('Delete error:', err));
    setBatchProgress({ current: 0, total: 0, active: false });
    toast({
      title: successCount > 0 ? `ZIP pronto! ⚡ ${totalTime}s` : "Falha no download",
      description: successCount > 0
        ? `${successCount} vídeos baixados em ${totalTime}s${skippedBeforeDownload + skippedBySameFile > 0 ? ` (${skippedBeforeDownload + skippedBySameFile} duplicados ignorados)` : ''}.`
        : "Não foi possível baixar nenhum vídeo.",
      variant: successCount > 0 ? "default" : "destructive",
    });
    setIsDownloading(false);
  };

  // Cost estimate
  const estimateCost = (count: number) => {
    // ~$0.05 per 20 videos via Apify fallback
    return (count * 50 * 0.05 / 20).toFixed(2);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Carregando vídeos...</span>
        </div>
      </div>
    );
  }

  const groupedTags = {
    "😂 Humor": PRESET_HASHTAGS.filter(h => h.group === "humor"),
    "🔥 Viral & Trends": PRESET_HASHTAGS.filter(h => h.group === "viral"),
    "💃 Lifestyle": PRESET_HASHTAGS.filter(h => h.group === "lifestyle"),
    "🤖 Trends IA & Novelas": PRESET_HASHTAGS.filter(h => h.group === "ia_novela"),
    "😌 Satisfying & Curiosidades": PRESET_HASHTAGS.filter(h => h.group === "satisfying"),
    "🏠 Casa & Organização": PRESET_HASHTAGS.filter(h => h.group === "casa"),
    "💡 Dicas & Motivação": PRESET_HASHTAGS.filter(h => h.group === "dicas"),
    "😱 Hook Forte": PRESET_HASHTAGS.filter(h => h.group === "hook"),
  };

  const handleDiscover = async () => {
    if (!discoverTopic.trim()) return;
    setIsDiscovering(true);
    try {
      const result = await tiktokApi.discoverHashtags(discoverTopic.trim());
      if (result.success && result.hashtags?.length > 0) {
        setDiscoveredTags(result.hashtags);
        toast({
          title: `🔍 ${result.hashtags.length} hashtags descobertas!`,
          description: result.from_cache ? 'Do cache (últimas 24h)' : `Novas hashtags para "${discoverTopic}"`,
        });
      } else {
        toast({ title: "Nenhuma hashtag encontrada", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro na descoberta", description: err.message, variant: "destructive" });
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Upgrade Modal — blocks everything when credits exhausted */}
      {showUpgrade && <UpgradeModal />}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Confirmar busca
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {confirmDialog.type === "single" ? (
                <>
                  <p>Buscar <strong>{tagQuantities[confirmDialog.tag!] || 50} vídeos</strong> de <strong>#{confirmDialog.tag}</strong>?</p>
                  <p className="text-xs text-muted-foreground">
                    Se os vídeos já estiverem no cache (últimas 6h), não haverá custo.
                    Caso contrário, usará Apify como fallback (~$0.12).
                  </p>
                </>
              ) : confirmDialog.type === "foryou" ? (
                <>
                  <p>Buscar <strong>{foryouQuantity} vídeos</strong> do <strong>For You</strong> do TikTok?</p>
                  {(filters.minViews > 0 || filters.minLikes > 0 || filters.minShares > 0 || filters.minComments > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {filters.minViews > 0 && <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">Views {tiktokApi.formatNumber(filters.minViews)}+</span>}
                      {filters.minLikes > 0 && <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">Likes {tiktokApi.formatNumber(filters.minLikes)}+</span>}
                      {filters.minShares > 0 && <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">Shares {tiktokApi.formatNumber(filters.minShares)}+</span>}
                      {filters.minComments > 0 && <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">Comments {tiktokApi.formatNumber(filters.minComments)}+</span>}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    O sistema vai buscar conteúdo trending até preencher <strong>{foryouQuantity} vídeos</strong> que passem nos seus filtros. Sem custo (usa APIs gratuitas).
                  </p>
                </>
              ) : (
                <>
                  <p>{aiSuggestedTags.length > 0 ? '🧠 Busca inteligente' : 'Mesclar'}: <strong>{selectedTags.length} {selectedTags.length === 1 ? 'grupo' : 'hashtags'}</strong></p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedTags.map(t => {
                      const preset = PRESET_HASHTAGS.find(p => p.tag === t);
                      const displayName = preset ? `${preset.emoji} ${preset.label}` : `#${t}`;
                      const isMulti = t.includes(',');
                      const subCount = isMulti ? t.split(',').length : 0;
                      return (
                        <span key={t} className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">
                          {displayName} ({tagQuantities[t] || 50}){isMulti && <span className="text-primary/60 ml-1">• {subCount} tags</span>}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Total: até <strong>{selectedTags.reduce((s, t) => s + (tagQuantities[t] || 50), 0)} vídeos</strong>.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              Confirmar busca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gradient line top */}
      <div className="h-[1px] gradient-line w-full flex-shrink-0" />

      {/* Header */}
      <header className="border-b border-border/15 px-6 py-2.5 flex-shrink-0 glass-strong sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-end gap-3">
          {/* Credits badge */}
          {credits.isUnlimited ? (
            <span className="px-2 py-1 rounded-lg bg-accent/15 text-accent text-[11px] font-bold border border-accent/20">
              Ilimitado
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold ${credits.creditsUsed >= credits.creditsTotal * 0.9 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {credits.creditsUsed}/{credits.creditsTotal}
                </span>
                <div className="w-16 h-1.5 rounded-full bg-secondary/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${credits.creditsUsed >= credits.creditsTotal * 0.9 ? 'bg-red-500' : 'bg-orange-500'}`}
                    style={{ width: `${Math.min(100, (credits.creditsUsed / credits.creditsTotal) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground leading-tight tracking-tight">{profile?.display_name || profile?.username || 'Editor'}</p>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              {role === 'admin' && (
                <span className="px-1.5 py-[1px] rounded-md bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider border border-primary/15 glow-primary">
                  Admin
                </span>
              )}
              {role !== 'admin' && (
                <span className="text-[10px] text-muted-foreground/60 capitalize">{role || 'editor'}</span>
              )}
            </div>
          </div>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary/50 flex items-center justify-center text-primary-foreground text-xs font-bold avatar-glow ring-2 ring-primary/10">
            {(profile?.display_name || profile?.username || 'E').charAt(0).toUpperCase()}
          </div>
          {role === 'admin' && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]">
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-start justify-center px-8 py-6">
        <div className="flex gap-6 max-w-[1200px] w-full">
          {/* Video Player - hidden during editing tab */}
          <div
            ref={playerRef}
            className={`relative flex-shrink-0 ${activeTab === "edicao" ? "hidden" : ""}`}
            style={{ width: '360px' }}
            onWheelCapture={handleWheelNavigate}
          >
            {currentVideo ? (
              <div className={`relative rounded-2xl overflow-hidden ${isPlaying ? 'player-glow-active' : 'player-glow'} border border-border/15 transition-all duration-500`} style={{ aspectRatio: '9/16' }}>
                {previewVideoSrc ? (
                  <>
                    {!isPreviewReady && (
                      <img
                        src={previewThumbnailSrc || '/placeholder.svg'}
                        alt={currentVideo.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                      />
                    )}
                    <video
                      ref={videoRef}
                      key={currentVideo.id}
                      src={previewVideoSrc}
                      className={`w-full h-full object-cover ${isPreviewReady ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
                      loop
                      playsInline
                      preload="none"
                      muted={isMuted}
                      autoPlay={isPlaying}
                      poster={previewThumbnailSrc || '/placeholder.svg'}
                      onLoadedData={() => setIsPreviewReady(true)}
                      onCanPlay={() => setIsPreviewReady(true)}
                      onError={() => {
                        setPreviewVideoSrc(null);
                        setIsPreviewReady(false);
                      }}
                    />
                  </>
                ) : (
                  <img
                    src={previewThumbnailSrc || '/placeholder.svg'}
                    alt={currentVideo.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                  />
                )}

                {isPreviewLoading && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
                    <div className="flex items-center gap-2 rounded-full glass-subtle px-3 py-1.5 text-xs font-semibold text-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      Carregando vídeo...
                    </div>
                  </div>
                )}

                <div className="absolute inset-0 z-10 cursor-pointer" onClick={togglePlay} onWheel={handleWheelNavigate} aria-label="Interação do player" />

                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-30 pointer-events-none">
                    <div className="h-14 w-14 rounded-full bg-primary/20 backdrop-blur-xl flex items-center justify-center border border-primary/30 glow-primary transition-all duration-300">
                      <Play className="h-6 w-6 text-foreground fill-foreground ml-0.5" />
                    </div>
                  </div>
                )}

                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                  <span className="glass-subtle text-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    {currentIndex + 1} / {totalFiltered}
                  </span>
                </div>

                <button onClick={toggleMute} className="absolute top-3 right-3 z-20 h-7 w-7 rounded-full glass-subtle flex items-center justify-center text-foreground/80 hover:text-foreground hover:scale-110 transition-all duration-200">
                  {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>

                <button onClick={handleRemoveVideo} className="absolute top-3 left-3 z-20 h-7 w-7 rounded-full glass-subtle flex items-center justify-center text-destructive/80 hover:text-destructive hover:bg-destructive/20 hover:scale-110 transition-all duration-200" title="Remover vídeo">
                  <X className="h-3.5 w-3.5" />
                </button>

                <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5">
                  <button onClick={handlePrev} className="h-7 w-7 rounded-full glass-subtle flex items-center justify-center text-foreground/80 hover:text-foreground hover:scale-110 active:scale-95 transition-all duration-200">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button onClick={handleNext} className="h-7 w-7 rounded-full glass-subtle flex items-center justify-center text-foreground/80 hover:text-foreground hover:scale-110 active:scale-95 transition-all duration-200">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Video info overlay */}
                <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-background via-background/60 to-transparent p-4 pt-16">
                  <div className="flex items-center gap-1.5 mb-1">
                    {tiktokApi.getViralScore(currentVideo) === 'trending' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[8px] font-bold">🔥 TRENDING</span>
                    )}
                    {tiktokApi.getViralScore(currentVideo) === 'hot' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[8px] font-bold">⚡ HOT</span>
                    )}
                    {tiktokApi.getQualityScore(currentVideo) >= 70 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[8px] font-bold">
                        <Star className="h-2 w-2" />HD
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/90 font-medium line-clamp-2 leading-relaxed">{currentVideo.title}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-foreground/50">
                    {currentVideo.author && <span className="font-medium">@{currentVideo.author}</span>}
                    <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{tiktokApi.formatNumber(currentVideo.views)}</span>
                    <span className="flex items-center gap-0.5"><Heart className="h-2.5 w-2.5" />{tiktokApi.formatNumber(currentVideo.likes)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl glass-strong p-8 gap-5 border border-border/20" style={{ aspectRatio: '9/16' }}>
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center border border-primary/10 glow-primary animate-pulse-glow">
                  <Search className="h-7 w-7 text-primary/30" />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-muted-foreground text-xs font-semibold tracking-tight">Nenhum vídeo</p>
                  <p className="text-muted-foreground/40 text-[10px] leading-relaxed max-w-[140px]">
                    Busque vídeos para visualizar aqui
                  </p>
                </div>
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="h-1 w-6 rounded-full bg-muted/40" />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div className="flex-1 space-y-4 min-w-0">
            {/* Tab Buttons */}
            <div className="flex rounded-xl glass-strong p-1 gap-1">
              <button
                onClick={() => setActiveTab("busca")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold transition-all duration-200 ${
                  activeTab === "busca"
                    ? "bg-gradient-to-r from-primary to-primary/85 text-primary-foreground btn-glow"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                }`}
              >
                <Search className="h-3.5 w-3.5" />
                Busca
              </button>
              <button
                onClick={() => setActiveTab("edicao")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold transition-all duration-200 ${
                  activeTab === "edicao"
                    ? "bg-gradient-to-r from-primary to-primary/85 text-primary-foreground btn-glow"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                }`}
              >
                <Scissors className="h-3.5 w-3.5" />
                Edição
              </button>
            </div>

            {activeTab === "edicao" ? (
              <VideoEditorTab videos={filteredVideos} setVideos={setVideos} />
            ) : (
            <>
            {/* Hero: For You */}
            <div className="rounded-2xl border border-primary/8 bg-gradient-to-br from-primary/6 via-card/90 to-card/60 p-5 space-y-4 hover-lift backdrop-blur-sm">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <h2 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                    <span className="text-lg">🔥</span> For You
                  </h2>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                    Vídeos trending com filtros automáticos
                  </p>
                </div>
                <Button
                  onClick={() => setConfirmDialog({ open: true, type: "foryou" })}
                  disabled={isScraping}
                  className="h-9 px-5 gap-1.5 text-xs font-semibold rounded-xl btn-glow bg-gradient-to-r from-primary via-primary/95 to-primary/80 hover:brightness-110 active:scale-[0.97] transition-all duration-200"
                >
                  {isScraping && activeTag === 'foryou' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                  Buscar {foryouQuantity}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wider">Qty</span>
                <div className="flex gap-1">
                  {[50, 100, 200, 300, 500].map(qty => {
                    const locked = false; // Credits deducted on download, not search
                    return (
                      <button
                        key={qty}
                        onClick={() => !locked && setForyouQuantity(qty)}
                        disabled={locked}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200
                          ${locked
                            ? 'bg-secondary/20 text-muted-foreground/30 cursor-not-allowed'
                            : foryouQuantity === qty
                              ? 'bg-gradient-to-r from-primary/90 to-primary/70 text-primary-foreground shadow-sm tag-glow'
                              : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/70 hover:scale-[1.06] active:scale-[0.94]'
                          }`}
                      >
                        {locked ? `${qty}` : qty}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(filters.minViews > 0 || filters.minLikes > 0 || filters.minShares > 0 || filters.minComments > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {filters.minViews > 0 && <span className="px-2 py-0.5 rounded-md bg-primary/8 text-primary/70 text-[10px] font-semibold border border-primary/10">{tiktokApi.formatNumber(filters.minViews)}+ views</span>}
                  {filters.minLikes > 0 && <span className="px-2 py-0.5 rounded-md bg-primary/8 text-primary/70 text-[10px] font-semibold border border-primary/10">{tiktokApi.formatNumber(filters.minLikes)}+ likes</span>}
                  {filters.minShares > 0 && <span className="px-2 py-0.5 rounded-md bg-primary/8 text-primary/70 text-[10px] font-semibold border border-primary/10">{tiktokApi.formatNumber(filters.minShares)}+ shares</span>}
                  {filters.minComments > 0 && <span className="px-2 py-0.5 rounded-md bg-primary/8 text-primary/70 text-[10px] font-semibold border border-primary/10">{tiktokApi.formatNumber(filters.minComments)}+ comments</span>}
                </div>
              )}
            </div>

            {/* Busca Inteligente — automática: descreve + quantidade → resultados diretos */}
            <div className="flex gap-2">
              <div className="flex-1 flex gap-2">
                <div className="relative flex-1 group">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/50 group-focus-within:text-primary/70 transition-colors duration-200" />
                  <Input
                    value={aiSearchDescription}
                    onChange={(e) => setAiSearchDescription(e.target.value)}
                    placeholder="Descreva o vídeo... ex: mulher dançando, homem malhando"
                    className="pl-9 h-9 glass rounded-xl text-sm placeholder:text-muted-foreground/35 focus:border-primary/25 input-glow transition-all duration-200"
                    disabled={isScraping}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAiSearch(); } }}
                  />
                </div>
                <div className="relative w-20">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={aiSearchQuantity || ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setAiSearchQuantity(raw === '' ? 0 : Math.min(2000, parseInt(raw)));
                    }}
                    onBlur={() => { if (!aiSearchQuantity || aiSearchQuantity < 10) setAiSearchQuantity(100); }}
                    className="h-9 w-full text-center text-sm font-bold glass rounded-xl border border-border/30 focus:border-primary/30 outline-none bg-transparent text-foreground"
                    disabled={isScraping}
                    placeholder="100"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/50">vids</span>
                </div>
                <Button
                  onClick={handleAiSearch}
                  disabled={isScraping || !aiSearchDescription.trim()}
                  size="sm"
                  className="h-9 px-4 rounded-xl btn-glow bg-gradient-to-r from-primary via-primary/95 to-primary/80 hover:brightness-110 active:scale-[0.95] transition-all duration-200 gap-1.5"
                >
                  {isScraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Wand2 className="h-3.5 w-3.5" /><span className="text-[11px] font-semibold">Buscar</span></>}
                </Button>
              </div>

              <Button
                onClick={() => setActiveTab("edicao")}
                disabled={totalFiltered === 0}
                variant="outline"
                className="h-9 gap-1.5 text-[11px] font-semibold whitespace-nowrap rounded-xl border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/30 hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 text-primary"
              >
                <Scissors className="h-3 w-3" />
                Editar
              </Button>

              <Button
                onClick={() => handleBatchDownload(totalFiltered)}
                disabled={isDownloading || totalFiltered === 0}
                variant="outline"
                className="h-9 gap-1.5 text-[11px] font-semibold whitespace-nowrap rounded-xl border-border/20 hover:border-primary/15 hover:bg-primary/5 hover:scale-[1.03] active:scale-[0.97] transition-all duration-200"
              >
                {batchProgress.active ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                {batchProgress.active ? `${batchProgress.current}/${batchProgress.total}` : `${totalFiltered}`}
              </Button>

              {videos.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive rounded-xl hover:scale-[1.06] active:scale-[0.94] hover:bg-destructive/5 transition-all duration-200"
                  onClick={() => {
                    setVideos([]);
                    videosInUIRef.current = { keys: new Set(), metas: new Set() };
                    setCurrentIndex(0);
                    setDownloadedCount(0);
                    setCacheStatus(null);
                    setActiveTag("");
                    toast({ title: "🗑️ Vídeos limpos", description: "Lista de vídeos foi resetada." });
                  }}
                  disabled={isDownloading}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Progress bar */}
            {batchProgress.active && (
              <div className="space-y-1.5">
                <div className="w-full bg-secondary/50 rounded-full h-1 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-primary to-primary/80 h-full transition-all duration-500 rounded-full glow-primary"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/70 text-center">
                  {batchProgress.current} de {batchProgress.total} vídeos
                </p>
              </div>
            )}

            {/* Status */}
            {(cacheStatus || isScraping) && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground glass-subtle rounded-xl px-3 py-2">
                {isScraping ? (
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      <span className="text-primary font-medium">{scrapeProgress || `Buscando #${activeTag}...`}</span>
                    </div>
                    {mergeLogs.length > 0 && (
                      <div className="max-h-32 overflow-y-auto space-y-0.5 mt-1 border-t border-border/30 pt-1">
                        {mergeLogs.map((log, i) => (
                          <div key={i} className="text-[10px] text-muted-foreground/80 font-mono">{log}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <span>💾 {cacheStatus}</span>
                    {activeTag && activeTag !== "mesclar" && activeTag !== "foryou" && activeTag !== "ia" && (
                      <button onClick={() => executeSingleScrape(activeTag, true, tagQuantities[activeTag] || 50)} className="ml-auto flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors hover:scale-105 active:scale-95">
                        <RefreshCw className="h-2.5 w-2.5" />
                        Atualizar
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Niche Warning */}
            {nicheWarning && nicheWarning.offTopicCount > 0 && (
              <div className="flex items-start gap-2 text-[11px] bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-3 py-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">⚠️ {nicheWarning.offTopicCount} vídeos de outros nichos detectados</span>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    Tags fora do nicho: {nicheWarning.offTopicTags.join(', ')}
                  </p>
                    <button 
                      onClick={handleDismissOffTopicVideos} 
                    className="text-[10px] underline mt-1 opacity-70 hover:opacity-100"
                  >
                    Dispensar
                  </button>
                </div>
              </div>
            )}

            {/* Hashtags */}
            <div className="rounded-2xl glass p-4 space-y-3 hover-lift">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-primary/40" />
                  <span className="text-sm font-bold text-foreground tracking-tight">Hashtags</span>
                  {selectedTags.length > 0 && !aiSuggestedTags.length && (
                    <span className="text-[9px] bg-gradient-to-r from-primary/20 to-primary/10 text-primary px-1.5 py-0.5 rounded-md font-bold tag-glow">
                      {selectedTags.length}
                    </span>
                  )}
                </div>
                {selectedTags.length > 0 && !aiSuggestedTags.length && (
                  <button onClick={() => { setSelectedTags([]); setTagQuantities({}); }} className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-all duration-200 hover:scale-[1.05]">
                    Limpar
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {Object.entries(groupedTags).map(([groupName, tags]) => (
                  <div key={groupName}>
                    <p className="text-[9px] font-bold text-muted-foreground/40 mb-1.5 uppercase tracking-[0.15em]">{groupName}</p>
                    <div className="flex flex-wrap gap-1">
                      {tags.map(({ tag, emoji, label }) => {
                        const isSelected = selectedTags.includes(tag);
                        const qty = tagQuantities[tag] || 50;
                        return (
                          <div key={tag} className="inline-flex items-center gap-0">
                            <button
                              onClick={() => toggleTagSelection(tag)}
                              disabled={isScraping}
                              className={`inline-flex items-center gap-0.5 px-2 py-[5px] text-[10px] font-semibold transition-all duration-200
                                ${isSelected
                                  ? `bg-primary/12 text-primary border border-primary/15 tag-glow scale-[1.04] ${isSelected ? 'rounded-l-lg border-r-0' : 'rounded-lg'}`
                                  : 'bg-secondary/25 text-foreground/45 border border-transparent hover:bg-secondary/50 hover:text-foreground/75 hover:scale-[1.04] hover:border-border/20 active:scale-[0.96] rounded-lg'
                                } disabled:opacity-30`}
                            >
                              {isSelected && <Check className="h-2.5 w-2.5" />}
                              <span className="text-[10px]">{emoji}</span>
                              {label}
                            </button>
                            {isSelected && (
                              <div className="inline-flex items-center bg-primary/8 border border-primary/15 border-l-0 rounded-r-lg overflow-hidden">
                                <button onClick={(e) => { e.stopPropagation(); setTagQty(tag, qty - 10); }} className="px-1 py-[5px] text-[9px] text-primary/60 hover:text-primary hover:bg-primary/10 transition-all">−</button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={qty || ''}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/\D/g, '');
                                    setTagQuantities(q => ({ ...q, [tag]: raw === '' ? 0 : Math.min(500, parseInt(raw)) }));
                                  }}
                                  onBlur={() => { if (!tagQuantities[tag] || tagQuantities[tag] < 10) setTagQty(tag, 10); }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-10 text-center text-[10px] font-bold text-primary bg-transparent outline-none"
                                />
                                <button onClick={(e) => { e.stopPropagation(); setTagQty(tag, qty + 10); }} className="px-1 py-[5px] text-[9px] text-primary/60 hover:text-primary hover:bg-primary/10 transition-all">+</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2.5 border-t border-border/10">
                <Button
                  onClick={() => {
                    if (selectedTags.length >= 1) {
                      handleSingleScrapeConfirm(selectedTags[selectedTags.length - 1]);
                    }
                  }}
                  disabled={isScraping || selectedTags.length === 0}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 gap-1.5 text-[11px] font-semibold rounded-xl border-border/20 hover:border-primary/15 hover:bg-primary/5 hover:scale-[1.03] active:scale-[0.97] transition-all duration-200"
                >
                  <Search className="h-3 w-3" />
                  Buscar 1
                </Button>
                <Button
                  onClick={handleMergeConfirm}
                  disabled={isScraping || selectedTags.length === 0}
                  size="sm"
                  className="flex-1 h-8 gap-1.5 text-[11px] font-semibold rounded-xl btn-glow bg-gradient-to-r from-primary via-primary/95 to-primary/80 hover:brightness-110 active:scale-[0.97] transition-all duration-200"
                >
                  <Shuffle className="h-3 w-3" />
                  Mesclar {selectedTags.length > 0 ? `(${selectedTags.reduce((s, t) => s + (tagQuantities[t] || 50), 0)})` : ''}
                </Button>
              </div>
            </div>

            {/* Descobrir Hashtags por Nicho */}
            <div className="rounded-2xl glass p-4 space-y-3 hover-lift">
              <div className="flex items-center gap-2">
                <Compass className="h-3.5 w-3.5 text-primary/40" />
                <span className="text-sm font-bold text-foreground tracking-tight">Descobrir Hashtags</span>
              </div>
              <p className="text-[10px] text-muted-foreground/60">Digite um nicho ou tendência para descobrir hashtags relacionadas via IA</p>
              <div className="flex gap-2">
                <Input
                  value={discoverTopic}
                  onChange={(e) => setDiscoverTopic(e.target.value)}
                  placeholder="Ex: novela antiga, trends IA, frutas IA..."
                  className="h-8 text-xs glass rounded-xl placeholder:text-muted-foreground/35"
                  disabled={isDiscovering}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleDiscover(); }}
                />
                <Button
                  onClick={handleDiscover}
                  disabled={isDiscovering || !discoverTopic.trim()}
                  size="sm"
                  className="h-8 px-3 rounded-xl btn-glow bg-gradient-to-r from-primary via-primary/95 to-primary/80 text-[11px]"
                >
                  {isDiscovering ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Compass className="h-3 w-3" /><span>Descobrir</span></>}
                </Button>
              </div>
              {discoveredTags.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-muted-foreground/40 mb-1.5 uppercase tracking-[0.15em]">🔍 Descobertas: {discoveredTags[0]?.category}</p>
                  <div className="flex flex-wrap gap-1">
                    {discoveredTags.map(({ tag, emoji, label, popularity_score }) => {
                      const isSelected = selectedTags.includes(tag);
                      const qty = tagQuantities[tag] || 50;
                      return (
                        <div key={tag} className="inline-flex items-center gap-0">
                          <button
                            onClick={() => toggleTagSelection(tag)}
                            disabled={isScraping}
                            className={`inline-flex items-center gap-0.5 px-2 py-[5px] text-[10px] font-semibold transition-all duration-200
                              ${isSelected
                                ? 'bg-primary/12 text-primary border border-primary/15 tag-glow scale-[1.04] rounded-l-lg border-r-0'
                                : 'bg-secondary/25 text-foreground/45 border border-transparent hover:bg-secondary/50 hover:text-foreground/75 hover:scale-[1.04] rounded-lg'
                              }`}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5" />}
                            <span className="text-[10px]">{emoji}</span>
                            {label}
                            {popularity_score > 70 && <Zap className="h-2 w-2 text-yellow-500" />}
                          </button>
                          {isSelected && (
                            <div className="inline-flex items-center bg-primary/8 border border-primary/15 border-l-0 rounded-r-lg overflow-hidden">
                              <button onClick={(e) => { e.stopPropagation(); setTagQty(tag, qty - 10); }} className="px-1 py-[5px] text-[9px] text-primary/60 hover:text-primary hover:bg-primary/10 transition-all">−</button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={qty || ''}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/\D/g, '');
                                  setTagQuantities(q => ({ ...q, [tag]: raw === '' ? 0 : Math.min(500, parseInt(raw)) }));
                                }}
                                onBlur={() => { if (!tagQuantities[tag] || tagQuantities[tag] < 10) setTagQty(tag, 10); }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-10 text-center text-[10px] font-bold text-primary bg-transparent outline-none"
                              />
                              <button onClick={(e) => { e.stopPropagation(); setTagQty(tag, qty + 10); }} className="px-1 py-[5px] text-[9px] text-primary/60 hover:text-primary hover:bg-primary/10 transition-all">+</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Quality & Viral Sort */}
            {videos.length > 0 && (
              <div className="flex items-center gap-3 px-1">
                <button
                  onClick={() => setSortByQuality(p => !p)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all duration-200 ${
                    sortByQuality
                      ? 'bg-primary/12 text-primary border border-primary/15'
                      : 'bg-secondary/25 text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  <Star className="h-2.5 w-2.5" />
                  Qualidade
                </button>
                {currentVideo && (
                  <div className="flex items-center gap-2 text-[10px]">
                    {tiktokApi.getViralScore(currentVideo) === 'trending' && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold border border-red-500/20">
                        <TrendingUp className="h-2.5 w-2.5" />🔥 TRENDING
                      </span>
                    )}
                    {tiktokApi.getViralScore(currentVideo) === 'hot' && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-bold border border-orange-500/20">
                        <Zap className="h-2.5 w-2.5" />⚡ HOT
                      </span>
                    )}
                    <span className="text-muted-foreground/50">
                      Qualidade: {tiktokApi.getQualityScore(currentVideo)}/100
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-2xl glass overflow-hidden">
              <button
                onClick={() => setShowFilters(p => !p)}
                className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-secondary/10 transition-all duration-200"
              >
                <div className="flex items-center gap-2">
                  <Filter className="h-3 w-3 text-muted-foreground/50" />
                  <span className="text-xs font-semibold text-foreground/60">Filtros</span>
                  {(filters.minViews > 0 || filters.minLikes > 0 || filters.minShares > 0 || filters.minComments > 0 || filters.minDuration > 0) && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
                  )}
                </div>
                <ChevronDown className={`h-3 w-3 text-muted-foreground/40 transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {showFilters && (
                <div className="px-4 pb-3 space-y-2.5 border-t border-border/10 animate-fade-in">
                  {[
                    { key: 'minViews' as const, label: 'Views', icon: Eye, presets: [0, 10000, 50000, 100000, 500000, 1000000] },
                    { key: 'minLikes' as const, label: 'Likes', icon: Heart, presets: [0, 1000, 5000, 10000, 50000, 100000] },
                    { key: 'minShares' as const, label: 'Shares', icon: Share2, presets: [0, 100, 500, 1000, 5000, 10000] },
                    { key: 'minComments' as const, label: 'Comments', icon: MessageCircle, presets: [0, 100, 500, 1000, 5000] },
                  ].map(({ key, label, icon: Icon, presets }) => (
                    <div key={key} className="space-y-1 pt-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                        <Icon className="h-2.5 w-2.5" />
                        <span className="font-medium">{label}</span>
                        {filters[key] > 0 && <span className="text-primary font-bold ml-auto">{tiktokApi.formatNumber(filters[key])}+</span>}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {presets.map(val => (
                          <button
                            key={val}
                            onClick={() => { setFilters(prev => ({ ...prev, [key]: val })); setCurrentIndex(0); }}
                            className={`px-2 py-[3px] rounded-lg text-[10px] font-semibold transition-all duration-200
                              ${filters[key] === val
                                ? 'bg-primary/10 text-primary border border-primary/12 tag-glow'
                                : 'bg-secondary/25 text-foreground/35 border border-transparent hover:bg-secondary/50 hover:text-foreground/60 hover:scale-[1.06] active:scale-[0.94]'
                              }`}
                          >
                            {val === 0 ? 'Todos' : tiktokApi.formatNumber(val) + '+'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* Duration filter */}
                  <div className="space-y-1 pt-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                      <Film className="h-2.5 w-2.5" />
                      <span className="font-medium">Duração mín.</span>
                      {filters.minDuration > 0 && <span className="text-primary font-bold ml-auto">{filters.minDuration}s+</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[0, 5, 10, 15, 20, 30].map(val => (
                        <button
                          key={val}
                          onClick={() => { setFilters(prev => ({ ...prev, minDuration: val })); setCurrentIndex(0); }}
                          className={`px-2 py-[3px] rounded-lg text-[10px] font-semibold transition-all duration-200
                            ${filters.minDuration === val
                              ? 'bg-primary/10 text-primary border border-primary/12 tag-glow'
                              : 'bg-secondary/25 text-foreground/35 border border-transparent hover:bg-secondary/50 hover:text-foreground/60 hover:scale-[1.06] active:scale-[0.94]'
                            }`}
                        >
                          {val === 0 ? 'Todos' : `${val}s+`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => { setFilters({ minViews: 0, minLikes: 0, minShares: 0, minComments: 0, minDuration: 0 }); setCurrentIndex(0); }}
                    className="text-[10px] text-muted-foreground/50 hover:text-foreground font-medium transition-all duration-200 pt-1 hover:scale-[1.05]"
                  >
                    Limpar filtros
                  </button>
                </div>
              )}
            </div>

            {/* Stats bar */}
            {downloadedCount > 0 && (
              <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/40 py-1">
                <Download className="h-3 w-3" />
                {downloadedCount} baixados • {totalFiltered} disponíveis
              </div>
            )}
            </>
            )}
          </div>
        </div>
      </main>

      {/* Bottom shortcuts */}
      {currentVideo && (
        <footer className="border-t border-border/10 px-6 py-2 flex-shrink-0 glass-subtle">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-6 text-[10px] text-muted-foreground/40">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded-md bg-secondary/30 text-foreground/30 font-mono text-[9px] border border-border/15">↑↓</kbd>
              Navegar
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded-md bg-secondary/30 text-foreground/30 font-mono text-[9px] border border-border/15">Espaço</kbd>
              Play/Pause
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded-md bg-secondary/30 text-foreground/30 font-mono text-[9px] border border-border/15">M</kbd>
              Mudo
            </span>
          </div>
        </footer>
      )}
    </div>
  );
};

export default Index;
