/**
 * Fixed-point scaling factor (10^18) used for BigInt calculus operations.
 * A real value `r` is represented as the BigInt `round(r * SCALE)`.
 *
 * @type {bigint}
 */
export const SCALE = 1_000_000_000_000_000_000n;

/**
 * Supported numerical integration methods.
 *
 * @type {ReadonlySet<string>}
 */
const SUPPORTED_METHODS = new Set(['simpson', 'trapezoidal']);

/**
 * Divides two BigInt values with round-half-to-even (banker's rounding).
 * Preserves exact odd symmetry: `divRoundHalfEven(-num, den) === -divRoundHalfEven(num, den)`.
 *
 * @param {bigint} num - Signed dividend.
 * @param {bigint} den - Strictly positive divisor.
 * @returns {bigint} Rounded quotient.
 */
function divRoundHalfEven(num, den) {
	const negative = num < 0n;
	const absNum = negative ? -num : num;
	const quotient = absNum / den;
	const remainder = absNum % den;
	const twiceRemainder = remainder * 2n;

	let rounded = quotient;
	if (twiceRemainder > den || (twiceRemainder === den && (quotient & 1n) === 1n)) {
		rounded = quotient + 1n;
	}

	return negative ? -rounded : rounded;
}

/**
 * Evaluates the integrand at a point and validates that it returns a BigInt.
 *
 * @param {(x: bigint) => bigint} fn - Integrand function.
 * @param {bigint} x - Evaluation point (fixed-point scaled by SCALE).
 * @returns {bigint} Integrand value (fixed-point scaled by SCALE).
 * @throws {TypeError} If `fn(x)` does not return a BigInt.
 */
function evalIntegrand(fn, x) {
	const y = fn(x);
	if (typeof y !== 'bigint') {
		throw new TypeError(`Integrand fn(x) must return a BigInt, got ${typeof y}`);
	}
	return y;
}

/**
 * Computes the definite numerical integral of `fn` over `[a, b]` using an iterative
 * composite quadrature rule over exact BigInt fixed-point numbers scaled by `10^18`.
 *
 * Both bounds `a`, `b`, the argument passed to `fn(x)`, the value returned by `fn(x)`,
 * and the returned integral are fixed-point BigInt values scaled by `SCALE` (`10n ** 18n`).
 * For example, `1.5` is represented as `1_500_000_000_000_000_000n`.
 *
 * Supported methods:
 * - `'simpson'` (default): Iterative composite Simpson's 1/3 rule. Requires `steps` to be
 *   a positive even BigInt. Exact (up to final rounding) for polynomials of degree <= 3.
 * - `'trapezoidal'`: Iterative composite trapezoidal rule. Requires `steps` to be any
 *   positive BigInt. Exact (up to final rounding) for linear functions.
 *
 * Intermediate sums are accumulated exactly in BigInt arithmetic with a single final
 * round-half-to-even scaling division to minimize rounding error. Oriented bounds are
 * handled via `integral(fn, b, a) === -integral(fn, a, b)`.
 *
 * @param {(x: bigint) => bigint} fn - Integrand mapping a fixed-point BigInt `x` (scaled by `10^18`)
 *   to a fixed-point BigInt `f(x)` (scaled by `10^18`).
 * @param {bigint} a - Lower bound of integration (fixed-point BigInt scaled by `10^18`).
 * @param {bigint} b - Upper bound of integration (fixed-point BigInt scaled by `10^18`).
 * @param {bigint} [steps=1000n] - Number of subintervals (positive BigInt; must be even for `'simpson'`).
 * @param {'simpson' | 'trapezoidal'} [method='simpson'] - Quadrature rule to apply.
 * @returns {bigint} Approximate definite integral scaled by `10^18`.
 * @throws {TypeError} If `fn` is not a function, `a`/`b`/`steps` are not BigInts, `method` is not a string,
 *   or `fn(x)` returns a non-BigInt.
 * @throws {RangeError} If `steps <= 0n`, `method` is unsupported, or `method === 'simpson'` with odd `steps`.
 */
export function integralBigIntIterative(fn, a, b, steps = 1000n, method = 'simpson') {
	if (typeof fn !== 'function') {
		throw new TypeError(`Expected integrand fn to be a function, got ${typeof fn}`);
	}
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected lower bound a to be a BigInt, got ${typeof a}`);
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected upper bound b to be a BigInt, got ${typeof b}`);
	}
	if (typeof steps !== 'bigint') {
		throw new TypeError(`Expected steps to be a BigInt, got ${typeof steps}`);
	}
	if (steps <= 0n) {
		throw new RangeError(`Expected steps to be a positive BigInt, got ${steps}`);
	}
	if (typeof method !== 'string') {
		throw new TypeError(`Expected method to be a string, got ${typeof method}`);
	}
	if (!SUPPORTED_METHODS.has(method)) {
		throw new RangeError(
			`Unsupported integration method "${method}"; expected "simpson" or "trapezoidal"`
		);
	}
	if (method === 'simpson' && (steps & 1n) !== 0n) {
		throw new RangeError(
			`Composite Simpson's rule requires an even positive number of steps, got ${steps}`
		);
	}

	if (a === b) {
		return 0n;
	}

	const sign = a > b ? -1n : 1n;
	const lo = a > b ? b : a;
	const hi = a > b ? a : b;
	const span = hi - lo;

	let weightedSum = evalIntegrand(fn, lo) + evalIntegrand(fn, hi);

	if (method === 'simpson') {
		for (let i = 1n; i < steps; i += 1n) {
			const x = lo + divRoundHalfEven(span * i, steps);
			const fx = evalIntegrand(fn, x);
			weightedSum += (i & 1n) === 1n ? fx * 4n : fx * 2n;
		}
		const result = divRoundHalfEven(span * weightedSum, 3n * steps * SCALE);
		return sign * result;
	}

	// Composite trapezoidal rule
	for (let i = 1n; i < steps; i += 1n) {
		const x = lo + divRoundHalfEven(span * i, steps);
		weightedSum += evalIntegrand(fn, x) * 2n;
	}
	const result = divRoundHalfEven(span * weightedSum, 2n * steps * SCALE);
	return sign * result;
}
