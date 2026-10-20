"use strict";

const MAX_PLAYERS = 6;
const QUESTION_TIME_MS = 20_000;
const BETWEEN_ROUNDS_MS = 5_000;
const COUNTDOWN_MS = 3_000;
const MATCH_QUESTION_COUNT = 30;

const QUESTION_BANK = [
  [
    "q01",
    "Science",
    "Which planet is known as the Red Planet?",
    "Venus",
    "Mars",
    "Jupiter",
    "Mercury",
    1,
  ],
  [
    "q02",
    "Geography",
    "What is the largest ocean on Earth?",
    "Atlantic Ocean",
    "Indian Ocean",
    "Arctic Ocean",
    "Pacific Ocean",
    3,
  ],
  [
    "q03",
    "Technology",
    "What does CPU stand for?",
    "Central Processing Unit",
    "Computer Power Utility",
    "Core Program Upload",
    "Central Program User",
    0,
  ],
  [
    "q04",
    "General Knowledge",
    "How many sides does a hexagon have?",
    "Five",
    "Six",
    "Seven",
    "Eight",
    1,
  ],
  [
    "q05",
    "Science",
    "Which gas do plants absorb from the atmosphere?",
    "Oxygen",
    "Nitrogen",
    "Carbon dioxide",
    "Hydrogen",
    2,
  ],
  [
    "q06",
    "Geography",
    "What is the capital city of Japan?",
    "Kyoto",
    "Seoul",
    "Beijing",
    "Tokyo",
    3,
  ],
  [
    "q07",
    "Technology",
    "Which language runs natively in web browsers?",
    "Java",
    "C#",
    "JavaScript",
    "Python",
    2,
  ],
  [
    "q08",
    "General Knowledge",
    "How many rings appear on the Olympic flag?",
    "Four",
    "Five",
    "Six",
    "Seven",
    1,
  ],
  [
    "q09",
    "Science",
    "What is the chemical symbol for gold?",
    "Ag",
    "Gd",
    "Go",
    "Au",
    3,
  ],
  [
    "q10",
    "Geography",
    "Which continent is the Sahara Desert in?",
    "Africa",
    "Asia",
    "South America",
    "Australia",
    0,
  ],
  [
    "q11",
    "Technology",
    "What does HTML primarily define?",
    "Database permissions",
    "Web page structure",
    "Network speed",
    "Image compression",
    1,
  ],
  [
    "q12",
    "General Knowledge",
    "Which instrument measures temperature?",
    "Barometer",
    "Altimeter",
    "Thermometer",
    "Compass",
    2,
  ],
  [
    "q13",
    "Science",
    "What is the closest star to Earth?",
    "The Sun",
    "Sirius",
    "Proxima Centauri",
    "Polaris",
    0,
  ],
  [
    "q14",
    "Geography",
    "Which country is home to the city of Rio de Janeiro?",
    "Portugal",
    "Argentina",
    "Mexico",
    "Brazil",
    3,
  ],
  [
    "q15",
    "Technology",
    "Which data format is commonly used for APIs and supports key-value pairs?",
    "MP3",
    "JSON",
    "PNG",
    "WAV",
    1,
  ],
  [
    "q16",
    "Science",
    "What is the process by which liquid water becomes water vapor?",
    "Condensation",
    "Evaporation",
    "Freezing",
    "Deposition",
    1,
  ],
  [
    "q17",
    "Science",
    "Which part of a human cell contains most of its genetic material?",
    "Nucleus",
    "Cell membrane",
    "Ribosome",
    "Cytoplasm",
    0,
  ],
  [
    "q18",
    "Science",
    "What force keeps planets in orbit around the Sun?",
    "Friction",
    "Magnetism",
    "Gravity",
    "Buoyancy",
    2,
  ],
  [
    "q19",
    "Science",
    "What is the pH of a neutral solution at room temperature, approximately?",
    "2",
    "5",
    "7",
    "12",
    2,
  ],
  [
    "q20",
    "Science",
    "Which vitamin can the human body produce when skin is exposed to sunlight?",
    "Vitamin A",
    "Vitamin C",
    "Vitamin D",
    "Vitamin K",
    2,
  ],
  [
    "q21",
    "Science",
    "Which organ pumps blood through the human body?",
    "Liver",
    "Heart",
    "Lung",
    "Kidney",
    1,
  ],
  [
    "q22",
    "Geography",
    "Which river flows through Egypt and empties into the Mediterranean Sea?",
    "Amazon",
    "Danube",
    "Nile",
    "Yangtze",
    2,
  ],
  [
    "q23",
    "Geography",
    "What is the smallest independent country in the world by area?",
    "Monaco",
    "San Marino",
    "Liechtenstein",
    "Vatican City",
    3,
  ],
  [
    "q24",
    "Geography",
    "Which mountain range traditionally forms part of the boundary between Europe and Asia?",
    "Andes",
    "Ural Mountains",
    "Alps",
    "Atlas Mountains",
    1,
  ],
  [
    "q25",
    "Geography",
    "Which country has the largest land area?",
    "Canada",
    "China",
    "Russia",
    "United States",
    2,
  ],
  [
    "q26",
    "Geography",
    "What is the capital of Australia?",
    "Sydney",
    "Melbourne",
    "Canberra",
    "Perth",
    2,
  ],
  [
    "q27",
    "Geography",
    "Which imaginary line divides Earth into the Northern and Southern Hemispheres?",
    "Prime Meridian",
    "Equator",
    "Tropic of Cancer",
    "Arctic Circle",
    1,
  ],
  [
    "q28",
    "Technology",
    "What does URL stand for?",
    "Uniform Resource Locator",
    "Universal Routing Link",
    "Unified Reference List",
    "User Response Location",
    0,
  ],
  [
    "q29",
    "Technology",
    "Which protocol is commonly used to securely load websites?",
    "FTP",
    "HTTP",
    "HTTPS",
    "SMTP",
    2,
  ],
  [
    "q30",
    "Technology",
    "Which of these is a version control system?",
    "Git",
    "Docker",
    "Nginx",
    "Figma",
    0,
  ],
  [
    "q31",
    "Technology",
    "In a relational database, what uniquely identifies a row in a table?",
    "Foreign key only",
    "Primary key",
    "View",
    "Index page",
    1,
  ],
  [
    "q32",
    "Technology",
    "Which number system uses only 0 and 1?",
    "Decimal",
    "Hexadecimal",
    "Binary",
    "Octal",
    2,
  ],
  [
    "q33",
    "Technology",
    "What does RAM primarily provide to a computer?",
    "Temporary working memory",
    "Permanent file backup",
    "Network routing",
    "Power regulation",
    0,
  ],
  [
    "q34",
    "General Knowledge",
    "How many minutes are in three hours?",
    "120",
    "150",
    "180",
    "210",
    2,
  ],
  [
    "q35",
    "General Knowledge",
    "Which language is primarily spoken in Brazil?",
    "Spanish",
    "Portuguese",
    "French",
    "Italian",
    1,
  ],
  [
    "q36",
    "General Knowledge",
    "How many players from one team are on the court in a standard basketball game?",
    "Four",
    "Five",
    "Six",
    "Seven",
    1,
  ],
  [
    "q37",
    "General Knowledge",
    "Which artist painted the Mona Lisa?",
    "Vincent van Gogh",
    "Pablo Picasso",
    "Leonardo da Vinci",
    "Claude Monet",
    2,
  ],
  [
    "q38",
    "General Knowledge",
    "What is the hardest naturally occurring mineral on the Mohs scale?",
    "Quartz",
    "Diamond",
    "Topaz",
    "Corundum",
    1,
  ],
  [
    "q39",
    "General Knowledge",
    "Which instrument has keys, pedals, and strings?",
    "Flute",
    "Trumpet",
    "Piano",
    "Clarinet",
    2,
  ],
  [
    "q40",
    "General Knowledge",
    "How many days are there in a leap year?",
    "364",
    "365",
    "366",
    "367",
    2,
  ],
  [
    "q41",
    "Science",
    "What is the chemical symbol for sodium?",
    "So",
    "Na",
    "S",
    "N",
    1,
  ],
  [
    "q42",
    "Science",
    "Which structure controls what enters and leaves a cell?",
    "Cell membrane",
    "Nucleus",
    "Ribosome",
    "Vacuole",
    0,
  ],
  [
    "q43",
    "Science",
    "What is the SI unit of electric current?",
    "Volt",
    "Ohm",
    "Ampere",
    "Watt",
    2,
  ],
  [
    "q44",
    "Science",
    "Which subatomic particle has a negative electric charge?",
    "Proton",
    "Neutron",
    "Electron",
    "Photon",
    2,
  ],
  [
    "q45",
    "Science",
    "Which scale is commonly used to describe earthquake magnitude?",
    "Richter scale",
    "Beaufort scale",
    "Celsius scale",
    "Mohs scale",
    0,
  ],
  [
    "q46",
    "Science",
    "Which blood cells primarily carry oxygen?",
    "Platelets",
    "Red blood cells",
    "White blood cells",
    "Stem cells",
    1,
  ],
  [
    "q47",
    "Science",
    "What is the approximate speed of light in a vacuum?",
    "300,000 km/s",
    "30,000 km/s",
    "3,000 km/s",
    "3,000,000 km/s",
    0,
  ],
  [
    "q48",
    "Science",
    "Which layer of Earth is liquid and surrounds the inner core?",
    "Crust",
    "Mantle",
    "Outer core",
    "Lithosphere",
    2,
  ],
  [
    "q49",
    "Science",
    "A substance with a pH of 3 is best described as what?",
    "Acidic",
    "Neutral",
    "Basic",
    "Radioactive",
    0,
  ],
  [
    "q50",
    "Science",
    "Which gas makes up the largest proportion of Earth’s atmosphere?",
    "Oxygen",
    "Nitrogen",
    "Carbon dioxide",
    "Argon",
    1,
  ],
  [
    "q51",
    "Science",
    "What is the change from a gas directly into a solid called?",
    "Sublimation",
    "Deposition",
    "Condensation",
    "Melting",
    1,
  ],
  [
    "q52",
    "Science",
    "Which organ filters blood to produce urine?",
    "Liver",
    "Lung",
    "Kidney",
    "Pancreas",
    2,
  ],
  [
    "q53",
    "Science",
    "What is the smallest unit of an element that retains its chemical identity?",
    "Molecule",
    "Atom",
    "Cell",
    "Compound",
    1,
  ],
  [
    "q54",
    "Science",
    "Which type of energy is stored in a stretched spring?",
    "Chemical",
    "Nuclear",
    "Elastic potential",
    "Sound",
    2,
  ],
  [
    "q55",
    "Science",
    "Which planet has the most prominent ring system?",
    "Mars",
    "Saturn",
    "Mercury",
    "Venus",
    1,
  ],
  [
    "q56",
    "Geography",
    "What is the capital city of Canada?",
    "Toronto",
    "Vancouver",
    "Ottawa",
    "Montreal",
    2,
  ],
  [
    "q57",
    "Geography",
    "Which country is home to the ancient Inca site of Machu Picchu?",
    "Peru",
    "Chile",
    "Bolivia",
    "Ecuador",
    0,
  ],
  [
    "q58",
    "Geography",
    "Which is the largest continent by land area?",
    "Africa",
    "Asia",
    "Europe",
    "South America",
    1,
  ],
  [
    "q59",
    "Geography",
    "The Andes mountain range is primarily located on which continent?",
    "Asia",
    "Europe",
    "South America",
    "Africa",
    2,
  ],
  [
    "q60",
    "Geography",
    "Which ocean lies between Africa and Australia?",
    "Atlantic Ocean",
    "Indian Ocean",
    "Arctic Ocean",
    "Southern Ocean",
    1,
  ],
  [
    "q61",
    "Geography",
    "Which country is home to the ancient city of Petra?",
    "Jordan",
    "Lebanon",
    "Egypt",
    "Turkey",
    0,
  ],
  [
    "q62",
    "Geography",
    "What is the capital of New Zealand?",
    "Auckland",
    "Christchurch",
    "Wellington",
    "Hamilton",
    2,
  ],
  [
    "q63",
    "Geography",
    "What is the capital of Ethiopia?",
    "Nairobi",
    "Addis Ababa",
    "Khartoum",
    "Kampala",
    1,
  ],
  [
    "q64",
    "Geography",
    "Which U.S. state is made up entirely of islands in the Pacific Ocean?",
    "Alaska",
    "Florida",
    "Hawaii",
    "Rhode Island",
    2,
  ],
  [
    "q65",
    "Geography",
    "Which strait separates Spain from Morocco?",
    "Bering Strait",
    "Strait of Gibraltar",
    "Bosporus",
    "Malacca Strait",
    1,
  ],
  [
    "q66",
    "Geography",
    "Mount Kilimanjaro is located in which country?",
    "Kenya",
    "Tanzania",
    "Uganda",
    "Ethiopia",
    1,
  ],
  [
    "q67",
    "Geography",
    "Which European country is famous for its fjords?",
    "Norway",
    "Hungary",
    "Portugal",
    "Belgium",
    0,
  ],
  [
    "q68",
    "Geography",
    "Which country has the city of Kyoto?",
    "China",
    "Japan",
    "South Korea",
    "Thailand",
    1,
  ],
  [
    "q69",
    "Geography",
    "Which country is crossed by both the Equator and the Tropic of Capricorn?",
    "Brazil",
    "India",
    "Japan",
    "Norway",
    0,
  ],
  [
    "q70",
    "Geography",
    "Which European capital is situated on the River Tiber?",
    "Athens",
    "Rome",
    "Vienna",
    "Prague",
    1,
  ],
  [
    "q71",
    "Technology",
    "What is the main purpose of a compiler?",
    "Translate source code into another form",
    "Store passwords in a database",
    "Assign IP addresses to devices",
    "Render images on a monitor",
    0,
  ],
  [
    "q72",
    "Technology",
    "Which protocol is commonly used to send outgoing email?",
    "IMAP",
    "POP3",
    "SMTP",
    "DNS",
    2,
  ],
  [
    "q73",
    "Technology",
    "What does SSD stand for in computer storage?",
    "Solid State Drive",
    "System Storage Directory",
    "Secure Software Download",
    "Serial Signal Device",
    0,
  ],
  [
    "q74",
    "Technology",
    "Which data structure follows the Last In, First Out principle?",
    "Queue",
    "Stack",
    "Tree",
    "Graph",
    1,
  ],
  [
    "q75",
    "Technology",
    "What does API stand for in software development?",
    "Application Programming Interface",
    "Automated Program Installation",
    "Applied Processing Instruction",
    "Advanced Peripheral Integration",
    0,
  ],
  [
    "q76",
    "Technology",
    "Which language is primarily used to style web pages?",
    "HTML",
    "CSS",
    "SQL",
    "Bash",
    1,
  ],
  [
    "q77",
    "Technology",
    "What is the primary role of DNS?",
    "Encrypting local files",
    "Translating domain names to IP addresses",
    "Compressing images",
    "Scheduling CPU tasks",
    1,
  ],
  [
    "q78",
    "Technology",
    "Which sorting algorithm repeatedly compares adjacent elements and swaps them when needed?",
    "Merge sort",
    "Bubble sort",
    "Heap sort",
    "Radix sort",
    1,
  ],
  [
    "q79",
    "Technology",
    "In version control, what is a Git commit?",
    "A saved snapshot of changes",
    "A cloud hosting plan",
    "A network cable",
    "A programming language",
    0,
  ],
  [
    "q80",
    "Technology",
    "Which database language is commonly used to query relational tables?",
    "CSS",
    "SQL",
    "XML",
    "Markdown",
    1,
  ],
  [
    "q81",
    "Technology",
    "What does responsive web design aim to do?",
    "Make layouts adapt to different screen sizes",
    "Guarantee faster internet",
    "Replace server-side code",
    "Prevent all security attacks",
    0,
  ],
  [
    "q82",
    "Technology",
    "Which device forwards data between different IP networks?",
    "Keyboard",
    "Router",
    "Microphone",
    "Printer",
    1,
  ],
  [
    "q83",
    "Technology",
    "What is two-factor authentication designed to improve?",
    "Screen resolution",
    "Account security",
    "Battery capacity",
    "Download speed",
    1,
  ],
  [
    "q84",
    "Technology",
    "Which command-line utility is commonly used to transfer data with URLs?",
    "curl",
    "grep",
    "mkdir",
    "chmod",
    0,
  ],
  [
    "q85",
    "Technology",
    "What does open-source software generally mean?",
    "Its source code is available under a license for inspection and use",
    "It never has bugs",
    "It can only run offline",
    "It has no copyright or license",
    0,
  ],
  [
    "q86",
    "General Knowledge",
    "How many degrees are in a right angle?",
    "45",
    "90",
    "180",
    "360",
    1,
  ],
  [
    "q87",
    "General Knowledge",
    "Which language has the most native speakers worldwide?",
    "English",
    "Spanish",
    "Mandarin Chinese",
    "Arabic",
    2,
  ],
  [
    "q88",
    "General Knowledge",
    "What is the currency of Japan?",
    "Won",
    "Yuan",
    "Yen",
    "Ringgit",
    2,
  ],
  [
    "q89",
    "General Knowledge",
    "What is the name of the galaxy that contains our Solar System?",
    "Andromeda",
    "Whirlpool",
    "Milky Way",
    "Sombrero",
    2,
  ],
  [
    "q90",
    "General Knowledge",
    "Which chess piece moves in an L-shaped pattern?",
    "Bishop",
    "Rook",
    "Knight",
    "Queen",
    2,
  ],
  [
    "q91",
    "General Knowledge",
    "Which author wrote the play Romeo and Juliet?",
    "Charles Dickens",
    "William Shakespeare",
    "Jane Austen",
    "Oscar Wilde",
    1,
  ],
  [
    "q92",
    "General Knowledge",
    "What is the largest mammal on Earth?",
    "African elephant",
    "Blue whale",
    "Giraffe",
    "Orca",
    1,
  ],
  [
    "q93",
    "General Knowledge",
    "How many strings does a standard violin have?",
    "Three",
    "Four",
    "Five",
    "Six",
    1,
  ],
  [
    "q94",
    "General Knowledge",
    "Which instrument helps astronomers observe distant celestial objects?",
    "Microscope",
    "Telescope",
    "Periscope",
    "Spectrometer",
    1,
  ],
  [
    "q95",
    "General Knowledge",
    "What is the main ingredient in traditional hummus?",
    "Lentils",
    "Chickpeas",
    "Potatoes",
    "Rice",
    1,
  ],
  [
    "q96",
    "General Knowledge",
    "Which month has 28 days in a common year?",
    "February",
    "April",
    "June",
    "November",
    0,
  ],
  [
    "q97",
    "General Knowledge",
    "What is the name of the fairy in Peter Pan?",
    "Cinderella",
    "Tinker Bell",
    "Wendy",
    "Alice",
    1,
  ],
  [
    "q98",
    "General Knowledge",
    "Which sport uses the terms love, deuce, and ace?",
    "Cricket",
    "Tennis",
    "Rugby",
    "Golf",
    1,
  ],
  [
    "q99",
    "General Knowledge",
    "What is the square root of 144?",
    "10",
    "11",
    "12",
    "14",
    2,
  ],
  [
    "q100",
    "General Knowledge",
    "Which metal is liquid at typical room temperature?",
    "Iron",
    "Mercury",
    "Aluminum",
    "Copper",
    1,
  ],
];

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
    throw new Error(
      "Unable to generate a validated acyclic 4-boost/4-slide board.",
    );
  }

  return fallback;
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

