/* ===== module Notes (js/views/notes.js) =====
   public: notesOf, openNotes, notesBadge, renderErrorsPage, parseSheet, matchTopic
   The error notebook. During an error review you write down what you got wrong ("confused class C and D VFR
   minimums"); the notes are kept per topic and come back when the topic does: on its error-review rows, on the topic
   in today's plan and in the plan wizard, and in the topic's log dialog. A practice test has its own notes (topic -1).
   Notes are saved, backed up and synced like sessions (united by id, deletions remembered). */
const Notes = (() => {
  /* longest note kept (characters); a note is never cut silently below this */
  const NOTE_MAX = 2000;
  const notesOf = i => (state.notes || []).filter(n => n.topic === i).sort((a, b) => b.date.localeCompare(a.date) || 0);
  const topicName = i => (i === -1 ? t('practiceTest') : TOPICS[i].name);
  /* the small "📝 2" mark that tells you a topic has notes */
  const notesBadge = i => {
    const n = notesOf(i).length;
    return n ? `<span class="notebadge" title="${esc(t('notesTitle'))}">📝 ${n}</span>` : '';
  };

  let cur = null; /* { topics: [i…], i, itemId } */
  const dialog = modal('#notebg', { close: '#noteClose', onClose: () => (cur = null) });

  /* open the notebook for topic i; from an error-review item, `topics` are the topics it covers and `itemId` lets
     you mark the review done from here */
  function openNotes(i, opts = {}) {
    const topics = (opts.topics || [i]).filter(x => x === -1 || TOPICS[x]);
    cur = {
      topics: topics.length ? topics : [i],
      i: topics.includes(i) ? i : (topics[0] ?? i),
      itemId: opts.itemId || null,
    };
    render();
    dialog.open('#noteIn');
  }
  function render() {
    if (!cur) return;
    const df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' });
    $('#noteTitle').textContent = `${t('notesTitle')} · ${topicName(cur.i)}`;
    $('#noteSub').textContent = t('notesSub');
    $('#notePick').hidden = cur.topics.length < 2;
    $('#notePick').innerHTML = cur.topics
      .map(x => `<option value="${x}"${x === cur.i ? ' selected' : ''}>${esc(topicName(x))}</option>`)
      .join('');
    $('#noteIn').placeholder = t('notesHint');
    $('#noteAdd').textContent = t('notesSave');
    const item = cur.itemId && findItem(cur.itemId);
    $('#noteDone').hidden = !item;
    if (item) $('#noteDone').textContent = item.check ? t('notesUndone') : t('notesDone');
    const list = notesOf(cur.i);
    $('#noteList').innerHTML = list.length
      ? list
          .map(
            n =>
              `<div class="noterow" data-nid="${esc(n.id)}"><span class="notedate">${esc(df.format(parse(n.date)))}</span><span class="notetext">${esc(n.text)}</span><button type="button" class="x" data-ndel="${esc(n.id)}" aria-label="${esc(t('del'))}">×</button></div>`
          )
          .join('')
      : `<div class="muted">${esc(t('notesEmpty'))}</div>`;
  }
  const findItem = id => {
    for (const p of state.plans || []) {
      const it = (p.items || []).find(x => x.id === id);
      if (it) return it;
    }
    return null;
  };
  function addNote() {
    const text = $('#noteIn').value.trim().slice(0, NOTE_MAX);
    if (!text || !cur) return;
    const topic = cur.i;
    commit(() => {
      state.notes = [...(state.notes || []), { id: uid(), topic, date: todayISO(), text }];
    }, t('noteAdded'));
    $('#noteIn').value = '';
    render();
    $('#noteIn').focus();
  }
  $('#noteAdd').onclick = addNote;
  $('#noteIn').addEventListener('keydown', e => {
    /* Enter adds the note (Shift+Enter for a new line); IME composition is left alone */
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      addNote();
    }
  });
  $('#notePick').onchange = e => {
    cur.i = +e.target.value;
    render();
  };
  $('#noteList').onclick = e => {
    const b = e.target.closest('[data-ndel]');
    if (!b) return;
    commit(() => {
      state.notes = (state.notes || []).filter(n => n.id !== b.dataset.ndel);
    }, t('noteDeleted'));
    render();
  };
  $('#noteDone').onclick = () => {
    if (!cur || !cur.itemId) return;
    toggleCheck(cur.itemId);
    render();
  };

  /* ---------- the Errors tab: every note, by topic and date, like a spreadsheet you can search ----------
     On top, "Review before today's session": the notes of the topics in today's plan. Then every topic with notes —
     topics in today's plan first, then the ones due for review soonest, then the most recently noted — each with its
     notes grouped by date (newest first). Search filters the text, the menu filters one topic. */
  let errNewOpen = false;
  /* every topic in alphabetical order, then the practice test; `pick` is selected */
  const topicOptions = pick =>
    [...TOPICS.map((x, i) => ({ x, i }))]
      .sort((a, b) => a.x.name.localeCompare(b.x.name))
      .map(({ x, i }) => `<option value="${i}"${String(i) === String(pick) ? ' selected' : ''}>${esc(x.name)}</option>`)
      .join('') + `<option value="-1"${String(pick) === '-1' ? ' selected' : ''}>${esc(t('practiceTest'))}</option>`;
  const dateFmt = () => new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', month: 'short', day: 'numeric' });
  const hi = (text, q) => {
    const e = esc(text);
    if (!q) return e;
    const i = text.toLowerCase().indexOf(q);
    return i < 0
      ? e
      : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  };
  function topicCard(i, list, q, compact) {
    const df = dateFmt(),
      byDate = {};
    list.forEach(n => (byDate[n.date] ??= []).push(n));
    const dates = Object.keys(byDate).sort().reverse();
    const m = i >= 0 ? srModel(i) : null,
      meta =
        i >= 0
          ? `${esc(label(state.statuses[i]))}${state.scores[i] != null ? ` · ${state.scores[i]}%` : ''}${m && m.next ? (m.next <= todayISO() ? ` · <span class="errdue">${esc(t('errDue'))}</span>` : ` · ${esc(t('errNext'))} ${esc(df.format(parse(m.next)))}`) : ''}`
          : '';
    return `<article class="errcard" data-etopic="${i}"><header><b>${esc(topicName(i))}</b><span class="errcount">${list.length}</span></header>${meta ? `<div class="errmeta">${meta}</div>` : ''}${dates
      .map(
        d =>
          `<div class="errday"><span class="errdate">${esc(df.format(parse(d)))}</span><ul>${byDate[d]
            .map(
              n =>
                `<li data-nid="${esc(n.id)}"><span>${hi(n.text, q)}</span><button type="button" class="x eed" data-eedit="${esc(n.id)}" aria-label="${esc(t('errEdit'))}" title="${esc(t('errEdit'))}">✎</button><button type="button" class="x" data-edel="${esc(n.id)}" aria-label="${esc(t('del'))}">×</button></li>`
            )
            .join('')}</ul></div>`
      )
      .join(
        ''
      )}${compact ? '' : `<button type="button" class="linkbtn erradd1" data-eadd="${i}">+ ${esc(t('notesSave'))}</button>`}</article>`;
  }
  function renderErrorsPage() {
    const q = ($('#errQ').value || '').trim().toLowerCase(),
      only = $('#errTopic').value,
      all = state.notes || [];
    $('#errQ').placeholder = t('errSearch');
    const withNotes = [...new Set(all.map(n => n.topic))];
    $('#errTopic').innerHTML =
      `<option value="">${esc(t('errAllTopics'))} (${all.length})</option>` +
      withNotes
        .sort((a, b) => topicName(a).localeCompare(topicName(b)))
        .map(
          i =>
            `<option value="${i}"${String(i) === only ? ' selected' : ''}>${esc(topicName(i))} (${notesOf(i).length})</option>`
        )
        .join('');
    if (only && !withNotes.includes(+only)) $('#errTopic').value = '';
    const sel = $('#errTopic').value;
    /* the form to add a note to any topic */
    $('#errNew').hidden = !errNewOpen;
    if (errNewOpen && !$('#errNew').innerHTML)
      $('#errNew').innerHTML =
        `<div class="errnew"><select id="errNewTopic" aria-label="${esc(t('errPickTopic'))}"><option value=""${sel === '' ? ' selected' : ''} disabled>${esc(t('errPickTopic'))}</option>${topicOptions(sel)}</select><textarea id="errNewText" rows="3" maxlength="2000" enterkeyhint="done" placeholder="${esc(t('errNewHint'))}"></textarea><div class="mbtns"><button type="button" class="primary" id="errNewSave">${esc(t('notesSave'))}</button><button type="button" id="errNewCancel">${esc(t('cancel'))}</button></div></div>`;
    if (!errNewOpen) $('#errNew').innerHTML = '';
    const match = n => (!q || n.text.toLowerCase().includes(q)) && (sel === '' || String(n.topic) === sel);
    const shown = all.filter(match);
    /* today's session first */
    const todayTopics = [
      ...new Set(
        todayPlan()
          .items.filter(it => it.kind === 'topic' || it.kind === 'reflect')
          .flatMap(it => (it.kind === 'topic' ? [it.i] : (it.parts || []).map(x => x.i)))
      ),
    ];
    const todayCards = todayTopics.filter(i => shown.some(n => n.topic === i));
    $('#errToday').innerHTML = todayCards.length
      ? `<h3 class="errh">${esc(t('errToday'))}</h3><div class="errgrid">${todayCards
          .map(i =>
            topicCard(
              i,
              shown.filter(n => n.topic === i),
              q,
              true
            )
          )
          .join('')}</div>`
      : '';
    const order = i => {
      if (i < 0) return [2, 0, 0];
      const m = srModel(i);
      return [todayTopics.includes(i) ? 0 : 1, m.next ? diffDays(todayISO(), m.next) : 999, 0];
    };
    /* topics already shown for today's session are not repeated below */
    const topics = [...new Set(shown.map(n => n.topic))]
      .filter(i => !todayCards.includes(i))
      .sort((a, b) => {
        const A = order(a),
          B = order(b);
        const la = notesOf(a)[0]?.date || '',
          lb = notesOf(b)[0]?.date || '';
        return A[0] - B[0] || A[1] - B[1] || lb.localeCompare(la);
      });
    $('#errList').innerHTML = topics.length
      ? `<h3 class="errh">${esc(t(todayCards.length ? 'errOthers' : 'errAll'))}</h3><div class="errgrid">${topics
          .map(i =>
            topicCard(
              i,
              shown.filter(n => n.topic === i),
              q,
              false
            )
          )
          .join('')}</div>`
      : todayCards.length
        ? ''
        : `<div class="pwempty">${esc(t(all.length ? 'errNoMatch' : 'errEmpty'))}</div>`;
  }
  function addFromPage(topic, text) {
    const lines = text
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);
    if (!lines.length) return;
    commit(() => {
      state.notes = [
        ...(state.notes || []),
        ...lines.map(x => ({ id: uid(), topic, date: todayISO(), text: x.slice(0, NOTE_MAX) })),
      ];
    }, t('noteAdded'));
  }
  function saveEdit(li, id) {
    const n = (state.notes || []).find(x => x.id === id);
    if (!n || !li) return renderErrorsPage();
    const text = li.querySelector('[data-etext]').value.trim(),
      to = +li.querySelector('[data-etopic]').value;
    if (!text) return li.querySelector('[data-etext]').focus();
    if (text === n.text && to === n.topic) return renderErrorsPage();
    commit(
      () => {
        const x = state.notes.find(y => y.id === id);
        x.text = text;
        x.topic = to;
      },
      to !== n.topic ? t('errMoved').replace('{t}', topicName(to)) : t('errEdited')
    );
  }
  $('#viewErrors').addEventListener('change', e => {
    if (e.target.id === 'errNewTopic') e.target.classList.remove('need');
  });
  /* in the editor: Enter is a new line (notes often have several), Ctrl/⌘ + Enter saves, Escape cancels */
  $('#viewErrors').addEventListener('keydown', e => {
    if (!e.target.matches || !e.target.matches('[data-etext]')) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
      e.preventDefault();
      const li = e.target.closest('li');
      saveEdit(li, li.querySelector('[data-esave]').dataset.esave);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      renderErrorsPage();
    }
  });
  $('#errQ').addEventListener('input', renderErrorsPage);
  $('#errTopic').addEventListener('change', renderErrorsPage);
  $('#errAdd').onclick = () => {
    errNewOpen = true;
    renderErrorsPage();
    $('#errNewText').focus();
  };
  $('#viewErrors').addEventListener('click', e => {
    const del = e.target.closest('[data-edel]');
    if (del) {
      commit(() => {
        state.notes = (state.notes || []).filter(n => n.id !== del.dataset.edel);
      }, t('noteDeleted'));
      return;
    }
    /* edit a note: its text and its topic (a note filed under the wrong topic moves to the right one) */
    const ed = e.target.closest('[data-eedit]');
    if (ed) {
      const n = (state.notes || []).find(x => x.id === ed.dataset.eedit),
        li = ed.closest('li');
      if (!n || !li) return;
      li.classList.add('editing');
      li.innerHTML = `<div class="eedit"><textarea data-etext rows="${Math.min(14, n.text.split('\n').length + 1)}" maxlength="${Math.max(NOTE_MAX, n.text.length)}" aria-label="${esc(t('errEdit'))}">${esc(n.text)}</textarea><select data-etopic aria-label="${esc(t('errMove'))}">${topicOptions(n.topic)}</select><div class="mbtns"><button type="button" class="primary" data-esave="${esc(n.id)}">${esc(t('cardSave'))}</button><button type="button" data-ecancel>${esc(t('cancel'))}</button></div></div>`;
      const ta = li.querySelector('textarea');
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      return;
    }
    if (e.target.closest('[data-ecancel]')) return renderErrorsPage();
    const sv = e.target.closest('[data-esave]');
    if (sv) return saveEdit(sv.closest('li'), sv.dataset.esave);
    const add1 = e.target.closest('[data-eadd]');
    if (add1) return openNotes(+add1.dataset.eadd);
    if (e.target.closest('#errNewCancel')) {
      errNewOpen = false;
      return renderErrorsPage();
    }
    if (e.target.closest('#errNewSave')) {
      const ts = $('#errNewTopic'),
        text = $('#errNewText').value;
      /* the topic has to be chosen: a note filed under the wrong topic would not come back with the right one */
      if (ts.value === '') {
        ts.classList.add('need');
        ts.focus();
        toast(t('errPickTopicFirst'));
        return;
      }
      const topic = +ts.value;
      errNewOpen = false;
      $('#errNew').innerHTML = '';
      addFromPage(topic, text);
      renderErrorsPage();
    }
  });

  /* ---------- import from a spreadsheet (Google Sheets / Excel: copy the rows, paste here) ----------
     Columns: Topic · Date · Notes. A cell with several lines becomes one note per line. Topic names are matched
     loosely ("Weather" → Weather Information); dates are M/D/YYYY or YYYY-MM-DD (empty → today). A note that is
     already there (same topic, date and text) is not added twice. */
  function parseSheet(text) {
    const rows = [];
    let row = [],
      cell = '',
      q = false;
    const src = text.replace(/\r\n?/g, '\n');
    for (let k = 0; k < src.length; k++) {
      const ch = src[k];
      if (q) {
        if (ch === '"' && src[k + 1] === '"') {
          cell += '"';
          k++;
        } else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter(r => r.some(c => c.trim()));
  }
  const norm = s =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  function matchTopic(name) {
    const n = norm(name);
    if (!n) return null;
    if (/^(practice )?tests?$|^simulados?$/.test(n)) return -1;
    const names = TOPICS.map(x => norm(x.name));
    let i = names.indexOf(n);
    if (i >= 0) return i;
    i = names.findIndex(x => x.startsWith(n) || n.startsWith(x));
    if (i >= 0) return i;
    i = names.findIndex(x => x.includes(n) || n.includes(x));
    if (i >= 0) return i;
    /* best word overlap (at least half of the typed words) */
    const w = n.split(' ');
    let best = null,
      score = 0;
    names.forEach((x, k) => {
      const xs = x.split(' '),
        hit = w.filter(a => xs.some(b => b.startsWith(a) || a.startsWith(b))).length / w.length;
      if (hit > score) {
        score = hit;
        best = k;
      }
    });
    return score >= 0.5 ? best : null;
  }
  function parseDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    }
    return s ? null : todayISO();
  }
  /* → { notes: [...], rows: [{ topic, name, date, n }], bad: [names or dates not understood] } */
  function readImport(text) {
    /* a line already written in the app (alone or inside a longer note of the same topic) is not added again */
    const flat = x => norm(x),
      known = {};
    (state.notes || []).forEach(n => (known[n.topic] ??= []).push(flat(n.text)));
    const have = new Set((state.notes || []).map(n => `${n.topic}|${n.date}|${n.text}`)),
      notes = [],
      rows = [],
      bad = [];
    parseSheet(text).forEach((r, k) => {
      const [name, date, body = ''] = r;
      if (k === 0 && /^(topic|t[oó]pico|category|categoria)$/i.test((name || '').trim())) return;
      const topic = matchTopic(name),
        d = parseDate(date);
      if (topic == null || !d) {
        bad.push((name || '').trim() || '?');
        return;
      }
      const lines = body
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean);
      let n = 0;
      lines.forEach(x => {
        const key = `${topic}|${d}|${x.slice(0, NOTE_MAX)}`;
        const f = flat(x);
        if (have.has(key) || (f && (known[topic] || []).some(k => k.includes(f)))) return;
        have.add(key);
        notes.push({ id: uid(), topic, date: d, text: x.slice(0, NOTE_MAX) });
        n++;
      });
      rows.push({ topic, name: topicName(topic), date: d, n });
    });
    return { notes, rows, bad };
  }
  const impDialog = modal('#impbg', { close: '#impClose' });
  let imp = null;
  function paintImport() {
    imp = readImport($('#impIn').value);
    const df = dateFmt();
    $('#impPrev').innerHTML =
      imp.rows
        .map(
          r =>
            `<div class="improw"><b>${esc(r.name)}</b><span>${esc(df.format(parse(r.date)))}</span><span>${esc(tf('impNotes', r.n))}</span></div>`
        )
        .join('') +
      (imp.bad.length ? `<div class="impbad">${esc(t('impBad'))}: ${imp.bad.map(esc).join(', ')}</div>` : '');
    $('#impOk').textContent = tf('impOk', imp.notes.length);
    $('#impOk').disabled = !imp.notes.length;
  }
  $('#errImport').onclick = () => {
    $('#impIn').value = '';
    $('#impIn').placeholder = t('impHint');
    paintImport();
    impDialog.open('#impIn');
  };
  $('#impIn').addEventListener('input', paintImport);
  $('#impCancel').onclick = impDialog.close;
  $('#impOk').onclick = () => {
    if (!imp || !imp.notes.length) return;
    const add = imp.notes;
    impDialog.close();
    commit(
      () => {
        state.notes = [...(state.notes || []), ...add];
      },
      tf('impDone', add.length)
    );
  };
  return { notesOf, openNotes, notesBadge, renderErrorsPage, parseSheet, matchTopic, readImport };
})();
const { notesOf, openNotes, notesBadge, renderErrorsPage, parseSheet, matchTopic, readImport } = Notes;
