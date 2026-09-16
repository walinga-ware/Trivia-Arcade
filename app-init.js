/* All quiz data lives in quiz data JSON files (e.g. history.json, sports.json) */
const {
  COUNTRIES,
  COUNTRY_ALIASES,
  WORLD_POPULATION_RANKING,
  STATES,
  WORLD_CAPITALS,
  STATE_CAPITALS,
  STATE_POPULATION_RANKING,
  CANADA_PROVINCES,
  CANADA_PROVINCE_CAPITALS,
  CANADA_POPULATION_RANKING,
  MOUNTAIN_RANKING,
  MOUNTAIN_ALIASES,
  RIVER_RANKING,
  RIVER_ALIASES,
  OCEANS,
  OCEAN_ALIASES,
  PRESIDENTS_TERMS,
  PRESIDENT_ALIASES,
  PM_TERMS,
  PM_ALIASES,
  ENGLISH_MONARCH_TERMS,
  ENGLISH_MONARCH_ALIASES,
  ALASKA_TRIVIA,
  NEW_YORK_TRIVIA,
  MINNESOTA_TRIVIA,
  MAINE_TRIVIA,
  MARYLAND_TRIVIA,
  DELAWARE_TRIVIA,
  CONNECTICUT_TRIVIA,
  CALIFORNIA_TRIVIA,
  ONTARIO_TRIVIA,
  NEW_BRUNSWICK_TRIVIA,
  YUKON_TRIVIA,
  NBA_TEAMS,
  NBA_TEAM_ALIASES,
  NFL_TEAMS,
  NFL_TEAM_ALIASES,
  NHL_TEAMS,
  NHL_TEAM_ALIASES,
  MLB_TEAMS,
  MLB_TEAM_ALIASES
} = QUIZ_DATA;

const MOUNTAIN_LOOKUP = {};
MOUNTAIN_RANKING.forEach(([name]) => { MOUNTAIN_LOOKUP[normalize(name)] = name; });
Object.keys(MOUNTAIN_ALIASES).forEach(k => { MOUNTAIN_LOOKUP[normalize(k)] = MOUNTAIN_ALIASES[k]; });
const RIVER_LOOKUP = {};
RIVER_RANKING.forEach(([name]) => { RIVER_LOOKUP[normalize(name)] = name; });
Object.keys(RIVER_ALIASES).forEach(k => { RIVER_LOOKUP[normalize(k)] = RIVER_ALIASES[k]; });
const OCEAN_LOOKUP = {};
OCEANS.forEach(name => { OCEAN_LOOKUP[normalize(name)] = name; });
Object.keys(OCEAN_ALIASES).forEach(k => { OCEAN_LOOKUP[normalize(k)] = OCEAN_ALIASES[k]; });
const PRESIDENT_NAMES = [...new Set(PRESIDENTS_TERMS.map(t => t[0]))];
const PRESIDENT_LOOKUP = {};
// Safety net: every canonical name resolves to itself even if a manual
// alias above were ever missing.
PRESIDENT_NAMES.forEach(name => { PRESIDENT_LOOKUP[normalize(name)] = [name]; });
Object.keys(PRESIDENT_ALIASES).forEach(k => { PRESIDENT_LOOKUP[normalize(k)] = PRESIDENT_ALIASES[k]; });
const PM_NAMES = [...new Set(PM_TERMS.map(t => t[0]))];
const PM_LOOKUP = {};
PM_NAMES.forEach(name => { PM_LOOKUP[normalize(name)] = [name]; });
Object.keys(PM_ALIASES).forEach(k => { PM_LOOKUP[normalize(k)] = PM_ALIASES[k]; });

/* ============================================================
   Data: English monarchs from the Norman Conquest, followed by monarchs
   of Great Britain from the Acts of Union through the present day (1066–present),
   in chronological order. William III and Mary II are listed separately because
   both were sovereign monarchs.
   ============================================================ */
