# SYSTEM_CONTEXT.md - CriativosIA

> Documento completo para onboarding de IA. Atualizado em 2026-04-23.

---

## 1. O QUE E O CRIATIVOSAI

**Produto**: Plataforma web de curadoria e edicao em massa de videos virais do TikTok para o mercado brasileiro.

**Publico-alvo**: Editores de video e criadores de conteudo que precisam encontrar, filtrar e editar videos virais do TikTok em escala, adicionando efeitos (popup PIX, confetti dourado, audio customizado) para repostar em outras plataformas.

**Proposta de valor**:
- Busca automatizada de videos virais brasileiros por hashtag (40+ categorias)
- Filtragem inteligente por nicho usando IA (Google Gemini)
- Download em lote sem marca d'agua (batch ZIP)
- Editor de video com efeitos visuais (popup, overlay, particulas)
- Processamento em lote (browser FFmpeg ou servidor Railway)
- Deduplicacao automatica (nao mostra video ja visto/usado)
- Sistema de creditos por plano (free ate unlimited)

**Status**: MVP em producao, usado por 2+ editores reais.

---

## 2. STACK COMPLETA

### Frontend
- **Framework**: React 18.3.1 + TypeScript 5.8.3
- **Bundler**: Vite 5.4.19 com SWC (plugin @vitejs/plugin-react-swc)
- **UI**: Tailwind CSS 3.4.17 + shadcn/ui (50+ componentes Radix UI)
- **Roteamento**: React Router DOM 6.30.1
- **State**: React Context (Auth) + TanStack React Query 5.83.0 + localStorage
- **Forms**: React Hook Form 7.61.1 + Zod 3.25.76
- **Video local**: FFmpeg WASM 0.12.15 (@ffmpeg/ffmpeg, @ffmpeg/core, @ffmpeg/util)
- **Downloads**: JSZip 3.10.1 + file-saver 2.0.5
- **Graficos**: Recharts 2.15.4
- **Icones**: Lucide React
- **Testes**: Vitest 3.2.4 + @testing-library/react 16.0.0 + Playwright 1.57.0
- **Deploy**: Netlify (auto-deploy on push) - playful-custard-80e5c5.netlify.app

### Backend
- **Supabase Cloud** (projeto `fsgvvihcabhnkwandjic`):
  - Auth (email/password com emails ficticios @viralapp.local)
  - PostgreSQL (banco principal)
  - Edge Functions (20 funcoes Deno, todas com verify_jwt=false)
  - Storage (bucket `editor-assets` para popups/audios)
  - Realtime (tabela editor_activity)
- **Cron Jobs**: pg_cron + pg_net para agendamento

### Servidor de Video (Railway)
- **App**: Express.js (Node 20+)
- **Repo**: github.com/danielvormesso-ship-it/ffmpeg-api
- **URL**: https://ffmpeg-api-production-b226.up.railway.app
- **FFmpeg**: Processamento server-side (6 jobs simultaneos, 2 threads cada)
- **TTS**: Edge TTS para portugues brasileiro (16 vozes)
- **Auth**: API Key simples via header X-API-Key

### APIs Externas
| API | Uso | Auth |
|-----|-----|------|
| TikWM (tikwm.com) | Scraping de videos TikTok + download sem marca d'agua | Publica |
| Google Gemini 2.0 Flash | Filtragem por nicho, sugestao de hashtags, validacao de thumbnails | 3 API keys rotativas |
| Firecrawl | Scraping de sites agregadores (tokcount, tokboard) | API Key |
| Creatomate | Renderizacao de video com overlays (alternativo) | API Key |
| tikcdn.io | Fallback para download de videos | Publica |
| Hotmart | Webhooks de pagamento (compra, cancelamento, reembolso) | Webhook Secret (hottok) |

---

## 3. ARQUITETURA DO SISTEMA

### Diagrama de Conexoes

```
[Usuario/Editor]
      |
      v
[Frontend React - Netlify]
      |
      +---> [Supabase Auth] (login/signup)
      +---> [Supabase DB] (profiles, videos, configs, templates)
      +---> [Supabase Storage] (editor-assets bucket)
      +---> [Edge Functions] (scraping, AI, pool, webhooks)
      |         |
      |         +---> [TikWM API] (scrape + download)
      |         +---> [Gemini API] (filtro nicho + hashtags)
      |         +---> [Firecrawl API] (scraping agregadores)
      |         +---> [Creatomate API] (render video)
      |
      +---> [FFmpeg WASM] (processamento local no browser)
      +---> [Railway FFmpeg API] (processamento server-side)
      
[Hotmart] --webhook--> [Edge Function hotmart-webhook] ---> [Supabase DB]

[pg_cron] ---> [pool-scheduler] ---> [pool-refill] ---> [TikWM + Gemini]
           |-> [pool-refresh-urls] ---> [TikWM]
```

