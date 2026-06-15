# Installing Dispatch

Dispatch is a **local-first** tool. It runs entirely on your machine — a small loopback
agent (`127.0.0.1:4317`) drives your coding agent (Codex or Claude Code) against repos
cloned on your own disk, and serves the web board from the same port. Nothing runs in the
cloud, and the agent is never exposed to the network.

> **Why no Docker?** Don't containerize it. The agent's whole job is to touch your real
> machine — clone into your folders, create git worktrees, push with your SSH keys / `gh`
> auth, open your editor, and run the locally-authed `codex`/`claude` CLIs. A container
> would isolate exactly the things it needs, forcing you to mount your home dir, keys, and
> tokens back in (fiddly and pointless), while breaking "open folder" and path handling.
> It already binds loopback-only with a pairing token, and builds are already sandboxed in
> git worktrees — so a container adds friction with no real upside. Run it natively.

---

## 1. Prerequisites

Install these on the target laptop and make sure each works from a terminal:

| Tool | Why | Check |
| --- | --- | --- |
| **Node ≥ 20** | runs the agent + builds the UI | `node -v` |
| **git** | clone / branch / worktree / merge | `git --version` |
| **A coding agent CLI** | does the actual building | `codex --version` **or** `claude --version` |
| **gh** *(optional)* | open GitHub PRs / create remote repos | `gh auth status` |
| **glab** *(optional)* | open GitLab MRs | `glab auth status` |

Also make sure your **SSH key** (or `gh` credential helper) is set up so `git push` works,
and that the coding-agent CLI is **signed in on this laptop** — its auth does not transfer
from another machine:

- **Codex:** `npm i -g @openai/codex` then sign in (`~/.codex`).
- **Claude Code:** install per Anthropic's docs, then `claude` once to authenticate.

---

## 2. Get the code

```bash
git clone https://github.com/webbermr/dispatch.git
cd dispatch
```

(Or copy the project folder onto the laptop.)

## 3. Build both halves

```bash
# Web UI
cd web && npm ci && npm run build && cd ..

# Agent (also serves the built UI)
cd agent && npm ci && npm run build && cd ..
```

> The web build uses Rollup's **WebAssembly** build (pinned via an override), so it works
> on locked-down/corporate machines where the platform-native binary is blocked by macOS
> library validation ("different Team IDs"). No per-machine setup needed.

## 4. Run it

```bash
node agent/dist/cli.js --pair MY-CODE
```

You'll see:

```
  Web UI:    http://127.0.0.1:4317
  Pair code: MY-CODE
```

Open **http://127.0.0.1:4317**, click **Connect**, and enter your pair code (or just visit
`http://127.0.0.1:4317/?pair=MY-CODE` to pair automatically). Then **Add a repo** or
**✨ Create app with AI** to get started.

> Omit `--pair MY-CODE` to have the agent generate a random code and open the browser for
> you. Use `--no-open` to suppress the browser launch (useful for autostart).

---

## 5. Make it a real command — and the easiest way to install for others

Bundle the built UI **into** the agent package, then install it globally. After this the
agent ships the web UI with it — no `DISPATCH_WEB_DIR`, and **others can install without
ever building the frontend**:

```bash
cd web && npm ci && npm run build && cd ..   # build the UI once
cd agent
npm run bundle        # copies web/dist → agent/web (baked into the package)
npm install -g .      # now `dispatch-agent` runs anywhere, serving the bundled UI
dispatch-agent --pair MY-CODE
```

Because `npm run bundle` bakes the UI into the package, the only thing an installer needs to
build the frontend is **you, once** — teammates can `npm install -g` (or, once published,
`npx @dispatch/agent`) and get pure JavaScript, no Vite/Rollup/native toolchain. You can also
register repos from the CLI:

```bash
dispatch-agent add ~/code/my-repo "My Repo"
```

> **If `dispatch-agent` "command not found" after install:** npm's global bin directory
> isn't on your `PATH`. Find it and either add it to `PATH` or symlink the binary into a
> directory that already is:
> ```bash
> npm prefix -g            # e.g. /Users/you/.hermes/node  → bin is <that>/bin
> # add to PATH:
> echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> ~/.zshrc
> # …or symlink into a dir already on PATH (e.g. ~/.local/bin):
> ln -sf "$(npm prefix -g)/bin/dispatch-agent" ~/.local/bin/dispatch-agent
> ```

---

## 6. Start automatically at login (optional)

Run headless with a **fixed** pair code so you always know it. Replace `/ABS/PATH/dispatch`
with the real checkout path and use an absolute `node` path (`which node`).

### macOS (launchd)

Create `~/Library/LaunchAgents/com.dispatch.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.dispatch.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/ABS/PATH/dispatch/agent/dist/cli.js</string>
    <string>--pair</string><string>MY-CODE</string>
    <string>--no-open</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- launchd has a minimal PATH; include where node/git/codex/claude/gh live -->
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/Users/YOU/.local/bin</string>
    <key>DISPATCH_WEB_DIR</key><string>/ABS/PATH/dispatch/web/dist</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/dispatch-agent.log</string>
  <key>StandardErrorPath</key><string>/tmp/dispatch-agent.log</string>
</dict></plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.dispatch.agent.plist   # start now + at login
launchctl unload ~/Library/LaunchAgents/com.dispatch.agent.plist # stop
```

