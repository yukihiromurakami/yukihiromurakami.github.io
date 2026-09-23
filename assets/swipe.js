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
  let surfaces = Array.from(document.querySelectorAll('.page-shell, .site-footer'));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const previews = new Map();
  const pageCache = new Map();
  const metadataSelector = 'meta[name="description"], meta[property^="og:"], link[rel="canonical"]';
  let enhancedNavigation = false;
  let scrollTimer = 0;
  let animations = [];
  const interactive = 'a, button, input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], dialog, video, audio, iframe';
  const editing = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
  let gesture = null;
  let settling = false;
  let navigating = false;
  let frame = 0;
  let timer = 0;
  let offset = 0;
  let incoming = null;
  let velocity = 0;
  let gestureWidth = 0;
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

  function snapshot(doc) {
    const main = doc.querySelector('main.page-shell').cloneNode(true);
    main.style.removeProperty('transform');
    main.style.removeProperty('transition');
    return {
      main,
      title: doc.title,
      bodyClass: doc.body.className,
      stylesheet: doc.querySelector('link[rel="stylesheet"]').getAttribute('href'),
      metadata: Array.from(doc.querySelectorAll(metadataSelector), node => node.cloneNode(true))
    };
  }

  function saveScroll() {
    clearTimeout(scrollTimer);
    window.history.replaceState({ ...window.history.state, siteSwipe: {
      url: window.location.href, x: window.scrollX, y: window.scrollY
    } }, '', window.location.href);
  }

  function displayPage(page, entry, position = null) {
    reset();
    const main = document.importNode(entry.main, true);
    document.querySelector('main.page-shell').replaceWith(main);
    document.body.className = entry.bodyClass;
    document.title = entry.title;
    document.querySelectorAll(metadataSelector).forEach(node => node.remove());
    entry.metadata.forEach(node => document.head.append(document.importNode(node, true)));
    document.querySelectorAll('.main-nav a').forEach(link => {
      if (new URL(link.href).pathname.split('/').pop() === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    surfaces = Array.from(document.querySelectorAll('.page-shell, .site-footer'));
    // Avoid the site's normal smooth anchor scrolling during the page hand-off.
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    if (position) window.scrollTo(position.x, position.y);
    else {
      let anchor;
      try { anchor = document.getElementById(decodeURIComponent(window.location.hash.slice(1))); } catch { /* Invalid fragment. */ }
      if (anchor) anchor.scrollIntoView(); else window.scrollTo(0, 0);
    }
    root.style.scrollBehavior = previousScrollBehavior;
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    window.dispatchEvent(new Event('site:pagechange'));
    warmNeighbours();
  }

  function navigate(page) {
    if (blocked()) { reset(); return; }
    const entry = pageCache.get(page);
    const stylesheet = document.querySelector('link[rel="stylesheet"]')?.getAttribute('href');
    // Reuse the loaded content, avoiding a second load/paint at the end of every swipe.
    // A normal navigation remains the fallback for unavailable or differently styled pages.
    if (entry && entry.stylesheet === stylesheet && window.history?.pushState) {
      pageCache.set(window.location.pathname.split('/').pop() || 'index.html', snapshot(document));
      saveScroll();
      window.history.pushState(null, '', new URL(page, window.location.href).href);
      enhancedNavigation = true;
      window.history.scrollRestoration = 'manual';
      displayPage(page, entry, { x: 0, y: 0 });
      saveScroll();
    } else {
      navigating = true;
      window.location.assign(new URL(page, window.location.href).href);
    }
  }

  // A script-free, inaccessible preview lets the next page slide in alongside this one.
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
      pageCache.set(page, snapshot(doc));
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
    const width = gestureWidth || root.clientWidth;
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
    animations.forEach(animation => animation.cancel());
    animations = [];
    gesture = null;
    settling = navigating = false;
    offset = 0;
    velocity = 0;
    root.classList.remove('swipe-active');
    root.classList.remove('swipe-ready');
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
      root.classList.remove('swipe-ready');
      if (page) navigate(page);
      return;
    }
    settling = true;
    suppressClickUntil = Date.now() + 400;
    // Slow networks or data-saving mode must never delay navigation for a preview.
    if (page && (reducedMotion.matches || !incoming?.ready)) { navigate(page); return; }
    if (reducedMotion.matches) { reset(); return; }
    const width = gestureWidth || root.clientWidth;
    const end = page ? (offset < 0 ? -width : width) : 0;
    const distance = Math.abs(end - offset);
    const speed = Math.min(2, Math.abs(velocity));
    const duration = page ? Math.round(Math.max(220, Math.min(400, distance / (.8 + speed * .45)))) : 300;
    const slope = page ? Math.min(.75, speed * duration / Math.max(1, distance) * .33) : .15;
    const easing = `cubic-bezier(.33, ${slope}, .35, 1)`;
    const targets = surfaces.map(element => [element, end]);
    if (incoming?.ready) targets.push([incoming.element, end + (offset < 0 ? width : -width)]);
    const complete = () => page ? navigate(page) : reset();
    if (surfaces[0].animate) {
      animations = targets.map(([element, x]) => element.animate([
        { transform: element.style.transform }, { transform: `translate3d(${x}px, 0, 0)` }
      ], { duration, easing, fill: 'forwards' }));
      animations[0].onfinish = complete;
    } else {
      for (const [element, x] of targets) {
        element.style.transition = `transform ${duration}ms ${easing}`;
        element.style.transform = `translate3d(${x}px, 0, 0)`;
      }
      timer = setTimeout(complete, duration);
    }
  }

  document.addEventListener('touchstart', event => {
    if (gesture) { reset(); return; }
    if (settling || navigating || event.touches.length !== 1 || blocked() || event.target.closest(interactive) || hasHorizontalScroll(event.target)) return;
    const touch = event.touches[0];
    // Keep native browser back/forward gestures at the screen edges.
    if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    gestureWidth = root.clientWidth;
    velocity = 0;
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp, scroll: window.scrollY, locked: false,
      lastX: touch.clientX, lastTime: event.timeStamp };
    if (!reducedMotion.matches) root.classList.add('swipe-ready');
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
    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0) velocity = (touch.clientX - gesture.lastX) / elapsed;
    gesture.lastX = touch.clientX;
    gesture.lastTime = event.timeStamp;
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
    if (event.timeStamp - start.lastTime > 100) velocity = 0;
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
  window.addEventListener('scroll', () => {
    if (!enhancedNavigation || gesture || settling || navigating) return;
    clearTimeout(scrollTimer);
    const url = window.location.href;
    scrollTimer = setTimeout(() => { if (window.location.href === url) saveScroll(); }, 120);
  }, { passive: true });
  window.addEventListener('popstate', event => {
    if (!enhancedNavigation) return;
    clearTimeout(scrollTimer);
    const page = window.location.pathname.split('/').pop() || 'index.html';
    const entry = pageCache.get(page);
    if (!entry) { window.history.scrollRestoration = 'auto'; window.location.reload(); return; }
    document.querySelector('dialog[open]')?.close();
    const position = event.state?.siteSwipe;
    displayPage(page, entry, position?.url === window.location.href ? position : null);
  });
  reducedMotion.addEventListener('change', reset);
  // Prepare only on touch devices, after the initial page has loaded.
  window.addEventListener('load', () => {
    if (window.matchMedia('(pointer: coarse)').matches) warmNeighbours();
  });
}());
