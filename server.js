"use strict";

const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = 6;
const QUESTION_TIME_MS = 15_000;
const BETWEEN_ROUNDS_MS = 5_000;
const COUNTDOWN_MS = 3_000;
const MATCH_QUESTION_COUNT = 30;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN.split(",").map((s) => s.trim())
      : true,
  },
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

app.disable("x-powered-by");
app.use(
  express.static(path.join(__dirname, "public"), { extensions: ["html"] }),
);
app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "trivia-race" }),
);
app.get("*", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html")),
);

// The answer key stays server-side. Each tuple is:
// [id, category, question, choice1, choice2, choice3, choice4, correctIndex].
const QUESTION_BANK = [
  ["q01", "Science", "Which planet is known as the Red Planet?", "Venus", "Mars", "Jupiter", "Mercury", 1],
  ["q02", "Geography", "What is the largest ocean on Earth?", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean", 3],
  ["q03", "Technology", "What does CPU stand for?", "Central Processing Unit", "Computer Power Utility", "Core Program Upload", "Central Program User", 0],
  ["q04", "General Knowledge", "How many sides does a hexagon have?", "Five", "Six", "Seven", "Eight", 1],
  ["q05", "Science", "Which gas do plants absorb from the atmosphere?", "Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen", 2],
  ["q06", "Geography", "What is the capital city of Japan?", "Kyoto", "Seoul", "Beijing", "Tokyo", 3],
  ["q07", "Technology", "Which language runs natively in web browsers?", "Java", "C#", "JavaScript", "Python", 2],
  ["q08", "General Knowledge", "How many rings appear on the Olympic flag?", "Four", "Five", "Six", "Seven", 1],
  ["q09", "Science", "What is the chemical symbol for gold?", "Ag", "Gd", "Go", "Au", 3],
  ["q10", "Geography", "Which continent is the Sahara Desert in?", "Africa", "Asia", "South America", "Australia", 0],
  ["q11", "Technology", "What does HTML primarily define?", "Database permissions", "Web page structure", "Network speed", "Image compression", 1],
  ["q12", "General Knowledge", "Which instrument measures temperature?", "Barometer", "Altimeter", "Thermometer", "Compass", 2],
  ["q13", "Science", "What is the closest star to Earth?", "The Sun", "Sirius", "Proxima Centauri", "Polaris", 0],
  ["q14", "Geography", "Which country is home to the city of Rio de Janeiro?", "Portugal", "Argentina", "Mexico", "Brazil", 3],
  ["q15", "Technology", "Which data format is commonly used for APIs and supports key-value pairs?", "MP3", "JSON", "PNG", "WAV", 1],
  ["q16", "Science", "What is the process by which liquid water becomes water vapor?", "Condensation", "Evaporation", "Freezing", "Deposition", 1],
  ["q17", "Science", "Which part of a human cell contains most of its genetic material?", "Nucleus", "Cell membrane", "Ribosome", "Cytoplasm", 0],
  ["q18", "Science", "What force keeps planets in orbit around the Sun?", "Friction", "Magnetism", "Gravity", "Buoyancy", 2],
  ["q19", "Science", "What is the pH of a neutral solution at room temperature, approximately?", "2", "5", "7", "12", 2],
  ["q20", "Science", "Which vitamin can the human body produce when skin is exposed to sunlight?", "Vitamin A", "Vitamin C", "Vitamin D", "Vitamin K", 2],
  ["q21", "Science", "Which organ pumps blood through the human body?", "Liver", "Heart", "Lung", "Kidney", 1],
  ["q22", "Geography", "Which river flows through Egypt and empties into the Mediterranean Sea?", "Amazon", "Danube", "Nile", "Yangtze", 2],
  ["q23", "Geography", "What is the smallest independent country in the world by area?", "Monaco", "San Marino", "Liechtenstein", "Vatican City", 3],
  ["q24", "Geography", "Which mountain range traditionally forms part of the boundary between Europe and Asia?", "Andes", "Ural Mountains", "Alps", "Atlas Mountains", 1],
  ["q25", "Geography", "Which country has the largest land area?", "Canada", "China", "Russia", "United States", 2],
  ["q26", "Geography", "What is the capital of Australia?", "Sydney", "Melbourne", "Canberra", "Perth", 2],
  ["q27", "Geography", "Which imaginary line divides Earth into the Northern and Southern Hemispheres?", "Prime Meridian", "Equator", "Tropic of Cancer", "Arctic Circle", 1],
  ["q28", "Technology", "What does URL stand for?", "Uniform Resource Locator", "Universal Routing Link", "Unified Reference List", "User Response Location", 0],
  ["q29", "Technology", "Which protocol is commonly used to securely load websites?", "FTP", "HTTP", "HTTPS", "SMTP", 2],
  ["q30", "Technology", "Which of these is a version control system?", "Git", "Docker", "Nginx", "Figma", 0],
  ["q31", "Technology", "In a relational database, what uniquely identifies a row in a table?", "Foreign key only", "Primary key", "View", "Index page", 1],
  ["q32", "Technology", "Which number system uses only 0 and 1?", "Decimal", "Hexadecimal", "Binary", "Octal", 2],
  ["q33", "Technology", "What does RAM primarily provide to a computer?", "Temporary working memory", "Permanent file backup", "Network routing", "Power regulation", 0],
  ["q34", "General Knowledge", "How many minutes are in three hours?", "120", "150", "180", "210", 2],
  ["q35", "General Knowledge", "Which language is primarily spoken in Brazil?", "Spanish", "Portuguese", "French", "Italian", 1],
  ["q36", "General Knowledge", "How many players from one team are on the court in a standard basketball game?", "Four", "Five", "Six", "Seven", 1],
  ["q37", "General Knowledge", "Which artist painted the Mona Lisa?", "Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Claude Monet", 2],
  ["q38", "General Knowledge", "What is the hardest naturally occurring mineral on the Mohs scale?", "Quartz", "Diamond", "Topaz", "Corundum", 1],
  ["q39", "General Knowledge", "Which instrument has keys, pedals, and strings?", "Flute", "Trumpet", "Piano", "Clarinet", 2],
  ["q40", "General Knowledge", "How many days are there in a leap year?", "364", "365", "366", "367", 2],
  ["q41", "Science", "What is the chemical symbol for sodium?", "So", "Na", "S", "N", 1],
  ["q42", "Science", "Which structure controls what enters and leaves a cell?", "Cell membrane", "Nucleus", "Ribosome", "Vacuole", 0],
  ["q43", "Science", "What is the SI unit of electric current?", "Volt", "Ohm", "Ampere", "Watt", 2],
  ["q44", "Science", "Which subatomic particle has a negative electric charge?", "Proton", "Neutron", "Electron", "Photon", 2],
  ["q45", "Science", "Which scale is commonly used to describe earthquake magnitude?", "Richter scale", "Beaufort scale", "Celsius scale", "Mohs scale", 0],
  ["q46", "Science", "Which blood cells primarily carry oxygen?", "Platelets", "Red blood cells", "White blood cells", "Stem cells", 1],
  ["q47", "Science", "What is the approximate speed of light in a vacuum?", "300,000 km/s", "30,000 km/s", "3,000 km/s", "3,000,000 km/s", 0],
  ["q48", "Science", "Which layer of Earth is liquid and surrounds the inner core?", "Crust", "Mantle", "Outer core", "Lithosphere", 2],
  ["q49", "Science", "A substance with a pH of 3 is best described as what?", "Acidic", "Neutral", "Basic", "Radioactive", 0],
  ["q50", "Science", "Which gas makes up the largest proportion of Earth’s atmosphere?", "Oxygen", "Nitrogen", "Carbon dioxide", "Argon", 1],
  ["q51", "Science", "What is the change from a gas directly into a solid called?", "Sublimation", "Deposition", "Condensation", "Melting", 1],
  ["q52", "Science", "Which organ filters blood to produce urine?", "Liver", "Lung", "Kidney", "Pancreas", 2],
  ["q53", "Science", "What is the smallest unit of an element that retains its chemical identity?", "Molecule", "Atom", "Cell", "Compound", 1],
  ["q54", "Science", "Which type of energy is stored in a stretched spring?", "Chemical", "Nuclear", "Elastic potential", "Sound", 2],
  ["q55", "Science", "Which planet has the most prominent ring system?", "Mars", "Saturn", "Mercury", "Venus", 1],
  ["q56", "Geography", "What is the capital city of Canada?", "Toronto", "Vancouver", "Ottawa", "Montreal", 2],
  ["q57", "Geography", "Which country is home to the ancient Inca site of Machu Picchu?", "Peru", "Chile", "Bolivia", "Ecuador", 0],
  ["q58", "Geography", "Which is the largest continent by land area?", "Africa", "Asia", "Europe", "South America", 1],
  ["q59", "Geography", "The Andes mountain range is primarily located on which continent?", "Asia", "Europe", "South America", "Africa", 2],
  ["q60", "Geography", "Which ocean lies between Africa and Australia?", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Southern Ocean", 1],
  ["q61", "Geography", "Which country is home to the ancient city of Petra?", "Jordan", "Lebanon", "Egypt", "Turkey", 0],
  ["q62", "Geography", "What is the capital of New Zealand?", "Auckland", "Christchurch", "Wellington", "Hamilton", 2],
  ["q63", "Geography", "What is the capital of Ethiopia?", "Nairobi", "Addis Ababa", "Khartoum", "Kampala", 1],
  ["q64", "Geography", "Which U.S. state is made up entirely of islands in the Pacific Ocean?", "Alaska", "Florida", "Hawaii", "Rhode Island", 2],
  ["q65", "Geography", "Which strait separates Spain from Morocco?", "Bering Strait", "Strait of Gibraltar", "Bosporus", "Malacca Strait", 1],
  ["q66", "Geography", "Mount Kilimanjaro is located in which country?", "Kenya", "Tanzania", "Uganda", "Ethiopia", 1],
  ["q67", "Geography", "Which European country is famous for its fjords?", "Norway", "Hungary", "Portugal", "Belgium", 0],
  ["q68", "Geography", "Which country has the city of Kyoto?", "China", "Japan", "South Korea", "Thailand", 1],
  ["q69", "Geography", "Which country is crossed by both the Equator and the Tropic of Capricorn?", "Brazil", "India", "Japan", "Norway", 0],
  ["q70", "Geography", "Which European capital is situated on the River Tiber?", "Athens", "Rome", "Vienna", "Prague", 1],
  ["q71", "Technology", "What is the main purpose of a compiler?", "Translate source code into another form", "Store passwords in a database", "Assign IP addresses to devices", "Render images on a monitor", 0],
  ["q72", "Technology", "Which protocol is commonly used to send outgoing email?", "IMAP", "POP3", "SMTP", "DNS", 2],
  ["q73", "Technology", "What does SSD stand for in computer storage?", "Solid State Drive", "System Storage Directory", "Secure Software Download", "Serial Signal Device", 0],
  ["q74", "Technology", "Which data structure follows the Last In, First Out principle?", "Queue", "Stack", "Tree", "Graph", 1],
  ["q75", "Technology", "What does API stand for in software development?", "Application Programming Interface", "Automated Program Installation", "Applied Processing Instruction", "Advanced Peripheral Integration", 0],
  ["q76", "Technology", "Which language is primarily used to style web pages?", "HTML", "CSS", "SQL", "Bash", 1],
  ["q77", "Technology", "What is the primary role of DNS?", "Encrypting local files", "Translating domain names to IP addresses", "Compressing images", "Scheduling CPU tasks", 1],
  ["q78", "Technology", "Which sorting algorithm repeatedly compares adjacent elements and swaps them when needed?", "Merge sort", "Bubble sort", "Heap sort", "Radix sort", 1],
  ["q79", "Technology", "In version control, what is a Git commit?", "A saved snapshot of changes", "A cloud hosting plan", "A network cable", "A programming language", 0],
  ["q80", "Technology", "Which database language is commonly used to query relational tables?", "CSS", "SQL", "XML", "Markdown", 1],
  ["q81", "Technology", "What does responsive web design aim to do?", "Make layouts adapt to different screen sizes", "Guarantee faster internet", "Replace server-side code", "Prevent all security attacks", 0],
  ["q82", "Technology", "Which device forwards data between different IP networks?", "Keyboard", "Router", "Microphone", "Printer", 1],
  ["q83", "Technology", "What is two-factor authentication designed to improve?", "Screen resolution", "Account security", "Battery capacity", "Download speed", 1],
  ["q84", "Technology", "Which command-line utility is commonly used to transfer data with URLs?", "curl", "grep", "mkdir", "chmod", 0],
  ["q85", "Technology", "What does open-source software generally mean?", "Its source code is available under a license for inspection and use", "It never has bugs", "It can only run offline", "It has no copyright or license", 0],
  ["q86", "General Knowledge", "How many degrees are in a right angle?", "45", "90", "180", "360", 1],
  ["q87", "General Knowledge", "Which language has the most native speakers worldwide?", "English", "Spanish", "Mandarin Chinese", "Arabic", 2],
  ["q88", "General Knowledge", "What is the currency of Japan?", "Won", "Yuan", "Yen", "Ringgit", 2],
  ["q89", "General Knowledge", "What is the name of the galaxy that contains our Solar System?", "Andromeda", "Whirlpool", "Milky Way", "Sombrero", 2],
  ["q90", "General Knowledge", "Which chess piece moves in an L-shaped pattern?", "Bishop", "Rook", "Knight", "Queen", 2],
  ["q91", "General Knowledge", "Which author wrote the play Romeo and Juliet?", "Charles Dickens", "William Shakespeare", "Jane Austen", "Oscar Wilde", 1],
  ["q92", "General Knowledge", "What is the largest mammal on Earth?", "African elephant", "Blue whale", "Giraffe", "Orca", 1],
  ["q93", "General Knowledge", "How many strings does a standard violin have?", "Three", "Four", "Five", "Six", 1],
  ["q94", "General Knowledge", "Which instrument helps astronomers observe distant celestial objects?", "Microscope", "Telescope", "Periscope", "Spectrometer", 1],
  ["q95", "General Knowledge", "What is the main ingredient in traditional hummus?", "Lentils", "Chickpeas", "Potatoes", "Rice", 1],
  ["q96", "General Knowledge", "Which month has 28 days in a common year?", "February", "April", "June", "November", 0],
  ["q97", "General Knowledge", "What is the name of the fairy in Peter Pan?", "Cinderella", "Tinker Bell", "Wendy", "Alice", 1],
  ["q98", "General Knowledge", "Which sport uses the terms love, deuce, and ace?", "Cricket", "Tennis", "Rugby", "Golf", 1],
  ["q99", "General Knowledge", "What is the square root of 144?", "10", "11", "12", "14", 2],
  ["q100", "General Knowledge", "Which metal is liquid at typical room temperature?", "Iron", "Mercury", "Aluminum", "Copper", 1]
].map(([id, category, text, choice1, choice2, choice3, choice4, correctIndex]) => ({
  id, category, text, choices: [choice1, choice2, choice3, choice4], correctIndex: Number(correctIndex),
}));

const rooms = new Map();
const playerColors = [
  "#54E6A5",
  "#FF6B8A",
  "#6EA8FE",
  "#FFC857",
  "#C49BFF",
  "#FF9866",
  "#57D9E8",
  "#F47BC2",
];

function makeId() {
  return crypto.randomBytes(12).toString("hex");
}

function cleanName(value) {
  const name = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 18);

  return name || "Player";
}

function cleanCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function makeRoomCode() {
  let code;

  do {
    code = "";
    for (let i = 0; i < 5; i++) {
      code += ROOM_CODE_CHARS[crypto.randomInt(0, ROOM_CODE_CHARS.length)];
    }
  } while (rooms.has(code));

  return code;
}

function shuffle(items) {
  const copy = items.slice();

  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function randomInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

// Convert a 1–30 board position into coordinates.
// Rows are counted from the bottom; numbering alternates direction.
function positionToCoordinates(pos) {
  if (!Number.isInteger(pos) || pos < 1 || pos > 30) {
    throw new RangeError(`Invalid board position: ${pos}`);
  }

  const rowFromBottom = Math.floor((pos - 1) / 5);
  const col = rowFromBottom % 2 === 0 ? (pos - 1) % 5 : 4 - ((pos - 1) % 5);

  return { rowFromBottom, col };
}

function coordinatesToPosition(rowFromBottom, col) {
  if (
    !Number.isInteger(rowFromBottom) ||
    rowFromBottom < 0 ||
    rowFromBottom > 5 ||
    !Number.isInteger(col) ||
    col < 0 ||
    col > 4
  ) {
    return null;
  }

  return rowFromBottom * 5 + (rowFromBottom % 2 === 0 ? col : 4 - col) + 1;
}

const VECTOR_DELTAS = Object.freeze({
  "↗": { row: 1, col: 1, type: "boost" },
  "↖": { row: 1, col: -1, type: "boost" },
  "↙": { row: -1, col: -1, type: "slide" },
  "↘": { row: -1, col: 1, type: "slide" },
});

// Return a vector effect only if its destination is on the board.
function buildVectorCandidate(origin, arrow) {
  const originCoords = positionToCoordinates(origin);
  const delta = VECTOR_DELTAS[arrow];

  if (!delta) return null;

  const targetRow = originCoords.rowFromBottom + delta.row;
  const targetCol = originCoords.col + delta.col;

  if (targetRow < 0 || targetRow > 5 || targetCol < 0 || targetCol > 4) {
    return null;
  }

  const destination = coordinatesToPosition(targetRow, targetCol);
  if (!destination) return null;

  return {
    origin,
    destination,
    type: delta.type,
    arrow,
    label: `${delta.type === "boost" ? "Boost" : "Slide"} ${arrow}: ${origin} → ${destination}`,
  };
}

function validateBoardEffects(effects) {
  const entries = Object.entries(effects || {});
  if (entries.length !== 8) return false;

  const boosts = entries.filter(([, rule]) => rule.type === "boost");
  const slides = entries.filter(([, rule]) => rule.type === "slide");
  if (boosts.length !== 4 || slides.length !== 4) return false;

  const origins = new Set();
  for (const [originText, rule] of entries) {
    const origin = Number(originText);
    if (!Number.isInteger(origin) || origin < 6 || origin > 27 || origins.has(origin)) return false;
    origins.add(origin);
    const expected = buildVectorCandidate(origin, rule.arrow);
    if (!expected || expected.type !== rule.type || expected.destination !== rule.destination) return false;
    if (!Number.isInteger(rule.destination) || rule.destination < 1 || rule.destination > 30) return false;
  }

  // The forced-resolution graph contains only automatic vector edges. Ordinary
  // forward/penalty moves happen on separate turns, so they cannot create an
  // infinite same-turn effect-resolution loop (though they can revisit a tile).
  const visiting = new Set();
  const visited = new Set();
  function visit(position) {
    if (visiting.has(position)) return false;
    if (visited.has(position)) return true;
    visiting.add(position);
    const rule = effects[position];
    if (rule && effects[rule.destination] && !visit(rule.destination)) return false;
    visiting.delete(position);
    visited.add(position);
    return true;
  }

  for (const origin of origins) {
    if (!visit(origin)) return false;
    const chain = new Set();
    let current = origin;
    while (effects[current]) {
      if (chain.has(current)) return false;
      chain.add(current);
      current = effects[current].destination;
      if (!Number.isInteger(current) || current < 1 || current > 30) return false;
    }
    if (effects[current]) return false;
  }
  return true;
}

// Every match receives exactly 4 Green Boosts and 4 Red Slides.
function generateBoardEffects() {
  const boostArrows = ["↗", "↖"];
  const slideArrows = ["↙", "↘"];
  const boostCandidates = [];
  const slideCandidates = [];

  for (let origin = 6; origin <= 27; origin++) {
    for (const arrow of boostArrows) {
      const candidate = buildVectorCandidate(origin, arrow);
      if (candidate) boostCandidates.push(candidate);
    }

    for (const arrow of slideArrows) {
      const candidate = buildVectorCandidate(origin, arrow);
      if (candidate) slideCandidates.push(candidate);
    }
  }

  for (let attempt = 0; attempt < 2_000; attempt++) {
    const effects = {};
    const usedOrigins = new Set();
    const shuffledBoosts = shuffle(boostCandidates);
    const shuffledSlides = shuffle(slideCandidates);
    let boostCount = 0;
    let slideCount = 0;

    for (const candidate of shuffledBoosts) {
      if (boostCount === 4) break;
      if (usedOrigins.has(candidate.origin)) continue;
      effects[candidate.origin] = { ...candidate };
      usedOrigins.add(candidate.origin);
      boostCount++;
    }

    for (const candidate of shuffledSlides) {
      if (slideCount === 4) break;
      if (usedOrigins.has(candidate.origin)) continue;
      effects[candidate.origin] = { ...candidate };
      usedOrigins.add(candidate.origin);
      slideCount++;
    }

    if (boostCount === 4 && slideCount === 4 && validateBoardEffects(effects)) {
      return effects;
    }
  }

  const fallback = {};
  const fallbackCandidates = [
    buildVectorCandidate(7, "↗"),
    buildVectorCandidate(8, "↖"),
    buildVectorCandidate(12, "↗"),
    buildVectorCandidate(13, "↖"),
    buildVectorCandidate(17, "↙"),
    buildVectorCandidate(18, "↘"),
    buildVectorCandidate(22, "↙"),
    buildVectorCandidate(23, "↘"),
  ];

  for (const candidate of fallbackCandidates) {
    if (candidate) fallback[candidate.origin] = { ...candidate };
  }

  if (!validateBoardEffects(fallback)) {
    throw new Error("Unable to generate a validated acyclic 4-boost/4-slide board.");
  }

  return fallback;
}

function appendTravelStep(steps, step) {
  steps.push({
    type: step.type,
    from: step.from,
    to: step.to,
    durationMs: step.durationMs,
    ...(step.effectType ? { effectType: step.effectType } : {}),
    ...(step.arrow ? { arrow: step.arrow } : {}),
    ...(step.triggerAt ? { triggerAt: step.triggerAt } : {}),
    ...(step.label ? { label: step.label } : {}),
  });
}

function getPlayerForSocket(socket) {
  const { roomCode, playerId } = socket.data;
  const room = roomCode && rooms.get(roomCode);
  const player = room && room.players.get(playerId);

  if (!room || !player || player.socketId !== socket.id) return null;

  return { room, player };
}

function publicState(room) {
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
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      position: p.position,
      connected: p.connected,
      isHost: p.id === room.hostPlayerId,
      answered: room.roundAnswers.has(p.id),
      answeredCorrect: room.roundCorrect.has(p.id),
      score: p.score,
      streak: p.streak || 0,
      timeoutStreak: p.timeoutStreak || 0,
    })),
    question,
    roundId: room.roundId,
    deadline: room.deadline,
    countdownEndsAt: room.countdownEndsAt,
    roundResolved: room.roundResolved,
    lastRoundResult: room.lastRoundResult,
    winner: room.winner,
    boardEffects: room.boardEffects,
    roundNumber: room.deckIndex,
    totalQuestions: room.questionDeck.length,
    questionsRemaining: Math.max(0, room.questionDeck.length - room.deckIndex),
  };
}

