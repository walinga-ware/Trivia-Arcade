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
