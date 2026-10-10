function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  window.scrollTo({top:0, behavior:'instant'});
}

/* ============================================================
   Shared helpers
   ============================================================ */
function normalize(str){
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/^(the|republic of|kingdom of|state of|federation)\s+/,"")
    .replace(/[.'’,]/g,"")
    .replace(/[-_]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function fmtTime(sec){
  const m = Math.max(0, Math.floor(sec/60));
  const s = Math.max(0, sec%60);
  return `${m}:${s.toString().padStart(2,"0")}`;
}
// Single source of truth for "X minutes" copy. Every place that needs to say
// how long a timed game takes (home-page card blurb, in-game rules text)
// should call this instead of hardcoding a number, so changing a game's
// `duration` (in seconds) automatically updates all of the copy about it.
function minutesLabel(seconds){
  const mins = Math.round(seconds / 60);
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}
function shuffled(arr){
  const a = arr.slice();
  for (let i = a.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function fmtPopWorld(pop){
  if (pop >= 1e9) return `${(pop/1e9).toFixed(2)}B`;
  if (pop >= 1e6) return `${(pop/1e6).toFixed(1)}M`;
  return `${Math.round(pop/1e3)}K`;
}

/* ============================================================
   Data: US states + postal abbreviations
   ============================================================ */

function fmtPop(pop){ return `${Math.round(pop/1e6)}M`; }

function fmtPopCA(pop){
  return pop >= 1e6 ? `${(pop/1e6).toFixed(1)}M` : `${Math.round(pop/1e3)}K`;
}

/* ============================================================
   Data: world's highest mountains by elevation, descending
   (source: peak elevations, generally-cited figures in meters)
   ============================================================ */

function fmtElev(elev){ return `${elev.toLocaleString()} m`; }


function fmtLen(len){ return `${len.toLocaleString()} km`; }


/* ============================================================
   FREE-RECALL GAME ENGINE (countries, states, etc.)
   ============================================================ */
function freeRecallHTML(id, title){
  return `
    <div id="${id}-intro">
      <div class="plate" style="margin-bottom:18px;">
        <div class="label">rules</div>
        <div style="font-size:14px; line-height:1.7; color:var(--paper);" id="${id}-rules"></div>
      </div>
      <button class="btn-primary" id="${id}-startBtn">Begin — start the clock</button>
    </div>

    <div class="game" id="${id}-game" style="display:none;">
      <h3>${title}</h3>
      <div class="top-row">
        <div class="plate timer" id="${id}-timerPlate">
          <div class="label">time remaining</div>
          <div class="value" id="${id}-timerValue">--:--</div>
        </div>
        <div class="plate">
          <div class="label">score</div>
          <div class="value" id="${id}-scoreValue">0</div>
        </div>
      </div>
      <div class="entry">
        <input type="text" id="${id}-guess" placeholder="Type an answer…" autocomplete="off">
        <button id="${id}-endBtn" title="End the round now">End round</button>
      </div>
      <div class="feedback" id="${id}-feedback"></div>
      <div class="section-title"><span>Guessed so far</span><span id="${id}-guessedCount">0</span></div>
      <div id="${id}-guessedList" class="guessed-grid">
        <div class="empty-note">Nothing yet — start typing.</div>
      </div>
    </div>

    <div class="results" id="${id}-results" style="display:none;">
      <button id="${id}-resetBtn" class="play-again-top">Play again</button>
      <div class="final-score" id="${id}-finalScoreLine"></div>
      <div class="section-title"><span id="${id}-finalTitle"></span><span>Your hits in green</span></div>
      <div id="${id}-finalGrid" class="final-grid"></div>
    </div>
  `;
}

class FreeRecallGame{
  constructor(opts){
    this.id = opts.id;
    this.title = opts.title;
    this.items = opts.items;          // canonical display list
    this.lookup = opts.lookup;        // normalized-key -> canonical
    this.duration = opts.duration;    // seconds
    this.rulesHTML = opts.rulesHTML;
    this.finalTitle = opts.finalTitle;
    // By default, both the "guessed so far" list and the final results
    // grid are sorted alphabetically. Pass `preserveOrder: true` when
    // `items` already comes in a meaningful order (e.g. atomic number)
    // that should be kept as-is instead of being re-sorted alphabetically.
    this.preserveOrder = !!opts.preserveOrder;
    // Optional bonus items: guessable extras that don't count toward the
    // main "X / N" total (e.g. Pluto in a "name the planets" game). Pass
    // `bonusItems` (canonical names) + `bonusLookup` (normalized-key ->
    // canonical bonus name) together; `bonusNote` is a short aside shown
    // next to each bonus item (e.g. "now classified as a dwarf planet").
    this.bonusItems = opts.bonusItems || [];
    this.bonusLookup = opts.bonusLookup || {};
    this.bonusNote = opts.bonusNote || '';

    this.guessed = new Set();
    this.guessedBonus = new Set();
    this.timeLeft = this.duration;
    this.timerId = null;
    this.running = false;

    document.getElementById(`${this.id}-mount`).innerHTML = freeRecallHTML(this.id, this.title);
    document.getElementById(`${this.id}-rules`).innerHTML = `
      &middot; ${minutesLabel(this.duration)} on the clock, starting when you hit begin<br>
      ${this.rulesHTML}
    `;
    document.getElementById(`${this.id}-finalTitle`).textContent = this.finalTitle;
    const metaEl = document.getElementById(`${this.id}-meta`);
    if (metaEl) metaEl.textContent = minutesLabel(this.duration);

    this.el = key => document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click', () => this.start());
    this.el('endBtn').addEventListener('click', () => this.end());
    this.el('resetBtn').addEventListener('click', () => this.reset());
    this.el('guess').addEventListener('keydown', e => { if (e.key === 'Enter') this.submit(); });
    this.el('guess').addEventListener('input', () => {
      if (!this.running) return;
      const key = normalize(this.el('guess').value);
      if (key && (this.lookup[key] || this.bonusLookup[key])) this.submit();
    });

    this.updateTimerDisplay();
  }

  start(){
    this.el('intro').style.display = 'none';
    this.el('game').style.display = 'block';
    this.running = true;
    this.timeLeft = this.duration;
    this.updateTimerDisplay();
    this.el('guess').disabled = false;
    this.el('guess').focus();
    this.timerId = setInterval(() => this.tick(), 1000);
  }

  tick(){
    this.timeLeft--;
    this.updateTimerDisplay();
    if (this.timeLeft <= 0) this.end();
  }

  updateTimerDisplay(){
    this.el('timerValue').textContent = fmtTime(this.timeLeft);
    this.el('timerPlate').classList.toggle('low', this.timeLeft <= 60);
  }

  submit(){
    if (!this.running) return;
    const raw = this.el('guess').value;
    if (!raw.trim()) return;
    const key = normalize(raw);
    const canonical = this.lookup[key];
    const bonusCanonical = !canonical ? this.bonusLookup[key] : null;

    if (canonical && this.guessed.has(canonical)){
      const fb = this.el('feedback');
      fb.textContent = `${canonical} — already got that one. Keep typing.`;
      fb.className = 'feedback dup';
      return;
    }
    if (bonusCanonical && this.guessedBonus.has(bonusCanonical)){
      const fb = this.el('feedback');
      fb.textContent = `${bonusCanonical} — already got that bonus one. Keep typing.`;
      fb.className = 'feedback dup';
      return;
    }

    this.el('guess').value = '';
    const fb = this.el('feedback');
    if (canonical){
      this.guessed.add(canonical);
      fb.textContent = `${canonical} — correct!`;
      fb.className = 'feedback good';
      this.renderGuessed();

      if (this.guessed.size >= this.items.length){
        this.end();
        return;
      }
    } else if (bonusCanonical){
      this.guessedBonus.add(bonusCanonical);
      fb.textContent = `${bonusCanonical} — correct! (bonus${this.bonusNote ? ' — ' + this.bonusNote : ''})`;
      fb.className = 'feedback good';
      this.renderGuessed();

      if (this.guessed.size >= this.items.length){
        this.end();
        return;
      }
    } else {
      fb.textContent = `"${raw.trim()}" — not recognized.`;
      fb.className = 'feedback bad';
    }
    this.el('guess').focus();
  }

  renderGuessed(){
    const bonusTally = this.guessedBonus.size ? ` <span style="font-size:14px;color:var(--paper-dim);">+${this.guessedBonus.size} bonus</span>` : '';
    this.el('scoreValue').innerHTML = `${this.guessed.size} <span style="font-size:16px;color:var(--paper-dim);">/ ${this.items.length}</span>${bonusTally}`;
    this.el('guessedCount').textContent = this.guessed.size + this.guessedBonus.size;
    const list = this.preserveOrder
      ? this.items.filter(c => this.guessed.has(c))
      : Array.from(this.guessed).sort((a,b)=>a.localeCompare(b));
    const bonusList = this.bonusItems.filter(c => this.guessedBonus.has(c));
    const container = this.el('guessedList');
    const rows = [
      ...list.map(c => `<div>${c}</div>`),
      ...bonusList.map(c => `<div>${c} <span style="color:var(--paper-dim);">(bonus)</span></div>`)
    ];
    container.innerHTML = rows.length
      ? rows.join('')
      : `<div class="empty-note">Nothing yet — start typing.</div>`;
  }

  end(){
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timerId);
    this.el('guess').disabled = true;
    this.el('endBtn').disabled = true;
    this.el('game').style.display = 'none';
    this.el('results').style.display = 'block';

    const pct = Math.round((this.guessed.size / this.items.length) * 100);
    const bonusLine = this.guessedBonus.size
      ? ` Plus ${this.guessedBonus.size} of ${this.bonusItems.length} bonus.`
      : '';
    this.el('finalScoreLine').textContent = `You named ${this.guessed.size} of ${this.items.length} (${pct}%).${bonusLine}`;

    const sorted = this.preserveOrder ? this.items.slice() : [...this.items].sort((a,b)=>a.localeCompare(b));
    const mainRows = sorted.map(c => {
      const hit = this.guessed.has(c);
      return `<div class="item ${hit ? 'hit' : 'miss'}"><span>${c}</span><span>${hit ? '✓' : '—'}</span></div>`;
    });
    const bonusRows = this.bonusItems.filter(c => this.guessedBonus.has(c)).map(c => {
      const hit = this.guessedBonus.has(c);
      const note = this.bonusNote ? ` <span style="color:var(--paper-dim);">— ${this.bonusNote}</span>` : '';
      return `<div class="item ${hit ? 'hit' : 'miss'}"><span>${c} <span style="color:var(--paper-dim);">(bonus)</span>${note}</span><span>${hit ? '✓' : '—'}</span></div>`;
    });
    this.el('finalGrid').innerHTML = [...mainRows, ...bonusRows].join('');
  }

  reset(){
    this.guessed = new Set();
    this.guessedBonus = new Set();
    this.timeLeft = this.duration;
    this.running = false;
    this.el('guess').disabled = false;
    this.el('endBtn').disabled = false;
    this.el('guess').value = '';
    this.el('feedback').textContent = '';
    this.el('feedback').className = 'feedback';
    this.renderGuessed();
    this.el('results').style.display = 'none';
    this.el('intro').style.display = 'block';
    this.updateTimerDisplay();
  }
}

/* ============================================================
   FREE-RECALL GAME ENGINE, HINTED VARIANT (e.g. Moons of Jupiter)
   Same rules as FreeRecallGame, but a hint panel is always on screen
   showing a clue for one item you haven't guessed yet. Each item has
   its own unique hint (opts.hints: canonical name -> hint text).
   Whenever the hinted item gets guessed (or the round starts), a new
   hint is drawn at random from whatever's still ungguessed, so a
   fresh, always-a-clue experience runs the whole round.
   ============================================================ */
function hintedFreeRecallHTML(id, title){
  return `
    <div id="${id}-intro">
      <div class="plate" style="margin-bottom:18px;">
        <div class="label">rules</div>
        <div style="font-size:14px; line-height:1.7; color:var(--paper);" id="${id}-rules"></div>
      </div>
      <button class="btn-primary" id="${id}-startBtn">Begin — start the clock</button>
    </div>

    <div class="game" id="${id}-game" style="display:none;">
      <h3>${title}</h3>
      <div class="top-row">
        <div class="plate timer" id="${id}-timerPlate">
          <div class="label">time remaining</div>
          <div class="value" id="${id}-timerValue">--:--</div>
        </div>
        <div class="plate">
          <div class="label">score</div>
          <div class="value" id="${id}-scoreValue">0</div>
        </div>
      </div>
      <div class="plate" id="${id}-hintPlate" style="margin-bottom:18px;">
        <div class="label">hint — for something you haven't gotten yet</div>
        <div id="${id}-hintValue" style="font-size:15px; line-height:1.5; color:var(--paper);">—</div>
      </div>
      <div class="entry">
        <input type="text" id="${id}-guess" placeholder="Type an answer…" autocomplete="off">
        <button id="${id}-endBtn" title="End the round now">End round</button>
      </div>
      <div class="feedback" id="${id}-feedback"></div>
      <div class="section-title"><span>Guessed so far</span><span id="${id}-guessedCount">0</span></div>
      <div id="${id}-guessedList" class="guessed-grid">
        <div class="empty-note">Nothing yet — start typing.</div>
      </div>
    </div>

    <div class="results" id="${id}-results" style="display:none;">
      <button id="${id}-resetBtn" class="play-again-top">Play again</button>
      <div class="final-score" id="${id}-finalScoreLine"></div>
      <div class="section-title"><span id="${id}-finalTitle"></span><span>Your hits in green</span></div>
      <div id="${id}-finalGrid" class="final-grid"></div>
    </div>
  `;
}

class HintedFreeRecallGame{
  constructor(opts){
    this.id = opts.id;
    this.title = opts.title;
    this.items = opts.items;          // canonical display list
    this.lookup = opts.lookup;        // normalized-key -> canonical
    this.hints = opts.hints;          // canonical name -> unique hint text
    this.duration = opts.duration;    // seconds
    this.rulesHTML = opts.rulesHTML;
    this.finalTitle = opts.finalTitle;
    this.preserveOrder = !!opts.preserveOrder;

    this.guessed = new Set();
    this.timeLeft = this.duration;
    this.timerId = null;
    this.running = false;
    this.currentHintItem = null;

    document.getElementById(`${this.id}-mount`).innerHTML = hintedFreeRecallHTML(this.id, this.title);
    document.getElementById(`${this.id}-rules`).innerHTML = `
      &middot; ${minutesLabel(this.duration)} on the clock, starting when you hit begin<br>
      &middot; A hint for something you haven't found yet is always shown — get that one and a new hint appears<br>
      ${this.rulesHTML}
    `;
    document.getElementById(`${this.id}-finalTitle`).textContent = this.finalTitle;
    const metaEl = document.getElementById(`${this.id}-meta`);
    if (metaEl) metaEl.textContent = minutesLabel(this.duration);

    this.el = key => document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click', () => this.start());
    this.el('endBtn').addEventListener('click', () => this.end());
    this.el('resetBtn').addEventListener('click', () => this.reset());
    this.el('guess').addEventListener('keydown', e => { if (e.key === 'Enter') this.submit(); });
    this.el('guess').addEventListener('input', () => {
      if (!this.running) return;
      const key = normalize(this.el('guess').value);
      if (key && this.lookup[key]) this.submit();
    });

    this.updateTimerDisplay();
  }

  // Pick a fresh hint for a random item that hasn't been guessed yet.
  // Avoids repeating the same item's hint twice in a row when another
  // choice is available.
  pickNewHint(){
    const remaining = this.items.filter(c => !this.guessed.has(c));
    if (!remaining.length){
      this.currentHintItem = null;
      this.el('hintValue').textContent = 'You found them all!';
      return;
    }
    let pool = remaining;
    if (remaining.length > 1 && this.currentHintItem){
      const others = remaining.filter(c => c !== this.currentHintItem);
      if (others.length) pool = others;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.currentHintItem = pick;
    this.el('hintValue').textContent = this.hints[pick] || '—';
  }

  start(){
    this.el('intro').style.display = 'none';
    this.el('game').style.display = 'block';
    this.running = true;
    this.timeLeft = this.duration;
    this.updateTimerDisplay();
    this.pickNewHint();
    this.el('guess').disabled = false;
    this.el('guess').focus();
    this.timerId = setInterval(() => this.tick(), 1000);
  }

  tick(){
    this.timeLeft--;
    this.updateTimerDisplay();
    if (this.timeLeft <= 0) this.end();
  }

  updateTimerDisplay(){
    this.el('timerValue').textContent = fmtTime(this.timeLeft);
    this.el('timerPlate').classList.toggle('low', this.timeLeft <= 60);
  }

  submit(){
    if (!this.running) return;
    const raw = this.el('guess').value;
    if (!raw.trim()) return;
    const key = normalize(raw);
    const canonical = this.lookup[key];

    if (canonical && this.guessed.has(canonical)){
      const fb = this.el('feedback');
      fb.textContent = `${canonical} — already got that one. Keep typing.`;
      fb.className = 'feedback dup';
      return;
    }

    this.el('guess').value = '';
    const fb = this.el('feedback');
    if (canonical){
      this.guessed.add(canonical);
      fb.textContent = `${canonical} — correct!`;
      fb.className = 'feedback good';
      this.renderGuessed();

      if (this.guessed.size >= this.items.length){
        this.end();
        return;
      }
      // Only draw a new hint if the item the hint pointed to just got found;
      // otherwise the existing hint is still unsolved and stays on screen.
      if (canonical === this.currentHintItem) this.pickNewHint();
    } else {
      fb.textContent = `"${raw.trim()}" — not recognized.`;
      fb.className = 'feedback bad';
    }
    this.el('guess').focus();
  }

  renderGuessed(){
    this.el('scoreValue').innerHTML = `${this.guessed.size} <span style="font-size:16px;color:var(--paper-dim);">/ ${this.items.length}</span>`;
    this.el('guessedCount').textContent = this.guessed.size;
    const list = this.preserveOrder
      ? this.items.filter(c => this.guessed.has(c))
      : Array.from(this.guessed).sort((a,b)=>a.localeCompare(b));
    const container = this.el('guessedList');
    container.innerHTML = list.length
      ? list.map(c => `<div>${c}</div>`).join('')
      : `<div class="empty-note">Nothing yet — start typing.</div>`;
  }

  end(){
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timerId);
    this.el('guess').disabled = true;
    this.el('endBtn').disabled = true;
    this.el('game').style.display = 'none';
    this.el('results').style.display = 'block';

    const pct = Math.round((this.guessed.size / this.items.length) * 100);
    this.el('finalScoreLine').textContent = `You named ${this.guessed.size} of ${this.items.length} (${pct}%).`;

    const sorted = this.preserveOrder ? this.items.slice() : [...this.items].sort((a,b)=>a.localeCompare(b));
    this.el('finalGrid').innerHTML = sorted.map(c => {
      const hit = this.guessed.has(c);
      return `<div class="item ${hit ? 'hit' : 'miss'}"><span>${c}</span><span>${hit ? '✓' : '—'}</span></div>`;
    }).join('');
  }

  reset(){
    this.guessed = new Set();
    this.timeLeft = this.duration;
    this.running = false;
    this.currentHintItem = null;
    this.el('guess').disabled = false;
    this.el('endBtn').disabled = false;
    this.el('guess').value = '';
    this.el('feedback').textContent = '';
    this.el('feedback').className = 'feedback';
    this.el('hintValue').textContent = '—';
    this.renderGuessed();
    this.el('results').style.display = 'none';
    this.el('intro').style.display = 'block';
    this.updateTimerDisplay();
  }
}

/* ============================================================
   Data: US presidents (chronological, by term)
   Grover Cleveland and Donald Trump each served two non-consecutive
   terms, so each appears twice in the chronological list below.
   ============================================================ */

class PresidentsRecallGame{
  constructor(opts){
    this.id = opts.id;
    this.title = opts.title;
    this.terms = opts.terms;                 // [[name, years], ...] chronological, names may repeat
    this.names = [...new Set(this.terms.map(t => t[0]))];
    this.lookup = opts.lookup;                // normalized-key -> array of canonical names
    this.duration = opts.duration;
    this.rulesHTML = opts.rulesHTML;
    this.finalTitle = opts.finalTitle;
    this.peopleLabel = opts.peopleLabel || 'presidents';

    this.guessed = new Set();
    this.timeLeft = this.duration;
    this.timerId = null;
    this.running = false;

    document.getElementById(`${this.id}-mount`).innerHTML = freeRecallHTML(this.id, this.title);
    document.getElementById(`${this.id}-rules`).innerHTML = `
      &middot; ${minutesLabel(this.duration)} on the clock, starting when you hit begin<br>
      ${this.rulesHTML}
    `;
    document.getElementById(`${this.id}-finalTitle`).textContent = this.finalTitle;
    const metaEl = document.getElementById(`${this.id}-meta`);
    if (metaEl) metaEl.textContent = minutesLabel(this.duration);

    this.el = key => document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click', () => this.start());
    this.el('endBtn').addEventListener('click', () => this.end());
    this.el('resetBtn').addEventListener('click', () => this.reset());
    this.el('guess').addEventListener('keydown', e => { if (e.key === 'Enter') this.submit(); });
    this.el('guess').addEventListener('input', () => {
      if (!this.running) return;
      const key = normalize(this.el('guess').value);
      if (key && this.lookup[key]) this.submit();
    });

    this.updateTimerDisplay();
  }

  start(){
    this.el('intro').style.display = 'none';
    this.el('game').style.display = 'block';
    this.running = true;
    this.timeLeft = this.duration;
    this.updateTimerDisplay();
    this.el('guess').disabled = false;
    this.el('guess').focus();
    this.timerId = setInterval(() => this.tick(), 1000);
  }

  tick(){
    this.timeLeft--;
    this.updateTimerDisplay();
    if (this.timeLeft <= 0) this.end();
  }

  updateTimerDisplay(){
    this.el('timerValue').textContent = fmtTime(this.timeLeft);
    this.el('timerPlate').classList.toggle('low', this.timeLeft <= 60);
  }

  submit(){
    if (!this.running) return;
    const raw = this.el('guess').value;
    if (!raw.trim()) return;
    const key = normalize(raw);
    const matches = this.lookup[key];
    const fb = this.el('feedback');

    if (!matches){
      this.el('guess').value = '';
      fb.textContent = `"${raw.trim()}" — not recognized.`;
      fb.className = 'feedback bad';
      this.el('guess').focus();
      return;
    }

    const fresh = matches.filter(name => !this.guessed.has(name));

    if (fresh.length === 0){
      fb.textContent = matches.length > 1
        ? `Already got ${matches.join(' and ')} — keep typing.`
        : `${matches[0]} — already got that one. Keep typing.`;
      fb.className = 'feedback dup';
      return;
    }

    this.el('guess').value = '';
    fresh.forEach(name => this.guessed.add(name));
    fb.textContent = fresh.length > 1
      ? `${fresh.join(' and ')} — both correct!`
      : `${fresh[0]} — correct!`;
    fb.className = 'feedback good';
    this.renderGuessed();

    if (this.guessed.size >= this.names.length){
      this.end();
      return;
    }
    this.el('guess').focus();
  }

  renderGuessed(){
    const hitTerms = this.terms.filter(([name]) => this.guessed.has(name));
    this.el('scoreValue').innerHTML = `${hitTerms.length} <span style="font-size:16px;color:var(--paper-dim);">/ ${this.terms.length}</span>`;
    this.el('guessedCount').textContent = this.guessed.size;
    const container = this.el('guessedList');
    container.innerHTML = hitTerms.length
      ? hitTerms.map(([name, years]) => `<div>${name} <span style="color:var(--paper-dim);">(${years})</span></div>`).join('')
      : `<div class="empty-note">Nothing yet — start typing.</div>`;
  }

  end(){
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timerId);
    this.el('guess').disabled = true;
    this.el('endBtn').disabled = true;
    this.el('game').style.display = 'none';
    this.el('results').style.display = 'block';

    const hitTerms = this.terms.filter(([name]) => this.guessed.has(name)).length;
    const pct = Math.round((hitTerms / this.terms.length) * 100);
    this.el('finalScoreLine').textContent = `You named ${this.guessed.size} of ${this.names.length} ${this.peopleLabel} — ${hitTerms} of ${this.terms.length} terms (${pct}%).`;

    this.el('finalGrid').innerHTML = this.terms.map(([name, years]) => {
      const hit = this.guessed.has(name);
      return `<div class="item ${hit ? 'hit' : 'miss'}"><span>${name} <span style="color:var(--paper-dim);">(${years})</span></span><span>${hit ? '✓' : '—'}</span></div>`;
    }).join('');
  }

  reset(){
    this.guessed = new Set();
    this.timeLeft = this.duration;
    this.running = false;
    this.el('guess').disabled = false;
    this.el('endBtn').disabled = false;
    this.el('guess').value = '';
    this.el('feedback').textContent = '';
    this.el('feedback').className = 'feedback';
    this.renderGuessed();
    this.el('results').style.display = 'none';
    this.el('intro').style.display = 'block';
    this.updateTimerDisplay();
  }
}

/* ============================================================
   PROMPTED QUIZ ENGINE (generic: state->abbreviation, country->capital, etc.)
   ============================================================ */

function quizHTML(id, promptLabel, mode){
  const inputAttrs = mode === 'short' ? 'maxlength="2"' : '';
  const rowClass = mode === 'short' ? 'quiz-input-row short' : 'quiz-input-row text';
  const placeholder = mode === 'flag' ? 'placeholder="Type the country…"' : '';
  const promptBlock = mode === 'flag'
    ? `<div class="quiz-prompt flag-prompt">
        <div class="prompt-label">${promptLabel}</div>
        <img class="flag-image" id="${id}-promptValue" alt="Flag to identify" src="">
      </div>`
    : `<div class="quiz-prompt">
        <div class="prompt-label">${promptLabel}</div>
        <div class="prompt-value" id="${id}-promptValue">—</div>
      </div>`;
  return `
    <div id="${id}-intro">
      <div class="plate" style="margin-bottom:18px;">
        <div class="label">rules</div>
        <div style="font-size:14px; line-height:1.7; color:var(--paper);" id="${id}-rules"></div>
      </div>
      <button class="btn-primary" id="${id}-startBtn">Begin — start the clock</button>
    </div>

    <div class="game" id="${id}-game" style="display:none;">
      <div class="top-row">
        <div class="plate timer" id="${id}-timerPlate">
          <div class="label">time remaining</div>
          <div class="value" id="${id}-timerValue">--:--</div>
        </div>
        <div class="plate">
          <div class="label">score</div>
          <div class="value" id="${id}-scoreValue">0</div>
        </div>
        <div class="plate">
          <div class="label">remaining</div>
          <div class="value" id="${id}-progressValue">0</div>
        </div>
      </div>

      ${promptBlock}
      <div class="${rowClass}">
        <input type="text" id="${id}-guess" ${inputAttrs} ${placeholder} autocomplete="off">
      </div>
      <div class="feedback" id="${id}-feedback" style="text-align:center;"></div>
      <div style="text-align:center;">
        <button id="${id}-skipBtn">Skip</button>
        <button id="${id}-endBtn" title="End the round now">End round</button>
      </div>
    </div>

    <div class="results" id="${id}-results" style="display:none;">
      <button id="${id}-resetBtn" class="play-again-top">Play again</button>
      <div class="final-score" id="${id}-finalScoreLine"></div>
      <div class="section-title"><span id="${id}-finalRollLabel"></span><span>Your hits in green</span></div>
      <div id="${id}-finalGrid" class="final-grid"></div>
    </div>
  `;
}

class PromptQuiz{
  constructor(opts){
    this.id = opts.id;
    this.pairs = opts.pairs; // [{ prompt, answer, aliases: [] }, ...]
    this.duration = opts.duration;
    this.rulesHTML = opts.rulesHTML;
    this.promptLabel = opts.promptLabel;
    this.finalRollLabel = opts.finalRollLabel;
    this.mode = opts.mode || 'text'; // 'short' (fixed-length codes) or 'text' (free text)
    this.maxLength = opts.maxLength || 2;

    this.queue = [];    // remaining pair-indices still to answer correctly
    this.score = 0;
    this.results = {}; // prompt -> true (only set once answered correctly)
    this.timeLeft = this.duration;
    this.timerId = null;
    this.running = false;

    document.getElementById(`${this.id}-mount`).innerHTML = quizHTML(this.id, this.promptLabel, this.mode);
    document.getElementById(`${this.id}-rules`).innerHTML = `
      &middot; ${minutesLabel(this.duration)} on the clock, starting when you hit begin<br>
      ${this.rulesHTML}
    `;
    document.getElementById(`${this.id}-finalRollLabel`).textContent = this.finalRollLabel;
    const metaEl = document.getElementById(`${this.id}-meta`);
    if (metaEl) metaEl.textContent = minutesLabel(this.duration);

    this.el = key => document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click', () => this.start());
    this.el('endBtn').addEventListener('click', () => this.end());
    this.el('skipBtn').addEventListener('click', () => this.skip());
    this.el('resetBtn').addEventListener('click', () => this.reset());
    this.el('guess').addEventListener('keydown', e => { if (e.key === 'Enter') this.checkAnswer(true); });
    this.el('guess').addEventListener('input', () => {
      if (!this.running) return;
      const val = this.el('guess').value;
      if (this.mode === 'short'){
        if (val.trim().length >= this.maxLength) this.checkAnswer(false);
      } else {
        const key = normalize(val);
        if (key && this.acceptedKeys().includes(key)) this.checkAnswer(false);
      }
    });

    this.updateTimerDisplay();
  }

  start(){
    this.el('intro').style.display = 'none';
    this.el('game').style.display = 'block';
    this.running = true;
    this.timeLeft = this.duration;
    this.score = 0;
    this.results = {};
    this.queue = shuffled(this.pairs.map((_,i)=>i));
    this.updateTimerDisplay();
    this.showPrompt();
    this.el('guess').disabled = false;
    this.el('guess').focus();
    this.timerId = setInterval(() => this.tick(), 1000);
  }

  tick(){
    this.timeLeft--;
    this.updateTimerDisplay();
    if (this.timeLeft <= 0) this.end();
  }

  updateTimerDisplay(){
    this.el('timerValue').textContent = fmtTime(this.timeLeft);
    this.el('timerPlate').classList.toggle('low', this.timeLeft <= 60);
  }

  currentPair(){ return this.pairs[this.queue[0]]; }
  acceptedKeys(){
    const p = this.currentPair();
    return [p.answer, ...(p.aliases || [])].map(normalize);
  }

  showPrompt(){
    if (this.queue.length === 0){ this.end(); return; }
    const { prompt } = this.currentPair();
    if (this.mode === 'flag'){
      this.el('promptValue').src = prompt;
    } else {
      this.el('promptValue').textContent = prompt;
    }
    this.el('progressValue').textContent = this.queue.length;
    this.el('guess').value = '';
    this.el('feedback').textContent = '';
    this.el('feedback').className = 'feedback';
  }

  checkAnswer(fromEnter){
    if (!this.running) return;
    const { prompt, answer } = this.currentPair();
    const typed = this.el('guess').value.trim();
    if (!typed) return;
    const key = normalize(typed);
    if (this.acceptedKeys().includes(key)){
      this.results[prompt] = true;
      this.score++;
      this.el('scoreValue').textContent = this.score;
      this.el('feedback').textContent = `${answer} — correct!`;
      this.el('feedback').className = 'feedback good';
      this.queue.shift();
      setTimeout(() => this.showPrompt(), 150);
    } else if (fromEnter || (this.mode === 'short' && typed.length >= this.maxLength)){
      this.el('feedback').textContent = `Not quite — try again or skip.`;
      this.el('feedback').className = 'feedback bad';
      this.el('guess').value = '';
    }
  }

  skip(){
    if (!this.running) return;
    // Send the current item to the back of the queue so it comes back around
    // after the rest, instead of ending the round.
    const idx = this.queue.shift();
    this.queue.push(idx);
    this.showPrompt();
  }

  end(){
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timerId);
    this.el('guess').disabled = true;
    this.el('endBtn').disabled = true;
    this.el('skipBtn').disabled = true;
    this.el('game').style.display = 'none';
    this.el('results').style.display = 'block';

    const pct = Math.round((this.score / this.pairs.length) * 100);
    this.el('finalScoreLine').textContent = `You got ${this.score} of ${this.pairs.length} correct (${pct}%).`;

    const sortKey = this.mode === 'flag' ? 'answer' : 'prompt';
    const sorted = [...this.pairs].sort((a,b)=>a[sortKey].localeCompare(b[sortKey]));
    this.el('finalGrid').innerHTML = sorted.map(({prompt, answer}) => {
      const hit = this.results[prompt] === true;
      const label = this.mode === 'flag'
        ? `<img class="flag-thumb" src="${prompt}" alt="${answer} flag">`
        : prompt;
      return `<div class="item ${hit ? 'hit' : 'miss'}"><span>${label}</span><span>${answer} ${hit ? '✓' : '—'}</span></div>`;
    }).join('');
  }

  reset(){
    this.running = false;
    this.timeLeft = this.duration;
    this.score = 0;
    this.results = {};
    this.queue = [];
    this.el('guess').disabled = false;
    this.el('endBtn').disabled = false;
    this.el('skipBtn').disabled = false;
    this.el('scoreValue').textContent = '0';
    this.el('results').style.display = 'none';
    this.el('intro').style.display = 'block';
    this.updateTimerDisplay();
  }
}

/* ============================================================
   MULTIPLE-CHOICE PROMPT QUIZ ENGINE (e.g. Moons of Jupiter)
   Each question shows a clue plus 4 options: the correct answer and
   3 distractors drawn at random from opts.distractorPool (which should
   contain only real members of the category). There is no skip — the
   question stays up until the correct option is picked. Wrong picks are
   disabled and struck out; a question only scores if it is answered
   correctly on the FIRST try. The round ends when every question is
   answered, the timer runs out, or you end it.
   ============================================================ */
function multipleChoiceHTML(id, promptLabel){
  return `
    <div id="${id}-intro">
      <div class="plate" style="margin-bottom:18px;">
        <div class="label">rules</div>
        <div style="font-size:14px; line-height:1.7; color:var(--paper);" id="${id}-rules"></div>
      </div>
      <button class="btn-primary" id="${id}-startBtn">Begin — start the clock</button>
    </div>

    <div class="game" id="${id}-game" style="display:none;">
      <div class="top-row">
        <div class="plate timer" id="${id}-timerPlate">
          <div class="label">time remaining</div>
          <div class="value" id="${id}-timerValue">--:--</div>
        </div>
        <div class="plate">
          <div class="label">score</div>
          <div class="value" id="${id}-scoreValue">0</div>
        </div>
        <div class="plate">
          <div class="label">remaining</div>
          <div class="value" id="${id}-progressValue">0</div>
        </div>
      </div>

      <div class="quiz-prompt">
        <div class="prompt-label">${promptLabel}</div>
        <div class="prompt-value mc-clue" id="${id}-promptValue">—</div>
      </div>
      <div class="mc-options" id="${id}-options"></div>
      <div class="feedback" id="${id}-feedback" style="text-align:center;"></div>
      <div style="text-align:center;">
        <button id="${id}-endBtn" title="End the round now">End round</button>
      </div>
    </div>

    <div class="results" id="${id}-results" style="display:none;">
      <button id="${id}-resetBtn" class="play-again-top">Play again</button>
      <div class="final-score" id="${id}-finalScoreLine"></div>
      <div class="section-title"><span id="${id}-finalRollLabel"></span><span>Correct on first try in green</span></div>
      <div id="${id}-finalGrid" class="final-grid"></div>
    </div>
  `;
}

class MultipleChoiceQuiz{
  constructor(opts){
    this.id = opts.id;
    this.pairs = opts.pairs;                     // [{ prompt, answer }, ...]
    this.distractorPool = opts.distractorPool;   // real members of the category
    this.optionCount = opts.optionCount || 4;
    this.duration = opts.duration;
    this.rulesHTML = opts.rulesHTML;
    this.promptLabel = opts.promptLabel;
    this.finalRollLabel = opts.finalRollLabel;
    // Optional: ask only this many questions per round, drawn at random from
    // `pairs` (so a big pool of clues stays fresh across plays). Omit to ask
    // every pair, as before.
    this.questionCount = opts.questionCount || null;

    this.queue = [];
    this.roundIdx = [];     // indices into `pairs` used in the current round
    this.score = 0;
    this.results = {};      // prompt -> true (only if right on first try)
    this.missed = false;    // has the current question already had a wrong pick?
    this.locked = false;    // true while the "correct!" flash is showing
    this.timeLeft = this.duration;
    this.timerId = null;
    this.running = false;

    document.getElementById(`${this.id}-mount`).innerHTML = multipleChoiceHTML(this.id, this.promptLabel);
    document.getElementById(`${this.id}-rules`).innerHTML = `
      &middot; ${minutesLabel(this.duration)} on the clock, starting when you hit begin<br>
      ${this.rulesHTML}
    `;
    document.getElementById(`${this.id}-finalRollLabel`).textContent = this.finalRollLabel;
    const metaEl = document.getElementById(`${this.id}-meta`);
    if (metaEl) metaEl.textContent = minutesLabel(this.duration);

    this.el = key => document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click', () => this.start());
    this.el('endBtn').addEventListener('click', () => this.end());
    this.el('resetBtn').addEventListener('click', () => this.reset());
    this.updateTimerDisplay();
  }

  start(){
    this.el('intro').style.display = 'none';
    this.el('game').style.display = 'block';
    this.running = true;
    this.timeLeft = this.duration;
    this.score = 0;
    this.results = {};
    const all = shuffled(this.pairs.map((_,i)=>i));
    this.roundIdx = this.questionCount ? all.slice(0, this.questionCount) : all;
    this.queue = this.roundIdx.slice();
    this.updateTimerDisplay();
    this.showPrompt();
    this.timerId = setInterval(() => this.tick(), 1000);
  }

  tick(){
    this.timeLeft--;
    this.updateTimerDisplay();
    if (this.timeLeft <= 0) this.end();
  }

  updateTimerDisplay(){
    this.el('timerValue').textContent = fmtTime(this.timeLeft);
    this.el('timerPlate').classList.toggle('low', this.timeLeft <= 60);
  }

  currentPair(){ return this.pairs[this.queue[0]]; }

  showPrompt(){
    if (this.queue.length === 0){ this.end(); return; }
    const { prompt, answer } = this.currentPair();
    this.missed = false;
    this.locked = false;

    // Correct answer + (optionCount-1) distinct distractors, all from the real pool.
    const distractors = shuffled(this.distractorPool.filter(n => n !== answer)).slice(0, this.optionCount - 1);
    const options = shuffled([answer, ...distractors]);

    this.el('promptValue').textContent = prompt;
    this.el('progressValue').textContent = this.queue.length;
    this.el('feedback').textContent = '';
    this.el('feedback').className = 'feedback';

    const box = this.el('options');
    box.innerHTML = '';
    options.forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mc-option';
      btn.textContent = name;
      btn.addEventListener('click', () => this.choose(btn, name));
      box.appendChild(btn);
    });
  }

  choose(btn, name){
    if (!this.running || this.locked || btn.disabled) return;
    const { prompt, answer } = this.currentPair();
    if (name === answer){
      this.locked = true;
      btn.classList.add('correct');
      if (!this.missed){
        this.results[prompt] = true;
        this.score++;
        this.el('scoreValue').textContent = this.score;
      }
      this.el('feedback').textContent = this.missed ? `${answer} — got it.` : `${answer} — correct!`;
      this.el('feedback').className = this.missed ? 'feedback dup' : 'feedback good';
      this.queue.shift();
      setTimeout(() => { if (this.running) this.showPrompt(); }, 700);
    } else {
      this.missed = true;
      btn.classList.add('wrong');
      btn.disabled = true;
      this.el('feedback').textContent = 'Not quite — pick again.';
      this.el('feedback').className = 'feedback bad';
    }
  }

  end(){
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timerId);
    this.el('endBtn').disabled = true;
    this.el('game').style.display = 'none';
    this.el('results').style.display = 'block';

    const roundPairs = this.roundIdx.map(i => this.pairs[i]);
    const pct = Math.round((this.score / roundPairs.length) * 100);
    this.el('finalScoreLine').textContent = `You got ${this.score} of ${roundPairs.length} correct on the first try (${pct}%).`;

    const sorted = [...roundPairs].sort((a,b)=>a.prompt.localeCompare(b.prompt));
    this.el('finalGrid').innerHTML = sorted.map(({prompt, answer}) => {
      const hit = this.results[prompt] === true;
      return `<div class="item ${hit ? 'hit' : 'miss'}"><span>${prompt}</span><span>${answer} ${hit ? '✓' : '—'}</span></div>`;
    }).join('');
  }

  reset(){
    this.running = false;
    clearInterval(this.timerId);
    this.timeLeft = this.duration;
    this.score = 0;
    this.results = {};
    this.queue = [];
    this.roundIdx = [];
    this.el('endBtn').disabled = false;
    this.el('scoreValue').textContent = '0';
    this.el('results').style.display = 'none';
    this.el('intro').style.display = 'block';
    this.updateTimerDisplay();
  }
}

