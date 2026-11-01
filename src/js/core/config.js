/* ===== module Config (js/core/config.js) =====
   public: TEMPLATE, STORE, fitMQ, fitH, TOPICS, STATUS, COLORS, DEF_SET0, PREF_DEF, LOCALE, DOCS_URL, docsUrl
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
  ];
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
    ranges: {}, // default chart intervals
  };
  /* the goal follows Settings (read at the moment it is used) */
  expose({ GOAL: [() => (typeof pref === 'function' ? pref('goal') : PREF_DEF.goal), () => {}] });
  const LOCALE = { en: 'en-US', pt: 'pt-BR', ja: 'ja-JP' };
  /* the user guide on GitHub Pages: English is index.html, the other languages have their own page */
  const DOCS_URL = 'https://matheuscgh-ops.github.io/ppl-flight-deck/docs/';
  const docsUrl = l => DOCS_URL + ({ pt: 'pt.html', ja: 'ja.html' }[l] || '');
  return { TEMPLATE, STORE, fitMQ, fitH, TOPICS, STATUS, COLORS, DEF_SET0, PREF_DEF, LOCALE, DOCS_URL, docsUrl };
})();
const { TEMPLATE, STORE, fitMQ, fitH, TOPICS, STATUS, COLORS, DEF_SET0, PREF_DEF, LOCALE, DOCS_URL, docsUrl } = Config;
