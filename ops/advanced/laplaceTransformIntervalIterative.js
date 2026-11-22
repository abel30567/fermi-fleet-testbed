const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);

/**
 * Normalize -0 to +0 for canonical interval endpoints.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Return the smallest IEEE-754 float64 strictly greater than x.
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === -Infinity) return -Number.MAX_VALUE;
  if (x === 0) return Number.MIN_VALUE;
  f64[0] = x;
  if (x > 0) {
    u64[0] += 1n;
  } else {
    u64[0] -= 1n;
  }
  return normalizeZero(f64[0]);
}

/**
 * Return the largest IEEE-754 float64 strictly less than x.
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
  if (Number.isNaN(x) || x === -Infinity) return x;
  if (x === Infinity) return Number.MAX_VALUE;
  if (x === 0) return -Number.MIN_VALUE;
  f64[0] = x;
  if (x > 0) {
    u64[0] -= 1n;
  } else {
    u64[0] += 1n;
  }
  return normalizeZero(f64[0]);
}

/**
 * Outward-rounded lower bound for a + b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
  if (a === -Infinity || b === -Infinity) return -Infinity;
  if (a === 0) return normalizeZero(b);
  if (b === 0) return normalizeZero(a);
  if (a === -b && Number.isFinite(a)) return 0;
  const s = a + b;
  if (s === -Infinity) return -Infinity;
  return nextDown(s);
}

/**
 * Outward-rounded upper bound for a + b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
  if (a === Infinity || b === Infinity) return Infinity;
  if (a === 0) return normalizeZero(b);
  if (b === 0) return normalizeZero(a);
  if (a === -b && Number.isFinite(a)) return 0;
  const s = a + b;
  if (s === Infinity) return Infinity;
  return nextUp(s);
}

/**
 * Outward-rounded lower bound for a * b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulDown(a, b) {
  if (a === 0 || b === 0) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a * b;
  if (a === 1) return normalizeZero(b);
  if (b === 1) return normalizeZero(a);
  if (a === -1) return normalizeZero(-b);
  if (b === -1) return normalizeZero(-a);
  const p = a * b;
  if (p === 0) {
    return (a > 0) === (b > 0) ? 0 : -Number.MIN_VALUE;
  }
  if (p === -Infinity) return -Infinity;
  return nextDown(p);
}

/**
 * Outward-rounded upper bound for a * b.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulUp(a, b) {
  if (a === 0 || b === 0) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a * b;
  if (a === 1) return normalizeZero(b);
  if (b === 1) return normalizeZero(a);
  if (a === -1) return normalizeZero(-b);
  if (b === -1) return normalizeZero(-a);
  const p = a * b;
  if (p === 0) {
    return (a > 0) === (b > 0) ? Number.MIN_VALUE : 0;
  }
  if (p === Infinity) return Infinity;
  return nextUp(p);
}

/**
 * Outward-rounded lower bound for exp(x).
 * Uses a 2-ULP downward step to conservatively account for transcendental approximation error.
 * @param {number} x
 * @returns {number}
 */
function expDown(x) {
  if (x === 0) return 1;
  if (x === -Infinity) return 0;
  if (x === Infinity) return Infinity;
  const y = Math.exp(x);
  if (y === 0) return 0;
  const lo = nextDown(nextDown(y));
  return lo < 0 ? 0 : lo;
}

/**
 * Outward-rounded upper bound for exp(x).
 * Uses a 2-ULP upward step to conservatively account for transcendental approximation error.
 * @param {number} x
 * @returns {number}
 */
function expUp(x) {
  if (x === 0) return 1;
  if (x === -Infinity) return 0;
  if (x === Infinity) return Infinity;
  const y = Math.exp(x);
  if (y === Infinity) return Infinity;
  return nextUp(nextUp(y));
}

/**
 * Outward-rounded interval addition [aLo, aHi] + [bLo, bHi].
 * @param {number} aLo
 * @param {number} aHi
 * @param {number} bLo
 * @param {number} bHi
 * @returns {[number, number]}
 */
function intervalAdd(aLo, aHi, bLo, bHi) {
  return [addDown(aLo, bLo), addUp(aHi, bHi)];
}

/**
 * Outward-rounded interval multiplication [aLo, aHi] * [bLo, bHi].
 * @param {number} aLo
 * @param {number} aHi
 * @param {number} bLo
 * @param {number} bHi
 * @returns {[number, number]}
 */
function intervalMul(aLo, aHi, bLo, bHi) {
  const lo = Math.min(
    mulDown(aLo, bLo),
    mulDown(aLo, bHi),
    mulDown(aHi, bLo),
    mulDown(aHi, bHi),
  );
  const hi = Math.max(
    mulUp(aLo, bLo),
    mulUp(aLo, bHi),
    mulUp(aHi, bLo),
    mulUp(aHi, bHi),
  );
  return [normalizeZero(lo), normalizeZero(hi)];
}

