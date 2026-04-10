<script lang="ts">
  import { onMount } from 'svelte';

  type TileState = 'empty' | 'tbd' | 'correct' | 'present' | 'absent';
  type TilePhase = 'idle' | 'flip-out' | 'flip-in';

  const WORD_LENGTH = 5;
  const MAX_GUESSES = 6;
  const FLIP_HALF_MS = 230;
  const REVEAL_OFFSET_MS = 270;

  // ── State ──────────────────────────────────────────────────────────────────
  let targetWord = $state('');
  let puzzleNumber = $state<number | null>(null);

  let letters = $state<string[][]>(
    Array.from({ length: MAX_GUESSES }, () => Array(WORD_LENGTH).fill('')),
  );
  let tileStates = $state<TileState[][]>(
    Array.from({ length: MAX_GUESSES }, () => Array(WORD_LENGTH).fill('empty' as TileState)),
  );
  let tilePhases = $state<TilePhase[][]>(
    Array.from({ length: MAX_GUESSES }, () => Array(WORD_LENGTH).fill('idle' as TilePhase)),
  );

  let currentRow = $state(0);
  let currentCol = $state(0);
  let gameOver = $state(false);
  let gameWon = $state(false);
  let loading = $state(true);
  let submitting = $state(false);
  let message = $state('');
  let msgTimer: ReturnType<typeof setTimeout> | null = null;
  let shakeRow = $state(-1);
  let bounceRow = $state(-1);
  let poppedCell = $state('');
  let keyStates = $state<Partial<Record<string, TileState>>>({});
  let newGameConfirm = $state(false);

  const kbRows = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
  ];

  const STATE_PRIO: Partial<Record<string, number>> = { correct: 3, present: 2, absent: 1 };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  function showMsg(text: string, dur = 1800) {
    if (msgTimer) clearTimeout(msgTimer);
    message = text;
    if (dur > 0) msgTimer = setTimeout(() => (message = ''), dur);
  }

  function evaluate(guess: string, target: string): TileState[] {
    const result: TileState[] = Array(WORD_LENGTH).fill('absent');
    const tArr = target.split('');
    const used = Array(WORD_LENGTH).fill(false);
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guess[i] === tArr[i]) {
        result[i] = 'correct';
        used[i] = true;
      }
    }
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (result[i] === 'correct') continue;
      for (let j = 0; j < WORD_LENGTH; j++) {
        if (!used[j] && guess[i] === tArr[j]) {
          result[i] = 'present';
          used[j] = true;
          break;
        }
      }
    }
    return result;
  }

  // ── Flip animation for a single tile ──────────────────────────────────────
  async function flipTile(row: number, col: number, state: TileState, startDelay: number) {
    await delay(startDelay);
    tilePhases[row][col] = 'flip-out';
    await delay(FLIP_HALF_MS);
    tileStates[row][col] = state;
    tilePhases[row][col] = 'flip-in';
    await delay(FLIP_HALF_MS);
    tilePhases[row][col] = 'idle';
  }

  // ── API ────────────────────────────────────────────────────────────────────
  async function fetchWord() {
    loading = true;
    try {
      const res = await fetch('https://words.dev-apis.com/word-of-the-day?random=1');
      if (!res.ok) throw new Error();
      const data = await res.json();
      targetWord = (data.word as string).toUpperCase();
      puzzleNumber = data.puzzleNumber ?? null;
    } catch {
      targetWord = 'CRANE';
    } finally {
      loading = false;
    }
  }

  async function isValid(word: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://words.dev-apis.com/validate-word?word=${word.toLowerCase()}`,
      );
      const data = await res.json();
      return data.validWord === true;
    } catch {
      return true;
    }
  }

  // ── Game logic ─────────────────────────────────────────────────────────────
  async function submit() {
    if (submitting || gameOver || loading) return;
    const guess = letters[currentRow].join('');
    if (guess.length < WORD_LENGTH) {
      shakeRow = currentRow;
      setTimeout(() => (shakeRow = -1), 600);
      showMsg('Not enough letters');
      return;
    }
    submitting = true;
    const ok = await isValid(guess);
    if (!ok) {
      shakeRow = currentRow;
      setTimeout(() => (shakeRow = -1), 600);
      showMsg('Not in word list');
      submitting = false;
      return;
    }
    const evaluated = evaluate(guess, targetWord);
    const row = currentRow;
    await Promise.all(
      evaluated.map((state, col) => flipTile(row, col, state, col * REVEAL_OFFSET_MS)),
    );
    for (let i = 0; i < WORD_LENGTH; i++) {
      const ch = guess[i],
        ns = evaluated[i],
        ex = keyStates[ch];
      if ((STATE_PRIO[ns] ?? 0) > (STATE_PRIO[ex ?? ''] ?? 0)) keyStates[ch] = ns;
    }
    const won = evaluated.every((s) => s === 'correct');
    if (won) {
      gameWon = true;
      gameOver = true;
      newGameConfirm = false;
      bounceRow = row;
      const msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
      showMsg(msgs[row] ?? 'You got it!', 0);
      setTimeout(() => (bounceRow = -1), 1200);
    } else if (row >= MAX_GUESSES - 1) {
      gameOver = true;
      newGameConfirm = false;
      showMsg(targetWord, 0);
    } else {
      currentRow++;
      currentCol = 0;
    }
    submitting = false;
  }

  function pressKey(key: string) {
    if (gameOver || loading || submitting) return;
    if (key === 'ENTER') {
      submit();
      return;
    }
    if (key === '⌫') {
      if (currentCol > 0) {
        currentCol--;
        letters[currentRow][currentCol] = '';
        tileStates[currentRow][currentCol] = 'empty';
      }
      return;
    }
    if (/^[A-Z]$/.test(key) && currentCol < WORD_LENGTH) {
      const r = currentRow,
        c = currentCol;
      letters[r][c] = key;
      tileStates[r][c] = 'tbd';
      currentCol++;
      poppedCell = `${r},${c}`;
      setTimeout(() => (poppedCell = ''), 120);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toUpperCase();
    if (k === 'ENTER') {
      e.preventDefault();
      pressKey('ENTER');
    } else if (k === 'BACKSPACE') {
      e.preventDefault();
      pressKey('⌫');
    } else if (/^[A-Z]$/.test(k)) {
      e.preventDefault();
      pressKey(k);
    }
  }

  async function newGame() {
    const hasProgress = currentRow > 0 || currentCol > 0;
    if (!gameOver && hasProgress && !newGameConfirm) {
      newGameConfirm = true;
      return;
    }
    if (msgTimer) clearTimeout(msgTimer);
    letters = Array.from({ length: MAX_GUESSES }, () => Array(WORD_LENGTH).fill(''));
    tileStates = Array.from({ length: MAX_GUESSES }, () =>
      Array(WORD_LENGTH).fill('empty' as TileState),
    );
    tilePhases = Array.from({ length: MAX_GUESSES }, () =>
      Array(WORD_LENGTH).fill('idle' as TilePhase),
    );
    currentRow = 0;
    currentCol = 0;
    gameOver = false;
    gameWon = false;
    submitting = false;
    newGameConfirm = false;
    keyStates = {};
    message = '';
    bounceRow = -1;
    await fetchWord();
  }

  onMount(() => {
    fetchWord();
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });
</script>

<!-- ── Template ─────────────────────────────────────────────────────────────── -->
<div class="wg">
  {#if message}
    <div class="wg-toast" aria-live="polite">{message}</div>
  {/if}

  {#if loading}
    <div class="wg-loader">
      {#each Array.from({ length: WORD_LENGTH }, (_, i) => i) as i (i)}
        <div class="wg-loader-tile" style="animation-delay:{i * 120}ms"></div>
      {/each}
    </div>
  {:else}
    <!-- meta row -->
    <div class="wg-meta">
      {#if puzzleNumber != null}
        <span>#{puzzleNumber}</span>
      {/if}
      {#if submitting}
        <span class="wg-meta-checking">···</span>
      {/if}
    </div>

    <!-- board -->
    <div class="wg-board">
      {#each tileStates as row, ri (ri)}
        <div
          class="wg-row"
          class:wg-row-shake={shakeRow === ri}
          class:wg-row-bounce={bounceRow === ri}
        >
          {#each row as state, ci (`${ri}-${ci}`)}
            <div
              class="wg-tile st-{state} ph-{tilePhases[ri][ci]}"
              class:wg-tile-pop={poppedCell === `${ri},${ci}`}
            >
              {letters[ri][ci]}
            </div>
          {/each}
        </div>
      {/each}
    </div>

    <!-- keyboard -->
    <div class="wg-kb">
      {#each kbRows as krow, ki (ki)}
        <div class="wg-kb-row">
          {#each krow as key (key)}
            <button
              class="wg-key ks-{keyStates[key] ?? 'default'}"
              class:wg-key-wide={key === 'ENTER' || key === '⌫'}
              onclick={() => pressKey(key)}
              disabled={gameOver || loading || submitting}>{key}</button
            >
          {/each}
        </div>
      {/each}
    </div>

    <!-- controls -->
    <div class="wg-controls">
      <button
        class="btn {newGameConfirm ? 'preset-filled-warning-500' : 'preset-tonal-primary'}"
        onclick={newGame}
        disabled={loading || submitting}
      >
        {newGameConfirm ? 'Confirm new game' : 'New game'}
      </button>
    </div>

    {#if newGameConfirm}
      <p class="text-xs text-warning-600-400">This clears the current board.</p>
    {/if}

    {#if gameOver}
      <div
        class="card px-4 py-3 text-center {gameWon
          ? 'preset-tonal-success'
          : 'preset-tonal-warning'}"
      >
        <p class="text-sm font-semibold">{gameWon ? 'Solved' : 'Answer'}</p>
        <p class="mt-1 font-mono text-lg font-bold tracking-widest">{targetWord}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* ── root ─────────────────────────────────────────────────────────────────── */
  .wg {
    --tile-size: clamp(52px, 13vw, 62px);
    --tile-gap: 5px;
    --key-h: clamp(46px, 6.5vh, 58px);
    --key-w: clamp(26px, 8vw, 43px);
    --key-gap: clamp(4px, 1vw, 6px);
    --flip-dur: 230ms;
    --color-correct: oklch(52% 0.18 148deg);
    --color-present: oklch(68% 0.18 78deg);
    --color-absent: var(--color-surface-500);
    --color-tile-border: color-mix(in oklab, var(--color-surface-500) 55%, transparent);
    --color-tile-active: var(--color-surface-500);

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 0.5rem 0.5rem 2rem;
    user-select: none;
    -webkit-user-select: none;
  }

  /* ── toast ────────────────────────────────────────────────────────────────── */
  .wg-toast {
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 300;
    pointer-events: none;
    white-space: nowrap;
    background: var(--color-surface-950);
    color: var(--color-surface-50);
    padding: 0.5rem 1.1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    animation: toast-in 0.15s ease;
  }
  :global([data-mode='dark']) .wg-toast {
    background: var(--color-surface-50);
    color: var(--color-surface-950);
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* ── loader ───────────────────────────────────────────────────────────────── */
  .wg-loader {
    display: flex;
    gap: var(--tile-gap);
    margin-top: 4rem;
  }
  .wg-loader-tile {
    width: var(--tile-size);
    height: var(--tile-size);
    border-radius: 4px;
    background: var(--color-surface-200);
    animation: loader-pulse 1s ease-in-out infinite alternate;
  }
  :global([data-mode='dark']) .wg-loader-tile {
    background: var(--color-surface-800);
  }
  @keyframes loader-pulse {
    from {
      opacity: 0.3;
    }
    to {
      opacity: 1;
    }
  }

  /* ── meta ─────────────────────────────────────────────────────────────────── */
  .wg-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 1.1rem;
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    color: var(--color-surface-400);
  }
  .wg-meta-checking {
    letter-spacing: 0.3em;
    animation: loader-pulse 0.6s ease-in-out infinite alternate;
  }

  /* ── board ────────────────────────────────────────────────────────────────── */
  .wg-board {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
  }
  .wg-row {
    display: flex;
    gap: var(--tile-gap);
  }

  /* ── tile ─────────────────────────────────────────────────────────────────── */
  .wg-tile {
    width: var(--tile-size);
    height: var(--tile-size);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: clamp(1.4rem, 3.8vw, 2rem);
    font-weight: 800;
    border-radius: 4px;
    border: 2px solid var(--color-tile-border);
    background: transparent;
    color: inherit;
    transition: border-color 0.05s;
  }

  /* state colours */
  .st-tbd {
    border-color: var(--color-tile-active);
  }
  .st-correct {
    background: var(--color-correct);
    border-color: var(--color-correct);
    color: #fff;
  }
  .st-present {
    background: var(--color-present);
    border-color: var(--color-present);
    color: #fff;
  }
  .st-absent {
    background: var(--color-absent);
    border-color: var(--color-absent);
    color: #fff;
  }

  /* flip animation */
  .ph-flip-out {
    animation: flip-out var(--flip-dur) ease-in forwards;
  }
  .ph-flip-in {
    animation: flip-in var(--flip-dur) ease-out forwards;
  }

  @keyframes flip-out {
    from {
      transform: scaleY(1);
    }
    to {
      transform: scaleY(0);
    }
  }
  @keyframes flip-in {
    from {
      transform: scaleY(0);
    }
    to {
      transform: scaleY(1);
    }
  }

  /* letter pop on type */
  .wg-tile-pop {
    animation: tile-pop 0.1s ease;
  }
  @keyframes tile-pop {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.14);
    }
  }

  /* ── row animations ───────────────────────────────────────────────────────── */
  .wg-row-shake {
    animation: row-shake 0.52s ease;
  }
  .wg-row-bounce {
    animation: row-bounce 0.85s ease;
  }

  @keyframes row-shake {
    0%,
    100% {
      transform: translateX(0);
    }
    15% {
      transform: translateX(-8px);
    }
    30% {
      transform: translateX(8px);
    }
    45% {
      transform: translateX(-8px);
    }
    60% {
      transform: translateX(5px);
    }
    75% {
      transform: translateX(-3px);
    }
    90% {
      transform: translateX(2px);
    }
  }
  @keyframes row-bounce {
    0%,
    100% {
      transform: translateY(0);
    }
    20% {
      transform: translateY(-14px);
    }
    40% {
      transform: translateY(-5px);
    }
    60% {
      transform: translateY(-10px);
    }
    80% {
      transform: translateY(-2px);
    }
  }

  /* ── keyboard ─────────────────────────────────────────────────────────────── */
  .wg-kb {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .wg-kb-row {
    display: flex;
    justify-content: center;
    gap: var(--key-gap);
  }
  .wg-key {
    width: var(--key-w);
    height: var(--key-h);
    border: none;
    border-radius: 4px;
    font-size: clamp(0.6rem, 2vw, 0.78rem);
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    background: var(--color-surface-200);
    color: var(--color-surface-contrast-200);
    transition:
      background-color 0.2s,
      color 0.15s,
      opacity 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  :global([data-mode='dark']) .wg-key {
    background: var(--color-surface-700);
    color: var(--color-surface-contrast-700);
  }
  .wg-key-wide {
    width: clamp(44px, 13vw, 66px);
    font-size: clamp(0.52rem, 1.5vw, 0.68rem);
  }
  .wg-key:hover:not(:disabled) {
    filter: brightness(0.88);
  }
  .wg-key:disabled {
    cursor: default;
    opacity: 0.8;
  }

  /* key state colours */
  .ks-correct {
    background: var(--color-correct) !important;
    color: #fff !important;
  }
  .ks-present {
    background: var(--color-present) !important;
    color: #fff !important;
  }
  .ks-absent {
    background: var(--color-absent) !important;
    color: #fff !important;
  }

  /* ── controls ─────────────────────────────────────────────────────────────── */
  .wg-controls {
    display: flex;
    gap: 10px;
    margin-top: 2px;
  }
</style>