const ENGLISH_MONARCH_NAMES = [...new Set(ENGLISH_MONARCH_TERMS.map(t => t[0]))];
const ENGLISH_MONARCH_LOOKUP = {};
ENGLISH_MONARCH_NAMES.forEach(name => { ENGLISH_MONARCH_LOOKUP[normalize(name)] = [name]; });
Object.keys(ENGLISH_MONARCH_ALIASES).forEach(k => { ENGLISH_MONARCH_LOOKUP[normalize(k)] = ENGLISH_MONARCH_ALIASES[k]; });

/* ============================================================
   FREE-RECALL GAME ENGINE — US PRESIDENTS VARIANT
   Like FreeRecallGame, but:
   - results stay in chronological order (not alphabetical) and show years served
   - a guess can resolve to more than one canonical name (shared last names),
     crediting every not-yet-guessed match
   - Cleveland and Trump each occupy two chronological slots but only need
     to be guessed once
   ============================================================ */
const COUNTRY_LOOKUP = {};
COUNTRIES.forEach(c => { COUNTRY_LOOKUP[normalize(c)] = c; });
Object.keys(COUNTRY_ALIASES).forEach(k => {
  if (COUNTRY_ALIASES[k] !== null) COUNTRY_LOOKUP[normalize(k)] = COUNTRY_ALIASES[k];
});

const STATE_LOOKUP = {};
STATES.forEach(([name, abbr]) => {
  STATE_LOOKUP[normalize(name)] = name;
});

const CANADA_PROVINCE_LOOKUP = {};
CANADA_PROVINCES.forEach(name => {
  CANADA_PROVINCE_LOOKUP[normalize(name)] = name;
});
CANADA_PROVINCE_LOOKUP[normalize("BC")] = "British Columbia";
CANADA_PROVINCE_LOOKUP[normalize("PEI")] = "Prince Edward Island";
CANADA_PROVINCE_LOOKUP[normalize("Newfoundland")] = "Newfoundland and Labrador";
CANADA_PROVINCE_LOOKUP[normalize("NWT")] = "Northwest Territories";

const countriesGame = new FreeRecallGame({
  id: 'countries',
  title: 'Countries of the World',
  items: COUNTRIES,
  lookup: COUNTRY_LOOKUP,
  duration: 20*60,
  finalTitle: 'Full roll — all 193 UN member states',
  rulesHTML: `
    &middot; Every UN member state counts once — 193 total<br>
    &middot; Common nicknames and abbreviations are accepted<br>
    &middot; When time expires, the full roll is revealed with your hits marked
  `
});

const statesGame = new FreeRecallGame({
  id: 'states',
  title: 'US States',
  items: STATES.map(s => s[0]),
  lookup: STATE_LOOKUP,
  duration: 10*60,
  finalTitle: 'Full roll — all 50 US states',
  rulesHTML: `
    &middot; Every US state counts once — 50 total<br>
    &middot; Type the full state name — abbreviations don't count here<br>
    &middot; When time expires, the full roll is revealed with your hits marked
  `
});

const abbrQuiz = new PromptQuiz({
  id: 'abbr',
  pairs: STATES.map(([name, abbr]) => ({ prompt: name, answer: abbr })),
  duration: 8*60,
  mode: 'short',
  maxLength: 2,
  promptLabel: "what's the abbreviation for",
  finalRollLabel: 'Full roll — all 50 states',
  rulesHTML: `
    &middot; States appear one at a time in random order — 50 total<br>
    &middot; Type the two-letter postal abbreviation for each<br>
    &middot; Use Skip if you're stuck; the round ends when time runs out
  `
});

const worldCapitalsQuiz = new PromptQuiz({
  id: 'worldcap',
  pairs: COUNTRIES.map(name => ({
    prompt: name,
    answer: WORLD_CAPITALS[name].answer,
    aliases: WORLD_CAPITALS[name].aliases || []
  })),
  duration: 25*60,
  mode: 'text',
  promptLabel: "what's the capital of",
  finalRollLabel: 'Full roll — all 193 countries',
  rulesHTML: `
    &middot; Countries appear one at a time in random order — 193 total<br>
    &middot; Type the capital city for each<br>
    &middot; Use Skip if you're stuck; the round ends when time runs out
  `
});

