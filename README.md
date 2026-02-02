# Battleship Strategy Comparison

## Overview
The application offers three different strategies for generating probability heatmaps to help you make optimal shots in Battleship.

---

## Strategy 0: Rule-Based (Fast) ⚡

### How It Works
- Simple heuristic approach with checkerboard optimization
- For each boat, counts all valid horizontal and vertical placements
- Each valid placement increments the count for all cells it covers
- Applies 20% penalty to alternate cells (checkerboard pattern)
- Very fast computation, suitable for large grids and early game

### Advantages
- ⚡ **Fastest computation time** (milliseconds even for large grids)
- 🎯 Good accuracy in early game with no constraints
- 📊 Checkerboard optimization reduces total shot count
- 💻 Low memory usage
- 🔄 Updates instantly

### Disadvantages
- ❌ Checkerboard pattern may not be optimal with many constraints
- ❌ Doesn't account for complex hit patterns well
- ❌ Less accurate in mid/late game
- ❌ Doesn't enforce boat separation constraints

### Best Used When
- 🎮 Early game (few or no hits/misses)
- 🏃 You want instant results
- 📏 Large grids where other methods are slow
- 🎲 Using checkerboard shooting pattern

---

## Strategy 1: Monte Carlo Simulation (Accurate) 🎲

### How It Works
- Samples thousands of random valid board configurations
- Each configuration places ALL remaining boats on the board
- Only configurations that satisfy ALL constraints are counted:
  - ✅ All active hits must be covered by boats
  - ✅ Boats cannot touch (including diagonally)
  - ✅ No boats on misses or destroyed boat cells
  - ✅ No boat overlaps
- Counts how often each cell contains a boat across all samples
- Uses Fisher-Yates shuffle to avoid positional bias

### Advantages
- 🎯 **Most accurate** for complex game states
- 🧠 Accounts for all constraint interactions
- 🔍 Excellent with multiple hits and complex patterns
- ⚖️ No artificial heuristics or biases
- 🎲 True probability distribution
- ♟️ **Checkerboard optimization** in search mode (50% fewer shots needed)

### Disadvantages
- 🐌 Slower computation (can take seconds for complex scenarios)
- 💾 Higher memory usage
- ⚠️ May find no valid configurations if game state is impossible
- 🔢 Requires many samples for accuracy

### Best Used When
- 🎯 Mid to late game with many constraints
- 🧩 Complex hit patterns that need analysis
- 🏆 You want maximum accuracy
- ⏱️ You can wait a few seconds for results
- 🔍 Multiple hits from different boats

### Technical Details
- Samples: Up to 10,000 configurations (or 1500 + rows × cols × 5)
- Algorithm: Backtracking with constraint propagation
- Randomization: Fisher-Yates shuffle in search mode
- Optimization: Boats with fewer placements tried first

---

## Strategy 2: Probability Density Function (PDF) 📊

### How It Works
- **For each cell**: Count how many boats can be placed through it
- Tries every remaining boat in every valid position
- A position is valid if:
  - ✅ Boat doesn't cross grid borders
  - ✅ Boat doesn't cross misses (value 1)
  - ✅ Boat doesn't cross destroyed boat cells (value 3)
  - ✅ In target mode: boat includes the target hit
- Each valid placement increments the count for all cells it covers
- Normalizes counts to [0, 1] for probability

### Formula
```
For each cell (r, c):
  count[r][c] = 0
  For each remaining boat B:
    For each valid placement P of boat B:
      If P covers cell (r, c):
        count[r][c] += 1
  
probability[r][c] = count[r][c] / max(all counts)
```

### Advantages
- 📊 **Very accurate density calculation**
- 🎯 Perfect for end-game optimization
- 🔍 Shows exactly where boats can fit
- 💡 Simple, intuitive algorithm
- ✅ No randomness - deterministic results
- 🎮 Optimal when few boats remain
- ♟️ **Checkerboard optimization** in search mode (50% fewer shots needed)

### Disadvantages
- 🐌 **Slowest method** - expensive computation
- ⏳ Can be very slow on large grids early game
- 💾 Doesn't account for boat separation constraints
- ❌ Doesn't model interactions between boats
- 🔢 Only considers individual boat placements

### Best Used When
- 🏁 **End game** (1-3 boats remaining)
- 🎯 Few valid positions left
- 🔍 You want to see placement density
- ⏱️ Performance isn't critical
- 📊 Analyzing where boats can physically fit

