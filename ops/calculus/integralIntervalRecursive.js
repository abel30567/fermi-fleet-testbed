/**
 * Rigorous interval-arithmetic definite integration via recursive
 * divide-and-conquer bisection with IEEE-754 outward rounding.
 *
 * For any subinterval [l, r] and valid interval extension `fn` of a real
 * function f (meaning f(t) ∈ fn([l, r]) for all t ∈ [l, r]), the interval
 * product fn([l, r]) * [l, r].width mathematically encloses ∫_l^r f(t) dt.
 * Bisecting [l, r] at an exact IEEE-754 midpoint m ∈ (l, r) and summing the
 * child enclosures with outward rounding (nextDown / nextUp) guarantees that
 * the returned interval [lo, hi] rigorously encloses ∫_a^b f(t) dt.
 */

const _f64 = new Float64Array(1);
const _i64 = new BigInt64Array(_f64.buffer);

/**
 * Returns the smallest IEEE-754 binary64 number strictly greater than `x`.
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === -Infinity) return -Number.MAX_VALUE;
  if (x === 0) return Number.MIN_VALUE;
  _f64[0] = x;
  if (x > 0) {
    _i64[0] += 1n;
  } else {
    _i64[0] -= 1n;
  }
  const res = _f64[0];
  return res === 0 ? 0 : res;
}

/**
 * Returns the largest IEEE-754 binary64 number strictly less than `x`.
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
  if (Number.isNaN(x) || x === -Infinity) return x;
  if (x === Infinity) return Number.MAX_VALUE;
  if (x === 0) return -Number.MIN_VALUE;
  _f64[0] = x;
  if (x > 0) {
    _i64[0] -= 1n;
  } else {
    _i64[0] += 1n;
  }
  const res = _f64[0];
  return res === 0 ? 0 : res;
}

/**
 * Lower bound for exact real sum a + b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
  if (a === 0) return b === 0 ? 0 : b;
  if (b === 0) return a;
  return nextDown(a + b);
}

/**
 * Upper bound for exact real sum a + b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
  if (a === 0) return b === 0 ? 0 : b;
  if (b === 0) return a;
  return nextUp(a + b);
}

/**
 * Lower bound for exact real difference a - b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function subDown(a, b) {
  if (a === b) return 0;
  if (b === 0) return a;
  if (a === 0) return -b;
  return nextDown(a - b);
}

/**
 * Upper bound for exact real difference a - b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function subUp(a, b) {
  if (a === b) return 0;
  if (b === 0) return a;
  if (a === 0) return -b;
  return nextUp(a - b);
}

/**
 * Lower bound for exact real product a * b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulDown(a, b) {
  if (a === 0 || b === 0) return 0;
  if (a === 1) return b;
  if (b === 1) return a;
  const p = a * b;
  if (p === 0 && ((a > 0 && b > 0) || (a < 0 && b < 0))) return 0;
  return nextDown(p);
}

/**
 * Upper bound for exact real product a * b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulUp(a, b) {
  if (a === 0 || b === 0) return 0;
  if (a === 1) return b;
  if (b === 1) return a;
  const p = a * b;
  if (p === 0 && ((a > 0 && b < 0) || (a < 0 && b > 0))) return 0;
  return nextUp(p);
}

/**
 * Validates that an interval returned by `fn` is a finite [lo, hi] pair with lo <= hi.
 * @param {unknown} interval
 * @returns {[number, number]}
 */
function validateIntervalResult(interval) {
  if (!Array.isArray(interval) || interval.length !== 2) {
    throw new TypeError('fn must return an interval [lo, hi] of length 2');
  }
  const [lo, hi] = interval;
  if (typeof lo !== 'number' || typeof hi !== 'number') {
    throw new TypeError('fn interval endpoints must be numbers');
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new RangeError('fn interval endpoints must be finite numbers');
  }
  if (lo > hi) {
    throw new RangeError(`fn returned invalid interval [${lo}, ${hi}] with lo > hi`);
  }
  return [lo, hi];
}

/**
 * Computes a rigorous interval Riemann enclosure of ∫_l^r f(t) dt on [l, r].
 * @param {(interval: [number, number]) => [number, number]} fn
 * @param {number} l
 * @param {number} r
 * @returns {[number, number]}
 */
