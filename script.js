/*
 * Starchild Vanguard - club invite
 *
 * Two ways to earn the pass: clear a freshly generated maze, or score at
 * least 5/10 on a short film quiz. Everything runs client side so the site
 * can live on GitHub Pages.
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  const MAZE = {
    rows: 23,
    cols: 17,
    braid: 0.03, // share of dead ends that get opened into loops
    newestBias: 0.88, // growing-tree: higher = longer, twistier corridors
    turnBias: 1.85, // weight for turning vs. carrying straight on
    cellsPerSecond: 13,
    inputBufferMs: 180,
    swipeDistance: 26,
  };

  const QUIZ = {
    length: 10,
    passScore: 5,
  };

  const TRIVIA_API = {
    base: "https://opentdb.com",
    category: 11, // Entertainment: Film
    difficulty: "easy",
    batchSize: 50,
    cacheTarget: 150,
    requestGapMs: 5500, // OpenTDB allows one request per IP every 5 seconds
    timeoutMs: 8000,
  };

  const STORAGE = {
    theme: "sv_theme_v1",
    seenQuestions: "sv_trivia_seen_v2",
    legacySeenQuestions: "sv_trivia_used_v1",
  };

  const THEMES = ["cyan", "purple", "green", "amber"];
  const DEFAULT_THEME = "cyan";
  const SEEN_LIMIT = 2000;
  const TRAIL_LIMIT = 2000;

  // Directions are indexes into WALL and STEP.
  const N = 0;
  const E = 1;
  const S = 2;
  const W = 3;
  const WALL = [1, 2, 4, 8];
  const ALL_WALLS = 15;
  const STEP = [
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
  ];
  const opposite = (dir) => (dir + 2) % 4;

  const KEY_DIRECTIONS = {
    ArrowUp: N,
    KeyW: N,
    ArrowRight: E,
    KeyD: E,
    ArrowDown: S,
    KeyS: S,
    ArrowLeft: W,
    KeyA: W,
  };

  // ---------------------------------------------------------------------------
  // Built-in question bank: [question, correct answer, three wrong answers].
  // Used offline and to top up rounds when the API is slow or unavailable.
  // ---------------------------------------------------------------------------

  const QUESTION_BANK = [
    ["In The Dark Knight, which city does Batman protect?", "Gotham City", "Metropolis", "Star City", "Central City"],
    ["Which film is set on the moon Pandora?", "Avatar", "Dune", "Interstellar", "Prometheus"],
    ["Who directed Inception?", "Christopher Nolan", "Denis Villeneuve", "James Cameron", "David Fincher"],
    ["What is Neo's real name in The Matrix?", "Thomas Anderson", "John Anderton", "Ethan Hunt", "Jason Bourne"],
    ["In The Matrix, which pill does Neo take?", "The red pill", "The blue pill", "The green pill", "The white pill"],
    ["Which film is set on the desert planet Arrakis?", "Dune", "Mad Max: Fury Road", "The Martian", "Star Wars"],
    ["In Dune, what is the precious resource found on Arrakis?", "Spice", "Vibranium", "Unobtanium", "Kyber crystals"],
    ["In Avatar, which mineral are the humans mining?", "Unobtanium", "Vibranium", "Kryptonite", "Adamantium"],
    ["What are the blue natives of Pandora called in Avatar?", "Na'vi", "Fremen", "Ewoks", "Klingons"],
    ["What is the name of the boxy robot in Interstellar?", "TARS", "K-2SO", "WALL-E", "Baymax"],
    ["What is Frodo's surname in The Lord of the Rings?", "Baggins", "Brandybuck", "Took", "Gamgee"],
    ["In The Lord of the Rings, where must the One Ring be destroyed?", "Mount Doom", "Rivendell", "Helm's Deep", "Minas Tirith"],
    ["Which character calls the Ring \"my precious\"?", "Gollum", "Smaug", "Legolas", "Treebeard"],
    ["Who tells Luke \"I am your father\" in The Empire Strikes Back?", "Darth Vader", "Obi-Wan Kenobi", "Yoda", "Emperor Palpatine"],
    ["What weapon do Jedi carry in Star Wars?", "Lightsaber", "Blaster", "Bowcaster", "Vibroblade"],
    ["What is Han Solo's ship called?", "Millennium Falcon", "Enterprise", "Serenity", "Nostromo"],
    ["What species is Chewbacca?", "Wookiee", "Ewok", "Jawa", "Hutt"],
    ["In Alien, what is the name of the crew's ship?", "Nostromo", "Enterprise", "Discovery", "Serenity"],
    ["Who directed Pulp Fiction?", "Quentin Tarantino", "Martin Scorsese", "Guy Ritchie", "Paul Thomas Anderson"],
    ["What is Maximus's rank at the start of Gladiator?", "General", "Senator", "Centurion", "Consul"],
    ["In Gladiator, in which empire is the story set?", "The Roman Empire", "The Ottoman Empire", "The Mongol Empire", "The Persian Empire"],
    ["Which Pixar film follows a rat who dreams of cooking in Paris?", "Ratatouille", "Up", "Luca", "Coco"],
    ["What is the name of the rat chef in Ratatouille?", "Remy", "Emile", "Linguini", "Gusteau"],
    ["Which Spider-Man villain fights with four mechanical arms?", "Doctor Octopus", "Green Goblin", "Sandman", "Electro"],
    ["What is Spider-Man's real name in the original trilogy?", "Peter Parker", "Bruce Banner", "Wade Wilson", "Clark Kent"],
    ["What did John Wick do for a living before he retired?", "He was a hitman", "He was a detective", "He was a boxer", "He was a pilot"],
    ["Which film made the line \"I'll be back\" famous?", "The Terminator", "Predator", "RoboCop", "Total Recall"],
    ["What was Andy Dufresne's job before prison in The Shawshank Redemption?", "Banker", "Lawyer", "Doctor", "Teacher"],
    ["What is the first rule of Fight Club?", "You do not talk about Fight Club", "Always fight fair", "No one fights alone", "The winner buys the drinks"],
    ["What is the name of Captain Jack Sparrow's ship?", "The Black Pearl", "The Flying Dutchman", "Queen Anne's Revenge", "The Jolly Roger"],
    ["What is the hidden African nation in Black Panther?", "Wakanda", "Genovia", "Zamunda", "Sokovia"],
    ["What is the name of Thor's hammer?", "Mjolnir", "Gungnir", "Excalibur", "Anduril"],
    ["What is Captain America's shield mainly made of?", "Vibranium", "Adamantium", "Titanium", "Uru"],
    ["What powers the arc reactor Tony Stark builds in the first Iron Man?", "A palladium core", "A vibranium core", "The Tesseract", "A kyber crystal"],
    ["Which superhero is Tony Stark?", "Iron Man", "War Machine", "Ant-Man", "Vision"],
    ["What is the name of the raccoon in Guardians of the Galaxy?", "Rocket", "Groot", "Drax", "Yondu"],
    ["In Avengers: Infinity War, how many Infinity Stones are there?", "Six", "Five", "Seven", "Nine"],
    ["Which villain snaps his fingers in Avengers: Infinity War?", "Thanos", "Loki", "Ultron", "Red Skull"],
    ["In Avengers: Endgame, how do the heroes travel back in time?", "Through the quantum realm", "With a DeLorean", "Using a TARDIS", "Through a wormhole"],
    ["What does Bruce Banner turn into when he gets angry?", "The Hulk", "The Thing", "Venom", "Groot"],
    ["What is Superman's home planet?", "Krypton", "Vulcan", "Tatooine", "Pandora"],
    ["What is Maverick's real name in Top Gun?", "Pete Mitchell", "Nick Bradshaw", "Tom Kazansky", "Jake Seresin"],
    ["Which agency does Ethan Hunt work for in Mission: Impossible?", "IMF", "MI6", "CIA", "S.H.I.E.L.D."],
    ["What is James Bond's code number?", "007", "006", "009", "001"],
    ["How does James Bond like his martini?", "Shaken, not stirred", "Stirred, not shaken", "On the rocks", "With a twist of lime"],
    ["Who volunteers as tribute in The Hunger Games?", "Katniss Everdeen", "Tris Prior", "Hermione Granger", "Bella Swan"],
    ["What is the vampire family's surname in Twilight?", "Cullen", "Volturi", "Salvatore", "Black"],
    ["In Mad Max: Fury Road, what is Furiosa's truck called?", "The War Rig", "The Interceptor", "The Gigahorse", "The Doof Wagon"],
    ["In The Prestige, the two rivals are both...", "Magicians", "Boxers", "Pilots", "Surgeons"],
    ["What is the snowman called in Frozen?", "Olaf", "Sven", "Kristoff", "Marshmallow"],
    ["Who is Anna's sister in Frozen?", "Elsa", "Rapunzel", "Merida", "Ariel"],
    ["Which film follows an ogre who lives in a swamp?", "Shrek", "Monsters, Inc.", "Trolls", "Hotel Transylvania"],
    ["What is the cowboy doll called in Toy Story?", "Woody", "Buzz", "Hamm", "Rex"],
    ["Which Toy Story character says \"To infinity and beyond!\"?", "Buzz Lightyear", "Woody", "Rex", "Jessie"],
    ["In the first Toy Story, what is the name of the boy who owns the toys?", "Andy", "Sid", "Bonnie", "Max"],
    ["What kind of fish is Nemo?", "Clownfish", "Blue tang", "Pufferfish", "Goldfish"],
    ["What is the name of Nemo's father?", "Marlin", "Gill", "Bruce", "Crush"],
    ["Who is Simba's father in The Lion King?", "Mufasa", "Scar", "Rafiki", "Zazu"],
    ["What does \"Hakuna Matata\" mean in The Lion King?", "No worries", "Long live the king", "Welcome home", "Be brave"],
    ["What is the name of the rooster in Moana?", "Heihei", "Pua", "Pascal", "Abu"],
    ["What is Jasmine's tiger called in Aladdin?", "Rajah", "Abu", "Iago", "Shere Khan"],
    ["In Beauty and the Beast, what kind of object is Lumiere?", "A candelabra", "A clock", "A teapot", "A wardrobe"],
    ["What is the name of Ariel's crab friend in The Little Mermaid?", "Sebastian", "Flounder", "Scuttle", "Sheldon"],
    ["What does Sulley call the little girl in Monsters, Inc.?", "Boo", "Lulu", "Mimi", "Dot"],
    ["What lifts Carl's house into the sky in Up?", "Balloons", "A rocket", "A tornado", "A giant bird"],
    ["What is the talking dog called in Up?", "Dug", "Kevin", "Russell", "Bolt"],
    ["What is Lightning McQueen's racing number in Cars?", "95", "43", "86", "12"],
    ["In Coco, what does Miguel dream of becoming?", "A musician", "A chef", "A footballer", "A painter"],
    ["In Inside Out, which emotion is blue?", "Sadness", "Fear", "Joy", "Disgust"],
    ["What is the family's surname in The Incredibles?", "Parr", "Parker", "Kent", "Wayne"],
    ["What is the name of the robot WALL-E falls for?", "EVE", "AUTO", "M-O", "BB-8"],
    ["What kind of animal is Judy Hopps in Zootopia?", "A rabbit", "A fox", "A sloth", "A sheep"],
    ["What kind of animal is Alex in Madagascar?", "A lion", "A zebra", "A hippo", "A giraffe"],
    ["In Kung Fu Panda, which title is Po given?", "The Dragon Warrior", "The Tiger Master", "The Jade Emperor", "The Shadow Warrior"],
    ["What are Gru's little yellow helpers called?", "Minions", "Smurfs", "Oompa-Loompas", "Gremlins"],
    ["What is Hiccup's dragon called in How to Train Your Dragon?", "Toothless", "Stormfly", "Hookfang", "Smaug"],
    ["What is the family's surname in Encanto?", "Madrigal", "Rivera", "Parr", "Pelekai"],
    ["What sport is played on broomsticks in Harry Potter?", "Quidditch", "Gobstones", "Wizard's chess", "Exploding Snap"],
    ["What is the name of Harry Potter's owl?", "Hedwig", "Errol", "Crookshanks", "Scabbers"],
    ["Which house is Harry Potter sorted into?", "Gryffindor", "Slytherin", "Ravenclaw", "Hufflepuff"],
    ["What shape is the scar on Harry Potter's forehead?", "A lightning bolt", "A star", "A crescent moon", "A cross"],
    ["Which animals are brought back to life in Jurassic Park?", "Dinosaurs", "Mammoths", "Dragons", "Sabre-toothed cats"],
    ["On which island is Jurassic Park built?", "Isla Nublar", "Skull Island", "Amity Island", "Craggy Island"],
    ["What kind of animal terrorizes Amity Island in Jaws?", "A great white shark", "A killer whale", "A giant squid", "A crocodile"],
    ["What kind of animal is King Kong?", "A giant gorilla", "A giant lizard", "A giant bear", "A giant wolf"],
    ["Which car becomes a time machine in Back to the Future?", "DeLorean", "Ford Mustang", "Chevrolet Camaro", "Volkswagen Beetle"],
    ["How fast must the time machine go in Back to the Future?", "88 mph", "66 mph", "99 mph", "121 mph"],
    ["What does E.T. famously want to do?", "Phone home", "Go to school", "Find his dog", "Build a rocket"],
    ["In E.T., how do Elliott and E.T. escape the police?", "On flying bicycles", "In a flying car", "By hot-air balloon", "On hoverboards"],
    ["What is Kevin's surname in Home Alone?", "McCallister", "McFly", "McClane", "McGregor"],
    ["What color is the road Dorothy follows in The Wizard of Oz?", "Yellow", "Red", "Silver", "Green"],
    ["In The Wizard of Oz, what does the Scarecrow want?", "A brain", "A heart", "Courage", "A way home"],
    ["What is Cinderella's lost slipper made of?", "Glass", "Gold", "Silk", "Silver"],
    ["How many dwarfs does Snow White meet?", "Seven", "Five", "Six", "Nine"],
    ["What is the name of the hotel in The Shining?", "The Overlook Hotel", "The Bates Motel", "The Grand Budapest Hotel", "Hotel Transylvania"],
    ["On which planet is Mark Watney stranded in The Martian?", "Mars", "Venus", "Mercury", "Jupiter"],
    ["What sport is Rocky about?", "Boxing", "Wrestling", "Karate", "Basketball"],
    ["In The Karate Kid, which chore secretly trains Daniel?", "Waxing cars", "Washing dishes", "Mowing the lawn", "Chopping wood"],
    ["What does the Titanic hit on its maiden voyage?", "An iceberg", "A reef", "Another ship", "A whale"],
    ["What is Indiana Jones afraid of?", "Snakes", "Spiders", "Heights", "Rats"],
    ["What is Indiana Jones's profession?", "Archaeologist", "Astronaut", "Detective", "Journalist"],
    ["Who leads the Autobots in Transformers?", "Optimus Prime", "Megatron", "Bumblebee", "Starscream"],
    ["Which rule must the Ghostbusters never break?", "Never cross the streams", "Never say its name", "Never look back", "Never split up"],
    ["In Gremlins, when must you never feed a Mogwai?", "After midnight", "Before sunrise", "At noon", "On a full moon"],
    ["In the original 1995 Jumanji, what is Jumanji?", "A board game", "A video game", "A card game", "A pinball machine"],
    ["What does Charlie find in his chocolate bar in Charlie and the Chocolate Factory?", "A golden ticket", "A silver coin", "A treasure map", "A secret recipe"],
    ["How does Mary Poppins arrive at the Banks house?", "Floating down with an umbrella", "On a broomstick", "On a flying carpet", "In a hot-air balloon"],
    ["Which family sings together in The Sound of Music?", "The von Trapps", "The Partridges", "The Addams", "The Banks"],
    ["In Forrest Gump, life is like a box of...", "Chocolates", "Crayons", "Cereal", "Surprises"],
    ["What is the family's surname in The Godfather?", "Corleone", "Soprano", "Montana", "Rizzo"],
    ["In Mean Girls, what color do they wear on Wednesdays?", "Pink", "Black", "White", "Blue"],
  ].map(([question, answer, ...wrong]) => ({ id: questionId(question), question, answer, wrong }));

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  const ui = {
    app: $("app"),
    themebar: $("themebar"),
    swatches: [...document.querySelectorAll(".swatch")],
    screens: {
      welcome: $("screenWelcome"),
      maze: $("screenMaze"),
      quiz: $("screenQuiz"),
      win: $("screenWin"),
    },

    startMazeBtn: $("startMazeBtn"),
    startQuizBtn: $("startQuizBtn"),
    playAgainBtn: $("playAgainBtn"),

    canvas: $("mazeCanvas"),
    mazeMoves: $("mazeMoves"),
    mazeTime: $("mazeTime"),
    newMazeBtn: $("newMazeBtn"),
    homeFromMazeBtn: $("homeFromMazeBtn"),
    pads: [
      [$("btnUp"), N],
      [$("btnRight"), E],
      [$("btnDown"), S],
      [$("btnLeft"), W],
    ],

    quizCount: $("quizCount"),
    quizBar: $("quizBar"),
    quizQuestion: $("quizQuestion"),
    quizChoices: $("quizChoices"),
    quizNote: $("quizNote"),
    quizNextBtn: $("quizNextBtn"),
    homeFromQuizBtn: $("homeFromQuizBtn"),

    passMode: $("passMode"),
    passResult: $("passResult"),
    passIssued: $("passIssued"),

    modal: $("modal"),
    modalBackdrop: $("modalBackdrop"),
    modalTitle: $("modalTitle"),
    modalText: $("modalText"),
    modalActionBtn: $("modalActionBtn"),
  };

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function questionId(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  // localStorage can throw (private mode, blocked cookies, full quota).
  // Losing a preference is fine; crashing the page is not.
  const storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* not critical */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* not critical */
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

  let currentScreen = "welcome";

  function showScreen(name) {
    const previous = currentScreen;
    currentScreen = name;
    document.body.dataset.screen = name;

    for (const [key, el] of Object.entries(ui.screens)) {
      el.classList.toggle("screen--active", key === name);
    }

    if (previous === "maze" && name !== "maze") stopMazeLoop();

    // Move focus into the new screen so keyboard and screen reader users
    // are not left on a button that just disappeared.
    ui.screens[name].focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------

  const modal = {
    onAction: null,
    dismissible: false,
    returnFocus: null,

    get isOpen() {
      return !ui.modal.hidden;
    },

    open({ title, text, actionLabel = "Continue", dismissible = false, onAction = null }) {
      this.onAction = onAction;
      this.dismissible = dismissible;
      this.returnFocus = document.activeElement;

      ui.modalTitle.textContent = title;
      ui.modalText.textContent = text;
      ui.modalActionBtn.textContent = actionLabel;

      ui.modal.hidden = false;
      ui.app.inert = true;
      ui.themebar.inert = true;
      document.body.dataset.modal = "open";

      releaseMazeInput();
      ui.modalActionBtn.focus({ preventScroll: true });
    },

    close() {
      if (!this.isOpen) return;
      ui.modal.hidden = true;
      ui.app.inert = false;
      ui.themebar.inert = false;
      delete document.body.dataset.modal;

      const target = this.returnFocus;
      this.returnFocus = null;
      this.onAction = null;
      if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
    },

    confirm() {
      const action = this.onAction;
      this.close();
      action?.();
    },

    handleKey(event) {
      if (event.key === "Escape" && this.dismissible) {
        event.preventDefault();
        this.close();
      } else if (event.key === "Tab") {
        // There is only one control in the dialog, so keep focus on it.
        event.preventDefault();
        ui.modalActionBtn.focus();
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Maze generation
  // ---------------------------------------------------------------------------

  const inBounds = (rows, cols, r, c) => r >= 0 && c >= 0 && r < rows && c < cols;
  const isOpenIn = (grid, r, c, dir) => (grid[r][c] & WALL[dir]) === 0;

  function openWall(grid, r, c, dir) {
    const { dr, dc } = STEP[dir];
    grid[r][c] &= ~WALL[dir];
    grid[r + dr][c + dc] &= ~WALL[opposite(dir)];
  }

  function countOpenings(grid, r, c) {
    let count = 0;
    for (let dir = 0; dir < 4; dir++) if (isOpenIn(grid, r, c, dir)) count++;
    return count;
  }

  /**
   * Growing-tree maze. Picking the newest cell most of the time gives the long,
   * winding corridors of a depth-first maze; picking a random cell now and then
   * breaks those up with extra branches. The result is a perfect maze, which is
   * then lightly braided so a few dead ends become loops.
   */
  function generateMaze(rows, cols, { braid, newestBias, turnBias }) {
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(ALL_WALLS));
    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
    const active = [{ r: 0, c: 0, cameFrom: null }];
    visited[0][0] = true;

    while (active.length) {
      const index = Math.random() < newestBias ? active.length - 1 : Math.floor(Math.random() * active.length);
      const cell = active[index];

      const options = [];
      let totalWeight = 0;
      for (let dir = 0; dir < 4; dir++) {
        const r = cell.r + STEP[dir].dr;
        const c = cell.c + STEP[dir].dc;
        if (!inBounds(rows, cols, r, c) || visited[r][c]) continue;
        const weight = cell.cameFrom === null || dir === cell.cameFrom ? 1 : turnBias;
        options.push({ dir, weight });
        totalWeight += weight;
      }

      if (!options.length) {
        active[index] = active[active.length - 1];
        active.pop();
        continue;
      }

      let roll = Math.random() * totalWeight;
      let choice = options[options.length - 1];
      for (const option of options) {
        roll -= option.weight;
        if (roll <= 0) {
          choice = option;
          break;
        }
      }

      openWall(grid, cell.r, cell.c, choice.dir);
      const r = cell.r + STEP[choice.dir].dr;
      const c = cell.c + STEP[choice.dir].dc;
      visited[r][c] = true;
      active.push({ r, c, cameFrom: choice.dir });
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (countOpenings(grid, r, c) !== 1 || Math.random() > braid) continue;
        const closed = [];
        for (let dir = 0; dir < 4; dir++) {
          if (inBounds(rows, cols, r + STEP[dir].dr, c + STEP[dir].dc) && !isOpenIn(grid, r, c, dir)) {
            closed.push(dir);
          }
        }
        if (closed.length) openWall(grid, r, c, closed[Math.floor(Math.random() * closed.length)]);
      }
    }

    return grid;
  }

  /** Breadth-first search from the start; the farthest cell becomes the exit. */
  function findFarthestCell(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const distance = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    const queue = [{ r: 0, c: 0 }];
    distance[0][0] = 0;
    let farthest = queue[0];

    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      if (distance[cell.r][cell.c] > distance[farthest.r][farthest.c]) farthest = cell;

      for (let dir = 0; dir < 4; dir++) {
        if (!isOpenIn(grid, cell.r, cell.c, dir)) continue;
        const r = cell.r + STEP[dir].dr;
        const c = cell.c + STEP[dir].dc;
        if (!inBounds(rows, cols, r, c) || distance[r][c] !== -1) continue;
        distance[r][c] = distance[cell.r][cell.c] + 1;
        queue.push({ r, c });
      }
    }

    return farthest;
  }

  // ---------------------------------------------------------------------------
  // Maze game
  // ---------------------------------------------------------------------------

  const maze = {
    grid: null,
    rows: MAZE.rows,
    cols: MAZE.cols,
    exit: { r: 0, c: 0 },
    // The player glides from (fromR, fromC) to (r, c); progress runs 0 -> 1.
    player: { r: 0, c: 0, fromR: 0, fromC: 0, progress: 1 },
    trail: [],
    moves: 0,
    startedAt: 0,
    finishedIn: 0,
    solved: false,

    heldKeys: [], // key codes, most recent last
    pointerDir: null,
    pointerId: null,
    runDir: null, // set by swipes: keep going until the corridor ends
    bufferedDir: null,
    bufferedUntil: 0,

    metrics: { dpr: 1, cell: 0, x0: 0, y0: 0 },
    colors: null,
    staticLayer: null,
    staticDirty: true,
    needsDraw: true,
    raf: 0,
    lastFrame: 0,
    hud: { moves: -1, time: "" },
  };

  const isMoving = () => maze.player.progress < 1;
  const canOpen = (r, c, dir) => isOpenIn(maze.grid, r, c, dir);

  /** True when the cell is a plain corridor running along `dir` (no side exits). */
  function isStraightCorridor(r, c, dir) {
    return canOpen(r, c, dir) && canOpen(r, c, opposite(dir)) && countOpenings(maze.grid, r, c) === 2;
  }

  function heldDirection() {
    if (maze.pointerDir !== null) return maze.pointerDir;
    const last = maze.heldKeys[maze.heldKeys.length - 1];
    return last === undefined ? null : KEY_DIRECTIONS[last];
  }

  function releaseMazeInput() {
    maze.heldKeys.length = 0;
    maze.runDir = null;
    maze.bufferedDir = null;
    releasePad();
  }

  function releasePad() {
    maze.pointerDir = null;
    maze.pointerId = null;
    for (const [el] of ui.pads) el.classList.remove("is-pressed");
  }

  function startMaze() {
    maze.grid = generateMaze(maze.rows, maze.cols, MAZE);
    maze.exit = findFarthestCell(maze.grid);
    maze.player = { r: 0, c: 0, fromR: 0, fromC: 0, progress: 1 };
    maze.trail = [{ r: 0, c: 0 }];
    maze.moves = 0;
    maze.startedAt = 0;
    maze.finishedIn = 0;
    maze.solved = false;
    maze.staticDirty = true;
    maze.needsDraw = true;
    releaseMazeInput();

    showScreen("maze");
    resizeCanvas();
    updateHud();
    startMazeLoop();
  }

  function canAcceptInput() {
    return currentScreen === "maze" && maze.grid && !maze.solved && !modal.isOpen;
  }

  function tryStep(dir) {
    if (!canAcceptInput() || isMoving()) return false;
    const p = maze.player;
    if (!canOpen(p.r, p.c, dir)) return false;

    p.fromR = p.r;
    p.fromC = p.c;
    p.r += STEP[dir].dr;
    p.c += STEP[dir].dc;
    p.progress = 0;

    maze.moves++;
    if (!maze.startedAt) maze.startedAt = performance.now();
    return true;
  }

  /** A fresh press from the keyboard, the d-pad or a swipe. */
  function pressDirection(dir) {
    if (!canAcceptInput()) return;
    maze.runDir = null;

    if (isMoving()) {
      // Remember it briefly so turns chain smoothly off the current step.
      maze.bufferedDir = dir;
      maze.bufferedUntil = performance.now() + MAZE.inputBufferMs;
    } else {
      tryStep(dir);
    }
    startMazeLoop();
  }

  function swipeDirection(dir) {
    pressDirection(dir);
    if (canAcceptInput()) maze.runDir = dir;
  }

  function onArrive() {
    const p = maze.player;
    maze.trail.push({ r: p.r, c: p.c });
    if (maze.trail.length > TRAIL_LIMIT) maze.trail.splice(0, maze.trail.length - TRAIL_LIMIT);

    if (p.r === maze.exit.r && p.c === maze.exit.c) finishMaze();
  }

  /** Called whenever the player is standing still: decide whether to move on. */
  function continueMovement() {
    const p = maze.player;

    if (maze.bufferedDir !== null) {
      const dir = maze.bufferedDir;
      maze.bufferedDir = null;
      if (performance.now() <= maze.bufferedUntil && tryStep(dir)) return;
    }

    // Holding a direction keeps you going through straight corridors, then
    // stops at the next corner or junction so you never overshoot a turn.
    const held = heldDirection();
    if (held !== null) {
      if (isStraightCorridor(p.r, p.c, held)) tryStep(held);
      return;
    }

    if (maze.runDir !== null) {
      if (isStraightCorridor(p.r, p.c, maze.runDir)) tryStep(maze.runDir);
      else maze.runDir = null;
    }
  }

  function finishMaze() {
    maze.solved = true;
    maze.finishedIn = performance.now() - maze.startedAt;
    releaseMazeInput();
    updateHud();

    const grid = maze.grid;
    const time = formatDuration(maze.finishedIn);
    const moves = maze.moves;

    // Short pause so the dot visibly lands on the exit before the dialog.
    setTimeout(() => {
      if (currentScreen !== "maze" || maze.grid !== grid) return;
      modal.open({
        title: "Maze cleared",
        text: `${time} and ${moves} moves. Your pass is on the next screen. Screenshot it to claim your stickers.`,
        actionLabel: "Show pass",
        onAction: () => showPass("Maze", `${time} · ${moves} moves`),
      });
    }, 280);
  }

  function updateHud() {
    if (maze.hud.moves !== maze.moves) {
      maze.hud.moves = maze.moves;
      ui.mazeMoves.textContent = String(maze.moves);
    }

    let elapsed = 0;
    if (maze.solved) elapsed = maze.finishedIn;
    else if (maze.startedAt) elapsed = performance.now() - maze.startedAt;

    const time = formatDuration(elapsed);
    if (maze.hud.time !== time) {
      maze.hud.time = time;
      ui.mazeTime.textContent = time;
    }
  }

  function startMazeLoop() {
    if (maze.raf || currentScreen !== "maze") return;
    maze.lastFrame = performance.now();
    maze.raf = requestAnimationFrame(mazeFrame);
  }

  function stopMazeLoop() {
    cancelAnimationFrame(maze.raf);
    maze.raf = 0;
    releaseMazeInput();
  }

  function mazeFrame(now) {
    maze.raf = 0;
    if (currentScreen !== "maze" || !maze.grid) return;

    // Clamp so a background tab does not teleport the player on return.
    const dt = Math.min(Math.max(now - maze.lastFrame, 0), 50);
    maze.lastFrame = now;

    const p = maze.player;
    if (isMoving()) {
      p.progress = Math.min(1, p.progress + (dt * MAZE.cellsPerSecond) / 1000);
      maze.needsDraw = true;
      if (!isMoving()) onArrive();
    }
    if (!isMoving() && !maze.solved) continueMovement();

    updateHud();
    if (maze.needsDraw || isMoving()) drawMaze();

    const timerRunning = maze.startedAt && !maze.solved;
    const busy = isMoving() || maze.bufferedDir !== null || heldDirection() !== null || maze.runDir !== null;
    if (busy || timerRunning) maze.raf = requestAnimationFrame(mazeFrame);
  }

  // ---------------------------------------------------------------------------
  // Maze rendering
  // ---------------------------------------------------------------------------

  function readThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    return {
      primary: read("--primary-rgb", "25, 216, 246"),
      primary2: read("--primary-2-rgb", "103, 236, 255"),
      success: read("--success-rgb", "55, 240, 177"),
    };
  }

  const rgba = (rgb, alpha) => `rgba(${rgb}, ${alpha})`;

  function resizeCanvas() {
    const canvas = ui.canvas;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return;

    // Capped at 2x: sharper than that is invisible on a phone and costs memory.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);
    const sizeChanged = width !== canvas.width || height !== canvas.height;

    if (sizeChanged) {
      canvas.width = width;
      canvas.height = height;
    }

    const inset = Math.round(10 * dpr);
    const cell = Math.max(4, Math.floor(Math.min((width - inset * 2) / maze.cols, (height - inset * 2) / maze.rows)));
    maze.metrics = {
      dpr,
      cell,
      x0: Math.floor((width - cell * maze.cols) / 2),
      y0: Math.floor((height - cell * maze.rows) / 2),
    };

    maze.staticDirty = true;
    // Resizing clears the canvas, so repaint right away instead of flashing blank.
    if (maze.grid && currentScreen === "maze") drawMaze();
  }

  const cellX = (c) => maze.metrics.x0 + (c + 0.5) * maze.metrics.cell;
  const cellY = (r) => maze.metrics.y0 + (r + 0.5) * maze.metrics.cell;

  function traceWalls(ctx) {
    const { cell, x0, y0 } = maze.metrics;
    const lastRow = maze.rows - 1;
    const lastCol = maze.cols - 1;

    ctx.beginPath();
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        const walls = maze.grid[r][c];
        const x = x0 + c * cell;
        const y = y0 + r * cell;
        if (walls & WALL[N]) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + cell, y);
        }
        if (walls & WALL[W]) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + cell);
        }
        if (r === lastRow && walls & WALL[S]) {
          ctx.moveTo(x, y + cell);
          ctx.lineTo(x + cell, y + cell);
        }
        if (c === lastCol && walls & WALL[E]) {
          ctx.moveTo(x + cell, y);
          ctx.lineTo(x + cell, y + cell);
        }
      }
    }
  }

  function buildStaticLayer() {
    const { width, height } = ui.canvas;
    const layer = maze.staticLayer || document.createElement("canvas");
    if (layer.width !== width || layer.height !== height) {
      layer.width = width;
      layer.height = height;
    }

    const ctx = layer.getContext("2d");
    const { dpr, cell } = maze.metrics;
    const colors = readThemeColors();
    const wall = 2 * Math.round(1.2 * dpr);

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Soft glow underneath, then the crisp wall on top.
    ctx.save();
    ctx.strokeStyle = rgba(colors.primary, 0.22);
    ctx.lineWidth = wall + 4;
    ctx.shadowBlur = 14 * dpr;
    ctx.shadowColor = rgba(colors.primary, 0.18);
    traceWalls(ctx);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = rgba(colors.primary2, 0.95);
    ctx.lineWidth = wall;
    traceWalls(ctx);
    ctx.stroke();

    // Start and exit markers.
    ctx.lineWidth = Math.max(1, Math.round(1.5 * dpr));
    ctx.strokeStyle = rgba(colors.primary2, 0.28);
    ctx.beginPath();
    ctx.arc(cellX(0), cellY(0), cell * 0.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2 * dpr;
    ctx.fillStyle = rgba(colors.success, 0.18);
    ctx.strokeStyle = rgba(colors.success, 0.75);
    ctx.beginPath();
    ctx.arc(cellX(maze.exit.c), cellY(maze.exit.r), cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    maze.staticLayer = layer;
    maze.colors = colors;
    maze.staticDirty = false;
  }

  function playerPosition() {
    const p = maze.player;
    const t = p.progress;
    return {
      x: cellX(p.fromC + (p.c - p.fromC) * t),
      y: cellY(p.fromR + (p.r - p.fromR) * t),
    };
  }

  function drawMaze() {
    const canvas = ui.canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx || !maze.grid || !maze.metrics.cell) return;

    if (maze.staticDirty) buildStaticLayer();
    maze.needsDraw = false;

    const { dpr, cell } = maze.metrics;
    const colors = maze.colors;
    const pos = playerPosition();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(maze.staticLayer, 0, 0);

    // Trail: every cell visited, plus the segment currently being travelled.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(colors.primary, 0.38);
    ctx.lineWidth = clamp(Math.round(2.2 * dpr), 2, 4);
    ctx.beginPath();
    ctx.moveTo(cellX(maze.trail[0].c), cellY(maze.trail[0].r));
    for (let i = 1; i < maze.trail.length; i++) {
      ctx.lineTo(cellX(maze.trail[i].c), cellY(maze.trail[i].r));
    }
    if (isMoving()) ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.restore();

    // Player dot. At rest it snaps to whole pixels so it looks sharp.
    const radius = clamp(Math.round(cell * 0.22), 3, Math.max(4, Math.floor(cell / 2) - 1));
    const x = isMoving() ? pos.x : Math.round(pos.x);
    const y = isMoving() ? pos.y : Math.round(pos.y);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = rgba(colors.primary, 0.3);
    ctx.lineWidth = clamp(dpr, 1, 3);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // Maze input
  // ---------------------------------------------------------------------------

  function bindMazeControls() {
    for (const [el, dir] of ui.pads) {
      el.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        try {
          el.setPointerCapture(event.pointerId);
        } catch {
          /* capture is a nice-to-have */
        }
        releasePad();
        maze.pointerDir = dir;
        maze.pointerId = event.pointerId;
        el.classList.add("is-pressed");
        pressDirection(dir);
      });

      const release = (event) => {
        if (event.pointerId === maze.pointerId) releasePad();
      };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("lostpointercapture", release);

      // Enter / Space on a focused arrow (detail is 0 for keyboard clicks).
      el.addEventListener("click", (event) => {
        if (event.detail === 0) pressDirection(dir);
      });

      el.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    // Drag anywhere on the maze screen to steer. Each time the finger travels
    // far enough, that counts as a swipe and the anchor moves with it, so one
    // continuous drag can take several turns.
    const section = ui.screens.maze;
    let swipe = null;

    section.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest("button, a")) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });

    section.addEventListener("pointermove", (event) => {
      if (!swipe || event.pointerId !== swipe.id) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < MAZE.swipeDistance) return;
      if (Math.min(ax, ay) > Math.max(ax, ay) * 0.75) return; // too diagonal to call

      swipeDirection(ax > ay ? (dx > 0 ? E : W) : dy > 0 ? S : N);
      swipe.x = event.clientX;
      swipe.y = event.clientY;
    });

    const endSwipe = (event) => {
      if (swipe && event.pointerId === swipe.id) swipe = null;
    };
    section.addEventListener("pointerup", endSwipe);
    section.addEventListener("pointercancel", endSwipe);

    new ResizeObserver(() => resizeCanvas()).observe(ui.canvas);
  }

  function handleMazeKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.code === "KeyN" && !event.repeat) {
      startMaze();
      return;
    }

    const dir = KEY_DIRECTIONS[event.code];
    if (dir === undefined) return;
    event.preventDefault();
    if (event.repeat) return;

    const held = maze.heldKeys;
    const existing = held.indexOf(event.code);
    if (existing !== -1) held.splice(existing, 1);
    held.push(event.code);
    pressDirection(dir);
  }

  function handleKeyUp(event) {
    const index = maze.heldKeys.indexOf(event.code);
    if (index !== -1) maze.heldKeys.splice(index, 1);
  }

  // ---------------------------------------------------------------------------
  // Trivia source (Open Trivia DB, with the built-in bank as backup)
  // ---------------------------------------------------------------------------

  const NICHE_PATTERNS = [
    /\b(actor|actress|cast|portray(s|ed)?|played by|plays|played|voiced?|voice actor)\b/i,
    /\b(direct(or|ed)|composer|composed|screenplay|release[ds]?|year|academy award|oscars?|box office|budget|imdb|episode|roman numeral)\b/i,
  ];

  function isGoodFit(item) {
    if (item.question.length > 100) return false;
    if (![item.answer, ...item.wrong].every((text) => text.length <= 40)) return false;
    if (NICHE_PATTERNS.some((pattern) => pattern.test(item.question))) return false;
    return /\b(which|who|what)\b/i.test(item.question);
  }

  const entityParser = new DOMParser();
  function decodeEntities(text) {
    return entityParser.parseFromString(text, "text/html").documentElement.textContent.trim();
  }

  function fromApi(raw) {
    const question = decodeEntities(raw.question);
    return {
      id: questionId(question),
      question,
      answer: decodeEntities(raw.correct_answer),
      wrong: raw.incorrect_answers.map(decodeEntities),
    };
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRIVIA_API.timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const trivia = {
    cache: [],
    token: null,
    exhausted: false,
    pending: null,

    /** Top up the cache in the background. Safe to call as often as you like. */
    fill() {
      if (this.pending || this.exhausted || this.cache.length >= TRIVIA_API.cacheTarget) return;
      if (navigator.onLine === false) return;
      this.pending = this.fillLoop()
        .catch(() => {
          /* offline or API down: the built-in bank covers it */
        })
        .finally(() => {
          this.pending = null;
        });
    },

    async fillLoop() {
      let amount = TRIVIA_API.batchSize;

      while (this.cache.length < TRIVIA_API.cacheTarget && !this.exhausted) {
        if (!this.token) {
          const session = await fetchJson(`${TRIVIA_API.base}/api_token.php?command=request`);
          this.token = session.response_code === 0 ? session.token : null;
          await sleep(TRIVIA_API.requestGapMs);
        }

        const params = new URLSearchParams({
          amount: String(amount),
          category: String(TRIVIA_API.category),
          difficulty: TRIVIA_API.difficulty,
          type: "multiple",
        });
        if (this.token) params.set("token", this.token);

        const data = await fetchJson(`${TRIVIA_API.base}/api.php?${params}`);
        switch (data.response_code) {
          case 0:
            this.add(data.results.map(fromApi));
            break;
          case 1: // fewer questions left than requested
            if (amount > 10) amount = 10;
            else this.exhausted = true;
            break;
          case 3: // token expired
            this.token = null;
            break;
          case 5: // rate limited, the pause below is enough
            break;
          default: // 2 = bad request, 4 = every question already served
            this.exhausted = true;
        }

        await sleep(TRIVIA_API.requestGapMs);
      }
    },

    add(items) {
      const seen = loadSeenQuestions();
      const known = new Set([...this.cache, ...QUESTION_BANK].map((q) => q.id));
      for (const item of items) {
        if (!isGoodFit(item) || seen.has(item.id) || known.has(item.id)) continue;
        known.add(item.id);
        this.cache.push(item);
      }
    },
  };

  function loadSeenQuestions() {
    try {
      const list = JSON.parse(storage.get(STORAGE.seenQuestions) || "[]");
      return new Set(Array.isArray(list) ? list : []);
    } catch {
      return new Set();
    }
  }

  function saveSeenQuestions(seen) {
    const list = [...seen].slice(-SEEN_LIMIT);
    storage.set(STORAGE.seenQuestions, JSON.stringify(list));
  }

  /**
   * Pick a round of questions the player has not seen on this device yet,
   * preferring fresh API questions. Once everything has been played, the
   * history is cleared and the rotation starts again.
   */
  function buildRound(size) {
    const seen = loadSeenQuestions();
    const unseen = (pool) => shuffle(pool.filter((q) => !seen.has(q.id)));

    let round = [...unseen(trivia.cache), ...unseen(QUESTION_BANK)].slice(0, size);

    if (round.length < size) {
      seen.clear();
      const taken = new Set(round.map((q) => q.id));
      const refill = shuffle([...trivia.cache, ...QUESTION_BANK].filter((q) => !taken.has(q.id)));
      round = [...round, ...refill].slice(0, size);
    }

    const used = new Set(round.map((q) => q.id));
    used.forEach((id) => seen.add(id));
    saveSeenQuestions(seen);
    trivia.cache = trivia.cache.filter((q) => !used.has(q.id));

    return round.map((q) => {
      const choices = shuffle([q.answer, ...q.wrong]);
      return { question: q.question, choices, correct: choices.indexOf(q.answer) };
    });
  }

  // ---------------------------------------------------------------------------
  // Quiz
  // ---------------------------------------------------------------------------

  const quiz = {
    round: [],
    index: 0,
    score: 0,
    selected: null,
    revealed: false,
  };

  const CHOICE_KEYS = ["A", "B", "C", "D"];

  function startQuiz() {
    quiz.round = buildRound(QUIZ.length);
    quiz.index = 0;
    quiz.score = 0;
    showScreen("quiz");
    renderQuestion();
    trivia.fill();
  }

  function renderQuestion() {
    const item = quiz.round[quiz.index];
    const total = quiz.round.length;

    quiz.selected = null;
    quiz.revealed = false;

    ui.quizCount.textContent = `${quiz.index + 1} / ${total}`;
    ui.quizBar.style.width = `${(quiz.index / total) * 100}%`;
    ui.quizQuestion.textContent = item.question;
    ui.quizNote.textContent = "Pick an answer.";
    ui.quizNote.dataset.tone = "";
    ui.quizNextBtn.textContent = "Check";
    ui.quizNextBtn.disabled = true;

    const buttons = item.choices.map((label, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.setAttribute("aria-pressed", "false");

      const key = document.createElement("span");
      key.className = "choice__key";
      key.setAttribute("aria-hidden", "true");
      key.textContent = CHOICE_KEYS[index];

      const text = document.createElement("span");
      text.className = "choice__text";
      text.textContent = label;

      button.append(key, text);
      button.addEventListener("click", () => selectChoice(index));
      return button;
    });
    ui.quizChoices.replaceChildren(...buttons);
  }

  function selectChoice(index) {
    if (quiz.revealed) return;
    quiz.selected = index;
    ui.quizNextBtn.disabled = false;
    [...ui.quizChoices.children].forEach((button, i) => {
      button.classList.toggle("choice--selected", i === index);
      button.setAttribute("aria-pressed", String(i === index));
    });
  }

  function revealAnswer() {
    const item = quiz.round[quiz.index];
    const correct = quiz.selected === item.correct;
    quiz.revealed = true;
    if (correct) quiz.score++;

    [...ui.quizChoices.children].forEach((button, i) => {
      button.classList.remove("choice--selected");
      button.classList.toggle("choice--correct", i === item.correct);
      button.classList.toggle("choice--wrong", i === quiz.selected && !correct);
      button.setAttribute("aria-disabled", "true");
    });

    ui.quizNote.textContent = correct ? "Correct!" : `Not quite. The answer is ${item.choices[item.correct]}.`;
    ui.quizNote.dataset.tone = correct ? "good" : "bad";
    ui.quizBar.style.width = `${((quiz.index + 1) / quiz.round.length) * 100}%`;
    ui.quizNextBtn.textContent = quiz.index === quiz.round.length - 1 ? "See result" : "Next question";
  }

  function advanceQuiz() {
    if (!quiz.revealed) {
      if (quiz.selected !== null) revealAnswer();
      return;
    }

    if (quiz.index < quiz.round.length - 1) {
      quiz.index++;
      renderQuestion();
      return;
    }

    const { score } = quiz;
    const total = quiz.round.length;
    if (score >= QUIZ.passScore) {
      modal.open({
        title: "You passed",
        text: `You scored ${score}/${total}. Your pass is on the next screen. Screenshot it to claim your stickers.`,
        actionLabel: "Show pass",
        dismissible: true,
        onAction: () => showPass("Trivia", `${score}/${total} correct`),
      });
    } else {
      modal.open({
        title: "So close",
        text: `You scored ${score}/${total}. Get ${QUIZ.passScore} or more to earn the pass.`,
        actionLabel: "Try again",
        dismissible: true,
        onAction: startQuiz,
      });
    }
  }

  function handleQuizKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const letter = CHOICE_KEYS.indexOf(event.key.toUpperCase());
    const digit = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : -1;
    const index = letter !== -1 ? letter : digit;
    if (index !== -1 && index < ui.quizChoices.children.length) {
      event.preventDefault();
      selectChoice(index);
      return;
    }

    // Enter works from anywhere except when a button already has focus
    // (the browser clicks that button itself).
    if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement) && !ui.quizNextBtn.disabled) {
      event.preventDefault();
      advanceQuiz();
    }
  }

  // ---------------------------------------------------------------------------
  // Pass
  // ---------------------------------------------------------------------------

  function showPass(mode, result) {
    ui.passMode.textContent = mode;
    ui.passResult.textContent = result;
    // Fixed locale so the pass reads the same on every phone (the UI is English).
    ui.passIssued.textContent = new Date().toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    showScreen("win");
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------

  function applyTheme(name, { save = true } = {}) {
    const theme = THEMES.includes(name) ? name : DEFAULT_THEME;
    document.documentElement.dataset.theme = theme;
    for (const swatch of ui.swatches) {
      swatch.setAttribute("aria-pressed", String(swatch.dataset.theme === theme));
    }
    if (save) storage.set(STORAGE.theme, theme);

    maze.staticDirty = true;
    maze.needsDraw = true;
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  function bindUi() {
    ui.startMazeBtn.addEventListener("click", startMaze);
    ui.newMazeBtn.addEventListener("click", startMaze);
    ui.homeFromMazeBtn.addEventListener("click", () => showScreen("welcome"));

    ui.startQuizBtn.addEventListener("click", startQuiz);
    ui.quizNextBtn.addEventListener("click", advanceQuiz);
    ui.homeFromQuizBtn.addEventListener("click", () => showScreen("welcome"));

    ui.playAgainBtn.addEventListener("click", () => showScreen("welcome"));

    ui.modalActionBtn.addEventListener("click", () => modal.confirm());
    ui.modalBackdrop.addEventListener("click", () => {
      if (modal.dismissible) modal.close();
    });

    for (const swatch of ui.swatches) {
      swatch.addEventListener("click", () => applyTheme(swatch.dataset.theme));
    }

    window.addEventListener("keydown", (event) => {
      if (modal.isOpen) modal.handleKey(event);
      else if (currentScreen === "maze") handleMazeKeyDown(event);
      else if (currentScreen === "quiz") handleQuizKeyDown(event);
    });
    window.addEventListener("keyup", handleKeyUp);

    // Keys released while the window is in the background never send keyup.
    window.addEventListener("blur", releaseMazeInput);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) releaseMazeInput();
    });
  }

  function boot() {
    storage.remove(STORAGE.legacySeenQuestions);
    applyTheme(storage.get(STORAGE.theme), { save: false });
    bindUi();
    bindMazeControls();

    // Warm the question cache once the page has settled.
    setTimeout(() => trivia.fill(), 1500);
  }

  boot();
})();
