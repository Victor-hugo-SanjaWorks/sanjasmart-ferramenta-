
/* Dados vêm de GET /api/crm/dashboard-comercial (CRM real). Nada é simulado. */
let STAGES = [], N = 0, WON = 0, SB = 0, HAS_SB = false, CHANNELS = [], PRODUCTS = [];
const delta = (a, b) => (b > 0 ? (a / b - 1) * 100 : null);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ============ LOGIC ============ */
const STATUS = { prio: ["Prioridade", "prio"], ok: ["Ativo", ""], warn: ["Atenção", "warn"] };
const fmtMoney = v => v <= 0 ? "R$ 0" : v >= 1e6 ? "R$ " + (v / 1e6).toFixed(1).replace(".", ",") + "M" : "R$ " + Math.round(v / 1e3) + "K";
const fmtPct = v => v.toFixed(1).replace(".", ",") + "%";
const fmtInt = v => Math.round(v).toLocaleString("pt-BR");
const signed = (v, s = "%") => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1).replace(".", ",") + s;

function derive(d, k) {
  const m = v => v * k;
  const S = d.stages.map(s => ({ ...s, qty: Math.round(s.qty * k), cur: Math.round((s.cur ?? s.qty) * k), vgv: m(s.vgv), prevQty: Math.round(s.prevQty * k) }));
  const steps = S.slice(0, WON).map((s, i) => {
    const conv = s.qty ? S[i + 1].qty / s.qty * 100 : 0;
    return { from: s.name, to: S[i + 1].name, conv, d: s.prevConv == null ? null : conv - s.prevConv };
  });
  const target = m(d.target), closed = m(d.closed), pipeline = m(d.pipeline), forecast = m(d.forecast);
  return {
    S, steps, target, closed, pipeline, forecast, gap: Math.max(target - closed, 0),
    coverage: target ? pipeline / target : null, velocity: m(d.velocity), velocityGain: delta(d.velocity, d.prev.velocity),
    conversion: d.conversion, bottlenecks: [...steps].sort((a, b) => (a.d ?? 0) - (b.d ?? 0) || a.conv - b.conv),
    channels: [...d.channels].map(c => ({ ...c, leads: Math.round(c.leads * k), qualified: Math.round(c.qualified * k), proposals: Math.round(c.proposals * k), vgv: m(c.vgv) })).sort((a, b) => b.vgv - a.vgv),
    products: d.products.map(p => ({ ...p, qty: Math.round(p.qty * k), vgv: m(p.vgv), ticket: p.qty ? m(p.vgv) / Math.round(p.qty * k) : 0 })).sort((a, b) => b.vgv - a.vgv),
    critical: d.critical.map(c => ({ ...c, vgv: m(c.vgv) }))
  };
}

/* ============ CHARTS ============ */
function spark(arr) {
  const min = Math.min(...arr), max = Math.max(...arr), r = max - min || 1;
  const pts = arr.map((v, i) => [i / (arr.length - 1) * 100, 30 - (v - min) / r * 26]);
  const line = pts.map(p => p.join(",")).join(" ");
  return `<svg class="spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#145CFF" stop-opacity=".35"/><stop offset="1" stop-color="#145CFF" stop-opacity="0"/></linearGradient></defs><polygon points="0,34 ${line} 100,34" fill="url(#sg)"/><polyline points="${line}" fill="none" stroke="#F5F7FF" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>`;
}
const bar = (pct, top, cls) => `<div class="track"><div class="fill${top ? " top" : ""}${cls ? " " + cls : ""}" data-w="${pct}"></div></div>`;

/* ============ UI ============ */
const $ = id => document.getElementById(id);
const ICONS = {
  pipeline: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>', closed: '<path d="M5 12l4 4 10-10"/>', forecast: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', conversion: '<path d="M4 6h16M7 12h10M10 18h4"/>', velocity: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'
};
let data = null, D, period = "month", view = "overview";

function kpiCards(x) {
  const p = data.prev, t = x.target, ofT = v => t ? `${Math.round(v / t * 100)}% da meta` : "meta não definida";
  return [
    { k: "pipeline", lab: "Pipeline", v: x.pipeline, f: fmtMoney, d: delta(data.pipeline, p.pipeline), sub: "em aberto" },
    { k: "closed", lab: "VGV fechado", v: x.closed, f: fmtMoney, d: delta(data.closed, p.closed), sub: ofT(x.closed) },
    { k: "forecast", lab: "Forecast", v: x.forecast, f: fmtMoney, d: delta(data.forecast, p.forecast), sub: ofT(x.forecast) },
    { k: "target", lab: "Meta", v: t || null, f: fmtMoney, d: null, sub: t ? `Gap ${fmtMoney(x.gap)}` : "defina no botão Meta" },
    { k: "conversion", lab: "Conversão", v: x.conversion, f: fmtPct, d: p.conversion > 0 ? x.conversion - p.conversion : null, pp: true, sub: "conversão geral" },
    { k: "velocity", lab: "Sales velocity", v: x.velocity, f: v => fmtMoney(v) + "/dia", d: delta(data.velocity, p.velocity), sub: "receita potencial/dia" }
  ].map(c => ({ ...c, t: data.trend[c.k] }));
}
function kpiHTML(c, big) {
  const cls = c.d >= 0 ? "up" : "down";
  return `<div class="kpi"><div class="lab">${c.lab}<svg class="ico" viewBox="0 0 24 24">${ICONS[c.k]}</svg></div>
  <div class="val" ${c.v == null ? "" : `data-count="${c.v}" data-fmt="${c.k}"`}>${c.v == null ? "—" : c.f(c.v)}</div>
  <div class="sub">${c.d == null ? "" : `<b class="${cls}">${c.d >= 0 ? "▲" : "▼"} ${signed(c.d, c.pp ? " p.p." : "%")}</b> · `}${c.sub}</div>${big ? "" : spark(c.t)}</div>`;
}

function renderKPIs(x) {
  const cards = kpiCards(x); window.__cards = cards;
  $("kpiGrid").innerHTML = cards.map(c => kpiHTML(c)).join("");
  const gapCard = { k: "target", lab: "Gap p/ meta", v: x.target ? x.gap : null, f: fmtMoney, d: null, sub: x.target ? `${fmtPct(x.gap / x.target * 100)} restante` : "meta não definida", t: [] };
  const pick = ["target", "closed", "forecast", "pipeline", "conversion"].map(k => cards.find(c => c.k === k));
  $("ceoKpis").innerHTML = [...pick, gapCard].map((c, i) => kpiHTML(c, true).replace('class="kpi"', i === 1 ? 'class="kpi hero"' : 'class="kpi"')).join("");
}

