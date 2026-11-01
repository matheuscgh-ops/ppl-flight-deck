/* ===== module GistSync (js/sync/gist.js) =====
   public: syncOn, mergeStates, syncPull, schedulePush, syncConnect, syncDisconnect, renderSyncChip
   shared state (getter/setter): sync, lastPull */
const GistSync = (() => {
  /* ================= CLOUD SYNC (private GitHub Gist) =================
   The token and gist id live only in this browser (separate key) — never in the backup JSON or Save HTML.
   Every save is pushed ~1 s later; on open / focus / back online both copies are MERGED: events and tests are united
   by id (deletions are remembered), the rest comes from the newer copy. Connecting a new device always downloads. */
  const SYNC_KEY = 'ppl-flight-deck-sync',
    GIST_FILE = 'ppl-flight-deck.json',
    GH = 'https://api.github.com';
  /* the demo never syncs */
  let sync = BUILD.demo
    ? {}
    : (() => {
        try {
          return JSON.parse(localStorage.getItem(SYNC_KEY)) || {};
        } catch (e) {
          return {};
        }
      })();
  let syncStatus = sync.token ? 'idle' : 'off',
    syncTimer = null,
    syncBusy = false,
    syncAgain = false,
    lastPull = 0;
  const syncOn = () => !!(sync.token && sync.gistId);
  function syncStore() {
    if (BUILD.demo) return;
    try {
      sync.token ? localStorage.setItem(SYNC_KEY, JSON.stringify(sync)) : localStorage.removeItem(SYNC_KEY);
    } catch (e) {}
  }
  async function gh(path, opt = {}, tok = sync.token) {
    const r = await fetch(GH + path, {
      ...opt,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + tok,
        ...(opt.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!r.ok) {
      const e = new Error('GitHub ' + r.status);
      e.status = r.status;
      throw e;
    }
    return r.status === 204 ? null : r.json();
  }
  async function gistState(g) {
    const f = g && g.files && g.files[GIST_FILE];
    if (!f) return null;
    let txt = f.content;
    if (f.truncated && f.raw_url) txt = await (await fetch(f.raw_url)).text();
    try {
      return normalize(JSON.parse(txt));
    } catch (e) {
      return null;
    }
  }
  function setSync(st) {
    syncStatus = st;
    renderSyncChip();
  }
  function syncErr(e) {
    setSync(
      (e && e.status === 401) || (e && e.status === 403)
        ? 'auth'
        : e && e.status === 404
          ? 'missing'
          : !navigator.onLine || e instanceof TypeError
            ? 'offline'
            : 'error'
    );
  }
  /* merge two copies: events, tests, plans, your own cards and error notes are united by id (the newer copy wins for the same id, deleted ids stay deleted);
   everything else (lists, scores, settings, exam date, plan of the day) comes from the newer copy */
  function mergeStates(a, b) {
    const [n, o] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a],
      del = { ...(o.deleted || {}), ...(n.deleted || {}) };
    const un = (x, y) => {
      const m = new Map();
      x.forEach(i => m.set(i.id, i));
      y.forEach(i => {
        if (!m.has(i.id)) m.set(i.id, i);
      });
      return [...m.values()].filter(i => !del[i.id]);
    };
    return normalize({
      ...n,
      events: un(n.events, o.events),
      tests: un(n.tests || [], o.tests || []),
      plans: un(n.plans || [], o.plans || []),
      cards: un(n.cards || [], o.cards || []),
      notes: un(n.notes || [], o.notes || []),
      deleted: del,
      updatedAt: Math.max(a.updatedAt, b.updatedAt),
    });
  }
  const sameState = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  function adopt(remote) {
    state = remote;
    prevIds = new Set([...state.events, ...(state.tests || []), ...(state.plans || [])].map(x => x.id));
    lang = state.lang;
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch (e) {}
    render();
  }
  async function syncPush() {
    if (!syncOn()) return;
    if (syncBusy) {
      syncAgain = true;
      return;
    }
    clearTimeout(syncTimer);
    syncTimer = null;
    syncBusy = true;
    setSync('busy');
    try {
      await gh('/gists/' + sync.gistId, {
        method: 'PATCH',
        body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(state) } } }),
      });
      sync.at = Date.now();
      syncStore();
      setSync('ok');
    } catch (e) {
      syncErr(e);
    } finally {
      syncBusy = false;
      if (syncAgain) {
        syncAgain = false;
        syncPush();
      }
    }
  }
  async function syncPull(force) {
    if (!syncOn() || syncBusy || syncTimer) return;
    if (!force && Date.now() - lastPull < 8000) return;
    lastPull = Date.now();
    setSync('busy');
    try {
      const remote = await gistState(await gh('/gists/' + sync.gistId));
      if (!remote) {
        await syncPush();
      } else if (remote.updatedAt === state.updatedAt && sameState(remote, state)) {
        sync.at = Date.now();
        syncStore();
        setSync('ok');
      } else {
        const m = mergeStates(state, remote),
          changed = !sameState(m, state);
        if (changed) {
          adopt(m);
          toast(t('syncPulled'));
        }
        if (!sameState(m, remote)) {
          await syncPush();
        } else {
          sync.at = Date.now();
          syncStore();
          setSync('ok');
        }
      }
    } catch (e) {
      syncErr(e);
    }
  }
  function schedulePush() {
    if (!syncOn()) return;
    clearTimeout(syncTimer);
    setSync('pending');
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncPush();
    }, 1000);
  }
  async function syncConnect(token) {
    const user = await gh('/user', {}, token); /* validates the token */
    sync = { token, login: user.login };
    let found = null;
    for (let page = 1; page <= 5 && !found; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      found = list.find(g => g.files && g.files[GIST_FILE]);
      if (list.length < 100) break;
    }
    if (found) {
      sync.gistId = found.id;
      syncStore();
      /* connecting a device to an existing Gist always DOWNLOADS — a new phone can never overwrite the cloud copy */
      const remote = await gistState(await gh('/gists/' + found.id));
      if (remote) {
        adopt(remote);
        sync.at = Date.now();
        syncStore();
        setSync('ok');
        return 'pulled';
      }
      await syncPush();
      return 'pushed';
    }
    const g = await gh('/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: 'PPL Flight Deck — study progress (private)',
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify(state) } },
      }),
    });
    sync.gistId = g.id;
    sync.at = Date.now();
    syncStore();
    setSync('ok');
    return 'created';
  }
  function syncDisconnect() {
    clearTimeout(syncTimer);
    syncTimer = null;
    sync = {};
    syncStore();
    setSync('off');
    renderSyncDlg();
  }
  function renderSyncChip() {
    const c = $('#syncChip');
    if (!c) return;
    const map = {
      off: ['', 'syncOff'],
      idle: ['', 'syncIdle'],
      ok: ['ok', 'syncOk'],
      busy: ['busy', 'syncBusy'],
      pending: ['busy', 'syncBusy'],
      offline: ['warn', 'syncOffline'],
      auth: ['bad', 'syncAuth'],
      missing: ['bad', 'syncMissing'],
      error: ['bad', 'syncError'],
    };
    const [cls, key] = map[syncStatus] || map.off;
    c.className = 'syncchip ' + cls;
    c.querySelector('span').textContent = t(key);
    if (!$('#syncbg').hidden) renderSyncDlg();
  }
  function renderSyncDlg() {
    const on = syncOn(),
      df = new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'medium', timeStyle: 'short' });
    $('#syncOffBox').hidden = on;
    $('#syncOnBox').hidden = !on;
    if (on) {
      $('#syncWho').textContent = t('syncWho').replace('{u}', '@' + (sync.login || '?'));
      $('#syncLast').textContent = sync.at ? t('syncLast').replace('{d}', df.format(new Date(sync.at))) : '';
      $('#syncState').textContent = t(
        {
          ok: 'syncOk',
          busy: 'syncBusy',
          pending: 'syncBusy',
          offline: 'syncOffline',
          auth: 'syncAuth',
          missing: 'syncMissing',
          error: 'syncError',
        }[syncStatus] || 'syncOk'
      );
    }
  }
  function openSync() {
    $('#syncMsg').textContent = '';
    $('#syncToken').value = '';
    renderSyncDlg();
    $('#syncbg').hidden = false;
    (syncOn() ? $('#syncNow') : $('#syncToken')).focus();
  }
  const closeSync = () => {
    $('#syncbg').hidden = true;
  };
  $('#syncChip').onclick = openSync;
  $('#syncClose').onclick = closeSync;
  $('#syncbg').addEventListener('pointerdown', e => {
    if (e.target.id === 'syncbg') closeSync();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#syncbg').hidden) closeSync();
  });
  $('#syncConnect').onclick = async () => {
    const tok = $('#syncToken').value.trim();
    if (!tok) {
      $('#syncMsg').textContent = t('syncNeedToken');
      return;
    }
    const b = $('#syncConnect');
    b.disabled = true;
    $('#syncMsg').textContent = t('syncBusy');
    try {
      const how = await syncConnect(tok);
      $('#syncMsg').textContent = '';
      renderSyncDlg();
      toast(t(how === 'pulled' ? 'syncPulled' : how === 'created' ? 'syncCreated' : 'syncOk'));
    } catch (e) {
      sync = {};
      syncStore();
      setSync('off');
      $('#syncMsg').textContent = t(
        e && (e.status === 401 || e.status === 403) ? 'syncAuth' : e instanceof TypeError ? 'syncOffline' : 'syncError'
      );
    } finally {
      b.disabled = false;
    }
  };
  $('#syncNow').onclick = () => syncPull(true);
  $('#syncOff').onclick = () => {
    if (confirm(t('syncOffConfirm'))) syncDisconnect();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncPull();
  });
  window.addEventListener('focus', () => syncPull());
  window.addEventListener('online', () => {
    if (syncTimer || syncStatus === 'offline' || syncStatus === 'pending') syncPush();
    else syncPull(true);
  });
  window.addEventListener('offline', () => {
    if (syncOn()) setSync('offline');
  });
  /* last-second push when the tab closes with an unsent change */
  window.addEventListener('pagehide', () => {
    if (syncOn() && (syncTimer || syncStatus === 'offline')) {
      try {
        fetch(GH + '/gists/' + sync.gistId, {
          method: 'PATCH',
          keepalive: true,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + sync.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(state) } } }),
        });
      } catch (e) {}
    }
  });
  expose({
    sync: [
      () => sync,
      x => {
        sync = x;
      },
    ],
    lastPull: [
      () => lastPull,
      x => {
        lastPull = x;
      },
    ],
  });
  return { syncOn, mergeStates, syncPull, schedulePush, syncConnect, syncDisconnect, renderSyncChip };
})();
const { syncOn, mergeStates, syncPull, schedulePush, syncConnect, syncDisconnect, renderSyncChip } = GistSync;
