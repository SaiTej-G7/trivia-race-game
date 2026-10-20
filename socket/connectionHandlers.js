"use strict";

const crypto = require("node:crypto");
const { MAX_PLAYERS } = require("../services/GameEngine");

const PLAYER_COLORS = [
  "#F97316",
  "#06B6D4",
  "#A78BFA",
  "#F43F5E",
  "#22C55E",
  "#EAB308",
];

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeId() {
  return crypto.randomUUID();
}

function makeRoomCode() {
  let code = "";

  for (let index = 0; index < 5; index += 1) {
    code += ROOM_CODE_ALPHABET[
      crypto.randomInt(0, ROOM_CODE_ALPHABET.length)
    ];
  }

  return code;
}

function cleanName(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function cleanCode(value) {
  if (typeof value !== "string") return "";

  return value.trim().toUpperCase();
}

function toArray(collection) {
  if (Array.isArray(collection)) return collection;

  if (collection instanceof Map) {
    return Array.from(collection.values());
  }

  if (collection && typeof collection === "object") {
    return Object.values(collection);
  }

  return [];
}

function toPlayerRecord(collection) {
  if (Array.isArray(collection)) {
    return Object.fromEntries(
      collection
        .filter((player) => player && typeof player.id === "string")
        .map((player) => [player.id, player])
    );
  }

  if (collection instanceof Map) {
    return Object.fromEntries(collection.entries());
  }

  return collection && typeof collection === "object" ? collection : {};
}

function toAnswerRecord(collection) {
  if (Array.isArray(collection)) {
    return Object.fromEntries(
      collection
        .filter((entry) => entry && typeof entry.playerId === "string")
        .map((entry) => [entry.playerId, entry])
    );
  }

  if (collection instanceof Map) {
    return Object.fromEntries(collection.entries());
  }

  return collection && typeof collection === "object" ? collection : {};
}

function publicState(room) {
  const players = toArray(room.players);
  const answers = toAnswerRecord(room.roundAnswers);
  const correct = toAnswerRecord(room.roundCorrect);

  const question = room.currentQuestion
    ? {
        id: room.currentQuestion.id,
        category: room.currentQuestion.category,
        text: room.currentQuestion.text,
        choices: room.currentQuestion.choices,
      }
    : null;

  return {
    roomCode: room.code,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    maxPlayers: MAX_PLAYERS,
    players: players
      .filter((player) => player && typeof player.id === "string")
      .sort(
        (a, b) =>
          (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0) ||
          a.id.localeCompare(b.id)
      )
      .map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        position: Number(player.position) || 1,
        connected: Boolean(player.connected),
        isHost: player.id === room.hostPlayerId,
        answered: Object.prototype.hasOwnProperty.call(answers, player.id),
        answeredCorrect: Object.prototype.hasOwnProperty.call(correct, player.id),
        score: Number(player.score) || 0,
        streak: Number(player.streak) || 0,
        timeoutStreak: Number(player.timeoutStreak) || 0,
      })),
    question,
    roundId: Number(room.roundId) || 0,
    deadline: room.deadline ?? null,
    countdownEndsAt: room.countdownEndsAt ?? null,
    roundResolved: Boolean(room.roundResolved),
    lastRoundResult: room.lastRoundResult ?? null,
    winner: room.winner ?? null,
    boardEffects: room.boardEffects || {},
    roundNumber: Number(room.deckIndex) || 0,
    totalQuestions: Array.isArray(room.questionDeck)
      ? room.questionDeck.length
      : 0,
    questionsRemaining: Array.isArray(room.questionDeck)
      ? Math.max(
          0,
          room.questionDeck.length - (Number(room.deckIndex) || 0)
        )
      : 0,
  };
}

function emitError(socket, message) {
  socket.emit("game:error", { message });
}

function findPlayerByToken(room, playerToken) {
  if (typeof playerToken !== "string" || !playerToken) return null;

  const players = toArray(room.players);

  return (
    players.find(
      (player) =>
        player &&
        typeof player.token === "string" &&
        player.token === playerToken
    ) || null
  );
}

