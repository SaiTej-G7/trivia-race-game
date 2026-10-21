"use strict";

const crypto = require("node:crypto");

const {
  MAX_PLAYERS,
  QUESTION_TIME_MS,
  BETWEEN_ROUNDS_MS,
  MATCH_QUESTION_COUNT,
  QUESTION_BANK,
  generateBoardEffects,
  resolveRound,
  toPublicQuestion,
} = require("../services/GameEngine");

const { publicState, emitError } = require("./connectionHandlers");

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

function toRecord(collection) {
  if (Array.isArray(collection)) {
    return Object.fromEntries(
      collection
        .filter((entry) => entry && typeof entry.playerId === "string")
        .map((entry) => [entry.playerId, entry]),
    );
  }

  if (collection instanceof Map) {
    return Object.fromEntries(collection.entries());
  }

  return collection && typeof collection === "object" ? collection : {};
}

function shuffle(items) {
  const result = items.slice();

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function mapQuestion(question) {
  if (!Array.isArray(question) || question.length < 8) {
    throw new TypeError("Question bank contains an invalid question entry.");
  }

  return {
    id: question[0],
    category: question[1],
    text: question[2],
    choices: [question[3], question[4], question[5], question[6]],
    correctIndex: question[7],
  };
}

function getCurrentPlayer(room, socket) {
  if (
    !socket.data ||
    socket.data.roomCode !== room.code ||
    typeof socket.data.playerId !== "string"
  ) {
    return null;
  }

  const players =
    room.players && typeof room.players === "object" ? room.players : {};

  const player = players[socket.data.playerId];

  if (!player || !player.connected || player.socketId !== socket.id) {
    return null;
  }

  return player;
}

function connectedPlayers(room) {
  return toArray(room.players)
    .filter((player) => player && player.connected)
    .sort(
      (a, b) =>
        (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0) ||
        String(a.id).localeCompare(String(b.id)),
    );
}

function emitState(io, roomCode, state) {
  io.to(roomCode).emit("room:state", state);
}

function nextQuestion(room, now = Date.now()) {
  if (room.status !== "playing" || room.winner) {
    return {
      started: false,
      reason: "match_not_active",
    };
  }

  if (
    !Array.isArray(room.questionDeck) ||
    room.deckIndex >= room.questionDeck.length ||
    room.deckIndex >= MATCH_QUESTION_COUNT
  ) {
    return {
      started: false,
      reason: "question_deck_exhausted",
    };
  }

  room.currentQuestion = room.questionDeck[room.deckIndex];
  room.deckIndex += 1;
  room.roundId = (Number(room.roundId) || 0) + 1;
  room.deadline = now + QUESTION_TIME_MS;
  room.roundResolved = false;
  room.roundAnswers = {};
  room.roundCorrect = {};
  room.roundAnimationAcks = {};
  room.roundMovementPending = false;
  room.lastRoundResult = null;
  room.countdownEndsAt = null;

  return {
    started: true,
    roundId: room.roundId,
    deadline: room.deadline,
    question: toPublicQuestion(room.currentQuestion),
  };
}

function chooseDistanceWinnerPlain(room) {
  const players = toArray(room.players).filter(Boolean);

  players.sort(
    (a, b) =>
      (Number(b.position) || 0) - (Number(a.position) || 0) ||
      (Number(b.score) || 0) - (Number(a.score) || 0) ||
      (Number(a.positionReachedAt) || Number.MAX_SAFE_INTEGER) -
        (Number(b.positionReachedAt) || Number.MAX_SAFE_INTEGER) ||
      (Number(a.joinedAt) || Number.MAX_SAFE_INTEGER) -
        (Number(b.joinedAt) || Number.MAX_SAFE_INTEGER) ||
      String(a.id).localeCompare(String(b.id)),
  );

  return players[0] || null;
}

function finishByDistancePlain(room) {
  const winner = chooseDistanceWinnerPlain(room);

  room.status = "finished";
  room.deadline = null;
  room.countdownEndsAt = null;
  room.currentQuestion = null;
  room.roundResolved = true;
  room.roundMovementPending = false;
  room.winner = winner
    ? {
        playerId: winner.id,
        name: winner.name,
        color: winner.color,
        byQuestions: true,
        position: winner.position,
        score: winner.score,
        positionReachedAt: winner.positionReachedAt,
      }
    : null;

  room.lastRoundResult = {
    ...(room.lastRoundResult || {}),
    message: winner
      ? `${winner.name} wins on distance after all ${MATCH_QUESTION_COUNT} questions!`
      : `All ${MATCH_QUESTION_COUNT} questions have been used. No winner could be selected.`,
    byQuestions: true,
  };

  return winner;
}

async function startGame({ io, socket, gameService }) {
  const roomCode = socket.data && socket.data.roomCode;

  if (!roomCode) {
    emitError(socket, "Join a room before starting a game.");
    return;
  }

  const result = await gameService.withRoomLock(roomCode, async (room) => {
    const player = getCurrentPlayer(room, socket);

    if (!player) {
      return {
        save: false,
        value: { error: "Join a room before starting a game." },
      };
    }

    if (player.id !== room.hostPlayerId) {
      return {
        save: false,
        value: { error: "Only the room host can start the race." },
      };
    }

    if (room.status !== "waiting" && room.status !== "finished") {
      return {
        save: false,
        value: { error: "The game is already in progress." },
      };
    }

    const activePlayers = connectedPlayers(room);

    if (activePlayers.length < 2) {
      return {
        save: false,
        value: {
          error: "At least 2 connected players are needed to start.",
        },
      };
    }

    if (QUESTION_BANK.length < MATCH_QUESTION_COUNT) {
      throw new Error(
        `Question bank must contain at least ${MATCH_QUESTION_COUNT} questions.`,
      );
    }

    const questionIds = QUESTION_BANK.map((question) => question[0]);

    if (new Set(questionIds).size !== QUESTION_BANK.length) {
      throw new Error("Question bank contains duplicate question IDs.");
    }

    const questionDeck = shuffle(QUESTION_BANK)
      .slice(0, MATCH_QUESTION_COUNT)
      .map(mapQuestion);

    if (questionDeck.length !== MATCH_QUESTION_COUNT) {
      throw new Error(
        `Expected exactly ${MATCH_QUESTION_COUNT} questions per match.`,
      );
    }

    const now = Date.now();

    room.status = "playing";
    room.winner = null;
    room.currentQuestion = null;
    room.lastRoundResult = null;
    room.roundId = 0;
    room.deckIndex = 0;
    room.lastResolutionTimestamp = 0;
    room.matchStartedAt = now;
    room.questionDeck = questionDeck;
    room.boardEffects = generateBoardEffects();
    room.roundAnswers = {};
    room.roundCorrect = {};
    room.roundAnimationAcks = {};
    room.roundMovementPending = false;
    room.roundResolved = false;

    for (const currentPlayer of toArray(room.players)) {
      currentPlayer.position = 1;
      currentPlayer.score = 0;
      currentPlayer.streak = 0;
      currentPlayer.timeoutStreak = 0;
      currentPlayer.positionReachedAt = now;
    }

    const next = nextQuestion(room, now);

    if (!next.started) {
      throw new Error(`Unable to start first question: ${next.reason}`);
    }

    return {
      save: true,
      value: {
        roomCode: room.code,
        boardEffects: room.boardEffects,
        totalQuestions: room.questionDeck.length,
        roundId: next.roundId,
        deadline: next.deadline,
        state: publicState(room),
      },
    };
  });

  if (!result || result.error) {
    emitError(socket, (result && result.error) || "Unable to start the game.");
    return;
  }

  await gameService.scheduleRoomDeadline(result.roomCode, result.deadline);

  io.to(result.roomCode).emit("match:initialized", {
    roomCode: result.roomCode,
    boardEffects: result.boardEffects,
    totalQuestions: result.totalQuestions,
  });

  emitState(io, result.roomCode, result.state);
}

async function recordAnswerOnce({
  gameService,
  roomCode,
  playerId,
  roundId,
  choiceIndex,
  answeredAt,
}) {
  if (typeof gameService.recordAnswerOnce === "function") {
    return gameService.recordAnswerOnce(roomCode, {
      playerId,
      roundId,
      choiceIndex,
      answeredAt,
    });
  }

  return gameService.withRoomLock(roomCode, async (room) => {
    const player = room.players && room.players[playerId];

    if (
      !player ||
      !player.connected ||
      room.status !== "playing" ||
      room.roundResolved ||
      !room.currentQuestion ||
      Number(room.roundId) !== roundId ||
      !Number.isFinite(Number(room.deadline)) ||
      answeredAt > Number(room.deadline)
    ) {
      return {
        save: false,
        value: {
          accepted: false,
          reason: "question_closed",
        },
      };
    }

    room.roundAnswers = toRecord(room.roundAnswers);

    if (Object.prototype.hasOwnProperty.call(room.roundAnswers, playerId)) {
      return {
        save: false,
        value: {
          accepted: false,
          reason: "already_answered",
        },
      };
    }

    room.roundAnswers[playerId] = {
      choiceIndex,
      answeredAt,
    };

    const correct = choiceIndex === room.currentQuestion.correctIndex;

    room.roundCorrect = toRecord(room.roundCorrect);

    if (correct) {
      room.roundCorrect[playerId] = true;
    }

    return {
      save: true,
      value: {
        accepted: true,
        correct,
        roundId,
        choiceIndex,
        playerId,
        allConnectedAnswered: connectedPlayers(room).every((activePlayer) =>
          Object.prototype.hasOwnProperty.call(
            room.roundAnswers,
            activePlayer.id,
          ),
        ),
      },
    };
  });
}

async function submitAnswer({ io, socket, gameService, payload }) {
  const roomCode = socket.data && socket.data.roomCode;
  const playerId = socket.data && socket.data.playerId;

  if (!roomCode || !playerId) {
    emitError(socket, "Join a room before answering.");
    return;
  }

  const roundId = Number(payload && payload.roundId);
  const choiceIndex = Number(payload && payload.choiceIndex);

  if (!Number.isSafeInteger(roundId) || roundId < 1) {
    emitError(socket, "That question identifier is invalid.");
    return;
  }

  if (
    !Number.isSafeInteger(choiceIndex) ||
    choiceIndex < 0 ||
    choiceIndex > 3
  ) {
    emitError(socket, "Please choose a valid answer.");
    return;
  }

  const now = Date.now();

  const roomSnapshot = await gameService.getRoom(roomCode);

  if (!roomSnapshot) {
    emitError(socket, "Room not found.");
    return;
  }

  const playerSnapshot = roomSnapshot.players && roomSnapshot.players[playerId];

  if (
    !playerSnapshot ||
    !playerSnapshot.connected ||
    playerSnapshot.socketId !== socket.id
  ) {
    emitError(socket, "Your player session is no longer active.");
    return;
  }

  if (
    roomSnapshot.status !== "playing" ||
    roomSnapshot.roundResolved ||
    !roomSnapshot.currentQuestion ||
    Number(roomSnapshot.roundId) !== roundId
  ) {
    emitError(socket, "This question is already closed.");
    return;
  }

  if (now > Number(roomSnapshot.deadline)) {
    emitError(socket, "Time is up for this question.");
    return;
  }

  if (
    !Array.isArray(roomSnapshot.currentQuestion.choices) ||
    choiceIndex >= roomSnapshot.currentQuestion.choices.length
  ) {
    emitError(socket, "Please choose a valid answer.");
    return;
  }

  const recorded = await recordAnswerOnce({
    gameService,
    roomCode,
    playerId,
    roundId,
    choiceIndex,
    answeredAt: now,
  });

  if (!recorded || !recorded.accepted) {
    const reason = recorded && recorded.reason;

    emitError(
      socket,
      reason === "already_answered"
        ? "You have already answered this question."
        : "This question is closed or your answer could not be accepted.",
    );

    return;
  }

  socket.emit("answer:feedback", {
    roundId,
    correct: Boolean(recorded.correct),
    message: recorded.correct
      ? "Correct! Your move will play in submission order."
      : "Not quite — this answer costs 1 point and 1 space.",
    choiceIndex,
  });

  let resolutionResult = null;

  const updateResult = await gameService.withRoomLock(
    roomCode,
    async (room) => {
      if (
        room.status !== "playing" ||
        room.roundResolved ||
        Number(room.roundId) !== roundId
      ) {
        return {
          save: false,
          value: {
            changed: false,
            state: publicState(room),
          },
        };
      }

      const answers = toRecord(room.roundAnswers);
      room.roundAnswers = answers;

      const activePlayers = connectedPlayers(room);

      const allAnswered =
        activePlayers.length > 0 &&
        activePlayers.every((activePlayer) =>
          Object.prototype.hasOwnProperty.call(answers, activePlayer.id),
        );

      if (allAnswered) {
        resolutionResult = resolveRound(room, { now: Date.now() });

        if (resolutionResult.resolved) {
          room.roundMovementPending = room.status === "playing";
          room.roundAnimationAcks = {};
        }
      }

      return {
        save: true,
        value: {
          changed: true,
          state: publicState(room),
          resolution: resolutionResult,
        },
      };
    },
  );

  if (!updateResult) {
    return;
  }

  if (resolutionResult && resolutionResult.resolved) {
    await gameService.removeRoomDeadline(roomCode);

    if (resolutionResult.resolved) {
      const movementPayload = resolutionResult.movement || {
        roomCode,
        roundId: resolutionResult.roundId,
        moves: [],
      };

      io.to(roomCode).emit("round:movement", movementPayload);
      emitState(io, roomCode, updateResult.state);

      return;
    }

    emitState(io, roomCode, updateResult.state);
  }

  async function animationComplete({ io, socket, gameService, payload }) {
    const roomCode = socket.data && socket.data.roomCode;
    const playerId = socket.data && socket.data.playerId;

    if (!roomCode || !playerId) return;

    const roundId = Number(payload && payload.roundId);

    if (!Number.isSafeInteger(roundId) || roundId < 1) return;

    const result = await gameService.withRoomLock(roomCode, async (room) => {
      const player = room.players && room.players[playerId];

      if (
        !player ||
        !player.connected ||
        player.socketId !== socket.id ||
        room.status !== "playing" ||
        !room.roundMovementPending ||
        Number(room.roundId) !== roundId
      ) {
        return {
          save: false,
          value: {
            advanced: false,
            state: publicState(room),
          },
        };
      }

      room.roundAnimationAcks = toRecord(room.roundAnimationAcks);
      room.roundAnimationAcks[playerId] = true;

      const activePlayers = connectedPlayers(room);
      const allAcknowledged = activePlayers.every((activePlayer) =>
        Object.prototype.hasOwnProperty.call(
          room.roundAnimationAcks,
          activePlayer.id,
        ),
      );

      if (!allAcknowledged) {
        return {
          save: true,
          value: {
            advanced: false,
            state: publicState(room),
          },
        };
      }

      room.roundMovementPending = false;

      if (
        room.deckIndex >= MATCH_QUESTION_COUNT ||
        room.deckIndex >= room.questionDeck.length
      ) {
        finishByDistancePlain(room);

        return {
          save: true,
          value: {
            advanced: true,
            finished: true,
            state: publicState(room),
          },
        };
      }

      const next = nextQuestion(room, Date.now());

      if (!next.started) {
        finishByDistancePlain(room);

        return {
          save: true,
          value: {
            advanced: true,
            finished: true,
            state: publicState(room),
          },
        };
      }

      return {
        save: true,
        value: {
          advanced: true,
          finished: false,
          deadline: next.deadline,
          state: publicState(room),
        },
      };
    });

    if (!result) return;

    emitState(io, roomCode, result.state);

    if (result.advanced && !result.finished) {
      await gameService.scheduleRoomDeadline(roomCode, result.deadline);
    } else if (result.finished) {
      await gameService.removeRoomDeadline(roomCode);
    }
  }

  function mountGameHandlers({ io, socket, gameService }) {
    if (!io || !socket || !gameService) {
      throw new TypeError("io, socket, and gameService are required.");
    }

    socket.on("game:start", () => {
      startGame({ io, socket, gameService }).catch((error) => {
        console.error("[gameHandlers] game:start failed:", error);
        emitError(socket, "Unable to start the game right now.");
      });
    });

    socket.on("answer:submit", (payload) => {
      submitAnswer({ io, socket, gameService, payload }).catch((error) => {
        console.error("[gameHandlers] answer:submit failed:", error);
        emitError(socket, "Unable to submit your answer right now.");
      });
    });

    socket.on("round:animation-complete", (payload) => {
      animationComplete({ io, socket, gameService, payload }).catch((error) => {
        console.error("[gameHandlers] round:animation-complete failed:", error);
        emitError(socket, "Unable to complete the round animation.");
      });
    });
  }

  module.exports = {
    mountGameHandlers,
    publicState,
    nextQuestion,
  };
}