### Performance Characteristics
- **Time Complexity**: O(rows × cols × boats × max_boat_length)
- **Early Game** (10×10, 5 boats): ~50-200ms
- **Mid Game** (10×10, 3 boats, many misses): ~20-50ms
- **End Game** (10×10, 1 boat, many constraints): ~5-10ms

---

## Dynamic Pattern Optimization ♟️

### What Is It?

All three strategies apply a **dynamic pattern penalty** in search mode (mode 0):
- Pattern adapts based on the **smallest remaining boat length**
- Cells in "skip" positions get reduced probability
- Applied ONLY in search mode, not in target mode

### How It Works

**The Algorithm:**
```javascript
smallestBoat = min(remaining boat lengths)
for each cell (r, c):
  patternIndex = (r + c) % smallestBoat
  if patternIndex != 0:
    reduce probability by (0.8 / smallestBoat)
```

**Examples:**

| Smallest Boat | Pattern | Shot Reduction | Penalty |
|---------------|---------|----------------|---------|
| 2 units | Checkerboard | ~50% | 40% off |
| 3 units | Every 3rd cell | ~67% | 27% off |
| 4 units | Every 4th cell | ~75% | 20% off |
| 5 units | Every 5th cell | ~80% | 16% off |

### Why Does It Work?

For a boat of length **N**:
- The boat must span **N consecutive cells**
- If you check every **Nth cell** in a diagonal pattern, you're guaranteed to hit it
- This reduces shots needed by approximately **(N-1)/N × 100%**

### Visual Examples

**Smallest Boat = 2 (Checkerboard):**
```
[1.0][0.4][1.0][0.4]    Shoot: ⬜ skip ⬜ skip
[0.4][1.0][0.4][1.0]           skip ⬜ skip ⬜
[1.0][0.4][1.0][0.4]           ⬜ skip ⬜ skip
[0.4][1.0][0.4][1.0]           skip ⬜ skip ⬜
```

**Smallest Boat = 3:**
```
[1.0][0.3][0.3][1.0][0.3]    Shoot: ⬜ skip skip ⬜ skip
[0.3][0.3][1.0][0.3][0.3]           skip skip ⬜ skip skip
[0.3][1.0][0.3][0.3][1.0]           skip ⬜ skip skip ⬜
[1.0][0.3][0.3][1.0][0.3]           ⬜ skip skip ⬜ skip
```

**Smallest Boat = 4:**
```
[1.0][0.2][0.2][0.2][1.0]    Shoot: ⬜ skip skip skip ⬜
[0.2][0.2][0.2][1.0][0.2]           skip skip skip ⬜ skip
[0.2][0.2][1.0][0.2][0.2]           skip skip ⬜ skip skip
[0.2][1.0][0.2][0.2][0.2]           skip ⬜ skip skip skip
```

### Dynamic Adaptation

**Early Game:**
- Boats: [5, 4, 3, 3, 2]
- Smallest: **2**
- Pattern: Checkerboard (50% reduction)

**Mid Game (boat length 2 destroyed):**
- Boats: [5, 4, 3, 3]
- Smallest: **3**
- Pattern: Every 3rd cell (67% reduction) ✨ **Better optimization!**

**Late Game (only large boats left):**
- Boats: [5, 4]
- Smallest: **4**
- Pattern: Every 4th cell (75% reduction) ✨ **Even better!**

### Benefits

1. **Adaptive Efficiency** 🎯
   - Automatically adjusts to remaining boats
   - More aggressive optimization as boats are destroyed
   - No manual configuration needed

2. **Optimal Shot Reduction** 📉
   - Early game: ~50% fewer shots
   - Mid game: ~67% fewer shots (if boat length 2 destroyed)
   - Late game: up to ~80% fewer shots

3. **Mathematically Sound** 📐
   - Based on minimum boat length guarantee
   - Cannot miss any boats
   - Industry-standard approach

4. **Progressive Optimization** 🚀
   - Game gets easier and more efficient over time
   - Reward for destroying smaller boats first

### When Applied

- ✅ **Search Mode (mode 0)**: Dynamic pattern applied to all strategies
- ❌ **Target Mode (mode 1/3)**: No pattern - need full resolution around hits

### Console Logging

Watch the console to see the optimization in action:
```
Rule-based: Applied pattern optimization for smallest boat length 2
PDF: Applied pattern optimization for smallest boat length 3
Monte Carlo: Applied pattern optimization for smallest boat length 4 (skip 3 cells)
```

---

## Checkerboard Optimization ♟️

### What Is It?

All three strategies apply a **checkerboard penalty** in search mode (mode 0):
- Alternating cells get a **20% probability reduction**
- Creates a checkerboard pattern of higher/lower probability cells
- Applied ONLY in search mode, not in target mode

