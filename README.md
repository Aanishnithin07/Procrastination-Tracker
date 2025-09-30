# ProcrastiTrack

A small, deploy-ready single-page app to log distractions and view quick insights. Data is stored locally in the browser (localStorage).

## Preview locally

1. Clone or copy files.
2. From the project root, use any static server. Example (requires Node):
```bash
npm install -g http-server    # or use npx http-server
npx http-server -c-1 .        # serve on http://localhost:8080
```

Or with the included script:
```bash
npm run preview
```

## Deploy to GitHub Pages

With GitHub Actions (recommended):
1. Create a GitHub repo and push:
```bash
# from project root
git init
git branch -m main
git add .
git commit -m "chore: initial project scaffold"
# create repo on GitHub, then:
git remote add origin git@github.com:<your-user>/<your-repo>.git
git push -u origin main
```
2. Ensure Actions are enabled. The workflow at `.github/workflows/gh-pages.yml` publishes the site to `gh-pages` on each push to `main` (or `master`).
3. In GitHub → Settings → Pages: set Source to `Deploy from a branch`, branch `gh-pages`.

Manual alternative (no Actions):
```bash
git subtree push --prefix . origin gh-pages
```

## Deploy to Netlify

- Drag-and-drop the project folder into Netlify UI; or
- Use CLI:
```bash
npm install -g netlify-cli
netlify deploy --prod --dir .
```

## License
MIT — see LICENSE.