### Fluxo Completo do Usuario

1. **Registro**: Editor cria conta (username + senha) -> email ficticio `{username}@viralapp.local` -> profile criado automaticamente via trigger `handle_new_user` -> role `editor` atribuido -> status `approved=false`
2. **Aprovacao**: Admin acessa `/admin` -> aprova editor -> `approved=true`
3. **Plano pendente**: Se o editor comprou via Hotmart antes de se registrar, o webhook salva em `pending_plans`. Ao criar a conta, o trigger `activate_pending_plan` aplica o plano automaticamente.
4. **Busca de videos**: Editor busca por hashtag -> `pool-serve` retorna videos do pool pre-carregado -> videos filtrados por nicho, BR score, deduplicados (seen_videos/used_videos)
5. **Download**: Editor seleciona videos -> download em lote via `download-tiktok-batch` (TikWM) -> ZIP gerado no browser
6. **Edicao**: Editor configura popup (imagem/video), audio, timing, efeitos -> processa em lote via FFmpeg WASM (local) ou Railway API (servidor)
7. **Templates**: Editor salva/carrega configuracoes de edicao como templates reutilizaveis
8. **Creditos**: Cada download consome creditos -> quando esgota, mostra UpgradeModal com links Hotmart

---

## 4. SISTEMA DE POOL

### O que e
O pool (`hashtag_pool`) e um estoque pre-carregado de videos virais brasileiros, organizado por grupos de hashtags (40+ categorias). Ele garante que o usuario receba videos instantaneamente sem esperar scraping em tempo real.

### Tabelas envolvidas
- `hashtag_pool` - Estoque principal de videos
- `pool_cursors` - Controle de paginacao por sub-hashtag
- `editor_hashtag_stats` - Estatisticas de demanda por grupo

### Grupos de hashtags (presets)
40+ grupos como: `pegadinha`, `humor`, `dancinha`, `viral_brasil`, `moda`, `beleza`, `fitness`, `receitas`, `ia_novela`, `casa`, `dicas`, `pets`, `motivacao`, `relacionamento`, `curiosidades`, etc. Cada grupo tem sub-hashtags especificas.

### pool-refill (Edge Function)
**O que faz**: Reabastecer o pool com videos frescos para um grupo de hashtags especifico.

**Estrategia de 3 camadas**:
1. **Layer 1**: Videos populares (sort_type=1, sem cursor) - pega os mais virais
2. **Layer 2**: Videos recentes (sem sort_type, sem cursor) - pega os mais novos
3. **Layer 3**: Paginacao profunda com cursor (so se <20 novos das layers 1-2) - explora mais fundo

**Pipeline**:
1. Chama `scrape-tiktok-apify` (modo LIGHT) para buscar videos no TikWM
2. Aplica filtro BR (detecta conteudo estrangeiro via caracteres, palavras, hashtags)
3. Calcula `br_score` (1-3 baseado em indicadores de portugues)
4. Chama `filter-by-niche` para filtragem por IA (Gemini)
5. Faz upsert no `hashtag_pool` com flag `niche_approved`
6. Atualiza `pool_cursors` para proxima paginacao

### pool-serve (Edge Function)
**O que faz**: Servir videos do pool para o usuario.

**Logica**:
1. Busca IDs de videos ja vistos/usados pelo usuario (ultimos 3 dias)
2. Consulta `hashtag_pool` filtrando: `niche_approved=true`, URL fresca (<8h), ordenado por `br_score` DESC + `views` DESC
3. Remove videos ja vistos/usados
4. Marca videos servidos como `seen`
5. Atualiza `editor_hashtag_stats` (search_count, avg_quantity, hit_rate)
6. Retorna videos + metadados de disponibilidade

### pool-scheduler (Edge Function)
**O que faz**: Orquestrar reabastecimento automatico baseado em demanda.

**Logica**:
1. **Limpeza diaria**: Deleta videos com >7 dias no pool
2. **Reset de cursors**: Reseta cursors marcados como `exhausted`
3. **Sistema adaptativo de tiers** (baseado em buscas dos ultimos 7 dias):
   - Alta demanda (>30 buscas): target 2000, threshold 1000
   - Media (16-30): target 1600, threshold 1000
   - Baixa (<16): target 1200, threshold 1000
4. **Threshold viral**: Checa se ha 200+ videos com 1M+ views por grupo
5. Dispara `pool-refill` para grupos abaixo do threshold (HTTP async, timeout 5s)

