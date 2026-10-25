# Trivia Race

A real-time, room-code-based multiplayer trivia game built with **Node.js, Express, Socket.IO, and Redis**. Players answer general-knowledge questions, move across a 30-space race board, trigger boosts and slides, and race to the finish. The browser UI is built with vanilla HTML, CSS, and JavaScript. Retro sound effects are synthesized in the browser with the Web Audio API, so no audio files are required.

**Live game:** https://trivia-race-game.onrender.com  
**Repository:** https://github.com/SaiTej-G7/trivia-race-game

## Features

- Real-time multiplayer rooms with shareable room codes.
- Reconnectable player sessions.
- Room capacity of up to six players, nickname validation, and host-controlled match starts.
- Server-authoritative game state, answer validation, question progression, movement, and winner selection.
- Redis-backed room/game state for the deployed server.
- A maximum of 30 questions per match; a player reaching space 30 ends the race.
- Four boosts and four slides on the 30-space board.
- Ordered movement animations based on server-provided move plans.
- Animation acknowledgements to coordinate progression between rounds.
- Responsive layout for desktop, tablet, and mobile screens down to 320px.
- Locally synthesized sound effects for correct answers, boosts, penalties, slides, and victory.

## Tech stack

- **Runtime:** Node.js 18+
- **Server:** Express
- **Realtime communication:** Socket.IO
- **Shared game state:** Redis, using the configured Redis connection
- **Socket.IO scaling:** `@socket.io/redis-adapter`
- **Client:** HTML, CSS, vanilla JavaScript
- **Audio:** Web Audio API
- **Hosting:** Render

## Project structure

```text
trivia-race/
├── public/
│   └── index.html                 # Game UI, responsive styles, client logic, board and sound effects
├── services/
│   ├── RedisGameService.js        # Redis-backed game state and room locking
│   ├── GameEngine.js              # Core game rules and state transitions
│   └── DeadlineWorker.js           # Deadline/expired-room processing
├── socket/
│   ├── connectionHandlers.js      # Socket connection and player/session events
│   └── gameHandlers.js            # Game actions, rounds, answers and animation acknowledgements
├── app.js                         # Express/Socket.IO setup, Redis adapter and worker polling
├── server.js                      # Production/local server entry point
├── package.json                   # Scripts and dependencies
├── package-lock.json              # Locked dependency versions
├── .env                           # Local environment variables; do not commit
├── .gitignore                     # Excludes secrets and local/generated files
└── README.md
```

> Deployment note: Render starts the app through `server.js`. The app uses `app.js` to initialize the Express/Socket.IO application and background deadline checks. Vercel-specific files are not required when Render is the only deployment target.

## Requirements

- Node.js 18 or newer
- npm
- A Redis service and its connection URL for environments that use Redis-backed game state
- A modern browser with Socket.IO support; Web Audio is optional

## Run locally

1. Clone the repository and open the project directory:

   ```bash
   git clone https://github.com/SaiTej-G7/trivia-race-game.git
   cd trivia-race-game
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a local `.env` file in the project root and set the environment variables required by your deployment configuration. For example:

   ```dotenv
   PORT=3000
   NODE_ENV=development
   REDIS_URL=your_redis_connection_url
   ```

   Replace the Redis placeholder with a valid connection URL. Keep credentials private and never commit `.env`. Only set variables that the application uses.

4. Start the server:

   ```bash
   npm start
   ```

   The development script is also configured to run `node server.js`:

   ```bash
   npm run dev
   ```

5. Open the local address shown by the server, usually `http://localhost:3000` when `PORT=3000`.
6. Open another browser window or device, create a room, and join with the room code to test multiplayer. The host should be the only player authorized to start or restart the race.

## Deploy on Render

1. Push the project to the GitHub repository.
2. In Render, create or select a **Web Service** connected to the repository.
3. Configure the service to use Node.js and set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Add the required environment variables in the Render dashboard, including `REDIS_URL` for your Redis service. Set `NODE_ENV=production` if appropriate for your configuration.
5. Deploy and open the Render URL. Test the game using at least two browser sessions.

Keep Redis credentials and other secrets in Render's environment settings rather than in source control. Use HTTPS in production. If Redis is unavailable or misconfigured, room state and realtime features that depend on it may not work correctly.

## Game flow and server authority

The server is responsible for room membership, player identity/session handling, host permissions, question and answer validation, player positions, board effects, round progression, deadlines, and winner selection. The browser sends player actions and renders the state and movement plans supplied by the server; it should not independently determine legal moves or the winner.

After a round's movement animation, clients acknowledge completion through the Socket.IO animation-complete event. The server coordinates acknowledgements from active connected players before advancing the game. Preserve the existing event names, payload shapes, and acknowledgement flow when modifying the client or server.

## Board layout and coordinates

The board contains 30 spaces arranged in five columns and six rows. Spaces follow a boustrophedon (snake-like) path: one row runs left-to-right, the next right-to-left, alternating on each row. Keep the client rendering and server movement logic consistent so a player's displayed movement matches the authoritative position.