function findSocketPlayer(room, socket) {
  if (
    !socket.data ||
    socket.data.roomCode !== room.code ||
    typeof socket.data.playerId !== "string"
  ) {
    return null;
  }

  const players = toPlayerRecord(room.players);
  const player = players[socket.data.playerId];

  if (!player || player.socketId !== socket.id || !player.connected) {
    return null;
  }

  return player;
}

function makePlayer({ name, colorIndex, socket, now = Date.now() }) {
  return {
    id: makeId(),
    token: makeId(),
    name: cleanName(name) || "Player",
    color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
    position: 1,
    score: 0,
    streak: 0,
    timeoutStreak: 0,
    joinedAt: now,
    positionReachedAt: now,
    connected: true,
    socketId: socket.id,
  };
}

function makeRoom(hostPlayer, now = Date.now()) {
  return {
    code: "",
    status: "waiting",
    hostPlayerId: hostPlayer.id,
    players: { [hostPlayer.id]: hostPlayer },
    playerTokens: { [hostPlayer.token]: hostPlayer.id },
    questionDeck: [],
    deckIndex: 0,
    currentQuestion: null,
    roundId: 0,
    deadline: null,
    countdownEndsAt: null,
    roundResolved: false,
    roundAnswers: {},
    roundCorrect: {},
    roundAnimationAcks: {},
    roundMovementPending: false,
    lastRoundResult: null,
    winner: null,
    boardEffects: {},
    createdAt: now,
    lastResolutionTimestamp: 0,
    matchStartedAt: null,
  };
}

async function createRoom({ socket, io, gameService, payload }) {
  const name = cleanName(payload && payload.name);

  if (!name) {
    emitError(socket, "Please enter a valid name before creating a room.");
    return;
  }

  let room;
  let hostPlayer;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const roomCode = makeRoomCode();
    const now = Date.now();

    hostPlayer = makePlayer({
      name,
      colorIndex: 0,
      socket,
      now,
    });

    room = makeRoom(hostPlayer, now);
    room.code = roomCode;

    try {
      await gameService.createRoom(roomCode, room);
      break;
    } catch (error) {
      if (
        attempt < 9 &&
        /already exists|room exists|duplicate|conflict/i.test(
          String(error && error.message)
        )
      ) {
        room = null;
        continue;
      }

      throw error;
    }
  }

  if (!room || !hostPlayer) {
    throw new Error("Unable to allocate a unique room code.");
  }

  socket.data.roomCode = room.code;
  socket.data.playerId = hostPlayer.id;
  await socket.join(room.code);

  const state = publicState(room);

  socket.emit("room:joined", {
    roomCode: room.code,
    playerId: hostPlayer.id,
    playerToken: hostPlayer.token,
    state,
  });

  io.to(room.code).emit("room:state", state);
}

async function joinRoom({ socket, io, gameService, payload }) {
  const roomCode = cleanCode(payload && payload.roomCode);
  const name = cleanName(payload && payload.name);
  const playerToken =
    typeof (payload && payload.playerToken) === "string"
      ? payload.playerToken
      : "";

  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(roomCode)) {
    emitError(socket, "Enter a valid five-character room code.");
    return;
  }

  const result = await gameService.withRoomLock(roomCode, async (room) => {
    const players = toPlayerRecord(room.players);
    room.players = players;
    room.playerTokens = room.playerTokens || {};

    let player = findPlayerByToken(room, playerToken);

    if (player) {
      const previousSocketId = player.socketId || null;
        
      player.name = name || player.name;
      player.connected = true;
      player.socketId = socket.id;

      return {
        save: true,
        value: {
          roomCode: room.code,
          playerId: player.id,
          playerToken: player.token,
          state: publicState(room),
          reconnected: true,
          previousSocketId:
            previousSocketId !== socket.id ? previousSocketId : null,
        },
      };
    }

    if (room.status !== "waiting") {
      return {
        save: false,
        value: {
          error:
            "This game has already started. Reconnect with your original player token.",
        },
      };
    }

    const existingPlayers = toArray(room.players);

    if (existingPlayers.length >= MAX_PLAYERS) {
      return {
        save: false,
        value: {
          error: `This room is full (maximum ${MAX_PLAYERS} players).`,
        },
      };
    }

    if (!name) {
      return {
        save: false,
        value: {
          error: "Please enter a valid name before joining a room.",
        },
      };
    }

    player = makePlayer({
      name,
      colorIndex: existingPlayers.length,
      socket,
    });

    room.players[player.id] = player;
    room.playerTokens[player.token] = player.id;

    return {
      save: true,
      value: {
        roomCode: room.code,
        playerId: player.id,
        playerToken: player.token,
        state: publicState(room),
        reconnected: false,
        previousSocketId: null,
      },
    };
  });

  if (!result || result.error) {
    emitError(
      socket,
      (result && result.error) || "Unable to join this room."
    );
    return;
  }

  socket.data.roomCode = result.roomCode;
  socket.data.playerId = result.playerId;
  await socket.join(result.roomCode);

  if (
    result.previousSocketId &&
    result.previousSocketId !== socket.id
  ) {
    const previousSocket = io.sockets.sockets.get(result.previousSocketId);

    if (previousSocket) {
      previousSocket.data.roomCode = null;
      previousSocket.data.playerId = null;
      previousSocket.disconnect(true);
    }
  }

  socket.emit("room:joined", {
    roomCode: result.roomCode,
    playerId: result.playerId,
    playerToken: result.playerToken,
    state: result.state,
  });

  io.to(result.roomCode).emit("room:state", result.state);
}

