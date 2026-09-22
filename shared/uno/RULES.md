# UNO — implemented rule definition

The single source of truth for how this UNO variant behaves. The authoritative
engine (`shared/uno/engine.ts`) implements exactly what is written here; the
renderer only mirrors it for UX. Everything is server-authoritative — the client
is never trusted for deck contents, hands, turns, legality, colour, penalties,
UNO status or the winner.

## Deck composition (108 cards)

Per colour (red, yellow, green, blue):

- one `0`
- two each of `1`–`9`
- two `Skip`, two `Reverse`, two `Draw Two`

Plus four `Wild` and four `Wild Draw Four`. Total: 4 × 25 + 8 = **108**.

Wild cards carry `color: null`. The colour chosen after a wild is played lives in
the game's `activeColor`, never on the card.

## Players & starting hand

2–8 players. Each player is dealt **7 cards**. The remaining cards form the draw
pile; one card is flipped to start the discard pile.

## Starting discard

The first discard is **always a number card**. If the flipped card is an action
or wild card it is shuffled back and another is flipped, until a number card
appears. `activeColor` is that card's colour and play begins with the first
player in seat order (`playerOrder[0]`), going forward.

*Deliberate simplification:* real UNO applies the first flipped action card to
the opening player. Forcing a number opener removes the ambiguous opening-Wild /
opening-Draw-Two cases and keeps the start deterministic.

## Turn order & direction

`direction` is `1` (forward through `playerOrder`) or `-1` (backward). The
current player is tracked by id. Advancing by *n* steps moves *n* seats in the
current direction (wrapping around).

## Legal plays

On your turn you may play a card that matches the top of the discard by:

- **Colour** — the card's colour equals `activeColor`, or
- **Symbol** — same number value (number on number), or the same action type
  (e.g. Skip on Skip, Reverse on Reverse, Draw Two on Draw Two), or
- the card is a **Wild** (always legal), or a **Wild Draw Four** (legal only
  under the restriction below).

If you cannot or do not want to play, you **draw one card** (see Drawing).

## Action cards

- **Skip** — the next player is skipped (turn advances two seats).
- **Reverse** — `direction` flips. With **2 players**, Reverse acts as a Skip
  (the player who played it goes again).
- **Draw Two** — the next player draws 2 cards and is skipped, unless the
  **stacking** house rule is enabled (see below).

## Wild

Playing a **Wild** puts it on the discard and the game enters a
`choosing_color` phase for that same player; the turn does **not** advance until
they send a valid colour choice (`red`/`yellow`/`green`/`blue`). Only that player
may choose, and only once — duplicate/foreign colour choices are rejected. After
the choice, `activeColor` becomes the chosen colour and play advances one seat.

## Wild Draw Four

- **Legality:** may only be played when you have **no card matching the current
  `activeColor`** (numbers/actions/`0` of that colour). The server checks your
  actual hand and rejects an illegal Wild Draw Four.
- On play: enter `choosing_color` for the player. After they choose a colour,
  the **next** player draws **4** cards and is **skipped** (turn advances two
  seats), unless **stacking** is enabled (see below).

## Stacking (host option, off by default)

The host may enable stacking in the lobby (`options.stacking`). When on:

- Playing a Draw Two does **not** immediately penalise the next player. Instead a
  running penalty accumulates (`pendingDraw`) and passes to the next player, who
  must either play **another Draw Two** (adding +2 and passing it on) or **draw
  the whole accumulated penalty** and lose their turn.
- Wild Draw Four stacks the same way (+4 each), and stacks **only onto Wild Draw
  Four** — the two types never mix. While answering a Wild Draw Four stack, the
  "no matching colour" restriction is relaxed.
- While a stack is pending, the only legal play is a matching draw card; every
  other card is rejected, and drawing absorbs the full stack.

When stacking is **off** (default), Draw Two / Wild Draw Four apply their penalty
immediately and skip the next player, with no accumulation — the two modes never
mix behaviour.

## Drawing

`draw_card` draws exactly one card from the draw pile:

- If the drawn card is **playable**, you may either play *that card* this turn or
  **pass** (`pass`) to end your turn. You cannot play a different held card after
  drawing.
- If the drawn card is **not playable**, your turn ends automatically.

## Draw pile recycling

When the draw pile is empty and a card must be drawn, all discards **except the
current top card** are shuffled to form a new draw pile (server-side). The top
card is preserved. If no cards remain to draw at all (tiny edge case), the draw
is a no-op and play continues.

## UNO call & penalty

- When a play reduces your hand to **exactly one card**, you must declare UNO.
  You do this by playing that card with `declareUno: true` (the UNO button), or
  by sending `call_uno` **before** an opponent catches you.
- If you drop to one card **without** declaring, you are *catchable*: any other
  player may send `catch_uno` targeting you, and you draw **2 penalty cards**.
- The catch window is deterministic and needs no timer: it opens the moment you
  drop to one card and closes when your **own next turn begins** (you "got away
  with it") or when you are caught. Calling `call_uno` yourself during the window
  closes it safely.
- Fake calls are impossible: `call_uno` only does anything while you actually
  have one card and are catchable; `catch_uno` only succeeds against a player who
  is genuinely catchable.

## Win condition & scoring

The first player to empty their hand **wins immediately**; the game ends. If a
card that empties your hand is an action/wild card, the game ends at once and its
effect is **not** applied (there is no one left to affect).

**Scoring: winner-only (Option A).** The round has a single winner; no points are
tallied from opponents' remaining cards. Match results are recorded through the
standard GameHub pipeline via the winner's id.

## Disconnect / leave

A player who leaves or disconnects is removed from the match; their cards leave
play. If it was their turn, play advances to the next player. If only one player
remains, that player wins. This uses the standard GameHub room lifecycle.
