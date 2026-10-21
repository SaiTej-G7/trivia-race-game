"use strict";

const path = require("node:path");
const http = require("node:http");
const express = require("express");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const { RedisGameService } = require("./services/RedisGameService");
const { mountConnectionHandlers } = require("./socket/connectionHandlers");
const { mountGameHandlers } = require("./socket/gameHandlers");
const {
  resolveIfExpired,
  checkExpiredRooms,
} = require("./services/DeadlineWorker");

let applicationPromise = null;

function parseAllowedOrigins() {
  const configuredOrigins = process.env.CLIENT_ORIGIN;

  if (!configuredOrigins) {
    return true;
  }

  const origins = configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : true;
}

function attachRedisErrorLogging(client, label) {
  client.on("error", (error) => {
    console.error(`[redis:${label}]`, error.message);
  });
}

async function closeRedisClient(client) {
  if (!client || !client.isOpen) {
    return;
  }

  try {
    await client.quit();
  } catch (error) {
    console.error("[app] Failed to close Redis client:", error.message);

    if (client.isOpen) {
      client.disconnect();
    }
  }
}

async function closeSocketIO(io) {
  if (!io || typeof io.close !== "function") {
    return;
  }

  await new Promise((resolve, reject) => {
    try {
      io.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function closeHttpServer(server) {
  if (!server || typeof server.close !== "function" || !server.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function buildApplication() {
  if (!process.env.REDIS_URL) {
    throw new Error(
      "Missing REDIS_URL. Configure a Redis connection URL supported by node-redis.",
    );
  }

  const app = express();

  app.disable("x-powered-by");

  app.use(
    express.json({
      limit: "32kb",
    }),
  );

  app.use(
    express.static(path.join(__dirname, "public"), {
      extensions: ["html"],
      index: "index.html",
      fallthrough: true,
    }),
  );

  app.get("/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");

    res.status(200).json({
      ok: true,
      service: "trivia-race",
    });
  });

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: parseAllowedOrigins(),
      methods: ["GET", "POST"],
    },
  });

  const pubClient = createClient({
    url: process.env.REDIS_URL,
  });

  const subClient = pubClient.duplicate();

  attachRedisErrorLogging(pubClient, "publisher");
  attachRedisErrorLogging(subClient, "subscriber");

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));
  } catch (error) {
    await Promise.allSettled([
      closeSocketIO(io),
      closeRedisClient(pubClient),
      closeRedisClient(subClient),
    ]);

    throw new Error(
      `Unable to initialize the Redis-backed Socket.IO adapter: ${error.message}`,
      { cause: error },
    );
  }

  let gameService;
  let deadlinePoll = null;
  let deadlinePollRunning = false;

  try {
    gameService = new RedisGameService();

    deadlinePoll = setInterval(async () => {
      if (deadlinePollRunning) return;

      deadlinePollRunning = true;

      try {
        const summary = await checkExpiredRooms({
          limit: 100,
          gameService,
          io,
        });

        if (summary.failed > 0) {
          console.error("[deadline-worker] Some rooms failed:", summary);
        }
      } catch (error) {
        console.error("[deadline-worker] Poll failed:", error);
      } finally {
        deadlinePollRunning = false;
      }
    }, 1000);

    deadlinePoll.unref?.();
  } catch (error) {
    if (deadlinePoll) {
      clearInterval(deadlinePoll);
    }

    await Promise.allSettled([
      closeSocketIO(io),
      closeRedisClient(pubClient),
      closeRedisClient(subClient),
    ]);

    throw error;
  }

  io.on("connection", (socket) => {
    console.info("[socket] Client connected:", socket.id);

    socket.use(async ([eventName, payload], next) => {
      try {
        const payloadRoomCode =
          payload && typeof payload.roomCode === "string"
            ? payload.roomCode.trim().toUpperCase()
            : null;

        const roomCode = socket.data.roomCode || payloadRoomCode;

        if (roomCode) {
          await resolveIfExpired({
            roomCode,
            gameService,
            io,
          });
        }

        next();
      } catch (error) {
        console.error(
          `[socket:expiry-middleware] Event "${String(eventName)}" failed its expiration check:`,
          error,
        );

        next(
          new Error("Unable to verify the current game state. Please retry."),
        );
      }
    });

    mountConnectionHandlers({
      io,
      socket,
      gameService,
    });

    mountGameHandlers({
      io,
      socket,
      gameService,
    });

    socket.on("error", (error) => {
      console.error(`[socket] Socket error for ${socket.id}:`, error.message);
    });
  });

  io.on("connection_error", (error) => {
    console.error("[socket] Connection error:", error.message);
  });

  io.engine.on("connection_error", (error) => {
    console.error("[socket:engine] Connection error:", {
      code: error.code,
      message: error.message,
      context: error.context,
    });
  });

  let closePromise = null;

  async function close() {
    if (closePromise) {
      return closePromise;
    }

    closePromise = (async () => {
      if (deadlinePoll) {
        clearInterval(deadlinePoll);
        deadlinePoll = null;
      }

      const results = await Promise.allSettled([
        closeSocketIO(io),
        closeHttpServer(server),
        closeRedisClient(pubClient),
        closeRedisClient(subClient),
      ]);

      const errors = results
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason);

      if (errors.length > 0) {
        throw new AggregateError(
          errors,
          "One or more application resources failed to close.",
        );
      }
    })();

    return closePromise;
  }

  return {
    app,
    server,
    io,
    gameService,
    pubClient,
    subClient,
    redisClient: pubClient,
    close,
  };
}

function createApplication() {
  if (!applicationPromise) {
    applicationPromise = buildApplication().catch((error) => {
      applicationPromise = null;
      throw error;
    });
  }

  return applicationPromise;
}

module.exports = createApplication;

Object.defineProperty(module.exports, "createApplication", {
  enumerable: true,
  configurable: false,
  value: createApplication,
});

Object.defineProperty(module.exports, "appPromise", {
  enumerable: true,
  configurable: false,
  get: () => createApplication(),
});
