<script lang="ts">
  import { onMount } from 'svelte';

  // ── Types ────────────────────────────────────────────────────────────────────
  type Card = {
    code: string;
    image: string;
    value: string;
    suit: string;
  };

  type Phase = 'idle' | 'dealing' | 'player' | 'dealer' | 'result';
  type Outcome = 'win' | 'lose' | 'tie' | 'blackjack' | null;

  // ── Constants ────────────────────────────────────────────────────────────────
  const STARTING_CREDITS = 100;
  const BET = 10;
  const CREDITS_KEY = 'mistajack_credits';
  const API_BASE = 'https://deckofcardsapi.com/api/deck';

  // ── State ────────────────────────────────────────────────────────────────────
  let phase = $state<Phase>('idle');
  let playerHand = $state<Card[]>([]);
  let dealerHand = $state<Card[]>([]);
  let dealerRevealed = $state(false);
  let deckId = $state<string | null>(null);
  let remaining = $state(52);
  let credits = $state(STARTING_CREDITS);
  let outcome = $state<Outcome>(null);
  let message = $state('');
  let loading = $state(false);
  let error = $state('');

  // ── Derived ──────────────────────────────────────────────────────────────────
  const playerValue = $derived(handValue(playerHand));
  const dealerValue = $derived(handValue(dealerHand));
  const canAct = $derived(phase === 'player' && !loading);
  const isBroke = $derived(credits < BET);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function cardNumeric(value: string): number {
    if (['JACK', 'QUEEN', 'KING'].includes(value)) return 10;
    if (value === 'ACE') return 11;
    return parseInt(value, 10);
  }

  function handValue(hand: Card[]): number {
    let total = 0;
    let aces = 0;
    for (const card of hand) {
      const v = cardNumeric(card.value);
      total += v;
      if (card.value === 'ACE') aces++;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  function isBlackjack(hand: Card[]): boolean {
    return hand.length === 2 && handValue(hand) === 21;
  }

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // ── API ──────────────────────────────────────────────────────────────────────
  async function fetchNewDeck(): Promise<string> {
    const res = await fetch(`${API_BASE}/new/shuffle/?deck_count=1`);
    if (!res.ok) throw new Error('Failed to fetch deck');
    const data = await res.json();
    return data.deck_id as string;
  }

  async function drawCards(id: string, count: number): Promise<Card[]> {
    const res = await fetch(`${API_BASE}/${id}/draw/?count=${count}`);
    if (!res.ok) throw new Error('Failed to draw cards');
    const data = await res.json();
    remaining = data.remaining as number;
    return data.cards as Card[];
  }

  async function reshuffle(id: string): Promise<void> {
    await fetch(`${API_BASE}/${id}/shuffle/`);
    remaining = 52;
  }

  // ── Core game flow ───────────────────────────────────────────────────────────
  async function ensureDeck(): Promise<string> {
    if (!deckId || remaining < 10) {
      if (deckId) {
        await reshuffle(deckId);
        return deckId;
      }
      const id = await fetchNewDeck();
      deckId = id;
      return id;
    }
    return deckId;
  }

  async function deal() {
    if (loading || isBroke) return;
    loading = true;
    error = '';
    outcome = null;
    message = '';
    dealerRevealed = false;
    playerHand = [];
    dealerHand = [];

    try {
      const id = await ensureDeck();
      phase = 'dealing';

      // Draw 4 cards at once: p1, d1, p2, d2
      const cards = await drawCards(id, 4);
      playerHand = [cards[0], cards[2]];
      dealerHand = [cards[1], cards[3]];

      credits -= BET;
      saveCredits();

      // Check immediate blackjack
      if (isBlackjack(playerHand)) {
        dealerRevealed = true;
        if (isBlackjack(dealerHand)) {
          endRound('tie');
        } else {
          endRound('blackjack');
        }
        return;
      }

      phase = 'player';
    } catch {
      error = 'API error — check your connection.';
      phase = 'idle';
      credits += BET; // refund
      saveCredits();
    } finally {
      loading = false;
    }
  }

  async function hit() {
    if (!canAct || !deckId) return;
    loading = true;
    try {
      const cards = await drawCards(deckId, 1);
      playerHand = [...playerHand, cards[0]];
      if (playerValue > 21) {
        dealerRevealed = true;
        endRound('lose');
      }
    } catch {
      error = 'API error on hit.';
    } finally {
      loading = false;
    }
  }

  async function stand() {
    if (!canAct || !deckId) return;
    loading = true;
    phase = 'dealer';
    dealerRevealed = true;

    try {
      // Dealer hits until 17+
      while (dealerValue < 17) {
        await delay(600);
        const cards = await drawCards(deckId, 1);
        dealerHand = [...dealerHand, cards[0]];
      }
      await delay(400);
      resolveStand();
    } catch {
      error = 'API error on dealer turn.';
      phase = 'result';
    } finally {
      loading = false;
    }
  }

  function resolveStand() {
    const pv = playerValue;
    const dv = dealerValue;
    if (dv > 21 || pv > dv) {
      endRound('win');
    } else if (pv === dv) {
      endRound('tie');
    } else {
      endRound('lose');
    }
  }

  function endRound(result: Outcome) {
    outcome = result;
    phase = 'result';

    if (result === 'win') {
      credits += BET * 2;
      message = 'You win! +' + BET;
    } else if (result === 'blackjack') {
      const payout = Math.floor(BET * 2.5);
      credits += payout;
      message = 'Blackjack! +' + (payout - BET);
    } else if (result === 'tie') {
      credits += BET; // push — refund bet
      message = "Push — it's a tie.";
    } else {
      message = 'Dealer wins. -' + BET;
    }
    saveCredits();
  }

  // ── Credits persistence ──────────────────────────────────────────────────────
  function loadCredits() {
    try {
      const stored = localStorage.getItem(CREDITS_KEY);
      credits = stored !== null ? parseInt(stored, 10) : STARTING_CREDITS;
    } catch {
      credits = STARTING_CREDITS;
    }
  }

  function saveCredits() {
    try {
      localStorage.setItem(CREDITS_KEY, String(credits));
    } catch {
      // ignore
    }
  }

  function resetCredits() {
    credits = STARTING_CREDITS;
    saveCredits();
    phase = 'idle';
    playerHand = [];
    dealerHand = [];
    outcome = null;
    message = '';
    error = '';
  }

  // ── Card display helper ──────────────────────────────────────────────────────
  function cardLabel(card: Card): string {
    const v: Record<string, string> = {
      ACE: 'A',
      JACK: 'J',
      QUEEN: 'Q',
      KING: 'K',
    };
    return (v[card.value] ?? card.value) + suitSymbol(card.suit);
  }

  function suitSymbol(suit: string): string {
    const s: Record<string, string> = {
      SPADES: '♠',
      HEARTS: '♥',
      DIAMONDS: '♦',
      CLUBS: '♣',
    };
    return s[suit] ?? suit;
  }

  onMount(loadCredits);
</script>

<!-- ── Template ──────────────────────────────────────────────────────────────── -->
<div class="bj">
  <!-- HUD -->
  <div class="bj-hud">
    <div class="bj-badge">
      <span class="bj-badge-label">credits</span>
      <span class="bj-badge-value">{credits}</span>
    </div>
    <div class="bj-badge">
      <span class="bj-badge-label">bet</span>
      <span class="bj-badge-value">{BET}</span>
    </div>
  </div>

  {#if error}
    <p class="bj-error">{error}</p>
  {/if}

  <!-- Dealer area -->
  <div class="bj-area">
    <div class="bj-area-label">
      dealer
      {#if dealerRevealed && phase !== 'idle'}
        <span class="bj-area-score" class:bj-bust={dealerValue > 21}>{dealerValue}</span>
      {/if}
    </div>
    <div class="bj-hand">
      {#if dealerHand.length === 0}
        <div class="bj-card bj-card-empty"></div>
        <div class="bj-card bj-card-empty"></div>
      {:else}
        {#each dealerHand as card, i (card.code)}
          {#if i === 1 && !dealerRevealed}
            <div class="bj-card bj-card-back">
              <span>🂠</span>
            </div>
          {:else}
            <img class="bj-card" src={card.image} alt={cardLabel(card)} />
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <!-- Result banner -->
  {#if message}
    <div
      class="bj-result"
      class:bj-result-win={outcome === 'win' || outcome === 'blackjack'}
      class:bj-result-lose={outcome === 'lose'}
      class:bj-result-tie={outcome === 'tie'}
    >
      {message}
    </div>
  {/if}

  <!-- Player area -->
  <div class="bj-area">
    <div class="bj-area-label">
      you
      {#if playerHand.length > 0}
        <span class="bj-area-score" class:bj-bust={playerValue > 21}>{playerValue}</span>
      {/if}
    </div>
    <div class="bj-hand">
      {#if playerHand.length === 0}
        <div class="bj-card bj-card-empty"></div>
        <div class="bj-card bj-card-empty"></div>
      {:else}
        {#each playerHand as card (card.code)}
          <img class="bj-card" src={card.image} alt={cardLabel(card)} />
        {/each}
      {/if}
    </div>
  </div>

  <!-- Actions -->
  <div class="bj-actions">
    {#if phase === 'idle' || phase === 'result'}
      {#if isBroke}
        <p class="bj-broke">Out of credits!</p>
        <button class="btn preset-filled-error-500" onclick={resetCredits}>Reset credits</button>
      {:else}
        <button class="btn preset-filled" onclick={deal} disabled={loading}>
          {phase === 'result' ? 'Next round' : 'Deal'}
        </button>
        {#if credits !== STARTING_CREDITS}
          <button class="btn preset-tonal" onclick={resetCredits} disabled={loading}>
            Reset
          </button>
        {/if}
      {/if}
    {:else if phase === 'player'}
      <button class="btn preset-filled" onclick={hit} disabled={!canAct}>Hit</button>
      <button class="btn preset-tonal" onclick={stand} disabled={!canAct}>Stand</button>
    {:else if phase === 'dealing' || phase === 'dealer'}
      <div class="bj-waiting">
        {phase === 'dealing' ? 'Dealing…' : 'Dealer playing…'}
      </div>
    {/if}
  </div>
</div>

<style>
  .bj {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 0.5rem 0.5rem 2.5rem;
    user-select: none;
    -webkit-user-select: none;
  }

  /* ── HUD ────────────────────────────────────────────────────────────────────── */
  .bj-hud {
    display: flex;
    gap: 1rem;
  }

  .bj-badge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--color-surface-100);
    border: 1px solid var(--color-surface-200-800);
    border-radius: 9999px;
    padding: 0.25rem 0.85rem;
    font-size: 0.82rem;
  }
  :global([data-mode='dark']) .bj-badge {
    background: var(--color-surface-800);
  }

  .bj-badge-label {
    color: var(--color-surface-500);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.7rem;
  }

  .bj-badge-value {
    font-weight: 700;
  }

  /* ── Area ───────────────────────────────────────────────────────────────────── */
  .bj-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }

  .bj-area-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-surface-500);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .bj-area-score {
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--color-surface-contrast-100);
    background: var(--color-surface-200);
    border-radius: 4px;
    padding: 0.05rem 0.35rem;
  }
  :global([data-mode='dark']) .bj-area-score {
    background: var(--color-surface-700);
  }

  .bj-bust {
    color: var(--color-error-500) !important;
  }

  /* ── Hand ───────────────────────────────────────────────────────────────────── */
  .bj-hand {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    min-height: 120px;
  }

  /* ── Card ───────────────────────────────────────────────────────────────────── */
  .bj-card {
    width: clamp(64px, 14vw, 88px);
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    display: block;
  }

  .bj-card-empty {
    background: var(--color-surface-200);
    border: 2px dashed var(--color-surface-300);
    aspect-ratio: 2.5 / 3.5;
    width: clamp(64px, 14vw, 88px);
  }
  :global([data-mode='dark']) .bj-card-empty {
    background: var(--color-surface-800);
    border-color: var(--color-surface-700);
  }

  .bj-card-back {
    width: clamp(64px, 14vw, 88px);
    aspect-ratio: 2.5 / 3.5;
    display: flex;
    align-items: center;
    justify-content: center;
    background: oklch(38% 0.22 260deg);
    border-radius: 6px;
    font-size: 3.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  }

  /* ── Result ─────────────────────────────────────────────────────────────────── */
  .bj-result {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 0.4rem 1.2rem;
    border-radius: 6px;
    background: var(--color-surface-200);
    animation: result-pop 0.25s ease;
  }
  :global([data-mode='dark']) .bj-result {
    background: var(--color-surface-700);
  }

  .bj-result-win {
    background: oklch(52% 0.18 148deg) !important;
    color: #fff;
  }
  .bj-result-lose {
    background: var(--color-error-500) !important;
    color: #fff;
  }
  .bj-result-tie {
    background: var(--color-surface-500) !important;
    color: #fff;
  }

  @keyframes result-pop {
    from {
      transform: scale(0.85);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* ── Actions ────────────────────────────────────────────────────────────────── */
  .bj-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    min-height: 2.5rem;
  }

  .bj-waiting {
    font-size: 0.85rem;
    color: var(--color-surface-500);
    letter-spacing: 0.06em;
    animation: pulse 1s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    from {
      opacity: 0.4;
    }
    to {
      opacity: 1;
    }
  }

  /* ── Misc ───────────────────────────────────────────────────────────────────── */
  .bj-error {
    font-size: 0.8rem;
    color: var(--color-error-500);
  }

  .bj-broke {
    font-size: 0.9rem;
    color: var(--color-error-500);
    font-weight: 600;
  }
</style>
