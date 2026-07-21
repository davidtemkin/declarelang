// server/config.mjs — where the server's shape comes from: a config file, then
// flags on top.
//
// THE CONFIG FILE'S LOCATION IS THE ROOT MOUNT. That is the whole trick, and it
// answers "where does --root default from" the way tsconfig.json and vite.config
// answer it: you do not say where your project is, you put a file in it. Discovery
// walks up from cwd; flags override the file; the file overrides the defaults.
//
// With no config file anywhere above cwd, the defaults are DISTRO MODE — the root
// mount and the platform mount are both the Declare installation, which is the
// table `npm start` has effectively always used. (embeddable-server.md §3, §7)

import path from "node:path";
import os from "node:os";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export class ConfigError extends Error {}

export const CONFIG_NAME = "declare.json";

/** The Declare installation this module belongs to — the platform mount's
 *  directory. Derived from this file's own location, so it is correct whether the
 *  distro was cloned, npm-installed into a project, or vendored. */
export const PLATFORM_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A build cache belongs to the MACHINE, not to a project: keeping it in the
 *  workspace makes it per-root (the thing being removed), and keeping it under
 *  node_modules means `npm ci` discards it. */
export function defaultBuildCache() {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(base, "declare", "builds");
}

/** Walk up from `from` looking for declare.json. Returns its path, or null. */
export function findConfig(from = process.cwd()) {
  let dir = path.resolve(from);
  for (;;) {
    const candidate = path.join(dir, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function readConfig(file) {
  let raw;
  try { raw = readFileSync(file, "utf8"); }
  catch (e) { throw new ConfigError(`cannot read ${file}: ${e.message}`); }
  try { return JSON.parse(raw); }
  catch (e) { throw new ConfigError(`${file} is not valid JSON: ${e.message}`); }
}

/** `--proxy /intent=http://127.0.0.1:8000`, repeatable. */
function parseProxyFlag(value, into) {
  const eq = value.indexOf("=");
  if (eq < 0) throw new ConfigError(`--proxy wants <prefix>=<target>, got: ${value}`);
  const prefix = value.slice(0, eq).trim();
  const target = value.slice(eq + 1).trim();
  if (!prefix || !target) throw new ConfigError(`--proxy wants <prefix>=<target>, got: ${value}`);
  into[prefix.startsWith("/") ? prefix : "/" + prefix] = target;
  return into;
}

/**
 * Resolve the server's configuration.
 *
 *   argv   flags, already sliced past `node script`
 *   cwd    where discovery starts
 *
 * Returns { mountSpecs, proxy, port, buildCache, configPath, mode }.
 * `mode` is "distro" or "workspace", used only for the banner and for deciding
 * whether an on-demand bundle rebuild is meaningful (a node_modules platform has
 * no sources to rebuild from).
 */
export function loadConfig({ argv = [], cwd = process.cwd() } = {}) {
  const flags = { proxy: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") flags.config = argv[++i];
    else if (a === "--root") flags.root = argv[++i];
    else if (a === "--proxy") parseProxyFlag(argv[++i] ?? "", flags.proxy);
    else if (a === "--port") flags.port = Number(argv[++i]);
    else if (a === "--platform-prefix") flags.platformPrefix = argv[++i];
    else if (a === "--build-cache") flags.buildCache = argv[++i];
    else if (a === "--no-config") flags.noConfig = true;
    else if (/^\d+$/.test(a)) flags.port = Number(a);            // `node server/index.mjs 8300`
    else if (a.startsWith("-")) throw new ConfigError(`unknown flag: ${a}`);
  }

  const configPath = flags.noConfig ? null
    : (flags.config ? path.resolve(cwd, flags.config) : findConfig(cwd));
  if (flags.config && !existsSync(configPath))
    throw new ConfigError(`no such config file: ${configPath}`);
  const file = configPath ? readConfig(configPath) : {};
  const configDir = configPath ? path.dirname(configPath) : null;

  // THE ROOT MOUNT: --root wins, else the config file's own directory, else the
  // Declare installation (distro mode).
  const root = flags.root ? path.resolve(cwd, flags.root)
    : configDir ? path.resolve(configDir, file.root ?? ".")
      : PLATFORM_DIR;

  if (!existsSync(root) || !statSync(root).isDirectory())
    throw new ConfigError(`root mount is not a directory: ${root}`);

  const platformPrefix = flags.platformPrefix ?? file.platformPrefix ?? "/declare/";

  // The platform is ALWAYS mounted, including in distro mode where it points at
  // the same directory as the root. That is what makes distro mode the degenerate
  // table rather than a special case: /bundles/… keeps working because the root
  // mount serves it, and /declare/bundles/… works because the platform mount does.
  const mountSpecs = [
    { prefix: "/", dir: root, name: "root" },
    { prefix: platformPrefix, dir: PLATFORM_DIR, name: "platform", platform: true },
  ];
  // extra mounts from the config file, e.g. { "/shared/": "../design-system" }
  for (const [prefix, dir] of Object.entries(file.mounts ?? {}))
    mountSpecs.push({ prefix, dir: path.resolve(configDir ?? cwd, dir) });

  return {
    mountSpecs,
    proxy: { ...(file.proxy ?? {}), ...flags.proxy },           // flags win per-prefix
    port: flags.port ?? (Number(process.env.PORT) || file.port || 8200),
    buildCache: path.resolve(flags.buildCache ?? file.buildCache ?? defaultBuildCache()),
    configPath,
    mode: path.resolve(root) === PLATFORM_DIR ? "distro" : "workspace",
  };
}
