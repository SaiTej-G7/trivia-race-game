"use strict";

const { Redis } = require("@upstash/redis");
const crypto = require("node:crypto");

const DEFAULT_LOCK_LEASE_MS = 10_000;
const DEFAULT_LOCK_WAIT_MS = 5_000;
const DEFAULT_LOCK_RENEW_INTERVAL_MS = 3_000;
const DEFAULT_LOCK_POLL_INTERVAL_MS = 50;

const ROOM_PREFIX = "trivia:room:";
const LOCK_PREFIX = "trivia:lock:";
const DEADLINE_KEY = "trivia:deadlines";
const ROOM_CODES_KEY = "trivia:room-codes";

const LUA_ACQUIRE_LOCK = `
local current = redis.call("GET", KEYS[1])

if current then
  return 0
end

redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2], "NX")
return 1
`;

const LUA_RENEW_LOCK = `
local current = redis.call("GET", KEYS[1])

if current ~= ARGV[1] then
  return 0
end

return redis.call("PEXPIRE", KEYS[1], ARGV[2])
`;

const LUA_RELEASE_LOCK = `
local current = redis.call("GET", KEYS[1])

if current ~= ARGV[1] then
  return 0
end

return redis.call("DEL", KEYS[1])
`;

const LUA_SAVE_ROOM_CAS = `
local lockValue = redis.call("GET", KEYS[1])

if lockValue ~= ARGV[1] then
  return { err = "LOCK_LOST" }
end

local currentRaw = redis.call("GET", KEYS[2])
local expectedVersion = tonumber(ARGV[2])
local nextRaw = ARGV[3]
local nextVersion = tonumber(ARGV[4])

if not currentRaw then
  return { err = "ROOM_NOT_FOUND" }
end

local ok, current = pcall(cjson.decode, currentRaw)

if not ok or type(current) ~= "table" then
  return { err = "CORRUPT_ROOM_RECORD" }
end

local currentVersion = tonumber(current.version) or 0

if currentVersion ~= expectedVersion then
  return { err = "VERSION_CONFLICT" }
end

if nextVersion ~= expectedVersion + 1 then
  return { err = "INVALID_NEXT_VERSION" }
end

redis.call("SET", KEYS[2], nextRaw)

return { "OK", tostring(nextVersion) }
`;

const LUA_CREATE_ROOM = `
local existing = redis.call("GET", KEYS[1])

if existing then
  return 0
end

redis.call("SET", KEYS[1], ARGV[1], "NX")
redis.call("SADD", KEYS[2], ARGV[2])

return 1
`;

const LUA_DELETE_ROOM = `
local lockValue = redis.call("GET", KEYS[1])

if lockValue ~= ARGV[1] then
  return { err = "LOCK_LOST" }
end

local currentRaw = redis.call("GET", KEYS[2])

if not currentRaw then
  redis.call("SREM", KEYS[3], ARGV[2])
  redis.call("ZREM", KEYS[4], ARGV[2])
  return 0
end

local ok, current = pcall(cjson.decode, currentRaw)

if not ok or type(current) ~= "table" then
  return { err = "CORRUPT_ROOM_RECORD" }
end

local currentVersion = tonumber(current.version) or 0
local expectedVersion = tonumber(ARGV[3])

if currentVersion ~= expectedVersion then
  return { err = "VERSION_CONFLICT" }
end

redis.call("DEL", KEYS[2])
redis.call("SREM", KEYS[3], ARGV[2])
redis.call("ZREM", KEYS[4], ARGV[2])

return 1
`;

const LUA_SCHEDULE_DEADLINE = `
local lockValue = redis.call("GET", KEYS[1])

if lockValue ~= ARGV[1] then
  return { err = "LOCK_LOST" }
end

local currentRaw = redis.call("GET", KEYS[2])

if not currentRaw then
  return { err = "ROOM_NOT_FOUND" }
end

local ok, current = pcall(cjson.decode, currentRaw)

if not ok or type(current) ~= "table" then
  return { err = "CORRUPT_ROOM_RECORD" }
end

local currentVersion = tonumber(current.version) or 0
local expectedVersion = tonumber(ARGV[2])

if currentVersion ~= expectedVersion then
  return { err = "VERSION_CONFLICT" }
end

local deadline = tonumber(ARGV[3])

if not deadline or deadline <= 0 then
  redis.call("ZREM", KEYS[3], ARGV[4])
  return 1
end

redis.call("ZADD", KEYS[3], deadline, ARGV[4])

return 1
`;