/* ============================================================
   STATE MAP QUIZ
   Uses us-atlas state boundaries derived from U.S. Census Bureau
   cartographic boundaries, rendered with d3.geoAlbersUsa.
   ============================================================ */

function stateMapHTML(id, cfg={}){
  const N=cfg.count||50, noun=cfg.noun||'state', nounPl=cfg.nounPlural||'states', region=cfg.regionLabel||'the United States', allLabel=cfg.allLabel||'All 50 states', vb=cfg.viewBox||'0 0 975 610';
  const Cap=noun.charAt(0).toUpperCase()+noun.slice(1);
  return `
    <div id="${id}-intro">
      <div class="plate" style="margin-bottom:18px;">
        <div class="label">rules</div>
        <div style="font-size:14px; line-height:1.7; color:var(--paper);">
          &middot; ${N} ${nounPl} appear one at a time in random order<br>
          &middot; A single ${noun} is highlighted on the map — name it<br>
          &middot; Type the full ${noun} name; common spelling variations are accepted<br>
          &middot; No clock — take your time and see how many you can get
        </div>
      </div>
      <button class="btn-primary" id="${id}-startBtn">Begin</button>
    </div>

    <div class="game map-quiz" id="${id}-game" style="display:none;">
      <div class="top-row">
        <div class="plate"><div class="label">score</div><div class="value" id="${id}-scoreValue">0</div></div>
        <div class="plate"><div class="label">progress</div><div class="value" id="${id}-progressValue">0 / ${N}</div></div>
      </div>
      <div class="map-question">
        <div class="label">which ${noun} is highlighted?</div>
        <h3>Name this ${noun}</h3>
      </div>
      <div class="state-map-wrap">
        <svg class="state-map" id="${id}-map" viewBox="${vb}" role="img" aria-label="Map of ${region} with one highlighted ${noun}"></svg>
      </div>
      <div class="map-progress" id="${id}-progressText"></div>
      <div class="map-answer-row">
        <input type="text" id="${id}-guess" placeholder="Type the ${noun} name…" autocomplete="off" spellcheck="false">
        <button class="btn-primary" id="${id}-submitBtn">Submit</button>
      </div>
      <div class="map-feedback" id="${id}-feedback"></div>
      <div class="map-next-row"><button id="${id}-nextBtn" style="display:none;">Next ${noun} &rarr;</button></div>
    </div>

    <div class="results" id="${id}-results" style="display:none;">
      <button id="${id}-resetBtn" class="play-again-top">Play again</button>
      <div class="final-score" id="${id}-finalScoreLine"></div>
      <div class="section-title"><span>${allLabel}</span><span>Your hits in green</span></div>
      <div id="${id}-finalGrid" class="final-grid"></div>
    </div>
  `;
}