**Cron**: A cada 5 horas (`0 */5 * * *`)

### pool-refresh-urls (Edge Function)
**O que faz**: Renovar URLs de video que expiraram (TikWM URLs duram ~4-8h).

**Logica**:
1. Chama RPC `pool_stale_per_group` para pegar ate 60 videos com URL velha (>4h), equilibrado por grupo (2 por grupo)
2. **Processamento sequencial**: 1 request a cada 1.05s (respeita rate limit do TikWM)
3. Para cada video:
   - Sucesso: atualiza `video_url` e `fetched_at`
   - Falha na 1a tentativa: marca para retry (volta fetched_at para 30min atras)
   - Falha na 2a tentativa: deleta o video do pool
4. Retorna contadores: refreshed, retried, deleted, errors

**Cron**: A cada 5 minutos (`*/5 * * * *`)

### Filtros BR e de Nicho
**Filtro BR** (em pool-refill e scrape-tiktok-apify):
- Detecta caracteres portugueses (acentos: a, e, i, o, u com til, agudo, circunflexo)
- Detecta palavras-chave BR (voce, entao, porque, brasil, kkk, etc.)
- Detecta hashtags BR (#brasil, #fyp, #humor)
- Rejeita conteudo com caracteres arabes, coreanos, japoneses, tailandeses
- Calcula `br_score` de 1 a 3

**Filtro de Nicho** (filter-by-niche via Gemini):
- Cada nicho tem categorias aprovadas e `REJECT_MAP` com conteudo a excluir
- Batches de 60 videos, ate 3 batches paralelos
- Estrategia: "preferir falso negativo a falso positivo" (melhor rejeitar bom do que aceitar ruim)
- Auto-aprova videos com titulo vazio/generico (sem sinal para IA julgar)

### Como URLs expiram e sao renovadas
- URLs do TikWM (CDN ByteDance) expiram em ~4-8 horas
- `pool-refresh-urls` roda a cada 5min para renovar URLs com >4h
- `refresh-video-url` permite refresh on-demand durante playback
- Videos com URL expirada nao sao servidos pelo `pool-serve` (filtro `fetched_at > now() - 8h`)
- Apos 2 falhas de refresh, o video e deletado do pool

---

## 5. SISTEMA DE CREDITOS E PLANOS

### Planos

| Plano | Creditos | Periodo | Cor (Tailwind) |
|-------|----------|---------|----------------|
| free | 30 | total (lifetime) | gray |
| starter | 300 | mes | blue |
| pro | 1000 | mes | purple |
| agency | 8000 | mes | amber |
| unlimited | Infinito | - | emerald |

### Precos (Hotmart)
- Starter: R$97/mes
- Pro: R$197/mes
- Agency: R$497/mes

### RPCs Atomicas

**`deduct_credits(p_user_id UUID, p_amount INT)`**:
- Incrementa `credits_used` por `p_amount`
- Validacoes: `p_amount > 0`, `p_user_id = auth.uid()` (usuario so pode deduzir seus proprios creditos)
- Tipo: SECURITY DEFINER (bypassa RLS)

**`reset_monthly_credits(p_user_id UUID)`**:
- Reseta `credits_used` para 0
- Define `credits_reset_at` para `now() + 30 dias`
- Validacao: `p_user_id = auth.uid()`
- Tipo: SECURITY DEFINER

### Logica no Frontend (useCredits hook)
- `canUseCredits()`: Verifica se usuario pode prosseguir. Se `credits_reset_at` ja passou, faz reset automatico via RPC.
- `deductCredits(amount)`: Decrementa apos download bem-sucedido.
- Para plano `unlimited`: sempre retorna true, nunca deduz.
- Para plano `free`: creditos sao lifetime (30 total, sem reset mensal).
- Quando creditos esgotam: exibe `UpgradeModal` com links para Hotmart.

### RLS Policies relevantes
- `profiles`: usuarios leem todos, atualizam apenas o proprio. Admins atualizam qualquer um.
- `user_roles`: usuarios leem proprio role. Admins leem/inserem qualquer um.
- `hashtag_pool`: apenas service_role tem acesso (edge functions).
- `webhook_logs`: service_role full access + admins podem ler.
- `pending_plans`: apenas service_role.

---

## 6. INTEGRACAO HOTMART

### Webhook Endpoint
**Edge Function**: `hotmart-webhook`
**URL**: `https://fsgvvihcabhnkwandjic.supabase.co/functions/v1/hotmart-webhook`
**Autenticacao**: Header `hottok` deve conter o `HOTMART_WEBHOOK_SECRET`

### PRODUCT_ID_MAP
```
7565314 -> starter
7565350 -> pro
7565365 -> agency
```

### Eventos Tratados

| Evento | Acao |
|--------|------|
| `PURCHASE_APPROVED` | Se usuario existe: atualiza plano + reseta creditos. Se nao existe: cria `pending_plan` para ativar no registro. |
| `PURCHASE_CANCELED` | Downgrade para `free` (so se product_id bate com plano atual) |
| `PURCHASE_REFUNDED` | Downgrade para `free` (so se product_id bate com plano atual) |
| `PURCHASE_SUBSCRIPTION_CANCELING` | Apenas loga (mantem plano ate fim do periodo) |

### Tabelas

**`pending_plans`**:
- Armazena compras de usuarios que ainda nao se registraram
- Campos: email, plan, transaction_id, product_id
- Unique por email
- Trigger `activate_pending_plan` na tabela `profiles` ativa o plano ao criar conta

**`webhook_logs`**:
- Log de auditoria de todos os eventos recebidos
- Campos: event, email, status (ok/error/ignored), detail, ip, created_at
- Admins podem visualizar no AdminPanel

### Fluxo de Compra
1. Usuario compra plano no Hotmart
2. Hotmart envia webhook `PURCHASE_APPROVED`
3. Edge function identifica produto -> plano
4. Se usuario ja existe (busca por email no profiles): atualiza `plan` e reseta `credits_used`
5. Se usuario nao existe: salva em `pending_plans`
6. Quando usuario se registra: trigger `activate_pending_plan` busca em `pending_plans` pelo email e aplica o plano

### Fluxo de Cancelamento
1. Hotmart envia `PURCHASE_CANCELED` ou `PURCHASE_REFUNDED`
2. Edge function verifica se o product_id corresponde ao plano atual do usuario
3. Se sim: downgrade para `free`
4. Se nao (produto diferente do plano atual): ignora (evita downgrades incorretos)

### Fluxo de Upgrade
1. Usuario compra plano superior no Hotmart
2. Webhook `PURCHASE_APPROVED` chega
3. Plano e atualizado diretamente (creditos resetados)
4. O plano anterior e sobrescrito

---

## 7. SISTEMA DE EDICAO

### Visao Geral
O editor permite adicionar efeitos visuais (popup, overlay, particulas) e audio a videos em lote. Possui dois backends de processamento:

### Railway FFmpeg API
**URL**: https://ffmpeg-api-production-b226.up.railway.app
**Capacidade**: 6 jobs simultaneos, 2 threads por job
**Timeout**: 8 minutos por job, 30 minutos TTL

**Endpoints**:
| Endpoint | Metodo | Funcao |
|----------|--------|--------|
| `/health` | GET | Health check com contagem de jobs |
| `/api/upload-assets` | POST | Upload de popup, audio, musica |
| `/api/probe-codec` | POST | Verificar codec do video |
| `/api/process-async` | POST | Submeter job assincrono (retorna jobId) |
| `/api/job/:jobId` | GET | Status do job (progress, fileSize) |
| `/api/job/:jobId/download` | GET | Download do video processado |
| `/api/process` | POST | Processamento sincrono (legado) |
| `/api/tts/voices` | GET | Listar vozes TTS (portugues BR) |
| `/api/tts/generate` | POST | Gerar audio via edge-tts |
| `/api/session/:sessionId` | DELETE | Limpar assets da sessao |

**Pipeline de processamento**:
1. Download do video fonte (4 retries, 90s timeout)
2. Probe com FFprobe (detecta codec/resolucao)
3. Pre-normalizacao (720x1280, H.264, yuv420p)
4. Aplicacao de efeitos (dark overlay, fireworks, particles)
5. Overlay do popup (imagem ou video, com posicao/rotacao customizada)
6. Mixagem de audio (video original + audio popup + musica de fundo)
7. Encode final (libx264, ultrafast, crf=26, AAC 128k)

### Efeitos Disponiveis
| Efeito | Descricao |
|--------|-----------|
| darkOverlay | Escurece o video durante o popup (intensidade customizavel 0-100) |
| fireworks | 8 fogos de artificio animados com faiscas e trail |
| particles | 28 particulas flutuantes (estrelas + pontos) |
| confetti | Confetti dourado (server-side) |
| pixNotifications | Animacao de notificacao PIX (server-side) |
| shootingStars | Estrelas cadentes (server-side) |

### Fluxo de Edicao Batch
1. Editor seleciona videos para editar
2. Configura popup (arquivo, posicao via drag-drop, timing, opacidade)
3. Configura audio (popup audio, musica de fundo, volumes)
4. Configura efeitos visuais
5. Opcional: ativa rotacao de popups (troca popup a cada N videos)
6. Inicia processamento batch:
   - **Local**: FFmpegWorkerPool distribui entre workers paralelos
   - **Server**: Upload de assets -> jobs async -> polling de status
7. Download dos resultados (individual ou ZIP)

### Protecao contra URLs Expiradas
- `pool-serve` so retorna videos com URL fresca (<8h)
- `pool-refresh-urls` roda a cada 2h para renovar URLs
- `refresh-video-url` permite refresh on-demand
- No editor, se URL expirar durante processamento: retry automatico com fallback modes

### Templates
- Salvos na tabela `editor_templates` (por usuario)
- Incluem: configuracao completa do editor + arquivos (popup, audio)
- Arquivos salvos no Supabase Storage (bucket `editor-assets`)
- CRUD completo: salvar, carregar, deletar

---

## 8. CRON JOBS

### pool-scheduler
- **Cron**: `0 */5 * * *` (a cada 5 horas)
- **Nome no pg_cron**: `pool-scheduler-5h`
- **O que faz**: Verifica estoque do pool por grupo, dispara `pool-refill` para grupos abaixo do threshold
- **URL chamada**: `https://fsgvvihcabhnkwandjic.supabase.co/functions/v1/pool-scheduler`

### pool-refresh-urls
- **Cron**: `*/5 * * * *` (a cada 5 minutos)
- **Nome no pg_cron**: `pool-refresh-urls-5min`
- **O que faz**: Renova URLs expiradas (>4h) no pool, processando 60 videos sequencialmente (1 req/1.05s)
- **URL chamada**: `https://fsgvvihcabhnkwandjic.supabase.co/functions/v1/pool-refresh-urls`

### Como Pausar
```sql
-- Pausar scheduler
SELECT cron.unschedule('pool-scheduler-5h');

-- Pausar refresh
SELECT cron.unschedule('pool-refresh-urls-5min');
```

### Como Reativar
```sql
-- Reativar scheduler (a cada 5h)
SELECT cron.schedule(
  'pool-scheduler-5h',
  '0 */5 * * *',
  $$SELECT net.http_post(
    url := 'https://fsgvvihcabhnkwandjic.supabase.co/functions/v1/pool-scheduler',
    headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb
  )$$
);

-- Reativar refresh (a cada 5min)
SELECT cron.schedule(
  'pool-refresh-urls-5min',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://fsgvvihcabhnkwandjic.supabase.co/functions/v1/pool-refresh-urls',
    headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb
  )$$
);
```

### Como Verificar Status
```sql
SELECT jobid, schedule, command, jobname FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

---

## 9. EDGE FUNCTIONS

| Funcao | Descricao |
|--------|-----------|
| `pool-serve` | Serve videos do pool para usuarios com deduplicacao e stats |
| `pool-refill` | Reabastece pool com videos frescos (scrape + filtro BR + filtro nicho) |
| `pool-scheduler` | Orquestra reabastecimento automatico baseado em demanda |
| `pool-refresh-urls` | Renova URLs expiradas no pool (sequencial, 1 req/1.05s, max 60 videos) |
| `refresh-video-url` | Refresh on-demand de URL de um unico video |
| `scrape-tiktok-apify` | Scraping de hashtags TikTok via TikWM com deteccao BR |
| `scrape-tiktok-foryou` | Scraping do FYP brasileiro com 17 keywords rotativas |
| `scrape-tiktok` | Scraping via agregadores (tokcount, tokboard) com Firecrawl |
| `scrape-kwai` | Scraping de videos Kwai via Firecrawl |
| `download-tiktok` | Download de video unico (TikWM + fallback tikcdn.io) |
| `download-tiktok-batch` | Download em lote (ate 50 videos, 8 paralelos) |
| `filter-by-niche` | Filtragem de videos por nicho via Gemini (com REJECT_MAP) |
| `validate-thumbnails` | Validacao de thumbnails via Gemini Vision |
| `ai-hashtag-suggest` | Sugestao de hashtags para descricao via Gemini |
| `discover-hashtags` | Descoberta de hashtags trending com cache 24h |
| `save-seen-videos` | Salvar videos vistos/usados em lote (TTL 3 dias) |
| `proxy-video` | Proxy CORS para streaming de video |
| `process-video-creatomate` | Renderizacao de video via Creatomate API |
| `seed-admin` | Desabilitada (retorna 403) |
| `hotmart-webhook` | Webhook Hotmart para compras, cancelamentos, reembolsos |

**Nota**: Todas as edge functions tem `verify_jwt = false` no config.toml.

---

## 10. BANCO DE DADOS

### Tabelas Principais

| Tabela | Funcao | RLS |
|--------|--------|-----|
| `profiles` | Perfis de usuario (username, display_name, approved, plan, credits_used, credits_reset_at, plan_expires_at, email, phone) | Users leem todos, atualizam proprio. Admins atualizam qualquer. |
| `user_roles` | Roles (admin/editor) por usuario | Users leem proprio. Admins leem/inserem. |
| `hashtag_pool` | Estoque pre-carregado de videos por grupo de hashtag | Apenas service_role |
| `pool_cursors` | Controle de paginacao por sub-hashtag (cursor, exhausted) | Apenas service_role |
| `editor_hashtag_stats` | Estatisticas de busca por usuario/grupo (search_count, hit_rate) | Users leem proprio. service_role full. |
| `tiktok_videos` | Videos TikTok salvos por usuario (multi-tenant via owner_user_id) | CRUD apenas para proprios videos |
| `seen_videos` | Videos ja exibidos ao usuario (TTL 3 dias) | Users leem/inserem proprio. service_role full. |
| `used_videos` | Videos ja baixados/editados (TTL 3 dias) | Users leem/inserem proprio. service_role full. |
| `editor_activity` | Log de acoes do editor (search, download, filter, merge) | Users leem/inserem proprio. Admins leem todos. |
| `editor_configs` | Configuracoes do editor por usuario (JSON) | CRUD apenas para proprio |
| `editor_templates` | Templates de edicao salvos (config + arquivos) | CRUD apenas para proprio |
| `hashtag_cache` | Cache de scraping por hashtag (last_scraped_at, videos_found) | Leitura/escrita publica |
| `trending_hashtags` | Hashtags trending descobertas via IA (tag, category, popularity_score) | Leitura/escrita para autenticados |
| `pending_plans` | Planos comprados via Hotmart aguardando registro do usuario | Apenas service_role |
| `webhook_logs` | Log de eventos Hotmart (event, email, status, detail, ip) | service_role full. Admins leem. |
| `kwai_videos` | Videos Kwai (legado) | Leitura/escrita publica |
| `video_assignments` | Atribuicoes de video a editores (legado) | Leitura/insercao publica |

### Triggers Importantes

| Trigger | Tabela | Funcao |
|---------|--------|--------|
| `on_auth_user_created` | auth.users (AFTER INSERT) | `handle_new_user()` - Cria profile + role editor automaticamente |
| `trg_activate_pending_plan` | profiles (AFTER INSERT) | `activate_pending_plan()` - Aplica plano pendente do Hotmart |
| `update_kwai_videos_updated_at` | kwai_videos (BEFORE UPDATE) | `update_updated_at_column()` - Atualiza timestamp |

### Funcoes RPC

| Funcao | Tipo | Descricao |
|--------|------|-----------|
| `deduct_credits(p_user_id, p_amount)` | SECURITY DEFINER | Incrementa credits_used atomicamente (valida uid e amount>0) |
| `reset_monthly_credits(p_user_id)` | SECURITY DEFINER | Reseta credits_used=0, credits_reset_at=now()+30d |
| `has_role(_user_id, _role)` | STABLE, SECURITY DEFINER | Verifica se usuario tem role especifico |
| `handle_new_user()` | SECURITY DEFINER | Trigger: cria profile a partir de auth.users metadata |
| `activate_pending_plan()` | SECURITY DEFINER | Trigger: ativa plano de pending_plans no registro |
| `auto_approve_admin()` | SECURITY DEFINER | Trigger: auto-aprova profiles com role admin |

### Extensoes
- `pg_cron` - Agendamento de jobs
- `pg_net` - Chamadas HTTP a partir de cron jobs

### Storage
- **Bucket**: `editor-assets` (publico)
  - Upload: usuarios autenticados
  - Leitura: publica
  - Delete: usuarios autenticados (apenas propria pasta = uid)

---

## 11. USUARIOS E ROLES

### Roles

| Role | Permissoes |
|------|-----------|
| `admin` | Aprovar/revogar editores, atribuir planos, resetar historico, ver atividade de todos, ver webhook logs, adicionar creditos |
| `editor` | Buscar videos, baixar, editar, salvar templates, ver propria atividade |

### Tipo de usuarios por plano

| Tipo | Descricao |
|------|-----------|
| `free` | 30 creditos lifetime, sem reset mensal |
| `starter` | 300 creditos/mes, reset automatico |
| `pro` | 1000 creditos/mes, reset automatico |
| `agency` | 8000 creditos/mes, reset automatico |
| `unlimited` | Sem limite de creditos (atribuido manualmente pelo admin) |

### Como aprovar usuarios
1. Admin acessa `/admin`
2. Tab "Editors" mostra lista de editores pendentes (`approved=false`)
3. Clica no botao de aprovar -> atualiza `profiles.approved = true`
4. Editor pode agora acessar a plataforma

### Fluxo de registro
1. Usuario preenche: username, email, telefone, senha
2. Supabase Auth cria usuario com email ficticio `{username}@viralapp.local`
3. Trigger `handle_new_user` cria profile (username, display_name do metadata)
4. Trigger `handle_new_user` cria role `editor`
5. Trigger `activate_pending_plan` verifica se ha plano pendente pelo email
6. Usuario e redirecionado para `PendingApproval` ate admin aprovar

---

## 12. COMANDOS UTEIS

### Iniciar Desenvolvimento (PowerShell/Terminal)
```bash
cd viraladr
npm install
npm run dev
# Abre em http://localhost:8080
```

### Queries de Status do Pool
```sql
-- Total de videos no pool por grupo
SELECT hashtag_group, COUNT(*) as total,
  COUNT(*) FILTER (WHERE niche_approved = true) as approved,
  COUNT(*) FILTER (WHERE fetched_at > now() - interval '8 hours') as fresh
FROM hashtag_pool
GROUP BY hashtag_group
ORDER BY total DESC;

-- Videos com URL expirada
SELECT COUNT(*) FROM hashtag_pool
WHERE niche_approved = true
AND fetched_at < now() - interval '8 hours';

-- Pool health geral
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE niche_approved = true) as approved,
  COUNT(*) FILTER (WHERE niche_approved = true AND fetched_at > now() - interval '8 hours') as servable
