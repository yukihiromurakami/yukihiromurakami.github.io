(function () {
  'use strict';

  // Navigation stays inside this static site, including GitHub Pages project paths.
  const pages = Object.freeze([
    { name: 'Home', path: 'index.html' },
    { name: 'Research', path: 'research.html' },
    { name: 'Education', path: 'education.html' },
    { name: 'Events-Talks', path: 'organization.html' },
    { name: 'CV', path: 'cv.html' }
  ]);
  const sectionDefinitions = {
    Research: [['Preprints', 'preprints'], ['Publications', 'journal-publications'], ['Thesis', 'doctoral-thesis']],
    Education: [['Projects', 'projects'], ['Supervision', 'supervision'], ['Postdoc', 'postdoc'], ['PhD', 'phd'], ['MSc', 'msc-theses'], ['BSc', 'bsc-theses'], ['Lectures', 'lectures'], ['Exercise-Classes', 'exercise-classes']],
    'Events-Talks': [['Events', 'events'], ['Talks', 'talks']],
    CV: [['Appointment', 'appointments'], ['Education', 'qualifications'], ['Research', 'interests'], ['Service', 'education-service']]
  };
  const directories = [{ name: '/', directory: '/', path: 'index.html', parent: null }];
  for (const page of pages.filter(page => page.name !== 'Home')) {
    const directory = '/' + page.name;
    directories.push({ ...page, directory, parent: '/' });
    for (const [name, anchor] of sectionDefinitions[page.name]) {
      directories.push({ name, directory: directory + '/' + name, path: page.path + '#' + anchor, parent: directory, anchor });
    }
  }
  const summerDirectory = '/Education/Summer School';
  directories.push({ name: 'Summer School', directory: summerDirectory, path: 'summer-school.html', parent: '/Education' });
  for (const [name, anchor] of [['Overview', 'overview'], ['Programme', 'programme'], ['My-Role', 'my-role'], ['Practical', 'practical']]) {
    directories.push({ name, directory: summerDirectory + '/' + name, path: 'summer-school.html#' + anchor, parent: summerDirectory, anchor });
  }
  directories.forEach(Object.freeze);
  Object.freeze(directories);
  const unquote = text => text.trim().replace(/^(?:"(.*)"|'(.*)')$/, '$1$2');
  const children = directory => directories.filter(item => item.parent === directory);
  const findDirectory = directory => directories.find(item => item.directory === directory);

  function resolveDirectory(raw, currentDirectory = '/') {
    const target = unquote(raw);
    if (!target) return findDirectory(currentDirectory);
    if (/[:?#\\]/.test(target)) return null;
    const absolute = target.startsWith('/') || target === '~' || target.startsWith('~/');
    const parts = target.replace(/^~(?=\/|$)/, '').split('/');
    function walk(base) {
      let current = findDirectory(base);
      for (const part of parts) {
        if (!part || part === '.') continue;
        if (!current) return null;
        if (part === '..') { current = findDirectory(current.parent || '/'); continue; }
        current = children(current.directory).find(item => item.name === part) || null;
      }
      return current || null;
    }
    return walk(absolute ? '/' : currentDirectory);
  }

  function directoryFromLocation(pathname, hash = '') {
    const filename = pathname.split('/').pop() || 'index.html';
    const page = directories.find(item => item.path === filename);
    if (!page) return '/';
    let anchor;
    try { anchor = decodeURIComponent(hash.replace(/^#/, '')); } catch { anchor = ''; }
    const section = directories.find(item => item.path === filename + '#' + anchor);
    return section ? section.directory : page.directory;
  }

  function interpret(raw, currentDirectory = '/') {
    const text = raw.trim();
    if (!text) return { type: 'empty' };
    const [, command, argument = ''] = text.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    const action = command;
    // Deliberately omitted from the regular help and page-completion lists.
    if (action === 'burn') return { type: 'burn', argument };
    if (action === '67') {
      if (argument) return { type: 'error', message: '67 does not take an argument.' };
      return { type: 'wiper' };
    }
    if (action === 'cd' || action === 'ls') {
      const destination = resolveDirectory(argument || (action === 'cd' ? '~' : '.'), currentDirectory);
      if (!destination) return { type: 'error', message: `Directory not found: ${argument}. Type ls for this directory or ls / for main pages.` };
      if (action === 'cd') return { type: 'navigate', path: destination.path };
      return { type: 'ls', entries: children(destination.directory) };
    }
    if (['help', 'pwd', 'clear', 'exit'].includes(action)) {
      if (argument) return { type: 'error', message: `${action} does not take an argument.` };
      return { type: action };
    }
    return { type: 'error', message: `Unknown command: ${command}. Try cd /Education or type help.` };
  }

  function complete(raw, currentDirectory = '/') {
    const match = raw.match(/^(?:cd|ls)\s+(.*)$/);
    if (!match) return [];
    const quote = ['"', "'"].includes(match[1][0]) ? match[1][0] : '';
    const target = quote ? match[1].slice(1).replace(new RegExp(quote + '$'), '') : match[1];
    const slash = target.lastIndexOf('/');
    const prefix = target.slice(slash + 1);
    let candidates;
    let outputPrefix = '';
    if (slash >= 0) {
      const parentText = target.slice(0, slash + 1);
      const parent = resolveDirectory(parentText, currentDirectory);
      if (!parent) return [];
      candidates = children(parent.directory).map(item => item.name);
      if (/^(?:\.\.?\/|~\/)/.test(parentText)) outputPrefix = parentText;
      else if (target.startsWith('/')) outputPrefix = parent.directory.replace(/\/$/, '') + '/';
      else {
        const localPrefix = currentDirectory === '/' ? '/' : currentDirectory + '/';
        const relative = parent.directory.startsWith(localPrefix) ? parent.directory.slice(localPrefix.length) : parent.directory.slice(1);
        outputPrefix = relative ? relative + '/' : '';
      }
    } else {
      candidates = children(currentDirectory).map(item => item.name);
    }
    return candidates.filter(name => name.startsWith(prefix)).map(name => {
      const path = outputPrefix + name;
      const delimiter = quote || (/\s/.test(path) ? '"' : '');
      return delimiter + path + delimiter;
    });
  }

  function terminalNavigation(path, currentUrl) {
    const current = new URL(currentUrl);
    const destination = new URL(path, current);
    const samePage = destination.origin === current.origin && destination.pathname === current.pathname;
    if (samePage) {
      current.hash = destination.hash;
      return { samePage, url: current.href };
    }
    destination.searchParams.set('_terminal', 'open');
    return { samePage, url: destination.href };
  }

  // The same command resolver is exercised by the local checks without a browser.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { interpret, complete, pages, directories, directoryFromLocation, terminalNavigation };
    return;
  }

  const panel = document.getElementById('command-panel');
  const launcher = document.querySelector('.command-launcher');
  if (!panel || !launcher || typeof panel.showModal !== 'function') return;
  const input = document.getElementById('command-input');
  const output = document.getElementById('command-output');
  let currentDirectory;
  function updateDirectory() {
    currentDirectory = directoryFromLocation(window.location.pathname, window.location.hash);
    document.getElementById('command-location').textContent = '~' + currentDirectory;
  }
  updateDirectory();
  window.addEventListener('hashchange', updateDirectory);
  launcher.hidden = false;
  let previousFocus = null;
  const history = [];
  let historyPosition = 0;
  let draft = '';
  let burnGame = null;
  let wiperAnimation = null;

  function stopWiper() {
    if (wiperAnimation) wiperAnimation.cancel();
    wiperAnimation = null;
  }

  function sweepTerminal() {
    stopWiper();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      print('67. (Reduced motion is enabled.)');
      return;
    }
    // Pivot around the bottom edge, leaving room for the upper corners to swing.
    const angle = 6;
    const clearance = Math.ceil(panel.offsetWidth * Math.sin(angle * Math.PI / 180) / 2);
    const frames = [
      { transform: 'translateY(0) rotate(0deg)', offset: 0 },
      { transform: `translateY(${clearance}px) rotate(-${angle}deg)`, offset: .18 },
      { transform: `translateY(${clearance}px) rotate(${angle}deg)`, offset: .36 },
      { transform: `translateY(${clearance}px) rotate(-${angle}deg)`, offset: .54 },
      { transform: `translateY(${clearance}px) rotate(${angle}deg)`, offset: .72 },
      { transform: 'translateY(0) rotate(0deg)', offset: 1 }
    ].map(frame => ({ ...frame, transformOrigin: '50% 100%', easing: 'ease-in-out' }));
    const animation = panel.animate(frames, { duration: 1200 });
    wiperAnimation = animation;
    animation.onfinish = () => {
      if (wiperAnimation === animation) stopWiper();
    };
  }

  function runBurn(argument) {
    if (!burnGame) {
      const root = document.getElementById('burn-game');
      if (!root || !window.BurnPuzzle) {
        print('The puzzle could not load. Refresh the page and try burn again.', 'command-error');
        return;
      }
      burnGame = window.BurnPuzzle.mount(root, {
        report: message => print(message, 'command-error'),
        focusInput: () => input.focus({ preventScroll: true }),
        onVisibility: visible => {
          panel.classList.toggle('command-playing', visible);
          input.placeholder = visible ? 'burn A' : 'cd /Education';
        }
      });
    }
    burnGame.run(argument);
  }

  function openPanel() {
    const focused = document.activeElement;
    previousFocus = focused && focused !== document.body && focused !== document.documentElement ? focused : launcher;
    panel.showModal();
    document.documentElement.classList.add('command-open');
    input.focus();
  }
  function closePanel() { panel.close(); }
  function navigateInTerminal(path) {
    const destination = terminalNavigation(path, window.location.href);
    if (destination.samePage) {
      window.location.hash = new URL(destination.url).hash;
      updateDirectory();
      input.focus({ preventScroll: true });
    } else {
      window.location.assign(destination.url);
    }
  }
  function print(message, className = '') {
    const line = document.createElement('p');
    line.textContent = message;
    line.className = className;
    output.append(line);
    while (output.children.length > 60) output.firstElementChild.remove();
    output.scrollTop = output.scrollHeight;
  }
  function printDirectory(entries) {
    if (!entries.length) { print('No subdirectories. Use cd .. to go up.'); return; }
    const list = document.createElement('p');
    list.className = 'command-pages';
    entries.forEach(page => {
      const link = document.createElement('a');
      link.href = page.path;
      link.textContent = page.name + '/';
      link.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigateInTerminal(page.path);
      });
      list.append(link);
    });
    output.append(list);
    while (output.children.length > 60) output.firstElementChild.remove();
    output.scrollTop = output.scrollHeight;
  }

  launcher.addEventListener('click', openPanel);
  panel.querySelector('.command-close').addEventListener('click', closePanel);
  panel.addEventListener('close', () => {
    stopWiper();
    document.documentElement.classList.remove('command-open');
    (previousFocus && previousFocus.isConnected ? previousFocus : launcher).focus({ preventScroll: true });
  });
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    const bounds = panel.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closePanel();
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.key !== '`') return;
    const target = event.target;
    const editing = target instanceof Element && (target.closest('input, textarea, select') || target.isContentEditable);
    if (!panel.open && editing) return;
    event.preventDefault();
    if (panel.open) closePanel(); else openPanel();
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Tab' && !event.shiftKey) {
      const matches = complete(input.value, currentDirectory);
      const command = input.value.match(/^\S+/)?.[0] || 'cd';
      if (matches.length === 1 && input.value !== command + ' ' + matches[0]) {
        event.preventDefault();
        input.value = command + ' ' + matches[0];
      } else if (matches.length > 1) {
        event.preventDefault();
        print(matches.join('  '));
      }
    }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && history.length) {
      event.preventDefault();
      if (historyPosition === history.length) draft = input.value;
      historyPosition = Math.max(0, Math.min(history.length, historyPosition + (event.key === 'ArrowUp' ? -1 : 1)));
      input.value = historyPosition === history.length ? draft : history[historyPosition];
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  document.getElementById('command-form').addEventListener('submit', event => {
    event.preventDefault();
    const raw = input.value.trim();
    updateDirectory();
    const result = interpret(raw, currentDirectory);
    if (result.type === 'empty') return;
    history.push(raw);
    if (history.length > 50) history.shift();
    historyPosition = history.length;
    draft = '';
    input.value = '';
    if (result.type === 'clear') { output.replaceChildren(); if (burnGame) burnGame.hide(); return; }
    if (result.type === 'exit') { closePanel(); return; }
    if (result.type === 'navigate') {
      print('> ' + raw, 'command-echo');
      navigateInTerminal(result.path);
      return;
    }
    print('> ' + raw, 'command-echo');
    if (result.type === 'wiper') { sweepTerminal(); input.focus({ preventScroll: true }); return; }
    if (result.type === 'burn') { runBurn(result.argument); input.focus(); return; }
    if (result.type === 'error') print(result.message, 'command-error');
    if (result.type === 'pwd') print(currentDirectory);
    if (result.type === 'ls') printDirectory(result.entries);
    if (result.type === 'help') {
      print('ls                 List this directory\nls /               List the main pages\ncd /Education      Open Education\ncd Lectures        Open a section of Education\ncd ../MSc          Open a sibling section\ncd ..              Go up one level\ncd ~               Return home\npwd                Show the current directory\nclear              Clear this panel\nexit               Close this panel\nNames are case-sensitive. Relative paths start in the current directory. Tab completes cd and ls paths.');
    }
    input.focus();
  });
  // Carry the open panel across a document navigation, then remove the marker
  // so ordinary reloads and bookmarked page URLs retain their normal behavior.
  const arrival = new URL(window.location.href);
  if (arrival.searchParams.get('_terminal') === 'open') {
    arrival.searchParams.delete('_terminal');
    window.history.replaceState(window.history.state, '', arrival.href);
    openPanel();
  }
}());
