# Starchild Vanguard — Club Invite (Maze + Trivia)

- https://asa07-salihg.github.io/Starchild-Vanguard/

Mobile-first static site for GitHub Pages:
- **Dynamic Maze** (procedurally generated every run)
- **Trivia Mode** (film category, easy, non-repeating, large pool)
- **Reward/Pass screen** (screenshot to claim stickers)
- **Discord join CTA**
- **Theme picker** (bottom bar, saved on device)

## Live requirements
- Static hosting only (HTML/CSS/Vanilla JS)
- Designed for **portrait mobile** (iPhone/Android)

## Project structure
```
.
├─ index.html
├─ style.css
├─ script.js
└─ img/
   └─ logo.png
```

## Local run
From the project root:

```bash
python -m http.server 5173
```

Open:
- `http://localhost:5173`

## Deploy to GitHub Pages
1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**:
   - **Source**: *Deploy from a branch*
   - **Branch**: `main` (or `master`)
   - **Folder**: `/ (root)`
4. Save. GitHub will publish a URL in the Pages section.

## Customization

### Discord invite code
Update in `script.js`:
- `DISCORD_INVITE_CODE`

And (optional) update the link text in `index.html` if you want different button labels.

### Theme picker (site color)
Users can change the accent color from the bottom theme bar. The choice is stored in localStorage.

To change available themes, edit in `script.js`:
- `THEMES`
- localStorage key: `sv_theme_v1`

### Trivia behavior
Trivia is fetched from Open Trivia DB (**Film** category, **easy**, multiple-choice).

Key points:
- **Large pool**: the app keeps topping up an in-memory cache (default target: `800`).
- **No repeats**: used questions are tracked and persisted in localStorage.
- **Filters**: actor/cast style questions are filtered out to keep it accessible.

To tweak, see in `script.js`:
- `topUpTriviaCache(target = 800)`
- `looksTooHard(question)` (filters)
- localStorage key: `sv_trivia_used_v1`

## Notes
- Trivia questions are cached and **won’t repeat** thanks to localStorage tracking.
- If the trivia API is temporarily unavailable, the app falls back to the built-in question set.

#
