/* ===== module Config (js/core/config.js) =====
   public: TEMPLATE, STORE, fitMQ, fitH, TOPICS, STATUS, COLORS, DEF_SET0, PREF_DEF, LOCALE, DOCS_URL, docsUrl, ASA_CHAPTERS,
           asaOf
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
} = Config;