/**
 * Outward-rounded interval exponential exp([xLo, xHi]).
 * @param {number} xLo
 * @param {number} xHi
 * @returns {[number, number]}
 */
function intervalExp(xLo, xHi) {
  return [expDown(xLo), expUp(xHi)];
}

/**
 * Validate that a value is a finite closed interval [lo, hi] with lo <= hi.
 * @param {unknown} interval
 * @param {string} name
 * @returns {[number, number]}
 */
function validateInterval(interval, name) {
  if (!Array.isArray(interval) || interval.length !== 2) {
    throw new TypeError(`${name} must be a 2-element array [lo, hi]`);
  }
  const [lo, hi] = interval;
  if (typeof lo !== 'number' || typeof hi !== 'number') {
    throw new TypeError(`${name} bounds must be numbers`);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new RangeError(`${name} bounds must be finite numbers`);
  }
  if (lo > hi) {
    throw new RangeError(`${name} must satisfy lo <= hi (received [${lo}, ${hi}])`);
  }
  return [normalizeZero(lo), normalizeZero(hi)];
}

/**
 * Compute the discrete numerical Laplace transform over interval arithmetic with
 * IEEE-754 outward rounding guaranteeing enclosure.
 *
 * Evaluates the left-Riemann discrete Laplace sum:
 *   L{f}(s) = (sum_{n=0}^{N-1} f_n * exp(-s * t_n)) * dt,  where t_n = n * dt
 *
 * Every arithmetic step (multiplication, exponential, addition) uses true IEEE-754
 * ULP outward rounding (`nextDown` / `nextUp`) so that the returned interval `[lo, hi]`
 * rigorously encloses the exact real-valued discrete transform for all
 * `f_n in samples[n]`, `s in sInterval`, and `dt in dtInterval`.
 *
 * @param {Array<[number, number]>} samples - Array of finite intervals `[fLo, fHi]` representing `f(n * dt)` for `n = 0, ..., N - 1`.
 * @param {[number, number]} sInterval - Finite Laplace parameter interval `[sLo, sHi]`.
 * @param {[number, number]} [dtInterval=[1, 1]] - Strictly positive finite time-step interval `[dtLo, dtHi]` with `dtLo > 0`.
 * @returns {[number, number]} Outward-rounded enclosing interval `[lo, hi]` with `lo <= hi`.
 * @throws {TypeError} If `samples` is not an array, or any interval is not a 2-element numeric array `[lo, hi]`.
 * @throws {RangeError} If any interval bound is non-finite (`NaN`/`±Infinity`), malformed (`lo > hi`), or if `dtInterval[0] <= 0`.
 */
export function laplaceTransformIntervalIterative(
  samples,
  sInterval,
  dtInterval = [1, 1],
) {
  if (!Array.isArray(samples)) {
    throw new TypeError('samples must be an array of [lo, hi] intervals');
  }

  const [sLo, sHi] = validateInterval(sInterval, 'sInterval');
  const [dtLo, dtHi] = validateInterval(dtInterval, 'dtInterval');
  if (dtLo <= 0) {
    throw new RangeError(
      `dtInterval lower bound must be strictly positive (received [${dtLo}, ${dtHi}])`,
    );
  }

  const validatedSamples = new Array(samples.length);
  for (let n = 0; n < samples.length; n += 1) {
    validatedSamples[n] = validateInterval(samples[n], `samples[${n}]`);
  }

  if (validatedSamples.length === 0) {
    return [0, 0];
  }

  // Exact negation of sInterval: -s in [-sHi, -sLo]
  const negSLo = normalizeZero(-sHi);
  const negSHi = normalizeZero(-sLo);

  let accLo = 0;
  let accHi = 0;

  for (let n = 0; n < validatedSamples.length; n += 1) {
    const [fLo, fHi] = validatedSamples[n];

    // t_n = n * dt (n >= 0 and dt > 0, so monotonic in dt)
    const tLo = n === 0 ? 0 : mulDown(n, dtLo);
    const tHi = n === 0 ? 0 : mulUp(n, dtHi);

    // -s * t_n
    const [negSTLo, negSTHi] = intervalMul(negSLo, negSHi, tLo, tHi);

    // exp(-s * t_n)
    const [expLo, expHi] = intervalExp(negSTLo, negSTHi);

    // f_n * exp(-s * t_n)
    const [termLo, termHi] = intervalMul(fLo, fHi, expLo, expHi);

    // Accumulate sum iteratively
    [accLo, accHi] = intervalAdd(accLo, accHi, termLo, termHi);
  }

  // Multiply accumulated sum by dtInterval
  const [resLo, resHi] = intervalMul(accLo, accHi, dtLo, dtHi);
  return [normalizeZero(resLo), normalizeZero(resHi)];
}
