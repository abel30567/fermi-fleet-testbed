/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number in lowest terms with strictly positive denominator (`den > 0n`).
 * Zero is uniquely represented as `{ num: 0n, den: 1n }`.
 */

const ZERO = Object.freeze({ num: 0n, den: 1n });
const ONE = Object.freeze({ num: 1n, den: 1n });

/**
 * Computes the greatest common divisor of two BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Normalizes a numerator and denominator into an exact Rational in lowest terms
 * with strictly positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalize(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero');
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcdBigInt(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes a rational input `{ num: BigInt, den: BigInt }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {Rational}
 */
function assertRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`);
	}
	return normalize(num, den);
}

/**
 * Validates an integer parameter (safe JS number or BigInt) within `[min, max]`.
 *
 * @param {unknown} value
 * @param {string} name
 * @param {number} min
 * @param {number} [max=Number.MAX_SAFE_INTEGER]
 * @returns {number}
 */
function assertIntInRange(value, name, min, max = Number.MAX_SAFE_INTEGER) {
	if (typeof value === 'bigint') {
		if (value < BigInt(min) || value > BigInt(max)) {
			throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
		}
		return Number(value);
	}
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a finite safe integer or BigInt`);
	}
	if (!Number.isFinite(value) || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
		throw new RangeError(`${name} must be a finite safe integer`);
	}
	if (value < min || value > max) {
		throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
	}
	return value;
}

/**
 * Validates a positive integer passed either as a safe integer, BigInt, or an exact
 * rational reducing to a positive integer.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function assertPositiveIntegerOrRationalInt(value, name) {
	if (typeof value === 'number' || typeof value === 'bigint') {
		return assertIntInRange(value, name, 1);
	}
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const q = assertRational(value, name);
		if (q.den !== 1n) {
			throw new RangeError(`${name} must reduce to an integer for exact rational evaluation`);
		}
		if (q.num < 1n || q.num > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new RangeError(`${name} must be a positive integer within safe integer range`);
		}
		return Number(q.num);
	}
	throw new TypeError(`${name} must be a positive integer, BigInt, or exact rational integer`);
}

/**
 * Validates the argument count for a dispatched special function.
 *
 * @param {string} fnName
 * @param {unknown[]} args
 * @param {number} minArgs
 * @param {number} maxArgs
 */
function assertArgCount(fnName, args, minArgs, maxArgs = minArgs) {
	if (args.length < minArgs || args.length > maxArgs) {
		const expected = minArgs === maxArgs ? `${minArgs}` : `${minArgs} to ${maxArgs}`;
		throw new RangeError(
			`Function '${fnName}' expects ${expected} argument(s), received ${args.length}`
		);
	}
}

/**
 * Creates a normalized rational from a BigInt integer.
 *
 * @param {bigint} n
 * @returns {Rational}
 */
function intRat(n) {
	return { num: n, den: 1n };
}

/**
 * Exact rational addition in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratAdd(a, b) {
	if (a.num === 0n) return { num: b.num, den: b.den };
	if (b.num === 0n) return { num: a.num, den: a.den };
	const g = gcdBigInt(a.den, b.den);
	const aScale = b.den / g;
	const bScale = a.den / g;
	return normalize(a.num * aScale + b.num * bScale, bScale * b.den);
}

/**
 * Exact rational subtraction in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratSub(a, b) {
	return ratAdd(a, { num: -b.num, den: b.den });
}

/**
 * Exact rational multiplication in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratMul(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = gcdBigInt(a.num, b.den);
	const g2 = gcdBigInt(b.num, a.den);
	return normalize((a.num / g1) * (b.num / g2), (a.den / g2) * (b.den / g1));
}

/**
 * Exact rational division in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratDiv(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero in rational arithmetic');
	}
	return ratMul(a, { num: b.den, den: b.num });
}

/**
 * Iterative binary exponentiation for BigInt base and non-negative integer exponent.
 *
 * @param {bigint} base
 * @param {number} exp
 * @returns {bigint}
 */
function powBigInt(base, exp) {
	let result = 1n;
	let factor = base;
	let e = exp;
	while (e > 0) {
		if ((e & 1) === 1) {
			result *= factor;
		}
		e = Math.floor(e / 2);
		if (e > 0) {
			factor *= factor;
		}
	}
	return result;
}

/**
 * Computes the generalized harmonic number H_n^(m) = sum_{k=1}^n 1 / k^m iteratively.
 *
 * @param {number} n
 * @param {number} order
 * @returns {Rational}
 */
function computeHarmonic(n, order) {
	let sum = ZERO;
	for (let k = 1; k <= n; k++) {
		const term = { num: 1n, den: powBigInt(BigInt(k), order) };
		sum = ratAdd(sum, term);
	}
	return { num: sum.num, den: sum.den };
}

/**
 * Computes the n-th first Bernoulli number B_n (with B_1 = -1/2) iteratively
 * via the Akiyama-Tanigawa algorithm.
 *
 * @param {number} n
 * @returns {Rational}
 */