FROM hashtag_pool;
```

### Como ver cron jobs ativos
```sql
SELECT jobid, jobname, schedule, command FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

### Como ver clientes pagantes
```sql
-- Clientes com plano pago
SELECT username, email, plan, credits_used, credits_reset_at, plan_expires_at
FROM profiles
WHERE plan != 'free'
ORDER BY plan, username;

-- Planos pendentes (comprou mas nao registrou)
SELECT * FROM pending_plans ORDER BY created_at DESC;

-- Ultimos webhooks
SELECT event, email, status, detail, created_at
FROM webhook_logs
ORDER BY created_at DESC LIMIT 20;
```

### Como adicionar creditos manualmente
```sql
-- Resetar creditos de um usuario
UPDATE profiles
SET credits_used = 0, credits_reset_at = now() + interval '30 days'
WHERE username = 'NOME_DO_USUARIO';

-- Definir plano manualmente
UPDATE profiles
SET plan = 'pro', credits_used = 0, credits_reset_at = now() + interval '30 days'
WHERE username = 'NOME_DO_USUARIO';
```

### Como limpar historico de videos vistos/usados
```sql
-- Limpar seen_videos de um usuario
DELETE FROM seen_videos WHERE user_id = 'UUID_DO_USUARIO';

-- Limpar used_videos de um usuario
DELETE FROM used_videos WHERE user_id = 'UUID_DO_USUARIO';
```