function broadcastState(room) {
  io.to(room.code).emit("room:state", publicState(room));
}

function emitError(socket, message) {
  socket.emit("game:error", { message });
}

function clearRoomTimers(room) {
  if (room.questionTimer) clearTimeout(room.questionTimer);
  if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
  if (room.countdownTimer) clearTimeout(room.countdownTimer);

  room.questionTimer = null;
  room.nextRoundTimer = null;
  room.countdownTimer = null;
}

function createRoom(hostName, socket) {
  const code = makeRoomCode();
  const playerId = makeId();
  const playerToken = makeId();

  const room = {
    code,
    status: "waiting",
    hostPlayerId: playerId,
    players: new Map(),
    playerTokens: new Map(),
    questionDeck: [],
    deckIndex: 0,
    currentQuestion: null,
    roundId: 0,
    deadline: null,
    countdownEndsAt: null,
    roundResolved: false,
    roundAnswers: new Map(),
    roundCorrect: new Set(),
    roundAnimationAcks: new Set(),
    roundMovementPending: false,
    lastRoundResult: null,
    winner: null,
    boardEffects: {},
    questionTimer: null,
    nextRoundTimer: null,
    countdownTimer: null,
    cleanupTimer: null,
    createdAt: Date.now(),
    lastResolutionTimestamp: 0,
    matchStartedAt: null,
  };

  const player = {
    id: playerId,
    token: playerToken,
    name: cleanName(hostName),
    color: playerColors[0],
    position: 1,
    score: 0,
    streak: 0,
    timeoutStreak: 0,
    joinedAt: Date.now(),
    positionReachedAt: Date.now(),
    connected: true,
    socketId: socket.id,
  };

  room.players.set(playerId, player);
  room.playerTokens.set(playerToken, playerId);
  rooms.set(code, room);
  attachPlayer(socket, room, player);

  return { room, player };
}