const SHADE_STOPS = ["#10205F", "#1634B8", "#145CFF", "#4C8DFF", "#A9C6FF", "#F5F7FF"];
const mixHex = (a, b, t) => "#" + [0, 2, 4].map(i => Math.round(parseInt(a.substr(1 + i, 2), 16) * (1 - t) + parseInt(b.substr(1 + i, 2), 16) * t).toString(16).padStart(2, "0")).join("");
const shadeAt = i => { const p = N > 1 ? i / (N - 1) * (SHADE_STOPS.length - 1) : 0, a = Math.floor(p); return mixHex(SHADE_STOPS[a], SHADE_STOPS[Math.min(a + 1, SHADE_STOPS.length - 1)], p - a); };
const chip = (st, flag) => st.d == null ? `<span class="chip">${Math.round(st.conv)}%</span>` : `<span class="chip${flag ? " warn" : ""}">${Math.round(st.conv)}% ${st.d < 0 ? "▼" : "▲"} ${Math.abs(Math.round(st.d))}${flag ? " · gargalo" : ""}</span>`;

function renderFunnel(x) {
  const F = x.S.slice(0, N), SBS = x.S[SB], max = F[0].qty || 1;
  const w = q => 28 + 72 * Math.pow(q / max, 0.5);
  const b0 = x.bottlenecks[0];
  $("funnelNote").textContent = "Leads na etapa agora" + (b0 ? ` · Gargalo: ${b0.from} → ${b0.to}` : "");
  const rows = F.map((s, i) => {
    const wi = w(s.qty), wn = i < WON ? w(F[i + 1].qty) : wi * 0.78, d = (1 - wn / wi) / 2 * 100;
    const st = x.steps[i], flag = st && st.d != null && st.d <= -data.bottleneckDrop;
    const conv = st ? `${Math.round(st.conv)}% p/ próxima` : `${fmtPct(s.qty / max * 100)} do topo`;
    return `<div class="frow"><div class="fcell"><div class="fun" style="width:${wi.toFixed(1)}%;background:${shadeAt(i)};color:${i / (N - 1 || 1) > 0.7 ? "#050914" : "#fff"};clip-path:polygon(0 0,100% 0,${(100 - d).toFixed(1)}% 100%,${d.toFixed(1)}% 100%)"><span>${fmtInt(s.cur)}</span></div></div>
    <div class="fmeta"><b>${String(i + 1).padStart(2, "0")} · ${esc(s.name.toUpperCase())}</b><span class="fv">${fmtMoney(s.vgv)}${st ? chip(st, flag) : ""}</span><small>${fmtInt(s.qty)} já passaram · ${conv} · ${String(s.days).replace(".", ",")} dias médios</small></div></div>`;
  }).join("");
  const sb = HAS_SB ? `<div class="frow sb"><div class="fcell"><div class="fun sbk" style="width:46%"><span>${fmtInt(SBS.cur)}</span></div></div><div class="fmeta"><b>${esc(SBS.name.toUpperCase())}</b><span class="fv">${fmtMoney(SBS.vgv)}</span><small>${fmtInt(SBS.cur)} pausados · ${String(SBS.days).replace(".", ",")} dias médios · fora do funil</small></div></div>` : "";
  $("funnel").innerHTML = rows + sb;
}

const vazio = t => `<div class="note">${t}</div>`;
function renderRest(x) {
  const shown = x.S.slice(0, HAS_SB ? N + 1 : N), mx = Math.max(...x.S.slice(0, N).map(s => s.vgv)) || 1;
  $("stageBars").innerHTML = shown.map((s, i) => `<div class="row"><span class="n">${esc(s.name)}</span>${bar(Math.min(s.vgv / mx * 100, 100), s.vgv === mx, i === SB ? "sb" : "")}<span class="v">${fmtMoney(s.vgv)}</span></div>`).join("");

  const r = data.radar, v = x.velocityGain;
  const ins = [["OP", "Oportunidade", `${r.nearNext} oportunidade(s) com ação marcada para os próximos 7 dias.`, ""],
    ["GA", "Gargalo", r.stalledPct ? `${r.stalledPct}% das oportunidades estão paradas em ${esc(r.stalledStage)}.` : "Nenhuma etapa com oportunidades paradas além do normal.", r.stalledPct ? "warn" : ""],
    ["VE", "Velocidade", v == null ? "Ainda sem histórico do período anterior para comparar." : `Pipeline avançando ${Math.abs(Math.round(v))}% ${v >= 0 ? "mais rápido" : "mais devagar"} que o período anterior.`, ""],
    ["ME", "Meta", !x.target ? "Meta ainda não definida." : x.gap ? `Faltam ${fmtMoney(x.gap)} para atingir a meta.` : "Meta atingida.", ""]];
  $("radar").innerHTML = ins.map(i => `<div class="insight ${i[3]}"><i>${i[0]}</i><div><small>${i[1]}</small>${i[2]}</div></div>`).join("");

  const mv = Math.max(...x.channels.map(c => c.vgv), 0) || 1, e1 = esc(STAGES[Math.min(1, WON)]), e2 = esc(STAGES[Math.min(2, WON)]);
  $("channels").innerHTML = x.channels.length ? `<div class="chgrid h"><span>Canal</span><span>Leads</span><span>${e1}</span><span>${e2}</span><span>Conv. p/ ${e2}</span><span class="vg">VGV fechado</span></div>` +
    x.channels.map(c => `<div class="chgrid"><b>${esc(c.name)}</b><span>${c.leads}</span><span>${c.qualified}</span><span>${c.proposals}</span><span>${fmtPct(c.leads ? c.proposals / c.leads * 100 : 0)}</span><div class="vg"><b>${c.vgv ? fmtMoney(c.vgv) : "—"}</b>${bar(c.vgv / mv * 100, c.vgv === mv)}</div></div>`).join("") : vazio("Sem leads no funil.");

  const t = x.target, pct = n => t ? Math.min(n / t * 100, 100) : 0, money = n => t ? fmtMoney(n) : "—";
  $("fcStats").innerHTML = [["Meta", money(t)], ["Fechado", fmtMoney(x.closed)], ["Forecast", fmtMoney(x.forecast)], ["Gap", money(x.gap)], ["Pipeline", fmtMoney(x.pipeline)], ["Pipeline coverage", t ? x.coverage.toFixed(1).replace(".", ",") + "x" : "—"]].map(a => `<div><small>${a[0]}</small><b>${a[1]}</b></div>`).join("");
  $("fcBar").style.display = t ? "" : "none";
  $("fcBar").innerHTML = `<div class="seg2" data-w="${pct(x.forecast)}"></div><div class="seg1" data-w="${pct(x.closed)}"></div>
    <div class="mk" style="left:${pct(x.closed)}%"><b>${fmtMoney(x.closed)}</b>Fechado</div><div class="mk" style="left:${pct(x.forecast)}%${100 - pct(x.forecast) < 10 || pct(x.forecast) - pct(x.closed) < 10 ? ";top:62px" : ""}"><b>${fmtMoney(x.forecast)}</b>Forecast</div><div class="mk" style="left:100%;transform:translateX(-100%)"><b>${fmtMoney(t)}</b>Meta</div>`;

  $("critical").innerHTML = x.critical.length ? `<tr><th>Cliente</th><th>VGV</th><th>Etapa</th><th>Dias na etapa</th><th>Status</th><th>Próxima ação</th></tr>` +
    x.critical.map(c => `<tr><td>${esc(c.client)}</td><td><b>${fmtMoney(c.vgv)}</b></td><td>${esc(c.stage)}</td><td>${c.days} dias</td><td><span class="st ${STATUS[c.status][1]}">${STATUS[c.status][0]}</span></td><td>${esc(c.action)}</td></tr>`).join("") : "<tr><td>Nenhuma oportunidade em aberto.</td></tr>";

  const mp = Math.max(...x.products.map(p => p.vgv), 0) || 1;
  $("mix").innerHTML = x.products.length ? x.products.map(p => `<div class="row"><span class="n">${esc(p.name)}</span>${bar(p.vgv / mp * 100, p.vgv === mp)}<span class="v">${fmtMoney(p.vgv)}</span><span class="sm">${p.qty} oportunidades · ticket ${fmtMoney(p.ticket)} · conv. ${p.conv}%</span></div>`).join("") : vazio('Nenhum lead com produto. Crie no CRM o campo personalizado "Produto".');

  $("growthFlow").innerHTML = x.S.slice(0, N).map((s, j) => { const g = delta(s.qty, s.prevQty);
    return `<div><small>${esc(s.name)}</small><b>${fmtInt(s.qty)}</b><span>${fmtMoney(s.vgv)} na etapa</span><br>${g == null ? '<span class="note">sem base anterior</span>' : `<span class="${g >= 0 ? "up" : "down"}">${g >= 0 ? "▲" : "▼"} ${signed(g)} vs anterior</span>`}</div>`; }).join("") +
    `<div><small>Receita</small><b>${fmtMoney(x.closed)}</b><span>fechado</span></div>`;

  $("ceoBottlenecks").innerHTML = x.bottlenecks.slice(0, 3).map(b => `<div class="li"><div>${esc(b.from)} → ${esc(b.to)}<small>conversão ${Math.round(b.conv)}%</small></div>${b.d == null ? "" : `<b class="${b.d < 0 ? "down" : "up"}">${b.d < 0 ? "▼" : "▲"} ${Math.abs(Math.round(b.d))} p.p.</b>`}</div>`).join("");
  $("ceoOpps").innerHTML = [...x.critical].sort((a, b) => b.vgv - a.vgv).slice(0, 3).map(c => `<div class="li"><div>${esc(c.client)}<small>${esc(c.stage)} · ${esc(c.action)}</small></div><b>${fmtMoney(c.vgv)}</b></div>`).join("") || vazio("Nenhuma oportunidade em aberto.");
}