### Como deletar usuarios de teste
```sql
-- Primeiro deletar de auth.users (precisa do email de profiles)
DELETE FROM auth.users WHERE email IN (
  SELECT email FROM profiles WHERE username IN ('user1', 'user2')
);

-- Depois deletar de profiles
DELETE FROM profiles WHERE username IN ('user1', 'user2');
```

### Railway FFmpeg API
```bash
# Health check
curl https://ffmpeg-api-production-b226.up.railway.app/health

# Vozes TTS disponiveis
curl https://ffmpeg-api-production-b226.up.railway.app/api/tts/voices
```

---

## 13. PENDENCIAS E PROXIMOS PASSOS

### Bugs Conhecidos
1. **Busca lenta**: ~1min17s para 150 videos. `fetchCandidates` deveria usar `Promise.all` com 5 chamadas paralelas
2. **Videos duplicados**: Editor `igor` teve 64 duplicados em 301 videos. Sistema de `seen_videos` pode nao estar salvando corretamente para todos os editores
3. **Auto-logout**: Mecanismo de logout automatico nao funciona de forma confiavel
4. **Erro de delete**: `undefined` video IDs apos download
5. **Console.log de debug**: Varios `console.log` espalhados pelo codigo que precisam ser removidos

### Debito Tecnico
- **Arquivos muito grandes**: `Index.tsx` (2818 linhas), `VideoEditorTab.tsx` (2429 linhas) - precisam ser refatorados em componentes menores
- **Seguranca relaxada**: Todas as Edge Functions com `verify_jwt = false`
- **Emails ficticios**: Sistema usa `@viralapp.local` em vez de emails reais
- **Sem testes automatizados significativos**: Apenas testes basicos configurados
- **Sem CI/CD**: Alem do auto-deploy Netlify, nao ha pipeline de CI

