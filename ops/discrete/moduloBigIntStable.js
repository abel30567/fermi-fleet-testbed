/**
 * Fixed-point scaling factor (`10^18`) exported for interoperability with
 * 18-decimal fixed-point BigInt workflows.
 *
 * Because integer modulo is positive-homogeneous of degree 1, for any `k > 0n`
 * (including `k = SCALE`), `moduloBigIntStable(a * k, m * k, opts)` equals
 * `moduloBigIntStable(a, m, opts) * k` exactly.
 *
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

const VALID_MODES = new Set(['euclidean', 'floored', 'truncated']);

/**
 * Compute exact integer quotient and remainder `(q, r)` under the chosen
 * division convention, then verify both the exact division identity
 * `a === q * m + r` and the mode's canonical remainder bounds.
 *
 * @param {bigint} a
 * @param {bigint} m
 * @param {'euclidean'|'floored'|'truncated'} mode
 * @returns {{ quotient: bigint, remainder: bigint }}
 */
function exactDivMod(a, m, mode) {
  const absM = m < 0n ? -m : m;
  const qTrunc = a / m;
  const rTrunc = a % m;

  let q = qTrunc;
  let r = rTrunc;

  if (mode === 'euclidean') {
    if (r < 0n) {
      if (m > 0n) {
        r += m;
        q -= 1n;
      } else {
        r -= m;
        q += 1n;
      }
    }
  } else if (mode === 'floored') {
    if (r !== 0n && (r < 0n) !== (m < 0n)) {
      r += m;
      q -= 1n;
    }
  }
  // For 'truncated', (qTrunc, rTrunc) already satisfies JS/C truncated division.

  // Exact algebraic post-condition verification: a = q * m + r
  if (q * m + r !== a) {
    throw new Error('Internal invariant violation: division identity a = q * m + r failed');
  }

  // Exact remainder range post-condition verification
  let inRange = false;
  if (mode === 'euclidean') {
    inRange = r >= 0n && r < absM;
  } else if (mode === 'floored') {
    inRange = m > 0n ? (r >= 0n && r < m) : (r <= 0n && r > m);
  } else {
    inRange = a >= 0n ? (r >= 0n && r < absM) : (r <= 0n && r > -absM);
  }

  if (!inRange) {
    throw new Error(`Internal invariant violation: remainder out of range for mode "${mode}"`);
  }

  return { quotient: q, remainder: r };
}

/**
 * Computes the exact discrete modulo `a mod m` over arbitrary-precision
 * `BigInt` integers with strict input validation and verified division
 * invariants.
 *
 * ### Modes
 * - `'euclidean'` (default): Mathematical Euclidean modulo (Boute, 1992).
 *   Always returns `r` in `[0n, |m| - 1n]` regardless of the signs of `a` and `m`,
 *   with `a = q * m + r`.
 * - `'floored'`: Knuth floored modulo (matches Python `%`).
 *   Returns `r` with the sign of `m` (or `0n`): `[0n, m - 1n]` for `m > 0n`,
 *   and `[m + 1n, 0n]` for `m < 0n`, with `q = floor(a / m)` and `a = q * m + r`.
 * - `'truncated'`: Truncated remainder (matches JavaScript/C `%`).
 *   Returns `r` with the sign of `a` (or `0n`): `[0n, |m| - 1n]` for `a >= 0n`,
 *   and `[-(|m| - 1n), 0n]` for `a < 0n`, with `q = trunc(a / m)` and `a = q * m + r`.
 *
 * ### Scaling & Precision Conventions
 * All arithmetic is performed purely in exact arbitrary-precision `BigInt`
 * without any IEEE-754 floating-point conversion, avoiding 53-bit significand
 * truncation, overflow, or negative-zero artifacts. For fixed-point values
 * scaled by {@link SCALE} (`10^18`), positive homogeneity holds exactly:
 * `moduloBigIntStable(a * SCALE, m * SCALE, opts) === moduloBigIntStable(a, m, opts) * SCALE`.
 *
 * ### Numerical Robustness Guarantees
 * - Exact for arbitrarily large dividends and divisors (including values well beyond
 *   `Number.MAX_SAFE_INTEGER` and `2^256`).
 * - Verifies the fundamental division identity `a === q * m + r` and canonical
 *   remainder bounds on every call before returning.
 *
 * @param {bigint} a - Exact `BigInt` dividend.
 * @param {bigint} m - Exact non-zero `BigInt` modulus (divisor).
 * @param {object} [options={}] - Optional configuration object.
 * @param {'euclidean'|'floored'|'truncated'} [options.mode='euclidean'] - Modulo convention.
 * @returns {bigint} Exact remainder `r` satisfying `a = q * m + r` under `mode`.
 * @throws {TypeError} If `a` or `m` is not a `BigInt`, if `options` is not a plain object,
 *   or if `options.mode` is provided and is not a string.
 * @throws {RangeError} If `m === 0n` (division by zero) or if `options.mode` is not one of
 *   `'euclidean'`, `'floored'`, or `'truncated'`.
 */
export function moduloBigIntStable(a, m, options = {}) {
  if (typeof a !== 'bigint') {
    throw new TypeError(`Expected dividend "a" to be a BigInt, received ${a === null ? 'null' : typeof a}`);
  }
  if (typeof m !== 'bigint') {
    throw new TypeError(`Expected modulus "m" to be a BigInt, received ${m === null ? 'null' : typeof m}`);
  }
  if (m === 0n) {
    throw new RangeError('Modulus "m" must be non-zero (modulo by zero is undefined)');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(`Expected "options" to be a plain object, received ${options === null ? 'null' : Array.isArray(options) ? 'array' : typeof options}`);
  }

  const { mode = 'euclidean' } = options;
  if (typeof mode !== 'string') {
    throw new TypeError(`Expected "options.mode" to be a string, received ${mode === null ? 'null' : typeof mode}`);
  }
  if (!VALID_MODES.has(mode)) {
    throw new RangeError(`Unsupported modulo mode "${mode}". Expected one of: 'euclidean', 'floored', 'truncated'`);
  }

  return exactDivMod(a, m, mode).remainder;
}
