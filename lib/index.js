/**
 * dsh-wallpaper — host half.
 *
 * This is the Node-side face of the plugin. It has exactly two jobs:
 *
 *  1. Serve the media files the user drops into the wallpaper directory
 *     (`$DSH_HOME/wallpaper/…`, configurable via the WALLPAPER_DIR env var)
 *     over the DSH web server, so the browser half can render them.
 *  2. Read and serve `wallpaper.yml` (converted to JSON) so the browser
 *     half can apply the configuration without restarting — every request
 *     re-reads the file, so editing `wallpaper.yml` live re-applies after a
 *     short poll interval.
 *
 * The visible behaviour lives in the browser half (`lib/client.js`), which
 * is discovered automatically from the `dsh.client` declaration in
 * `package.json`.
 */

import { readFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve as pathResolve } from 'node:path'
import { homedir } from 'node:os'
import yaml from 'js-yaml'

/** Environment variable that overrides the default DSH home. */
const DSH_HOME_ENV = 'DSH_HOME'
/** Directory name for media + config under the DSH home. */
const DEFAULT_MEDIA_DIR_NAME = 'wallpaper'
/** Overridable media/config directory (useful when testing outside a DSH home). */
const MEDIA_DIR_ENV = 'WALLPAPER_DIR'
/** Config file name inside the media directory. */
const CONFIG_FILE = 'wallpaper.yml'

/** The URL prefix under which this plugin serves everything. */
const PREFIX = '/wallpaper'

/** Resolve the DSH home directory (mirrors @deepseek-ai/dsh-home-paths). */
function resolveDshHome() {
  const fromEnv = process.env[DSH_HOME_ENV]
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/** Resolve the directory that holds wallpaper.yml and the media files. */
function resolveMediaDir() {
  const overridden = process.env[MEDIA_DIR_ENV]
  if (typeof overridden === 'string' && overridden.trim() !== '') {
    return isAbsolute(overridden) ? overridden : pathResolve(process.cwd(), overridden)
  }
  return join(resolveDshHome(), DEFAULT_MEDIA_DIR_NAME)
}

/** Minimal extension -> MIME map for the media we expect users to host. */
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogg': 'video/ogg'
}
const DEFAULT_MIME = 'application/octet-stream'

/** Safely join a media-dir-relative filename and ensure it stays inside. */
function resolveMediaFile(mediaDir, raw) {
  const dir = pathResolve(mediaDir)
  const candidate = pathResolve(dir, raw)
  if (candidate !== dir && !relative(dir, candidate).startsWith('..')) return candidate
  return null
}

/**
 * Natural (numeric-aware) comparison of two filenames, so numbered names
 * like `1.mp4`, `2.mp4`, `10.mp4` sort numerically (`1,2,10`), not
 * lexicographically (`1,10,2`).
 */
function compareNames(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Normalize the parsed wallpaper.yml into the JSON envelope the browser
 * half consumes. Each wallpaper entry gains a browser-reachable `url`.
 */
function toClientEnvelope(mediaDir, raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  const wallpapers = Array.isArray(cfg.wallpapers) ? cfg.wallpapers : []
  const list = wallpapers
    .filter((w) => w && typeof w.file === 'string' && w.file.trim() !== '')
    .map((w) => {
      const fname = basename(w.file.trim())
      return {
        file: fname,
        title: typeof w.title === 'string' ? w.title : fname,
        type: w.type === 'video' ? 'video' : 'image',
        url: `${PREFIX}/file/${encodeURIComponent(fname)}`
      }
    })
    // 按文件名自然排序，让像 1,2,10 这样的编号按数字而非字典序播放。
    .sort((a, b) => compareNames(a.file, b.file))
  return {
    enabled: cfg.enabled !== false && list.length > 0,
    mode: ['static', 'carousel', 'off'].includes(cfg.mode) ? cfg.mode : 'static',
    intervalSec: Number.isFinite(cfg.intervalSec) && cfg.intervalSec > 0 ? cfg.intervalSec : 30,
    transitionMs: Number.isFinite(cfg.transitionMs) && cfg.transitionMs >= 0 ? cfg.transitionMs : 800,
    opacity: Number.isFinite(cfg.opacity) ? Math.min(1, Math.max(0, cfg.opacity)) : 1,
    blur: Number.isFinite(cfg.blur) ? Math.min(100, Math.max(0, cfg.blur)) : 0,
    dim: Number.isFinite(cfg.dim) ? Math.min(1, Math.max(0, cfg.dim)) : 0.25,
    fit: cfg.fit === 'contain' ? 'contain' : 'cover',
    wallpapers: list
  }
}

/** Load and normalize wallpaper.yml, returning the client envelope. */
async function readEnvelope(mediaDir) {
  try {
    const text = await readFile(join(mediaDir, CONFIG_FILE), 'utf8')
    const parsed = yaml.load(text)
    return toClientEnvelope(mediaDir, parsed)
  } catch (_err) {
    // Missing file, bad YAML, or anything else -> an empty-but-valid envelope.
    return toClientEnvelope(mediaDir, undefined)
  }
}

/** Register the /wallpaper routes against the DSH web server. */
function registerRoutes(ctx, mediaDir, log) {
  const register = (kind, path, handler) => ctx.effect(
    () => ctx.webServer.register({ kind, path, handler }),
    `dsh-wallpaper: ${kind} ${path}`
  )

  register('exact', `${PREFIX}/config`, async (_req, res) => {
    const envelope = await readEnvelope(mediaDir)
    const body = JSON.stringify(envelope)
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache'
    })
    res.end(body)
  })

  register('prefix', `${PREFIX}/file`, async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    let name
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://dsh-wallpaper').pathname)
      name = pathname.startsWith(`${PREFIX}/file/`) ? pathname.slice(`${PREFIX}/file/`.length) : ''
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    const file = resolveMediaFile(mediaDir, name || '')
    if (file === null) {
      res.writeHead(403)
      res.end()
      return
    }
    try {
      const data = await readFile(file)
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
      res.writeHead(200, {
        'content-type': MIME[ext] ?? DEFAULT_MIME,
        'cache-control': 'no-cache'
      })
      if (req.method === 'HEAD') res.end()
      else res.end(data)
    } catch (_err) {
      res.writeHead(404)
      res.end()
    }
  })
}

/**
 * Cordis plugin body. Requires the `webServer` service if present; the
 * wallpaper feature simply does nothing when the profile has no web UI.
 * @param ctx - Host cordis context.
 */
function apply(ctx) {
  const mediaDir = resolveMediaDir()

  ctx.inject(['webServer'], (httpCtx) => {
    registerRoutes(httpCtx, mediaDir, () => {})
  })

  ctx.logger?.['info']?.(`[dsh-wallpaper] serving wallpapers from ${mediaDir}`)
}

export { apply, resolveDshHome, resolveMediaDir, resolveMediaFile, toClientEnvelope, readEnvelope }