function attachPlayer(socket, room, player) {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }

  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);
    if (oldSocket) oldSocket.disconnect(true);
  }

  player.socketId = socket.id;
  player.connected = true;
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
}

function enterRoom(socket, room, player) {
  attachPlayer(socket, room, player);

  socket.emit("room:joined", {
    roomCode: room.code,
    playerId: player.id,
    playerToken: player.token,
    state: publicState(room),
  });

  broadcastState(room);
}

function addPlayer(room, name, socket) {
  const playerId = makeId();
  const token = makeId();

  const player = {
    id: playerId,
    token,
    name: cleanName(name),
    color: playerColors[room.players.size % playerColors.length],
    position: 1,
    score: 0,
    streak: 0,
    timeoutStreak: 0,
    joinedAt: Date.now(),
    positionReachedAt: Date.now(),
    connected: true,
    socketId: socket.id,
  };

  room.players.set(playerId, player);
  room.playerTokens.set(token, playerId);

  return player;
}

function nextResolutionTimestamp(room) {
  room.lastResolutionTimestamp = Math.max(
    Date.now(),
    (room.lastResolutionTimestamp || 0) + 1,
  );
  return room.lastResolutionTimestamp;
}

function chooseDistanceWinner(room) {
  return [...room.players.values()].sort((a, b) =>
    b.position - a.position ||
    b.score - a.score ||
    (a.positionReachedAt ?? Number.MAX_SAFE_INTEGER) -
      (b.positionReachedAt ?? Number.MAX_SAFE_INTEGER) ||
    (a.joinedAt ?? Number.MAX_SAFE_INTEGER) -
      (b.joinedAt ?? Number.MAX_SAFE_INTEGER) ||
    a.id.localeCompare(b.id),
  )[0] || null;
}