const stateCapitalsQuiz = new PromptQuiz({
  id: 'statecap',
  pairs: STATES.map(([name]) => ({ prompt: name, answer: STATE_CAPITALS[name] })),
  duration: 15*60,
  mode: 'text',
  promptLabel: "what's the capital of",
  finalRollLabel: 'Full roll — all 50 states',
  rulesHTML: `
    &middot; States appear one at a time in random order — 50 total<br>
    &middot; Type the capital city for each<br>
    &middot; Use Skip if you're stuck; the round ends when you've been through all 50 or time runs out
  `
});

const canadianProvincesGame = new FreeRecallGame({
  id: 'provinces',
  title: 'Canadian Provinces',
  items: CANADA_PROVINCES,
  lookup: CANADA_PROVINCE_LOOKUP,
  duration: 5*60,
  finalTitle: 'Full roll — all 10 provinces and 3 territories',
  rulesHTML: `
    &middot; Every Canadian province and territory counts once — 13 total<br>
    &middot; Type the full name — common short forms are accepted<br>
    &middot; When time expires, the full roll is revealed with your hits marked
  `
});

const provinceCapitalsQuiz = new PromptQuiz({
  id: 'provincecap',
  pairs: CANADA_PROVINCES.map(name => ({
    prompt: name,
    answer: CANADA_PROVINCE_CAPITALS[name].answer,
    aliases: CANADA_PROVINCE_CAPITALS[name].aliases || []
  })),
  duration: 8*60,
  mode: 'text',
  promptLabel: "what's the capital of",
  finalRollLabel: 'Full roll — all 13 provinces and territories',
  rulesHTML: `
    &middot; Provinces and territories appear one at a time in random order — 13 total<br>
    &middot; Type the capital city for each<br>
    &middot; Use Skip if you're stuck; the round ends when you've been through all 13 or time runs out
  `
});
/* ============================================================
   SPORTS — PRO LEAGUE TEAM FREE RECALL QUIZZES
   ============================================================ */
const NBA_TEAM_LOOKUP = {};
NBA_TEAMS.forEach(name => { NBA_TEAM_LOOKUP[normalize(name)] = name; });
Object.keys(NBA_TEAM_ALIASES).forEach(k => { NBA_TEAM_LOOKUP[normalize(k)] = NBA_TEAM_ALIASES[k]; });

const NFL_TEAM_LOOKUP = {};
NFL_TEAMS.forEach(name => { NFL_TEAM_LOOKUP[normalize(name)] = name; });
Object.keys(NFL_TEAM_ALIASES).forEach(k => { NFL_TEAM_LOOKUP[normalize(k)] = NFL_TEAM_ALIASES[k]; });

const NHL_TEAM_LOOKUP = {};
NHL_TEAMS.forEach(name => { NHL_TEAM_LOOKUP[normalize(name)] = name; });
Object.keys(NHL_TEAM_ALIASES).forEach(k => { NHL_TEAM_LOOKUP[normalize(k)] = NHL_TEAM_ALIASES[k]; });

const MLB_TEAM_LOOKUP = {};
MLB_TEAMS.forEach(name => { MLB_TEAM_LOOKUP[normalize(name)] = name; });
Object.keys(MLB_TEAM_ALIASES).forEach(k => { MLB_TEAM_LOOKUP[normalize(k)] = MLB_TEAM_ALIASES[k]; });

const nbaGame = new FreeRecallGame({
  id: 'nba',
  title: 'NBA Teams',
  items: NBA_TEAMS,
  lookup: NBA_TEAM_LOOKUP,
  duration: 10*60,
  finalTitle: 'Full roll — all 30 NBA teams',
  rulesHTML: `
    &middot; Every NBA team counts once — 30 total<br>
    &middot; Nickname, city + nickname, or a common abbreviation are accepted — city alone doesn't count<br>
    &middot; When time expires, the full roll is revealed with your hits marked
  `
});

