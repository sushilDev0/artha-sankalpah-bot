# Contributing to Artha Sankalpah

Thanks for helping out! Every contribution counts: code, docs, bug reports, ideas.

## Quick start

1. **Fork** the repo and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/artha-sankalpah-bot.git
   cd artha-sankalpah-bot
   npm install
   cp .env.example .env   # fill in MONGO_URI and GEMINI_API_KEY
   ```
2. Run in dev mode and scan the QR code with a **spare WhatsApp number** if possible:
   ```bash
   npm run dev
   ```
3. Create a branch: `git checkout -b feat/short-description`
4. Make your change, then check it compiles: `npm run build`
5. Commit with a clear message (e.g. `feat: add monthly budget command`, `fix: handle empty export`).
6. Push and open a Pull Request against `main`.

## Good places to start

Look for issues labelled [`good first issue`](https://github.com/sushilDev0/artha-sankalpah-bot/labels/good%20first%20issue) or [`help wanted`](https://github.com/sushilDev0/artha-sankalpah-bot/labels/help%20wanted). Comment on the issue first so work isn't duplicated.

## Guidelines

- Keep PRs small and focused: one change per PR.
- Follow the existing structure: `handlers/` (commands), `services/` (AI, reports, CSV), `models/` (Mongoose), `config/`, `utils/`.
- TypeScript strict options are on, so avoid `any`.
- Never commit `.env`, API keys, or WhatsApp session data.
- Update the README if you add or change a command or environment variable.
- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs and ideas

Use the issue templates. For security problems, do **not** open a public issue: see [SECURITY.md](SECURITY.md).
