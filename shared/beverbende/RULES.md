# Beverbende — rules as implemented

Beverbende ("the beaver gang", 999 Games) is a memory/tactical card game in the
Cabo family. Each player keeps four face-down cards; over several rounds you try
to end with the **lowest** total. This file records the exact rules this engine
implements and every deliberate interpretation, so the code and the rules stay in
sync (see also `shared/skipbo/RULES.md` for the sibling convention).

## Deck (verified composition — 66 cards)

Number cards (45 total):

| Value | Copies |
| ----- | ------ |
| 0–8   | 4 each (36) |
| 9     | 9 |

Special ("power") cards (21 total), worth **0 points** but replaced at scoring:

| Special       | Copies |
| ------------- | ------ |
| Swap (ruil)   | 9 |
| Peek (spiek)  | 7 |
| Draw Two (pak twee) | 5 |

Sources: 999 Games / kaartspelletjes.nl / thegameroom.org. The low card is a 0 and
the 9 is deliberately over-represented (it is the card you most want to avoid).

## Setup (each round)

1. Shuffle the deck server-side (Fisher–Yates, injected RNG).
2. Deal each player 4 cards face-down in a row (positions 0–3).
3. Each player privately learns their two **outer** cards (positions 0 and 3).
4. The two middle cards (1 and 2) stay unknown.
5. Remaining cards form the face-down **draw pile**.
6. The top draw card is turned face-up to start the **discard pile**. If it is a
   special card it is buried at the bottom of the draw pile and the next card is
   flipped, repeating until a number card starts the discard (physical setup rule).

During the initial **reveal** phase each player memorises their outer cards and
presses **Ready** (which hides their own cards immediately — there is no timed
reveal window); play begins once every connected player is ready. A generous
safety timer only prevents one idle player from stalling the table indefinitely.

## A turn

On your turn (no action in progress) you choose one of:

- **Action A — take the discard.** Take the face-up top of the discard pile and
  swap it into one of your four positions *without inspecting the replaced card*.
  The replaced card goes face-up onto the discard pile. **Only number cards may be
  taken this way** — a special card on top of the discard cannot be taken (enforced
  server-side, not just hidden in the UI).
- **Action B — draw from the draw pile.** You draw the top draw card and may see it,
  then resolve it (below).
- **Knock (declare the last round).** Only after every player has had at least one
  turn this round, and only if nobody has knocked yet. You take no further action;
  every *other* player gets exactly one final turn, then the round ends.

### Resolving a drawn card (Action B)

- **Number card:** either **replace** one of your four cards with it (old card to the
  discard, and you now *know* that position), or **discard** it face-up unused.
- **Special card:** either **use** its action (below) or **discard** it unused. Either
  way the special card ends on the discard pile.

### Special actions

- **Peek:** look at one of *your own* four cards. It stays in place and you know it for
  the rest of the round. Revealed only to you (never broadcast).
- **Swap:** choose one of your cards and one card of another player and swap them,
  blind. Neither card is revealed. Knowledge is **positional**: after a swap both
  affected positions become unknown to their owners — a card you knew and swapped
  away does not tell you the new card, and the other player does not learn what
  arrived (matches the prompt's swap requirement).
- **Draw Two:** draw a first extra card and look at it. Either resolve it by the normal
  Action-B rules (replace/discard for a number, use/discard for a special), or decline
  it (it is discarded) and draw a **second** card which you then resolve by the normal
  rules. A special card drawn this way may itself be used; a Draw Two drawn inside a
  Draw Two simply chains (bounded by the finite draw pile).

When the draw pile is empty it is refilled by reshuffling the discard pile, keeping
its current top card. If nothing can be drawn the round ends immediately.

## Ending a round & scoring

The round ends when the knocker's final-turn sequence completes (or the draw pile is
exhausted). Then:

1. Reveal every player's four cards.
2. Number cards score their printed value.
3. Any special cards still in a row are replaced by drawing number cards from the
   draw pile (refilling from the discard if needed) until the row is four numbers.
4. Sum each player's four numbers → the round score, added to their cumulative total.

## Multi-round & winner

The host picks the number of rounds (2–6) in the lobby; the default is **5** (the box
standard). The **standard rules leave the round count to agreement (2–6)**, so it is a
lobby option rather than derived from player count. After each round the starting
player rotates one seat, a fresh deck is dealt, and the next round begins (after a
short scoreboard pause). After the final round the player(s) with the **lowest**
cumulative score win; ties share the win (co-winners), per the physical convention.

## Server authority & hidden information

The authoritative state holds every card, the full draw-pile order and each player's
per-position knowledge. `getPlayerView` is the single choke point:

- A player sees the **value** of their own cards only for positions they currently know.
- Opponents' cards are never serialized with identities during play — the value is
  omitted from the wire, not merely hidden in the UI. All four cards are revealed to
  everyone only during the end-of-round reveal.
- A card drawn via Action B / Draw Two is sent only to the acting player while pending.
- The draw pile is a count only; the discard pile exposes only its face-up top card.

`shared/beverbende/view.test.ts` guards these invariants.

## Disconnect / reconnect

Beverbende follows GameHub's standard model: a disconnect removes the player from the
room and `removePlayer` reshapes the round (their cards leave play, turn/knock state is
repaired, and if fewer than two players remain the game ends). There is no bespoke
reconnect path — the shared socket/session handling is reused unchanged.
