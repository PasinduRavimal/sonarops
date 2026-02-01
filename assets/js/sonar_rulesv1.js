(function () {
  // Simple heuristic heatmap generator for boats placed horizontally/vertically.
  // Boats are represented as integer lengths.
  // Overrides can constrain placements: cells marked 0 cannot be part of any placement,
  // and if any cell is marked 1, we prefer placements that include at least one 1-cell.
  // mode: 0 = miss, 1 = hit
  function generateHeatmap(strategy, rows, cols, boats, overrides, mode, x, y) {
    // Enumerate candidate placements per boat and sample valid configurations.
    if (strategy === 0)
      return generateHeatmapWithRules(rows, cols, boats, overrides, mode, x, y);
    if (strategy === 1)
      return generateHeatmapWithSimulation(rows, cols, boats, overrides, mode, x, y);
    if (strategy === 2)
      return generateHeatmapWithPDF(rows, cols, boats, overrides, mode, x, y);
  }

  function generateHeatmapWithSimulation(rows, cols, boats, overrides, mode, x, y) {
    // Monte Carlo simulation: sample random valid board configurations
    // overrides is a 2D array: 0=unknown, 1=miss, 2=hit
    const MAX_SAMPLES = Math.min(10000, 1500 + rows * cols * 5);
    const counts = Array.from({ length: rows }, () => Array(cols).fill(0));
    
    // Fisher-Yates shuffle to randomize candidate order
    function shuffle(array) {
      const arr = array.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    
    // Collect misses and hits from overrides
    // 0 = unknown, 1 = miss, 2 = active hit (needs coverage), 3 = destroyed boat hit (ignore)
    const misses = new Set();
    const hits = new Set();
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        if (overrides[r][c] === 1 || overrides[r][c] === 3) {
          // Treat both misses and destroyed boat hits as unavailable
          misses.add(key);
        } else if (overrides[r][c] === 2) {
          // Only active hits need to be covered
          hits.add(key);
        }
      }
    }

    function canPlace(board, r, c, len, vertical) {
      for (let k = 0; k < len; k++) {
        const rr = vertical ? r + k : r;
        const cc = vertical ? c : c + k;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) return false;
        const key = `${rr},${cc}`;
        // Cannot place on misses
        if (misses.has(key)) return false;
        // Cannot place if cell already occupied by another boat
        if (board[rr][cc] === 1) return false;
        
        // Separation rule: ensure all 8 neighbors are empty
        const neigh = [
          [rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1],
          [rr - 1, cc - 1], [rr - 1, cc + 1], [rr + 1, cc - 1], [rr + 1, cc + 1]
        ];
        for (const [nr, nc] of neigh) {
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (board[nr][nc] === 1) return false;
          }
        }
      }
      return true;
    }

    function place(board, r, c, len, vertical) {
      for (let k = 0; k < len; k++) {
        const rr = vertical ? r + k : r;
        const cc = vertical ? c : c + k;
        board[rr][cc] = 1;
      }
    }

    function unplace(board, r, c, len, vertical) {
      for (let k = 0; k < len; k++) {
        const rr = vertical ? r + k : r;
        const cc = vertical ? c : c + k;
        board[rr][cc] = 0;
      }
    }

    // Build candidate placement lists for each boat
    const boatPlacements = boats.map((len) => {
      const candidates = [];
      // Horizontal placements
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c + len - 1 < cols; c++) {
          // Quick check: no misses in this span
          let valid = true;
          for (let k = 0; k < len; k++) {
            if (misses.has(`${r},${c + k}`)) {
              valid = false;
              break;
            }
          }
          if (valid) candidates.push({ r, c, len, vertical: false });
        }
      }
      // Vertical placements
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r + len - 1 < rows; r++) {
          let valid = true;
          for (let k = 0; k < len; k++) {
            if (misses.has(`${r + k},${c}`)) {
              valid = false;
              break;
            }
          }
          if (valid) candidates.push({ r, c, len, vertical: true });
        }
      }
      return candidates;
    });

    // Debug: log candidate counts
    console.log('Monte Carlo candidate counts:', boatPlacements.map((cands, i) => `Boat ${boats[i]}: ${cands.length} candidates`).join(', '));

    // Order boats by fewest candidates first (constraint propagation)
    const order = boats.map((len, i) => i)
      .sort((a, b) => boatPlacements[a].length - boatPlacements[b].length);

    let samples = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = MAX_SAMPLES * 50; // Prevent infinite loop

    function backtrack(idx, board) {
      if (attempts >= MAX_ATTEMPTS || samples >= MAX_SAMPLES) return;
      attempts++;
      
      if (idx === order.length) {
        // Verify all hits are covered by boats
        for (const key of hits) {
          const [r, c] = key.split(',').map((x) => parseInt(x, 10));
          if (board[r][c] !== 1) return; // reject: hit not covered
        }
        
        // Valid configuration! Accumulate counts
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (board[r][c] === 1) counts[r][c] += 1;
          }
        }
        samples++;
        return;
      }
      
      const i = order[idx];
      let candidates = boatPlacements[i];
      
      // In target mode (mode 1 or 3), prioritize placements near the hit point
      if ((mode === 1 || mode === 3) && hits.size > 0) {
        candidates = candidates.slice().sort((A, B) => {
          function minDistToHits(placement) {
            let minDist = Infinity;
            for (const key of hits) {
              const [hr, hc] = key.split(',').map(v => parseInt(v, 10));
              for (let k = 0; k < placement.len; k++) {
                const rr = placement.vertical ? placement.r + k : placement.r;
                const cc = placement.vertical ? placement.c : placement.c + k;
                const dist = Math.abs(rr - hr) + Math.abs(cc - hc);
                if (dist < minDist) minDist = dist;
              }
            }
            return minDist;
          }
          return minDistToHits(A) - minDistToHits(B);
        });
      } else {
        // In search mode, randomize to avoid top-left bias
        candidates = shuffle(candidates);
      }
      
      // Try placing this boat in valid positions
      for (const cand of candidates) {
        if (!canPlace(board, cand.r, cand.c, cand.len, cand.vertical)) continue;
        
        place(board, cand.r, cand.c, cand.len, cand.vertical);
        backtrack(idx + 1, board);
        unplace(board, cand.r, cand.c, cand.len, cand.vertical);
        
        if (samples >= MAX_SAMPLES) break;
      }
    }

    const emptyBoard = Array.from({ length: rows }, () => Array(cols).fill(0));
    backtrack(0, emptyBoard);

    // Debug: log sample count
    if (samples === 0) {
      console.warn(`Monte Carlo: No valid configurations found. Attempts: ${attempts}, Max samples: ${MAX_SAMPLES}`);
      console.log('Boats:', boats, 'Hits:', hits.size, 'Misses:', misses.size);
    } else {
      console.log(`Monte Carlo: Found ${samples} valid configurations in ${attempts} attempts`);
    }

    // Normalize counts to [0,1] with Laplace smoothing
    let maxCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (counts[r][c] > maxCount) maxCount = counts[r][c];
      }
    }
    
    // If no samples found, return uniform low probability (except misses which are 0)
    if (samples === 0 || maxCount === 0) {
      const probs = Array.from({ length: rows }, () => Array(cols).fill(0.01));
      // Set misses and destroyed boat hits to 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (overrides[r][c] === 1 || overrides[r][c] === 3) probs[r][c] = 0;
        }
      }
      return probs;
    }
    
    const alpha = 0.1; // light smoothing to avoid hard zeros
    const denom = maxCount + alpha;
    const probs = counts.map((row) => row.map((v) => ((v + alpha) / denom)));

    return probs;
  }

  function generateHeatmapWithPDF(rows, cols, boats, overrides, mode, x, y) {
    // Probability Density Function: For each cell, count how many boats can be placed through it
    // This is computationally expensive but very accurate for end-game scenarios
    const counts = Array.from({ length: rows }, () => Array(cols).fill(0));
    
    console.log('PDF Strategy: Computing placement density for each cell...');
    const startTime = performance.now();
    
    // Helper: check if a boat placement is valid (doesn't cross misses/destroyed/borders)
    function isValidPlacement(r, c, len, vertical) {
      for (let k = 0; k < len; k++) {
        const rr = vertical ? r + k : r;
        const cc = vertical ? c : c + k;
        
        // Check bounds
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) {
          return false;
        }
        
        // Cannot place on misses (1) or destroyed boat hits (3)
        if (overrides[rr][cc] === 1 || overrides[rr][cc] === 3) {
          return false;
        }
      }
      
      // In target mode, placement must include at least one active hit (2)
      if ((mode === 1 || mode === 3)) {
        let includesHit = false;
        for (let k = 0; k < len; k++) {
          const rr = vertical ? r + k : r;
          const cc = vertical ? c : c + k;
          if (overrides[rr][cc] === 2) {
            includesHit = true;
            break;
          }
        }
        // In target mode, if there are hits, prioritize placements that cover them
        // But don't strictly require it - allow search mode behavior too
        if (x >= 0 && y >= 0 && x < rows && y < cols) {
          // Must include the target cell
          let includesTarget = false;
          for (let k = 0; k < len; k++) {
            const rr = vertical ? r + k : r;
            const cc = vertical ? c : c + k;
            if (rr === x && cc === y) {
              includesTarget = true;
              break;
            }
          }
          if (!includesTarget) return false;
        }
      }
      
      return true;
    }
    
    // For each boat, try all possible placements
    boats.forEach((boatLen, boatIdx) => {
      let placementCount = 0;
      
      // Try horizontal placements
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c <= cols - boatLen; c++) {
          if (isValidPlacement(r, c, boatLen, false)) {
            placementCount++;
            // Increment count for all cells this placement covers
            for (let k = 0; k < boatLen; k++) {
              counts[r][c + k] += 1;
            }
          }
        }
      }
      
      // Try vertical placements
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r <= rows - boatLen; r++) {
          if (isValidPlacement(r, c, boatLen, true)) {
            placementCount++;
            // Increment count for all cells this placement covers
            for (let k = 0; k < boatLen; k++) {
              counts[r + k][c] += 1;
            }
          }
        }
      }
      
      console.log(`  Boat ${boatLen}: ${placementCount} valid placements`);
    });
    
    const endTime = performance.now();
    console.log(`PDF Strategy completed in ${(endTime - startTime).toFixed(2)}ms`);
    
    // Normalize to [0, 1]
    let maxCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (counts[r][c] > maxCount) {
          maxCount = counts[r][c];
        }
      }
    }
    
    if (maxCount === 0) {
      // No valid placements - return uniform low probability
      console.warn('PDF Strategy: No valid placements found');
      const probs = Array.from({ length: rows }, () => Array(cols).fill(0.01));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (overrides[r][c] === 1 || overrides[r][c] === 3) {
            probs[r][c] = 0;
          }
        }
      }
      return probs;
    }
    
    // Normalize with very light smoothing
    const alpha = 0.01;
    const denom = maxCount + alpha;
    const probs = counts.map((row) => row.map((v) => ((v + alpha) / denom)));
    
    // Zero out misses and destroyed boat hits
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (overrides[r][c] === 1 || overrides[r][c] === 3) {
          probs[r][c] = 0;
        }
      }
    }
    
    return probs;
  }

  function generateHeatmapWithRules(rows, cols, boats, overrides, mode, x, y) {
    // Enumerate candidate placements per boat and sample valid configurations.
    const counts = Array.from({ length: rows }, () => Array(cols).fill(0));

    if (x > rows || y > cols) {
      throw new Error('Drop point exceeds defined rows/cols');
    }

    if (mode === 0) {
      boats.forEach(boat => {
        // Try placing the boat in all valid positions
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let end = c + boat;
            let canPlaceHorizontally = true;
            for (let current = c; current < end; current++) {
              if (current >= cols || overrides[r][current] === 1 || overrides[r][current] === 2 || overrides[r][current] === 3) {
                canPlaceHorizontally = false;
              }
            }

            if (canPlaceHorizontally) {
              for (let current = c; current < end; current++) {
                counts[r][current] += 1;
              }
            }
          }
        }

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let end = r + boat;
            let canPlaceVertically = true;
            for (let current = r; current < end; current++) {
              if (current >= rows || overrides[current][c] === 1 || overrides[current][c] === 2 || overrides[current][c] === 3) {
                canPlaceVertically = false;
              }
            }
            if (canPlaceVertically) {
              for (let current = r; current < end; current++) {
                counts[current][c] += 1;
              }
            }
          }
        }

        for (let r = 0; r < rows; r++) {
          let checkerboard = r;
          for (let c = 0; c < cols; c++) {
            if (checkerboard % 2 === 0) {
              counts[r][c] = Math.floor(counts[r][c] * 0.8);
            }
            checkerboard++;
          }
        }
      });
    } else if (mode === 1) {
      updateCountsForPlacement();
    } else if (mode === 3) {
      if (overrides[x][y] === 2) {
        // This happens when a miss is happened in the target mode.
        // Should wonder around to find other hits and try from other end.
        let dir = -1;
        if (x - 1 >= 0 && overrides[x - 1][y] === 2) {
          dir = 0; // up
        } else if (x + 1 < rows && overrides[x + 1][y] === 2) {
          dir = 1; // down
        } else if (y - 1 >= 0 && overrides[x][y - 1] === 2) {
          dir = 2; // left
        } else if (y + 1 < cols && overrides[x][y + 1] === 2) {
          dir = 3; // right
        }

        let xNew = x;
        let yNew = y;

        let start = x;
        switch (dir) {
          case 0: // up
            start = x;
            while (start - 1 >= 0 && overrides[start - 1][y] === 2) {
              start--;
            }
            if (start - 1 < 0)
              throw new Error('No valid placement found for the hit point');
            xNew = start - 1;
            break;
          case 1: // down
            start = x;
            while (start + 1 < rows && overrides[start + 1][y] === 2) {
              start++;
            }
            if (start + 1 >= rows)
              throw new Error('No valid placement found for the hit point');
            xNew = start + 1;
            break;
          case 2: // left
            start = y;
            while (start - 1 >= 0 && overrides[x][start - 1] === 2) {
              start--;
            }
            if (start - 1 < 0)
              throw new Error('No valid placement found for the hit point');
            yNew = start - 1;
            break;
          case 3: // right
            start = y;
            while (start + 1 < cols && overrides[x][start + 1] === 2) {
              start++;
            }
            if (start + 1 >= cols)
              throw new Error('No valid placement found for the hit point');
            yNew = start + 1;
            break;
        }

        if (overrides[xNew][yNew] !== 1) {
          x = xNew;
          y = yNew;
        } else {
          switch (dir) {
            case 0: // up
              if (x + 1 < rows && overrides[x + 1][y] !== 1) {
                x = x + 1;
              }
              break;
            case 1: // down
              if (x - 1 >= 0 && overrides[x - 1][y] !== 1) {
                x = x - 1;
              }
              break;
            case 2: // left
              if (y + 1 < cols && overrides[x][y + 1] !== 1) {
                y = y + 1;
              }
              break;
            case 3: // right
              if (y - 1 >= 0 && overrides[x][y - 1] !== 1) {
                y = y - 1;
              }
              break;
          }

          if (overrides[xNew][yNew] !== 1) {
            x = xNew;
            y = yNew;
          }
        }
      }
      updateCountsForPlacement();
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (overrides[r][c] === 1 || overrides[r][c] === 3) {
          counts[r][c] = 0;
        }
      }
    }

    // Normalize counts to [0,1] with light Laplace smoothing to avoid collapse
    let maxCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (counts[r][c] > maxCount) maxCount = counts[r][c];
      }
    }
    const alpha = 0; // smoothing
    const denom = (maxCount > 0 ? maxCount + alpha : 1);
    const probs = counts.map((row) => row.map((v) => ((v + alpha) / denom)));

    // Apply hard overrides on top (force 0/1)
    // Do not hard-force 0/1 here; rendering layer applies overrides so distribution remains informative.
    return probs;

    function updateCountsForPlacement() {      
      boats.forEach(boat => {
        // Try placing the boat in all valid positions that include (x,y)
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let end = c + boat;
            let canPlaceHorizontally = true;
            let includesDropPoint = false;
            let multiplier = 1;

            for (let current = c; current < end; current++) {
              if (current >= cols || overrides[r][current] === 1) {
                canPlaceHorizontally = false;
                break;
              }
              if (overrides[r][current] === 2) {
                multiplier += multiplier;
              }
              if (r === x && current === y) {
                includesDropPoint = true;
              }
            }

            if (canPlaceHorizontally && includesDropPoint) {
              for (let current = c; current < end; current++) {
                counts[r][current] += 1 * multiplier;
              }
            }
          }
        }

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let end = r + boat;
            let canPlaceVertically = true;
            let includesDropPoint = false;
            let multiplier = 1;

            for (let current = r; current < end; current++) {
              if (current >= rows || overrides[current][c] === 1) {
                canPlaceVertically = false;
                break;
              }
              if (overrides[current][c] === 2) {
                multiplier += multiplier;
              }
              if (current === x && c === y) {
                includesDropPoint = true;
              }
            }

            if (canPlaceVertically && includesDropPoint) {
              for (let current = r; current < end; current++) {
                counts[current][c] += 1 * multiplier;
              }
            }
          }
        }
      });
    }
  }

  // Optional: apply separation constraint more strictly by discounting adjacent placements.
  // For brevity, we keep the heuristic. Enhancement hooks can be added here.

  window.sonarRules = {
    generateHeatmap,
  };
})();
