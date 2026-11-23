/**
 * Gerador de Proposta Comercial - WorkForce RH
 *
 * Uso: node scripts/gerar-proposta.js --cliente "Nome" --cargos 50 --inicio "01/09/2026"
 *
 * Parâmetros:
 *   --cliente   Nome do cliente (obrigatório)
 *   --cargos    Número de cargos (obrigatório)
 *   --inicio    Data de início DD/MM/AAAA (obrigatório)
 *   --logo      Caminho para logo do cliente (opcional)
 *   --parcelas  Número de parcelas (padrão: 5)
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Parse args ──────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { parcelas: 4 };
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace('--', '');
    if (key === 'sem-descricao') { opts.semDescricao = true; continue; }
    if (key === 'ds-telas') { opts['ds-telas'] = true; continue; }
    opts[key] = args[i + 1];
    i++;
  }
  if (!opts.cliente || (!opts.cargos && !opts.total) || !opts.inicio) {
    console.error('Uso: node scripts/gerar-proposta.js --cliente "Nome" --cargos 50 --inicio "01/09/2026" [--total 27000]');
    process.exit(1);
  }
  opts.cargos = opts.cargos ? parseInt(opts.cargos) : 0;
  opts.parcelas = parseInt(opts.parcelas);
  if (opts.valor) opts.valor = parseFloat(opts.valor);
  return opts;
}

// ── Timeline calculator ─────────────────────────────────────
function parseDate(str) {
  const [d, m, y] = str.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function fmtDate(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateShort(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
}

const ETAPAS_BASE = [
  { nome: 'Estrutura Organizacional', dias: 30, icon: 'schema', resumo: 'Diagnóstico da estrutura atual e desenho da nova com os gestores: níveis, trilhas de carreira e <em>span of control</em>, validada pela diretoria.' },
  { nome: 'Descrições de Cargo', dias: 30, icon: 'description', resumo: 'Revisão ou criação das descrições com a WorkForce conduzindo as entrevistas e capacitando os gestores.' },
  { nome: 'Pesquisa Total Remuneração', dias: 15, icon: 'query_stats', resumo: 'Fixo, variável e benefícios por cargo no DataSalarial, comparando atividade e não nomenclatura, com filtros de região, setor e porte.' },
  { nome: 'Cenários de Custo', dias: 15, icon: 'bar_chart', resumo: 'Simulações conservadora, mediana e agressiva (P25, P50, P75) com o impacto na folha: a empresa decide onde se posicionar.' },
  { nome: 'Estrutura Salarial', dias: 15, icon: 'table_chart', resumo: 'Tabelas com faixas e 5 a 6 steps de progressão por desempenho, com o enquadramento de cada colaborador.' },
  { nome: 'Política de Remuneração', dias: 15, icon: 'menu_book', resumo: 'Regras de admissão, promoção, mérito e exceções justificadas, aprovada pela diretoria e explicada aos gestores.' },
];

function buildTimeline(startStr, diasCustom, semDescricao, somente) {
  const start = parseDate(startStr);
  let base = semDescricao ? ETAPAS_BASE.filter(e => e.nome !== 'Descrições de Cargo') : ETAPAS_BASE;
  if (somente) {
    const nomes = somente.split(',').map(s => s.trim());
    const invalidas = nomes.filter(n => !ETAPAS_BASE.some(e => e.nome === n));
    if (invalidas.length) throw new Error('Etapas desconhecidas em --somente: ' + invalidas.join(', '));
    base = base.filter(e => nomes.includes(e.nome));
  }
  const etapas = base.map((e, i) => ({ ...e, dias: diasCustom ? diasCustom[i] : e.dias }));

  let cursor = start;
  const timeline = [];
  for (const e of etapas) {
    const fim = addDays(cursor, e.dias);
    timeline.push({ ...e, inicio: new Date(cursor), fim });
    cursor = fim;
  }
  return { timeline, kickoff: start, fimProjeto: cursor };
}

// ── Value calculator ────────────────────────────────────────
function calcValues(cargos, parcelas, valorCargo = 715, totalFixo = null, semDescricao = false) {
  const bruto = totalFixo || cargos * valorCargo;
  const total = semDescricao ? Math.round(bruto * 0.85 * 100) / 100 : bruto;
  const valorParcela = Math.round(total / parcelas * 100) / 100;
  return {
    total,
    valorParcela,
    parcelas,
    totalFmt: total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    parcelaFmt: valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  };
}

// ── Generate proposal HTML ──────────────────────────────────
function generateProposal(opts) {
  const diasCustom = opts.dias ? JSON.parse(opts.dias) : null;
  const { timeline, kickoff, fimProjeto } = buildTimeline(opts.inicio, diasCustom, opts.semDescricao, opts.somente);
  const valorCargo = opts.valor || 715;
  const totalFixo = opts.total ? parseFloat(opts.total) : null;
  const values = calcValues(opts.cargos, opts.parcelas, valorCargo, totalFixo, opts.semDescricao);
  const meses = Math.round(timeline.reduce((s, e) => s + e.dias, 0) / 30);

  const etapaPerc = opts.etapas ? JSON.parse(opts.etapas) : null;

  const templateHtml = readFileSync(join(ROOT, 'index.html'), 'utf-8');
  const projectSlideHtml = `
      <!-- Slide 8: Projeto Customizado -->
      <section class="slide" id="slide-proj" data-slide="8">
        <div class="slide__bg">
          <div class="mesh-blob b-blue-2"></div>
        </div>
        <div class="slide__inner" style="padding-top:72px;padding-bottom:24px;">
          <header class="slide__header" data-anim="fade-up">
            <h2 class="h2-title" style="font-size:2.2rem;">PROJETO<br/><span class="text-ink">C&S - ${opts.cliente.toUpperCase()}</span></h2>
            <img src="/assets/logo_horizontal.png" alt="WF" class="header-logo" />
          </header>

          <div class="proj-grid" style="margin-top:1.2rem;" data-anim="fade-up" style="--anim-delay:200ms">
            ${timeline.map((e, i) => `
            <div class="proj-card">
              <div class="proj-num">0${i + 1}</div>
              <div class="proj-icon"><span class="material-symbols-outlined">${e.icon}</span></div>
              <div class="proj-info">
                <h3>${e.nome} <span style="font-weight:400;font-size:0.75rem;color:var(--ink-40);font-family:var(--font-body);">${e.resumo}</span></h3>
                <p>${fmtDate(e.inicio)} a ${fmtDate(e.fim)}</p>
              </div>
              <div class="proj-days">${e.dias} dias</div>
            </div>`).join('')}
          </div>

          <div class="proj-total" data-anim="fade-up" style="--anim-delay:400ms">
            <span class="proj-total-label">${opts.cargos ? opts.cargos + ' cargos' : 'Projeto completo'}</span>
            <span class="proj-total-sep"></span>
            <span class="proj-total-value">~${meses} meses</span>
            <span class="proj-total-sep"></span>
            <span class="proj-total-note">Início: ${fmtDate(kickoff)}</span>
          </div>
        </div>
      </section>`;

  // Build "Plano de Cargos e Salários" slide
  const planoCSHtml = `
      <!-- Slide: Plano de Cargos e Salários -->
      <section class="slide" id="slide-plano-cs" data-slide="plano-cs">
        <div class="slide__bg">
          <div class="slide__bg--gradient-ink-prussian"></div>
          <div class="mesh-blob b-blue-2"></div>
        </div>
        <div class="slide__inner">
          <header class="slide__header" data-anim="fade-up">
            <h2 class="h2-title">PLANO DE<br/><span class="text-ink">CARGOS E SALÁRIOS</span></h2>
            <img src="/assets/logo_horizontal.png" alt="WF" class="header-logo" />
          </header>

          <div class="plano-cs-layout mt-lg" data-anim="fade-up" style="--anim-delay:200ms">
            <div class="plano-cs-left">
              <p class="plano-cs-intro">Um plano de cargos e salários é essencial para garantir transparência, equidade salarial e motivação dos colaboradores, estabelecendo critérios claros para remuneração e progressão de carreira dentro da organização.</p>
              <p class="plano-cs-intro" style="margin-top:12px;">Para estruturar, precisamos pensar em três tópicos:</p>
              <ul class="plano-cs-topics">
                <li>Estruturação Interna</li>
                <li>Análise de Mercado</li>
                <li>Posicionamento Estratégico</li>
              </ul>
              <div class="decor-bar mt-md"></div>
            </div>
            <div class="plano-cs-right">
              <div class="plano-cs-card">
                <div class="plano-cs-badge">Estruturação Interna</div>
                <p>Organização e definição da hierarquia de cargos, responsabilidades e requisitos dentro da empresa.</p>
              </div>
              <div class="plano-cs-card">
                <div class="plano-cs-badge">Análise de Mercado</div>
                <p>Pesquisa e comparação das práticas salariais e benefícios praticados por outras empresas do setor, região e/ou porte.</p>
              </div>
              <div class="plano-cs-card">
                <div class="plano-cs-badge">Posicionamento Estratégico</div>
                <p>Decisão de como a empresa deseja se posicionar em relação ao mercado, conforme seus objetivos e recursos afim de gerar atração e retenção dos melhores talentos.</p>
              </div>
            </div>
          </div>
        </div>
      </section>`;

  // Build "Estrutura do Projeto" slide
  const estruturaProjetoHtml = `
      <!-- Slide: Estrutura do Projeto -->
      <section class="slide" id="slide-estrutura-proj" data-slide="estrutura-proj">
        <div class="slide__bg">
          <div class="slide__bg--gradient-ink-prussian"></div>
          <div class="mesh-blob b-blue-2"></div>
        </div>
        <div class="slide__inner">
          <header class="slide__header" data-anim="fade-up">
            <h2 class="h2-title">ESTRUTURA<br/><span class="text-ink">DO PROJETO</span></h2>
            <img src="/assets/logo_horizontal.png" alt="WF" class="header-logo" />
          </header>

          <div class="estrutura-proj-layout mt-lg" data-anim="fade-up" style="--anim-delay:200ms">
            <div class="estrutura-proj-left">
              <p>Nossa abordagem é baseada em <strong>trabalho conjunto</strong> com sua equipe.</p>
              <p style="margin-top:12px;">Acreditamos que os <strong>melhores resultados</strong> surgem quando combinamos nossa <strong>expertise técnica</strong> com o <strong>conhecimento interno</strong> da sua organização.</p>
              <p style="margin-top:12px;"><strong>Cada projeto é único</strong> e desenvolvido especificamente para suas necessidades, <strong>garantindo implementação efetiva e sustentável das soluções propostas.</strong></p>
              <div class="decor-bar mt-md"></div>
            </div>
            <div class="estrutura-proj-right">
              <div class="estrutura-proj-card">
                <div class="estrutura-proj-item">
                  <span class="material-symbols-outlined estrutura-proj-check">check_circle</span>
                  <span>Projeto conduzido 100% de forma remota.</span>
                </div>
                <div class="estrutura-proj-item">
                  <span class="material-symbols-outlined estrutura-proj-check">check_circle</span>
                  <span>Estrutura de back-office para construção de bases e suporte remoto integral.</span>
                </div>
                <div class="estrutura-proj-item">
                  <span class="material-symbols-outlined estrutura-proj-check">check_circle</span>
                  <span>2 Consultores (Líder do projeto e Consultor Comercial Técnico).</span>
                </div>
                <div class="estrutura-proj-item">
                  <span class="material-symbols-outlined estrutura-proj-check">check_circle</span>
                  <span>Reuniões semanais com a equipe do projeto para construções e acompanhamentos.</span>
                </div>
                <div class="estrutura-proj-item">
                  <span class="material-symbols-outlined estrutura-proj-check">check_circle</span>
                  <span>Reuniões spots com liderança para validação e finalização de cada etapa do projeto.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>`;

  // Build the cronograma slide
  const cronogramaHtml = `
      <!-- Slide: Cronograma e Investimento -->
      <section class="slide" id="slide-crono" data-slide="crono">
        <div class="slide__bg">
          <div class="slide__bg--gradient-ink-prussian"></div>
          <div class="mesh-blob b-gold-1"></div>
        </div>
        <div class="slide__inner">
          <header class="slide__header" data-anim="fade-up">
            <h2 class="h2-title">CRONOGRAMA E INVESTIMENTO<br/><span class="text-ink">C&S - ${opts.cliente.toUpperCase()}</span></h2>
            <img src="/assets/logo_horizontal.png" alt="WF" class="header-logo" />
          </header>

          <div class="crono-layout mt-lg" data-anim="fade-up" style="--anim-delay:200ms">
            <div class="crono-table${etapaPerc ? ' crono-table--4col' : ''}">
              <div class="crono-header">
                <span>ETAPA</span>
                <span>INÍCIO</span>
                <span>FIM</span>${etapaPerc ? '\n                <span>VALOR</span>' : ''}
              </div>
              <div class="crono-row crono-row--highlight">
                <span>Reunião Kick Off</span>
                <span>${fmtDate(kickoff)}</span>
                <span>${fmtDate(kickoff)}</span>${etapaPerc ? '\n                <span></span>' : ''}
              </div>
              ${timeline.map((e, i) => {
                const valorEtapa = etapaPerc ? (values.total * etapaPerc[i] / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
                return `
              <div class="crono-row">
                <span>${e.nome}</span>
                <span>${fmtDate(e.inicio)}</span>
                <span>${fmtDate(e.fim)}</span>${etapaPerc ? `\n                <span>${valorEtapa}</span>` : ''}
              </div>`;
              }).join('')}
            </div>

            <div class="crono-invest">
              <div class="crono-invest-card">
                <span class="crono-invest-label">Investimento</span>
                <span class="crono-invest-value" style="white-space:nowrap;${values.parcelaFmt.length > 12 ? 'font-size:2rem;' : ''}">${values.parcelas}x de ${values.parcelaFmt}</span>
                <div class="crono-invest-detail">
                  Total de ${values.totalFmt}
                </div>
                <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(252,249,249,0.2);font-size:0.8rem;opacity:0.7;text-align:center;line-height:1.6;">
                  ${opts.cargos ? `<p>* Proposta considerando ${opts.cargos} cargos.</p>` : ''}
                  <p>* Validade: 30 dias após o envio.</p>
                </div>
                <div style="margin-top:16px;padding:12px 16px;background:rgba(201,177,128,0.15);border-left:3px solid var(--gold);border-radius:0 8px 8px 0;font-size:0.85rem;line-height:1.5;">
                  <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;color:var(--gold);margin-right:4px;">card_giftcard</span>
                  ${opts.brinde || 'Com o aceite do Projeto Completo, você terá como brinde acesso a Plataforma Data Salarial por 12 meses.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>`;

  // Build obrigado slide
  const obrigadoHtml = `
      <!-- Slide: Obrigado -->
      <section class="slide" id="slide-obrigado" data-slide="obrigado">
        <div class="slide__inner slide__inner--cover-new">
          <div class="cover-left" data-anim="fade-up" style="--anim-delay:100ms">
            <div class="cover-dots-tl" aria-hidden="true"></div>
            <img src="/assets/logo_horizontal.png" alt="WorkForce RH" class="cover-logo-hz" />
            <div class="cover-gold-line"><span class="cover-gold-dot"></span></div>
            <h2 style="font-family:var(--font-heading);font-size:2.5rem;font-weight:700;color:var(--ink);margin-top:20px;">OBRIGADO</h2>
            <div style="margin-top:20px;font-size:0.95rem;color:var(--ink);line-height:2;">
              <p><span class="material-symbols-outlined text-gold" style="font-size:18px;vertical-align:middle;">mail</span> consultoria@workforcerh.com.br</p>
              <p><span class="material-symbols-outlined text-gold" style="font-size:18px;vertical-align:middle;">phone</span> (19) 98989-0685</p>
              <p><span class="material-symbols-outlined text-gold" style="font-size:18px;vertical-align:middle;">language</span> www.workforcerh.com.br</p>
              <p><span class="material-symbols-outlined text-gold" style="font-size:18px;vertical-align:middle;">badge</span> CNPJ: 52.136.372/0001-43</p>
            </div>
          </div>
          <div class="cover-right" aria-hidden="true">
            <div class="cover-shape cover-shape--arch-top">
              <img src="/assets/img/bg-corporate.png" alt="" />
            </div>
            <div class="cover-shape cover-shape--arch-bottom">
              <img src="/assets/img/bg-corporate.png" alt="" />
            </div>
            <div class="cover-shape cover-shape--circle">
              <div class="cover-circle-fill"></div>
            </div>
            <div class="cover-dots-tr" aria-hidden="true"></div>
            <div class="cover-arc cover-arc--1"></div>
            <div class="cover-arc cover-arc--2"></div>
          </div>
        </div>
      </section>`;

  // Customize cover subtitle with client name
  let html = templateHtml.replace(
    'Transformando Gestão de Pessoas<br/>em Vantagem Competitiva',
    `Proposta Executiva<br/>${opts.subtitulo || opts.cliente}`
  );

  // Update title
  html = html.replace(
    '<title>Apresentação Comercial - Workforce RH</title>',
    `<title>Proposta Executiva - ${opts.cliente} - Workforce RH</title>`
  );

  // If client logo provided, add it to cover
  if (opts.logo) {
    html = html.replace(
      /<\/div>\r?\n          <!-- Right organic shapes with photo -->/,
      `  <img src="./logo.png" alt="${opts.cliente}" style="height:${opts['logo-altura'] || 80}px;width:auto;object-fit:contain;margin-top:24px;opacity:0.85;align-self:flex-start;"/>\n          </div>\n          <!-- Right organic shapes with photo -->`
    );
  }

  // Optional: replace the 4 DataSalarial showcase slides with the "A Plataforma por Dentro" video slide
  // Padrão desde 17/11/2026: slide do vídeo. Use --ds-telas para manter os 4 slides antigos.
  // Seletor de temas é só da apresentação comercial
  html = html.replace(/[ \t]*<!-- TEMA-BAR -->[\s\S]*?<!-- \/TEMA-BAR -->\r?\n?/, '');
  // Slide de depoimentos (só na proposta), logo depois dos clientes
  const depoPath = join(ROOT, 'scripts', 'templates', 'depoimentos.html');
  if (existsSync(depoPath)) html = html.replace('      <!-- Slide 5: Banco de Dados -->', readFileSync(depoPath, 'utf-8') + '\n\n      <!-- Slide 5: Banco de Dados -->');
  // Telas DS1-DS4 ficam no apêndice da apresentação (deck-only). Com --ds-telas, elas voltam antes dos Diferenciais.
  const DS_APX = /      <!-- Apêndice: telas DataSalarial \(deck-only\) -->[\s\S]*?(?=\s*<\/div>\s*<script)/;
  const dsTelasMatch = html.match(DS_APX);
  const dsTelasHtml = dsTelasMatch ? dsTelasMatch[0].replace(/ data-deck-only/g, '') : '';
  // Remove slides exclusivos da reunião (escuta, próximos passos, apêndice)
  html = html.replace(DS_APX, '');
  html = html.replace(/      <!-- [^>]*\(deck-only\) -->\s*<section[^>]*data-deck-only[\s\S]*?<\/section>[ \t]*\r?\n(?:[ \t]*\r?\n)?/g, '');
  if (opts['ds-telas'] && dsTelasHtml) {
    html = html.replace('      <!-- Slide 10: Nossos Diferenciais -->', dsTelasHtml + '\n\n      <!-- Slide 10: Nossos Diferenciais -->');
  }
  if (!opts['ds-telas'] && !html.includes('id="slide-ds-video"')) {
    const dsStart = html.indexOf('      <!-- Slide 10: Nossos Diferenciais -->');
    const dsEnd = dsStart;
    if (dsStart !== -1) {
      const yt = 'https://www.youtube.com/watch?v=OImoaKDBFw0';
      const shots = [
        ['tour1.jpg', 'Pesquisa por Cargo'],
        ['tour2.jpg', 'Benchmark de Benefícios'],
        ['tour3.jpg', 'Dashboard do Diagnóstico'],
        ['tour4.jpg', 'Simulador de Custo'],
      ];
      const dsVideoSlide = `      <!-- Slide DS: A Plataforma por Dentro (vídeo) -->
      <section class="slide" id="slide-ds-video" data-slide="ds-video">
        <div class="slide__inner" style="padding:56px 64px 40px;display:grid;grid-template-columns:0.8fr 1.4fr;gap:40px;align-items:center;">
          <div data-anim="fade-up">
            <img src="/assets/img/logo-datasalarial-color.png" alt="DataSalarial" style="height:40px;margin-bottom:28px;" />
            <h2 style="font-family:var(--font-heading);font-size:2.2rem;font-weight:700;color:var(--ink);line-height:1.15;margin-bottom:20px;"><span style="color:var(--gold);">A Plataforma</span><br/>por Dentro</h2>
            <p style="font-size:1rem;line-height:1.6;color:var(--ink);opacity:.8;margin-bottom:12px;">Telas reais do DataSalarial: a remuneração total do mercado e o diagnóstico dos dados internos, lado a lado.</p>
            <p style="font-size:1rem;line-height:1.6;color:var(--ink);opacity:.8;margin-bottom:24px;">Clique em qualquer tela para assistir à demonstração completa da plataforma.</p>
            <a href="${yt}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:10px;background:var(--gold);color:var(--ink);border-radius:99px;padding:10px 22px 10px 12px;font-family:var(--font-heading);font-weight:600;font-size:.85rem;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;box-shadow:0 8px 22px rgba(201,177,128,.35);"><span class="material-symbols-outlined" style="font-size:28px;">play_circle</span>Assista à demonstração · 3 min</a>
            <p style="font-size:.75rem;color:var(--ink);opacity:.55;margin-top:10px;">youtube.com/watch?v=OImoaKDBFw0</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;" data-anim="fade-up" style="--anim-delay:200ms">
            ${shots.map(([f, alt]) => `<a href="${yt}" target="_blank" rel="noopener" style="display:block;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 12px 32px rgba(8,18,31,.12);"><img src="/assets/img/datasalarial/${f}" alt="${alt}" style="display:block;width:100%;height:auto;" /></a>`).join('\n            ')}
          </div>
        </div>
      </section>

`;
      html = html.slice(0, dsStart) + dsVideoSlide + html.slice(dsEnd);
    }
  }

  // Insert custom slides: after slide 7 (projeto genérico), add projeto customizado
  // Replace the generic slide 7 with the customized one
  const slide7Start = '      <!-- Slide 7: Projeto Cargos e Salários -->';
  const slide8Start = html.includes('      <!-- Slide CT: Como Trabalhamos -->') ? '      <!-- Slide CT: Como Trabalhamos -->' : '      <!-- Slide 8: DataSalarial -->';
  const slide7Idx = html.indexOf(slide7Start);
  const slide8Idx = html.indexOf(slide8Start);

  if (slide7Idx !== -1 && slide8Idx !== -1) {
    // Slide visual da jornada (6 etapas padrão)
    const jornadaHtml = (opts.somente || opts.semDescricao) ? '' : readFileSync(join(ROOT, 'scripts', 'templates', 'jornada.html'), 'utf-8').replace('{{CLIENTE}}', opts.cliente.toUpperCase()) + '\n\n';
    html = html.slice(0, slide7Idx) + estruturaProjetoHtml + '\n\n' + planoCSHtml + '\n\n' + projectSlideHtml + '\n\n' + jornadaHtml + html.slice(slide8Idx);
  }

  // Insert cronograma + obrigado before closing slides-wrapper, and remove slide 10 (diferenciais)
  html = html.replace(/    <\/div>\r?\n\r?\n    <script/, cronogramaHtml + '\n\n' + obrigadoHtml + '\n\n    </div>\n\n    <script');

  // Update total slide count
  const slideCount = (html.match(/<section class="slide/g) || []).length;
  html = html.replace(/<span id="total-num">\d+<\/span>/, `<span id="total-num">${slideCount}</span>`);

  return html;
}

// ── Main ────────────────────────────────────────────────────
const opts = parseArgs();
const slug = opts.cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
const outDir = join(ROOT, 'propostas', slug);

mkdirSync(outDir, { recursive: true });

// Copy logo if provided
if (opts.logo && existsSync(opts.logo)) {
  const destino = join(outDir, 'logo.png');
  if (resolve(opts.logo) !== resolve(destino)) copyFileSync(opts.logo, destino);
  console.log(`✓ Logo: ${destino}`);
}

// Generate proposal HTML
const html = generateProposal(opts);
writeFileSync(join(outDir, 'index.html'), html, 'utf-8');

// Copy style.css and main.js
copyFileSync(join(ROOT, 'style.css'), join(outDir, 'style.css'));
copyFileSync(join(ROOT, 'main.js'), join(outDir, 'main.js'));

const valorCargo2 = opts.valor || 715;
const totalFixo2 = opts.total ? parseFloat(opts.total) : null;
const values = calcValues(opts.cargos, opts.parcelas, valorCargo2, totalFixo2, opts.semDescricao);

console.log(`\n✓ Proposta gerada em: propostas/${slug}/`);
console.log(`  Cliente: ${opts.cliente}`);
if (opts.cargos) console.log(`  Cargos: ${opts.cargos}`);
console.log(`  Início: ${opts.inicio}`);
console.log(`  Valor total: ${values.totalFmt}`);
console.log(`  Parcelas: ${values.parcelas}x de ${values.parcelaFmt}`);
console.log(`\n  Para visualizar: abra propostas/${slug}/index.html no navegador`);

// ── PDF Export ──────────────────────────────────────────────
async function exportPDF(htmlPath, pdfPath, rootDir) {
  const http = await import('http');
  const fs = await import('fs');
  const pathMod = await import('path');
  const puppeteer = await import('puppeteer');

  const server = http.createServer((req, res) => {
    let filePath;
    const url = decodeURIComponent(req.url);
    if (url === '/' || url === '/index.html') {
      filePath = htmlPath;
    } else if (url.startsWith('/assets/')) {
      filePath = pathMod.join(rootDir, 'public', url);
    } else {
      filePath = pathMod.join(pathMod.dirname(htmlPath), url.slice(1));
    }
    try {
      const data = fs.readFileSync(filePath);
      const ext = pathMod.extname(filePath).toLowerCase();
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.slide', { timeout: 10000 });

  const slideCount = await page.$$eval('.slide', slides => slides.length);

  await page.pdf({
    path: pdfPath,
    width: '1280px',
    height: '720px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    pageRanges: `1-${slideCount}`,
  });

  await browser.close();
  server.close();
  console.log(`\n✓ PDF exportado: ${pdfPath}`);
}

const htmlPath = join(outDir, 'index.html');
const pdfPath = join(outDir, `Proposta Executiva Workforce RH - Cargos e Salários - ${opts.cliente}.pdf`);
exportPDF(htmlPath, pdfPath, ROOT).catch(err => {
  console.error('Erro ao gerar PDF:', err.message);
});
