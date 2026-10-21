"use strict";

const { resolveRound, MAX_PLAYERS } = require("./GameEngine");

function collectionToArray(collection) {
  if (Array.isArray(collection)) return collection;

  if (collection instanceof Map) {
    return Array.from(collection.values());
  }

  if (collection && typeof collection === "object") {
    return Object.values(collection);
  }

  return [];
}

function hasPlayerEntry(collection, playerId) {
  if (collection instanceof Map) {
    return collection.has(playerId);
  }

  if (Array.isArray(collection)) {
    return collection.some(
      (entry) =>
        entry && (entry.playerId === playerId || entry.id === playerId),
    );
  }

  return Boolean(
    collection &&
    typeof collection === "object" &&
    Object.prototype.hasOwnProperty.call(collection, playerId),
  );
}

function publicState(room) {
  const players = collectionToArray(room.players);
  const roundAnswers = room.roundAnswers || {};
  const roundCorrect = room.roundCorrect || {};

  return {
    roomCode: room.code,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    maxPlayers: MAX_PLAYERS,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      position: player.position,
      connected: player.connected,
      isHost: player.id === room.hostPlayerId,
      answered: hasPlayerEntry(roundAnswers, player.id),
      answeredCorrect: hasPlayerEntry(roundCorrect, player.id),
      score: player.score,
      streak: player.streak || 0,
      timeoutStreak: player.timeoutStreak || 0,
    })),
    question: room.currentQuestion
      ? {
          id: room.currentQuestion.id,
          category: room.currentQuestion.category,
          text: room.currentQuestion.text,
          choices: room.currentQuestion.choices,
        }
      : null,
    roundId: room.roundId,
    deadline: room.deadline,
    countdownEndsAt: room.countdownEndsAt,
    roundResolved: room.roundResolved,
    lastRoundResult: room.lastRoundResult,
    winner: room.winner,
    boardEffects: room.boardEffects,
    roundNumber: room.deckIndex,
    totalQuestions: Array.isArray(room.questionDeck)
      ? room.questionDeck.length
      : 0,
    questionsRemaining: Array.isArray(room.questionDeck)
      ? Math.max(0, room.questionDeck.length - (Number(room.deckIndex) || 0))
      : 0,
  };
}

async function resolveIfExpired({ roomCode, gameService, io }) {
  if (!roomCode || !gameService || !io) {
    throw new TypeError("roomCode, gameService, and io are required.");
  }

  const result = await gameService.withRoomLock(roomCode, async (room) => {
    const now = Date.now();
    const deadline = Number(room.deadline);

    if (room.status !== "playing" || room.roundResolved || room.winner) {
      return {
        save: false,
        value: {
          resolved: false,
          reason: "round_not_active",
          deadlineAction: "remove",
        },
      };
    }

    if (!Number.isFinite(deadline) || deadline <= 0) {
      return {
        save: false,
        value: {
          resolved: false,
          reason: "invalid_deadline",
          deadlineAction: "remove",
        },
      };
    }

    if (deadline > now) {
      return {
        save: false,
        value: {
          resolved: false,
          reason: "deadline_not_expired",
          deadlineAction: "reschedule",
          deadline,
        },
      };
    }

    const resolution = resolveRound(room, { now });

    if (!resolution.resolved) {
      return {
        save: false,
        value: {
          ...resolution,
          deadlineAction:
            resolution.reason === "deadline_not_expired"
              ? "reschedule"
              : "remove",
          deadline: room.deadline,
        },
      };
    }

    room.roundMovementPending = room.status === "playing";
    room.roundAnimationAcks = {};

    return {
      ...resolution,
      state: publicState(room),
    };
  });

  if (!result || typeof result !== "object") {
    return {
      resolved: false,
      reason: "empty_worker_result",
    };
  }

  if (result.deadlineAction === "reschedule") {
    await gameService.scheduleRoomDeadline(roomCode, result.deadline);

    return {
      resolved: false,
      reason: result.reason,
      deadline: result.deadline,
    };
  }

  if (!result.resolved) {
    if (result.deadlineAction === "remove") {
      await gameService.removeRoomDeadline(roomCode);
    }

    return {
      resolved: false,
      reason: result.reason || "not_resolved",
    };
  }

  await gameService.removeRoomDeadline(roomCode);

  const movementPayload = result.movement || {
    roomCode,
    roundId: result.roundId,
    moves: [],
  };

  io.to(roomCode).emit("round:movement", movementPayload);
  io.to(roomCode).emit("room:state", result.state);

  return {
    resolved: true,
    reason: result.reason,
    roundId: result.roundId,
  };
}

async function checkExpiredRooms({ limit = 100, gameService, io } = {}) {
  if (!gameService || !io) {
    throw new TypeError("gameService and io are required.");
  }

  const roomCodes = await gameService.getExpiredRoomCodes(Date.now(), limit);

  const summary = {
    checked: roomCodes.length,
    resolved: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  const outcomes = await Promise.all(
    roomCodes.map(async (roomCode) => {
      try {
        const result = await resolveIfExpired({
          roomCode,
          gameService,
          io,
        });

        return {
          roomCode,
          ...result,
        };
      } catch (error) {
        console.error(
          `[DeadlineWorker] Failed to process room ${roomCode}:`,
          error,
        );

        return {
          roomCode,
          resolved: false,
          reason: "worker_error",
          error: error.message,
        };
      }
    }),
  );

  for (const outcome of outcomes) {
    summary.results.push(outcome);

    if (outcome.resolved) {
      summary.resolved++;
    } else if (outcome.reason === "worker_error") {
      summary.failed++;
    } else {
      summary.skipped++;
    }
  }

  return summary;
}

module.exports = {
  resolveIfExpired,
  checkExpiredRooms,
};
