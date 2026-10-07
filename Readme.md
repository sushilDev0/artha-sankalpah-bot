# 🌸 Artha Sankalpah (अर्थ संकल्पः)

> **AI-Powered WhatsApp Personal Expense & Financial Health Tracker**

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4285F4?logo=google&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![CI](https://github.com/sushilDev0/artha-sankalpah-bot/actions/workflows/ci.yml/badge.svg)

Artha Sankalpah is a lightweight, backend-first, multi-tenant WhatsApp bot that simplifies expense tracking, income logging, and personal budgeting. Built with **Node.js, TypeScript, the WhatsApp Web API (Baileys), MongoDB Atlas, and Google Gemini AI**, it lets you manage your finances directly through simple WhatsApp messages — no extra apps, no complex dashboards.

---

## 📑 Table of Contents

- [Features](#-features)
- [Architecture & Tech Stack](#️-architecture--tech-stack)
- [Quick Start](#-quick-start-self-hosting--developers)
- [Usage & Commands](#-how-to-use-commands)
- [Deploying to Production](#-deploying-to-production-render--railway--koyeb)
- [Project Structure](#-project-structure)
- [Security & Privacy](#️-security--privacy)
- [Troubleshooting](#-troubleshooting)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

- 💬 **Frictionless WhatsApp Logging** — Track expenses and income on the fly (e.g., `chai 20`, `petrol 300`, `salary 50000`).
- 🤖 **AI Financial Coach** — Uses Google Gemini Flash to automatically categorize expenses and generate personalized weekly coaching insights.
- 📊 **Automated Sunday Reports** — A scheduled cron job delivers a formatted weekly spending summary every Sunday at 9:00 PM IST.
- 📁 **Instant CSV Export** — Type `!csv` to receive your full financial history as an Excel-compatible file right in your WhatsApp chat.
- 🔒 **Multi-Tenant Data Isolation** — Data is scoped by unique WhatsApp chat IDs (`chatId`), keeping every user's transactions private and isolated.
- ⚡ **Zero-UI Overhead** — 100% backend-driven. No frontend, no logins, no app store downloads.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime & Language | Node.js (v20+) with TypeScript |
| WhatsApp Gateway | [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) |
| Database & ODM | MongoDB Atlas via Mongoose |
| AI Engine | [`@google/genai`](https://www.npmjs.com/package/@google/genai) (Google Gemini Flash API) |
| Scheduler | `node-cron` (configured for `Asia/Kolkata` IST) |

### How it works

```
WhatsApp message ──▶ Baileys socket ──▶ Command parser
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     ▼                      ▼                      ▼
              Expense / Income        !commands              Cron (Sun 9 PM IST)
              ──▶ Gemini categorizes  (!stats, !csv, ...)    ──▶ Gemini weekly insights
                     │                      │                      │
                     └──────────────▶ MongoDB Atlas ◀──────────────┘
                                     (scoped by chatId)
```

---

## 🚀 Quick Start (Self-Hosting / Developers)

Run your own personal instance of Artha Sankalpah locally or on a server.

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account (or a local MongoDB instance)
- A [Google AI Studio](https://aistudio.google.com/) Gemini API key (free tier available)
- A WhatsApp account on a phone that can scan a QR code

### Step 1: Clone the Repository

```bash
git clone https://github.com/sushilDev0/artha-sankalpah-bot.git
cd artha-sankalpah-bot
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Environment Setup

Create a `.env` file in the root directory from the example template:

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:

```env
# MongoDB connection string
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/artha_sankalpah?retryWrites=true&w=majority

# Google Gemini API key
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: your number with country code, digits only
MY_NUMBER=919876543210

# Optional: public multi-user mode (off by default)
ALLOW_ALL_CHATS=false

# Timezone for the scheduler
TZ=Asia/Kolkata

# Port for the health endpoint
PORT=3000
```

| Variable | Required | Description |
| --- | --- | --- |
| `MONGO_URI` | ✅ | MongoDB connection string (also stores the WhatsApp session) |
| `GEMINI_API_KEY` | ✅ | API key from Google AI Studio |
| `MY_NUMBER` | ❌ | Your number (digits only). Lets you message the bot from that number as well as your self-chat |
| `ALLOW_ALL_CHATS` | ❌ | `true` makes the bot answer anyone who messages the linked number. Default `false` (owner only) |
| `TZ` | ❌ | Timezone used by the scheduler (default `Asia/Kolkata`) |
| `PORT` | ❌ | HTTP port for the health endpoint (default `3000`) |

### Step 4: Run the Application

**Development mode:**

```bash
npm run dev
```

**Production build:**

```bash
npm run build
npm start
```

### Step 5: Link Your WhatsApp Account

1. Start the app — a WhatsApp QR code renders directly in your terminal.
2. Open WhatsApp on your phone.
3. Go to **Settings → Linked Devices → Link a Device**.
4. Scan the QR code shown in the terminal.

Once authenticated, the bot is active and listening for incoming messages. 🎉

---

## 📱 How to Use (Commands)

By default the bot answers only your own "message yourself" chat (and `MY_NUMBER` if set). Send plain everyday text:

| Action | Example | What happens |
| --- | --- | --- |
| Log expense | `chai 20`, `groceries 1200 blinkit` | Saves it and auto-categorizes via AI |
| Log income | `freelance 15000 income` | Records income to your balance |
| Today's summary | `!status` (or `!today`) | Summary of today's activity |
| Recent entries | `!last` (or `!recent`) | Shows your latest transactions |
| Edit an entry | `edit ...` (or `update`, `change`) | Changes an existing entry |
| Delete an entry | `delete <n>` (or `del`, `remove`) | Removes an entry |
| Export data | `!export` (or `!csv`) | Sends your history as a CSV file |
| Test weekly report | `!testreport` | Sends the weekly report now (for testing) |
| Help | `!help` (or `!commands`) | Lists commands |

**Weekly report:** Every Sunday at 9:00 PM IST the bot automatically sends a spending summary with AI-generated coaching insights.

---

## 🌐 Deploying to Production (Render / Railway / Koyeb)

To keep Artha Sankalpah running 24/7 in the cloud at (near) zero cost:

1. **Push code to GitHub.** Make sure your secret `.env` file and the `auth_info/` folder are listed in `.gitignore`.
2. **Create a web service.** Connect your repository to Render, Railway, or Koyeb.
3. **Configure environment variables.** Add `MONGO_URI`, `GEMINI_API_KEY`, `MY_NUMBER`, and `TZ=Asia/Kolkata` in the service's Environment Variables / Settings dashboard.
4. **Session persistence.** The WhatsApp session is stored in MongoDB (`src/config/mongoAuthState.ts`), so redeploys don't log you out.
5. **Keep-alive (UptimeRobot).** Set up a free ping check on a health endpoint (e.g., `/health`) to keep free-tier containers awake.

**Build & start commands**

```bash
# Build command
npm install && npm run build

# Start command
npm start
```

---

## 📂 Project Structure

```
artha-sankalpah-bot/
├── src/
│   ├── index.ts              # Entry point (health server + bot bootstrap)
│   ├── whatsapp.ts           # Baileys socket and chat access rules
│   ├── config/               # db.ts, dns.ts, mongoAuthState.ts (session in MongoDB)
│   ├── handlers/             # commands.ts, message.handler.ts
│   ├── services/             # ai.ts (Gemini), csv.ts, stats.ts, weeklyReport.ts
│   ├── models/               # Mongoose: Transaction, Settings
│   └── utils/                # dateStats.ts
├── .github/                  # CI, issue and PR templates
├── .env.example
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

---

## 🛡️ Security & Privacy

- **No secrets in code** — credentials and connection strings are injected strictly via environment variables.
- **Isolated user storage** — all transaction queries are strictly scoped by the sender's unique `chatId`.
- **Owner-only by default** — the bot answers only your self-chat (and `MY_NUMBER`) unless you set `ALLOW_ALL_CHATS=true`.
- **Git hygiene** — auth keys, database tokens, and session folders are excluded via `.gitignore`.
- **Data sharing note** — expense descriptions are sent to the Google Gemini API for categorization and insights. Avoid logging sensitive personal details in descriptions.

> ⚠️ **Disclaimer:** Baileys is an unofficial WhatsApp Web client library. It is not affiliated with or endorsed by WhatsApp/Meta, and using unofficial clients may carry a risk of account restrictions. Use a dedicated number if possible and use at your own risk.

---

## 🧰 Troubleshooting

| Problem | Likely Fix |
| --- | --- |
| QR code doesn't appear | Clear the stored session (delete the session collection in MongoDB or the local `auth_info/` folder) and restart |
| Bot logs out after every deploy | Make sure `MONGO_URI` is set; the session is stored there |
| Weekly report arrives at the wrong time | Confirm `TZ=Asia/Kolkata` is set in your environment |
| MongoDB connection fails | Whitelist your server's IP in Atlas **Network Access** and verify credentials |
| AI categorization fails | Check `GEMINI_API_KEY`, quota limits, and the configured model name |
| Free-tier service goes to sleep | Add a UptimeRobot ping to your `/health` endpoint |

---

## 🗺️ Roadmap

- [ ] Monthly budgets with overspend alerts
- [ ] Custom categories and category overrides
- [ ] Recurring transactions (rent, subscriptions)
- [ ] REST API layer
- [ ] React dashboard
- [ ] Telegram and Discord support (shared core logic)
- [ ] Docker support and automated tests

See the [open issues](https://github.com/sushilDev0/artha-sankalpah-bot/issues) for tasks you can pick up.


---

## 🤝 Contributing

Contributions are welcome, from first-timers too! Read [CONTRIBUTING.md](CONTRIBUTING.md), then pick an issue labelled [`good first issue`](https://github.com/sushilDev0/artha-sankalpah-bot/labels/good%20first%20issue).

1. Fork the repository
2. Create a branch: `git checkout -b feat/amazing-feature`
3. Commit your changes and run `npm run build`
4. Push and open a Pull Request

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

<p align="center">Made with ❤️ to make personal finance as easy as sending a message.</p>