const mlbGame = new FreeRecallGame({
  id: 'mlb',
  title: 'MLB Teams',
  items: MLB_TEAMS,
  lookup: MLB_TEAM_LOOKUP,
  duration: 10*60,
  finalTitle: 'Full roll — all 30 MLB teams',
  rulesHTML: `
    &middot; Every MLB team counts once — 30 total<br>
    &middot; Nickname, city + nickname, or a common abbreviation are accepted — city alone doesn't count<br>
    &middot; When time expires, the full roll is revealed with your hits marked
  `
});

const nhlGame = new FreeRecallGame({
  id: 'nhl',
  title: 'NHL Teams',
  items: NHL_TEAMS,
  lookup: NHL_TEAM_LOOKUP,
  duration: 12*60,
  finalTitle: 'Full roll — all 32 NHL teams',
  rulesHTML: `
    &middot; Every NHL team counts once — 32 total<br>
    &middot; Nickname, city + nickname, or a common abbreviation are accepted — city alone doesn't count<br>
    &middot; When time expires, the full roll is revealed with your hits marked
  `
});

const nflGame = new FreeRecallGame({
  id: 'nfl',
  title: 'NFL Teams',
  items: NFL_TEAMS,
  lookup: NFL_TEAM_LOOKUP,
  duration: 12*60,
  finalTitle: 'Full roll — all 32 NFL teams',
  rulesHTML: `
    &middot; Every NFL team counts once — 32 total<br>
    &middot; Nickname, city + nickname, or a common abbreviation are accepted — city alone doesn't count<br>
    &middot; When time expires, the full roll is revealed with your hits marked
  `
});

/* ============================================================
   US STATES SHOWCASE — REGISTRY
   ============================================================
   To add a new state quiz:
     1. Add a `const XYZ_TRIVIA = [ {q, accepted, display}, ... ]`
        array above (or anywhere before this block) — same JSON-array
        shape as the existing ones.
     2. Add ONE entry to STATE_SHOWCASE_QUIZZES below.
   That's it. The home-page card, its alphabetical position, the
   screen markup, the mount point, the rules text, and the
   TriviaQuiz instance are all generated automatically just below.

   Fields:
     id        - unique, no spaces (used for URL-free screen id)
     state     - state name, used for sorting + default rules text
     subtitle  - short flavor text for the card title, e.g.
                 state "Alaska" + subtitle "Frontier Facts"
                 -> card reads "Alaska: Frontier Facts"
     questions - the JSON question array (KEEP this format)
   ============================================================ */
const STATE_SHOWCASE_QUIZZES = [
  { id: 'alaska',     state: 'Alaska',     subtitle: 'Frontier Facts',      questions: ALASKA_TRIVIA },
  { id: 'california', state: 'California', subtitle: 'Golden Genius',      questions: CALIFORNIA_TRIVIA },
  { id: 'connecticut', state: 'Connecticut', subtitle: 'Nutmeg Knowledge',  questions: CONNECTICUT_TRIVIA },
  { id: 'delaware',  state: 'Delaware',  subtitle: 'First State Facts',    questions: DELAWARE_TRIVIA },
  { id: 'maine',     state: 'Maine',     subtitle: 'Pine Puzzler',         questions: MAINE_TRIVIA },
  { id: 'maryland',  state: 'Maryland',  subtitle: 'Miscellanea',   questions: MARYLAND_TRIVIA },
  { id: 'minnesota', state: 'Minnesota', subtitle: 'Northstar Knowhow',    questions: MINNESOTA_TRIVIA },
  { id: 'newyork',   state: 'New York',  subtitle: 'Empire Smart',         questions: NEW_YORK_TRIVIA },
];