### Why Does It Work?

Since the **smallest boat is 2 units long**:
- Every boat must span at least 2 consecutive cells
- If you hit every other cell (checkerboard pattern), you're guaranteed to hit every boat
- This reduces shots needed by approximately **50%**

### Visual Example

```
Grid without checkerboard:    Grid with checkerboard:
[1.0][1.0][1.0][1.0]          [0.8][1.0][0.8][1.0]
[1.0][1.0][1.0][1.0]          [1.0][0.8][1.0][0.8]
[1.0][1.0][1.0][1.0]          [0.8][1.0][0.8][1.0]
[1.0][1.0][1.0][1.0]          [1.0][0.8][1.0][0.8]

Target high-probability cells (white squares on checkerboard)
```

### When Applied

- ✅ **Search Mode (mode 0)**: Checkerboard applied to all strategies
- ❌ **Target Mode (mode 1/3)**: No checkerboard - need to target specific hits

### Impact

- 📉 Reduces search space by ~50%
- 🎯 Optimal for early game exploration
- ♟️ Encourages efficient shooting pattern
- 🎮 Industry-standard Battleship optimization

---

## Quick Comparison Table

| Feature | Rule-Based | Monte Carlo | PDF |
|---------|-----------|-------------|-----|
| **Speed** | ⚡⚡⚡ Fastest | 🐌 Slow | 🐌🐌 Slowest |
| **Accuracy (Early)** | ⭐⭐⭐ Good | ⭐⭐⭐ Good | ⭐⭐⭐ Good |
| **Accuracy (Mid)** | ⭐⭐ Fair | ⭐⭐⭐⭐ Excellent | ⭐⭐⭐ Good |
| **Accuracy (Late)** | ⭐⭐ Fair | ⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐ Excellent |
| **Separation Rule** | ❌ No | ✅ Yes | ❌ No |
| **Boat Interactions** | ❌ No | ✅ Yes | ❌ No |
| **Dynamic Pattern** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Deterministic** | ✅ Yes | ❌ No (random) | ✅ Yes |
| **Memory Usage** | Low | Medium | Low |

---

## Recommended Usage

### 🎮 Game Phase Recommendations

**Early Game (>5 boats, <10% cells revealed)**
- ✅ **Rule-Based** - Fast and good enough
- ⚠️ PDF - Too slow with many boats
- ⚠️ Monte Carlo - Overkill for simple scenarios

**Mid Game (3-5 boats, 10-40% cells revealed)**
- ✅ **Monte Carlo** - Best accuracy with constraints
- ⚠️ Rule-Based - Checkerboard may conflict with constraints
- ⚠️ PDF - Still expensive with multiple boats

**Late Game (1-2 boats, >40% cells revealed)**
- ✅ **PDF** - Shows exactly where boats fit
- ✅ **Monte Carlo** - Also excellent, slightly slower
- ⚠️ Rule-Based - Less accurate with heavy constraints

### 🎯 Scenario-Based Recommendations

**Scenario: Clean board, no hits**
- 🏆 **Rule-Based** - Instant results, good distribution

**Scenario: Multiple isolated hits**
- 🏆 **Monte Carlo** - Handles multiple boats best

**Scenario: Long hit sequence (3+ cells)**
- 🏆 **PDF** or **Monte Carlo** - Both excellent

**Scenario: Heavy constraints (many misses)**
- 🏆 **Monte Carlo** - Best at handling constraints

**Scenario: One boat left, many misses**
- 🏆 **PDF** - Fast and shows exactly where it fits

---

## Technical Notes

### Cell State Values
- `0` = Unknown (no information)
- `1` = Miss (no boat present)
- `2` = Active Hit (belongs to active boat, needs coverage)
- `3` = Destroyed Boat Hit (belongs to destroyed boat, excluded)

### Mode Values
- `mode 0` = Search mode (looking for new boats)
- `mode 1` = Target mode (tracking a specific hit)
- `mode 3` = Target mode with recent miss

### Normalization
All strategies normalize probabilities to [0, 1] range:
- `0.0` = Impossible (miss or destroyed)
- `1.0` = Highest probability
- Values in between show relative likelihood

---

## Summary

Choose your strategy based on game phase and your needs:
- **Speed matters?** → Rule-Based
- **Accuracy matters?** → Monte Carlo
- **End game optimization?** → PDF
- **Not sure?** → Try all three and compare!

You can switch strategies anytime without losing your hit/miss information. Experiment to find what works best for your play style! 🎯