function finishByDistance(room) {
  if (room.status === "finished") return;

  const previousResult = room.lastRoundResult;
  const leader = chooseDistanceWinner(room);

  room.status = "finished";
  room.deadline = null;
  room.countdownEndsAt = null;
  room.currentQuestion = null;
  room.roundResolved = true;
  room.winner = leader
    ? {
        playerId: leader.id,
        name: leader.name,
        color: leader.color,
        byQuestions: true,
        position: leader.position,
        score: leader.score,
        positionReachedAt: leader.positionReachedAt,
      }
    : null;
  room.lastRoundResult = {
    ...(previousResult || {}),
    message: leader
      ? `${leader.name} wins on distance after all ${MATCH_QUESTION_COUNT} questions!`
      : `All ${MATCH_QUESTION_COUNT} questions have been used. No winner could be selected.`,
    correctPlayers: previousResult?.correctPlayers || [],
    byQuestions: true,
  };

  clearRoomTimers(room);
  broadcastState(room);
}

function finishRound(room, message) {
  if (room.status !== "playing" || room.roundResolved || room.winner) return;

  room.roundResolved = true;
  room.deadline = null;
  if (room.questionTimer) clearTimeout(room.questionTimer);
  room.questionTimer = null;

  const correctPlayers = [...room.roundCorrect].map((id) => {
    const p = room.players.get(id);
    return p ? { playerId: p.id, name: p.name, color: p.color } : null;
  }).filter(Boolean);

  room.lastRoundResult = {
    roundId: room.roundId,
    correctIndex: room.currentQuestion?.correctIndex,
    correctPlayers,
    message: message || (correctPlayers.length
      ? `${correctPlayers.length} player${correctPlayers.length === 1 ? "" : "s"} got it right this round!`
      : "Time is up! No correct answers this round."),
  };

  const submitted = [...room.roundAnswers.entries()].map(([playerId, answer]) => ({
    player: room.players.get(playerId),
    choiceIndex: answer.choiceIndex,
    answeredAt: answer.answeredAt,
  })).filter((entry) => entry.player).sort((a, b) =>
    a.answeredAt - b.answeredAt ||
    a.player.joinedAt - b.player.joinedAt ||
    a.player.id.localeCompare(b.player.id));
  const plans = [];
  const answeredIds = new Set(submitted.map((entry) => entry.player.id));

  for (const entry of submitted) {
    const player = entry.player;

    if (entry.choiceIndex === room.currentQuestion?.correctIndex) {
      player.streak = (player.streak || 0) + 1;
      player.timeoutStreak = 0;

      const combo = player.streak >= 3 && player.streak % 3 === 0;
      const movement = applyCorrectAnswer(room, player, combo);

      if (combo) {
        movement.plan.toast = {
          type: "fire",
          message: `${player.name} is on fire! 3 Correct Answers in a row! (+1 Bonus Space)`,
        };
      }

      plans.push(movement.plan);

      if (player.position >= 30) {
        room.lastRoundResult.message = `${player.name} reached space 30 and won!`;
        room.lastRoundResult.winnerPlayerId = player.id;
        io.to(room.code).emit("round:movement", {
          roomCode: room.code,
          roundId: room.roundId,
          moves: plans,
        });
        finishGame(room, player);
        return;
      }
    } else {
      player.streak = 0;
      player.timeoutStreak = 0;
      player.score = (player.score || 0) - 1;
      plans.push(makePenaltyPlan(
        player,
        "wrong",
        `${player.name} chose the wrong answer! (-1 Point, -1 Space)`,
      ));
    }
  }

  const unanswered = [...room.players.values()]
    .filter((player) => !answeredIds.has(player.id))
    .sort((a, b) =>
      a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));

  for (const player of unanswered) {
    player.streak = 0;
    player.timeoutStreak = (player.timeoutStreak || 0) + 1;

    if (player.timeoutStreak >= 2) {
      player.score = (player.score || 0) - 1;
      plans.push(makePenaltyPlan(
        player,
        "timeout",
        `${player.name} missed 2+ questions in a row! (-1 Point, -1 Space)`,
      ));
    }
  }

  if (plans.length) {
    room.roundAnimationAcks = new Set();
    room.roundMovementPending = true;
    io.to(room.code).emit("round:movement", {
      roomCode: room.code,
      roundId: room.roundId,
      moves: plans,
    });
  } else {
    room.roundMovementPending = false;
  }

  if (room.deckIndex >= MATCH_QUESTION_COUNT) {
    finishByDistance(room);
    return;
  }

  broadcastState(room);
  if (!room.roundMovementPending) scheduleNextRound(room);
}