function makePenaltyPlan(player, reason, message) {
  const fromPosition = player.position;
  const finalPosition = Math.max(1, fromPosition - 1);
  const steps =
    fromPosition > 1
      ? [
          {
            type: "penalty",
            from: fromPosition,
            to: finalPosition,
            durationMs: 360,
          },
        ]
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

function nextResolutionTimestamp(room) {
  room.lastResolutionTimestamp = Math.max(
    Date.now(),
    (room.lastResolutionTimestamp || 0) + 1,
  );
  return room.lastResolutionTimestamp;
}

function chooseDistanceWinner(room) {
  return (
    [...room.players.values()].sort(
      (a, b) =>
        b.position - a.position ||
        b.score - a.score ||
        (a.positionReachedAt ?? Number.MAX_SAFE_INTEGER) -
          (b.positionReachedAt ?? Number.MAX_SAFE_INTEGER) ||
        (a.joinedAt ?? Number.MAX_SAFE_INTEGER) -
          (b.joinedAt ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id),
    )[0] || null
  );
}

function toPublicQuestion(question) {
  if (!question) return null;

  return {
    id: question.id,
    category: question.category,
    text: question.text,
    choices: question.choices,
  };
}

function resolveRound(room, options = {}) {
  if (!room || typeof room !== "object" || Array.isArray(room)) {
    throw new TypeError("room must be a plain object.");
  }

  if (room.status !== "playing" || room.roundResolved || room.winner) {
    return {
      resolved: false,
      reason: "round_not_active",
      movement: null,
      stateChanged: false,
    };
  }

  const now = Number.isFinite(options.now) ? options.now : Date.now();

  if (Number.isFinite(Number(room.deadline)) && Number(room.deadline) > now) {
    return {
      resolved: false,
      reason: "deadline_not_expired",
      movement: null,
      stateChanged: false,
    };
  }

  const asArray = (collection) => {
    if (Array.isArray(collection)) return collection;
    if (collection && typeof collection === "object") {
      return Object.values(collection);
    }
    return [];
  };

  const asRecord = (collection) => {
    if (collection instanceof Map) {
      return Object.fromEntries(collection.entries());
    }
    if (Array.isArray(collection)) {
      return Object.fromEntries(
        collection.map((item) => [String(item.playerId ?? item.id), item]),
      );
    }
    return collection && typeof collection === "object" ? collection : {};
  };

  const players = asArray(room.players)
    .filter((player) => player && typeof player.id === "string")
    .sort(
      (a, b) =>
        (Number(a.joinedAt) || Number.MAX_SAFE_INTEGER) -
          (Number(b.joinedAt) || Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id),
    );

  const roundAnswers = asRecord(room.roundAnswers);
  const currentQuestion = room.currentQuestion;

  if (!currentQuestion || !Number.isInteger(currentQuestion.correctIndex)) {
    throw new Error("Cannot resolve a round without a valid current question.");
  }

  room.roundResolved = true;
  room.deadline = null;

  const roundId = room.roundId;
  const correctIndex = currentQuestion.correctIndex;
  const submitted = [];

  for (const player of players) {
    const answer = roundAnswers[player.id];

    if (answer && Number.isInteger(answer.choiceIndex)) {
      submitted.push({
        player,
        choiceIndex: answer.choiceIndex,
        answeredAt: Number.isFinite(Number(answer.answeredAt))
          ? Number(answer.answeredAt)
          : Number.MAX_SAFE_INTEGER,
      });
    }
  }

  submitted.sort(
    (a, b) =>
      a.answeredAt - b.answeredAt ||
      (Number(a.player.joinedAt) || Number.MAX_SAFE_INTEGER) -
        (Number(b.player.joinedAt) || Number.MAX_SAFE_INTEGER) ||
      a.player.id.localeCompare(b.player.id),
  );

  const correctPlayers = [];
  const moves = [];
  const answeredIds = new Set(submitted.map(({ player }) => player.id));

  room.lastRoundResult = {
    roundId,
    correctIndex,
    correctPlayers,
    message: "",
  };

  for (const { player, choiceIndex } of submitted) {
    if (choiceIndex === correctIndex) {
      player.streak = (Number(player.streak) || 0) + 1;
      player.timeoutStreak = 0;

      correctPlayers.push({
        playerId: player.id,
        name: player.name,
        color: player.color,
      });

      const bonusSpace = player.streak >= 3 && player.streak % 3 === 0;
      const movement = applyCorrectAnswer(room, player, bonusSpace);

      if (bonusSpace) {
        movement.plan.toast = {
          type: "fire",
          message: `${player.name} is on fire! 3 Correct Answers in a row! (+1 Bonus Space)`,
        };
      }

      moves.push(movement.plan);

      if (player.position >= 30) {
        room.lastRoundResult.message = `${player.name} reached space 30 and won!`;
        room.lastRoundResult.winnerPlayerId = player.id;
        room.status = "finished";
        room.deadline = null;
        room.countdownEndsAt = null;
        room.currentQuestion = null;
        room.winner = {
          playerId: player.id,
          name: player.name,
          color: player.color,
          byQuestions: false,
          position: player.position,
          score: player.score,
          positionReachedAt: player.positionReachedAt,
        };

        room.lastRoundResult.correctPlayers = correctPlayers;

        return {
          resolved: true,
          reason: "player_reached_finish",
          roundId,
          movement: {
            roomCode: room.code,
            roundId,
            moves,
          },
          stateChanged: true,
        };
      }
    } else {
      player.streak = 0;
      player.timeoutStreak = 0;
      player.score = (Number(player.score) || 0) - 1;

      moves.push(
        makePenaltyPlan(
          player,
          "wrong",
          `${player.name} chose the wrong answer! (-1 Point, -1 Space)`,
        ),
      );
    }
  }

  for (const player of players) {
    if (answeredIds.has(player.id)) continue;

    player.streak = 0;
    player.timeoutStreak = (Number(player.timeoutStreak) || 0) + 1;

    if (player.timeoutStreak >= 2) {
      player.score = (Number(player.score) || 0) - 1;

      moves.push(
        makePenaltyPlan(
          player,
          "timeout",
          `${player.name} missed 2+ questions in a row! (-1 Point, -1 Space)`,
        ),
      );
    }
  }

  room.lastRoundResult.correctPlayers = correctPlayers;
  room.lastRoundResult.message = correctPlayers.length
    ? `${correctPlayers.length} player${correctPlayers.length === 1 ? "" : "s"} got it right this round!`
    : "Time is up! No correct answers this round.";

  room.deckIndex = (Number(room.deckIndex) || 0) + 1;

  if (room.deckIndex >= MATCH_QUESTION_COUNT) {
    const rankedPlayers = [...players].sort(
      (a, b) =>
        (Number(b.position) || 0) - (Number(a.position) || 0) ||
        (Number(b.score) || 0) - (Number(a.score) || 0) ||
        (Number(a.positionReachedAt) || Number.MAX_SAFE_INTEGER) -
          (Number(b.positionReachedAt) || Number.MAX_SAFE_INTEGER) ||
        (Number(a.joinedAt) || Number.MAX_SAFE_INTEGER) -
          (Number(b.joinedAt) || Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id),
    );

    const winner = rankedPlayers[0] || null;

    room.status = "finished";
    room.deadline = null;
    room.countdownEndsAt = null;
    room.currentQuestion = null;
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
      ...room.lastRoundResult,
      message: winner
        ? `${winner.name} wins on distance after all ${MATCH_QUESTION_COUNT} questions!`
        : `All ${MATCH_QUESTION_COUNT} questions have been used. No winner could be selected.`,
      byQuestions: true,
    };
  }

  return {
    resolved: true,
    reason: room.status === "finished" ? "match_finished" : "round_resolved",
    roundId,
    movement: moves.length
      ? {
          roomCode: room.code,
          roundId,
          moves,
        }
      : null,
    stateChanged: true,
  };
}

module.exports = {
  MAX_PLAYERS,
  QUESTION_TIME_MS,
  BETWEEN_ROUNDS_MS,
  COUNTDOWN_MS,
  MATCH_QUESTION_COUNT,
  QUESTION_BANK,

  generateBoardEffects,
  applyCorrectAnswer,
  makePenaltyPlan,
  nextResolutionTimestamp,
  chooseDistanceWinner,
  resolveRound,
  toPublicQuestion,
};
