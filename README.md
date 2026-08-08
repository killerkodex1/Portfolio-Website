# Vallabh's 3D Portfolio

A full-stack personal portfolio for Vallabh Venkata Sai Poola. It uses a dependency-free Node.js server, a responsive CSS 3D interface, and a small contact-message API.

## Run locally

1. Install Node.js 20 or newer.
2. In this directory, run `npm start`.
3. Open `http://localhost:3000`.

Contact messages are validated, rate-limited, and saved locally in `data/messages.json`. That file is intentionally excluded from Git.

## Deploy

The app listens on `process.env.PORT`, so it is ready for a Node-compatible host such as Render, Railway, or Fly.io. Set the start command to `npm start`.

For a production contact workflow, replace `saveMessage()` in `server.js` with an email provider or database integration. Do not commit API keys; use host-managed environment variables.

## GitHub

```bash
git init
git add .
git commit -m "Initial portfolio"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/vallabh-portfolio.git
git push -u origin main
```
