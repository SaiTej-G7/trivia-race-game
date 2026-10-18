# Trivia Race

A real-time, room-code-based multiplayer trivia race built with Node.js, Express, and Socket.IO. Players answer general-knowledge questions, move across a 30-space race board, trigger boosts and slides, and compete for the finish. The browser UI is implemented in vanilla HTML, CSS, and JavaScript; retro audio is synthesized locally with the Web Audio API and does not require sound assets.

## Features

- Real-time rooms with shareable room codes and reconnectable player sessions.
- Six-player room capacity, nickname validation, and host-controlled match starts.
- Server-authoritative question progression, answer validation, movement, and winner selection.
- 30-question match cap and immediate finish when a player reaches space 30.
- Four boosts and four slides, rendered as vector-like board effects.
- Sequential movement animation ordered by server-provided move plans.
- Responsive desktop two-column layout and a single-column tablet/mobile layout down to 320px.
- Zero-asset synthesized sounds for correct answers/boosts, penalties/slides, and victory.

## Architecture overview

```text
trivia-race/
├── server.js                 # Express app, Socket.IO events, authoritative game state/rules
├── package.json              # Dependencies and npm scripts
├── package-lock.json         # Locked dependency versions (recommended)
├── .env                      # Optional local environment variables; never commit secrets
├── .gitignore                # Excludes node_modules, .env, logs, and local artifacts
└── public/
    └── index.html            # Single-page UI, responsive CSS, client logic, board rendering, Web Audio SFX
```

### Runtime responsibilities

**Server (`server.js`)**

- Creates and manages rooms and player identities.
- Enforces the maximum of six players and validates room/name inputs.
- Keeps authoritative positions, scores, streaks, rounds, question answers, board effects, and match status.
- Verifies host authority before starting or restarting a match.
- Emits room state, answer feedback, and movement plans to connected clients.
- Resolves winner and tie-break rules on the server rather than trusting client calculations.

**Client (`public/index.html`)**

- Displays the lobby, question, board, controls, racers, and results.
- Uses Socket.IO to send player actions and receive authoritative updates.
- Animates server-provided movement plans in their supplied order.
- Stores only the reconnect/session information needed by the existing client flow.
- Generates optional sound effects with native Web Audio oscillators. Audio is lazily initialized or resumed from user-gesture handlers; if audio is unsupported or blocked, gameplay continues without sound.

## Requirements

- Node.js 18 or newer recommended.
- npm (bundled with Node.js).
- A modern browser with Socket.IO-compatible WebSocket support. Web Audio is optional.

## Installation and setup

1. Install Node.js from the official Node.js website if it is not already installed.
2. Open a terminal in the project root (the directory containing `package.json`).
3. Install dependencies:

   ```bash
   npm install
   ```

4. Review `package.json` and confirm the intended start script. If the project does not already define one, add a script such as `"start": "node server.js"` without removing existing scripts.
5. Configure environment variables only if the server implementation reads them. For example, a deployment may use `PORT=3000`; do not add environment variables that the current code does not consume. If using a `.env` file, ensure the project loads it (for example with `dotenv`) before relying on it.
6. Start the application:

   ```bash
   npm start
   ```

   If there is no `start` script, run:

   ```bash
   node server.js
   ```

7. Open the local URL printed by the server, commonly `http://localhost:3000` or the configured port.
8. Open a second browser window or another device to test multiplayer. Create a room, share the room code, and join with another player. Only the active host should see and be authorized to use **Start Race**.

## Environment configuration

Keep local secrets and deployment-specific settings outside source control. A typical `.env` file might contain:

```dotenv
PORT=3000
NODE_ENV=development
```

These are examples only: use a variable only if `server.js` reads it. Add `.env` to `.gitignore`; never commit credentials or session secrets. In production, configure environment variables in the hosting platform and serve the app over HTTPS.

## Game board and boustrophedon coordinate matrix

The 30-space board is a 5-column by 6-row matrix. Its traversal uses a boustrophedon (alternating snake) pattern: the first row moves left-to-right, the next row right-to-left, and the direction alternates on each row. This preserves a continuous path without jumping across the board.

For a one-based position `p` and a board width `W = 5`:

```text
rowFromBottom = floor((p - 1) / W)
columnInRow   = (p - 1) mod W

if rowFromBottom is even:
    column = columnInRow
else:
    column = W - 1 - columnInRow

rowFromTop = (numberOfRows - 1) - rowFromBottom
```

