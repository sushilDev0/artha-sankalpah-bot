# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private reporting: **Security tab > Report a vulnerability** on this repository. Include steps to reproduce and the potential impact. You can expect an initial response within a few days.

## Scope and notes

- This bot handles personal financial notes and a linked WhatsApp session. Treat `MONGO_URI`, `GEMINI_API_KEY`, and the stored WhatsApp session as secrets.
- Never commit `.env` or session data. If you ever do, rotate the keys and unlink the device in WhatsApp (Settings > Linked Devices) immediately.
- By default the bot answers only your own chat. `ALLOW_ALL_CHATS=true` exposes it to anyone who messages the linked number; use it deliberately.
- Baileys is an unofficial WhatsApp client. Use at your own risk, preferably with a dedicated number.
