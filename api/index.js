
"use strict";

const { app, initializeRedis } = require("../server");

let initializationPromise;

async function handler(req, res) {
  try {
    if (!initializationPromise) {
      initializationPromise = initializeRedis();
    }

    await initializationPromise;
    return app(req, res);
  } catch (error) {
    console.error("Trivia Race initialization failed:", error.message);

    if (!res.headersSent) {
      return res.status(503).json({
        ok: false,
        error: "Game service temporarily unavailable",
      });
    }
  }
}

module.exports = handler;