function makePenaltyPlan(player, reason, message) {
  const fromPosition = player.position;
  const finalPosition = Math.max(1, fromPosition - 1);
  const steps = fromPosition > 1
    ? [{
        type: "penalty",
        from: fromPosition,
        to: finalPosition,
        durationMs: 360,
      }]
    : [];

  player.position = finalPosition;

  return {
    playerId: player.id,
    playerName: player.name,
    color: player.color,
    fromPosition,
    steps,
    finalPosition,
    toast: {
      type: reason === "wrong" ? "penalty" : "timeout",
      message,
    },
  };
}

function maybeScheduleNextRound(room, roundId) {
  if (
    !room ||
    room.status !== "playing" ||
    room.winner ||
    room.roundId !== roundId ||
    !room.roundResolved
  ) {
    return;
  }

  const connected = [...room.players.values()].filter((player) => player.connected);
  if (connected.some((player) => !room.roundAnimationAcks.has(player.id))) return;

  room.roundMovementPending = false;
  scheduleNextRound(room);
}

function scheduleNextRound(room) {
  if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);

  room.nextRoundTimer = setTimeout(() => {
    room.nextRoundTimer = null;

    if (room.status === "playing" && !room.winner) {
      nextQuestion(room);
    }
  }, BETWEEN_ROUNDS_MS);
}

