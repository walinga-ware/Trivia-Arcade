/**
 * Unit tests for the pure helpers and the core game-engine classes in
 * game-engines.js. Focuses on scoring/matching logic (the parts most
 * likely to break silently), not DOM styling or presentation.
 */

const {
  normalize,
  fmtTime,
  minutesLabel,
  shuffled,
  fmtPopWorld,
  fmtPop,
  fmtPopCA,
  fmtElev,
  fmtLen,
  FreeRecallGame,
  MinefieldQuiz,
  PromptQuiz,
  CountryOutlineQuiz,
} = require('./game-engines');

/* ============================================================
   Helpers
   ============================================================ */
describe('normalize', () => {
  test('lowercases and trims', () => {
    expect(normalize('  France  ')).toBe('france');
  });

  test('strips accents/diacritics', () => {
    expect(normalize('Curaçao')).toBe('curacao');
    expect(normalize('Côte d\u2019Ivoire')).toBe('cote divoire');
  });

  test('strips common leading political-entity words', () => {
    expect(normalize('The Bahamas')).toBe('bahamas');
    expect(normalize('Republic of Ireland')).toBe('ireland');
    expect(normalize('Kingdom of Spain')).toBe('spain');
    expect(normalize('State of Palestine')).toBe('palestine');
    // Note: the regex only strips the bare word "federation" (not "federation of"),
    // so a leading "of " is left behind here — documenting current behavior.
    expect(normalize('Federation of Micronesia')).toBe('of micronesia');
  });

  test('removes punctuation and collapses separators/whitespace', () => {
    expect(normalize("Cote-d'Ivoire")).toBe('cote divoire');
    expect(normalize('U.S.A.')).toBe('usa');
    expect(normalize('New   York')).toBe('new york');
    expect(normalize('São_Tomé')).toBe('sao tome');
  });
});

describe('fmtTime', () => {
  test('formats seconds as m:ss', () => {
    expect(fmtTime(65)).toBe('1:05');
    expect(fmtTime(600)).toBe('10:00');
    expect(fmtTime(5)).toBe('0:05');
  });

  test('clamps negative values to zero instead of going negative', () => {
    expect(fmtTime(-5)).toBe('0:00');
  });
});

describe('minutesLabel', () => {
  test('pluralizes correctly', () => {
    expect(minutesLabel(60)).toBe('1 minute');
    expect(minutesLabel(120)).toBe('2 minutes');
  });

  test('rounds to the nearest minute', () => {
    expect(minutesLabel(150)).toBe('3 minutes'); // 2.5 -> rounds up
    expect(minutesLabel(0)).toBe('0 minutes');
  });
});

describe('shuffled', () => {
  test('returns an array with the same elements', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffled(input);
    expect(result).toHaveLength(input.length);
    expect(result.slice().sort()).toEqual(input.slice().sort());
  });

  test('does not mutate the original array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = input.slice();
    shuffled(input);
    expect(input).toEqual(copy);
  });
});

describe('population/measurement formatters', () => {
  test('fmtPopWorld uses B/M/K thresholds', () => {
    expect(fmtPopWorld(1.4e9)).toBe('1.40B');
    expect(fmtPopWorld(25e6)).toBe('25.0M');
    expect(fmtPopWorld(500e3)).toBe('500K');
  });

  test('fmtPop rounds to whole millions', () => {
    expect(fmtPop(39.5e6)).toBe('40M');
  });

  test('fmtPopCA switches between M and K', () => {
    expect(fmtPopCA(2.3e6)).toBe('2.3M');
    expect(fmtPopCA(800e3)).toBe('800K');
  });

  test('fmtElev and fmtLen add units with thousands separators', () => {
    expect(fmtElev(8849)).toBe('8,849 m');
    expect(fmtLen(1200)).toBe('1,200 km');
  });
});

/* ============================================================
   Shared DOM fixture helpers for the class-based engines
   ============================================================ */
function mountDiv(id) {
  const div = document.createElement('div');
  div.id = `${id}-mount`;
  document.body.appendChild(div);
  return div;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.useRealTimers();
});

/* ============================================================
   FreeRecallGame
   ============================================================ */
