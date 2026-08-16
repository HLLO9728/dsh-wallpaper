/**
 * dsh-wallpaper — browser half.
 *
 * This bundle runs inside the DSH web UI. It:
 *   • renders a full-viewport background layer behind the app,
 *   • supports one static image, one live video/animated GIF, or a timed
 *     carousel mixing any of them,
 *   • applies opacity / blur / dim / fit for readability,
 *   • polls /wallpaper/config (served by the host half) so editing
 *     wallpaper.yml is applied live without a restart.
 *
 * The bundle is intentionally dependency-free: it builds the DOM directly
 * and only needs the cordis `ctx` passed to `apply`.
 */

window.__ModuleLoader__.load({
  id: 'dsh-wallpaper',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // ------------------------------------------------------------------
    // Static CSS
    // ------------------------------------------------------------------
    const ROOT_ATTR = 'data-dsh-wallpaper-root'
    const STYLE_PLUGIN = 'dsh-wallpaper'

    const BASE_CSS = `
[${ROOT_ATTR}]{
  position:fixed; inset:0; z-index:-1; pointer-events:none; overflow:hidden;
  transform:translateZ(0);
}
[${ROOT_ATTR}] [data-dsh-wallpaper-stage]{
  position:absolute; inset:0;
}
[${ROOT_ATTR}] [data-dsh-wallpaper-media]{
  position:absolute; inset:0; width:100%; height:100%; border:0;
  object-fit:cover;
}
[${ROOT_ATTR}][data-fit=contain] [data-dsh-wallpaper-media]{ object-fit:contain; }
[${ROOT_ATTR}] [data-dsh-wallpaper-dim]{
  position:absolute; inset:0; background:#000;
  opacity:0; transition:opacity var(--dsw-wp-transition,400ms) ease;
}
[${ROOT_ATTR}][data-dim="0"] [data-dsh-wallpaper-dim]{ opacity:0; }
[${ROOT_ATTR}] [data-dsh-wallpaper-blur]{
  filter:blur(0px);
}
[${ROOT_ATTR}][data-blur] [data-dsh-wallpaper-blur]{ filter:blur(var(--dsw-wp-blur,0px)); }
/* Revealed surface: let the wallpaper show through the DSH frame. */
html, body{ background:transparent !important; }
#root{ background:transparent !important; }
/* Neutralise the opaque surfaces (app frame, sidebar, chat input card) so
   the wallpaper shows through them. Text keeps contrast via the configurable
   'dim' overlay; solid surfaces become see-through over the wall. */
#root, #root *{
  --dsw-alias-bg-base: transparent !important;
  --dsw-alias-bg-l1: transparent !important;
  --dsw-alias-bg-l2: transparent !important;
  --dsw-specific-sidebar-fill: transparent !important;
  --dsw-specific-sidebar-fill-strong: transparent !important;
  --dsw-specific-input-major: transparent !important;
  --dsw-specific-input-minor: transparent !important;
  --dsw-specific-bubble: color-mix(in srgb, var(--dsw-static-neutral-bluish-900, #0f1115) 45%, transparent) !important;
  --dsw-specific-tip: transparent !important;
}
#root [class*="sidebarCol"],
#root [class*="root"]{ background-color:transparent !important; }
[data-dsh-wallpaper-reveal]{
  background-color:transparent !important;
  background-image:none !important;
  --dsw-alias-bg-base:transparent !important;
}
@media (prefers-reduced-motion:reduce){
  [${ROOT_ATTR}] *{ transition:none !important; }
}
`

    function injectStyle() {
      if (document && document.querySelector(`style[data-plugin="${STYLE_PLUGIN}"]`)) return () => {}
      const el = document.createElement('style')
      el.dataset.plugin = STYLE_PLUGIN
      el.textContent = BASE_CSS
      document.head.append(el)
      return () => el.remove()
    }

    // ------------------------------------------------------------------
    // DOM helpers
    // ------------------------------------------------------------------
    function ensureRoot() {
      let root = document.querySelector(`[${ROOT_ATTR}]`)
      if (root) return root
      root = document.createElement('div')
      root.setAttribute(ROOT_ATTR, '')
      root.dataset.fit = 'cover'
      root.innerHTML = [
        '<div data-dsh-wallpaper-stage data-dsh-wallpaper-blur></div>',
        '<div data-dsh-wallpaper-dim></div>'
      ].join('')
      document.body.append(root)
      return root
    }

    /**
     * Reveal the wallpaper behind DSH. The wallpaper layer is a fixed,
     * z-index:-1 element on body, so we must neutralise every opaque,
     * full-viewport background between body and the sidebar (the layout
     * frame / main surface). We walk BOTH directions from #root:
     *   • ancestors of #root up to body,
     *   • descendants of #root that are full-width containers.
     * Elements that are full-bleed are marked so the stylesheet makes their
     * background (and the base-surface token) transparent. Narrow panes that
     * are meant to keep their own fill are left alone.
     */
    function installRevealObserver() {
      let scheduled = 0
      const scan = (el, out) => {
        if (!el || !el.getBoundingClientRect) return
        out.push(el)
        for (const c of el.children || []) scan(c, out)
      }
      const reveal = () => {
        if (scheduled) return
        scheduled = 1
        requestAnimationFrame(() => {
          scheduled = 0
          const rootEl = document.getElementById('root')
          if (!rootEl) return
          const full = []
          // Upwards: every full-width ancestor of #root.
          {
            let node = rootEl
            while (node && node !== document.body) {
              if (node.getBoundingClientRect().width >= (window.innerWidth - 2)) full.push(node)
              node = node.parentElement
            }
          }
          // Downwards: every full-width element inside #root.
          scan(rootEl, full)
          for (const el of full) {
            const w = el.getBoundingClientRect().width
            if (w >= (window.innerWidth - 2)) el.setAttribute('data-dsh-wallpaper-reveal', '')
            else if (el.hasAttribute('data-dsh-wallpaper-reveal')) el.removeAttribute('data-dsh-wallpaper-reveal')
          }
        })
      }
      const observer = new MutationObserver(() => reveal())
      observer.observe(document.body, { childList: true, subtree: true })
      reveal()
      return () => observer.disconnect()
    }

    // ------------------------------------------------------------------
    // Config polling + rendering
    // ------------------------------------------------------------------
    const CONFIG_URL = '/wallpaper/config'
    const DEFAULT_POLL_MS = 3000

    function makeMedia(el, entry, enabled) {
      el.innerHTML = ''
      el.style.opacity = enabled ? '1' : '0'
      const media = document.createElement(entry.type === 'video' ? 'video' : 'img')
      media.setAttribute('data-dsh-wallpaper-media', '')
      media.alt = entry.title || ''
      if (entry.type === 'video') {
        media.src = entry.url
        media.autoplay = true
        media.muted = true
        media.loop = true
        media.playsInline = true
      } else {
        media.src = entry.url
        media.draggable = false
      }
      el.append(media)
      return media
    }

    /** Create a detached media element (not in the DOM) to preload/verify a frame. */
    function createDetached(entry) {
      const m = document.createElement(entry.type === 'video' ? 'video' : 'img')
      if (entry.type === 'video') {
        m.muted = true
        m.preload = 'auto'
        m.playsInline = true
      } else {
        m.decoding = 'async'
      }
      return m
    }

    /**
     * Load a wallpaper's frame into a detached element, resolving with the
     * element once it actually has a decodable frame (so the swap never shows
     * an empty black frame). A timeout still resolves so a broken file can't
     * wedge the carousel.
     */
    function preloadFrame(entry, onDone) {
      const probe = createDetached(entry)
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(probe._wpT)
        probe.removeAttribute && probe.removeAttribute('src')
        onDone(probe)
        probe.pause && probe.pause()
        probe.src = '' // release the buffer
      }
      probe.addEventListener(entry.type === 'video' ? 'loadeddata' : 'load', finish, { once: true })
      probe.addEventListener('canplay', finish, { once: true })
      probe.addEventListener('error', finish, { once: true })
      probe._wpT = setTimeout(finish, 2000)
      probe.src = entry.url
      if (entry.type === 'video') probe.load && probe.load()
    }

    /** Apply a normalized config envelope to the DOM. */
    function render(root, cfg) {
      // 轮播按文件名自然排序（1,2,10 而非 1,10,2），无论配置怎么写。
      const names = Array.isArray(cfg.wallpapers) ? cfg.wallpapers.slice() : []
      names.sort((a, b) => String(a?.file ?? '').localeCompare(String(b?.file ?? ''), undefined, { numeric: true, sensitivity: 'base' }))
      const stage = root.querySelector('[data-dsh-wallpaper-stage]')
      const dim = root.querySelector('[data-dsh-wallpaper-dim]')
      const list = names

      // Global look control.
      root.dataset.fit = cfg.fit || 'cover'
      root.dataset.dim = String(Number(cfg.dim) || 0)
      root.dataset.blur = String(Number(cfg.blur) || 0)
      dim.style.opacity = String(Number(cfg.dim) || 0)
      root.style.setProperty('--dsw-wp-blur', `${Number(cfg.blur) || 0}px`)
      root.style.setProperty('--dsw-wp-transition', `${Number(cfg.transitionMs) || 400}ms`)

      // Only rebuild the media/carousel when the playback plan actually changed;
      // a no-change poll (every few seconds) must not restart the carousel timer.
      const plan = JSON.stringify({
        enabled: cfg.enabled,
        mode: cfg.mode,
        intervalSec: cfg.intervalSec,
        opacity: cfg.opacity,
        wallpapers: list.map((w) => [w.url, w.type, w.title])
      })
      if (root.__dswPlan === plan) return
      root.__dswPlan = plan

      // Stop any previous carousel timer before (re)starting one.
      if (root.__dswStop) { try { root.__dswStop() } catch (_e) {} root.__dswStop = null }

      const opacity = Number(cfg.opacity) || 1

      if (!cfg.enabled || list.length === 0) {
        stage.style.opacity = '0'
        stage.innerHTML = ''
        return
      }

      const single = list[0]
      if (cfg.mode === 'static' || list.length === 1) {
        stage.style.transition = 'none'
        stage.style.opacity = opacity
        makeMedia(stage, single, true)
        return
      }

      // Carousel mode: preload the next wallpaper's frame, swap it into a
      // single on-screen element, and cross-fade the opacity — no stacking of
      // multiple <video> elements, so memory stays flat and the timer can't
      // wedge the page.
      const intervalMs = Math.max(3000, (Number(cfg.intervalSec) || 30) * 1000)
      const transitionMs = Number(cfg.transitionMs) || 400
      const stageOpacity = opacity

      stage.style.transition = 'none'
      stage.style.opacity = '1'

      // The single visible media element that stays in the DOM forever.
      const visible = document.createElement(list[0].type === 'video' ? 'video' : 'img')
      visible.setAttribute('data-dsh-wallpaper-media', '')
      visible.alt = list[0].title || ''
      visible.draggable = false
      if (list[0].type === 'video') {
        visible.autoplay = true
        visible.muted = true
        visible.loop = true
        visible.playsInline = true
      }
      visible.style.opacity = stageOpacity
      visible.style.transition = `opacity ${transitionMs}ms ease`
      stage.appendChild(visible)
      visible.src = list[0].url
      if (list[0].type === 'video' && visible.load) visible.load()

      // Backup so the element takes over if the frame never arrives.
      setTimeout(() => {
        visible.style.opacity = stageOpacity
      }, 2200)

      let idx = 0
      let pending = false

      const swap = (probe, entry) => {
        if (!probe) return
        // Old frame stays visible; we swap src then fade in the new frame.
        visible.style.transition = 'none'
        visible.style.opacity = '0'
        visible.src = entry.url
        if (visible.load) visible.load()
        if (visible.play) visible.play().catch(() => {})
        // Force reflow so the 0->opacity transition runs.
        void visible.offsetWidth
        visible.style.transition = `opacity ${transitionMs}ms ease`
        visible.style.opacity = opacity
        pending = false
      }

      const step = () => {
        if (pending) return
        const nextIdx = (idx + 1) % list.length
        const entry = list[nextIdx]
        idx = nextIdx
        pending = true
        preloadFrame(entry, (probe) => {
          if (probe) swap(probe, entry)
        })
        // Safety: never stay pending forever (a broken file must not stall the carousel).
        setTimeout(() => { pending = false }, Math.max(1500, intervalMs - 500))
      }

      const stop = () => {
        clearInterval(timer)
        visible.pause && visible.pause()
        visible.src = ''
      }

      const timer = setInterval(step, intervalMs)

      root.__dswStop = stop
    }

    /** Poll /wallpaper/config and re-render. */
    function startPoll(root, log) {
      let disposed = false
      const tick = async () => {
        if (disposed) return
        try {
          const res = await fetch(CONFIG_URL, { cache: 'no-store' })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const cfg = await res.json()
          if (!disposed) render(root, cfg)
        } catch (err) {
          log && log(`[dsh-wallpaper] config fetch failed: ${String(err && err.message || err)}`)
        }
      }
      tick()
      const timer = setInterval(tick, DEFAULT_POLL_MS)
      return () => {
        disposed = true
        clearInterval(timer)
      }
    }

    // ------------------------------------------------------------------
    // Cordis plugin body
    // ------------------------------------------------------------------

    /** No services are required by this plugin. */
    const inject = []

    /**
     * Browser half entry point.
     * @param ctx - client cordis context.
     */
    function apply(ctx) {
      const log = (...a) => ctx.logger && ctx.logger['warn'] && ctx.logger['warn'](...a)

      ctx.effect(() => {
        const disposers = []
        disposers.push(injectStyle())
        const root = ensureRoot()
        disposers.push(installRevealObserver())
        disposers.push(startPoll(root, log))
        return () => {
          for (const d of disposers.reverse()) d && d()
          root.remove()
        }
      }, 'dsh-wallpaper: background renderer')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
