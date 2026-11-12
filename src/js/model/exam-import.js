/* ===== module ExamImport (js/model/exam-import.js) =====
   public: EXAM_SCHEMA_VERSION, parseExamText, checkExam, applyExam, examPrompt, ERROR_TYPES
   A practice test analysed by an AI (ChatGPT or another) comes in as JSON: the AI only CLASSIFIES and explains; every
   number the app uses (scores, mastery, priorities) is computed here, deterministically. No weight, difficulty or
   priority from the file is ever read.

   ================= SCHEMA (schemaVersion 1) =================
   {
     "schemaVersion": 1,
     "examId": "sportys-2026-11-10-a",        required · your own stable id for this test (same test → same id)
     "date": "2026-11-10",                     required · the day you took it (not in the future)
     "platform": "Sporty's",                   optional
     "mode": "full" | "errorsOnly",            required
     "coverage": "complete" | "partial",       complete = every question of the test is listed (by topic or one by one)
     "overall": { "total": 60, "right": 48, "wrong": 12 },     each may be null when unknown
     "topics": [ { "topicId": "weather-information", "total": 9, "right": 6, "wrong": 3, "seconds": null } ],
     "questions": [ {
         "qid": "Q17",                         optional, unique in the file
         "topicId": "weather-information",     the app's topic (null = could not classify)
         "tags": ["TAF"],                      optional sub-topics, free text — a question counts ONCE whatever its tags
         "acs": "PA.I.C.K2",                   optional, only when the ACS code can be verified
         "correct": false,                     true / false / null (unknown)
         "classificationConfidence": 0.8,      0–1, optional
         "doubt": "could also be NAS",         optional
         "errorType": "concept",               concept | misread | calculation | memory | guess | other | null
         "explanation": "…",                   optional
         "seconds": 75                         optional
     } ]
   }
   mode "full": topic results come from "topics" or are counted from "questions" (correct true/false); when both are
     given and the questions are the whole test they must agree (otherwise the questions are details, e.g. the misses). Each topic with a total gets a score; the overall score is "overall" or the sum of the topics
     (only when coverage is complete).
   mode "errorsOnly": only misses. No topic score is computed (no denominator), a topic not listed is NOT taken as known
     and none is taken as zero right; the overall score is recorded only when the overall total and wrong are known.
   Unknown values stay unknown (null) — the app never fills them in. */
