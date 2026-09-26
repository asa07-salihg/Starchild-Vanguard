# Starchild Vanguard · Club Invite

Live: https://asa07-salihg.github.io/Starchild-Vanguard/

A small mobile-first site for the Starchild Vanguard club. Visitors earn a
"special pass" (and two stickers) by beating one of two challenges:

- **Maze** - a new maze is generated every time. Reach the green ring.
- **Film trivia** - 10 easy questions, 5 correct answers to pass.

The pass shows how it was earned and when it was issued, so a club manager
can check a screenshot at a glance.

It is plain HTML, CSS and JavaScript with no build step, so it runs on
GitHub Pages as is.

## Controls

| | Phone | Keyboard |
|---|---|---|
| Move one cell | Tap an arrow | Arrow keys or WASD |
| Run down a corridor | Hold an arrow, or swipe anywhere on the maze screen | Hold the key |
| New maze | **New** button | `N` |
| Pick an answer | Tap it | `1`-`4` or `A`-`D` |
| Check / next question | Button | `Enter` |

Holding a direction keeps moving through straight corridors and stops at the
next corner or junction, so you never overshoot a turn.

## Running locally

Any static server works. From the project folder:

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Project layout

```
index.html   markup for all screens
style.css    styles and the four colour themes
script.js    maze, trivia, pass and theme logic
img/logo.png club logo (also used as favicon and link preview)
```

## Customising

**Discord invite** - the link appears twice in `index.html` (welcome screen
and pass screen). Search for `discord.gg`.

**Themes** - colours live in `style.css` under `:root[data-theme="..."]`.
To add one, add a block there, a `.swatch[data-theme="..."]` rule, a swatch
button in `index.html`, and the name to `THEMES` in `script.js`.

**Maze size and difficulty** - `MAZE` at the top of `script.js`
(`rows`, `cols`, how branchy it is, movement speed).

**Quiz length and pass mark** - `QUIZ` in `script.js`.

**Questions** - the game pulls easy film questions from
[Open Trivia DB](https://opentdb.com) in the background and filters out
actor, release-year and other niche questions. If the API is slow or
offline, it uses the built-in `QUESTION_BANK` in `script.js`. Each device
remembers which questions it has already seen and only repeats them once
everything has been played.

## Deploying

1. Push to GitHub.
2. **Settings → Pages → Build and deployment**: deploy from branch `main`,
   folder `/ (root)`.
