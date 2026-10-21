"use strict";

const path = require("path");
const dotenv = require("dotenv");

const envPath = path.resolve(process.cwd(), ".env");

dotenv.config({
  path: envPath,
  override: false,
});

const createApplication = require("./app");

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";

let application = null;
let shutdownPromise = null;
let shuttingDown = false;

function resolvePort(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError(
      `Invalid PORT value "${value}". PORT must be an integer between 1 and 65535.`,
    );
  }

  return port;
}

function resolveHost(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return DEFAULT_HOST;
  }

  return value.trim();
}

function getApplicationPromise() {
  if (
    createApplication &&
    createApplication.appPromise &&
    typeof createApplication.appPromise.then === "function"
  ) {
    return createApplication.appPromise;
  }

  if (typeof createApplication === "function") {
    return createApplication();
  }

  throw new TypeError(
    'The application module must export a factory function or an "appPromise" Promise.',
  );
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    function handleError(error) {
      server.removeListener("listening", handleListening);
      reject(error);
    }

    function handleListening() {
      server.removeListener("error", handleError);
      resolve();
    }

    server.once("error", handleError);
    server.once("listening", handleListening);

    server.listen(port, host);
  });
}

async function closeApplication() {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    if (!application) {
      return;
    }

    console.log("[server] Graceful shutdown started.");

    if (typeof application.close === "function") {
      await application.close();
      console.log("[server] Application resources closed.");
      return;
    }

    const closeTasks = [];

    if (
      application.server &&
      typeof application.server.close === "function" &&
      application.server.listening
    ) {
      closeTasks.push(
        new Promise((resolve, reject) => {
          application.server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }),
      );
    }

    if (application.io && typeof application.io.close === "function") {
      closeTasks.push(
        new Promise((resolve, reject) => {
          try {
            application.io.close((error) => {
              if (error) {
                reject(error);
                return;
              }

              resolve();
            });
          } catch (error) {
            reject(error);
          }
        }),
      );
    }

    for (const client of [application.pubClient, application.subClient]) {
      if (client && typeof client.quit === "function") {
        if (client.isOpen === false) {
          continue;
        }

        closeTasks.push(
          client.quit().catch((error) => {
            console.error(
              "[server] Failed to close a Redis client:",
              error.message,
            );
          }),
        );
      }
    }

    await Promise.all(closeTasks);

    console.log("[server] Application resources closed.");
  })();

  return shutdownPromise;
}

function installShutdownHandlers() {
  async function handleSignal(signal) {
    if (shuttingDown) {
      console.warn(
        `[server] Received ${signal} during shutdown; waiting for cleanup.`,
      );
      return;
    }

    shuttingDown = true;

    console.log(`[server] Received ${signal}.`);

    try {
      await closeApplication();
      process.exitCode = 0;
    } catch (error) {
      console.error("[server] Graceful shutdown failed:", error);
      process.exitCode = 1;
    }
  }

  process.on("SIGINT", () => {
    void handleSignal("SIGINT");
  });

  process.on("SIGTERM", () => {
    void handleSignal("SIGTERM");
  });
}

async function startServer() {
  // Render supplies PORT automatically.
  // Local development falls back to port 3000.
  const port = resolvePort(process.env.PORT);
  const host = resolveHost(process.env.HOST);

  application = await getApplicationPromise();

  if (
    !application ||
    !application.server ||
    typeof application.server.listen !== "function"
  ) {
    throw new TypeError(
      "The application factory did not return a valid native HTTP server.",
    );
  }

  installShutdownHandlers();

  await listen(application.server, port, host);

  console.log(`[server] Trivia Race listening on http://${host}:${port}`);
  console.log(`[server] Environment file: ${envPath}`);

  return application;
}

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error("[server] Startup failed:", error);

    try {
      await closeApplication();
    } catch (shutdownError) {
      console.error(
        "[server] Cleanup after startup failure also failed:",
        shutdownError,
      );
    }

    process.exitCode = 1;
  });
}

module.exports = {
  startServer,
  closeApplication,
};
