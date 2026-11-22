/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value, coefficient of ε⁰.
 * @property {number} d - Tangent (first-order derivative) value, coefficient of ε¹.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} input - Candidate dual number to validate.
 * @param {string} name - Parameter name used in error messages.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If `input` is not a non-null plain/non-array object or if `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertDualNumber(input, name) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`${name} must be a non-null dual number object with numeric { v, d } properties`);
  }

  const { v, d } = input;

  if (typeof v !== 'number') {
    throw new TypeError(`${name}.v must be a finite number`);
  }
  if (!Number.isFinite(v)) {
    throw new RangeError(`${name}.v must be a finite number`);
  }

  if (typeof d !== 'number') {
    throw new TypeError(`${name}.d must be a finite number`);
  }
  if (!Number.isFinite(d)) {
    throw new RangeError(`${name}.d must be a finite number`);
  }

  return input;
}

/**
 * Normalizes IEEE-754 negative zero (`-0`) to canonical positive zero (`0`).
 *
 * @param {number} value - Numeric value to normalize.
 * @returns {number} `0` if `value` is `0` or `-0`, otherwise `value`.
 */
function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

/**
 * Subtracts two dual numbers in the truncated first-order Taylor series algebra ℝ[ε]/(ε²).
 *
 * Dual numbers represent first-order jets `a = a_v + a_d·ε` and `b = b_v + b_d·ε`
 * subject to the nilpotent identity `ε² = 0`. Using the closed-form series subtraction
 * identity (matching coefficients of `ε⁰` and `ε¹`):
 *
 * ```
 * (a_v + a_d·ε) - (b_v + b_d·ε) = (a_v - b_v) + (a_d - b_d)·ε
 * ```
 *
 * Equivalently, for differentiable functions `f` and `g` evaluated at `x` as
 * `a = { v: f(x), d: f'(x) }` and `b = { v: g(x), d: g'(x) }`, this computes
 * `{ v: (f - g)(x), d: (f - g)'(x) }` in forward-mode automatic differentiation.
 *
 * @param {DualNumber} a - Minuend dual number `{ v, d }`.
 * @param {DualNumber} b - Subtrahend dual number `{ v, d }`.
 * @returns {DualNumber} Difference dual number `{ v: a.v - b.v, d: a.d - b.d }`.
 * @throws {TypeError} If `a` or `b` is not a non-null object or has non-numeric `v`/`d` properties.
 * @throws {RangeError} If `v` or `d` of either input is `NaN`, `Infinity`, or `-Infinity`.
 */
export function subtractDualSeries(a, b) {
  const lhs = assertDualNumber(a, 'a');
  const rhs = assertDualNumber(b, 'b');

  // Degree-1 truncated Taylor series coefficients [c_0, c_1] for c_0 + c_1·ε (mod ε² = 0)
  const v = normalizeZero(lhs.v - rhs.v);
  const d = normalizeZero(lhs.d - rhs.d);

  return { v, d };
}