/* ============ MOTION ============ */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function animate() {
  document.body.classList.remove("ready");
  document.querySelectorAll("[data-w]").forEach(e => e.style.width = reduce ? e.dataset.w + "%" : "0");
  void document.body.offsetWidth;
  requestAnimationFrame(() => {
    document.body.classList.add("ready");
    document.querySelectorAll("[data-w]").forEach(e => e.style.width = e.dataset.w + "%");
  });
  const cards = window.__cards, fm = { pipeline: fmtMoney, closed: fmtMoney, forecast: fmtMoney, target: fmtMoney, conversion: fmtPct, velocity: v => fmtMoney(v) + "/dia" };
  document.querySelectorAll("[data-count]").forEach(el => {
    const to = +el.dataset.count, f = fm[el.dataset.fmt] || fmtMoney;
    if (reduce) return el.textContent = f(to);
    const t0 = performance.now();
    (function step(t) { const p = Math.min((t - t0) / 900, 1); el.textContent = f(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); })(t0);
  });
}

function setView(v) {
  view = v; document.body.dataset.view = v;
  document.querySelectorAll("#viewSeg button").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", v !== "ceo" && ((v === "growth") === (a.dataset.view === "growth")) && (a.getAttribute("href") === "#kpis" || v === "growth")));
  document.querySelectorAll(".blk").forEach(b => { b.classList.remove("show"); void b.offsetWidth; b.classList.add("show"); });
  animate();
}

function render(newData) {
  data = newData || buildData(period);
  const pr = data.periods[period];
  $("periodLabel").textContent = pr.label;
  D = derive(data, pr.k);
  renderKPIs(D); renderFunnel(D); renderRest(D); animate();
}

