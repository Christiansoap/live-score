(() => {
  'use strict';

  const REFRESH_INTERVAL = 5; // 秒（最小间隔）
  const contentEl = document.getElementById('content');
  const tabsEl = document.getElementById('tabs');
  const updatedEl = document.getElementById('updatedAt');
  const countdownEl = document.getElementById('countdown');
  const refreshBtn = document.getElementById('refreshBtn');
  const errorBanner = document.getElementById('errorBanner');
  const previewBanner = document.getElementById('previewBanner');
  const sourcesEl = document.getElementById('sourcesInfo');

  let state = { groups: [], leagues: [], featured: [], errors: [], preview: null, activeGroup: 'all' };
  let countdown = REFRESH_INTERVAL;
  let timer = null;

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function teamHTML(team, isAway) {
    let logo;
    if (team.logo) {
      logo = `<img class="team-logo" src="${esc(team.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
    } else {
      // 队徽兜底：首字母彩色图标
      let letter = '?';
      let hue = 210;
      const name = String(team.name || '').trim();
      if (name) {
        letter = Array.from(name)[0] || '?';
        let h = 0;
        for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 997;
        hue = h % 360;
      }
      logo = `<span class="team-logo team-logo-fb" style="background:hsl(${hue},55%,38%)">${esc(letter)}</span>`;
    }
    return `<div class="team ${isAway ? 'away' : ''}">${logo}<span class="team-name" title="${esc(team.name)}">${esc(team.name)}</span></div>`;
  }

  function scoreHTML(homeScore, awayScore, status) {
    // 未开始的比赛不显示比分
    if (status === 'pre' || status === 'postponed') {
      return `<span class="dash">vs</span>`;
    }
    const hasHome = homeScore !== null && homeScore !== undefined;
    const hasAway = awayScore !== null && awayScore !== undefined;
    if (hasHome && hasAway) return `${homeScore}<span class="dash"> - </span>${awayScore}`;
    if (hasHome) return `${homeScore}<span class="dash"> - </span>–`;
    if (hasAway) return `–<span class="dash"> - </span>${awayScore}`;
    return `<span class="dash">-</span>`;
  }

  function statusDotClass(status) {
    if (status === 'live') return 'live';
    if (status === 'post') return 'post';
    if (status === 'canceled' || status === 'postponed') return 'canceled';
    return 'pre';
  }

  function matchCardHTML(ev) {
    const live = ev.status === 'live';
    const cls = live ? 'live' : (ev.status === 'post' ? 'post' : '');
    const timeLabel = ev.status === 'pre' ? fmtDateTime(ev.startTime) : (ev.status === 'post' ? '完场' : '');
    const dot = statusDotClass(ev.status);
    return `
      <div class="match-card ${cls}">
        <div class="match-top">
          <span class="league-tag">${esc(ev.leagueName)}</span>
          <span class="match-time">${esc(timeLabel)}</span>
        </div>
        <div class="match-row">${teamHTML(ev.home, false)}<div class="score-box">${scoreHTML(ev.home.score, ev.away.score, ev.status)}</div>${teamHTML(ev.away, true)}</div>
        <div class="status-badge">
          <span class="status-dot ${dot}"></span>
          <span class="status-text ${dot}">${esc(ev.statusText)}</span>
        </div>
      </div>`;
  }

  function leagueBlockHTML(league) {
    const events = league.events || [];
    if (!events.length) {
      return `<div class="league-block">
        <div class="league-header"><h2>${esc(league.name)}</h2><span class="league-count">暂无比赛</span></div>
        <div class="no-matches">该联赛当前暂无比赛安排</div>
      </div>`;
    }
    return `<div class="league-block">
      <div class="league-header"><h2>${esc(league.name)}</h2><span class="league-count">${events.length} 场比赛</span></div>
      <div class="match-grid">${events.map(matchCardHTML).join('')}</div>
    </div>`;
  }

  function groupSectionHTML(group) {
    const leagues = state.leagues.filter(l => l.group === group.key);
    if (!leagues.length) return '';
    // 精选模式下，仅显示有比赛的联赛
    const visible = state.preview && state.preview.active ? leagues.filter(l => (l.events || []).length > 0) : leagues;
    if (!visible.length) return '';
    return `<section class="group-section" data-group="${group.key}">
      ${visible.map(leagueBlockHTML).join('')}
    </section>`;
  }

  function renderPreviewBanner() {
    const p = state.preview;
    if (!p) { previewBanner.hidden = true; return; }
    if (p.active) {
      const time = p.fetchedAt ? fmtDateTime(p.fetchedAt) : '--';
      previewBanner.hidden = false;
      previewBanner.className = 'preview-banner';
      previewBanner.innerHTML = `<span class="pb-icon">📋</span>
        <span><span class="pb-title">精选模式已开启</span>：仅显示今日比赛预告中的 ${p.matchCount} 场比赛（进行中置顶）</span>
        <span class="pb-sub">预告更新：${time}</span>`;
    } else if (p.error) {
      previewBanner.hidden = false;
      previewBanner.className = 'preview-banner warn';
      previewBanner.innerHTML = `<span class="pb-icon">⚠️</span>
        <span><span class="pb-title">预告列表获取失败</span>：${esc(p.error)}（显示全部比赛，将自动重试）</span>`;
    } else {
      previewBanner.hidden = false;
      previewBanner.className = 'preview-banner warn';
      previewBanner.innerHTML = `<span class="pb-icon">⏳</span>
        <span><span class="pb-title">正在获取今日比赛预告</span>…</span>`;
    }
  }

  function render() {
    // 精选模式: 单一列表，进行中置顶、其余按时间排列
    if (state.preview && state.preview.active) {
      let evs = state.featured || [];
      if (state.activeGroup !== 'all') {
        evs = evs.filter(e => {
          const lg = state.leagues.find(l => l.key === e.leagueKey);
          return lg && lg.group === state.activeGroup;
        });
      }
      if (!evs.length) {
        contentEl.innerHTML = `<div class="empty">今日预告中暂无该分类比赛</div>`;
        return;
      }
      const live = evs.filter(e => e.status === 'live');
      const pre = evs.filter(e => e.status === 'pre' || e.status === 'postponed');
      const post = evs.filter(e => e.status === 'post' || e.status === 'canceled');
      const section = (title, icon, list, emptyText) => {
        if (!list.length) return '';
        return `<div class="league-block">
          <div class="league-header section-live"><h2>${icon} ${title}</h2><span class="league-count">${list.length} 场</span></div>
          <div class="match-grid">${list.map(matchCardHTML).join('')}</div>
        </div>`;
      };
      contentEl.innerHTML =
        section('进行中', '🔴', live, '暂无进行中的比赛') +
        section('未开始', '⏳', pre, '暂无未开始的比赛') +
        section('已结束', '🏁', post, '暂无已结束的比赛');
      return;
    }
    const groups = state.activeGroup === 'all' ? state.groups : state.groups.filter(g => g.key === state.activeGroup);
    if (!state.leagues.length) {
      contentEl.innerHTML = `<div class="empty">暂无任何联赛数据</div>`;
      return;
    }
    const html = groups.map(groupSectionHTML).filter(Boolean).join('');
    contentEl.innerHTML = html || `<div class="empty">该分类下暂无比赛</div>`;
  }

  function renderTabs() {
    const existing = tabsEl.querySelectorAll('.tab:not([data-group="all"])');
    existing.forEach(t => t.remove());
    state.groups.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (state.activeGroup === g.key ? ' active' : '');
      btn.dataset.group = g.key;
      btn.textContent = g.name;
      btn.addEventListener('click', () => {
        state.activeGroup = g.key;
        tabsEl.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.group === g.key));
        render();
      });
      tabsEl.appendChild(btn);
    });
    tabsEl.querySelectorAll('.tab[data-group="all"]').forEach(t => t.classList.toggle('active', state.activeGroup === 'all'));
  }

  function showError(msg) {
    if (msg) { errorBanner.hidden = false; errorBanner.textContent = msg; }
    else errorBanner.hidden = true;
  }

  async function loadData(manual = false) {
    if (manual) refreshBtn.classList.add('loading');
    try {
      let data = null;
      // 优先本地/云端 API，失败则降级到 COS 静态数据 data.json
      try {
        const res = await fetch('/api/all' + (manual ? '?refresh=1' : ''), { cache: 'no-store' });
        if (res.ok) data = await res.json();
      } catch (e) { /* 降级 */ }
      if (!data) {
        const res2 = await fetch('data.json');
        if (!res2.ok) throw new Error('HTTP ' + res2.status);
        data = await res2.json();
      }
      state.groups = data.groups || [];
      state.leagues = data.leagues || [];
      state.errors = data.errors || [];
      state.preview = data.preview || null;
      state.featured = data.featured || [];
      updatedEl.textContent = '最后更新：' + new Date(data.generatedAt || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
      const errCount = state.errors.length;
      sourcesEl.textContent = `数据源：ESPN + OpenLigaDB + TheSportsDB${errCount ? `（${errCount} 个联赛暂不可用）` : ''}`;
      if (errCount) {
        showError('部分联赛数据暂时获取失败：' + state.errors.map(e => e.name).join('、') + '（将自动重试）');
      } else {
        showError(null);
      }
      renderPreviewBanner();
      renderTabs();
      render();
    } catch (e) {
      showError('加载失败：' + e.message + '。请确认服务器已启动。');
      updatedEl.textContent = '最后更新：失败';
    } finally {
      if (manual) refreshBtn.classList.remove('loading');
    }
  }

  function startCountdown() {
    countdown = REFRESH_INTERVAL;
    countdownEl.textContent = `${countdown}s 后自动刷新`;
    clearInterval(timer);
    timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        countdown = REFRESH_INTERVAL;
        loadData(false);
      }
      countdownEl.textContent = `${countdown}s 后自动刷新`;
    }, 1000);
  }

  refreshBtn.addEventListener('click', () => {
    loadData(true);
    startCountdown();
  });

  document.querySelector('.tab[data-group="all"]').addEventListener('click', () => {
    state.activeGroup = 'all';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.group === 'all'));
    render();
  });

  // 启动
  loadData(false);
  startCountdown();
})();
