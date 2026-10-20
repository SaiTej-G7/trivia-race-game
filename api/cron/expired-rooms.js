"use strict";

const crypto = require("crypto");
const RedisGameServiceModule = require("../../services/RedisGameService");
const { checkExpiredRooms } = require("../../services/DeadlineWorker");
const appModule = require("../../app");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function verifyCronAuthorization(req) {
  const configuredSecret = process.env.CRON_SECRET;

  if (
    typeof configuredSecret !== "string" ||
    configuredSecret.length === 0
  ) {
    return {
      authorized: false,
      configurationError: true
    };
  }

  const authorizationHeader = req.headers.authorization;

  if (typeof authorizationHeader !== "string") {
    return {
      authorized: false,
      configurationError: false
    };
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorizationHeader);

  if (!match) {
    return {
      authorized: false,
      configurationError: false
    };
  }

  const suppliedSecret = match[1];

  const expectedDigest = crypto
    .createHash("sha256")
    .update(configuredSecret, "utf8")
    .digest();

  const suppliedDigest = crypto
    .createHash("sha256")
    .update(suppliedSecret, "utf8")
    .digest();

  const authorized = crypto.timingSafeEqual(
    expectedDigest,
    suppliedDigest
  );

  return {
    authorized,
    configurationError: false
  };
}

function createRedisGameService() {
  if (typeof RedisGameServiceModule === "function") {
    return new RedisGameServiceModule();
  }

  if (
    RedisGameServiceModule &&
    typeof RedisGameServiceModule.RedisGameService === "function"
  ) {
    return new RedisGameServiceModule.RedisGameService();
  }

  throw new TypeError(
    "RedisGameService must export a constructor function."
  );
}

function getApplicationPromise() {
  if (
    !appModule ||
    !appModule.appPromise ||
    typeof appModule.appPromise.then !== "function"
  ) {
    throw new TypeError(
      'The application module must expose a Promise as its "appPromise" property.'
    );
  }

  return appModule.appPromise;
}

module.exports = async function expiredRoomsCronHandler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");

    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed.",
      allowedMethods: ["GET", "POST"]
    });
  }

  const authorization = verifyCronAuthorization(req);

  if (authorization.configurationError) {
    console.error(
      "[expired-rooms-cron] CRON_SECRET is not configured."
    );

    return sendJson(res, 500, {
      ok: false,
      error: "Cron authorization is not configured."
    });
  }

  if (!authorization.authorized) {
    return sendJson(res, 401, {
      ok: false,
      error: "Unauthorized."
    });
  }

  const startedAt = Date.now();

  try {
    if (typeof checkExpiredRooms !== "function") {
      throw new TypeError(
        'DeadlineWorker must export a "checkExpiredRooms" function.'
      );
    }

    const application = await getApplicationPromise();

    if (!application || !application.io) {
      throw new Error(
        "The application factory did not provide a Socket.IO instance."
      );
    }

    const gameService = createRedisGameService();

    const workerResult = await checkExpiredRooms({
      limit: 100,
      gameService,
      io: application.io
    });

    const finishedAt = Date.now();

    return sendJson(res, 200, {
      ok: true,
      task: "expired-rooms",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      limit: 100,
      result: workerResult === undefined ? null : workerResult
    });
  } catch (error) {
    const finishedAt = Date.now();

    console.error("[expired-rooms-cron] Execution failed:", error);

    return sendJson(res, 500, {
      ok: false,
      task: "expired-rooms",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      error: "Expired-room processing failed.",
      details:
        process.env.NODE_ENV === "production"
          ? undefined
          : error.message
    });
  }
};