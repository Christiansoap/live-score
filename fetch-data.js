// 实时比分网站 - Cloudflare Worker 云端版
// 数据源: ESPN / OpenLigaDB / TheSportsDB | 预告页: workbuddy (每天 9:30 北京时间 = UTC 1:30 自动抓取)
const teamsZh = require('./teams-zh.js');
const path = require('path');
const fsx = require('fs');

const PREVIEW_URL = 'https://8a34872f01f8437e9dae1cfb4743b127.app.workbuddy.link/';
const PREVIEW_TOLERANCE_MS = 45 * 60 * 1000;
const CACHE_TTL_MS = 45000;

const UA = 'curl/8.0';
const REF = 'https://www.espn.com/';
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ---- 汉化 ----
const ZH_TO_LOGO = {};
for (const [en, v] of Object.entries(teamsZh)) {
  if (v && v.zh) ZH_TO_LOGO[v.zh] = v.logo || ZH_TO_LOGO[v.zh];
}
function zhName(n) {
  if (!n) return n;
  const v = teamsZh[n];
  return v && v.zh ? v.zh : n;
}
function logoForZh(zh) { return ZH_TO_LOGO[zh] || null; }

// ---- 联赛配置 ----
const GROUPS = [
  { key: 'europe_top', name: '欧洲顶级联赛' },
  { key: 'europe_other', name: '欧洲其他联赛' },
  { key: 'nordic', name: '北欧联赛' },
  { key: 'europe_cups', name: '欧洲杯赛' },
  { key: 'asia', name: '亚洲联赛' },
  { key: 'americas', name: '美洲联赛' },
  { key: 'basketball', name: '篮球' },
];
const ESPN_LEAGUES = [
  { key: 'eng.1', name: '英超', group: 'europe_top', sport: 'football' },
  { key: 'esp.1', name: '西甲', group: 'europe_top', sport: 'football' },
  { key: 'ita.1', name: '意甲', group: 'europe_top', sport: 'football' },
  { key: 'ger.1', name: '德甲', group: 'europe_top', sport: 'football' },
  { key: 'ger.2', name: '德乙', group: 'europe_top', sport: 'football' },
  { key: 'fra.1', name: '法甲', group: 'europe_top', sport: 'football' },
  { key: 'ned.1', name: '荷甲', group: 'europe_other', sport: 'football' },
  { key: 'bel.1', name: '比甲', group: 'europe_other', sport: 'football' },
  { key: 'den.1', name: '丹超', group: 'europe_other', sport: 'football' },
  { key: 'sco.1', name: '苏超', group: 'europe_other', sport: 'football' },
  { key: 'rus.1', name: '俄超', group: 'europe_other', sport: 'football' },
  { key: 'por.1', name: '葡超', group: 'europe_other', sport: 'football' },
  { key: 'tur.1', name: '土超', group: 'europe_other', sport: 'football' },
  { key: 'gre.1', name: '希腊超', group: 'europe_other', sport: 'football' },
  { key: 'aut.1', name: '奥甲', group: 'europe_other', sport: 'football' },
  { key: 'irl.1', name: '爱超', group: 'europe_other', sport: 'football' },
  { key: 'eng.2', name: '英冠', group: 'europe_other', sport: 'football' },
  { key: 'eng.3', name: '英甲', group: 'europe_other', sport: 'football' },
  { key: 'eng.4', name: '英乙', group: 'europe_other', sport: 'football' },
  { key: 'fra.2', name: '法乙', group: 'europe_other', sport: 'football' },
  { key: 'ita.2', name: '意乙', group: 'europe_other', sport: 'football' },
  { key: 'esp.2', name: '西乙', group: 'europe_other', sport: 'football' },
  { key: 'nor.1', name: '挪威超', group: 'nordic', sport: 'football' },
  { key: 'swe.1', name: '瑞典超', group: 'nordic', sport: 'football' },
  { key: 'fin.1', name: '芬兰超', group: 'nordic', sport: 'football' },
  { key: 'swe.2', name: '瑞典甲', group: 'nordic', sport: 'football' },
  { key: 'uefa.champions', name: '欧冠', group: 'europe_cups', sport: 'football' },
  { key: 'uefa.europa', name: '欧联', group: 'europe_cups', sport: 'football' },
  { key: 'uefa.europa.conf', name: '欧协联', group: 'europe_cups', sport: 'football' },
  { key: 'eng.league_cup', name: '英联杯', group: 'europe_cups', sport: 'football' },
  { key: 'ger.dfb_pokal', name: '德国杯', group: 'europe_cups', sport: 'football' },
  { key: 'ita.coppa_italia', name: '意大利杯', group: 'europe_cups', sport: 'football' },
  { key: 'uefa.nations', name: '欧国联', group: 'europe_cups', sport: 'football' },
  { key: 'chn.1', name: '中超', group: 'asia', sport: 'football' },
  { key: 'jpn.1', name: '日职联', group: 'asia', sport: 'football' },
  { key: 'ksa.1', name: '沙特联赛', group: 'asia', sport: 'football' },
  { key: 'mex.1', name: '墨超', group: 'americas', sport: 'football' },
  { key: 'usa.1', name: '美职联', group: 'americas', sport: 'football' },
  { key: 'bra.1', name: '巴甲', group: 'americas', sport: 'football' },
  { key: 'arg.1', name: '阿甲', group: 'americas', sport: 'football' },
  { key: 'bra.2', name: '巴乙', group: 'americas', sport: 'football' },
  { key: 'chi.1', name: '智利甲', group: 'americas', sport: 'football' },
  { key: 'conmebol.libertadores', name: '解放者杯', group: 'americas', sport: 'football' },
  { key: 'conmebol.sudamericana', name: '南美杯', group: 'americas', sport: 'football' },
];
const ESPN_BASKETBALL = [
  { key: 'nba', name: 'NBA', group: 'basketball', sport: 'basketball' },
  { key: 'wnba', name: 'WNBA', group: 'basketball', sport: 'basketball' },
];
const EXTRA_LEAGUES = [
  { key: 'bl3', name: '德丙', group: 'europe_other', sport: 'football', source: 'openligadb' },
  { key: 'kor.1', name: '韩职联', group: 'asia', sport: 'football', source: 'thesportsdb', leagueId: '4689' },
  { key: 'pol.1', name: '波超', group: 'europe_other', sport: 'football', source: 'thesportsdb', leagueId: '4422' },
];
const LEAGUE_ALIASES = [
  [/WNBA/i, 'wnba'], [/NBA/i, 'nba'],
  [/英超/, 'eng.1'], [/英冠/, 'eng.2'], [/英甲/, 'eng.3'], [/英乙/, 'eng.4'], [/英联杯/, 'eng.league_cup'],
  [/西甲/, 'esp.1'], [/西乙/, 'esp.2'],
  [/意甲/, 'ita.1'], [/意乙/, 'ita.2'], [/意大利杯/, 'ita.coppa_italia'],
  [/德甲/, 'ger.1'], [/德乙/, 'ger.2'], [/德丙/, 'bl3'], [/德国杯/, 'ger.dfb_pokal'],
  [/法甲/, 'fra.1'], [/法乙/, 'fra.2'],
  [/中超/, 'chn.1'], [/韩职联/, 'kor.1'], [/日职联/, 'jpn.1'], [/沙特/, 'ksa.1'],
  [/荷甲/, 'ned.1'], [/比甲/, 'bel.1'], [/丹超/, 'den.1'], [/苏超/, 'sco.1'], [/俄超/, 'rus.1'],
  [/葡超/, 'por.1'], [/土超/, 'tur.1'], [/希腊超/, 'gre.1'], [/奥甲/, 'aut.1'], [/波超/, 'pol.1'],
  [/爱超/, 'irl.1'], [/挪超|挪威超/, 'nor.1'], [/瑞典超/, 'swe.1'], [/瑞典甲/, 'swe.2'], [/芬兰超/, 'fin.1'],
  [/美职联/, 'usa.1'], [/墨超/, 'mex.1'], [/巴甲/, 'bra.1'], [/巴乙/, 'bra.2'], [/阿甲/, 'arg.1'], [/智利甲/, 'chi.1'],
  [/欧冠/, 'uefa.champions'], [/欧联/, 'uefa.europa'], [/欧协联/, 'uefa.europa.conf'], [/欧国联/, 'uefa.nations'],
  [/解放者杯/, 'conmebol.libertadores'], [/南美杯/, 'conmebol.sudamericana'],
];
function resolveLeagueKey(name) {
  const clean = name.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu, '').replace(/\s+/g, '');
  for (const [re, key] of LEAGUE_ALIASES) if (re.test(clean)) return key;
  return null;
}