class StateMapQuiz{
  constructor(opts){
    this.id=opts.id; this.states=opts.states; this.cfg=opts.cfg||{}; this.N=this.states.length; this.noun=this.cfg.noun||'state'; this.nounPl=this.cfg.nounPlural||'states';
    this.lookup=opts.lookup||null; this.loader=opts.loader||null;
    this.queue=[]; this.idx=0; this.score=0; this.answers=[]; this.answered=false; this.mapReady=false;
    document.getElementById(`${this.id}-mount`).innerHTML=stateMapHTML(this.id,{...this.cfg,count:this.states.length});
    this.el=key=>document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click',()=>this.start());
    this.el('submitBtn').addEventListener('click',()=>this.submit());
    this.el('nextBtn').addEventListener('click',()=>this.next());
    this.el('resetBtn').addEventListener('click',()=>this.reset());
    this.el('guess').addEventListener('keydown',e=>{ if(e.key==='Enter') this.answered ? this.next() : this.submit(); });
    this.loadMap();
  }

  async loadMap(){
    try{
      let features, path;
      if(this.loader){ ({features,path}=await this.loader()); }
      else{
        const us=await d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json');
        features=topojson.feature(us,us.objects.states).features;
        path=d3.geoPath(d3.geoAlbersUsa().scale(1300).translate([487.5,305]));
      }
      d3.select(this.el('map')).selectAll('path').data(features).join('path')
        .attr('class','state').attr('d',path).attr('data-name',d=>d.properties.name);
      this.mapReady=true;
      if(this.queue.length) this.renderTarget();
    }catch(err){
      this.el('feedback').textContent='The map could not be loaded. Please refresh and try again.';
      this.el('feedback').className='map-feedback bad';
      console.error(err);
    }
  }

