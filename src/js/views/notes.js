/* ===== module Notes (js/views/notes.js) =====
   public: notesOf, openNotes, notesBadge
   The error notebook. During an error review you write down what you got wrong ("confused class C and D VFR
   minimums"); the notes are kept per topic and come back when the topic does: on its error-review rows, on the topic
   in today's plan and in the plan wizard, and in the topic's log dialog. A practice test has its own notes (topic -1).
   Notes are saved, backed up and synced like sessions (united by id, deletions remembered). */
const Notes = (() => {
  const notesOf = i =>
    (state.notes || []).filter(n => n.topic === i).sort((a, b) => b.date.localeCompare(a.date) || 0);
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
    cur = { topics: topics.length ? topics : [i], i: topics.includes(i) ? i : topics[0] ?? i, itemId: opts.itemId || null };
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
    const text = $('#noteIn').value.trim().slice(0, 500);
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
  return { notesOf, openNotes, notesBadge };
})();
const { notesOf, openNotes, notesBadge } = Notes;