document.getElementById("periodSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  period = b.dataset.p;
  document.querySelectorAll("#periodSeg button").forEach(x => x.classList.toggle("on", x === b));
  render();
});
document.getElementById("viewSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setView(b.dataset.view); });
document.getElementById("nav").addEventListener("click", e => {
  const a = e.target.closest("a"); if (!a) return; e.preventDefault();
  setView(a.dataset.view);
  setTimeout(() => { const t = document.querySelector(a.getAttribute("href")); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
});

/* ============ CRM (somente leitura) ============ */
const DAY = 864e5, PROB_BASE = [.1, .2, .35, .55, .8];
const CRM = { leads: [], target: 0 };
/* Probabilidade de fechamento pela posição da etapa no funil (curva do protótipo). */
function prob(i) {
  if (i >= N) return 0; if (i === WON) return 1;
  const p = WON > 1 ? i / (WON - 1) * (PROB_BASE.length - 1) : PROB_BASE.length - 1, a = Math.floor(p), b = Math.min(a + 1, PROB_BASE.length - 1);
  return PROB_BASE[a] + (PROB_BASE[b] - PROB_BASE[a]) * (p - a);
}

/* ---- lógica de leads ---- */
const stageAt = (l, t) => { let s = null; for (const h of l.history) if (h.at <= t) s = h; return s; };
function snapshot(t) {
  return CRM.leads.filter(l => l.created <= t).map(l => {
    const h = l.history.filter(x => x.at <= t), cur = h[h.length - 1].s;
    return { l, s: cur, reached: Math.max(0, ...h.filter(x => x.s < N).map(x => x.s)), lost: !!(l.lost && l.lostAt <= t), since: h[h.length - 1].at };
  });
}
function metrics(t) {
  const R = snapshot(t), open = R.filter(r => !r.lost && r.s < WON), won = R.filter(r => !r.lost && r.s === WON);
  const sum = a => a.reduce((n, r) => n + r.l.value, 0), pipeline = sum(open), closed = sum(won);
  const forecast = closed + open.reduce((n, r) => n + r.l.value * prob(r.s), 0);
  const conv = R.length ? won.length / R.length * 100 : 0;
  const stages = STAGES.map((n, i) => {
    const q = i < N ? R.filter(r => r.reached >= i) : R.filter(r => !r.lost && r.s === SB), ds = [];
    R.forEach(r => r.l.history.forEach((h, k, a) => { if (h.s === i && h.at <= t) ds.push(((a[k + 1] && a[k + 1].at <= t ? a[k + 1].at : (r.lost ? r.l.lostAt : t)) - h.at) / DAY); }));
    const here = R.filter(r => !r.lost && r.s === i); return { qty: q.length, cur: here.length, vgv: here.reduce((n, r) => n + r.l.value, 0), days: ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length * 10) / 10 : 0 };
  });
  return { R, open, won, pipeline, closed, forecast, conv, velocity: pipeline * conv / 100 / 30, stages };
}
function buildData(period) {
  const days = { month: 30, quarter: 90, year: 365 }[period] || 30, now = Date.now();
  const cur = metrics(now), pv = metrics(now - days * DAY);
  const trend = k => Array.from({ length: 8 }, (_, i) => { const m = metrics(now - (7 - i) * days / 7 * DAY); return k === "target" ? CRM.target : m[k]; });
  const fmtD = t => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "").replace(" de ", " ").toUpperCase();
  const stages = STAGES.map((n, i) => {
    const s = cur.stages[i], p = pv.stages[i], pn = pv.stages[i + 1];
    return { name: n, qty: s.qty, cur: s.cur, vgv: s.vgv, days: s.days, prevQty: p.qty, prevConv: i < WON && p.qty ? pn.qty / p.qty * 100 : null };
  });
  const stalled = STAGES.slice(0, WON).map((n, i) => { const o = cur.open.filter(r => r.s === i), late = o.filter(r => (now - r.since) / DAY > Math.max(cur.stages[i].days * 1.25, 3)); return { n, pct: o.length ? Math.round(late.length / o.length * 100) : 0 }; }).sort((a, b) => b.pct - a.pct)[0];
  const soon = cur.open.filter(r => r.l.actionDate && r.l.actionDate >= now - DAY && r.l.actionDate - now < 7 * DAY).length;
  const fmtAct = l => (l.action || "Sem próxima ação") + (l.actionDate ? " " + new Date(l.actionDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
  const range = d => ({ label: `${fmtD(now - d * DAY)} — ${fmtD(now)}`, k: 1 });
  return {
    periods: { month: range(30), quarter: range(90), year: range(365) },
    pipeline: cur.pipeline, target: CRM.target, closed: cur.closed, forecast: cur.forecast, conversion: cur.conv, velocity: cur.velocity,
    prev: { pipeline: pv.pipeline, target: CRM.target, closed: pv.closed, forecast: pv.forecast, conversion: pv.conv, velocity: pv.velocity },
    trend: { pipeline: trend("pipeline"), closed: trend("closed"), forecast: trend("forecast"), target: trend("target"), conversion: trend("conv"), velocity: trend("velocity") },
    stages, bottleneckDrop: 8, radar: { nearNext: soon, stalledPct: stalled ? stalled.pct : 0, stalledStage: stalled ? stalled.n : "" },
    channels: CHANNELS.map(c => { const r = cur.R.filter(x => x.l.channel === c); return { name: c, leads: r.length, qualified: r.filter(x => x.reached >= Math.min(1, WON)).length, proposals: r.filter(x => x.reached >= Math.min(2, WON)).length, vgv: r.filter(x => !x.lost && x.s === WON).reduce((n, x) => n + x.l.value, 0) }; }),
    products: PRODUCTS.map(p => { const r = cur.R.filter(x => x.l.product === p && !x.lost); return { name: p, qty: r.length, vgv: r.reduce((n, x) => n + x.l.value, 0), conv: r.length ? Math.round(r.filter(x => x.s === WON).length / r.length * 100) : 0 }; }),
    critical: [...cur.open].sort((a, b) => b.l.value - a.l.value).slice(0, 6).map(r => { const d = Math.round((now - r.since) / DAY); return { client: r.l.name, vgv: r.l.value, stage: STAGES[r.s], days: d, status: r.s >= Math.max(1, Math.round(WON * 0.6)) ? "prio" : d > Math.max(cur.stages[r.s].days * 1.5, 7) ? "warn" : "ok", action: fmtAct(r.l) }; })
  };
}

const brl = v => "R$ " + Math.round(v).toLocaleString("pt-BR");
/* O painel fica num iframe: abrir o CRM é trocar a aba do pai. */
const openCrm = () => { if (window.parent !== window && window.parent.switchView) window.parent.switchView("crm"); else location.href = "../?aba=crm"; };
const modal = h => { $("modalBox").innerHTML = h; $("mask").classList.add("on"); };
const closeModal = () => $("mask").classList.remove("on");
const aviso = (titulo, texto) => { modal(`<h3>${titulo}</h3><p class="note">${texto}</p><div class="acts"><button class="btn" id="rOk">Ok</button></div>`); $("rOk").onclick = closeModal; };

function openTarget() {
  modal(`<h3>Meta do período</h3><label>Meta de VGV (R$)</label><input id="fT" type="number" min="1" step="1000" value="${CRM.target || ""}"><p id="fErr" class="note" style="color:var(--amber);margin-top:8px"></p><div class="acts"><button class="btn" id="tS">Salvar</button><button class="btn ghost" id="tC">Cancelar</button></div>`);
  $("tC").onclick = closeModal;
  $("tS").onclick = async () => {
    const valor = +$("fT").value;
    if (!(valor > 0)) return $("fErr").textContent = "Informe uma meta maior que zero.";
    try {
      const res = await fetch("/api/crm/dashboard-comercial/meta", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor }) });
      if (!res.ok) throw new Error(res.status);
      closeModal(); load();
    } catch (e) { $("fErr").textContent = "Não foi possível salvar a meta."; }
  };
}

const ready = () => CRM.leads.length > 0 && N > 0;
function status(msg) {
  $("statusText").textContent = msg || "";
  $("emptyDash").style.display = msg ? "block" : "none";
  document.querySelectorAll("#pageDash > .blk").forEach(b => b.style.visibility = ready() ? "" : "hidden");
}
function renderDash() {
  status(ready() ? "" : "Ainda não há leads no funil principal do CRM para gerar indicadores.");
  if (ready()) render();
}
function showPage(p) {
  document.body.dataset.page = p;
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", p === "seo" ? a.dataset.page === "seo" : a.getAttribute("href") === "#kpis"));
  if (p === "seo") renderSeo(); else { renderDash(); setView(view); }
  window.scrollTo(0, 0);
}