  start(){
    this.el('intro').style.display='none'; this.el('results').style.display='none'; this.el('game').style.display='block';
    this.queue=shuffled(this.states); this.idx=0; this.score=0; this.answers=[]; this.el('scoreValue').textContent='0'; this.showQuestion();
  }

  showQuestion(){
    this.answered=false;
    this.el('progressValue').textContent=`${this.idx} / ${this.N}`;
    this.el('progressText').textContent=`${this.noun.charAt(0).toUpperCase()+this.noun.slice(1)} ${this.idx+1} of ${this.N}`;
    this.el('guess').value=''; this.el('guess').disabled=false; this.el('submitBtn').style.display='inline-block'; this.el('nextBtn').style.display='none';
    this.el('feedback').textContent=''; this.el('feedback').className='map-feedback'; this.renderTarget(); this.el('guess').focus();
  }

  renderTarget(){
    if(!this.mapReady || !this.queue.length) return;
    const target=this.queue[this.idx];
    d3.select(this.el('map')).selectAll('.state')
      .classed('target',d=>d.properties.name===target)
      .classed('correct',d=>this.answers.some(a=>a.state===d.properties.name && a.isCorrect))
      .classed('wrong',false);
  }

  submit(){
    if(this.answered) return;
    const raw=this.el('guess').value.trim(); if(!raw) return;
    const target=this.queue[this.idx]; const isCorrect=(this.lookup?this.lookup[normalize(raw)]:normalize(raw))===(this.lookup?target:normalize(target));
    this.answered=true; if(isCorrect) this.score++; this.answers.push({state:target,yourAnswer:raw,isCorrect});
    this.el('scoreValue').textContent=this.score; this.el('guess').disabled=true; this.el('submitBtn').style.display='none';
    this.el('feedback').textContent=isCorrect ? `${target} — correct!` : `Not quite — the answer is ${target}.`;
    this.el('feedback').className=`map-feedback ${isCorrect?'good':'bad'}`;
    d3.select(this.el('map')).selectAll('.state')
      .classed('target',false)
      .classed('correct',d=>this.answers.some(a=>a.state===d.properties.name && a.isCorrect))
      .classed('wrong',d=>d.properties.name===target && !isCorrect);
    this.el('nextBtn').textContent=this.idx===this.N-1 ? 'See results →' : `Next ${this.noun} →`; this.el('nextBtn').style.display='inline-block'; this.el('nextBtn').focus();
  }

