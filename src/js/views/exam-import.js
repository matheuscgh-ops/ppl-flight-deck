/* ===== module ExamImportView (js/views/exam-import.js) =====
   public: openExamImport
   The dialog that brings in a practice test analysed by an AI: paste the JSON (or pick a .json / .txt file), check the
   preview — every topic can be changed, uncertain classifications are highlighted — and confirm. Nothing changes until
   you confirm; the import is applied whole or not at all, and the toast offers Undo. */
const ExamImportView = (() => {
  const dlg = modal('#exbg', { close: '#exClose' });
  let raw = null; /* the parsed file, edited in place by the preview */
  const msg = ([c, p]) =>
    Object.entries(p || {}).reduce((s, [k, v]) => s.replace('{' + k + '}', esc(String(v))), esc(t(c)));
  const topicSelect = (val, attrs) =>
    `<select ${attrs}><option value="">${esc(t('exUnclassified'))}</option>${TOPICS.map(
      (x, k) => `<option value="${x.id}"${k === val ? ' selected' : ''}>${esc(x.name)}</option>`
    ).join('')}</select>`;
  function render() {
    const box = $('#exPrev');
    $('#exOk').disabled = true;
    if (!raw) {
      box.innerHTML = '';
      return;
    }
    const r = checkExam(raw),
      d = r.draft,
      df = new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric', month: 'short', day: 'numeric' });
    const head = [
      d.examId ? `<b>${esc(d.examId)}</b>` : '',
      d.date && !isNaN(parse(d.date)) ? esc(df.format(parse(d.date))) : '',
      d.platform ? esc(d.platform) : '',
      d.mode ? esc(t(d.mode === 'full' ? 'exModeFull' : 'exModeErrors')) : '',
      esc(t(d.coverage === 'complete' ? 'exCovComplete' : 'exCovPartial')),
      d.total != null && d.right != null
        ? `${d.right}/${d.total} (${Math.round((100 * d.right) / d.total)}%)`
        : d.wrong != null
          ? esc(t('exWrongOnly').replace('{n}', d.wrong))
          : esc(t('exNoOverall')),
    ]
      .filter(Boolean)
      .join(' · ');
    const list = (arr, cls) =>
      arr.length ? `<ul class="exmsg ${cls}">${arr.map(x => `<li>${msg(x)}</li>`).join('')}</ul>` : '';
    /* topic results (full mode): from the file's topic rows (editable) or counted from the questions */
    const rows = Array.isArray(raw.topics) ? raw.topics : [];
    const topicTable =
      d.mode === 'full' && (d.topics.length || rows.length)
        ? `<table class="extab"><thead><tr><th>${esc(t('exTopic'))}</th><th>${esc(t('exRight'))}</th><th>${esc(t('exTotal'))}</th><th>%</th></tr></thead><tbody>${
            rows.length
              ? rows
                  .map((x, k) => {
                    const i = TOPICS.findIndex(y => y.id === x.topicId || y.name === x.topicId),
                      pct =
                        Number.isInteger(x.total) && x.total > 0 && Number.isInteger(x.right)
                          ? Math.round((100 * x.right) / x.total) + '%'
                          : '—';
                    return `<tr><td>${topicSelect(i, `data-row="${k}"`)}</td><td><input type="number" min="0" step="1" data-rk="${k}" data-f="right" value="${x.right ?? ''}"></td><td><input type="number" min="0" step="1" data-rk="${k}" data-f="total" value="${x.total ?? ''}"></td><td>${pct}</td></tr>`;
                  })
                  .join('')
              : d.topics
                  .map(
                    x =>
                      `<tr><td>${esc(TOPICS[x.i].name)}</td><td>${x.right ?? '—'}</td><td>${x.total ?? '—'}</td><td>${x.total ? Math.round((100 * x.right) / x.total) + '%' : '—'}</td></tr>`
                  )
                  .join('')
          }</tbody></table>`
        : d.mode === 'errors'
          ? `<p class="muted">${esc(t('exErrorsNote'))}</p>`
          : '';
    /* questions: every one can be re-classified; uncertain ones are highlighted */
    const qs = Array.isArray(raw.questions) ? raw.questions : [];
    const qTable = qs.length
      ? `<div class="exqhead">${esc(t('exQuestions').replace('{n}', qs.length))}${r.questions.some(q => q.unsure) ? ` · <span class="exunsure-k">${esc(t('exUnsureN').replace('{n}', r.questions.filter(q => q.unsure).length))}</span>` : ''}</div><div class="exqs">${r.questions
          .map(
            (q, k) =>
              `<div class="exq${q.unsure ? ' unsure' : ''}${q.correct === false ? ' miss' : ''}"><span class="exqn">${esc(q.qid || '#' + q.n)}</span>${topicSelect(q.i, `data-q="${k}"`)}<span class="exqr">${q.correct === true ? '✓' : q.correct === false ? '✗' : '?'}</span>${q.tags.length ? `<small>${esc(q.tags.join(', '))}</small>` : ''}${q.conf != null ? `<small>${Math.round(q.conf * 100)}%</small>` : ''}${q.doubt ? `<small class="exdoubt">${esc(q.doubt)}</small>` : ''}</div>`
          )
          .join('')}</div>`
      : '';
    box.innerHTML = `<div class="exhead">${head}</div>${list(r.errors, 'err')}${list(r.warnings, 'warn')}${topicTable}${qTable}`;
    $('#exOk').disabled = !r.exam;
  }
  function load(text) {
    const p = parseExamText(text);
    raw = p.data || null;
    if (!raw) {
      $('#exPrev').innerHTML = p.error ? `<ul class="exmsg err"><li>${esc(t(p.error))}</li></ul>` : '';
      $('#exOk').disabled = true;
      return;
    }
    render();
  }
  function openExamImport() {
    raw = null;
    $('#exIn').value = '';
    $('#exIn').placeholder = t('exPastePh');
    $('#exFile').value = '';
    $('#exPrev').innerHTML = '';
    $('#exOk').disabled = true;
    dlg.open('#exIn');
  }
  $('#exIn').addEventListener('input', () => load($('#exIn').value));
  $('#exFile').addEventListener('change', () => {
    const f = $('#exFile').files[0];
    if (!f) return;
    f.text().then(txt => {
      $('#exIn').value = txt;
      load(txt);
    });
  });
  /* edits in the preview go back into the parsed file, then everything is checked again */
  $('#exPrev').addEventListener('change', e => {
    const el = e.target;
    if (!raw) return;
    if (el.dataset.q != null) {
      const q = raw.questions[+el.dataset.q];
      q.topicId = el.value || null;
      if (el.value) q.classificationConfidence = 1; /* you chose it */
      q.doubt = el.value ? null : q.doubt;
    } else if (el.dataset.row != null) raw.topics[+el.dataset.row].topicId = el.value || null;
    else if (el.dataset.rk != null) {
      const v = el.value.trim();
      raw.topics[+el.dataset.rk][el.dataset.f] = v === '' ? null : Math.round(+v);
      const row = raw.topics[+el.dataset.rk];
      if (Number.isInteger(row.total) && Number.isInteger(row.right)) row.wrong = row.total - row.right;
    }
    $('#exIn').value = JSON.stringify(raw, null, 2);
    render();
  });
  $('#exOk').onclick = () => {
    const r = raw && checkExam(raw),
      next = r && r.exam && applyExam(r.exam);
    if (!next) {
      toast(t('exFailed'));
      return;
    }
    dlg.close();
    commit(
      () => {
        state = next;
      },
      t('exDone').replace('{id}', r.exam.examId)
    );
  };
  $('#exCancel').onclick = () => dlg.close();
  $('#exPrompt').onclick = async () => {
    const txt = examPrompt();
    try {
      await navigator.clipboard.writeText(txt);
      toast(t('exPromptCopied'));
    } catch (e) {
      /* no clipboard (file:// in some browsers): show it in the box to copy by hand */
      $('#exIn').value = txt;
      $('#exIn').select();
      toast(t('exPromptShown'));
    }
  };
  $('#tsImport').onclick = () => openExamImport();
  return { openExamImport };
})();
const { openExamImport } = ExamImportView;
