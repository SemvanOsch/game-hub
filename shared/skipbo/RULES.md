# Skip-Bo — rules as implemented

This is the exact rule definition the authoritative engine (`engine.ts`) enforces.
The client mirrors these rules only for move hints; the server is the sole
authority.

## Goal

Be the first player to empty your **stockpile**.

## Deck

162 cards (`cards.ts` → `createSkipBoDeck`):

- 144 number cards — twelve copies each of the values **1–12**
- 18 **Skip-Bo** wild cards

Every card has a unique id. The server shuffles authoritatively (Fisher–Yates).

## Setup (`createGame`)

- Support **2–6 players**.
- Each player is dealt a face-down **stockpile** whose size depends on the
  **game length** the host chose in the lobby (`stockSize`):
  - **Long** (default, standard Skip-Bo): **30 cards** for 2–4 players, **20** for 5–6.
  - **Short**: **20 cards** for 2–4 players, **15** for 5–6.

  Only the top stock card is ever visible (to everyone, including the owner).
- Four empty shared **building piles** and, per player, four empty **discard
  piles** are created.
- The **starting player** is the first seat in join order — the same convention
  every other GameHub game uses. It is server-authoritative and visible to all.
- The starting player draws their opening hand (see turn flow).

## Turn flow

1. **Draw** (automatic, server-side): at the start of your turn your hand is
   filled up to **5 cards** from the draw pile. Drawing is not a client action, so
   it can never be duplicated or skipped by a client.
2. **Play** zero or more legal cards onto the building piles, from any of:
   - the top of your **stockpile**,
   - a card in your **hand**,
   - the top of any of your four **discard piles**.
   You may keep playing while legal moves remain — a turn is not forced to end
   after one play.
3. If you play your **entire hand** onto building piles (without discarding), you
   immediately draw a fresh hand of 5 and continue the same turn.
4. **End your turn** by discarding exactly one hand card onto one of your four
   discard piles. Play then passes to the next seat.

## Building piles

- Each pile is built strictly **1 → 12**.
- An empty pile requires a **1** (or a Skip-Bo).
- A pile whose top is *k* requires *k+1* (`requiredValue` = pile length + 1).
- When a pile reaches **12** it is **completed**: its 12 cards are moved to the
  completed reservoir and the slot reopens empty. This happens automatically.

## Skip-Bo wild cards

A Skip-Bo card may be played as **any** required value. Because a building pile
requires exactly one specific value at any moment, the effective value is
**auto-assigned** — there is never a meaningful choice to prompt for. The played
value is recorded as `playedAs` on the building card; the original card keeps
`type: 'skipbo'` and reads back as a wild.

## Discard piles

- Four per player. Any card may be placed on any discard pile (there is no
  ordering requirement).
- Only the **top** card of a discard pile is playable.
- Discarding one hand card is what **ends** your turn.

## Winning

The first player to play the **last card of their stockpile** wins immediately.
The match ends at once; no further actions are accepted. You do **not** need to
empty your hand or discard piles.

## Draw-pile recycling

When the draw pile empties, the **completed** building-pile cards are shuffled to
form a fresh draw pile (`refillDraw`). Cards that are still legitimately in play
(hands, stockpiles, discard piles, active building piles) are never recycled. If
both the draw pile and the completed reservoir are empty, a player simply plays
with a smaller hand — the game is never blocked.

## Turn timer

Each turn has a **60-second** limit (`TURN_MS`, easy to change). It is
server-authoritative: the deadline is fixed when the turn begins and is **not**
extended by making plays, so a client cannot lengthen its own turn. Clients
receive `turnDeadline` + `serverNow` to render a synchronized countdown.

### Turn-timer expiration (`tickMatch`)

When the deadline passes, the server forces the turn to end with a deterministic
fallback: the player's **first hand card** is discarded onto their **first
discard pile**, then play advances. If the player's hand is empty, the turn simply
advances. The match can never become permanently stuck on an expired turn.

## Disconnect / leave (`removePlayerFromGame`)

A player who disconnects or leaves is removed from the match (GameHub has no
in-game reconnect: leaving a room removes the player, exactly as for every other
game). Their hand, stockpile and discards are dropped into the completed reservoir
so those cards can still recycle into the draw pile. If it was their turn, control
passes to the next seat. If only one player remains, that player wins.

## Deliberate simplifications

- **Automatic drawing** at turn start (and after emptying the hand) rather than a
  manual "draw" action — simpler, and removes a whole class of duplicate-action
  bugs. The rule outcome (hand of 5 at the start of each turn) is unchanged.
- **Skip-Bo value auto-assignment** — a building pile requires exactly one value,
  so no value picker is shown; the wild always takes the required value.
- **Stock size** is chosen via a single lobby toggle (Long 30/20, Short 20/15)
  rather than exposing every official "longer/shorter game" variant.
