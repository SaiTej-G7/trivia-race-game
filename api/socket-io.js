"use strict";

const createApplication = require("../app");

let appPromise = null;

function getApplication() {
  if (!appPromise) {
    appPromise = Promise.resolve()
      .then(() => {
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
          'The application module must export a factory function or an "appPromise" Promise.'
        );
      })
      .then((application) => {
        if (
          !application ||
          !application.server ||
          typeof application.server.emit !== "function"
        ) {
          throw new TypeError(
            "The application factory did not return a valid HTTP server."
          );
        }

        return application;
      })
      .catch((error) => {
        appPromise = null;
        throw error;
      });
  }

  return appPromise;
}

async function socketIoHandler(req, res) {
  try {
    const application = await getApplication();

    application.server.emit("request", req, res);
  } catch (error) {
    console.error("[socket-io] Failed to initialize the application:", error);

    if (res.headersSent || res.writableEnded) {
      return;
    }

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        ok: false,
        error: "Socket.IO server initialization failed."
      })
    );
  }
}

module.exports = socketIoHandler;

Object.defineProperty(module.exports, "appPromise", {
  enumerable: true,
  configurable: false,
  get: getApplication
});