async function markPlayerDisconnected({
  socket,
  io,
  gameService,
  explicitLeave,
}) {
  const roomCode = socket.data && socket.data.roomCode;
  const playerId = socket.data && socket.data.playerId;

  if (!roomCode || !playerId) {
    socket.data.roomCode = null;
    socket.data.playerId = null;
    return;
  }

  try {
    const result = await gameService.withRoomLock(roomCode, async (room) => {
      const players = toPlayerRecord(room.players);
      room.players = players;

      const player = players[playerId];

      if (!player || player.socketId !== socket.id) {
        return {
          save: false,
          value: {
            changed: false,
            roomCode: room.code,
            state: publicState(room),
          },
        };
      }

      player.connected = false;
      player.socketId = null;

      return {
        save: true,
        value: {
          changed: true,
          roomCode: room.code,
          state: publicState(room),
        },
      };
    });

    if (result && result.changed) {
      io.to(roomCode).emit("room:state", result.state);
    }

    if (explicitLeave) {
      await socket.leave(roomCode);
    }
  } catch (error) {
    console.error(
      `[connectionHandlers] Failed to mark player disconnected in ${roomCode}:`,
      error
    );
  } finally {
    socket.data.roomCode = null;
    socket.data.playerId = null;
  }
}

function mountConnectionHandlers({ io, socket, gameService }) {
  if (!io || !socket || !gameService) {
    throw new TypeError("io, socket, and gameService are required.");
  }

  socket.on("room:create", (payload) => {
    createRoom({ socket, io, gameService, payload }).catch((error) => {
      console.error("[connectionHandlers] room:create failed:", error);
      emitError(socket, "Unable to create a room right now.");
    });
  });

  socket.on("create_room", (payload) => {
    createRoom({ socket, io, gameService, payload }).catch((error) => {
      console.error("[connectionHandlers] create_room failed:", error);
      emitError(socket, "Unable to create a room right now.");
    });
  });

  socket.on("room:join", (payload) => {
    joinRoom({ socket, io, gameService, payload }).catch((error) => {
      console.error("[connectionHandlers] room:join failed:", error);
      emitError(socket, "Unable to join this room right now.");
    });
  });

  socket.on("join_room", (payload) => {
    joinRoom({ socket, io, gameService, payload }).catch((error) => {
      console.error("[connectionHandlers] join_room failed:", error);
      emitError(socket, "Unable to join this room right now.");
    });
  });

  socket.on("game:leave", () => {
    markPlayerDisconnected({
      socket,
      io,
      gameService,
      explicitLeave: true,
    });
  });

  socket.on("player_leave", () => {
    markPlayerDisconnected({
      socket,
      io,
      gameService,
      explicitLeave: true,
    });
  });

  socket.on("disconnect", () => {
    markPlayerDisconnected({
      socket,
      io,
      gameService,
      explicitLeave: false,
    });
  });
}

module.exports = {
  mountConnectionHandlers,
  publicState,
  emitError,
};