The resulting `(rowFromTop, column)` pair is the visual grid coordinate for position `p`. For vector effects, the same coordinate conversion should be used consistently when converting an origin and destination into screen-space or grid-space vectors. Keep this mapping aligned between the client renderer and server validation so displayed paths match authoritative movement.

## Boost/slide graph safety and infinite-loop protection

Board effects can be modeled as directed edges from a trigger tile to a landing tile. A boost points forward; a slide points backward. The server should validate each edge before a match begins and reject malformed effects rather than letting the client decide whether a move is legal.

Recommended safety checks, consistent with the application's existing validation logic:

1. **Bounds:** every origin and landing position must be an integer within the permitted board range. Effect origins are constrained to the configured valid range (currently spaces 6–27).
2. **Distinctness:** do not place multiple effects on the same origin unless the rules explicitly support it; do not allow a landing pad to create ambiguous chained movement.
3. **Direction:** boosts must advance and slides must retreat, unless the specific game rules explicitly define otherwise.
4. **Cycle detection:** treat effects as a directed graph and track visited nodes while traversing effect chains. If a node is revisited, the graph contains a cycle; reject or regenerate the effect configuration.
5. **Traversal limit:** use a finite visited set and/or maximum number of traversed edges so malformed input cannot create an unbounded loop.
6. **Landing-pad validation:** verify destinations do not violate configured landing-pad restrictions and that any effect chain terminates at a normal tile or a valid terminal position.
7. **Server authority:** validate and resolve effects on the server. The browser only animates the supplied movement plan and should not invent a different path.

These checks prevent infinite chaining, invalid destinations, and disagreement between the visual board and the authoritative game state. Preserve the existing graph-validation loops and their traversal semantics when making UI changes.

## Responsive layout and accessibility

- Above 1024px, the game uses a centered frame capped at 1280px, with the board/question area on the left and controls/leaderboard on the right.
- At 1024px and below, the game columns stack vertically in DOM order: question panel, race board, game controls, then racers leaderboard.
- At narrow widths, including 320px, panel padding and board/token sizing scale down, text can wrap, and columns are constrained to avoid horizontal page scrolling.
- Interactive controls use a minimum touch height of 44px on small screens.
- Test with browser responsive tools at 320px, 360px, 390px, 768px, 1024px, and desktop widths.

## Retro sound engine

The client uses the browser's built-in Web Audio API and creates oscillators and gain envelopes on demand:

- **Correct / boost:** short rising 523Hz-to-1046Hz chime using triangle and square tones.
- **Penalty / slide:** descending sawtooth sweep from approximately 400Hz to 100Hz with a quiet square-wave layer.
- **Victory:** a short three-note arpeggio with a low-volume harmony.

The audio context is unlocked from user interactions such as creating/joining a room or starting a race. Sound calls are intentionally non-critical; unsupported audio devices or browser policies must not interrupt multiplayer events or rendering.

## Verification checklist

- [ ] `npm install` completes and the server starts without errors.
- [ ] Two or more players can join the same room and room capacity is limited to six.
- [ ] Only the active host sees **Start Race** and only the host can start/restart.
- [ ] A correct answer plays the rising chime; wrong answers/penalties and slides play the descending effect; the results overlay triggers the victory fanfare.
- [ ] A match uses no more than 30 questions and reaching space 30 ends the race immediately.
- [ ] Board coordinates and boost/slide animations follow the alternating snake path.
- [ ] Invalid effect cycles are rejected/regenerated by server-side validation.
- [ ] Layout is readable at 320px and has no horizontal overflow at phone/tablet breakpoints.
- [ ] Reconnection/session restoration and existing Socket.IO event payloads still behave as before.

## Troubleshooting

- **Port already in use:** set `PORT` to an available port if the server supports it, then restart.
- **Clients do not synchronize:** confirm all clients use the same server URL and inspect the server/browser console for Socket.IO errors.
- **No sound:** interact with the page first, check browser tab/device volume, and verify Web Audio support. Sound is optional and must not block gameplay.
- **Layout overflow:** test the actual viewport width and inspect long nicknames, room codes, and browser zoom; avoid adding fixed widths to the responsive columns.

## Development notes

Keep game rules and security-sensitive checks on the server. UI-only work should not change room management, session-token storage, matchmaking forms, nickname verification, host authorization, Socket.IO payload schemas, server-supplied chronological movement ordering, or mathematical graph-validation loops. Before committing, review the diff and run `node --check server.js` plus a browser-based multiplayer smoke test.

## License

Add the license that matches the project's ownership and distribution terms before publishing the repository.
