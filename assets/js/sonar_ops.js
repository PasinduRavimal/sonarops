(function () {
  const aspectEl = document.getElementById('aspectRatio');
  const rowsEl = document.getElementById('rows');
  const colsEl = document.getElementById('cols');
  const buildBtn = document.getElementById('buildBtn');
  const controls = document.getElementById('controls');
  const gridHolder = document.getElementById('gridHolder');
  const sonarOps = document.getElementById('sonarOps');
  const squareHint = document.getElementById('squareHint');
  const valueInput = document.getElementById('valueInput');
  const addValueBtn = document.getElementById('addValueBtn');
  const valuesBody = document.getElementById('valuesBody');
  const strategyEl = document.getElementById('strategySelect');
  // Modal elements
  const cellModal = document.getElementById('cellModal');
  const modalYes = document.getElementById('modalYes');
  const modalNo = document.getElementById('modalNo');
  const modalCancel = document.getElementById('modalCancel');
  const modalText = document.getElementById('modalText');

  // Overrides map: key `${r},${c}` -> 0 or 1; persists until grid is rebuilt
  let useroverrides = {};
  let overrides = {};
  let currentmap = {}; // 0: unknown, 1: miss, 2: hit
  let pendingCell = null; // { r, c }
  let currentMode = 0;
  let lasthit = null;

  // Custom Toast Notifications
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
      alert(message);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'danger') icon = '⚠';
    toast.innerHTML = `<span style="font-weight:bold; font-size:1.1rem; line-height:1;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));
    
    // Remove after timeout
    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
  }

  function alertUser(message) {
    showToast(message, 'danger');
  }

  // Custom Promise-based Confirmation Modal
  function confirmAction(message, subtext = '') {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const textEl = document.getElementById('confirmText');
      const subtextEl = document.getElementById('confirmSubtext');
      const yesBtn = document.getElementById('confirmYes');
      const noBtn = document.getElementById('confirmNo');
      
      if (!modal || !yesBtn || !noBtn) {
        resolve(window.confirm(message + (subtext ? '\n' + subtext : '')));
        return;
      }
      
      textEl.textContent = message;
      subtextEl.textContent = subtext;
      modal.hidden = false;
      
      const onYes = () => {
        modal.hidden = true;
        cleanup();
        resolve(true);
      };
      const onNo = () => {
        modal.hidden = true;
        cleanup();
        resolve(false);
      };
      
      const cleanup = () => {
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
      };
      
      yesBtn.addEventListener('click', onYes);
      noBtn.addEventListener('click', onNo);
    });
  }

  // Heatmap Radar Color Scale
  function getHeatmapColor(p) {
    if (p <= 0.02) {
      return 'rgba(16, 24, 48, 0.4)';
    }
    // Deep Ocean Submarine Radar scale
    // Starts at navy-blue, goes cyan at 0.4, yellow-green at 0.7, hot neon pink at 1.0
    let h, s, l, a;
    if (p < 0.4) {
      const t = (p - 0.02) / 0.38; // [0, 1]
      h = Math.round(220 - 40 * t); // 220 down to 180
      s = 90;
      l = Math.round(20 + 30 * t); // 20% to 50%
      a = 0.4 + 0.5 * t; // opacity increases
      return `hsla(${h}, ${s}%, ${l}%, ${a})`;
    } else {
      const t = (p - 0.4) / 0.6; // [0, 1]
      h = Math.round(180 - 190 * t); // 180 down to -10 (which is 350, red/pink)
      if (h < 0) h = 360 + h;
      s = 100;
      l = Math.round(50 + 5 * t); // 50% to 55%
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }

  function setInitialState() {
    // Default to square: disable columns, show hint
    if (aspectEl.value === 'square') {
      colsEl.disabled = true;
      squareHint.style.display = 'block';
    } else {
      colsEl.disabled = false;
      squareHint.style.display = 'none';
    }
  }

  function handleAspectChange() {
    if (aspectEl.value === 'square') {
      colsEl.value = '';
      colsEl.disabled = true;
      squareHint.style.display = 'block';
    } else {
      colsEl.disabled = false;
      squareHint.style.display = 'none';
    }
  }

  function clampInt(val) {
    const n = parseInt(val, 10);
    return isNaN(n) ? NaN : Math.max(1, n);
  }

  function parseAnyInt(val) {
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  }

  function sortValuesTable() {
    const rows = Array.from(valuesBody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const av = parseInt(a.firstChild.textContent, 10);
      const bv = parseInt(b.firstChild.textContent, 10);
      if (isNaN(av) && isNaN(bv)) return 0;
      if (isNaN(av)) return 1;
      if (isNaN(bv)) return -1;
      return av - bv;
    });
    // Re-append in sorted order
    valuesBody.innerHTML = '';
    rows.forEach(r => valuesBody.appendChild(r));
  }

  function updateHeatmap(mode, x, y) {
    // If grid not yet built, nothing to update
    const grid = gridHolder.querySelector('.grid');
    if (!grid) return;

    const isSquare = aspectEl.value === 'square';
    const rows = clampInt(rowsEl.value);
    const cols = isSquare ? rows : clampInt(colsEl.value);
    if (isNaN(rows) || isNaN(cols)) return;

    // Build boats array from table
    const boats = Array.from(valuesBody.querySelectorAll('tr'))
      .filter((tr) => !tr.classList.contains('destroyed'))
      .map((tr) => parseInt(tr.firstChild.textContent, 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    const strategy = strategyEl ? parseAnyInt(strategyEl.value) : 0;
    const probs = (window.sonarRules && window.sonarRules.generateHeatmap)
      ? window.sonarRules.generateHeatmap(strategy, rows, cols, boats, currentmap, mode, x, y)
      : Array.from({ length: rows }, () => Array(cols).fill(0));

    // Apply colors and labels to existing cells (respect overrides)
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        const p = key in overrides ? overrides[key] : probs[r][c];
        const cell = grid.children[idx++];
        if (!cell) break;
        
        // apply UX border classes
        cell.classList.remove('cell-hit', 'cell-miss');
        if (key in useroverrides) {
          if (useroverrides[key] === 1) cell.classList.add('cell-hit');
          else if (useroverrides[key] === 0) cell.classList.add('cell-miss');
        }
        
        // Set dynamic heatmap color scale
        cell.style.backgroundColor = getHeatmapColor(p);
        
        const span = cell.firstChild;
        if (span) {
          span.textContent = (p > 0 ? p.toFixed(2) : '');
          // Choose text color based on readability over background
          span.style.color = (p > 0.4 ? '#070b13' : '#f8fafc');
        }
      }
    }
  }

  function buildGrid() {
    const isSquare = aspectEl.value === 'square';
    const rows = clampInt(rowsEl.value);
    let cols = clampInt(colsEl.value);

    if (isSquare) {
      if (isNaN(rows)) {
        alertUser('Please enter a valid number of rows for square grid.');
        rowsEl.focus();
        return;
      }
      cols = rows; // mirror rows for square
    } else {
      if (isNaN(rows) || isNaN(cols)) {
        alertUser('Please enter valid integers for rows and columns.');
        if (isNaN(rows)) rowsEl.focus(); else colsEl.focus();
        return;
      }
    }

    // Prepare UI layout and animations
    sonarOps.classList.add('two-col');

    // Build grid
    const grid = document.createElement('div');
    grid.className = 'grid';

    // Compute cell size to fit without overflow
    // Account for grid gap of 8px
    const GAP = 8;
    const holderWidth = gridHolder.clientWidth;
    const holderHeight = gridHolder.clientHeight;
    const cellWidth = Math.floor((holderWidth - GAP * (cols - 1)) / cols);
    const cellHeight = Math.floor((holderHeight - GAP * (rows - 1)) / rows);
    const cellSize = Math.max(1, Math.min(cellWidth, cellHeight));

    grid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    grid.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;

    const total = rows * cols;
    for (let i = 0; i < total; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.width = `${cellSize}px`;
      cell.style.height = `${cellSize}px`;
      
      // label for probability
      const label = document.createElement('span');
      label.style.fontSize = cellSize > 35 ? '10px' : '8px';
      label.style.display = 'block';
      label.style.textAlign = 'center';
      label.style.lineHeight = `${cellSize}px`;
      cell.appendChild(label);
      
      // Attach click to open modal and set pending cell
      const r = Math.floor(i / cols);
      const c = i % cols;
      cell.addEventListener('click', function () {
        pendingCell = { r, c };
        if (modalText) modalText.textContent = `Was there a boat in cell (${r + 1}, ${c + 1})?`;
        if (cellModal) cellModal.hidden = false;
      });
      grid.appendChild(cell);
    }

    // Replace content with new grid and reset overrides
    useroverrides = {};
    overrides = {};
    currentmap = Array.from({ length: rows }, () => Array(cols).fill(0));
    gridHolder.innerHTML = '';
    gridHolder.appendChild(grid);

    // Compute heatmap probabilities from boats table
    const boats = Array.from(document.querySelectorAll('#valuesBody tr'))
      .filter((tr) => !tr.classList.contains('destroyed'))
      .map((tr) => parseInt(tr.firstChild.textContent, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    const strategy = strategyEl ? parseAnyInt(strategyEl.value) : 0;
    const probs = (window.sonarRules && window.sonarRules.generateHeatmap)
      ? window.sonarRules.generateHeatmap(strategy, rows, cols, boats, currentmap, currentMode, 0, 0)
      : Array.from({ length: rows }, () => Array(cols).fill(0));

    // Render heatmap colors (respect overrides)
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        const p = key in overrides ? overrides[key] : probs[r][c];
        const cell = grid.children[idx++];
        
        cell.classList.remove('cell-hit', 'cell-miss');
        if (key in useroverrides) {
          if (useroverrides[key] === 1) cell.classList.add('cell-hit');
          else if (useroverrides[key] === 0) cell.classList.add('cell-miss');
        }
        
        cell.style.backgroundColor = getHeatmapColor(p);
        
        const span = cell.firstChild;
        if (span) {
          span.textContent = (p > 0 ? p.toFixed(2) : '');
          span.style.color = (p > 0.4 ? '#070b13' : '#f8fafc');
        }
      }
    }

    // Reveal grid
    requestAnimationFrame(() => {
      gridHolder.classList.add('visible');
    });
    
    showToast(`Grid initialized (${rows} × ${cols})`, 'success');
  }

  // Modal actions
  if (modalYes) {
    modalYes.addEventListener('click', async function () {
      if (pendingCell) {
        // Cache coords BEFORE clearing pendingCell
        const pr = pendingCell.r;
        const pc = pendingCell.c;
        useroverrides[`${pr},${pc}`] = 1;
        overrides[`${pr},${pc}`] = 1;
        currentmap[pr][pc] = 2;
        cellModal.hidden = true;
        pendingCell = null;
        
        // Auto-destroy detection: compute longest contiguous line through hits
        const isSquare = aspectEl.value === 'square';
        const rows = clampInt(rowsEl.value);
        const cols = isSquare ? rows : clampInt(colsEl.value);
        
        function longestFrom(r, c) {
          let h = 1, v = 1;
          // left
          for (let cc = c - 1; cc >= 0 && useroverrides[`${r},${cc}`] === 1; cc--) h++;
          // right
          for (let cc = c + 1; cc < cols && useroverrides[`${r},${cc}`] === 1; cc++) h++;
          // up
          for (let rr = r - 1; rr >= 0 && useroverrides[`${rr},${c}`] === 1; rr--) v++;
          // down
          for (let rr = r + 1; rr < rows && useroverrides[`${rr},${c}`] === 1; rr++) v++;
          return Math.max(h, v);
        }
        
        const L = longestFrom(pr, pc);
        currentMode = 1;
        lasthit = { r: pr, c: pc };
        
        // Check if a boat of length L exists and is not destroyed
        const rowsEls = Array.from(document.querySelectorAll('#valuesBody tr'));
        const candidates = rowsEls.filter(tr => !tr.classList.contains('destroyed') && parseInt(tr.firstChild.textContent, 10) === L);
        
        if (candidates.length > 0) {
          // Custom modal confirmation instead of window.confirm
          const answer = await confirmAction(
            `Mark a boat of length ${L} as destroyed?`,
            `This will apply ship separation safety zones around the vessel.`
          );
          
          if (answer) {
            candidates[0].classList.add('destroyed');
            // Check if there are still active hits on the board
            let activeHitsExist = false;
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                if (currentmap[r][c] === 2) {
                  activeHitsExist = true;
                  break;
                }
              }
              if (activeHitsExist) break;
            }
            currentMode = activeHitsExist ? 1 : 0;

            let length = parseAnyInt(candidates[0].firstChild.textContent, 10);
            if (length !== null) { 
              let shipx = [];
              let shipy = [];
              let count = 0;
              for (let r = pr; r < rows; r++) {
                if (currentmap[r][pc] === 2) {
                  shipy.push(r);
                  shipx.push(pc);
                  count++;
                } else {
                  break;
                }
              }

              for (let r = pr - 1; r >= 0; r--) {
                if (currentmap[r][pc] === 2) {
                  shipy.push(r);
                  shipx.push(pc);
                  count++;
                } else {
                  break;
                }
              }

              if (count !== length) {
                shipx = [];
                shipy = [];
                count = 0;

                for (let c = pc; c < cols; c++) {
                  if (currentmap[pr][c] === 2) {
                    shipy.push(pr);
                    shipx.push(c);
                    count++;
                  } else {
                    break;
                  }
                }

                for (let c = pc - 1; c >= 0; c--) {
                  if (currentmap[pr][c] === 2) {
                    shipy.push(pr);
                    shipx.push(c);
                    count++;
                  } else {
                    break;
                  }
                }
              }

              if (count !== length) {
                showToast('Internal error: hit count does not match boat length.', 'danger');
                return;
              }

              for (let i = 0; i < shipx.length; i++) {
                if (currentmap[shipy[i]][shipx[i]] === 2) {
                  // Mark this hit as belonging to a destroyed boat (value 3)
                  currentmap[shipy[i]][shipx[i]] = 3;
                  
                  // Mark surrounding cells as misses for separation rule
                  if (shipy[i] - 1 >= 0 && currentmap[shipy[i] - 1][shipx[i]] === 0) {
                    currentmap[shipy[i] - 1][shipx[i]] = 1;
                  }
                  if (shipy[i] + 1 < rows && currentmap[shipy[i] + 1][shipx[i]] === 0) {
                    currentmap[shipy[i] + 1][shipx[i]] = 1;
                  }
                  if (shipx[i] - 1 >= 0 && currentmap[shipy[i]][shipx[i] - 1] === 0) {
                    currentmap[shipy[i]][shipx[i] - 1] = 1;
                  }
                  if (shipx[i] + 1 < cols && currentmap[shipy[i]][shipx[i] + 1] === 0) {
                    currentmap[shipy[i]][shipx[i] + 1] = 1;
                  }
                  if (shipy[i] - 1 >= 0 && shipx[i] - 1 >= 0 && currentmap[shipy[i] - 1][shipx[i] - 1] === 0) {
                    currentmap[shipy[i] - 1][shipx[i] - 1] = 1;
                  }
                  if (shipy[i] - 1 >= 0 && shipx[i] + 1 < cols && currentmap[shipy[i] - 1][shipx[i] + 1] === 0) {
                    currentmap[shipy[i] - 1][shipx[i] + 1] = 1;
                  }
                  if (shipy[i] + 1 < rows && shipx[i] - 1 >= 0 && currentmap[shipy[i] + 1][shipx[i] - 1] === 0) {
                    currentmap[shipy[i] + 1][shipx[i] - 1] = 1;
                  }
                  if (shipy[i] + 1 < rows && shipx[i] + 1 < cols && currentmap[shipy[i] + 1][shipx[i] + 1] === 0) {
                    currentmap[shipy[i] + 1][shipx[i] + 1] = 1;
                  }
                }
              }
              
              showToast(`Boat of length ${L} confirmed destroyed!`, 'success');
              console.table(currentmap);
            }
          }
        }
        
        // Mark hits/misses also on overrides grid for sync
        updateHeatmap(currentMode, pr, pc);
      }
    });
  }
  if (modalNo) {
    modalNo.addEventListener('click', function () {
      if (pendingCell) {
        useroverrides[`${pendingCell.r},${pendingCell.c}`] = 0;
        overrides[`${pendingCell.r},${pendingCell.c}`] = 0;
        currentmap[pendingCell.r][pendingCell.c] = 1;
        cellModal.hidden = true;
        pendingCell = null;

        if (currentMode !== 0) {
          updateHeatmap(3, lasthit.r, lasthit.c);
          return;
        }
        updateHeatmap(currentMode, 0, 0);
      }
    });
  }
  if (modalCancel) {
    modalCancel.addEventListener('click', function () {
      cellModal.hidden = true;
      pendingCell = null;
    });
  }

  // Events
  aspectEl.addEventListener('change', handleAspectChange);
  buildBtn.addEventListener('click', buildGrid);
  if (strategyEl) {
    strategyEl.addEventListener('change', function () {
      // Regenerate heatmap when strategy changes
      updateHeatmap(currentMode, lasthit ? lasthit.r : 0, lasthit ? lasthit.c : 0);
      showToast(`Switched strategy: ${strategyEl.options[strategyEl.selectedIndex].text}`, 'info');
    });
  }
  addValueBtn.addEventListener('click', function () {
    const v = parseAnyInt(valueInput.value);
    if (v === null) {
      alertUser('Please enter a valid boat count (integer).');
      valueInput.focus();
      return;
    }
    // Validate against current rows/cols settings: boat count must be <= rows and <= cols
    const isSquare = aspectEl.value === 'square';
    const rows = clampInt(rowsEl.value);
    const colsCandidate = isSquare ? rows : clampInt(colsEl.value);
    if (isNaN(rows) || isNaN(colsCandidate)) {
      alertUser('Please set valid rows and columns before adding boats.');
      return;
    }
    const maxAllowed = Math.min(rows, colsCandidate);
    if (v > maxAllowed) {
      alertUser(`Boat value cannot exceed ${maxAllowed} (rows and columns constraint).`);
      valueInput.focus();
      return;
    }
    const tr = document.createElement('tr');
    const tdVal = document.createElement('td');
    const tdAct = document.createElement('td');
    tdVal.textContent = String(v);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-sm btn-danger';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', function () {
      tr.remove();
      // Repaint heatmap after deletion
      updateHeatmap(0, 0, 0);
      showToast(`Removed boat of size ${v}`, 'info');
    });
    tdAct.appendChild(removeBtn);
    tr.appendChild(tdVal);
    tr.appendChild(tdAct);
    valuesBody.appendChild(tr);
    sortValuesTable();
    valueInput.value = '';
    valueInput.focus();
    // Update heatmap to reflect new boats list
    updateHeatmap(0, 0, 0);
    showToast(`Added boat of size ${v}`, 'success');
  });

  // Init
  setInitialState();
})();
