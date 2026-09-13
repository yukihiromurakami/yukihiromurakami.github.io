(function () {
  'use strict';

  const pages = Object.freeze(['index.html', 'research.html', 'education.html', 'organization.html']);

  function destination(pathname, dx, dy, duration, width) {
    const page = pathname.split('/').pop() || 'index.html';
    const index = pages.indexOf(page);
    if (index < 0 || width > 950 || duration < 0 || duration > 700) return null;
    if (Math.abs(dx) < Math.max(72, width * 0.18) || Math.abs(dy) > 40 || Math.abs(dx) < Math.abs(dy) * 2) return null;
    return pages[index + (dx < 0 ? 1 : -1)] || null;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { destination };
    return;
  }

  let gesture = null;
  let navigating = false;
  const interactive = 'a, button, input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], dialog, video, audio, iframe';
  const editing = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
  const blocked = () => window.innerWidth > 950 || navigating ||
    document.documentElement.classList.contains('command-open') || document.querySelector('dialog[open]') ||
    window.getSelection()?.isCollapsed === false || document.activeElement?.closest(editing);

  function hasHorizontalScroll(element) {
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      if (current.scrollWidth > current.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(current).overflowX)) return true;
    }
    return false;
  }

  // Passive touch listeners preserve native scrolling, zooming, and browser gestures.
  document.addEventListener('touchstart', event => {
    gesture = null;
    if (event.touches.length !== 1 || blocked() || event.target.closest(interactive) || hasHorizontalScroll(event.target)) return;
    const touch = event.touches[0];
    // Leave screen-edge gestures to the browser's back/forward navigation.
    if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp, scroll: window.scrollY };
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!gesture) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== gesture.id || blocked()) { gesture = null; return; }
    const dx = Math.abs(touch.clientX - gesture.x);
    const dy = Math.abs(touch.clientY - gesture.y);
    if (dy > 40 || (dy > 12 && dy > dx)) gesture = null;
  }, { passive: true });

  document.addEventListener('touchend', event => {
    const start = gesture;
    gesture = null;
    if (!start || event.touches.length || blocked() || Math.abs(window.scrollY - start.scroll) > 8) return;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === start.id);
    if (!touch) return;
    const page = destination(window.location.pathname, touch.clientX - start.x, touch.clientY - start.y, event.timeStamp - start.time, window.innerWidth);
    if (page) {
      navigating = true;
      window.location.assign(new URL(page, window.location.href).href);
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
  window.addEventListener('pageshow', () => { navigating = false; gesture = null; });
}());