describe('FreeRecallGame', () => {
  function makeGame(overrides = {}) {
    mountDiv('recall');
    return new FreeRecallGame({
      id: 'recall',
      title: 'Name the countries',
      items: ['France', 'Germany', 'Italy'],
      lookup: { france: 'France', germany: 'Germany', italy: 'Italy' },
      duration: 120,
      rulesHTML: '',
      finalTitle: 'All countries',
      ...overrides,
    });
  }

  test('a correct guess is recorded and reported', () => {
    const game = makeGame();
    game.start();
    game.el('guess').value = 'france';
    game.submit();

    expect(game.guessed.has('France')).toBe(true);
    expect(game.el('feedback').textContent).toMatch(/France.*correct/);
  });

  test('an unrecognized guess is rejected without being counted', () => {
    const game = makeGame();
    game.start();
    game.el('guess').value = 'Atlantis';
    game.submit();

    expect(game.guessed.size).toBe(0);
    expect(game.el('feedback').textContent).toMatch(/not recognized/);
  });

  test('a repeated correct guess is flagged as a duplicate, not double-counted', () => {
    const game = makeGame();
    game.start();
    game.el('guess').value = 'France';
    game.submit();
    game.el('guess').value = 'france'; // same answer, different casing
    game.submit();

    expect(game.guessed.size).toBe(1);
    expect(game.el('feedback').textContent).toMatch(/already got/);
  });

  test('bonus items count separately from the main total', () => {
    const game = makeGame({
      bonusItems: ['Pluto'],
      bonusLookup: { pluto: 'Pluto' },
    });
    game.start();
    game.el('guess').value = 'pluto';
    game.submit();

    expect(game.guessedBonus.has('Pluto')).toBe(true);
    expect(game.guessed.size).toBe(0);
    expect(game.running).toBe(true); // bonus-only guesses don't end the round
  });

  test('guessing every item ends the round automatically', () => {
    const game = makeGame();
    game.start();
    ['france', 'germany', 'italy'].forEach((g) => {
      game.el('guess').value = g;
      game.submit();
    });

    expect(game.running).toBe(false);
    expect(game.el('finalScoreLine').textContent).toMatch(/3 of 3/);
  });

  test('reset clears progress and returns to the intro screen', () => {
    const game = makeGame();
    game.start();
    game.el('guess').value = 'france';
    game.submit();
    game.reset();

    expect(game.guessed.size).toBe(0);
    expect(game.running).toBe(false);
    expect(game.el('intro').style.display).toBe('block');
  });
});

/* ============================================================
   MinefieldQuiz (strict descending-order elimination game)
   ============================================================ */
describe('MinefieldQuiz', () => {
  function makeQuiz() {
    mountDiv('mine');
    const items = [
      ['California', 39_000_000],
      ['Texas', 29_000_000],
      ['Florida', 21_000_000],
    ];
    const lookup = {
      california: 'California',
      texas: 'Texas',
      florida: 'Florida',
    };
    return new MinefieldQuiz({ id: 'mine', items, lookup, rulesHTML: '' });
  }

  test('guessing the next item in order advances the rank', () => {
    const quiz = makeQuiz();
    quiz.start();
    quiz.el('guess').value = 'california';
    quiz.submit();

    expect(quiz.nextIndex).toBe(1);
    expect(quiz.guessedSoFar).toHaveLength(1);
    expect(quiz.running).toBe(true);
  });

  test('guessing out of order ends the round immediately', () => {
    const quiz = makeQuiz();
    quiz.start();
    quiz.el('guess').value = 'texas'; // should have been California first
    quiz.submit();

    expect(quiz.running).toBe(false);
    expect(quiz.guessedSoFar).toHaveLength(0);
    expect(quiz.el('finalScoreLine').textContent).toMatch(/0 of 3/);
  });

  test('completing every item in order ends with a perfect-run message', () => {
    const quiz = makeQuiz();
    quiz.start();
    ['california', 'texas', 'florida'].forEach((g) => {
      quiz.el('guess').value = g;
      quiz.submit();
    });

    expect(quiz.running).toBe(false);
    expect(quiz.el('finalScoreLine').textContent).toMatch(/Perfect run/);
  });

  test('giving up ends the round without penalizing what was already found', () => {
    const quiz = makeQuiz();
    quiz.start();
    quiz.el('guess').value = 'california';
    quiz.submit();
    quiz.giveUp();

    expect(quiz.running).toBe(false);
    expect(quiz.el('finalScoreLine').textContent).toMatch(/stopped after 1 of 3/);
  });
});