function nextQuestion(room) {
  if (room.status !== "playing" || room.winner) return;

  if (room.deckIndex >= MATCH_QUESTION_COUNT) {
    finishByDistance(room);
    return;
  }

  room.currentQuestion = room.questionDeck[room.deckIndex++];
  room.roundId += 1;
  room.deadline = Date.now() + QUESTION_TIME_MS;
  room.roundResolved = false;
  room.roundAnswers = new Map();
  room.roundCorrect = new Set();
  room.roundAnimationAcks = new Set();
  room.roundMovementPending = false;
  room.lastRoundResult = null;

  broadcastState(room);

  const activeRoundId = room.roundId;

  room.questionTimer = setTimeout(() => {
    if (
      room.status !== "playing" ||
      room.roundId !== activeRoundId ||
      room.roundResolved
    ) {
      return;
    }

    finishRound(room);
  }, QUESTION_TIME_MS);
}

function startGame(room) {
  clearRoomTimers(room);

  room.status = "countdown";
  room.winner = null;
  room.currentQuestion = null;
  room.lastRoundResult = null;
  room.roundId = 0;
  room.deckIndex = 0;
  room.lastResolutionTimestamp = 0;
  room.matchStartedAt = Date.now();

  if (QUESTION_BANK.length < MATCH_QUESTION_COUNT) {
    throw new Error(`Question bank must contain at least ${MATCH_QUESTION_COUNT} questions.`);
  }

  const questionIds = new Set(QUESTION_BANK.map((question) => question.id));
  if (questionIds.size !== QUESTION_BANK.length) {
    throw new Error("Question bank contains duplicate question IDs.");
  }

  room.questionDeck = shuffle(QUESTION_BANK).slice(0, MATCH_QUESTION_COUNT);
  if (room.questionDeck.length !== MATCH_QUESTION_COUNT) {
    throw new Error(`Expected exactly ${MATCH_QUESTION_COUNT} questions per match.`);
  }

  room.boardEffects = generateBoardEffects();
  room.roundAnswers = new Map();
  room.roundCorrect = new Set();
  room.roundAnimationAcks = new Set();
  room.roundMovementPending = false;

  room.players.forEach((player) => {
    player.position = 1;
    player.score = 0;
    player.streak = 0;
    player.timeoutStreak = 0;
    player.positionReachedAt = room.matchStartedAt;
  });

  room.countdownEndsAt = Date.now() + COUNTDOWN_MS;

  io.to(room.code).emit("match:initialized", {
    roomCode: room.code,
    boardEffects: room.boardEffects,
    totalQuestions: room.questionDeck.length,
  });

  broadcastState(room);

  room.countdownTimer = setTimeout(() => {
    if (room.status !== "countdown") return;

    room.status = "playing";
    room.countdownEndsAt = null;
    nextQuestion(room);
  }, COUNTDOWN_MS);
}