For a one-based position `p` and board width `W = 5`, the conceptual mapping is:

```text
rowFromBottom = floor((p - 1) / W)
columnInRow   = (p - 1) mod W

if rowFromBottom is even:
    column = columnInRow
else:
    column = W - 1 - columnInRow

rowFromTop = (numberOfRows - 1) - rowFromBottom
```

## Boosts, slides, and validation

Boosts move a player forward and slides move a player backward according to the configured board effects. Keep effect generation and validation on the server. When changing this logic, verify that:

- Effect positions and destinations are within the valid board range.
- Boosts and slides follow the game's configured direction rules.
- Duplicate origins and invalid landing pads are handled according to the existing rules.
- Traversal is bounded and cycles cannot cause unbounded effect chaining.
- The server-provided movement plan matches the path rendered by the client.

Do not replace or simplify the existing graph-validation or traversal logic without testing the current game rules.

## Responsive design and audio

The client layout adapts from a desktop two-column view to a stacked tablet/mobile layout. Test at 320px, 360px, 390px, 768px, 1024px, and common desktop widths. Check long nicknames and room codes for overflow, and preserve usable touch targets on small screens.

Sound effects are generated with the browser's Web Audio API. Browser autoplay restrictions may require a user interaction before audio plays. If audio is unsupported or blocked, gameplay should continue normally without sound.

## Verification checklist

- [ ] `npm install` completes and `npm start` launches the server.
- [ ] Redis connection and Socket.IO initialization complete without errors.
- [ ] Two or more players can join the same room, with a maximum of six players.
- [ ] Only the host can start or restart the match.
- [ ] Correct and incorrect answers update the game state correctly.
- [ ] Round progression works after movement animations complete.
- [ ] A match does not exceed 30 questions and reaching space 30 ends the race.
- [ ] Boosts and slides animate along the expected snake-shaped board path.
- [ ] Reconnection restores the appropriate player/session state.
- [ ] The UI remains usable at mobile and desktop breakpoints.
- [ ] Sound effects are optional and do not block game actions.

## Troubleshooting

- **Server does not start:** confirm the Node.js version, run `npm install`, and inspect the terminal output.
- **Redis connection errors:** verify that `REDIS_URL` is set correctly in `.env` locally or in Render's environment settings, and confirm the Redis service is reachable.
- **Players do not synchronize:** confirm all clients are connected to the same deployed server and inspect the browser and server logs for Socket.IO errors.
- **A round does not advance:** inspect server logs and verify that animation-complete acknowledgements are emitted by clients and processed by the server. Avoid changing the acknowledgement contract without checking all related handlers.
- **Port already in use:** stop the other process or choose an available `PORT` if supported by the app.
- **No sound:** interact with the page, check browser/device volume, and verify Web Audio support. Sound is not required for gameplay.
- **Mobile layout overflow:** test the actual viewport width and inspect long names, room codes, and fixed-width elements.

## Development guidelines

- Keep game rules, validation, host authorization, and winner selection server-authoritative.
- Preserve Socket.IO event names and payload shapes unless both client and server are updated together.
- Preserve Redis room-locking and state-save semantics when editing game-state code.
- Test round advancement, deadlines, reconnection, rematches, and simultaneous player actions after changes.
- Before committing, review the diff and run syntax checks on changed JavaScript files, followed by a two-player browser smoke test.


## Future Enhancements & Roadmap

Trivia Race is an evolving multiplayer gaming project. Future updates will focus on improving gameplay, user experience, reliability, and social interaction.

### Planned Features

- **Player Profiles & Statistics:** Introduce player profiles with match history, wins, accuracy, and performance statistics.
- **Global Leaderboard:** Display rankings based on wins, scores, and other performance metrics.
- **Multiple Game Modes:** Explore new modes such as timed challenges, team-based trivia, and customizable match settings.
- **Question Categories & Difficulty Levels:** Allow players to choose categories such as science, technology, history, sports, and general knowledge, with adjustable difficulty.
- **Enhanced Multiplayer Experience:** Improve room management, reconnection handling, and synchronization for a smoother multiplayer experience.
- **Power-Ups & Special Abilities:** Explore additional strategic gameplay mechanics while maintaining fair competition.
- **UI/UX Improvements:** Continue refining animations, responsive layouts, accessibility, and visual feedback across desktop and mobile devices.
- **Performance & Reliability:** Optimize Redis-backed state management, round progression, and server-side validation as the game scales.
- **Testing & Quality Assurance:** Expand automated tests for game rules, room management, reconnections, and multiplayer event handling.

### Long-Term Vision

The long-term goal is to make Trivia Race a polished, reliable, and engaging real-time multiplayer trivia game that supports more gameplay options, competitive features, and a growing player community.

*Note: These items represent potential future enhancements. Features will be implemented and documented as development progresses.*


## License

No license is specified in this repository. Add a license that matches the project's ownership and distribution terms before publishing it for reuse.