/* ============================================================
   PromptQuiz (prompt/answer pairs, e.g. state -> abbreviation)
   ============================================================ */
describe('PromptQuiz', () => {
  function makeQuiz(overrides = {}) {
    mountDiv('prompt');
    const pairs = [
      { prompt: 'California', answer: 'CA' },
      { prompt: 'Texas', answer: 'TX' },
    ];
    return new PromptQuiz({
      id: 'prompt',
      pairs,
      duration: 60,
      rulesHTML: '',
      promptLabel: 'state',
      finalRollLabel: 'All states',
      mode: 'short',
      maxLength: 2,
      ...overrides,
    });
  }

  test('a correct answer increments the score and advances the queue', () => {
    jest.useFakeTimers();
    const quiz = makeQuiz();
    quiz.start();
    const before = quiz.queue.length;
    quiz.el('guess').value = quiz.currentPair().answer;
    quiz.checkAnswer(true);

    expect(quiz.score).toBe(1);
    expect(quiz.queue).toHaveLength(before - 1);
  });

  test('aliases are accepted as correct answers', () => {
    jest.useFakeTimers();
    const quiz = makeQuiz({
      pairs: [{ prompt: 'Capital of France', answer: 'Paris', aliases: ['Paris, France'] }],
      mode: 'text',
    });
    quiz.start();
    quiz.el('guess').value = 'paris, france';
    quiz.checkAnswer(true);

    expect(quiz.score).toBe(1);
  });

  test('skip sends the current prompt to the back of the queue instead of dropping it', () => {
    const quiz = makeQuiz();
    quiz.start();
    const first = quiz.currentPair();
    quiz.skip();

    expect(quiz.queue).toHaveLength(2);
    expect(quiz.pairs[quiz.queue[quiz.queue.length - 1]]).toBe(first);
    expect(quiz.currentPair()).not.toBe(first);
  });

  test('an incorrect answer submitted via Enter is rejected without advancing', () => {
    jest.useFakeTimers();
    const quiz = makeQuiz();
    quiz.start();
    const before = quiz.queue.length;
    quiz.el('guess').value = 'ZZ';
    quiz.checkAnswer(true);

    expect(quiz.score).toBe(0);
    expect(quiz.queue).toHaveLength(before);
    expect(quiz.el('feedback').textContent).toMatch(/Not quite/);
  });

  test('answering every pair ends the round with a full score line', () => {
    jest.useFakeTimers();
    const quiz = makeQuiz();
    quiz.start();
    while (quiz.running) {
      quiz.el('guess').value = quiz.currentPair().answer;
      quiz.checkAnswer(true);
      jest.runOnlyPendingTimers(); // flush the setTimeout that advances showPrompt()
    }

    expect(quiz.el('finalScoreLine').textContent).toMatch(/2 of 2 correct \(100%\)/);
  });
});

/* ============================================================
   CountryOutlineQuiz (puzzle-piece map quiz)
   The engine expects global `d3` and `topojson`. We use the real d3
   geometry code (so projection/fitting is genuinely exercised) but
   stub the network fetch and the TopoJSON decode with synthetic
   countries built from small squares.
   ============================================================ */