function applyCorrectAnswer(room, player, bonusSpace = false) {
  player.score = (player.score || 0) + 1;

  const fromPosition = player.position;
  const normalDestination = Math.min(30, fromPosition + 2);
  const steps = [];
  let current = fromPosition;

  while (current < normalDestination) {
    const next = current + 1;
    appendTravelStep(steps, {
      type: "normal",
      from: current,
      to: next,
      durationMs: 360,
    });
    current = next;
  }

  if (bonusSpace && current < 30) {
    const next = Math.min(30, current + 1);
    appendTravelStep(steps, {
      type: "bonus",
      from: current,
      to: next,
      durationMs: 420,
    });
    current = next;
  }

  let firstEffect = null;
  const visited = new Set();

  while (current < 30 && room.boardEffects[current]) {
    if (visited.has(current)) {
      throw new Error(`Board effect cycle encountered at space ${current}.`);
    }

    visited.add(current);
    const rule = room.boardEffects[current];

    if (!firstEffect) {
      firstEffect = {
        type: rule.type,
        from: current,
        to: rule.destination,
        label: rule.label,
        arrow: rule.arrow,
      };
    }

    appendTravelStep(steps, {
      type: "vector",
      effectType: rule.type,
      arrow: rule.arrow,
      from: current,
      to: rule.destination,
      triggerAt: current,
      durationMs: 560,
      label: rule.label,
    });

    current = rule.destination;
  }

  player.position = Math.max(1, Math.min(30, current));
  player.positionReachedAt = nextResolutionTimestamp(room);

  return {
    from: fromPosition,
    movedTo: player.position,
    effect: firstEffect,
    plan: {
      playerId: player.id,
      playerName: player.name,
      color: player.color,
      fromPosition,
      steps,
      finalPosition: player.position,
    },
  };
}