  next(){ if(!this.answered) return; this.idx++; if(this.idx>=this.queue.length){ this.end(); return; } this.showQuestion(); }

  end(){
    this.el('game').style.display='none'; this.el('results').style.display='block';
    this.el('finalScoreLine').textContent=`You identified ${this.score} of ${this.N} ${this.nounPl} (${Math.round(this.score/this.N*100)}%).`;
    const byState=new Map(this.answers.map(a=>[a.state,a]));
    this.el('finalGrid').innerHTML=this.states.slice().sort((a,b)=>a.localeCompare(b)).map(state=>{
      const a=byState.get(state), hit=a?.isCorrect;
      return `<div class="item ${hit?'hit':'miss'}"><span>${state}</span><span>${hit?'✓':'—'}</span></div>`;
    }).join('');
  }

  reset(){
    this.el('results').style.display='none'; this.el('intro').style.display='block'; this.el('game').style.display='none';
    this.queue=[]; this.idx=0; this.score=0; this.answers=[];
    if(this.mapReady) d3.select(this.el('map')).selectAll('.state').attr('class','state');
  }
}

/* ============================================================
   FIND THE STATE QUIZ
   Given a state's name, click that state on the map.
   Reuses the same us-atlas boundaries as the "On the Map" quiz.
   ============================================================ */

function findStateHTML(id, hardMode=false){
  return `
    <div id="${id}-intro">
      <div class="plate" style="margin-bottom:18px;">
        <div class="label">rules</div>
        <div style="font-size:14px; line-height:1.7; color:var(--paper);">
          ${hardMode ? `
          Hard Mode<br>
          &middot; 50 states appear one at a time in random order<br>
          &middot; You're given a state's name — click it on the map<br>
          &middot; NO state outlines are shown until you correctly guess them<br>
          &middot; NO skipping — your first wrong answer ends the game
          ` : `
          &middot; 50 states appear one at a time in random order<br>
          &middot; You're given a state's name — click it on the map<br>
          &middot; One click per state; the correct location is revealed either way<br>
          &middot; No clock — take your time and see how many you can get
          `}
        </div>
      </div>
      <button class="btn-primary" id="${id}-startBtn">Begin</button>
    </div>

    <div class="game map-quiz" id="${id}-game" style="display:none;">
      <div class="top-row">
        <div class="plate"><div class="label">score</div><div class="value" id="${id}-scoreValue">0</div></div>
        <div class="plate"><div class="label">progress</div><div class="value" id="${id}-progressValue">0 / 50</div></div>
      </div>
      <div class="map-question">
        <div class="label">click this state on the map</div>
        <h3 id="${id}-promptValue"></h3>
      </div>
      <div class="state-map-wrap">
        <svg class="state-map clickable" id="${id}-map" viewBox="0 0 975 610" role="img" aria-label="Map of the United States — click the named state"></svg>
      </div>
      <div class="map-progress" id="${id}-progressText"></div>
      <div class="map-feedback" id="${id}-feedback"></div>
      <div class="map-next-row"><button id="${id}-nextBtn" style="display:none;">Next state &rarr;</button></div>
    </div>

    <div class="results" id="${id}-results" style="display:none;">
      <button id="${id}-resetBtn" class="play-again-top">Play again</button>
      <div class="final-score" id="${id}-finalScoreLine"></div>
      <div class="section-title"><span>All 50 states</span><span>Your hits in green</span></div>
      <div id="${id}-finalGrid" class="final-grid"></div>
    </div>
  `;
}

class FindStateQuiz{
  constructor(opts){
    this.id=opts.id; this.states=opts.states; this.cfg=opts.cfg||{}; this.N=this.states.length; this.noun=this.cfg.noun||'state'; this.nounPl=this.cfg.nounPlural||'states';
    this.lookup=opts.lookup||null; this.loader=opts.loader||null; this.hardMode=!!opts.hardMode;
    this.queue=[]; this.idx=0; this.score=0; this.answers=[]; this.answered=false; this.mapReady=false;
    document.getElementById(`${this.id}-mount`).innerHTML=findStateHTML(this.id, this.hardMode);
    this.el=key=>document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click',()=>this.start());
    this.el('nextBtn').addEventListener('click',()=>this.next());
    this.el('resetBtn').addEventListener('click',()=>this.reset());
    document.addEventListener('keydown',e=>{ if(e.key==='Enter' && this.answered && this.el('game').style.display!=='none') this.next(); });
    this.loadMap();
  }

