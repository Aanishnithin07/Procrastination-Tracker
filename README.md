# ProcrastiTrack

ProcrastiTrack is a lightweight, single-page web app to log both distractions and productive moments, visualize patterns, and nudge you toward focus. It runs entirely in the browser (no backend) and stores data locally via `localStorage`.

Live-ready: deploy on GitHub Pages or Netlify in minutes.

## Features
- Balanced logging: equally log Distractions and Productive tasks
- Color-coded Recent Logs with icons and labels
- Stats: total logs, distractions, productive logs, minutes wasted, minutes productive, and a “Procrastination Heat” percentage
- Insights: two charts (Chart.js) for top distractions and top productive tasks
- Smart suggestions: rotating, context-aware tips and reward ideas
- Import/Export JSON; all data stays in your browser
- Mobile-first, responsive UI with accessible labels and good contrast

## Tech Stack
- HTML, CSS (Tailwind via CDN), vanilla JavaScript
- Chart.js (CDN)
- No build step required

## Quick Start (Local Preview)
From the project root:
```bash
cd "/Users/aanishnithin/Procrastination Tracker/procrasti-track"
npx http-server -c-1 .
# Open http://localhost:8080
```
Or using npm script:
```bash
cd "/Users/aanishnithin/Procrastination Tracker/procrasti-track"
npm run preview
```

## Usage
1) Enter “What should you be doing?” and (optionally) minutes.
2) Click “Log distraction” or “Log productivity”.
3) Review stats and insights; export/import JSON anytime.
4) Use “Quick suggestion” for a nudge or encouragement.

## Deploy to GitHub Pages
Automated (recommended) via GitHub Actions included at `.github/workflows/gh-pages.yml`:
```bash
# Initialize and push to your own GitHub repo
cd "/Users/aanishnithin/Procrastination Tracker/procrasti-track"
git branch -m main
git remote add origin git@github.com:<your-user>/<your-repo>.git
git push -u origin main
```
Then in GitHub:
- Ensure Actions are enabled.
- Settings → Pages → Source: “Deploy from a branch”, branch: `gh-pages`.

Manual alternative (no Actions):
```bash
git subtree push --prefix . origin gh-pages
```

## Deploy to Netlify
- Drag-and-drop the project folder into Netlify, or use CLI:
```bash
npm install -g netlify-cli
netlify deploy --prod --dir .
```

## Accessibility & Responsiveness
- Labeled form controls; keyboard operable
- Sufficient color contrast; focus states
- Mobile-first layout that scales up to desktop

## Project Structure
```
procrasti-track/
  index.html       # App shell
  styles.css       # Custom styles (gradient, cards, buttons)
  app.js           # All client logic (storage, render, charts, suggestions)
  assets/          # Icons/images (optional)
  .github/workflows/gh-pages.yml  # GitHub Pages deployment workflow
  package.json     # Preview script (no build step)
  LICENSE          # MIT
  README.md        # This file
```

## License
MIT — see `LICENSE`.

## Author
Made by: AANISH NITHIN A
