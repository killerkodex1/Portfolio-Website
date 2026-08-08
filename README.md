# Vallabh's 3D Portfolio

A full-stack personal portfolio for Vallabh Venkata Sai Poola. It uses a dependency-free Node.js server, a responsive CSS 3D interface, and a small contact-message API.

## Run locally

1. Install Node.js 20 or newer.
2. In this directory, run `npm start`.
3. Open `http://localhost:3000`.

## Contact email delivery

Contact messages are validated, rate-limited, emailed to `vallabhavenkatasai@gmail.com`, and saved locally in `data/messages.json` after successful delivery. That file is intentionally excluded from Git.

The project uses [Resend](https://resend.com) for delivery and requires a verified sending domain:

1. Create a Resend account, verify a sending domain, and create an API key.
2. Copy `.env.example` to `.env`.
3. Add the `RESEND_API_KEY` and set `EMAIL_FROM` to an address at that verified domain.
4. Restart the server with `npm start`.

`CONTACT_TO` is preconfigured as `vallabhavenkatasai@gmail.com`. Keep `.env` private; it is excluded from Git.

## Deploy

The app listens on `process.env.PORT`, so it is ready for a Node-compatible host such as Render, Railway, or Fly.io. Set the start command to `npm start`.

For production, set the same three environment variables in your hosting dashboard. Do not commit API keys.

## GitHub

```bash
git init
git add .
git commit -m "Initial portfolio"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/vallabh-portfolio.git
git push -u origin main
```
