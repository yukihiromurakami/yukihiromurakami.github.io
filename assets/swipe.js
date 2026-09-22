(function () {
  'use strict';

  const pages = Object.freeze(['index.html', 'research.html', 'education.html', 'organization.html']);
  const pageIndex = pathname => pages.indexOf(pathname.split('/').pop() || 'index.html');
  const neighbour = (pathname, dx) => pages[pageIndex(pathname) + (dx < 0 ? 1 : -1)] || null;

  function destination(pathname, dx, dy, duration, width) {
    if (pageIndex(pathname) < 0 || width > 950 || duration < 0) return null;
    if (Math.abs(dx) < Math.max(72, width * .18) || Math.abs(dy) > 40 || Math.abs(dx) < Math.abs(dy) * 2) return null;
    return neighbour(pathname, dx);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { destination };
    return;
  }
  if (pageIndex(window.location.pathname) < 0) return;

  const root = document.documentElement;
  const surfaces = Array.from(document.querySelectorAll('.page-shell, .site-footer'));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const previews = new Map();
  const interactive = 'a, button, input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], dialog, video, audio, iframe';
  const editing = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
  let gesture = null;
  let settling = false;
  let navigating = false;
  let frame = 0;
  let timer = 0;
  let offset = 0;
  let incoming = null;
  let suppressClickUntil = 0;
  const blocked = () => window.innerWidth > 950 ||
    root.classList.contains('command-open') || document.querySelector('dialog[open]') ||
    window.getSelection()?.isCollapsed === false || document.activeElement?.closest(editing);

  function hasHorizontalScroll(element) {
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      if (current.scrollWidth > current.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(current).overflowX)) return true;
    }
    return false;
  }

  // A script-free, inaccessible preview lets the next page slide in alongside this one.
  // The real navigation still loads a normal document, preserving links and browser history.
  function preparePreview(page) {
    if (!page || previews.has(page) || reducedMotion.matches || window.navigator.connection?.saveData) return;
    const preview = { page, element: null, ready: false };
    previews.set(page, preview);
    const url = new URL(page, window.location.href);
    fetch(url.href).then(response => {
      if (!response.ok) throw new Error('Preview unavailable');
      return response.text();
    }).then(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (!doc.querySelector('main.page-shell')) throw new Error('Missing page content');
      doc.querySelectorAll('script, base, dialog, iframe, meta[http-equiv], .command-launcher, .back-to-top, .skip-link').forEach(node => node.remove());
      const base = doc.createElement('base');
      base.href = url.href;
      doc.head.prepend(base);
      const style = doc.createElement('style');
      style.textContent = 'html{overflow:hidden!important;scrollbar-gutter:auto!important;scroll-behavior:auto!important} .site-header{visibility:hidden!important}';
      doc.head.append(style);
      const element = document.createElement('iframe');
      element.className = 'swipe-preview';
      element.title = 'Page preview';
      element.tabIndex = -1;
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('inert', '');
      // Same-origin allows the existing local fonts; scripts and navigation remain disabled.
      element.setAttribute('sandbox', 'allow-same-origin');
      element.addEventListener('load', () => {
        preview.ready = true;
        if (gesture?.locked && !frame) frame = requestAnimationFrame(draw);
      });
      element.srcdoc = '<!doctype html>\n' + doc.documentElement.outerHTML;
      preview.element = element;
      document.body.append(element);
    }).catch(() => { previews.delete(page); });
  }

  function warmNeighbours() {
    if (window.innerWidth > 950) return;
    preparePreview(neighbour(window.location.pathname, -1));
    preparePreview(neighbour(window.location.pathname, 1));
  }

  function draw() {
    frame = 0;
    const width = root.clientWidth;
    const page = neighbour(window.location.pathname, offset);
    const next = previews.get(page);
    if (incoming !== next) {
      if (incoming?.element) incoming.element.style.visibility = 'hidden';
      incoming = next || null;
    }
    // A little resistance at the first and last pages makes the boundary tangible.
    const x = page ? Math.max(-width, Math.min(width, offset)) : offset * .18;
    for (const surface of surfaces) surface.style.transform = `translate3d(${x}px, 0, 0)`;
    if (incoming?.ready) {
      incoming.element.style.visibility = 'visible';
      incoming.element.style.transform = `translate3d(${x + (offset < 0 ? width : -width)}px, 0, 0)`;
    }
  }

  function reset() {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    frame = timer = 0;
    gesture = null;
    settling = navigating = false;
    offset = 0;
    root.classList.remove('swipe-active');
    for (const surface of surfaces) { surface.style.transform = ''; surface.style.transition = ''; }
    for (const preview of previews.values()) {
      if (preview.element) {
        preview.element.style.visibility = 'hidden';
        preview.element.style.transition = '';
        preview.element.style.transform = '';
      }
    }
    incoming = null;
  }

  function finish(page) {
    cancelAnimationFrame(frame);
    frame = 0;
    gesture = null;
    if (!root.classList.contains('swipe-active')) {
      if (page) { navigating = true; window.location.assign(new URL(page, window.location.href).href); }
      return;
    }
    settling = true;
    suppressClickUntil = Date.now() + 400;
    const navigate = () => {
      if (blocked()) { reset(); return; }
      navigating = true;
      window.location.assign(new URL(page, window.location.href).href);
    };
    // Slow networks or data-saving mode must never delay navigation for a preview.
    if (page && (reducedMotion.matches || !incoming?.ready)) { navigate(); return; }
    if (reducedMotion.matches) { reset(); return; }
    const duration = page ? 190 : 220;
    const transition = `transform ${duration}ms cubic-bezier(.22, .8, .25, 1)`;
    for (const surface of surfaces) surface.style.transition = transition;
    if (incoming?.element) incoming.element.style.transition = transition;
    const end = page ? (offset < 0 ? -root.clientWidth : root.clientWidth) : 0;
    for (const surface of surfaces) surface.style.transform = `translate3d(${end}px, 0, 0)`;
    if (incoming?.ready) incoming.element.style.transform = `translate3d(${end + (offset < 0 ? root.clientWidth : -root.clientWidth)}px, 0, 0)`;
    // Keep the incoming preview visible until the new document replaces it.
    timer = setTimeout(() => page ? navigate() : reset(), duration + 30);
  }

  document.addEventListener('touchstart', event => {
    if (gesture) { reset(); return; }
    if (settling || navigating || event.touches.length !== 1 || blocked() || event.target.closest(interactive) || hasHorizontalScroll(event.target)) return;
    const touch = event.touches[0];
    // Keep native browser back/forward gestures at the screen edges.
    if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp, scroll: window.scrollY, locked: false };
    warmNeighbours();
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!gesture) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== gesture.id || blocked() || Math.abs(window.scrollY - gesture.scroll) > 8) { reset(); return; }
    const dx = touch.clientX - gesture.x;
    const dy = Math.abs(touch.clientY - gesture.y);
    if (dy > 40 || (!gesture.locked && dy > 10 && dy >= Math.abs(dx))) { finish(null); return; }
    if (!gesture.locked) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < dy * 2) return;
      if (!event.cancelable) { reset(); return; }
      gesture.locked = true;
      if (!reducedMotion.matches) root.classList.add('swipe-active');
    }
    // Only a clearly horizontal gesture takes over; vertical scrolling and pinch zoom stay native.
    if (!event.cancelable) { reset(); return; }
    event.preventDefault();
    offset = dx;
    if (!reducedMotion.matches && !frame) frame = requestAnimationFrame(draw);
  }, { passive: false });

  document.addEventListener('touchend', event => {
    const start = gesture;
    if (!start) return;
    if (event.touches.length || blocked() || Math.abs(window.scrollY - start.scroll) > 8) { reset(); return; }
    const touch = Array.from(event.changedTouches).find(item => item.identifier === start.id);
    if (!touch) { reset(); return; }
    const dx = touch.clientX - start.x;
    const page = destination(window.location.pathname, dx, touch.clientY - start.y, event.timeStamp - start.time, window.innerWidth);
    if (start.locked && !reducedMotion.matches) { offset = dx; cancelAnimationFrame(frame); draw(); }
    finish(page);
  }, { passive: true });

  document.addEventListener('touchcancel', () => { if (gesture) finish(null); }, { passive: true });
  document.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  window.addEventListener('pageshow', reset);
  window.addEventListener('resize', reset);
  reducedMotion.addEventListener('change', reset);
  // Prepare only on touch devices, after the initial page has loaded.
  window.addEventListener('load', () => {
    if (window.matchMedia('(pointer: coarse)').matches) warmNeighbours();
  });
}());