### Funcionalidades Pendentes
- Implementar busca paralela com `Promise.all` (5 requests simultaneos)
- Corrigir deduplicacao de `seen_videos` para todos os editores
- Limpeza de console.log
- Implementar logout automatico confiavel
- Adicionar mais testes (unitarios e e2e)
- Considerar implementar JWT verification nas edge functions
- Dashboard de analytics mais detalhado para admin

---

## ESTRUTURA DE ARQUIVOS

```
viraladr/
├── src/
│   ├── App.tsx                          # Router principal (3 rotas)
│   ├── main.tsx                         # Bootstrap React
│   ├── pages/
│   │   ├── Index.tsx                    # Dashboard principal (busca + editor)
│   │   ├── Login.tsx                    # Registro/login de editores
│   │   ├── AdminPanel.tsx               # Painel admin (editores, atividade, assinaturas)
│   │   ├── PendingApproval.tsx          # Tela de espera de aprovacao
│   │   └── NotFound.tsx                 # 404
│   ├── components/
│   │   ├── VideoEditorTab.tsx           # Editor completo de video (2429 linhas)
│   │   ├── VideoCard.tsx                # Card de video individual
│   │   ├── EffectsPreview.tsx           # Preview de efeitos visuais
│   │   ├── PopupPreviewEditor.tsx       # Editor drag-drop de popup (9:16)
│   │   ├── TemplateManager.tsx          # CRUD de templates
│   │   ├── UpgradeModal.tsx             # Modal de upgrade (creditos esgotados)
│   │   ├── WelcomeModal.tsx             # Modal de boas-vindas (selecao de plano)
│   │   ├── StatsCard.tsx                # Card de estatisticas
│   │   ├── NavLink.tsx                  # Link de navegacao
│   │   └── ui/                          # 50+ componentes shadcn/ui
│   ├── contexts/
│   │   └── AuthContext.tsx              # Context de autenticacao (session, profile, role)
│   ├── hooks/
│   │   ├── useCredits.ts               # Hook de creditos (canUse, deduct, reset)
│   │   ├── use-toast.ts                # Hook de notificacoes
│   │   └── use-mobile.tsx              # Deteccao de mobile
│   ├── lib/
│   │   ├── plans.ts                     # Definicao de planos e limites
│   │   ├── activityTracker.ts           # Log de acoes do editor
│   │   ├── videoProcessor.ts            # FFmpeg WASM (processamento local)
│   │   ├── serverProcessor.ts           # Railway API (processamento remoto)
│   │   ├── creatomateProcessor.ts       # Creatomate API (alternativo)
│   │   ├── ffmpegPool.ts               # Pool de workers FFmpeg
│   │   ├── ffmpegWorker.ts             # Worker individual FFmpeg
│   │   ├── utils.ts                     # Utilidades (cn, etc)
│   │   └── api/
│   │       ├── tiktok.ts               # API TikTok (scrape, download, dedup, pool)
│   │       └── kwai.ts                 # API Kwai (legado)
│   └── integrations/supabase/
│       ├── client.ts                    # Cliente Supabase configurado
│       └── types.ts                     # Tipos gerados do banco
├── supabase/
│   ├── config.toml                      # Config do projeto Supabase
│   ├── functions/                       # 20 Edge Functions (Deno/TypeScript)
│   │   ├── pool-serve/
│   │   ├── pool-refill/
│   │   ├── pool-scheduler/
│   │   ├── pool-refresh-urls/
│   │   ├── refresh-video-url/
│   │   ├── scrape-tiktok-apify/
│   │   ├── scrape-tiktok-foryou/
│   │   ├── scrape-tiktok/
│   │   ├── scrape-kwai/
│   │   ├── download-tiktok/
│   │   ├── download-tiktok-batch/
│   │   ├── filter-by-niche/
│   │   ├── validate-thumbnails/
│   │   ├── ai-hashtag-suggest/
│   │   ├── discover-hashtags/
│   │   ├── save-seen-videos/
│   │   ├── proxy-video/
│   │   ├── process-video-creatomate/
│   │   ├── seed-admin/
│   │   └── hotmart-webhook/
│   └── migrations/                      # 32 arquivos SQL de migracao
├── railway-ffmpeg-api/
│   ├── src/index.js                     # Servidor Express FFmpeg
│   └── package.json
├── netlify.toml                         # Config Netlify (SPA redirect)
├── vite.config.ts                       # Config Vite + SWC
├── tailwind.config.ts                   # Config Tailwind
├── package.json                         # Dependencias frontend
└── tsconfig.json                        # Config TypeScript
```