const ExamImport = (() => {
  const EXAM_SCHEMA_VERSION = 1,
    ERROR_TYPES = ['concept', 'misread', 'calculation', 'memory', 'guess', 'other'],
    LOW_CONF = 0.7;
  /* JSON from a .json or .txt file or pasted text: the text itself, or the first {…} block inside it */
  function parseExamText(text) {
    const s = String(text || '').trim();
    if (!s) return { error: 'exEmpty' };
    const tryParse = x => {
      try {
        return JSON.parse(x);
      } catch (e) {
        return undefined;
      }
    };
    let o = tryParse(s);
    if (o === undefined) {
      const a = s.indexOf('{'),
        b = s.lastIndexOf('}');
      if (a >= 0 && b > a) o = tryParse(s.slice(a, b + 1));
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: 'exNotJson' };
    return { data: o };
  }
  const isCount = v => v === null || v === undefined || (Number.isInteger(v) && v >= 0);
  const cnt = v => (Number.isInteger(v) && v >= 0 ? v : null);
  const hash = s => {
    let h = 2166136261;
    for (let k = 0; k < s.length; k++) {
      h ^= s.charCodeAt(k);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  };
  /* resolve a topic: its id ("weather-information") or, as a courtesy, its exact English name */
  const topicOf = v => {
    if (typeof v !== 'string') return -1;
    const k = topicById(v.trim());
    if (k >= 0) return k;
    return TOPICS.findIndex(x => x.name.toLowerCase() === v.trim().toLowerCase());
  };
  /* validate and normalise a parsed file. Returns { errors, warnings, exam } — exam is what would be stored (null when
     there is an error). errors / warnings are [code, params] pairs (translated by the dialog). */
  function checkExam(o) {
    const E = [],
      W = [],
      err = (c, p) => E.push([c, p || {}]),
      warn = (c, p) => W.push([c, p || {}]);
    if (o.schemaVersion !== EXAM_SCHEMA_VERSION) err('exVersion', { v: o.schemaVersion });
    const examId = typeof o.examId === 'string' ? o.examId.trim().slice(0, 80) : '';
    if (!examId) err('exNoId');
    const date = typeof o.date === 'string' ? o.date.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parse(date))) err('exBadDate');
    else if (date > todayISO()) err('exFuture');
    const mode = o.mode === 'full' ? 'full' : o.mode === 'errorsOnly' || o.mode === 'errors' ? 'errors' : null;
    if (!mode) err('exBadMode');
    const coverage = o.coverage === 'complete' ? 'complete' : 'partial';
    if (o.coverage !== 'complete' && o.coverage !== 'partial') warn('exCoverageAssumed');
    const ov = o.overall && typeof o.overall === 'object' ? o.overall : {};
    ['total', 'right', 'wrong'].forEach(k => {
      if (!isCount(ov[k])) err('exBadCount', { f: 'overall.' + k });
    });
    let total = cnt(ov.total),
      right = cnt(ov.right),
      wrong = cnt(ov.wrong);
    if (total != null && right != null && right > total) err('exRightOver', { f: 'overall' });
    if (total != null && right != null && wrong != null && right + wrong !== total) err('exSum', { f: 'overall' });
    /* questions */
    const qs = Array.isArray(o.questions) ? o.questions : [],
      seenQ = new Set(),
      questions = [];
    qs.forEach((q, k) => {
      if (!q || typeof q !== 'object') return err('exBadQuestion', { n: k + 1 });
      const qid = typeof q.qid === 'string' || Number.isInteger(q.qid) ? String(q.qid).slice(0, 80) : null;
      if (qid != null) {
        if (seenQ.has(qid)) err('exDupQuestion', { q: qid });
        seenQ.add(qid);
      }
      let i = -1;
      if (q.topicId != null) {
        i = topicOf(q.topicId);
        if (i < 0) err('exUnknownTopic', { id: String(q.topicId).slice(0, 60) });
      }
      const conf = Number.isFinite(q.classificationConfidence)
        ? Math.max(0, Math.min(1, q.classificationConfidence))
        : null;
      if (q.correct !== true && q.correct !== false && q.correct != null) err('exBadQuestion', { n: k + 1 });
      if (q.errorType != null && !ERROR_TYPES.includes(q.errorType)) warn('exErrorType', { v: String(q.errorType) });
      if (!isCount(q.seconds)) err('exBadCount', { f: `questions[${k + 1}].seconds` });
      questions.push({
        n: k + 1,
        qid,
        i,
        rawTopic: q.topicId ?? null,
        tags: (Array.isArray(q.tags) ? q.tags : [])
          .filter(x => typeof x === 'string' && x.trim())
          .map(x => x.trim().slice(0, 40))
          .slice(0, 6),
        acs: typeof q.acs === 'string' && q.acs.trim() ? q.acs.trim().slice(0, 30) : null,
        correct: q.correct === true ? true : q.correct === false ? false : null,
        conf,
        doubt: typeof q.doubt === 'string' && q.doubt.trim() ? q.doubt.trim().slice(0, 300) : null,
        errorType: ERROR_TYPES.includes(q.errorType) ? q.errorType : null,
        note: typeof q.explanation === 'string' && q.explanation.trim() ? q.explanation.trim().slice(0, 500) : null,
        seconds: cnt(q.seconds),
        unsure:
          (conf != null && conf < LOW_CONF) || !!(typeof q.doubt === 'string' && q.doubt.trim()) || q.topicId == null,
      });
    });
    const unclassified = questions.filter(q => q.i < 0).length;
    if (unclassified) warn('exUnclassifiedN', { n: unclassified });
    /* topic summary rows */
    const rows = Array.isArray(o.topics) ? o.topics : [],
      byTopic = new Map();
    rows.forEach((r, k) => {
      if (!r || typeof r !== 'object') return err('exBadTopicRow', { n: k + 1 });
      const i = topicOf(r.topicId);
      if (i < 0) return err('exUnknownTopic', { id: String(r.topicId ?? '').slice(0, 60) });
      if (byTopic.has(i)) return err('exDupTopic', { t: TOPICS[i].name });
      ['total', 'right', 'wrong', 'seconds'].forEach(f => {
        if (!isCount(r[f])) err('exBadCount', { f: `${TOPICS[i].name}.${f}` });
      });
      const t = { i, total: cnt(r.total), right: cnt(r.right), wrong: cnt(r.wrong), seconds: cnt(r.seconds) };
      if (t.total != null && t.right != null && t.right > t.total) err('exRightOver', { f: TOPICS[i].name });
      if (t.total != null && t.wrong != null && t.wrong > t.total) err('exRightOver', { f: TOPICS[i].name });
      if (t.total != null && t.right != null && t.wrong != null && t.right + t.wrong !== t.total)
        err('exSum', { f: TOPICS[i].name });
      if (t.total != null && t.right == null && t.wrong != null) t.right = t.total - t.wrong;
      if (t.total != null && t.wrong == null && t.right != null) t.wrong = t.total - t.right;
      byTopic.set(i, t);
    });
    let topics = [],
      misses = [];
    if (mode === 'full') {
      /* counted from the questions with a known result */
      const fromQ = new Map();
      questions.forEach(q => {
        if (q.i < 0 || q.correct == null) return;
        const t = fromQ.get(q.i) || { i: q.i, total: 0, right: 0, wrong: 0, seconds: null };
        t.total++;
        if (q.correct) t.right++;
        else t.wrong++;
        fromQ.set(q.i, t);
      });
      const ids = new Set([...byTopic.keys(), ...fromQ.keys()]),
        allQs = total != null && questions.filter(q => q.correct != null).length === total;
      ids.forEach(i => {
        const a = byTopic.get(i),
          b = fromQ.get(i);
        /* the questions are checked against the topic rows only when they are the whole test (otherwise they are the
           details of some questions, e.g. the misses) */
        if (a && b && allQs && a.total != null && (a.total !== b.total || a.right !== b.right))
          err('exMismatch', { t: TOPICS[i].name });
        topics.push(a && a.total != null ? a : byTopic.size && !allQs ? a : b || a);
      });
      topics = topics.filter(Boolean).sort((x, y) => x.i - y.i);
      const nq = questions.filter(q => q.correct != null).length;
      if (questions.some(q => q.correct == null))
        warn('exUnknownResult', { n: questions.filter(q => q.correct == null).length });
      /* the overall result: given, or the sum of the topics when every question is accounted for */
      const sumT =
          topics.reduce((a, t) => a + (t.total || 0), 0) +
          (byTopic.size ? 0 : questions.filter(q => q.i < 0 && q.correct != null).length),
        sumR =
          topics.reduce((a, t) => a + (t.right || 0), 0) +
          (byTopic.size ? 0 : questions.filter(q => q.i < 0 && q.correct).length);
      if (coverage === 'complete' && topics.every(t => t.total != null)) {
        if (total == null && sumT) {
          total = sumT;
          right = sumR;
          wrong = sumT - sumR;
        } else if (total != null && sumT !== total && !(unclassified && sumT < total))
          err('exTotalMismatch', { a: sumT, b: total });
      }
      if (total != null && right == null && wrong != null) right = total - wrong;
      if (total != null && wrong == null && right != null) wrong = total - right;
      if (!topics.length && !nq && total == null) err('exNothing');
      topics.forEach(t => {
        if (t.total == null || t.right == null) warn('exTopicNoScore', { t: TOPICS[t.i].name });
      });
      misses = questions.filter(q => q.correct === false && q.i >= 0);
    } else if (mode === 'errors') {
      /* errors only: no topic denominators; a topic row may only say how many were missed */
      byTopic.forEach(t => {
        if (t.right != null || t.total != null) err('exErrorsNoScore', { t: TOPICS[t.i].name });
      });
      if (questions.some(q => q.correct === true)) err('exErrorsRight');
      misses = questions.filter(q => q.i >= 0);
      const listed = questions.length;
      if (wrong != null && listed > wrong) err('exMoreMisses', { a: listed, b: wrong });
      if (wrong != null && listed < wrong) warn('exFewerMisses', { a: listed, b: wrong });
      if (total != null && wrong != null) right = total - wrong;
      else right = null;
      if (right != null && right < 0) err('exSum', { f: 'overall' });
      topics = [];
      if (!listed && !byTopic.size) err('exNothing');
    }
    if (total != null && right != null && right > total) err('exRightOver', { f: 'overall' });
    /* duplicates: the same test already imported (same id, or the same content under another id) */
    const sig = hash(
      JSON.stringify([
        date,
        mode,
        total,
        right,
        topics.map(t => [t.i, t.total, t.right]),
        questions.map(q => [q.qid, q.i, q.correct]),
      ])
    );
    const dup = (state.exams || []).find(x => x.examId === examId || (x.sig && x.sig === sig));
    if (dup) err(dup.examId === examId ? 'exDupExam' : 'exDupContent', { id: dup.examId });
    if (total != null && total !== TEST_Q) warn('exNot60', { n: total });
    const exam = {
      id: uid(),
      examId,
      date,
      platform: typeof o.platform === 'string' && o.platform.trim() ? o.platform.trim().slice(0, 60) : null,
      mode,
      coverage,
      total,
      right,
      wrong,
      topics,
      misses: misses.map(q => ({
        i: q.i,
        qid: q.qid,
        tags: q.tags,
        acs: q.acs,
        conf: q.conf,
        errorType: q.errorType,
        note: q.note,
        seconds: q.seconds,
      })),
      sig,
      importedAt: Date.now(),
    };
    return { errors: E, warnings: W, exam: E.length ? null : exam, questions, draft: exam };
  }
  /* the state after the import, or null: built on a copy and checked whole (normalize) before anything is replaced,
     so a failure never leaves half an import behind */
  function applyExam(exam) {
    if (!exam) return null;
    const next = JSON.parse(JSON.stringify(state));
    next.exams = [...(next.exams || []), exam];
    if (exam.total > 0 && exam.right != null)
      next.tests = [
        ...(next.tests || []),
        {
          id: uid(),
          date: exam.date,
          q: exam.total,
          score: Math.round((100 * exam.right) / exam.total),
          right: exam.right,
          exam: exam.examId,
        },
      ];
    const n = normalize(next);
    if (!n || !n.exams.some(x => x.examId === exam.examId)) return null;
    n.exams.find(x => x.examId === exam.examId).sig = exam.sig;
    return n;
  }
  /* the prompt to give an AI with your results: the app's real topics, the schema and the rules (in English, as the AI
     reads it; it answers with JSON only) */
  function examPrompt() {
    const list = TOPICS.map(x => `- ${x.id} — ${x.name} (ACS ${ACS_TASK[TOPICS.indexOf(x)]})`).join('\n');
    return `You are helping me record a FAA Private Pilot (PAR) practice test in my study app. I will paste my results (a score report, a list of questions, or only the questions I missed). Classify them into the app's topics and answer with ONE JSON object only — no text before or after it.

RULES
- Do not invent anything. A value you do not know is null. Never guess a total, a number of right answers or a score.
- You classify and explain; the app computes every score and priority. Do not add weights, difficulty or priority fields.
- Use only these topicId values (the app's topics = tasks of the Private Pilot ACS FAA-S-ACS-6C):
${list}
- A question has ONE topicId (the main one). Put other sub-subjects in "tags" (e.g. "TAF", "density altitude"). If you cannot classify it, use topicId null and explain in "doubt".
- "acs": the ACS element code (e.g. "PA.I.C.K2") ONLY if you can verify it; otherwise null.
- "classificationConfidence": your confidence in the topicId, 0 to 1. Below 0.7 or any doubt → write the doubt.
- "errorType" for a missed question: concept | misread | calculation | memory | guess | other (or null).
- mode "full" when you have the result of every question (or right/total per topic); mode "errorsOnly" when I give only the questions I missed. In errorsOnly: no "right" or "total" per topic, every listed question has "correct": false, and "overall" has total and wrong only if I told you.
- "coverage": "complete" only if every question of the test is listed (one by one or in topic totals); otherwise "partial".
- In "full" mode, check that right ≤ total and right + wrong = total, per topic and overall.
- "examId": a short id you build from the platform and date, e.g. "sportys-2026-11-10-a" (I may change it).

FORMAT (schemaVersion 1)
{
  "schemaVersion": 1,
  "examId": "sportys-YYYY-MM-DD-a",
  "date": "YYYY-MM-DD",
  "platform": "Sporty's",
  "mode": "full",
  "coverage": "complete",
  "overall": { "total": 60, "right": null, "wrong": null },
  "topics": [ { "topicId": "weather-information", "total": null, "right": null, "wrong": null, "seconds": null } ],
  "questions": [ { "qid": null, "topicId": null, "tags": [], "acs": null, "correct": null, "classificationConfidence": null, "doubt": null, "errorType": null, "explanation": null, "seconds": null } ]
}

MY RESULTS:
`;
  }
  return { EXAM_SCHEMA_VERSION, parseExamText, checkExam, applyExam, examPrompt, ERROR_TYPES };
})();
const { EXAM_SCHEMA_VERSION, parseExamText, checkExam, applyExam, examPrompt, ERROR_TYPES } = ExamImport;