  async loadMap(){
    try{
      const us=await d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json');
      const features=topojson.feature(us,us.objects.states).features;
      const projection=d3.geoAlbersUsa().scale(1300).translate([487.5,305]);
      const path=d3.geoPath(projection);
      d3.select(this.el('map')).classed('hard-mode',this.hardMode).selectAll('path').data(features).join('path')
        .attr('class','state').attr('d',path).attr('data-name',d=>d.properties.name)
        .on('click',(event,d)=>this.handleClick(d.properties.name));
      this.mapReady=true;
      if(this.queue.length) this.renderMapState();
    }catch(err){
      this.el('feedback').textContent='The map could not be loaded. Please refresh and try again.';
      this.el('feedback').className='map-feedback bad';
      console.error(err);
    }
  }

  start(){
    this.el('intro').style.display='none'; this.el('results').style.display='none'; this.el('game').style.display='block';
    this.queue=shuffled(this.states); this.idx=0; this.score=0; this.answers=[]; this.el('scoreValue').textContent='0';
    if(this.mapReady) d3.select(this.el('map')).selectAll('.state').attr('class','state');
    this.showQuestion();
  }

  showQuestion(){
    this.answered=false;
    this.el('map').classList.remove('answered');
    this.el('progressValue').textContent=`${this.idx} / 50`;
    this.el('progressText').textContent=`State ${this.idx+1} of 50`;
    this.el('promptValue').textContent=this.queue[this.idx];
    this.el('feedback').textContent=''; this.el('feedback').className='map-feedback';
    this.el('nextBtn').style.display='none';
    this.renderMapState();
  }

  renderMapState(){
    if(!this.mapReady || !this.queue.length) return;
    d3.select(this.el('map')).selectAll('.state')
      .classed('target',false)
      .classed('wrong',false)
      .classed('guessed',d=>this.answers.some(a=>a.state===d.properties.name && a.isCorrect))
      .classed('correct',d=>this.answers.some(a=>a.state===d.properties.name && a.isCorrect));
  }

  handleClick(name){
    if(this.answered || !this.mapReady || !this.queue.length) return;
    if(this.answers.some(a=>a.isCorrect && a.state===name)) return; // already-guessed state: treat like clicking the ocean
    const target=this.queue[this.idx]; const isCorrect=name===target;
    this.answered=true; if(isCorrect) this.score++;
    this.answers.push({state:target,yourClick:name,isCorrect});
    this.el('scoreValue').textContent=this.score;
    this.el('map').classList.add('answered');
    this.el('feedback').textContent=isCorrect ? `Correct — that's ${target}.` : `Not quite — you clicked ${name}. ${target} is highlighted above.`;
    this.el('feedback').className=`map-feedback ${isCorrect?'good':'bad'}`;
    d3.select(this.el('map')).selectAll('.state')
      .classed('wrong',d=>d.properties.name===name && !isCorrect)
      .classed('target',d=>d.properties.name===target && !isCorrect)
      .classed('guessed',d=>this.answers.some(a=>a.state===d.properties.name && a.isCorrect))
      .classed('correct',d=>(d.properties.name===target && isCorrect) || this.answers.some(a=>a.state===d.properties.name && a.isCorrect));
    if(this.hardMode && !isCorrect){
      this.end();
      return;
    }
    this.el('nextBtn').textContent=this.idx===49 ? 'See results →' : 'Next state →';
    this.el('nextBtn').style.display='inline-block'; this.el('nextBtn').focus();
  }

  next(){
    if(!this.answered) return;
    if(this.hardMode && !this.answers[this.answers.length-1]?.isCorrect){ this.end(); return; }
    this.idx++;
    if(this.idx>=this.queue.length){ this.end(); return; }
    this.showQuestion();
  }

  end(){
    this.el('game').style.display='none'; this.el('results').style.display='block';
    this.el('finalScoreLine').textContent=this.hardMode
      ? `Hard mode: ${this.score} of 50 states (${Math.round(this.score/50*100)}%).`
      : `You found ${this.score} of 50 states (${Math.round(this.score/50*100)}%).`;
    const byState=new Map(this.answers.map(a=>[a.state,a]));
    this.el('finalGrid').innerHTML=this.states.slice().sort((a,b)=>a.localeCompare(b)).map(state=>{
      const a=byState.get(state), hit=a?.isCorrect;
      return `<div class="item ${hit?'hit':'miss'}"><span>${state}</span><span>${hit?'✓':'—'}</span></div>`;
    }).join('');
  }

  reset(){
    this.el('results').style.display='none'; this.el('intro').style.display='block'; this.el('game').style.display='none';
    this.queue=[]; this.idx=0; this.score=0; this.answers=[];
    if(this.mapReady) d3.select(this.el('map')).selectAll('.state').attr('class','state');
    if(this.mapReady) d3.select(this.el('map')).classed('hard-mode',this.hardMode);
  }
}

/* ============================================================
   FIND THE CITY QUIZ
   Given a city's name, click its dot on the map. Only the dots are
   clickable (targets + red herrings); clicks anywhere else are ignored.
   Uses the same Canada boundaries as the "On the Map: Canada" quiz,
   with zoom/pan so closely-spaced cities (e.g. Toronto/Hamilton) are
   easy to pick. Wheel-zoom needs Ctrl/Cmd so page scrolling still works.
   ============================================================ */

function findCityHTML(id, N){
  return `
    <div id="${id}-intro">
      <div class="plate" style="margin-bottom:18px;">
        <div class="label">rules</div>
        <div style="font-size:14px; line-height:1.7; color:var(--paper);">
          &middot; ${N} cities appear one at a time in random order<br>
          &middot; You're given a city's name — click its dot on the map<br>
          &middot; Some dots are red herrings; only the dots can be clicked<br>
          &middot; Zoom with the + / − buttons (or Ctrl/Cmd + scroll, or pinch) and drag to pan<br>
          &middot; One click per city; the correct location is revealed either way<br>
          &middot; No clock — take your time and see how many you can get
        </div>
      </div>
      <button class="btn-primary" id="${id}-startBtn">Begin</button>
    </div>

    <div class="game map-quiz" id="${id}-game" style="display:none;">
      <div class="top-row">
        <div class="plate"><div class="label">score</div><div class="value" id="${id}-scoreValue">0</div></div>
        <div class="plate"><div class="label">progress</div><div class="value" id="${id}-progressValue">0 / ${N}</div></div>
      </div>
      <div class="map-question">
        <div class="label">click this city on the map</div>
        <h3 id="${id}-promptValue"></h3>
      </div>
      <div class="state-map-wrap map-zoom-wrap">
        <svg class="state-map find-city" id="${id}-map" viewBox="0 0 975 400" role="img" aria-label="Map of southern Canada — click the dot for the named city"></svg>
        <div class="map-zoom-controls">
          <button id="${id}-zoomIn" aria-label="Zoom in" title="Zoom in">+</button>
          <button id="${id}-zoomOut" aria-label="Zoom out" title="Zoom out">&minus;</button>
          <button id="${id}-zoomReset" aria-label="Reset zoom" title="Reset zoom">&#8634;</button>
        </div>
      </div>
      <div class="map-progress" id="${id}-progressText"></div>
      <div class="map-feedback" id="${id}-feedback"></div>
      <div class="map-next-row"><button id="${id}-nextBtn" style="display:none;">Next city &rarr;</button></div>
    </div>

    <div class="results" id="${id}-results" style="display:none;">
      <button id="${id}-resetBtn" class="play-again-top">Play again</button>
      <div class="final-score" id="${id}-finalScoreLine"></div>
      <div class="section-title"><span>All ${N} cities</span><span>Your hits in green</span></div>
      <div id="${id}-finalGrid" class="final-grid"></div>
    </div>
  `;
}

class FindCityQuiz{
  // opts.cities: [{ name, lon, lat, target:true|false }, ...]  (target:false = red herring)
  constructor(opts){
    this.id=opts.id; this.cities=opts.cities.map(c=>({...c}));
    this.targets=this.cities.filter(c=>c.target).map(c=>c.name); this.N=this.targets.length;
    this.W=975; this.H=400; this.k=1;
    this.queue=[]; this.idx=0; this.score=0; this.answers=[]; this.answered=false; this.mapReady=false;
    document.getElementById(`${this.id}-mount`).innerHTML=findCityHTML(this.id, this.N);
    this.el=key=>document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click',()=>this.start());
    this.el('nextBtn').addEventListener('click',()=>this.next());
    this.el('resetBtn').addEventListener('click',()=>this.reset());
    document.addEventListener('keydown',e=>{
      const screen=document.getElementById(`screen-${this.id}`);
      if(e.key==='Enter' && this.answered && screen && screen.classList.contains('active') && this.el('game').style.display!=='none') this.next();
    });
    this.loadMap();
  }

  async loadMap(){
    try{
      const geo=await d3.json('https://cdn.jsdelivr.net/gh/codeforgermany/click_that_hood@main/public/data/canada.geojson');
      const pts={ type:'MultiPoint', coordinates:this.cities.map(c=>[c.lon,c.lat]) };
      const projection=d3.geoConicConformal().parallels([49,62]).rotate([96,0])
        .fitExtent([[35,30],[this.W-35,this.H-30]], pts);
      const path=d3.geoPath(projection);
      this.cities.forEach(c=>{ [c.x,c.y]=projection([c.lon,c.lat]); });

      const svg=d3.select(this.el('map'));
      const layer=svg.append('g');
      layer.append('g').selectAll('path').data(geo.features).join('path').attr('class','state').attr('d',path);
      this.dots=layer.append('g').selectAll('g').data(this.cities).join('g').attr('class','city-dot')
        .attr('transform',d=>`translate(${d.x},${d.y})`)
        .on('click',(event,d)=>this.handleClick(d));
      this.dots.append('circle').attr('r',5);
      this.dots.append('text').attr('x',d=>d.x>this.W-140?-9:9).attr('y',4)
        .attr('text-anchor',d=>d.x>this.W-140?'end':'start').text(d=>d.name);

      this.zoom=d3.zoom().scaleExtent([1,20])
        .extent([[0,0],[this.W,this.H]]).translateExtent([[0,0],[this.W,this.H]])
        .filter(e=>e.type==='wheel' ? (e.ctrlKey||e.metaKey) : !e.button)
        .on('zoom',e=>{
          this.k=e.transform.k; layer.attr('transform',e.transform);
          // keep dots and labels a constant on-screen size while zooming
          this.dots.attr('transform',d=>`translate(${d.x},${d.y}) scale(${1/this.k})`);
        });
      svg.call(this.zoom).on('dblclick.zoom',null);
      this.el('zoomIn').addEventListener('click',()=>svg.transition().duration(200).call(this.zoom.scaleBy,1.8));
      this.el('zoomOut').addEventListener('click',()=>svg.transition().duration(200).call(this.zoom.scaleBy,1/1.8));
      this.el('zoomReset').addEventListener('click',()=>this.resetZoom(true));

      this.mapReady=true;
      if(this.queue.length) this.renderDots();
    }catch(err){
      this.el('feedback').textContent='The map could not be loaded. Please refresh and try again.';
      this.el('feedback').className='map-feedback bad';
      console.error(err);
    }
  }