// ---- 预告解析 ----
function parsePreviewHtml(html) {
  const matches = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sectionRe = /<h2>([^<]+)<\/h2><span class="sec-count">(\d+)场<\/span><\/div>(.*?)(?=<div class="section">|$)/gs;
  let sm;
  while ((sm = sectionRe.exec(html)) !== null) {
    const label = sm[1].trim();
    const body = sm[3];
    let dateOffset = null;
    if (label.includes('今日')) dateOffset = 0;
    else if (label.includes('明日')) dateOffset = 1;
    else {
      const md = label.match(/(\d{2})-(\d{2})/);
      if (md) {
        const t = new Date(now.getFullYear(), parseInt(md[1], 10) - 1, parseInt(md[2], 10));
        const diff = Math.round((t - today) / 86400000);
        if (diff >= 0 && diff <= 3) dateOffset = diff;
      }
    }
    if (dateOffset === null) continue;
    const d = new Date(today);
    d.setDate(d.getDate() + dateOffset);
    const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const panelRe = /<span>([^<]+?)<span class="cnt">（(\d+)场）<\/span><\/span>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g;
    let pm;
    while ((pm = panelRe.exec(body)) !== null) {
      const leagueKey = resolveLeagueKey(pm[1]);
      const rowRe = /<td[^>]*>([^<]*)<\/td>\s*<td[^>]*><b>([^<]*)<\/b>\s*<span[^>]*>vs<\/span>\s*<b>([^<]*)<\/b><\/td>/g;
      let rm;
      while ((rm = rowRe.exec(pm[3])) !== null) {
        const time = rm[1].trim();
        const startMs = new Date(`${today.getFullYear()}-${dateStr}T${time}:00+08:00`).getTime();
        matches.push({ leagueKey, leagueName: pm[1], date: dateStr, time, home: rm[2].trim(), away: rm[3].trim(), startMs, startTime: new Date(startMs).toISOString() });
      }
    }
  }
  return matches;
}
const previewCache = { matches: [], fetchedAt: null, error: null, fetchedAtMs: 0 };
async function fetchPreview() {
  const dayKey = new Date().toISOString().slice(0, 10);
  try {
    const res = await fetchWithTimeout(PREVIEW_URL, { headers: { 'User-Agent': UA_BROWSER } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const matches = parsePreviewHtml(html);
    if (!matches.length) throw new Error('未解析到比赛');
    previewCache.matches = matches;
    previewCache.fetchedAt = new Date().toISOString();
    previewCache.error = null;
    previewCache.fetchedAtMs = Date.now();
    return { matches, fetchedAt: previewCache.fetchedAt, dayKey };
  } catch (e) {
    previewCache.error = e.message;
    return { matches: [], fetchedAt: null, dayKey, error: e.message };
  }
}

// ---- 数据抓取 ----
const FETCH_TIMEOUT = 15000;
async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function fetchJson(url, headers = {}) {
  const res = await fetchWithTimeout(url, { headers });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
function parseEspnEvent(ev, league) {
  const comp = ev.competitions && ev.competitions[0];
  if (!comp) return null;
  const st = ev.status || {};
  const stType = st.type || {};
  const state = stType.state || 'pre';
  const desc = stType.description || '';
  const shortDetail = stType.shortDetail || '';
  const detail = stType.detail || '';
  const competitors = comp.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home');
  const away = competitors.find(c => c.homeAway === 'away');
  if (!home || !away) return null;
  const score = c => (c.score !== undefined && c.score !== null && c.score !== '') ? parseInt(c.score, 10) : null;
  let status = 'pre', statusText = '未开始';
  const lowerDesc = desc.toLowerCase();
  if (state === 'pre') {
    status = 'pre'; statusText = '未开始';
    if (lowerDesc.includes('postpon')) { status = 'postponed'; statusText = '延期'; }
    if (lowerDesc.includes('cancel')) { status = 'canceled'; statusText = '取消'; }
  } else if (state === 'in') {
    status = 'live';
    if (league.sport === 'basketball') {
      if (lowerDesc.includes('halftime')) statusText = '中场休息';
      else statusText = detail || shortDetail || '进行中';
    } else {
      const sd = (shortDetail || '').toLowerCase();
      if (lowerDesc.includes('halftime') || sd === 'ht') statusText = '中场休息';
      else if (lowerDesc.includes('penalty') || sd.includes('pen')) statusText = '点球大战';
      else if (lowerDesc.includes('extra') || sd.includes('et')) statusText = `加时 ${shortDetail}`;
      else if (shortDetail) statusText = shortDetail;
      else statusText = detail || '进行中';
    }
  } else if (state === 'post') {
    status = 'post';
    if (lowerDesc.includes('cancel')) { status = 'canceled'; statusText = '取消'; }
    else if (lowerDesc.includes('postpon')) { status = 'postponed'; statusText = '延期'; }
    else statusText = league.sport === 'basketball' ? '完场' : '已结束';
  }
  const hn = home.team.displayName || home.team.name;
  const an = away.team.displayName || away.team.name;
  return {
    id: String(ev.id), leagueKey: league.key, leagueName: league.name, sport: league.sport,
    status, statusText, startTime: ev.date || null,
    home: { name: zhName(hn), short: home.team.shortDisplayName || home.team.abbreviation || hn, score: score(home), logo: home.team.logo || logoForZh(zhName(hn)) },
    away: { name: zhName(an), short: away.team.shortDisplayName || away.team.abbreviation || an, score: score(away), logo: away.team.logo || logoForZh(zhName(an)) },
  };
}
async function fetchEspnLeague(league) {
  const sport = league.sport === 'basketball' ? 'basketball' : 'soccer';
  const j = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league.key}/scoreboard`, { 'User-Agent': UA, 'Referer': REF });
  const events = (j.events || []).map(ev => parseEspnEvent(ev, league)).filter(Boolean);
  return { ...league, events };
}
function parseOpenLigaEvent(m) {
  const results = m.matchResults || [];
  const final = results.find(r => r.resultName === 'Endergebnis') || results[results.length - 1];
  const score = final ? [final.pointsTeam1, final.pointsTeam2] : [null, null];
  const start = m.matchDateTimeUTC ? new Date(m.matchDateTimeUTC).toISOString() : null;
  let status = 'pre', statusText = '未开始';
  if (m.matchIsFinished) { status = 'post'; statusText = '已结束'; }
  else if (start && new Date(start).getTime() < Date.now()) { status = 'live'; statusText = '进行中'; }
  return {
    id: String(m.matchID), leagueKey: 'bl3', leagueName: '德丙', sport: 'football', status, statusText, startTime: start,
    home: { name: zhName(m.team1.teamName), short: m.team1.shortName || m.team1.teamName, score: score[0], logo: m.team1.teamIconUrl || logoForZh(zhName(m.team1.teamName)) },
    away: { name: zhName(m.team2.teamName), short: m.team2.shortName || m.team2.teamName, score: score[1], logo: m.team2.teamIconUrl || logoForZh(zhName(m.team2.teamName)) },
  };
}
async function fetchOpenLiga() {
  const j = await fetchJson('https://api.openligadb.de/getmatchdata/bl3', { 'User-Agent': UA });
  const events = (Array.isArray(j) ? j : []).map(parseOpenLigaEvent).filter(Boolean);
  return { ...EXTRA_LEAGUES.find(l => l.key === 'bl3'), events };
}
function parseTsdbEvent(e, league) {
  const mapStatus = { NS: '未开始', FT: '已结束', HT: '中场休息', ET: '加时', PEN: '点球大战', PST: '延期', CANC: '取消', ABD: '腰斩', AWD: '判胜', WO: '弃权', LIVE: '进行中', '1H': '上半场', '2H': '下半场' };
  let status = 'pre', statusText = '未开始';
  const st = (e.strStatus || '').toUpperCase();
  if (st === 'FT' || st === 'AWD' || st === 'WO') { status = 'post'; statusText = mapStatus[st] || '已结束'; }
  else if (st === 'PST' || st === 'CANC' || st === 'ABD') { status = 'canceled'; statusText = mapStatus[st] || '取消'; }
  else if (st === 'LIVE' || st === '1H' || st === '2H' || st === 'HT' || st === 'ET' || st === 'PEN') {
    status = 'live';
    statusText = e.strProgress ? `${mapStatus[st] || '进行中'} ${e.strProgress}` : (mapStatus[st] || '进行中');
  }
  const date = e.dateEvent ? `${e.dateEvent}T${e.strTime || '00:00:00'}` : null;
  return {
    id: String(e.idEvent), leagueKey: league.key, leagueName: league.name, sport: 'football', status, statusText, startTime: date,
    home: { name: zhName(e.strHomeTeam), short: e.strHomeTeam, score: e.intHomeScore !== null && e.intHomeScore !== '' ? parseInt(e.intHomeScore, 10) : null, logo: e.strHomeTeamBadge || logoForZh(zhName(e.strHomeTeam)) },
    away: { name: zhName(e.strAwayTeam), short: e.strAwayTeam, score: e.intAwayScore !== null && e.intAwayScore !== '' ? parseInt(e.intAwayScore, 10) : null, logo: e.strAwayTeamBadge || logoForZh(zhName(e.strAwayTeam)) },
  };
}
async function fetchTsdbLeague(league) {
  const today = new Date();
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const j = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${d}&l=${league.leagueId}`, { 'User-Agent': UA });
  const events = ((j && j.events) || []).map(e => parseTsdbEvent(e, league)).filter(Boolean);
  return { ...league, events };
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; results[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return results;
}
async function withRetry(fn, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 300 * (i + 1))); }
  }
  throw lastErr;
}
function matchesPreview(ev, matches) {
  if (!matches.length) return false;
  const evStart = ev.startTime ? new Date(ev.startTime).getTime() : null;
  if (evStart === null) return false;
  for (const p of matches) {
    if (p.leagueKey !== ev.leagueKey) continue;
    if (Math.abs(evStart - p.startMs) <= PREVIEW_TOLERANCE_MS) return true;
  }
  return false;
}
const EVENT_RANK = { live: 0, pre: 1, post: 2, postponed: 3, canceled: 4 };
function compareEvents(a, b) {
  const r = (EVENT_RANK[a.status] ?? 5) - (EVENT_RANK[b.status] ?? 5);
  if (r !== 0) return r;
  const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
  const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
  return ta - tb;
}

