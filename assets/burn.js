(function () {
  'use strict';

  const puzzles = [
    {
      name: 'A winding path', target: 3,
      points: [[14,17],[50,17],[86,17],[86,50],[50,50],[14,50],[14,83],[50,83],[86,83]],
      edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8]]
    },
    {
      name: 'Branching out', target: 3,
      points: [[50,14],[27,46],[73,46],[13,83],[38,83],[62,83],[87,83]],
      edges: [[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]]
    },
    {
      name: 'Around the ring', target: 4,
      points: Array.from({ length: 12 }, (_, i) => {
        const angle = i * Math.PI / 6 - Math.PI / 2;
        return [50 + 39 * Math.cos(angle), 50 + 37 * Math.sin(angle)];
      }),
      edges: Array.from({ length: 12 }, (_, i) => [i, (i + 1) % 12])
    }
  ];
  puzzles.forEach(puzzle => {
    puzzle.points.forEach(Object.freeze);
    puzzle.edges.forEach(Object.freeze);
    Object.freeze(puzzle.points);
    Object.freeze(puzzle.edges);
    Object.freeze(puzzle);
  });
  Object.freeze(puzzles);
  const label = index => String.fromCharCode(65 + index);

  function start(index = 0) {
    if (!Number.isInteger(index) || index < 0 || index >= puzzles.length) throw new RangeError('Unknown puzzle');
    return { index, round: 0, burned: [], ignitions: [], outcome: 'playing' };
  }

  function step(state, vertex) {
    const puzzle = puzzles[state.index];
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= puzzle.points.length) {
      return { state, error: `Choose a vertex from A to ${label(puzzle.points.length - 1)}.` };
    }
    if (state.outcome !== 'playing') return { state, error: 'This attempt is finished. Try burn reset or burn next.' };
    if (state.burned.includes(vertex)) return { state, error: `${label(vertex)} is already burned. Choose an unburned vertex.` };

    // Only the previous round's fire spreads. The new ignition waits one round.
    const before = new Set(state.burned);
    const burned = new Set(before);
    for (const [a, b] of puzzle.edges) {
      if (before.has(a)) burned.add(b);
      if (before.has(b)) burned.add(a);
    }
    burned.add(vertex);
    const round = state.round + 1;
    const outcome = burned.size === puzzle.points.length ? 'won' : round >= puzzle.target ? 'lost' : 'playing';
    return {
      state: {
        index: state.index, round,
        burned: [...burned].sort((a, b) => a - b),
        ignitions: [...state.ignitions, vertex], outcome
      }
    };
  }

  function mount(root, options) {
    let state = start();
    let renderedIndex = -1;
    const nodeButtons = [];
    const svgLines = [];
    function element(tag, className, content) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (content) node.textContent = content;
      return node;
    }
    const header = element('div', 'burn-header');
    const title = element('h3', 'burn-title');
    title.id = 'burn-title';
    const score = element('span', 'burn-score');
    header.append(title, score);
    const rules = element('p', 'burn-rules', 'Ignite one vertex per round. Earlier fires spread one edge; new fires wait until the next round.');
    rules.id = 'burn-rules';
    const board = element('div', 'burn-board');
    board.setAttribute('role', 'group');
    board.setAttribute('aria-label', 'Graph vertices. Click an unburned vertex to ignite it.');
    const status = element('p', 'burn-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const sequence = element('p', 'burn-sequence');
    const controls = element('div', 'burn-controls');
    for (const [text, command] of [['Retry', 'reset'], ['Next puzzle', 'next'], ['Leave game', 'quit']]) {
      const button = element('button', '', text);
      button.type = 'button';
      button.addEventListener('click', () => { run(command); options.focusControls(); });
      controls.append(button);
    }
    root.classList.add('burn-game');
    root.tabIndex = -1;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-labelledby', title.id);
    root.setAttribute('aria-describedby', rules.id);
    root.append(header, rules, board, status, sequence, controls);

    function drawBoard() {
      const puzzle = puzzles[state.index];
      board.replaceChildren();
      board.classList.toggle('burn-board-ring', state.index === 2);
      nodeButtons.length = 0;
      svgLines.length = 0;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      for (const [a, b] of puzzle.edges) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', puzzle.points[a][0]);
        line.setAttribute('y1', puzzle.points[a][1]);
        line.setAttribute('x2', puzzle.points[b][0]);
        line.setAttribute('y2', puzzle.points[b][1]);
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.append(line);
        svgLines.push(line);
      }
      board.append(svg);
      puzzle.points.forEach(([x, y], vertex) => {
        const button = element('button', 'burn-node', label(vertex));
        button.type = 'button';
        button.style.left = x + '%';
        button.style.top = y + '%';
        button.addEventListener('click', () => {
          play(vertex);
          options.focusControls();
        });
        nodeButtons.push(button);
        board.append(button);
      });
      renderedIndex = state.index;
    }

    function render() {
      const puzzle = puzzles[state.index];
      if (renderedIndex !== state.index) drawBoard();
      title.textContent = `burn / ${state.index + 1}: ${puzzle.name}`;
      score.textContent = `Round ${state.round}/${puzzle.target}`;
      nodeButtons.forEach((button, vertex) => {
        const burned = state.burned.includes(vertex);
        const ignited = state.ignitions.includes(vertex);
        const neighbors = puzzle.edges.flatMap(([a, b]) => a === vertex ? [b] : b === vertex ? [a] : []).map(label).join(', ');
        button.classList.toggle('is-burned', burned);
        button.classList.toggle('is-ignited', ignited);
        button.disabled = burned || state.outcome !== 'playing';
        button.textContent = label(vertex) + (burned ? ' ✓' : '');
        button.setAttribute('aria-label', `Vertex ${label(vertex)}; ${burned ? 'burned' : 'unburned'}; neighbors ${neighbors}`);
        button.title = `Vertex ${label(vertex)} · neighbors ${neighbors}`;
      });
      puzzle.edges.forEach(([a, b], index) => {
        svgLines[index].classList.toggle('is-burned', state.burned.includes(a) && state.burned.includes(b));
      });
      const remaining = puzzle.points.length - state.burned.length;
      status.classList.toggle('is-won', state.outcome === 'won');
      status.classList.toggle('is-lost', state.outcome === 'lost');
      if (state.outcome === 'won') status.textContent = `All ${puzzle.points.length} vertices burned in ${state.round} rounds. Optimal! Well played.`;
      else if (state.outcome === 'lost') status.textContent = `Out of rounds. ${remaining} ${remaining === 1 ? 'vertex remains' : 'vertices remain'} unburned. Try a different first spark.`;
      else status.textContent = `Goal: burn all ${puzzle.points.length} vertices in ${puzzle.target} rounds. ${state.burned.length} burned, ${remaining} remaining.`;
      sequence.textContent = state.ignitions.length ? `Your sparks: ${state.ignitions.map(label).join(' → ')} · ✓ = burned` : 'Click a vertex or type burn A. ✓ = burned';
    }

    function show() {
      root.hidden = false;
      options.onVisibility(true);
      render();
    }
    function hide() {
      root.hidden = true;
      options.onVisibility(false);
    }
    function play(vertex) {
      const result = step(state, vertex);
      if (result.error) { options.report(result.error); return; }
      state = result.state;
      render();
    }
    function run(argument = '') {
      const command = argument.trim().toLowerCase();
      if (command === 'quit') { hide(); return; }
      if (command === 'reset') state = start(state.index);
      else if (command === 'next') state = start((state.index + 1) % puzzles.length);
      else if (command && !/^[a-z]$/.test(command)) {
        options.report('Try burn A, burn reset, burn next, or burn quit.');
        return;
      }
      show();
      if (/^[a-z]$/.test(command)) play(command.charCodeAt(0) - 97);
    }
    return { run, hide };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { puzzles, start, step };
    return;
  }
  window.BurnPuzzle = Object.freeze({ mount });
}());