  resetZoom(animate){
    if(!this.mapReady) return;
    const svg=d3.select(this.el('map'));
    (animate ? svg.transition().duration(250) : svg).call(this.zoom.transform,d3.zoomIdentity);
  }

  start(){
    this.el('intro').style.display='none'; this.el('results').style.display='none'; this.el('game').style.display='block';
    this.queue=shuffled(this.targets); this.idx=0; this.score=0; this.answers=[]; this.el('scoreValue').textContent='0';
    this.resetZoom(false);
    this.showQuestion();
  }

  isFound(name){ return this.answers.some(a=>a.isCorrect && a.city===name); }

  showQuestion(){
    this.answered=false;
    this.el('map').classList.remove('answered');
    this.el('progressValue').textContent=`${this.idx} / ${this.N}`;
    this.el('progressText').textContent=`City ${this.idx+1} of ${this.N}`;
    this.el('promptValue').textContent=this.queue[this.idx];
    this.el('feedback').textContent=''; this.el('feedback').className='map-feedback';
    this.el('nextBtn').style.display='none';
    this.renderDots();
  }

  renderDots(){
    if(!this.mapReady || !this.queue.length) return;
    this.dots.classed('target',false).classed('wrong',false).classed('labeled',false)
      .classed('correct',d=>this.isFound(d.name));
  }

  handleClick(city){
    // Only dots are clickable. Ignore if already answered, or if this city was already found.
    if(this.answered || !this.mapReady || !this.queue.length) return;
    if(this.isFound(city.name)) return;
    const target=this.queue[this.idx]; const isCorrect=city.name===target;
    this.answered=true; if(isCorrect) this.score++;
    this.answers.push({city:target,yourClick:city.name,isCorrect});
    this.el('scoreValue').textContent=this.score;
    this.el('map').classList.add('answered');
    this.el('feedback').textContent=isCorrect ? `Correct — that's ${target}.` : `Not quite — you clicked ${city.name}. ${target} is highlighted on the map.`;
    this.el('feedback').className=`map-feedback ${isCorrect?'good':'bad'}`;
    this.dots
      .classed('wrong',d=>!isCorrect && d.name===city.name)
      .classed('target',d=>!isCorrect && d.name===target)
      .classed('correct',d=>this.isFound(d.name))
      .classed('labeled',d=>d.name===target || d.name===city.name)
      .filter(d=>d.name===target || d.name===city.name).raise();
    this.el('nextBtn').textContent=this.idx===this.N-1 ? 'See results →' : 'Next city →';
    this.el('nextBtn').style.display='inline-block'; this.el('nextBtn').focus();
  }

  next(){
    if(!this.answered) return;
    this.idx++;
    if(this.idx>=this.queue.length){ this.end(); return; }
    this.showQuestion();
  }

  end(){
    this.el('game').style.display='none'; this.el('results').style.display='block';
    this.el('finalScoreLine').textContent=`You found ${this.score} of ${this.N} cities (${Math.round(this.score/this.N*100)}%).`;
    const byCity=new Map(this.answers.map(a=>[a.city,a]));
    this.el('finalGrid').innerHTML=this.targets.slice().sort((a,b)=>a.localeCompare(b)).map(name=>{
      const hit=byCity.get(name)?.isCorrect;
      return `<div class="item ${hit?'hit':'miss'}"><span>${name}</span><span>${hit?'✓':'—'}</span></div>`;
    }).join('');
  }

  reset(){
    this.el('results').style.display='none'; this.el('intro').style.display='block'; this.el('game').style.display='none';
    this.queue=[]; this.idx=0; this.score=0; this.answers=[];
    if(this.mapReady){ this.renderDots(); this.dots.classed('correct',false); this.resetZoom(false); }
  }
}

/* ============================================================
   Build lookups & instantiate games
   ============================================================ */

function triviaHTML(id){
  return `
    <div id="${id}-intro">
      <div class="plate" style="margin-bottom:18px;">
        <div class="label">rules</div>
        <div style="font-size:14px; line-height:1.7; color:var(--paper);" id="${id}-rules"></div>
      </div>
      <button class="btn-primary" id="${id}-startBtn">Begin</button>
    </div>

    <div class="game" id="${id}-game" style="display:none;">
      <div class="trivia-progress" id="${id}-progress"></div>
      <div class="trivia-q">
        <div class="q-text" id="${id}-qText"></div>
        <div class="trivia-answer-row" style="margin-top:20px;">
          <input type="text" id="${id}-guess" placeholder="Type your answer…" autocomplete="off">
          <button class="btn-primary" id="${id}-submitBtn">Submit</button>
        </div>
        <div class="trivia-reveal" id="${id}-reveal" style="display:none;"></div>
      </div>
      <button id="${id}-nextBtn" style="display:none;">Next question &rarr;</button>
    </div>

    <div class="results" id="${id}-results" style="display:none;">
      <button id="${id}-resetBtn" class="play-again-top">Play again</button>
      <div class="final-score" id="${id}-finalScoreLine"></div>
      <div id="${id}-review"></div>
    </div>
  `;
}

class TriviaQuiz{
  constructor(opts){
    this.id = opts.id;
    this.questions = opts.questions;
    this.rulesHTML = opts.rulesHTML;

    this.idx = 0;
    this.score = 0;
    this.answers = []; // { q, yourAnswer, correct, display }
    this.answered = false;

    document.getElementById(`${this.id}-mount`).innerHTML = triviaHTML(this.id);
    document.getElementById(`${this.id}-rules`).innerHTML = this.rulesHTML;

    this.el = key => document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click', () => this.start());
    this.el('submitBtn').addEventListener('click', () => this.submit());
    this.el('nextBtn').addEventListener('click', () => this.next());
    this.el('resetBtn').addEventListener('click', () => this.reset());
    this.el('guess').addEventListener('keydown', e => {
      if (e.key === 'Enter') { this.answered ? this.next() : this.submit(); }
    });
  }

  start(){
    this.el('intro').style.display = 'none';
    this.el('game').style.display = 'block';
    this.idx = 0;
    this.score = 0;
    this.answers = [];
    this.showQuestion();
  }

  showQuestion(){
    this.answered = false;
    const q = this.questions[this.idx];
    this.el('progress').textContent = `Question ${this.idx + 1} of ${this.questions.length}`;
    this.el('qText').textContent = q.q;
    this.el('guess').value = '';
    this.el('guess').disabled = false;
    this.el('submitBtn').style.display = 'inline-block';
    this.el('reveal').style.display = 'none';
    this.el('nextBtn').style.display = 'none';
    this.el('guess').focus();
  }

  submit(){
    if (this.answered) return;
    const q = this.questions[this.idx];
    const raw = this.el('guess').value;
    if (!raw.trim()) return;
    const key = normalize(raw);
    const isCorrect = q.accepted.map(normalize).includes(key);

    this.answered = true;
    if (isCorrect) this.score++;
    this.answers.push({ q: q.q, yourAnswer: raw.trim(), display: q.display, isCorrect });

    this.el('guess').disabled = true;
    this.el('submitBtn').style.display = 'none';
    const reveal = this.el('reveal');
    reveal.style.display = 'block';
    reveal.className = `trivia-reveal ${isCorrect ? 'correct' : 'incorrect'}`;
    reveal.textContent = isCorrect ? `Correct — ${q.display}` : `Not quite — the answer is ${q.display}`;
    this.el('nextBtn').style.display = 'inline-block';
    this.el('nextBtn').focus();
  }

  next(){
    if (!this.answered) return;
    this.idx++;
    if (this.idx >= this.questions.length){ this.end(); return; }
    this.showQuestion();
  }

  end(){
    this.el('game').style.display = 'none';
    this.el('results').style.display = 'block';
    this.el('finalScoreLine').textContent = `You scored ${this.score} of ${this.questions.length}.`;
    this.el('review').innerHTML = this.answers.map(a => `
      <div class="review-item">
        <div class="rq">${a.q}</div>
        <div class="ra ${a.isCorrect ? 'hit' : 'miss'}">
          Your answer: ${a.yourAnswer} ${a.isCorrect ? '✓' : '—'}
          ${a.isCorrect ? '' : `<span class="correct-note">Correct answer: ${a.display}</span>`}
        </div>
      </div>
    `).join('');
  }

  reset(){
    this.idx = 0;
    this.score = 0;
    this.answers = [];
    this.el('results').style.display = 'none';
    this.el('intro').style.display = 'block';
  }
}

/* ============================================================
   Data: California trivia (source: Wikipedia)
   ============================================================ */

function stateTriviaRulesHTML(state, count){
  return `
    &middot; ${count} questions about ${state}, one at a time — no clock, just recall<br>
    &middot; Type your answer and hit enter or submit<br>
    &middot; You'll see the correct answer immediately after each question<br>
    &middot; At the end, review your full scorecard
  `;
}

function estMinutes(count){
  return Math.max(1, Math.round(count * 0.4));
}

