/* ===== module PersonalData (js/data/personal.js) =====
   public: REAL_EVENTS, defaultState */
const PersonalData = (() => {
  /* REAL history (Sporty's Test Prep, transcribed). Topic links were inferred from question counts.
   Sessions "in progress" are kept without a score (partial) — they count as active days, not as spaced-repetition reviews. */
  const REAL_EVENTS = [
    { date: '2026-10-26', topic: 0, kind: 'study', partial: true },
    { date: '2026-10-27', topic: 16, kind: 'study', partial: true },
    { date: '2026-10-27', topic: 13, kind: 'study', score: 88 },
    { date: '2026-10-28', topic: 14, kind: 'study', partial: true },
    { date: '2026-10-28', topic: 18, kind: 'study', score: 9 },
    { date: '2026-10-29', topic: 22, kind: 'study', score: 74 },
  ];
  const REAL_TESTS = [
    { date: '2026-10-28', q: 60, score: null },
    { date: '2026-10-29', q: 60, score: 80 },
    { date: '2026-10-29', q: 60, score: null },
  ];
  function realState() {
    const scores = TOPICS.map(t => t.score);
    REAL_EVENTS.forEach(e => {
      if (e.score != null) scores[e.topic] = e.score;
    });
    return {
      v: 13,
      statuses: TOPICS.map(t => t.status),
      scores,
      events: REAL_EVENTS.map(e => ({
        id: uid(),
        from: null,
        to: null,
        score: null,
        partial: false,
        demo: false,
        ...e,
      })),
      tests: REAL_TESTS.map(x => ({ id: uid(), ...x })),
      deadline: '2026-11-30',
      lang: 'en',
      updatedAt: 0,
    };
  }
  function defaultState() {
    return realState();
  }
  return { REAL_EVENTS, defaultState };
})();
const { REAL_EVENTS, defaultState } = PersonalData;