function encloseLeaf(fn, l, r) {
  const [yLo, yHi] = validateIntervalResult(fn([l, r]));
  if (l === r) {
    return [0, 0];
  }
  const wLo = Math.max(0, subDown(r, l));
  const wHi = subUp(r, l);

  const lo = yLo >= 0 ? mulDown(yLo, wLo) : mulDown(yLo, wHi);
  const hi = yHi >= 0 ? mulUp(yHi, wHi) : mulUp(yHi, wLo);
  return [lo, hi];
}

/**
 * Computes an overflow-safe IEEE-754 midpoint between l and r (l <= r).
 * @param {number} l
 * @param {number} r
 * @returns {number}
 */
function midpoint(l, r) {
  const diff = r - l;
  return Number.isFinite(diff) ? l + diff / 2 : l / 2 + r / 2;
}

/**
 * Sums two enclosures with IEEE-754 outward rounding.
 * @param {[number, number]} left
 * @param {[number, number]} right
 * @returns {[number, number]}
 */
function addIntervals(left, right) {
  return [addDown(left[0], right[0]), addUp(left[1], right[1])];
}

/**
 * Recursively integrates `fn` over [l, r] using divide-and-conquer bisection.
 * @param {(interval: [number, number]) => [number, number]} fn
 * @param {number} l
 * @param {number} r
 * @param {number} remDepth
 * @param {number} tol
 * @returns {[number, number]}
 */
function integrateRecursive(fn, l, r, remDepth, tol) {
  if (l === r || remDepth === 0) {
    return encloseLeaf(fn, l, r);
  }

  const m = midpoint(l, r);
  if (m <= l || m >= r) {
    // No representable IEEE-754 float strictly between l and r.
    return encloseLeaf(fn, l, r);
  }

  if (tol > 0) {
    const leaf = encloseLeaf(fn, l, r);
    const width = subUp(leaf[1], leaf[0]);
    if (width <= tol) {
      return leaf;
    }
    const halfTol = tol / 2;
    const left = integrateRecursive(fn, l, m, remDepth - 1, halfTol);
    const right = integrateRecursive(fn, m, r, remDepth - 1, halfTol);
    return addIntervals(left, right);
  }

  const left = integrateRecursive(fn, l, m, remDepth - 1, 0);
  const right = integrateRecursive(fn, m, r, remDepth - 1, 0);
  return addIntervals(left, right);
}

/**
 * Computes a rigorous interval enclosure `[lo, hi]` for the definite integral
 * `∫_a^b f(t) dt` using recursive divide-and-conquer bisection and IEEE-754
 * outward rounding.
 *
 * @param {(interval: [number, number]) => [number, number]} fn
 *   Interval extension of the integrand: for every subinterval `[l, r]`,
 *   `fn([l, r])` must return `[yLo, yHi]` enclosing `{ f(t) : t ∈ [l, r] }`.
 * @param {[number, number]} domain
 *   Integration domain `[a, b]` with finite numbers `a <= b`.
 * @param {{ depth?: number, tolerance?: number }} [options={}]
 *   - `depth` (default `8`): non-negative integer maximum bisection depth.
 *   - `tolerance` (default `0`): non-negative finite early-stop width tolerance.
 *     When `> 0`, recursion stops early on subintervals whose local enclosure
 *     width is within their proportional tolerance budget.
 * @returns {[number, number]}
 *   Outward-rounded interval `[lo, hi]` guaranteed to enclose `∫_a^b f(t) dt`.
 */
export function integralIntervalRecursive(fn, domain, options = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function');
  }
  if (!Array.isArray(domain) || domain.length !== 2) {
    throw new TypeError('domain must be a [a, b] array of length 2');
  }
  const [a, b] = domain;
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new TypeError('domain endpoints must be numbers');
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new RangeError('domain endpoints must be finite numbers');
  }
  if (a > b) {
    throw new RangeError(`domain must satisfy a <= b, got [${a}, ${b}]`);
  }

  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }
  const { depth = 8, tolerance = 0 } = options;
  if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 0) {
    throw new RangeError('options.depth must be a non-negative integer');
  }
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('options.tolerance must be a non-negative finite number');
  }

  return integrateRecursive(fn, a, b, depth, tolerance);
}