let lastPayload = "";
async function load() {
  try {
    const res = await fetch("/api/crm/dashboard-comercial", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 401 ? "Sessão expirada. Entre no painel novamente." : "Não foi possível carregar os dados do CRM.");
    const { data: d } = await res.json(), payload = JSON.stringify(d);
    if (payload === lastPayload) return;
    lastPayload = payload;
    const geoCache = new Map(), geo = t => { if (!geoCache.has(t)) geoCache.set(t, geocode(t)); return geoCache.get(t); };
    HAS_SB = !!d.standby; N = d.stages.length; WON = N - 1; SB = N;
    STAGES = [...d.stages, d.standby || "Standby"];
    CRM.target = d.target;
    CRM.leads = d.leads.map(l => ({ ...l, geo: l.origem ? geo(l.origem) : null }));
    CHANNELS = [...new Set(CRM.leads.map(l => l.channel))].sort();
    PRODUCTS = [...new Set(CRM.leads.map(l => l.product).filter(Boolean))].sort();
    if (document.body.dataset.page === "seo") renderSeo(); else renderDash();
  } catch (e) {
    console.warn("[dashboard]", e);
    if (!lastPayload) status(e.message || "Não foi possível carregar os dados do CRM.");
  }
}

/* ---- eventos ---- */
$("cfgBtn").onclick = openTarget;
$("crmBtn").onclick = openCrm;
$("mask").addEventListener("mousedown", e => { if (e.target === $("mask")) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
$("nav").addEventListener("click", e => { const a = e.target.closest("a"); if (!a) return;
  if (a.dataset.page) { e.preventDefault(); e.stopImmediatePropagation(); showPage(a.dataset.page); }
  else if (document.body.dataset.page !== "dash") { showPage("dash"); } }, true);

/* ---- Relatório semanal (PDF) ---- */
const sg = (v, s = "%") => (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(1).replace(".", ",") + s;
const dd = t => new Date(t).toLocaleDateString("pt-BR");
function weeklyData() {
  const now = Date.now(), t0 = now - 7 * DAY, L = CRM.leads, m1 = metrics(now), m0 = metrics(t0), inW = t => t > t0 && t <= now;
  const created = L.filter(l => inW(l.created));
  const moves = STAGES.slice(0, N).map((n, i) => { const h = i === 0 ? created : L.filter(l => l.history.some((x, k) => k > 0 && x.s === i && inW(x.at))); return { n, count: h.length, vgv: h.reduce((a, l) => a + l.value, 0) }; });
  const closedW = L.filter(l => !l.lost && l.history.some((x, k) => k > 0 && x.s === WON && inW(x.at)));
  const lostW = L.filter(l => l.lost && inW(l.lostAt));
  const sum = a => a.reduce((n, l) => n + l.value, 0);
  const days = r => Math.round((now - r.since) / DAY);
  return { now, t0, m1, m0, created, moves, closedW, lostW, sum,
    openByStage: STAGES.slice(0, WON).map((n, i) => { const o = m1.open.filter(r => r.s === i); return { n, count: o.length, vgv: sum(o.map(r => r.l)) }; }),
    channels: CHANNELS.map(c => ({ c, novos: created.filter(l => l.channel === c).length, abertos: m1.open.filter(r => r.l.channel === c), fechado: sum(closedW.filter(l => l.channel === c)) })),
    products: PRODUCTS.map(p => { const o = m1.open.filter(r => r.l.product === p); return { p, n: o.length, vgv: sum(o.map(r => r.l)) }; }),
    attention: m1.open.filter(r => days(r) > 14).sort((a, b) => b.l.value - a.l.value).slice(0, 8).map(r => ({ l: r.l, d: days(r) })),
    nextActions: m1.open.filter(r => r.l.actionDate && r.l.actionDate >= now - DAY && r.l.actionDate <= now + 7 * DAY).sort((a, b) => a.l.actionDate - b.l.actionDate).slice(0, 10).map(r => r.l) };
}
async function genReport() {
  if (!ready()) return aviso("Relatório semanal", "Não há leads no funil para gerar o relatório.");
  if (!window.jspdf) return aviso("Relatório semanal", "Não foi possível carregar o gerador de PDF.");
  const btns = document.querySelectorAll(".reportBtn"); btns.forEach(b => { b.disabled = true; b.textContent = "GERANDO…"; });
  try {
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: "mm", format: "a4" }), W = 210, M = 14, D = weeklyData(), logo = document.querySelector(".logo");
    let y = 0;
    const hdr = first => { doc.setFillColor(0, 0, 0); doc.rect(0, 0, W, first ? 34 : 18, "F"); try { first ? doc.addImage(logo, "PNG", 6, 4, 80, 25.5) : doc.addImage(logo, "PNG", 6, 0.7, 52, 16.6); } catch (e) {} };
    const brk = () => { doc.addPage(); hdr(false); y = 28; };
    const need = h => { if (y + h > 280) brk(); };
    const H = t => { need(16); doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(10, 17, 40); doc.text(t.toUpperCase(), M, y); doc.setDrawColor(20, 92, 255).setLineWidth(0.7).line(M, y + 2, M + 14, y + 2); y += 9; };
    const P = (t, sz = 9) => { const ls = doc.setFont("helvetica", "normal").setFontSize(sz).setTextColor(40, 45, 60).splitTextToSize(t, W - 2 * M); need(ls.length * 4.3 + 2); doc.text(ls, M, y); y += ls.length * 4.3 + 2; };
    const T = (cols, head, rows, al) => {
      if (!rows.length) return P("Sem registros na semana.");
      const rh = 6.4, hd = () => { doc.setFillColor(10, 17, 40).rect(M, y - 4.4, W - 2 * M, rh, "F"); doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(255, 255, 255); let x = M; head.forEach((h, i) => { doc.text(String(h), al[i] === "r" ? x + cols[i] - 2 : x + 2, y, { align: al[i] === "r" ? "right" : "left" }); x += cols[i]; }); y += rh; };
      need(rh * 3); hd();
      rows.forEach((r, k) => { if (y + rh > 282) { brk(); hd(); } if (k % 2 === 0) doc.setFillColor(243, 245, 251).rect(M, y - 4.4, W - 2 * M, rh, "F"); doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(30, 35, 50); let x = M; r.forEach((c, i) => { doc.text(doc.splitTextToSize(String(c), cols[i] - 3)[0] || "", al[i] === "r" ? x + cols[i] - 2 : x + 2, y, { align: al[i] === "r" ? "right" : "left" }); x += cols[i]; }); y += rh; });
      y += 4;
    };
    hdr(true); y = 46;
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(10, 17, 40); doc.text("RELATÓRIO SEMANAL DE OPERAÇÃO COMERCIAL", M, y); y += 7;
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90, 96, 115); doc.text(`Período: ${dd(D.t0)} a ${dd(D.now)}   |   Gerado em ${new Date().toLocaleString("pt-BR")}`, M, y); y += 12;
    const { m1, m0 } = D, tg = CRM.target;
    H("1. Indicadores da semana");
    const kp = (n, a, b, f, pp) => [n, f(b), f(a), b ? (pp ? sg(a - b, " p.p.") : sg(delta(a, b))) : "-"], mt = v => tg ? v : "-";
    T([52, 42, 42, 46], ["Indicador", "Início da semana", "Fim da semana", "Variação"], [
      kp("Pipeline aberto", m1.pipeline, m0.pipeline, fmtMoney), kp("VGV fechado (acumulado)", m1.closed, m0.closed, fmtMoney), kp("Forecast", m1.forecast, m0.forecast, fmtMoney),
      kp("Conversão geral", m1.conv, m0.conv, fmtPct, true), kp("Sales velocity (por dia)", m1.velocity, m0.velocity, v => fmtMoney(v) + "/dia"),
      ["Meta do período", mt(fmtMoney(tg)), mt(fmtMoney(tg)), "-"], ["Gap para a meta", mt(fmtMoney(Math.max(tg - m0.closed, 0))), mt(fmtMoney(Math.max(tg - m1.closed, 0))), "-"], ["Cobertura do pipeline", mt((m0.pipeline / tg).toFixed(1).replace(".", ",") + "x"), mt((m1.pipeline / tg).toFixed(1).replace(".", ",") + "x"), "-"]
    ], ["l", "r", "r", "r"]);
    H("2. Movimentação acumulada na semana");
    P(`Novos leads: ${D.created.length} (${fmtMoney(D.sum(D.created))}).  Contratos fechados: ${D.closedW.length} (${fmtMoney(D.sum(D.closedW))}).  Leads perdidos: ${D.lostW.length} (${fmtMoney(D.sum(D.lostW))}).`);
    P(`Em standby agora: ${m1.stages[SB].qty} lead(s), ${fmtMoney(m1.stages[SB].vgv)} (fora do funil).`);
    T([70, 50, 62], ["Entradas por etapa", "Leads", "VGV que entrou"], D.moves.map(s => [s.n, s.count, fmtMoney(s.vgv)]), ["l", "r", "r"]);
    H("3. Fechamentos e perdas da semana");
    T([62, 38, 42, 40], ["Contrato fechado", "VGV", "Canal", "Produto"], D.closedW.map(l => [l.name, fmtMoney(l.value), l.channel, l.product]), ["l", "r", "l", "l"]);
    T([62, 38, 42, 40], ["Lead perdido", "VGV", "Canal", "Etapa da perda"], D.lostW.map(l => [l.name, fmtMoney(l.value), l.channel, STAGES[l.stage]]), ["l", "r", "l", "l"]);
    H("4. Funil comercial (posição atual)");
    T([34, 22, 20, 32, 30, 24, 20], ["Etapa", "Passaram", "Na etapa", "VGV na etapa", "Conv. p/ próxima", "Var. semana", "Dias médios"], m1.stages.slice(0, HAS_SB ? N + 1 : N).map((s, i) => {
      const c = i < WON && s.qty ? m1.stages[i + 1].qty / s.qty * 100 : null, c0 = i < WON && m0.stages[i].qty ? m0.stages[i + 1].qty / m0.stages[i].qty * 100 : null;
      return [STAGES[i], i < N ? s.qty : "-", s.cur, fmtMoney(s.vgv), c == null ? "-" : fmtPct(c), c == null || c0 == null ? "-" : sg(c - c0, " p.p."), s.days.toFixed(1).replace(".", ",")];
    }), ["l", "r", "r", "r", "r", "r", "r"]);
    H("5. Pipeline aberto por etapa");
    const mx = Math.max(...D.openByStage.map(s => s.vgv), 1), bmax = W - 2 * M - 80;
    D.openByStage.forEach(s => { need(8); doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(30, 35, 50); doc.text(s.n, M, y); const bw = bmax * s.vgv / mx; doc.setFillColor(20, 92, 255).rect(M + 30, y - 3.3, Math.max(bw, 0.6), 4.2, "F"); doc.text(`${fmtMoney(s.vgv)}  (${s.count})`, M + 32 + bw, y); y += 7; });
    y += 3;
    H("6. Origem das oportunidades");
    T([42, 32, 32, 38, 38], ["Canal", "Novos (semana)", "Em aberto", "VGV em aberto", "Fechado (semana)"], D.channels.map(c => [c.c, c.novos, c.abertos.length, fmtMoney(D.sum(c.abertos.map(r => r.l))), fmtMoney(c.fechado)]), ["l", "r", "r", "r", "r"]);
    H("7. Mix de produtos (pipeline aberto)");
    T([60, 40, 42, 40], ["Produto", "Oportunidades", "VGV aberto", "Ticket médio"], D.products.map(p => [p.p, p.n, fmtMoney(p.vgv), p.n ? fmtMoney(p.vgv / p.n) : "-"]), ["l", "r", "r", "r"]);
    H("8. Pontos de atenção");
    T([56, 34, 36, 26, 30], ["Parados há mais de 14 dias", "VGV", "Etapa", "Dias", "Canal"], D.attention.map(a => [a.l.name, fmtMoney(a.l.value), STAGES[a.l.stage], a.d, a.l.channel]), ["l", "r", "l", "r", "l"]);
    T([56, 34, 62, 30], ["Próximas ações (7 dias)", "VGV", "Ação", "Data"], D.nextActions.map(l => [l.name, fmtMoney(l.value), l.action || "-", dd(l.actionDate)]), ["l", "r", "l", "l"]);
    H("9. Observações");
    const steps = STAGES.slice(0, WON).map((n, i) => ({ n: n + " > " + STAGES[i + 1], c: m1.stages[i].qty ? m1.stages[i + 1].qty / m1.stages[i].qty * 100 : 100 })).sort((a, b) => a.c - b.c)[0];
    if (steps) P(`- Maior gargalo atual: ${steps.n}, com conversão de ${fmtPct(steps.c)}.`);
    if (tg) P(`- Faltam ${fmtMoney(Math.max(tg - m1.closed, 0))} para a meta; o forecast projeta ${fmtMoney(m1.forecast)} (${Math.round(m1.forecast / tg * 100)}% da meta).`);
    P(`- ${D.attention.length} oportunidade(s) parada(s) há mais de 14 dias e ${D.nextActions.length} ação(ões) agendada(s) para os próximos 7 dias.`);
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setDrawColor(210, 214, 225).setLineWidth(0.2).line(M, 287, W - M, 287); doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(120, 126, 145); doc.text("SANJA SMART / COMMERCIAL INTELLIGENCE   |   Construção inteligente. Patrimônio inteligente.", M, 291.5); doc.text(`Página ${i} de ${n}`, W - M, 291.5, { align: "right" }); }
    doc.save(`relatorio-semanal-sanjasmart-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (e) { console.error(e); aviso("Relatório semanal", "Não foi possível gerar o PDF. Tente novamente."); }
  btns.forEach(b => { b.disabled = false; b.textContent = "GERAR RELATÓRIO"; });
}
document.querySelectorAll(".reportBtn").forEach(b => b.onclick = genReport);


/* ======== SEO — geocodificação local (IBGE) + mapa ======== */
const UFS = new Set(Object.keys(GAZ));
const gnorm = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const GIDX = {}, ALLC = [];
for (const uf in GAZ) { GIDX[uf] = new Map(); GAZ[uf].forEach(c => { const k = gnorm(c[0]); if (!GIDX[uf].has(k)) GIDX[uf].set(k, []); GIDX[uf].get(k).push(c); ALLC.push({ n: c[0], k, uf }); }); }
function lev(a, b) { if (Math.abs(a.length - b.length) > 3) return 9; let p = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[b.length]; }
function parseLoc(t) { t = t.trim(); const m = t.match(/^(.+?)\s*[\/,]\s*([A-Za-z]{2})$/) || t.match(/^(.+?)\s+-\s+([A-Za-z]{2})$/); return m ? { city: m[1].trim(), uf: m[2].toUpperCase() } : null; }
function geocode(text) {
  const base = { text, at: Date.now() }, p = parseLoc(text);
  if (!p) { const hits = ALLC.filter(c => c.k === gnorm(text.replace(/[\/,\s]+$/, ""))).slice(0, 4).map(c => c.n + "/" + c.uf); return { ...base, status: "format", msg: hits.length ? "Informe a UF. Sugestões abaixo." : 'Use o formato "Cidade/UF".', sug: hits }; }
  if (!UFS.has(p.uf)) return { ...base, status: "uf", msg: `UF "${p.uf}" inválida.`, sug: [] };
  const k = gnorm(p.city), hit = GIDX[p.uf].get(k);
  if (hit && hit.length === 1) return { ...base, status: "ok", city: hit[0][0], uf: p.uf, lat: hit[0][1], lon: hit[0][2] };
  if (hit && hit.length > 1) return { ...base, status: "ambiguous", msg: `Há ${hit.length} municípios com esse nome em ${p.uf}.`, sug: [] };
  const near = GAZ[p.uf].map(c => [c[0], lev(gnorm(c[0]), k)]).filter(x => x[1] <= Math.max(2, Math.floor(k.length / 5))).sort((a, b) => a[1] - b[1]).slice(0, 3).map(x => x[0] + "/" + p.uf);
  const other = ALLC.filter(c => c.k === k).slice(0, 3).map(c => c.n + "/" + c.uf);
  return { ...base, status: "not_found", msg: other.length ? `"${p.city}" não existe em ${p.uf}. Existe em: ${other.join(", ")}.` : `Município "${p.city}" não encontrado em ${p.uf}.`, sug: [...near, ...other].slice(0, 4) };
}
const hasGeo = l => !!(l.geo && l.geo.status === "ok" && isFinite(l.geo.lat) && isFinite(l.geo.lon));
/* ---- aba SEO ---- */
const SEO = { map: null, group: null, states: null, f: { from: "", to: "", uf: "", city: "", stage: "", chan: "", status: "" }, sel: null, fit: true };
const SIT = [["", "Todas"], ["active", "Em andamento"], ["won", "Contrato (fechadas)"], ["standby", "Standby"], ["lost", "Perdidas"]];
const sitOf = l => l.lost ? "lost" : l.stage === WON ? "won" : l.stage === SB ? "standby" : "active";
const opts = (arr, v) => arr.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("");
function seoBase() {
  const f = SEO.f, from = f.from ? new Date(f.from + "T00:00").getTime() : -Infinity, to = f.to ? new Date(f.to + "T23:59:59").getTime() : Infinity;
  return CRM.leads.filter(l => l.created >= from && l.created <= to && (f.stage === "" || l.stage === +f.stage) && (!f.chan || l.channel === f.chan) && (!f.status || sitOf(l) === f.status));
}
function initSeoMap() {
  if (SEO.map) return;
  const m = SEO.map = L.map("seoMap", { zoomSnap: 0.25, minZoom: 3, maxZoom: 12, maxBounds: [[-42, -82], [12, -26]], maxBoundsViscosity: 0.7, attributionControl: false });
  L.control.attribution({ prefix: false }).addTo(m).addAttribution("Municípios: IBGE · malha estadual simplificada");
  SEO.states = L.geoJSON(STATES_GEO, { onEachFeature: (f, ly) => { ly.on("click", () => seoSelect({ type: "uf", uf: f.properties.uf })); ly.bindTooltip(f.properties.name + " (" + f.properties.uf + ")", { sticky: true, className: "seo-tt" }); } }).addTo(m);
  SEO.group = L.markerClusterGroup({ maxClusterRadius: 44, showCoverageOnHover: false, spiderfyOnMaxZoom: true, zoomToBoundsOnClick: true, spiderfyDistanceMultiplier: 1.6,
    iconCreateFunction: c => { const n = c.getChildCount(), s = n < 10 ? 36 : n < 50 ? 44 : 54, hl = c.getAllChildMarkers().some(x => x.options.hl); return L.divIcon({ html: `<span>${n}</span>`, className: "seo-cl" + (hl ? " hl" : ""), iconSize: [s, s] }); } }).addTo(m);
  m.fitBounds([[-33.8, -73.9], [5.4, -34.8]]);
  m.on("popupopen", e => { const b = e.popup.getElement().querySelector("[data-open]"); if (b) b.onclick = () => { m.closePopup(); openCrm(); }; });
}
function seoSelect(s) { SEO.sel = SEO.sel && SEO.sel.type === s.type && SEO.sel.uf === s.uf && SEO.sel.city === s.city ? null : s; SEO.fit = true; renderSeo(); }
function seoMatch(l) { const s = SEO.sel; return !!s && (s.type === "uf" ? l.geo.uf === s.uf : l.geo.city === s.city && l.geo.uf === s.uf); }
function renderSeo() {
  initSeoMap(); SEO.map.invalidateSize();
  const f = SEO.f, base = seoBase(), loc = base.filter(hasGeo), emptyL = base.filter(l => !l.origem), failL = base.filter(l => l.origem && !hasGeo(l));
  const ufs = [...new Set(loc.map(l => l.geo.uf))].sort(), cities = [...new Set(loc.filter(l => !f.uf || l.geo.uf === f.uf).map(l => l.geo.city + "/" + l.geo.uf))].sort();
  if (f.uf && !ufs.includes(f.uf)) f.uf = ""; if (f.city && !cities.includes(f.city)) f.city = "";
  $("sfUf").innerHTML = opts([["", "Todos"], ...ufs.map(u => [u, u])], f.uf); $("sfCity").innerHTML = opts([["", "Todas"], ...cities.map(c => [c, c])], f.city);
  $("sfStage").innerHTML = opts([["", "Todas"], ...STAGES.slice(0, HAS_SB ? N + 1 : N).map((s, i) => [i, s])], f.stage); $("sfChan").innerHTML = opts([["", "Todos"], ...CHANNELS.map(c => [c, c])], f.chan); $("sfStatus").innerHTML = opts(SIT, f.status);
  $("sfFrom").value = f.from; $("sfTo").value = f.to;
  const view = loc.filter(l => (!f.uf || l.geo.uf === f.uf) && (!f.city || l.geo.city + "/" + l.geo.uf === f.city));
  const cu = {}, cc = {}; view.forEach(l => { cu[l.geo.uf] = (cu[l.geo.uf] || 0) + 1; const k = l.geo.city + "/" + l.geo.uf; cc[k] = (cc[k] || 0) + 1; });
  const rk = o => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), ru = rk(cu), rc = rk(cc), tot = view.length;
  const kp = (lab, val, sub, sm, id) => `<div class="kpi" ${id ? `id="${id}" style="cursor:pointer"` : ""}><div class="lab">${lab}</div><div class="val${sm ? " sm" : ""}">${val}</div><div class="sub">${sub}</div></div>`;
  $("seoKpis").innerHTML = kp("Leads localizados", tot, "com localização válida") + kp("Cidades", rc.length, "alcançadas") + kp("Estados", ru.length, "alcançados") +
    kp("Estado líder", ru[0] ? ru[0][0] : "—", ru[0] ? `${ru[0][1]} leads · ${Math.round(ru[0][1] / tot * 100)}%` : "sem dados", false) + kp("Cidade líder", rc[0] ? esc(rc[0][0]) : "—", rc[0] ? `${rc[0][1]} leads · ${Math.round(rc[0][1] / tot * 100)}%` : "sem dados", true) +
    kp("Sem localização", emptyL.length + failL.length, `${emptyL.length} não preenchidos · ${failL.length} não reconhecidos${emptyL.length + failL.length ? " · ver lista" : ""}`, false, "seoMissing");
  const bars = (list, attr, sel) => list.length ? list.slice(0, attr === "city" ? 12 : 27).map(([k, n]) => `<button class="rk${sel(k) ? " on" : ""}" data-${attr}="${esc(k)}"><span class="n">${esc(k)}</span><span class="track"><span class="fill" style="width:${n / list[0][1] * 100}%"></span></span><span class="v">${n} · ${(n / tot * 100).toFixed(0)}%</span></button>`).join("") : '<div class="note">Sem dados neste filtro.</div>';
  const S = SEO.sel; $("rankUf").innerHTML = bars(ru, "uf", k => S && S.type === "uf" && S.uf === k); $("rankCity").innerHTML = bars(rc, "city", k => S && S.type === "city" && S.city + "/" + S.uf === k);
  $("seoSel").innerHTML = S ? `<span>Destacando: <b>${S.type === "uf" ? esc(S.uf) : esc(S.city + "/" + S.uf)}</b></span><button id="seoSelX" aria-label="Limpar destaque">×</button>` : "";
  const mx = Math.max(1, ...Object.values(cu));
  SEO.states.setStyle(ft => { const n = cu[ft.properties.uf] || 0, on = S && S.type === "uf" && S.uf === ft.properties.uf; return { fillColor: on ? "#1E40FF" : n ? mixHex("#0A1128", "#145CFF", .25 + .6 * n / mx) : "#0A1128", fillOpacity: 1, color: on ? "#FFFFFF" : "rgba(255,255,255,.3)", weight: on ? 1.8 : 1 }; });
  SEO.group.clearLayers(); const pts = [], hlPts = [];
  view.forEach(l => {
    const hl = seoMatch(l), ll = [l.geo.lat, l.geo.lon], sit = sitOf(l);
    const mk = L.marker(ll, { hl, icon: L.divIcon({ className: "seo-dot " + sit + (hl ? " hl" : ""), html: "<i></i>", iconSize: [22, 22] }), title: l.name });
    mk.bindPopup(`<div class="pp"><b>${esc(l.name)}</b><div>${esc(l.geo.city)}/${esc(l.geo.uf)}</div><small>Criado em ${new Date(l.created).toLocaleDateString("pt-BR")}</small><small>Etapa: ${l.lost ? "Perdido (" + esc(STAGES[l.stage]) + ")" : esc(STAGES[l.stage])}</small><small>Canal: ${esc(l.channel)} · ${brl(l.value)}</small><button class="btn" data-open="${l.id}">Abrir CRM</button></div>`);
    SEO.group.addLayer(mk); pts.push(ll); if (hl) hlPts.push(ll);
  });
  $("seoEmpty").style.display = tot ? "none" : "flex";
  if (SEO.fit) { SEO.fit = false; const t = hlPts.length ? hlPts : pts; if (t.length) SEO.map.fitBounds(L.latLngBounds(t), { padding: [60, 60], maxZoom: hlPts.length ? 9 : 8 }); else SEO.map.fitBounds([[-33.8, -73.9], [5.4, -34.8]]); }
  $("seoMissing").onclick = () => { const L2 = [...failL, ...emptyL]; if (!L2.length) return; modal(`<h3>Leads sem localização válida</h3><div class="mlist">${L2.map(l => `<div><b>${esc(l.name)}</b><small>${l.origem ? esc(l.origem) + " — " + esc((l.geo && l.geo.msg) || "não reconhecido") : "Origem geográfica não preenchida"}</small><button class="btn ghost" data-fix="${l.id}">Abrir CRM</button></div>`).join("")}</div><div class="acts"><button class="btn ghost" id="mlClose">Fechar</button></div>`); $("mlClose").onclick = closeModal; $("modalBox").querySelectorAll("[data-fix]").forEach(b => b.onclick = () => { closeModal(); openCrm(); }); };
}
function bindSeo() {
  const map = { sfFrom: "from", sfTo: "to", sfUf: "uf", sfCity: "city", sfStage: "stage", sfChan: "chan", sfStatus: "status" };
  Object.keys(map).forEach(id => $(id).addEventListener("change", e => { SEO.f[map[id]] = e.target.value; if (id === "sfUf") SEO.f.city = ""; SEO.sel = null; SEO.fit = true; renderSeo(); }));
  $("sfClear").onclick = () => { SEO.f = { from: "", to: "", uf: "", city: "", stage: "", chan: "", status: "" }; SEO.sel = null; SEO.fit = true; renderSeo(); };
  $("rankUf").addEventListener("click", e => { const b = e.target.closest("[data-uf]"); if (b) seoSelect({ type: "uf", uf: b.dataset.uf }); });
  $("rankCity").addEventListener("click", e => { const b = e.target.closest("[data-city]"); if (b) { const [c, u] = b.dataset.city.split("/"); seoSelect({ type: "city", city: c, uf: u }); } });
  $("seoSel").addEventListener("click", e => { if (e.target.closest("#seoSelX")) { SEO.sel = null; SEO.fit = true; renderSeo(); } });
}
bindSeo();
if (window.innerWidth <= 720) $("seoFw").open = false;

load();
setInterval(() => { if (!document.hidden) load(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