function initStateShowcase(quizzes){
  const cardGrid = document.getElementById('showcase-card-grid');
  const screenHost = document.getElementById('showcase-screens');
  const instances = {};

  // Alphabetize automatically — no manual ordering required in the registry above.
  const sorted = [...quizzes].sort((a, b) => a.state.localeCompare(b.state));

  const countEl = document.getElementById('showcase-quiz-count');
  if (countEl) countEl.textContent = `${sorted.length} quiz${sorted.length === 1 ? '' : 'zes'}`;

  sorted.forEach(quiz => {
    const count = quiz.questions.length;

    // Home page card
    cardGrid.insertAdjacentHTML('beforeend', `
      <div class="card">
        <div class="tag">Trivia quiz &middot; ${count} questions</div>
        <h3>${quiz.state}: ${quiz.subtitle}</h3>
        <div class="meta">~${estMinutes(count)} minutes</div>
        <button class="btn-primary" onclick="showScreen('${quiz.id}')">Play</button>
      </div>
    `);

    // Screen + mount point
    screenHost.insertAdjacentHTML('beforeend', `
      <div class="screen" id="screen-${quiz.id}">
        <button class="back-link" onclick="showScreen('home')">&larr; back to arcade</button>
        <div id="${quiz.id}-mount"></div>
      </div>
    `);

    // Quiz instance
    instances[quiz.id] = new TriviaQuiz({
      id: quiz.id,
      questions: quiz.questions,
      rulesHTML: quiz.rulesHTML || stateTriviaRulesHTML(quiz.state, count)
    });
  });

  return instances;
}

// Same pattern as initStateShowcase above, wired to the Canada showcase
// section's mount points (canada-showcase-card-grid / -screens / -quiz-count)
// and keyed off each quiz's `state` field.
function initCanadaShowcase(quizzes){
  const cardGrid = document.getElementById('canada-showcase-card-grid');
  const screenHost = document.getElementById('canada-showcase-screens');
  const instances = {};

  // Alphabetize automatically — no manual ordering required in the registry above.
  const sorted = [...quizzes].sort((a, b) => a.state.localeCompare(b.state));

  const countEl = document.getElementById('canada-showcase-quiz-count');
  if (countEl) countEl.textContent = `${sorted.length} quiz${sorted.length === 1 ? '' : 'zes'}`;

  sorted.forEach(quiz => {
    const count = quiz.questions.length;

    // Home page card
    cardGrid.insertAdjacentHTML('beforeend', `
      <div class="card">
        <div class="tag">Trivia quiz &middot; ${count} questions</div>
        <h3>${quiz.state}: ${quiz.subtitle}</h3>
        <div class="meta">~${estMinutes(count)} minutes</div>
        <button class="btn-primary" onclick="showScreen('${quiz.id}')">Play</button>
      </div>
    `);

    // Screen + mount point
    screenHost.insertAdjacentHTML('beforeend', `
      <div class="screen" id="screen-${quiz.id}">
        <button class="back-link" onclick="showScreen('home')">&larr; back to arcade</button>
        <div id="${quiz.id}-mount"></div>
      </div>
    `);

    // Quiz instance
    instances[quiz.id] = new TriviaQuiz({
      id: quiz.id,
      questions: quiz.questions,
      rulesHTML: quiz.rulesHTML || stateTriviaRulesHTML(quiz.state, count)
    });
  });

  return instances;
}

/* ============================================================
   MINEFIELD ENGINE (guess items in strict descending order —
   one wrong guess ends the round)
   ============================================================ */
function minefieldHTML(id, opts){
  opts = opts || {};
  const itemNoun = opts.itemNoun || 'state';
  const itemNounPlural = opts.itemNounPlural || `${itemNoun}s`;
  const startHint = opts.startHint || 'most populous';
  const metricLabel = opts.metricLabel || 'population';
  const total = opts.total;
  return `
    <div id="${id}-intro">
      <div class="plate" style="margin-bottom:18px;">
        <div class="label">rules</div>
        <div style="font-size:14px; line-height:1.7; color:var(--paper);" id="${id}-rules"></div>
      </div>
      <button class="btn-primary" id="${id}-startBtn">Begin</button>
    </div>

    <div class="game" id="${id}-game" style="display:none;">
      <div class="top-row">
        <div class="plate">
          <div class="label">correct so far</div>
          <div class="value" id="${id}-scoreValue">0</div>
        </div>
        <div class="plate">
          <div class="label">next rank</div>
          <div class="value" id="${id}-rankValue">#1</div>
        </div>
      </div>
      <div class="entry">
        <input type="text" id="${id}-guess" placeholder="Type the next ${itemNoun}…" autocomplete="off">
        <button class="btn-primary" id="${id}-submitBtn">Guess</button>
      </div>
      <div class="feedback" id="${id}-feedback"></div>
      <div class="section-title"><span>Correctly guessed, in order</span><span id="${id}-guessedCount">0</span></div>
      <div id="${id}-mineList" class="mine-list">
        <div class="empty-note">Nothing yet — guess the ${startHint} ${itemNoun} to start.</div>
      </div>
      <div style="margin-top:16px;">
        <button id="${id}-giveupBtn">Give up</button>
      </div>
    </div>

    <div class="results" id="${id}-results" style="display:none;">
      <button id="${id}-resetBtn" class="play-again-top">Play again</button>
      <div class="final-score" id="${id}-finalScoreLine"></div>
      <div class="section-title"><span>Full ranking — all ${total} ${itemNounPlural} by ${metricLabel}</span><span>Your hits in green</span></div>
      <div id="${id}-finalGrid" class="final-grid"></div>
    </div>
  `;
}

class MinefieldQuiz{
  constructor(opts){
    this.id = opts.id;
    this.items = opts.items; // [[name, population], ...] already sorted descending
    this.lookup = opts.lookup; // normalized name -> canonical
    this.rulesHTML = opts.rulesHTML;
    this.fmtPop = opts.fmtPop || fmtPop; // allow a custom population formatter per instance
    this.itemNoun = opts.itemNoun || 'state';
    this.itemNounPlural = opts.itemNounPlural || `${this.itemNoun}s`;
    this.startHint = opts.startHint || 'most populous';
    this.metricLabel = opts.metricLabel || 'population';
    this.emptyNoteHTML = `<div class="empty-note">Nothing yet — guess the ${this.startHint} ${this.itemNoun} to start.</div>`;

    this.nextIndex = 0;
    this.guessedSoFar = []; // [{name, population}]
    this.running = false;

    document.getElementById(`${this.id}-mount`).innerHTML = minefieldHTML(this.id, {
      itemNoun: this.itemNoun,
      itemNounPlural: this.itemNounPlural,
      startHint: this.startHint,
      metricLabel: this.metricLabel,
      total: this.items.length
    });
    document.getElementById(`${this.id}-rules`).innerHTML = this.rulesHTML;

    this.el = key => document.getElementById(`${this.id}-${key}`);
    this.el('startBtn').addEventListener('click', () => this.start());
    this.el('submitBtn').addEventListener('click', () => this.submit());
    this.el('giveupBtn').addEventListener('click', () => this.giveUp());
    this.el('resetBtn').addEventListener('click', () => this.reset());
    this.el('guess').addEventListener('keydown', e => { if (e.key === 'Enter') this.submit(); });
  }

  start(){
    this.el('intro').style.display = 'none';
    this.el('game').style.display = 'block';
    this.running = true;
    this.nextIndex = 0;
    this.guessedSoFar = [];
    this.renderList();
    this.updateHeader();
    this.el('guess').disabled = false;
    this.el('guess').value = '';
    this.el('feedback').textContent = '';
    this.el('feedback').className = 'feedback';
    this.el('guess').focus();
  }

  updateHeader(){
    this.el('scoreValue').textContent = this.guessedSoFar.length;
    this.el('rankValue').textContent = `#${this.nextIndex + 1}`;
  }

  submit(){
    if (!this.running) return;
    const raw = this.el('guess').value;
    if (!raw.trim()) return;
    const key = normalize(raw);
    const canonical = this.lookup[key];
    const [targetName, targetPop] = this.items[this.nextIndex];

    if (canonical === targetName){
      this.guessedSoFar.push({ name: targetName, population: targetPop });
      this.nextIndex++;
      this.el('guess').value = '';
      this.el('feedback').textContent = `${targetName} — correct! (${this.fmtPop(targetPop)})`;
      this.el('feedback').className = 'feedback good';
      this.renderList();
      this.updateHeader();
      if (this.nextIndex >= this.items.length){ this.end('complete'); return; }
      this.el('guess').focus();
    } else {
      this.end('wrong', { typed: raw.trim(), canonical, targetName });
    }
  }

  renderList(){
    this.el('guessedCount').textContent = this.guessedSoFar.length;
    const container = this.el('mineList');
    container.innerHTML = this.guessedSoFar.length
      ? this.guessedSoFar.map((g, i) => `
          <div class="row"><span><span class="mine-rank-badge">#${i+1}</span>${g.name}</span><span class="pop">${this.fmtPop(g.population)}</span></div>
        `).join('')
      : this.emptyNoteHTML;
  }

  giveUp(){
    if (!this.running) return;
    this.end('gaveup');
  }

  end(reason, details){
    if (!this.running) return;
    this.running = false;
    this.el('guess').disabled = true;
    this.el('game').style.display = 'none';
    this.el('results').style.display = 'block';

    const n = this.guessedSoFar.length;
    const total = this.items.length;
    let line;
    if (reason === 'complete'){
      line = `Perfect run — you named all ${total} states in order!`;
    } else if (reason === 'wrong'){
      line = details.canonical
        ? `Game over — you got ${n} of ${total} right. "${details.typed}" is a real state, but it wasn't next — ${details.targetName} was.`
        : `Game over — you got ${n} of ${total} right. "${details.typed}" wasn't recognized; the next state was ${details.targetName}.`;
    } else {
      line = `You stopped after ${n} of ${total} correct.`;
    }
    this.el('finalScoreLine').textContent = line;

    this.el('finalGrid').innerHTML = this.items.map(([name, pop], i) => {
      const hit = i < n;
      const isMissPoint = reason === 'wrong' && i === n;
      const cls = hit ? 'hit' : (isMissPoint ? 'next' : 'miss');
      const mark = hit ? '✓' : (isMissPoint ? '✕' : '—');
      return `<div class="item ${cls}"><span>#${i+1} ${name}</span><span>${this.fmtPop(pop)} ${mark}</span></div>`;
    }).join('');
  }

  reset(){
    this.running = false;
    this.nextIndex = 0;
    this.guessedSoFar = [];
    this.el('guess').disabled = false;
    this.el('results').style.display = 'none';
    this.el('intro').style.display = 'block';
  }
}

/* ============================================================
   Node/CommonJS export shim — enables unit testing with Jest.
   Has no effect in the browser (module is undefined there), so
   the app's normal <script> loading is unaffected.
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
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
    HintedFreeRecallGame,
    PresidentsRecallGame,
    MinefieldQuiz,
    PromptQuiz,
  };
}