function computeBernoulli(n) {
	if (n === 0) return { num: 1n, den: 1n };
	if (n === 1) return { num: -1n, den: 2n };
	if (n % 2 === 1) return { num: 0n, den: 1n };

	const row = new Array(n + 1);
	for (let m = 0; m <= n; m++) {
		row[m] = { num: 1n, den: BigInt(m + 1) };
		for (let j = m; j >= 1; j--) {
			row[j - 1] = ratMul(intRat(BigInt(j)), ratSub(row[j - 1], row[j]));
		}
	}
	return { num: row[0].num, den: row[0].den };
}

/**
 * Computes the Pochhammer symbol (rising factorial) (x)_n = prod_{k=0}^{n-1} (x + k).
 *
 * @param {Rational} x
 * @param {number} n
 * @returns {Rational}
 */
function computePochhammer(x, n) {
	let acc = ONE;
	for (let k = 0; k < n; k++) {
		const factor = ratAdd(x, intRat(BigInt(k)));
		if (factor.num === 0n) {
			return { num: 0n, den: 1n };
		}
		acc = ratMul(acc, factor);
	}
	return { num: acc.num, den: acc.den };
}

/**
 * Computes the generalized binomial coefficient C(x, k) = prod_{i=0}^{k-1} (x - i) / (i + 1).
 *
 * @param {Rational} x
 * @param {number} k
 * @returns {Rational}
 */
function computeBinomial(x, k) {
	let acc = ONE;
	for (let i = 0; i < k; i++) {
		const numer = ratSub(x, intRat(BigInt(i)));
		if (numer.num === 0n) {
			return { num: 0n, den: 1n };
		}
		const step = ratDiv(numer, intRat(BigInt(i + 1)));
		acc = ratMul(acc, step);
	}
	return { num: acc.num, den: acc.den };
}

/**
 * Computes Gamma(n) = (n - 1)! as an exact rational for positive integer n.
 *
 * @param {number} n
 * @returns {Rational}
 */
function computeGamma(n) {
	let fact = 1n;
	for (let k = 2; k < n; k++) {
		fact *= BigInt(k);
	}
	return { num: fact, den: 1n };
}

/**
 * Computes the exact Beta function B(a, b) = (a - 1)!(b - 1)! / (a + b - 1)! iteratively
 * for positive integers a and b.
 *
 * @param {number} a
 * @param {number} b
 * @returns {Rational}
 */
function computeBeta(a, b) {
	const small = a <= b ? a : b;
	const large = a <= b ? b : a;
	// B(small, large) = (1 / large) * prod_{i=1}^{small - 1} (i / (large + i))
	let acc = { num: 1n, den: BigInt(large) };
	for (let i = 1; i < small; i++) {
		acc = ratMul(acc, { num: BigInt(i), den: BigInt(large + i) });
	}
	return { num: acc.num, den: acc.den };
}

/**
 * Evaluates the Legendre polynomial P_n(x) iteratively via Bonnet's recurrence:
 * (k + 1) P_{k+1}(x) = (2k + 1) x P_k(x) - k P_{k-1}(x).
 *
 * @param {number} n
 * @param {Rational} x
 * @returns {Rational}
 */
function computeLegendre(n, x) {
	if (n === 0) return { num: 1n, den: 1n };
	if (n === 1) return { num: x.num, den: x.den };

	let pPrev = ONE;
	let pCurr = x;
	for (let k = 1; k < n; k++) {
		const term1 = ratMul(ratMul(intRat(BigInt(2 * k + 1)), x), pCurr);
		const term2 = ratMul(intRat(BigInt(k)), pPrev);
		const pNext = ratDiv(ratSub(term1, term2), intRat(BigInt(k + 1)));
		pPrev = pCurr;
		pCurr = pNext;
	}
	return { num: pCurr.num, den: pCurr.den };
}

/**
 * Evaluates the Chebyshev polynomial of the first kind T_n(x) (kind === 1) or
 * second kind U_n(x) (kind === 2) iteratively via the three-term recurrence.
 *
 * @param {number} n
 * @param {Rational} x
 * @param {1 | 2} kind
 * @returns {Rational}
 */
function computeChebyshev(n, x, kind) {
	if (n === 0) return { num: 1n, den: 1n };
	const twoX = ratMul(intRat(2n), x);
	let prev = ONE;
	let curr = kind === 1 ? { num: x.num, den: x.den } : twoX;
	if (n === 1) return { num: curr.num, den: curr.den };

	for (let k = 1; k < n; k++) {
		const next = ratSub(ratMul(twoX, curr), prev);
		prev = curr;
		curr = next;
	}
	return { num: curr.num, den: curr.den };
}

/**
 * Evaluates the truncated exponential Taylor series sum_{k=0}^{terms-1} x^k / k!
 * iteratively in exact rational arithmetic.
 *
 * @param {Rational} x
 * @param {number} terms
 * @returns {Rational}
 */
function computeExpSeries(x, terms) {
	if (terms === 0) return { num: 0n, den: 1n };
	let sum = ONE;
	let term = ONE;
	for (let k = 1; k < terms; k++) {
		term = ratDiv(ratMul(term, x), intRat(BigInt(k)));
		sum = ratAdd(sum, term);
	}
	return { num: sum.num, den: sum.den };
}