/* ---- generator: turns the registry above into cards + screens + quizzes ---- */
const stateShowcaseQuizInstances = initStateShowcase(STATE_SHOWCASE_QUIZZES);

/* ============================================================
   CANADA PROVINCES SHOWCASE — REGISTRY
   ============================================================
   Same pattern as the US States Showcase above. To add a new
   province/territory quiz:
     1. Add a `const XYZ_TRIVIA = [ {q, accepted, display}, ... ]`
        array above (or anywhere before this block) — same JSON-array
        shape as the existing ones.
     2. Add ONE entry to CANADA_SHOWCASE_QUIZZES below.
   That's it. The home-page card, its alphabetical position, the
   screen markup, the mount point, the rules text, and the
   TriviaQuiz instance are all generated automatically just below.

   Fields:
     id        - unique, no spaces (used for URL-free screen id)
     state     - province/territory name, used for sorting + default
                 rules text
     subtitle  - short flavor text for the card title, e.g.
                 state "Yukon" + subtitle "North of 60"
                 -> card reads "Yukon: North of 60"
     questions - the JSON question array (KEEP this format)
   ============================================================ */
const CANADA_SHOWCASE_QUIZZES = [
  { id: 'newbrunswick', state: 'New Brunswick', subtitle: 'Fundy Facts', questions: NEW_BRUNSWICK_TRIVIA },
  { id: 'ontario',      state: 'Ontario',       subtitle: 'Trillium Trivia',           questions: ONTARIO_TRIVIA },
  { id: 'yukon',        state: 'Yukon',         subtitle: 'North of 60',               questions: YUKON_TRIVIA },
];

/* ---- generator: turns the registry above into cards + screens + quizzes ---- */
const canadaShowcaseQuizInstances = initCanadaShowcase(CANADA_SHOWCASE_QUIZZES);
const populationMinefield = new MinefieldQuiz({
  id: 'popmine',
  items: STATE_POPULATION_RANKING,
  lookup: STATE_LOOKUP,
  itemNoun: 'state',
  itemNounPlural: 'states',
  startHint: 'most populous',
  metricLabel: 'population',
  rulesHTML: `
    &middot; Name all 50 US states in order from most to least populous<br>
    &middot; One wrong guess — including a right state in the wrong order — ends the round immediately<br>
    &middot; Each correct guess shows that state's population, rounded to the nearest million<br>
    &middot; No clock here — just don't miss
  `
});

const worldPopulationMinefield = new MinefieldQuiz({
  id: 'worldpopmine',
  items: WORLD_POPULATION_RANKING,
  lookup: COUNTRY_LOOKUP,
  fmtPop: fmtPopWorld,
  itemNoun: 'country',
  itemNounPlural: 'countries',
  startHint: 'most populous',
  metricLabel: 'population',
  rulesHTML: `
    &middot; Name all 193 countries in order from most to least populous<br>
    &middot; One wrong guess — including a right country in the wrong order — ends the round immediately<br>
    &middot; Each correct guess shows that country's population<br>
    &middot; No clock here — just don't miss
  `
});

const provincePopulationMinefield = new MinefieldQuiz({
  id: 'provpopmine',
  items: CANADA_POPULATION_RANKING,
  lookup: CANADA_PROVINCE_LOOKUP,
  fmtPop: fmtPopCA,
  itemNoun: 'province or territory',
  itemNounPlural: 'provinces and territories',
  startHint: 'most populous',
  metricLabel: 'population',
  rulesHTML: `
    &middot; Name all 10 provinces and 3 territories in order from most to least populous<br>
    &middot; One wrong guess — including a right one in the wrong order — ends the round immediately<br>
    &middot; Each correct guess shows that province or territory's population<br>
    &middot; No clock here — just don't miss
  `
});