function finishGame(room, player) {
  if (room.status === "finished") return;

  room.status = "finished";
  room.deadline = null;
  room.countdownEndsAt = null;
  room.roundResolved = true;
  room.winner = {
    playerId: player.id,
    name: player.name,
    color: player.color,
    byQuestions: false,
    position: player.position,
    score: player.score,
    positionReachedAt: player.positionReachedAt,
  };

  clearRoomTimers(room);
  broadcastState(room);
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload) => {
    const { room, player } = createRoom(payload && payload.name, socket);

    socket.emit("room:joined", {
      roomCode: room.code,
      playerId: player.id,
      playerToken: player.token,
      state: publicState(room),
    });

    broadcastState(room);
  });

  socket.on("room:join", (payload) => {
    const code = cleanCode(payload && payload.roomCode);
    const name = cleanName(payload && payload.name);
    const token = String((payload && payload.playerToken) || "");
    const room = rooms.get(code);

    if (!room) {
      return emitError(
        socket,
        "Room not found. Check the code or create a new room.",
      );
    }

    if (token && room.playerTokens.has(token)) {
      const player = room.players.get(room.playerTokens.get(token));

      if (player) {
        player.name = name || player.name;
        return enterRoom(socket, room, player);
      }
    }

    if (room.status !== "waiting") {
      return emitError(
        socket,
        "This game has already started. Ask the host to create a new room.",
      );
    }

    if (room.players.size >= MAX_PLAYERS) {
      return emitError(socket, `This room is full (maximum ${MAX_PLAYERS} players).`);
    }

    const player = addPlayer(room, name, socket);
    enterRoom(socket, room, player);
  });

  socket.on("game:start", () => {
    const result = getPlayerForSocket(socket);

    if (!result) {
      return emitError(socket, "Join a room before starting a game.");
    }

    const { room, player } = result;

    if (player.id !== room.hostPlayerId) {
      return emitError(socket, "Only the room host can start the race.");
    }

    if (room.status !== "waiting" && room.status !== "finished") {
      return emitError(socket, "The game is already in progress.");
    }

    const connectedPlayers = [...room.players.values()].filter(
      (p) => p.connected,
    );

    if (connectedPlayers.length < 2) {
      return emitError(
        socket,
        "At least 2 connected players are needed to start.",
      );
    }

    if (room.status === "finished") {
      room.players.forEach((p) => {
        p.position = 1;
      });
    }

    startGame(room);
  });

  function canReachFinishWithAnswer(room, player) {
    let current = Math.min(30, player.position + 2);
    const nextStreak = (player.streak || 0) + 1;

    if (nextStreak >= 3 && nextStreak % 3 === 0 && current < 30) {
      current++;
    }

    const visited = new Set();

    while (current < 30 && room.boardEffects[current]) {
      if (visited.has(current)) return false;
      visited.add(current);
      current = room.boardEffects[current].destination;
    }

    return current >= 30;
  }

  socket.on("answer:submit", (payload) => {
    const result = getPlayerForSocket(socket);

    if (!result) {
      return emitError(socket, "Join a room before answering.");
    }

    const { room, player } = result;
    const roundId = Number(payload && payload.roundId);
    const choiceIndex = Number(payload && payload.choiceIndex);

    if (
      room.status !== "playing" ||
      !room.currentQuestion ||
      room.roundResolved
    ) {
      return emitError(socket, "This question is already closed.");
    }

    if (roundId !== room.roundId) {
      return emitError(
        socket,
        "That question has expired. Wait for the next one.",
      );
    }

    if (
      !Number.isInteger(choiceIndex) ||
      choiceIndex < 0 ||
      choiceIndex >= room.currentQuestion.choices.length
    ) {
      return emitError(socket, "Please choose a valid answer.");
    }

    if (Date.now() > room.deadline) {
      return emitError(socket, "Time is up for this question.");
    }

    if (room.roundAnswers.has(player.id)) {
      return emitError(socket, "You have already answered this question.");
    }

    const answeredAt = Date.now();
    room.roundAnswers.set(player.id, { choiceIndex, answeredAt });

    const correct = choiceIndex === room.currentQuestion.correctIndex;
    if (correct) room.roundCorrect.add(player.id);

    socket.emit("answer:feedback", {
      roundId,
      correct,
      message: correct
        ? "Correct! Your move will play in submission order."
        : "Not quite — this answer costs 1 point and 1 space.",
      choiceIndex,
    });

    broadcastState(room);

    if (correct && canReachFinishWithAnswer(room, player)) {
      finishRound(room, `${player.name} is approaching the finish!`);
      return;
    }

    const connectedPlayers = [...room.players.values()].filter(
      (p) => p.connected,
    );

    if (
      connectedPlayers.length &&
      connectedPlayers.every((p) => room.roundAnswers.has(p.id))
    ) {
      finishRound(room, "Everyone has answered!");
    }
  });

  socket.on("round:animation-complete", (payload) => {
    const result = getPlayerForSocket(socket);
    if (!result) return;

    const { room, player } = result;
    const roundId = Number(payload && payload.roundId);

    if (!room.roundMovementPending || roundId !== room.roundId) return;

    room.roundAnimationAcks.add(player.id);
    maybeScheduleNextRound(room, roundId);
  });

  socket.on("game:leave", () => {
    const result = getPlayerForSocket(socket);
    if (!result) return;

    const { room, player } = result;

    player.connected = false;
    player.socketId = null;
    if (room.roundMovementPending) {
      maybeScheduleNextRound(room, room.roundId);
    }

    socket.leave(room.code);
    socket.data.roomCode = null;
    socket.data.playerId = null;

    broadcastState(room);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    const room = roomCode && rooms.get(roomCode);
    const player = room && room.players.get(playerId);

    if (!room || !player || player.socketId !== socket.id) return;

    player.connected = false;
    player.socketId = null;

    broadcastState(room);
    if (room.roundMovementPending) {
      maybeScheduleNextRound(room, room.roundId);
    }

    if (![...room.players.values()].some((p) => p.connected)) {
      room.cleanupTimer = setTimeout(
        () => {
          if (![...room.players.values()].some((p) => p.connected)) {
            clearRoomTimers(room);
            rooms.delete(room.code);
          }
        },
        30 * 60 * 1000,
      );

      if (room.cleanupTimer.unref) room.cleanupTimer.unref();
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Trivia Race is running on http://localhost:${PORT}`);
});