/**
 * Evaluates classical special functions over exact rationals `{ num: BigInt, den: BigInt }`
 * using straightforward iterative algorithms. Every returned rational is strictly in lowest
 * terms with a positive denominator (`den > 0n`), with zero represented as `{ num: 0n, den: 1n }`.
 *
 * Supported functions (dispatched via `name`):
 * - `'harmonic'` `(n, order = 1)`: Generalized harmonic number H_n^(order) = sum_{k=1}^n 1/k^order
 *   for integer `n >= 0` and integer `order >= 1`.
 * - `'bernoulli'` `(n)`: First Bernoulli number B_n (with B_1 = -1/2) for integer `n >= 0`.
 * - `'pochhammer'` `(x, n)`: Rising factorial (x)_n = prod_{k=0}^{n-1} (x + k) for rational `x`
 *   and integer `n >= 0`.
 * - `'binomial'` `(x, k)`: Generalized binomial coefficient C(x, k) for rational `x` and
 *   integer `k >= 0`.
 * - `'gamma'` `(n)`: Exact Gamma function Gamma(n) = (n - 1)! for positive integer `n >= 1`
 *   (accepted as integer, BigInt, or exact rational reducing to a positive integer).
 * - `'beta'` `(a, b)`: Exact Beta function B(a, b) = Gamma(a)Gamma(b)/Gamma(a + b) for
 *   positive integers `a, b >= 1` (integer, BigInt, or exact rational integer).
 * - `'legendre'` `(n, x)`: Legendre polynomial P_n(x) for integer `n >= 0` and rational `x`.
 * - `'chebyshev'` `(n, x, kind = 1)`: Chebyshev polynomial T_n(x) (`kind = 1`) or U_n(x)
 *   (`kind = 2`) for integer `n >= 0` and rational `x`.
 * - `'expSeries'` `(x, terms)`: Truncated exponential series sum_{k=0}^{terms-1} x^k / k!
 *   for rational `x` and integer `terms >= 0`.
 *
 * @param {string} name - Name of the special function to evaluate.
 * @param {...unknown} args - Function-specific arguments.
 * @returns {Rational} Exact rational result `{ num: bigint, den: bigint }` in lowest terms.
 * @throws {TypeError} If `name` is not a string or any argument has an invalid type.
 * @throws {RangeError} If `name` is unknown, the argument count is invalid, a denominator is zero,
 *   or an argument is outside its valid mathematical domain (e.g., negative indices, non-finite
 *   or non-integer orders, poles of Gamma/Beta, or non-integer Gamma/Beta inputs).
 */
export function specialFunctionsRationalIterative(name, ...args) {
	if (typeof name !== 'string') {
		throw new TypeError('Function name must be a string');
	}

	switch (name) {
		case 'harmonic': {
			assertArgCount(name, args, 1, 2);
			const n = assertIntInRange(args[0], 'n', 0);
			const order = args[1] === undefined ? 1 : assertIntInRange(args[1], 'order', 1);
			return computeHarmonic(n, order);
		}

		case 'bernoulli': {
			assertArgCount(name, args, 1);
			const n = assertIntInRange(args[0], 'n', 0);
			return computeBernoulli(n);
		}

		case 'pochhammer': {
			assertArgCount(name, args, 2);
			const x = assertRational(args[0], 'x');
			const n = assertIntInRange(args[1], 'n', 0);
			return computePochhammer(x, n);
		}

		case 'binomial': {
			assertArgCount(name, args, 2);
			const x = assertRational(args[0], 'x');
			const k = assertIntInRange(args[1], 'k', 0);
			return computeBinomial(x, k);
		}

		case 'gamma': {
			assertArgCount(name, args, 1);
			const n = assertPositiveIntegerOrRationalInt(args[0], 'n');
			return computeGamma(n);
		}

		case 'beta': {
			assertArgCount(name, args, 2);
			const a = assertPositiveIntegerOrRationalInt(args[0], 'a');
			const b = assertPositiveIntegerOrRationalInt(args[1], 'b');
			return computeBeta(a, b);
		}

		case 'legendre': {
			assertArgCount(name, args, 2);
			const n = assertIntInRange(args[0], 'n', 0);
			const x = assertRational(args[1], 'x');
			return computeLegendre(n, x);
		}

		case 'chebyshev': {
			assertArgCount(name, args, 2, 3);
			const n = assertIntInRange(args[0], 'n', 0);
			const x = assertRational(args[1], 'x');
			const kind = args[2] === undefined ? 1 : assertIntInRange(args[2], 'kind', 1, 2);
			return computeChebyshev(n, x, /** @type {1 | 2} */ (kind));
		}

		case 'expSeries': {
			assertArgCount(name, args, 2);
			const x = assertRational(args[0], 'x');
			const terms = assertIntInRange(args[1], 'terms', 0);
			return computeExpSeries(x, terms);
		}

		default:
			throw new RangeError(`Unknown special function: '${name}'`);
	}
}