### Linux (systemd user service)

Create `~/.config/systemd/user/dispatch-agent.service`:

```ini
[Unit]
Description=Dispatch agent

[Service]
ExecStart=/usr/bin/node /ABS/PATH/dispatch/agent/dist/cli.js --pair MY-CODE --no-open
Environment=DISPATCH_WEB_DIR=/ABS/PATH/dispatch/web/dist
Restart=always

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now dispatch-agent
loginctl enable-linger "$USER"   # keep it running across logouts
```

### Windows (Task Scheduler)

Create a task that runs at logon:

```powershell
$action  = New-ScheduledTaskAction -Execute "node" `
  -Argument "C:\ABS\PATH\dispatch\agent\dist\cli.js --pair MY-CODE --no-open"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "DispatchAgent" -Action $action -Trigger $trigger
```

Set `DISPATCH_WEB_DIR` to `C:\ABS\PATH\dispatch\web\dist` in your user environment variables.

After any autostart setup, open **http://127.0.0.1:4317** and pair with `MY-CODE`.

---

## 7. Updating

```bash
cd dispatch
git pull
(cd web && npm ci && npm run build)
(cd agent && npm ci && npm run build)
# then restart the agent (or: launchctl unload/load, systemctl --user restart dispatch-agent)
```

---

## 8. Team mode — multiple developers (optional)

Everything above is single-developer (local-only). Team mode adds a small **control-plane
server** that hosts a shared board; each developer's machine connects to it as a **runner**
that builds cards locally. **Code and credentials never leave each developer's machine** —
the server only holds the board, statuses, and diffs/logs. (Architecture: `MULTI_DEV_PLAN.md`.)

**Run the control-plane server** (one instance the team shares):

```bash
cd server && npm ci && npm run build
node dist/index.js            # listens on :4400 (DISPATCH_SERVER_PORT to change)
```

Env: `DISPATCH_SERVER_PORT`, `DISPATCH_SERVER_HOST` (use `0.0.0.0` to expose to teammates),
`DISPATCH_SERVER_HOME` (data dir, default `~/.dispatch-server`), `DISPATCH_ALLOW_DEV_LOGIN`
(set `0` in production), and `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` for GitHub OAuth
(otherwise dev login is used). Storage is JSON for now; Postgres is the production target.

**Open the team board:** visit the served web app at **`/#team`** (e.g.
`http://127.0.0.1:4317/#team`, or your Vite dev URL). Sign in, create a workspace + repo,
and invite teammates.

**Connect your machine as a runner** so cards can build:

1. In the board's repo list, click **Generate runner command** (mints a runner token).
2. Make sure the repo you want to build is registered locally with a matching slug
   (`dispatch-agent add ~/code/my-repo`), then run:

   ```bash
   dispatch-agent runner --server http://<server-host>:4400 --token <RUNNER-TOKEN>
   ```

   The runner advertises the repos you have cloned; dispatching a card builds it on **your**
   machine and streams status + the diff back to the shared board. Approving a reviewed card
   merges (or opens a PR) on the machine that built it.

> Run the runner from a normal terminal (or autostart it like §6, with a PATH that includes
> `git`, `codex`/`claude`, and `gh`). A card's server repo **slug must match** one of your
> locally-registered repos for it to build.

---

## Configuration

Environment variables the agent honors:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DISPATCH_PORT` | `4317` | Loopback port for the agent + UI |
| `DISPATCH_WEB_DIR` | auto | Absolute path to the built web bundle (`web/dist`) |
| `DISPATCH_HOME` | `~/.dispatch` | State, config, pairings, and build worktrees |
| `DISPATCH_CODEX_BIN` / `DISPATCH_CLAUDE_BIN` | `codex` / `claude` | Override the agent binary path |
| `DISPATCH_GH_BIN` / `DISPATCH_GLAB_BIN` | `gh` / `glab` | Override the forge CLI path |

State lives in `~/.dispatch/` (`config.json`, `state.json`, `chats.json`, `worktrees/`).

---

## Security notes (work laptop)

- **Stays local.** The agent binds `127.0.0.1` only and gates its API with a pairing token.
  Don't change the host to `0.0.0.0` — that would expose it on your network.
- **It acts as you.** Dispatch reads/writes your repos and can `git push` / open PRs with
  your credentials. Confirm AI coding tools and pushing to company repos are allowed by
  your org's policy before using it on work code.
- **No telemetry, no cloud.** Builds run via your local `codex`/`claude` install; their own
  usage/billing terms apply.

---

## Troubleshooting

- **UI loads but says "offline" / won't pair** — make sure you opened the same origin
  (`http://127.0.0.1:4317`) and that the agent terminal shows it listening. Re-pair from the
  Connect modal with the printed code.
- **"Codex/Claude not installed"** in the Connect modal — install + auth the CLI, confirm
  `codex --version` / `claude --version` work in the *same* shell the agent runs in.
- **Autostart can't find git/codex/gh** — launchd/systemd start with a minimal `PATH`. Set
  `PATH` in the service definition (see §6) to include where those binaries live.
- **Blank page / 404** — the agent couldn't find the web bundle. Build `web` and/or set
  `DISPATCH_WEB_DIR` to the absolute `web/dist` path.
- **PRs fail** — run `gh auth login` (or `glab auth login`), or switch the repo to **Local**
  (merges locally instead of opening a PR).
