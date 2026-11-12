/* ===== module Config (js/core/config.js) =====
   public: TEMPLATE, STORE, fitMQ, fitH, TOPICS, STATUS, COLORS, DEF_SET0, PREF_DEF, LOCALE, DOCS_URL, docsUrl, ASA_CHAPTERS,
           asaOf, topicById, ACS_SOURCE, ACS_AREAS, ACS_TASK, EXAM_SHARE, examShare
   live values (getters on window, they follow your Settings): GOAL */
const Config = (() => {
  const TEMPLATE = '<!doctype html>\n' + document.documentElement.outerHTML;
  /* the demo keeps its own storage so it never touches the personal app */
  const STORE = BUILD.demo ? 'ppl-flight-deck-demo' : 'ppl-flight-deck-v13';
  const fitMQ = matchMedia('(min-width:1100px) and (min-height:1050px)');
  /* preview chart height: in fit mode it takes what the side panel can spare after the suggestions */
  const fitH = () => {
    if (!fitMQ.matches) return 250;
    const p = document.getElementById('srPanel');
    if (p) p.classList.toggle('tight', p.clientHeight < 600);
    return Math.max(80, Math.min(240, (p ? p.clientHeight : 400) - (p && p.clientHeight < 600 ? 330 : 345)));
  };
  const TOPICS = [
    { name: 'Communications, Lights and Runways', q: 101, score: 66, status: 'Todo' },
    { name: 'Traffic Patterns', q: 41, score: 57, status: 'Todo' },
    { name: 'Emergency Approach and Landing', q: 8, score: 0, status: 'Todo' },
    { name: 'Emergency Descent', q: 2, score: null, status: 'Todo' },
    { name: 'Emergency Equipment and Survival Gear', q: 4, score: null, status: 'Todo' },
    { name: 'Systems and Equipment Malfunctions', q: 19, score: 77, status: 'Todo' },
    { name: 'Navigation Systems and Radar Services', q: 47, score: 76, status: 'Todo' },
    { name: 'Pilotage and Dead Reckoning', q: 30, score: 54, status: 'Todo' },
    { name: 'Night Preparation', q: 16, score: 77, status: 'Todo' },
    { name: 'Ground Reference Maneuvers', q: 8, score: 93, status: 'Todo' },
    { name: 'Steep Turns', q: 10, score: 87, status: 'Todo' },
    { name: 'Airworthiness Requirements', q: 37, score: 78, status: 'Very Comfortable' },
    { name: 'Cross-Country Flight Planning', q: 56, score: 90, status: 'Very Comfortable' },
    { name: 'Human Factors', q: 51, score: 86, status: 'Very Comfortable' },
    { name: 'National Airspace System', q: 82, score: 76, status: 'Not Comfortable' },
    { name: 'Operation of Systems', q: 92, score: 59, status: 'Not Comfortable' },
    { name: 'Performance and Limitations', q: 114, score: 82, status: 'Very Comfortable' },
    { name: 'Pilot Qualifications', q: 72, score: 60, status: 'Doing' },
    { name: 'Weather Information', q: 158, score: 27, status: 'Very Comfortable' },
    { name: 'Before Takeoff Check', q: 8, score: 100, status: 'Very Comfortable' },
    { name: 'Flight Deck Management', q: 11, score: 100, status: 'Very Comfortable' },
    { name: 'Preflight Assessment', q: 22, score: 80, status: 'Very Comfortable' },
    { name: 'Taxiing', q: 38, score: 71, status: 'Not Comfortable' },
    { name: 'Maneuvering During Slow Flight', q: 7, score: 75, status: 'Doing' },
    { name: 'Power-Off Stalls', q: 17, score: 80, status: 'Doing' },
    { name: 'Spin Awareness', q: 7, score: 100, status: 'Todo' },
    /* Sporty's "Takeoffs, Landings, and Go-Arounds": added later, so they go at the end (saved data and every event point
       at topics by position; state.normalize fills them in for data saved with the first 26) */
    { name: 'Approach and Landing', q: 48, score: null, status: 'Todo' },
    { name: 'Takeoff and Climb', q: 19, score: null, status: 'Todo' },
  ];
  /* ASA's Prepware app (Private Pilot Airplane) groups the FAA questions in 10 broad chapters, without the Sporty's topics
     inside them. ASA_OF gives, for each topic above (same order), its main chapter and the ones it also shows up in, so a
     topic of the plan can be found there. Chapter names stay as in the Prepware app (they are not translated). */
  const ASA_CHAPTERS = [
    { name: 'Aerodynamics', q: 33 },
    { name: 'Aircraft Systems', q: 52 },
    { name: 'Flight Instruments', q: 59 },
    { name: 'Aircraft Performance', q: 73 },
    { name: 'Regulations', q: 172 },
    { name: 'Airspace and Airport Operations', q: 144 },
    { name: 'Enroute Flight and Navigation', q: 65 },
    { name: 'Weather', q: 60 },
    { name: 'Weather Service', q: 42 },
    { name: 'Human Factors', q: 36 },
  ];
  const [AERO, SYS, INST, PERF, REGS, AIRSPACE, NAV, WX, WXS, HF] = ASA_CHAPTERS.map((_, k) => k);
  const ASA_OF = [
    [AIRSPACE], // Communications, Lights and Runways
    [AIRSPACE], // Traffic Patterns
    [AERO], // Emergency Approach and Landing
    [AERO], // Emergency Descent
    [REGS], // Emergency Equipment and Survival Gear
    [SYS, INST], // Systems and Equipment Malfunctions
    [NAV], // Navigation Systems and Radar Services
    [NAV], // Pilotage and Dead Reckoning
    [HF, REGS], // Night Preparation
    [AERO], // Ground Reference Maneuvers
    [AERO], // Steep Turns
    [REGS], // Airworthiness Requirements
    [NAV, PERF], // Cross-Country Flight Planning
    [HF], // Human Factors
    [AIRSPACE, REGS], // National Airspace System
    [SYS, INST], // Operation of Systems
    [PERF, AERO], // Performance and Limitations
    [REGS], // Pilot Qualifications
    [WX, WXS], // Weather Information
    [SYS], // Before Takeoff Check
    [HF], // Flight Deck Management
    [REGS, HF], // Preflight Assessment
    [AIRSPACE], // Taxiing
    [AERO], // Maneuvering During Slow Flight
    [AERO], // Power-Off Stalls
    [AERO], // Spin Awareness
    [PERF, AERO], // Approach and Landing
    [PERF, AERO], // Takeoff and Climb
  ];
  /* { main, also: [...] } chapter names for topic i, or null */
  const asaOf = i => {
    const c = ASA_OF[i];
    return c ? { main: ASA_CHAPTERS[c[0]].name, also: c.slice(1).map(k => ASA_CHAPTERS[k].name) } : null;
  };
  /* stable id of each topic (used by imported files instead of positions): the English name in lowercase with dashes,
     "Weather Information" → "weather-information" */
  TOPICS.forEach(
    x =>
      (x.id = x.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''))
  );
  const topicById = id => TOPICS.findIndex(x => x.id === id);

  /* ================= SHARE OF THE FAA TEST (official, by ACS area) =================
     The PAR test (Private Pilot Airplane, 60 scored questions) draws its questions by Area of Operation of the Private
     Pilot ACS. ACS_AREAS holds the official share of each area; ACS_SOURCE says where it comes from and when it was
     checked. The Sporty's topics are the ACS tasks themselves (Weather Information = I.C, Approach and Landing = IV …),
     so each topic belongs to exactly one area (ACS_TASK).
       share of topic i = share of its area × (bank questions of i ÷ bank questions of the area's topics)
     The split inside an area by the size of the Sporty's bank is an APPROXIMATION (the bulletin gives areas, not tasks).
     Areas VIII (Basic Instrument Maneuvers) and XII (Postflight Procedures) have no Sporty's topic: their 9% is kept as
     "unmapped" — the forecast scores it with the average of the mapped topics (the same as spreading it over them) and
     no plan can target it. The shares add up to 100% and each one is used once: as the probability that a question of
     the test comes from that topic (never also multiplied by a number of questions). share × 60 is only a rough
     reference for how many questions of a test may come from a topic, not a count any test guarantees. */
  const ACS_SOURCE = {
    shares: 'PSI, FAA Airman Knowledge Test — PAR Information Bulletin (© March 2024)',
    sharesUrl: 'https://media.psiexams.com/faa/PAR_Information_Bulletin.pdf',
    acs: 'FAA-S-ACS-6C, Private Pilot for Airplane Category ACS (November 2023)',
    acsUrl: 'https://www.faa.gov/training_testing/testing/acs/private_airplane_acs_6.pdf',
    test: 'FAA Airman Knowledge Testing Matrix (September 25, 2026): PAR, 60 questions, passing score 70',
    checked: '2026-11-11',
    note: 'The PSI bulletin could not be read directly (its site refuses automated access); the shares were corroborated by an independent guide updated 2026-09-26 and the area and task names by the FAA ACS document.',
  };
  const ACS_AREAS = [
    { code: 'PA.I', name: 'Preflight Preparation', share: 22 },
    { code: 'PA.II', name: 'Preflight Procedures', share: 13 },
    { code: 'PA.III', name: 'Airport and Seaplane Base Operations', share: 7 },
    { code: 'PA.IV', name: 'Takeoffs, Landings, and Go-Arounds', share: 20 },
    { code: 'PA.V', name: 'Performance and Ground Reference Maneuvers', share: 3 },
    { code: 'PA.VI', name: 'Navigation', share: 8 },
    { code: 'PA.VII', name: 'Slow Flight and Stalls', share: 8 },
    { code: 'PA.VIII', name: 'Basic Instrument Maneuvers', share: 7 },
    { code: 'PA.IX', name: 'Emergency Operations', share: 7 },
    { code: 'PA.XI', name: 'Night Operations', share: 3 },
    { code: 'PA.XII', name: 'Postflight Procedures', share: 2 },
  ];
  /* the ACS task of each topic (same order as TOPICS) */
  const ACS_TASK = [
    'PA.III.A', // Communications, Lights and Runways — Communications, Light Signals, and Runway Lighting Systems
    'PA.III.B', // Traffic Patterns
    'PA.IX.B', // Emergency Approach and Landing (Simulated)
    'PA.IX.A', // Emergency Descent
    'PA.IX.D', // Emergency Equipment and Survival Gear
    'PA.IX.C', // Systems and Equipment Malfunctions
    'PA.VI.B', // Navigation Systems and Radar Services
    'PA.VI.A', // Pilotage and Dead Reckoning
    'PA.XI.A', // Night Preparation — Night Operations
    'PA.V.B', // Ground Reference Maneuvers
    'PA.V.A', // Steep Turns
    'PA.I.B', // Airworthiness Requirements
    'PA.I.D', // Cross-Country Flight Planning
    'PA.I.H', // Human Factors
    'PA.I.E', // National Airspace System
    'PA.I.G', // Operation of Systems
    'PA.I.F', // Performance and Limitations
    'PA.I.A', // Pilot Qualifications
    'PA.I.C', // Weather Information
    'PA.II.F', // Before Takeoff Check
    'PA.II.B', // Flight Deck Management
    'PA.II.A', // Preflight Assessment
    'PA.II.D', // Taxiing
    'PA.VII.A', // Maneuvering During Slow Flight
    'PA.VII.B', // Power-Off Stalls
    'PA.VII.D', // Spin Awareness
    'PA.IV.B', // Approach and Landing — Normal Approach and Landing
    'PA.IV.A', // Takeoff and Climb — Normal Takeoff and Climb
  ];
  const areaOf = i => ACS_TASK[i].split('.').slice(0, 2).join('.');
  const EXAM_SHARE = (() => {
    const areaQ = {};
    TOPICS.forEach((x, i) => (areaQ[areaOf(i)] = (areaQ[areaOf(i)] || 0) + x.q));
    const topic = TOPICS.map(
      (x, i) => (ACS_AREAS.find(a => a.code === areaOf(i)).share / 100) * (x.q / areaQ[areaOf(i)])
    );
    const mapped = topic.reduce((a, x) => a + x, 0);
    return { topic, mapped, unmapped: 1 - mapped };
  })();
  /* { area, task, areaName, share (0–1, of the whole test), areaShare (0–1), estimated: true when the area holds
     several topics (the split inside it is estimated) } */
  const examShare = i => {
    const code = areaOf(i),
      a = ACS_AREAS.find(x => x.code === code);
    return {
      area: code,
      task: ACS_TASK[i],
      areaName: a.name,
      share: EXAM_SHARE.topic[i],
      areaShare: a.share / 100,
      estimated: TOPICS.filter((_, k) => areaOf(k) === code).length > 1,
    };
  };
  const STATUS = ['Todo', 'Doing', 'Not Comfortable', 'Very Comfortable', 'To review'];
  const COLORS = ['#8590a2', '#579dff', '#f5a524', '#4bce97', '#9f8fef'];
  /* darker variants for tags drawn on the light "active day" background */
  const ONLIGHT = {
    study: '#16935e',
    review: '#7158dc',
    move: ['#5f6b7e', '#2f7de1', '#c98200', '#16935e', '#7158dc'],
  };
  const DEF_SET0 = { minutes: 180, qph: 40, testEvery: 3, reviewMin: 1.5 };
  /* everything else in Settings, with the values the app always used (so nothing changes until you change it) */
  const PREF_DEF = {
    goal: 85, // target score (%), drawn as the goal line and used for the "chance of reaching your goal"
    reviewAt: 0.9, // a topic is due for review when its recall falls to this level
    halfLife: 10, // days for a practice test to weigh half as much in the blended forecast
    idleDays: 3, // days without studying that bring the next practice test forward
    energy: 'medium', // default energy of the suggested daily plan
    carousel: true, // carousels move on their own every 3 s
    heatNums: true, // numbers on the heat-map squares
    gridStart: 6, // first hour of the plan grid
    deepMin: 45, // minutes of block per topic (deep work); 0 = no limit
    reflect: true, // an error-review item closes each study block in a plan
    asa: !BUILD.demo, // show the matching ASA Prepware chapter on each topic (off in the demo)
    ranges: {}, // default chart intervals
  };
  /* the goal follows Settings (read at the moment it is used) */
  expose({ GOAL: [() => (typeof pref === 'function' ? pref('goal') : PREF_DEF.goal), () => {}] });
  const LOCALE = { en: 'en-US', pt: 'pt-BR', ja: 'ja-JP' };
  /* the user guide on GitHub Pages: English is index.html, the other languages have their own page */
  const DOCS_URL = 'https://matheuscgh-ops.github.io/ppl-flight-deck/docs/';
  const docsUrl = l => DOCS_URL + ({ pt: 'pt.html', ja: 'ja.html' }[l] || '');
  return {
    TEMPLATE,
    STORE,
    fitMQ,
    fitH,
    TOPICS,
    STATUS,
    COLORS,
    DEF_SET0,
    PREF_DEF,
    LOCALE,
    DOCS_URL,
    docsUrl,
    ASA_CHAPTERS,
    asaOf,
    topicById,
    ACS_SOURCE,
    ACS_AREAS,
    ACS_TASK,
    EXAM_SHARE,
    examShare,
  };
})();
const {
  TEMPLATE,
  STORE,
  fitMQ,
  fitH,
  TOPICS,
  STATUS,
  COLORS,
  DEF_SET0,
  PREF_DEF,
  LOCALE,
  DOCS_URL,
  docsUrl,
  ASA_CHAPTERS,
  asaOf,
  topicById,
  ACS_SOURCE,
  ACS_AREAS,
  ACS_TASK,
  EXAM_SHARE,
  examShare,
} = Config;
