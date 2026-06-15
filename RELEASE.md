# Releasing Dispatch

Dispatch isn't published to a package registry. Instead, each release produces
**self-contained tarballs** that anyone can install globally with no build step — the web
UI is bundled into the agent, and neither the agent nor server has native dependencies, so
this works on locked-down/corporate machines.

There are two ways to cut a release: automated (push a tag) or manual.

## Automated (recommended): push a tag

```bash
# bump the version in agent/package.json, server/package.json, web/package.json, then:
git tag v0.2.0
git push origin v0.2.0
```

The **Release** GitHub Action (`.github/workflows/release.yml`) then:
1. builds the web UI (Rollup in WASM — works on any runner),
2. `npm pack`s the agent (which bundles `web/dist` into the tarball) and the server,
3. creates a GitHub Release for the tag with both `.tgz` files attached.

No npm token or registry account is needed — it uses the built-in `GITHUB_TOKEN`.

## Manual

```bash
cd web && npm ci && npm run build && cd ..
cd agent  && npm ci && npm pack && cd ..   # → dispatch-agent-<v>.tgz  (bundles the web UI)
cd server && npm ci && npm pack && cd ..   # → dispatch-server-<v>.tgz
```

`npm pack` runs each package's `prepack` (agent: build + bundle web; server: build), so the
tarballs are complete. Share them however you like (attach to a release, drop in a shared
drive, etc.).

## Installing a release (for everyone else)

Download the tarballs from the GitHub Release (or wherever you shared them), then:

```bash
npm install -g ./dispatch-agent-0.2.0.tgz     # → `dispatch-agent` on PATH, UI bundled in
dispatch-agent --pair MY-CODE                 # solo mode, or:
dispatch-agent runner --server <url> --token <token>   # team runner

# optional, for hosting a team control plane:
npm install -g ./dispatch-server-0.2.0.tgz
dispatch-server
```

That's pure JavaScript — no Vite/Rollup, no native binaries, nothing to build at install
time. (If `dispatch-agent` isn't found after a global install, see the PATH note in
`INSTALL.md` §5.)

## Versioning

Keep the three `package.json` versions in step (`agent`, `server`, `web`) and tag with the
same `vX.Y.Z`. The tag name becomes the GitHub Release name.