const mountainMinefield = new MinefieldQuiz({
  id: 'mountainmine',
  items: MOUNTAIN_RANKING,
  lookup: MOUNTAIN_LOOKUP,
  fmtPop: fmtElev,
  itemNoun: 'mountain',
  itemNounPlural: 'mountains',
  startHint: 'tallest',
  metricLabel: 'elevation',
  rulesHTML: `
    &middot; Name the world's 15 highest mountains in order from tallest to shortest<br>
    &middot; One wrong guess — including a real mountain in the wrong order — ends the round immediately<br>
    &middot; Each correct guess shows that mountain's elevation<br>
    &middot; No clock here — just don't miss
  `
});

const riverMinefield = new MinefieldQuiz({
  id: 'rivermine',
  items: RIVER_RANKING,
  lookup: RIVER_LOOKUP,
  fmtPop: fmtLen,
  itemNoun: 'river',
  itemNounPlural: 'rivers',
  startHint: 'longest',
  metricLabel: 'length',
  rulesHTML: `
    &middot; Name the world's 15 longest rivers (or river systems) in order from longest to shortest<br>
    &middot; One wrong guess — including a real river in the wrong order — ends the round immediately<br>
    &middot; Each correct guess shows that river's length<br>
    &middot; No clock here — just don't miss
  `
});

const oceansGame = new FreeRecallGame({
  id: 'oceans',
  title: 'Name the Oceans',
  items: OCEANS,
  lookup: OCEAN_LOOKUP,
  duration: 1*60,
  finalTitle: 'Full roll — all 5 oceans',
  rulesHTML: `
    &middot; Every ocean counts once — 5 total<br>
    &middot; Common short forms are accepted<br>
    &middot; When time expires, the full roll is revealed with your hits marked
  `
});

const presidentsGame = new PresidentsRecallGame({
  id: 'presidents',
  title: 'US Presidents',
  terms: PRESIDENTS_TERMS,
  lookup: PRESIDENT_LOOKUP,
  duration: 10*60,
  finalTitle: 'Full roster — all 47 terms, chronological from Washington',
  rulesHTML: `
    &middot; 45 presidents across 47 terms — Some presidents served two non-consecutive terms and appear twice<br>
    &middot; Full name, last name, or common abbreviations are all accepted<br>
    &middot; A shared last name gives you credit for all presidents with that last name<br>
    &middot; When time expires, the full roster is revealed in chronological order with years served
  `
});

const pmsGame = new PresidentsRecallGame({
  id: 'pms',
  title: 'Canadian Prime Ministers',
  terms: PM_TERMS,
  lookup: PM_LOOKUP,
  duration: 6*60,
  peopleLabel: 'prime ministers',
  finalTitle: 'Full roster — all 29 terms, chronological from Macdonald',
  rulesHTML: `
    &middot; 24 prime ministers across 29 terms — several served multiple non-consecutive terms and appear more than once<br>
    &middot; Full name, last name, or common short forms are accepted<br>
    &middot; There is one last name shared between two PMs. Guessing it will give you credit for both<br>
    &middot; When time expires, the full roster is revealed in chronological order with years served
  `
});

const monarchsGame = new PresidentsRecallGame({
  id: 'monarchs',
  title: 'English & British Monarchs',
  terms: ENGLISH_MONARCH_TERMS,
  lookup: ENGLISH_MONARCH_LOOKUP,
  duration: 6*60,
  peopleLabel: 'monarchs',
  finalTitle: 'Full roster — English & British monarchs from 1066 to present',
  rulesHTML: `
    &middot; Name the English monarchs from 1066-1707, then the monarchs of Great Britain from 1707-present<br>
    &middot; Some monarchs appear twice because of their separate reigns<br>
    &middot; Full names, regnal numbers, and common historical nicknames are accepted<br>
    &middot; When time expires, the full roster is revealed in chronological order with years served
  `
});

const stateMapQuiz = new StateMapQuiz({ id:'statemap', states:STATES.map(([name])=>name) });
const findStateQuiz = new FindStateQuiz({ id:'findstate', states:STATES.map(([name])=>name) });
const findStateHardQuiz = new FindStateQuiz({ id:'findstate-hard', states:STATES.map(([name])=>name), hardMode:true });