const LUA_REMOVE_DEADLINE = `
local lockValue = redis.call("GET", KEYS[1])

if lockValue ~= ARGV[1] then
  return { err = "LOCK_LOST" }
end

local currentRaw = redis.call("GET", KEYS[2])

if not currentRaw then
  redis.call("ZREM", KEYS[3], ARGV[2])
  return 1
end

local ok, current = pcall(cjson.decode, currentRaw)

if not ok or type(current) ~= "table" then
  return { err = "CORRUPT_ROOM_RECORD" }
end

local currentVersion = tonumber(current.version) or 0
local expectedVersion = tonumber(ARGV[3])

if currentVersion ~= expectedVersion then
  return { err = "VERSION_CONFLICT" }
end

redis.call("ZREM", KEYS[3], ARGV[2])

return 1
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertRoomCode(roomCode) {
  if (typeof roomCode !== "string" || !/^[A-HJ-NP-Z2-9]{5}$/.test(roomCode)) {
    throw new TypeError("Invalid room code.");
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseRecord(raw) {
  if (raw == null) {
    return null;
  }

  let record;

  try {
    record = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("Stored room record is not valid JSON.");
  }

  if (
    !record ||
    typeof record !== "object" ||
    !Number.isSafeInteger(Number(record.version)) ||
    Number(record.version) < 1 ||
    !record.room ||
    typeof record.room !== "object"
  ) {
    throw new Error("Stored room record has an invalid shape.");
  }

  return {
    version: Number(record.version),
    room: record.room,
  };
}

class RedisGameService {
  constructor(options = {}) {
    const url = options.url || process.env.KV_REST_API_URL;
    const token = options.token || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      throw new Error(
        "RedisGameService requires KV_REST_API_URL and KV_REST_API_TOKEN.",
      );
    }

    this.redis = options.redis || new Redis({ url, token });

    this.lockLeaseMs = options.lockLeaseMs || DEFAULT_LOCK_LEASE_MS;
    this.lockWaitMs = options.lockWaitMs || DEFAULT_LOCK_WAIT_MS;
    this.lockRenewIntervalMs =
      options.lockRenewIntervalMs || DEFAULT_LOCK_RENEW_INTERVAL_MS;
    this.lockPollIntervalMs =
      options.lockPollIntervalMs || DEFAULT_LOCK_POLL_INTERVAL_MS;

    assertPositiveInteger(this.lockLeaseMs, "lockLeaseMs");
    assertPositiveInteger(this.lockWaitMs, "lockWaitMs");
    assertPositiveInteger(this.lockRenewIntervalMs, "lockRenewIntervalMs");
    assertPositiveInteger(this.lockPollIntervalMs, "lockPollIntervalMs");

    if (this.lockRenewIntervalMs >= this.lockLeaseMs) {
      throw new Error("lockRenewIntervalMs must be less than lockLeaseMs.");
    }
  }

  roomKey(roomCode) {
    assertRoomCode(roomCode);
    return `${ROOM_PREFIX}${roomCode}`;
  }

  lockKey(roomCode) {
    assertRoomCode(roomCode);
    return `${LOCK_PREFIX}${roomCode}`;
  }

  async eval(script, keys, args = []) {
    return this.redis.eval(script, keys, args.map(String));
  }

  /**
   * Returns the stored room and its version without exposing the internal
   * record wrapper to game logic.
   */
  async getRoomRecord(roomCode) {
    const raw = await this.redis.get(this.roomKey(roomCode));
    return parseRecord(raw);
  }

  async getRoom(roomCode) {
    const record = await this.getRoomRecord(roomCode);
    return record ? cloneJson(record.room) : null;
  }

  async getRoomVersion(roomCode) {
    const record = await this.getRoomRecord(roomCode);
    return record ? record.version : null;
  }

  /**
   * Create a room only if its code is unused.
   *
   * Room objects must already be JSON-compatible. Convert Map/Set values
   * into arrays or plain objects before calling this method.
   */
  async createRoom(roomCode, room) {
    assertRoomCode(roomCode);

    if (!room || typeof room !== "object" || Array.isArray(room)) {
      throw new TypeError("room must be a plain object.");
    }

    const record = {
      version: 1,
      room: cloneJson(room),
    };

    const result = await this.eval(
      LUA_CREATE_ROOM,
      [this.roomKey(roomCode), ROOM_CODES_KEY],
      [JSON.stringify(record), roomCode],
    );

    return Number(result) === 1;
  }

  /**
   * Acquire a short-lived lock using a random ownership token.
   * The lock is only valid while its lease is held and renewed.
   */
  async acquireRoomLock(roomCode, options = {}) {
    assertRoomCode(roomCode);

    const waitMs = options.waitMs ?? this.lockWaitMs;
    const leaseMs = options.leaseMs ?? this.lockLeaseMs;

    assertPositiveInteger(waitMs, "waitMs");
    assertPositiveInteger(leaseMs, "leaseMs");

    const key = this.lockKey(roomCode);
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + waitMs;

    while (Date.now() < expiresAt) {
      const result = await this.eval(LUA_ACQUIRE_LOCK, [key], [token, leaseMs]);

      if (Number(result) === 1) {
        return {
          roomCode,
          token,
          key,
          leaseMs,
          lost: false,
          released: false,
        };
      }

      await sleep(
        Math.min(this.lockPollIntervalMs, Math.max(1, expiresAt - Date.now())),
      );
    }

    throw new Error(`Timed out acquiring lock for room ${roomCode}.`);
  }

  async renewRoomLock(lock) {
    if (!lock || lock.released || lock.lost) {
      return false;
    }

    const result = await this.eval(
      LUA_RENEW_LOCK,
      [lock.key],
      [lock.token, lock.leaseMs],
    );

    const renewed = Number(result) === 1;

    if (!renewed) {
      lock.lost = true;
    }

    return renewed;
  }

  async releaseRoomLock(lock) {
    if (!lock || lock.released) {
      return false;
    }

    lock.released = true;

    const result = await this.eval(LUA_RELEASE_LOCK, [lock.key], [lock.token]);

    return Number(result) === 1;
  }

  /**
   * Compare-and-set write. The caller must hold this room's lock.
   * This method never silently overwrites a newer room version.
   */
  async saveRoomIfVersion(roomCode, room, expectedVersion, lock) {
    assertRoomCode(roomCode);
    assertPositiveInteger(expectedVersion, "expectedVersion");

    if (!room || typeof room !== "object" || Array.isArray(room)) {
      throw new TypeError("room must be a plain object.");
    }

    if (!lock || lock.roomCode !== roomCode || lock.lost || lock.released) {
      throw new Error("A valid room lock is required to save room state.");
    }

    const nextVersion = expectedVersion + 1;
    const nextRecord = {
      version: nextVersion,
      room: cloneJson(room),
    };

    const result = await this.eval(
      LUA_SAVE_ROOM_CAS,
      [lock.key, this.roomKey(roomCode)],
      [lock.token, expectedVersion, JSON.stringify(nextRecord), nextVersion],
    );

    if (
      !Array.isArray(result) ||
      result[0] !== "OK" ||
      Number(result[1]) !== nextVersion
    ) {
      const message = Array.isArray(result)
        ? result.join(": ")
        : String(result);

      throw new Error(`Room compare-and-set failed: ${message}`);
    }

    return nextVersion;
  }

  /**
   * Serialize a room mutation.
   *
   * callback(room, context) may mutate the supplied room object. If it
   * returns { save: false, value }, no write is committed. Otherwise the
   * room is written using CAS and the callback's return value is returned.
   *
   * Do not perform irreversible external side effects inside the callback:
   * if the lock is lost, the state write is rejected but those side effects
   * cannot be rolled back.
   */
  async withRoomLock(roomCode, callback, options = {}) {
    assertRoomCode(roomCode);

    if (typeof callback !== "function") {
      throw new TypeError("callback must be a function.");
    }

    const lock = await this.acquireRoomLock(roomCode, options);
    let heartbeat;
    let heartbeatInFlight = false;
    let heartbeatError = null;

    try {
      heartbeat = setInterval(async () => {
        if (heartbeatInFlight || lock.lost || lock.released) {
          return;
        }

        heartbeatInFlight = true;

        try {
          const renewed = await this.renewRoomLock(lock);

          if (!renewed) {
            heartbeatError = new Error(`Lost lock lease for room ${roomCode}.`);
          }
        } catch (error) {
          lock.lost = true;
          heartbeatError = error;
        } finally {
          heartbeatInFlight = false;
        }
      }, this.lockRenewIntervalMs);

      if (typeof heartbeat.unref === "function") {
        heartbeat.unref();
      }

      const record = await this.getRoomRecord(roomCode);

      if (!record) {
        throw new Error(`Room ${roomCode} was not found.`);
      }

      const room = cloneJson(record.room);
      const result = await callback(room, {
        roomCode,
        version: record.version,
        lock,
        service: this,
      });

      if (heartbeatError) {
        throw new Error(
          `Room lock heartbeat failed: ${heartbeatError.message}`,
        );
      }

      if (lock.lost) {
        throw new Error(`Room lock was lost for ${roomCode}.`);
      }

      if (result && typeof result === "object" && result.save === false) {
        return result.value;
      }

      await this.saveRoomIfVersion(roomCode, room, record.version, lock);
      // Return the callback's actual value, not its { save, value } wrapper.
      if (
        result &&
        typeof result === "object" &&
        Object.prototype.hasOwnProperty.call(result, "value")
      ) {
        return result.value;
      }

      return result;
    } finally {
      if (heartbeat) {
        clearInterval(heartbeat);
      }

      // Best effort: Lua release checks the token, so an expired lock
      // reacquired by another worker will not be deleted by this worker.
      try {
        await this.releaseRoomLock(lock);
      } catch (error) {
        console.error(
          `[RedisGameService] Could not release lock for ${roomCode}:`,
          error,
        );
      }
    }
  }

  /**
   * Delete a room while holding its lock and checking the stored version.
   * The lock is retained until the deletion script has completed.
   */
  async deleteRoom(roomCode) {
    assertRoomCode(roomCode);

    const lock = await this.acquireRoomLock(roomCode);

    try {
      const record = await this.getRoomRecord(roomCode);

      if (!record) {
        return false;
      }

      const result = await this.eval(
        LUA_DELETE_ROOM,
        [lock.key, this.roomKey(roomCode), ROOM_CODES_KEY, DEADLINE_KEY],
        [lock.token, roomCode, record.version],
      );

      if (Number(result) !== 1) {
        throw new Error(`Room deletion failed for ${roomCode}.`);
      }

      return true;
    } finally {
      try {
        await this.releaseRoomLock(lock);
      } catch (error) {
        console.error(
          `[RedisGameService] Could not release delete lock for ${roomCode}:`,
          error,
        );
      }
    }
  }

  /**
   * Schedule a deadline while holding the same lock as room state.
   * deadlineMs is an absolute Unix timestamp in milliseconds.
   */
  async scheduleRoomDeadline(roomCode, deadlineMs) {
    assertRoomCode(roomCode);

    const deadline = Number(deadlineMs);

    if (!Number.isFinite(deadline) || deadline <= 0) {
      throw new TypeError("deadlineMs must be a positive timestamp.");
    }

    await this.redis.zadd(DEADLINE_KEY, {
      score: deadline,
      member: roomCode,
    });

    return { roomCode, deadline };
  }

  /**
   * Remove a room's deadline index entry.
   */
  async removeRoomDeadline(roomCode) {
    assertRoomCode(roomCode);
    return Number(await this.redis.zrem(DEADLINE_KEY, roomCode));
  }

  /**
   * Return room codes whose indexed deadline is <= now, oldest first.
   */

  async getExpiredRoomCodes(now = Date.now(), limit = 100) {
    const timestamp = Number(now);

    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new TypeError("now must be a valid Unix timestamp.");
    }

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new TypeError("limit must be an integer between 1 and 1000.");
    }

    const members = await this.redis.zrangebyscore(DEADLINE_KEY, 0, timestamp, {
      offset: 0,
      count: limit,
    });

    return Array.isArray(members) ? members.map(String) : [];
  }

  /**
   * Read the room-code set. Useful for operational checks and reconciliation.
   */
  async listRoomCodes() {
    const codes = await this.redis.smembers(ROOM_CODES_KEY);
    return Array.isArray(codes) ? codes.map(String) : [];
  }

  /**
   * Reconcile the deadline index for a room under the room lock.
   * A null deadline removes the sorted-set entry.
   */
  async reconcileRoomDeadline(roomCode) {
    assertRoomCode(roomCode);

    return this.withRoomLock(roomCode, async (room) => {
      const deadline = Number(room.deadline);

      if (
        room.status === "playing" &&
        Number.isFinite(deadline) &&
        deadline > 0
      ) {
        await this.redis.zadd(DEADLINE_KEY, {
          score: deadline,
          member: roomCode,
        });

        return {
          save: false,
          value: { scheduled: true, deadline },
        };
      }

      await this.redis.zrem(DEADLINE_KEY, roomCode);

      return {
        save: false,
        value: { scheduled: false, deadline: null },
      };
    });
  }
}

module.exports = {
  RedisGameService,
  constants: {
    DEFAULT_LOCK_LEASE_MS,
    DEFAULT_LOCK_WAIT_MS,
    DEFAULT_LOCK_RENEW_INTERVAL_MS,
    DEFAULT_LOCK_POLL_INTERVAL_MS,
    ROOM_PREFIX,
    LOCK_PREFIX,
    DEADLINE_KEY,
    ROOM_CODES_KEY,
  },
  scripts: {
    LUA_ACQUIRE_LOCK,
    LUA_RENEW_LOCK,
    LUA_RELEASE_LOCK,
    LUA_SAVE_ROOM_CAS,
    LUA_CREATE_ROOM,
    LUA_DELETE_ROOM,
    LUA_SCHEDULE_DEADLINE,
    LUA_REMOVE_DEADLINE,
  },
};