describe('CountryOutlineQuiz', () => {
  const realD3 = require('d3');
  const flush = () => new Promise((r) => setTimeout(r, 0));

  // Clockwise ring in lon/lat (the winding d3 treats as "inside").
  // Edges are densified (like real country data) so great-circle edges don't bulge
  // past the fitted bounds the way a bare 4-vertex square would.
  const ring = (lon, lat, s) => {
    const corners = [[lon, lat], [lon, lat + s], [lon + s, lat + s], [lon + s, lat], [lon, lat]];
    const out = [];
    for (let i = 0; i < 4; i++) {
      const [x0, y0] = corners[i], [x1, y1] = corners[i + 1];
      for (let k = 0; k < 20; k++) out.push([x0 + ((x1 - x0) * k) / 20, y0 + ((y1 - y0) * k) / 20]);
    }
    out.push(corners[4]);
    return out;
  };
  const poly = (lon, lat, s) => [ring(lon, lat, s)];
  const country = (name, ...squares) => ({
    type: 'Feature',
    properties: { name },
    geometry: squares.length === 1
      ? { type: 'Polygon', coordinates: poly(...squares[0]) }
      : { type: 'MultiPolygon', coordinates: squares.map((q) => poly(...q)) },
  });

  let features;
  const LOOKUP = {
    france: 'France', germany: 'Germany', somalia: 'Somalia',
    malaysia: 'Malaysia', norway: 'Norway', 'united states': 'United States',
  };
  const STATES = Object.values(LOOKUP);

  beforeEach(() => {
    features = [];
    global.d3 = { ...realD3, json: jest.fn().mockResolvedValue({ objects: { countries: {} } }) };
    global.topojson = { feature: jest.fn(() => ({ features })) };
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.d3;
    delete global.topojson;
  });

  async function makeQuiz(overrides = {}) {
    mountDiv('outline');
    const quiz = new CountryOutlineQuiz({
      id: 'outline',
      states: STATES,
      lookup: LOOKUP,
      cfg: { noun: 'country', nounPlural: 'countries' },
      rulesHTML: '',
      ...overrides,
    });
    await flush();
    return quiz;
  }

  /* ---------- construction ---------- */
  test('uses default box size, padding, and gap when none are given', async () => {
    const quiz = await makeQuiz();
    expect(quiz.S).toBe(400);
    expect(quiz.pad).toBe(24);
    expect(quiz.gapDeg).toBe(6);
  });

  test('honors boxSize / boxPadding / gapDeg overrides', async () => {
    const quiz = await makeQuiz({ boxSize: 300, boxPadding: 10, gapDeg: 3 });
    expect([quiz.S, quiz.pad, quiz.gapDeg]).toEqual([300, 10, 3]);
  });

  /* ---------- loadMap ---------- */
  describe('loadMap', () => {
    test('groups features by canonical name and records which countries are drawable', async () => {
      features = [country('France', [0, 40, 5]), country('Germany', [10, 48, 5])];
      const quiz = await makeQuiz();

      expect(quiz.mapReady).toBe(true);
      expect([...quiz.mapNames].sort()).toEqual(['France', 'Germany']);
    });

    test('merges multiple features that resolve to the same country (e.g. Somaliland)', async () => {
      features = [country('Somalia', [41, 2, 5]), country('Somaliland', [44, 8, 3])];
      const quiz = await makeQuiz({ nameFixes: { Somaliland: 'Somalia' } });

      expect(quiz.groups.get('Somalia')).toHaveLength(2);
      expect(quiz.mapNames.size).toBe(1);
    });

    test('nameFixes take priority over the normalized lookup', async () => {
      features = [country('Fr. Guiana-ish', [0, 0, 5])];
      const quiz = await makeQuiz({ nameFixes: { 'Fr. Guiana-ish': 'France' } });
      expect(quiz.mapNames.has('France')).toBe(true);
    });

    test('resolves accented / decorated raw names through normalize()', async () => {
      features = [country('The Germany', [10, 48, 5])]; // "the " is stripped by normalize
      const quiz = await makeQuiz();
      expect(quiz.mapNames.has('Germany')).toBe(true);
    });

    test('ignores Antarctica, French Southern Lands, and unknown names', async () => {
      features = [
        country('Antarctica', [0, -80, 5]),
        country('Fr. S. Antarctic Lands', [70, -49, 2]),
        country('Atlantis', [0, 0, 5]),
        country('France', [0, 40, 5]),
      ];
      const quiz = await makeQuiz();
      expect([...quiz.mapNames]).toEqual(['France']);
    });

    test('uses topoUrl option when provided, otherwise the world-atlas CDN default', async () => {
      await makeQuiz({ topoUrl: 'https://example.test/world.json' });
      expect(global.d3.json).toHaveBeenCalledWith('https://example.test/world.json');

      document.body.innerHTML = '';
      global.d3.json.mockClear();
      await makeQuiz();
      expect(global.d3.json.mock.calls[0][0]).toMatch(/world-atlas.*countries-50m\.json/);
    });

    test('shows an error message and stays not-ready when the map fails to load', async () => {
      global.d3.json.mockRejectedValue(new Error('offline'));
      const quiz = await makeQuiz();

      expect(quiz.mapReady).toBe(false);
      expect(quiz.el('feedback').textContent).toMatch(/could not be loaded/);
      expect(quiz.el('feedback').className).toMatch(/bad/);
    });

    test('renders the current target if the round started before the map finished loading', async () => {
      features = [country('France', [0, 40, 5])];
      let resolveJson;
      global.d3.json.mockReturnValue(new Promise((r) => { resolveJson = r; }));
      const quiz = await makeQuiz();

      quiz.start(); // map not ready yet -> nothing drawn
      expect(quiz.el('map').querySelectorAll('path')).toHaveLength(0);

      // Pin the queue so the target is deterministic once the map arrives.
      quiz.queue = ['France']; quiz.idx = 0;
      resolveJson({ objects: { countries: {} } });
      await flush();

      expect(quiz.el('map').querySelectorAll('path')).toHaveLength(1);
    });
  });

  /* ---------- shapeFor: which pieces survive ---------- */
  describe('shapeFor', () => {
    const keptCount = (quiz, name) => quiz.shapeFor(name).features.length;

    test('keeps the largest landmass even for a single-polygon country', async () => {
      features = [country('France', [0, 40, 5])];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'France')).toBe(1);
    });

    test('keeps nearby islands (within the gap distance of the mainland)', async () => {
      // 10deg mainland, a 1deg island ~2deg away from its edge
      features = [country('France', [0, 40, 10], [12, 45, 1])];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'France')).toBe(2);
    });

    test('drops far-flung territories beyond the gap distance', async () => {
      features = [country('France', [0, 40, 10], [60, 45, 1])];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'France')).toBe(1);
    });

    test('chains islands: a piece near another kept piece is kept even if far from the mainland', async () => {
      // mainland -> island A (3deg gap) -> island B (3deg beyond A, ~9deg from mainland)
      features = [country('France', [0, 40, 10], [13, 40, 1], [17, 40, 1])];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'France')).toBe(3);
    });

    test('drops specks smaller than 0.02% of total area', async () => {
      // 20deg landmass vs a 0.1deg speck right next to it
      features = [country('France', [0, 40, 20], [21, 40, 0.1])];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'France')).toBe(1);
    });

    test('a smaller gapDeg makes the link distance stricter', async () => {
      features = [country('France', [0, 40, 10], [12, 45, 1])]; // ~2deg gap
      const loose = await makeQuiz({ gapDeg: 6 });
      document.body.innerHTML = '';
      const strict = await makeQuiz({ gapDeg: 1 });
      expect(keptCount(loose, 'France')).toBe(2);
      expect(keptCount(strict, 'France')).toBe(1);
    });

    test('Malaysia gets a wider link distance so Borneo stays attached', async () => {
      // ~9deg gap: dropped for a normal country, kept for Malaysia (override = 12deg)
      const squares = [[100, 2, 5], [114, 2, 5]];
      features = [country('Malaysia', ...squares), country('France', ...squares)];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'Malaysia')).toBe(2);
      expect(keptCount(quiz, 'France')).toBe(1);
    });

    test('United States keeps only the contiguous 48 (drops Alaska-like and Hawaii-like pieces)', async () => {
      // The Alaska-like piece sits within the gap distance, so without the
      // MAINLAND filter it would chain on; the filter must exclude it by centroid.
      features = [
        country('United States',
          [-120, 30, 20],   // contiguous
          [-118, 52, 8],    // Alaska-like (north of 50N, but close enough to chain)
          [-125, 18, 2]),   // Hawaii-like (south of 24N)
        country('France', [-120, 30, 20], [-118, 52, 8]),  // control: same shapes, no filter
      ];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'United States')).toBe(1);
      expect(keptCount(quiz, 'France')).toBe(2);
    });

    test('Norway drops Svalbard-latitude pieces that would otherwise chain on', async () => {
      const squares = [[5, 60, 10], [12, 70.5, 1], [15, 73, 1]]; // mainland, island, Svalbard-like
      features = [country('Norway', ...squares), country('France', ...squares)];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'Norway')).toBe(2);   // Svalbard-like piece removed
      expect(keptCount(quiz, 'France')).toBe(3);   // control: nothing filtered
    });

    test('MAINLAND filter falls back to all pieces if it would remove everything', async () => {
      // Only a polygon that fails the US contiguous-48 test (Alaska-like).
      features = [country('United States', [-150, 62, 8])];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'United States')).toBe(1);
    });

    test('fits the outline inside the padded square', async () => {
      features = [country('France', [0, 40, 10]), country('Germany', [10, 48, 2])];
      const quiz = await makeQuiz({ boxSize: 400, boxPadding: 24 });

      ['France', 'Germany'].forEach((name) => {
        const { features: fs, path } = quiz.shapeFor(name);
        const [[x0, y0], [x1, y1]] = path.bounds({ type: 'FeatureCollection', features: fs });
        expect(x0).toBeGreaterThanOrEqual(24 - 0.5);
        expect(y0).toBeGreaterThanOrEqual(24 - 0.5);
        expect(x1).toBeLessThanOrEqual(376 + 0.5);
        expect(y1).toBeLessThanOrEqual(376 + 0.5);
        // The limiting dimension should actually fill the box (size-independent scaling).
        expect(Math.max(x1 - x0, y1 - y0)).toBeCloseTo(352, 0);
      });
    });

    test('a tiny country is scaled up to the same size as a huge one', async () => {
      features = [country('France', [0, 40, 20]), country('Germany', [10, 48, 0.5])];
      const quiz = await makeQuiz();
      const extent = (name) => {
        const { features: fs, path } = quiz.shapeFor(name);
        const [[x0, y0], [x1, y1]] = path.bounds({ type: 'FeatureCollection', features: fs });
        return Math.max(x1 - x0, y1 - y0);
      };
      expect(extent('Germany')).toBeCloseTo(extent('France'), 0);
    });

    test('caches the computed shape per country', async () => {
      features = [country('France', [0, 40, 5])];
      const quiz = await makeQuiz();
      expect(quiz.shapeFor('France')).toBe(quiz.shapeFor('France'));
    });

    test('handles MultiPolygon and Polygon geometries alike', async () => {
      features = [country('France', [0, 40, 5]), country('Germany', [0, 40, 5], [8, 40, 1])];
      const quiz = await makeQuiz();
      expect(keptCount(quiz, 'France')).toBe(1);
      expect(keptCount(quiz, 'Germany')).toBe(2);
    });
  });

  /* ---------- renderTarget / drawRing / reset ---------- */
  describe('rendering', () => {
    test('renderTarget draws only the target country, tagged with its name', async () => {
      features = [country('France', [0, 40, 10], [12, 45, 1]), country('Germany', [10, 48, 5])];
      const quiz = await makeQuiz();
      quiz.queue = ['France']; quiz.idx = 0;
      quiz.renderTarget();

      const paths = quiz.el('map').querySelectorAll('path');
      expect(paths).toHaveLength(2); // mainland + island
      paths.forEach((p) => {
        expect(p.getAttribute('data-name')).toBe('France');
        expect(p.getAttribute('class')).toBe('state target');
        expect(p.getAttribute('d')).toBeTruthy();
      });
    });

    test('moving to the next target replaces the previous outline', async () => {
      features = [country('France', [0, 40, 10], [12, 45, 1]), country('Germany', [10, 48, 5])];
      const quiz = await makeQuiz();
      quiz.queue = ['France', 'Germany']; quiz.idx = 0;
      quiz.renderTarget();
      quiz.idx = 1;
      quiz.renderTarget();

      const paths = quiz.el('map').querySelectorAll('path');
      expect(paths).toHaveLength(1);
      expect(paths[0].getAttribute('data-name')).toBe('Germany');
    });

    test('renderTarget is a no-op before the map is ready or with an empty queue', async () => {
      features = [country('France', [0, 40, 5])];
      const quiz = await makeQuiz();

      quiz.queue = [];
      quiz.renderTarget();
      expect(quiz.el('map').querySelectorAll('path')).toHaveLength(0);

      quiz.queue = ['France']; quiz.mapReady = false;
      quiz.renderTarget();
      expect(quiz.el('map').querySelectorAll('path')).toHaveLength(0);
    });

    test('drawRing is disabled — no target ring is ever added', async () => {
      features = [country('France', [0, 40, 5])];
      const quiz = await makeQuiz({ cfg: { ringSmall: 1000 }, sampleSize: 1 });
      quiz.start();
      expect(quiz.el('map').querySelectorAll('.target-ring')).toHaveLength(0);
    });

    test('the map element is constrained so the square does not stretch', async () => {
      const quiz = await makeQuiz();
      expect(quiz.el('map').style.maxWidth).toBe('460px');
    });
  });

  /* ---------- round flow (inherited scoring) ---------- */
  describe('round flow', () => {
    test('start() only queues countries that are actually drawable on the map', async () => {
      features = [country('France', [0, 40, 5]), country('Germany', [10, 48, 5])];
      const quiz = await makeQuiz({ sampleSize: 10 });
      quiz.start();

      expect(quiz.queue.slice().sort()).toEqual(['France', 'Germany']);
      expect(quiz.N).toBe(2);
    });

    test('start() draws the first target outline', async () => {
      features = [country('France', [0, 40, 5]), country('Germany', [10, 48, 5])];
      const quiz = await makeQuiz({ sampleSize: 2 });
      quiz.start();

      const drawn = quiz.el('map').querySelector('path');
      expect(drawn.getAttribute('data-name')).toBe(quiz.queue[0]);
    });

    test('a correct typed answer scores and a variant spelling is accepted', async () => {
      features = [country('Germany', [10, 48, 5])];
      const quiz = await makeQuiz({ sampleSize: 1 });
      quiz.start();
      quiz.el('guess').value = '  GERMANY ';
      quiz.submit();

      expect(quiz.score).toBe(1);
      expect(quiz.el('feedback').textContent).toMatch(/Germany.*correct/);
    });

    test('a wrong answer does not score and reveals the real country', async () => {
      features = [country('Germany', [10, 48, 5])];
      const quiz = await makeQuiz({ sampleSize: 1 });
      quiz.start();
      quiz.el('guess').value = 'France';
      quiz.submit();

      expect(quiz.score).toBe(0);
      expect(quiz.el('feedback').textContent).toMatch(/answer is Germany/);
    });

    test('finishing the round shows the final score and a per-country result grid', async () => {
      features = [country('France', [0, 40, 5]), country('Germany', [10, 48, 5])];
      const quiz = await makeQuiz({ sampleSize: 2 });
      quiz.start();

      quiz.el('guess').value = quiz.queue[0]; quiz.submit(); quiz.next();
      quiz.el('guess').value = 'wrong'; quiz.submit(); quiz.next();

      expect(quiz.el('finalScoreLine').textContent).toMatch(/1 of 2 countries \(50%\)/);
      const hits = quiz.el('finalGrid').querySelectorAll('.item.hit');
      const misses = quiz.el('finalGrid').querySelectorAll('.item.miss');
      expect([hits.length, misses.length]).toEqual([1, 1]);
    });

    test('reset() clears the outline and returns to the intro screen', async () => {
      features = [country('France', [0, 40, 5])];
      const quiz = await makeQuiz({ sampleSize: 1 });
      quiz.start();
      expect(quiz.el('map').querySelectorAll('path').length).toBeGreaterThan(0);

      quiz.reset();
      expect(quiz.el('map').querySelectorAll('path')).toHaveLength(0);
      expect(quiz.score).toBe(0);
      expect(quiz.el('intro').style.display).toBe('block');
    });
  });
});