// ---- 内存缓存 ----
let memCache = { data: null, fetchedAt: 0 };

async function buildAllData(env) {
  if (memCache.data && Date.now() - memCache.fetchedAt < CACHE_TTL_MS) {
    return { ...memCache.data, cached: true, cacheAge: Math.round((Date.now() - memCache.fetchedAt) / 1000) };
  }
  let previewMatches = previewCache.matches || [];
  let previewFetchedAt = previewCache.fetchedAt || null;
  let previewError = previewCache.error || null;
  // 无预告或预告过期(6小时)时重新抓取
  if (!previewMatches.length || (Date.now() - previewCache.fetchedAtMs > 6 * 3600 * 1000)) {
    const pv = await fetchPreview();
    previewMatches = pv.matches || [];
    previewFetchedAt = pv.fetchedAt || null;
    previewError = pv.error || null;
  }
  const allLeagues = [...ESPN_LEAGUES, ...ESPN_BASKETBALL, ...EXTRA_LEAGUES];
  const errors = [];
  const results = await mapLimit(allLeagues, 5, async (league) => {
    try {
      if (league.source === 'openligadb') return await withRetry(() => fetchOpenLiga());
      if (league.source === 'thesportsdb') return await withRetry(() => fetchTsdbLeague(league), 1);
      return await withRetry(() => fetchEspnLeague(league));
    } catch (e) {
      errors.push({ key: league.key, name: league.name, message: e.message });
      return { ...league, events: [] };
    }
  });
  const previewActive = previewMatches.length > 0;
  const filtered = results.map(lg => {
    let events = lg.events || [];
    if (previewActive) {
      const matched = events.filter(ev => matchesPreview(ev, previewMatches));
      const placeholders = [];
      for (const p of previewMatches) {
        if (p.leagueKey !== lg.key) continue;
        const already = matched.some(e => {
          const t = e.startTime ? new Date(e.startTime).getTime() : null;
          return t !== null && Math.abs(t - p.startMs) <= PREVIEW_TOLERANCE_MS;
        });
        if (!already) {
          placeholders.push({
            id: 'preview-' + lg.key + '-' + p.startMs + '-' + p.home + '-' + p.away,
            leagueKey: lg.key, leagueName: lg.name, sport: lg.sport,
            status: 'pre', statusText: '未开始', startTime: p.startTime,
            home: { name: p.home, short: p.home, score: null, logo: logoForZh(p.home) },
            away: { name: p.away, short: p.away, score: null, logo: logoForZh(p.away) },
            fromPreview: true,
          });
        }
      }
      events = [...matched, ...placeholders];
    }
    return { ...lg, events: events.slice().sort(compareEvents) };
  });
  const featured = [];
  for (const lg of filtered) for (const e of (lg.events || [])) featured.push(e);
  featured.sort(compareEvents);
  const data = {
    generatedAt: new Date().toISOString(),
    groups: GROUPS,
    preview: { active: previewActive, url: PREVIEW_URL, fetchedAt: previewFetchedAt, matchCount: previewMatches.length, error: previewError, matches: previewMatches },
    featured,
    leagues: filtered,
    errors,
  };
  memCache.data = data;
  memCache.fetchedAt = Date.now();
  return { ...data, cached: false, cacheAge: 0 };
}

// ---- HTTP 处理 ----
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}



// ---- 主入口：抓取数据并写入 data.json ----
const fs = require('fs');
async function main() {
  console.log('开始抓取数据...');
  const t0 = Date.now();
  const data = await buildAllData(null);
  const outPath = path.join(__dirname, 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(data));
  console.log('✅ data.json 已写入:', (fs.statSync(outPath).size / 1024).toFixed(1), 'KB | 精选比赛:', data.featured.length, '| 预告:', data.preview.matchCount, '| 耗时:', ((Date.now()-t0)/1000).toFixed(1)+'s');
  if (data.errors && data.errors.length) console.log('⚠️ 部分联赛错误:', data.errors.map(e => e.name).join(', '));
  process.exit(0);
}
main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
