/**
 * Exact rational cube root via dyadic range reduction and the generalized binomial series.
 *
 * Represents rationals as `{ num: bigint, den: bigint }` in lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`, and `{ num: 0n, den: 1n }` for zero).
 *
 * For a normalized positive rational `x = p / q`:
 * 1. If both `p` and `q` are exact integer cubes (`p = a^3`, `q = b^3`), returns the
 *    exact cube root `{ num: sign * a, den: b }` immediately.
 * 2. Otherwise, applies the scaling identity `cbrt(x) = r * (1 + u)^(1/3)` using an
 *    exact dyadic rational anchor `r = a * 2^(-s)` chosen so that `|u| = |x / r^3 - 1| < 0.1`,
 *    then evaluates the generalized binomial series:
 *
 *        (1 + u)^(1/3) = sum_{k=0}^{terms-1} C(1/3, k) * u^k
 *
 *    using exact BigInt rational arithmetic via the recurrence:
 *        t_0 = 1,   t_k = t_{k-1} * ((4 - 3k) / (3k)) * u
 *
 * Zero dependencies; ESM; Node 20+.
 */

const DEFAULT_TERMS = 16;
const ANCHOR_BITS = 4;

/**
 * Absolute value of a BigInt.
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
	return n < 0n ? -n : n;
}

/**
 * Greatest common divisor of two non-negative BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a;
	let y = b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Normalizes a rational `(num, den)` to lowest terms with `den > 0n`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
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
	const g = gcd(absBigInt(n), d);
	return { num: n / g, den: d / g };
}

/**
 * Adds two normalized rationals and returns the sum in lowest terms.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	const g = gcd(a.den, b.den);
	const aScale = b.den / g;
	const bScale = a.den / g;
	return normalize(a.num * aScale + b.num * bScale, (a.den / g) * b.den);
}

/**
 * Bit length of a positive BigInt `n > 0n`.
 * @param {bigint} n
 * @returns {number}
 */
function bitLength(n) {
	return n.toString(2).length;
}

/**
 * Exact integer floor cube root `floor(n^(1/3))` for `n >= 0n`.
 * @param {bigint} n
 * @returns {bigint}
 */
function icbrt(n) {
	if (n === 0n) return 0n;
	if (n < 8n) return 1n;

	const bits = bitLength(n);
	let lo = 1n << BigInt(Math.floor((bits - 1) / 3));
	let hi = 1n << BigInt(Math.ceil(bits / 3));

	while (lo + 1n < hi) {
		const mid = (lo + hi) >> 1n;
		if (mid * mid * mid <= n) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return lo;
}

/**
 * Validates and normalizes the input rational object.
 * @param {unknown} x
 * @returns {{ num: bigint, den: bigint }}
 */
function parseRational(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Input x must be an object with BigInt properties { num, den }');
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (x);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('Rational properties num and den must both be BigInt values');
	}
	return normalize(num, den);
}

/**
 * Validates the optional terms argument or options object.
 * @param {unknown} optionsOrTerms
 * @returns {number}
 */
function parseTerms(optionsOrTerms) {
	let terms;
	if (optionsOrTerms === undefined) {
		terms = DEFAULT_TERMS;
	} else if (typeof optionsOrTerms === 'number') {
		terms = optionsOrTerms;
	} else if (
		optionsOrTerms !== null &&
		typeof optionsOrTerms === 'object' &&
		!Array.isArray(optionsOrTerms)
	) {
		const opt = /** @type {{ terms?: unknown }} */ (optionsOrTerms);
		if (opt.terms === undefined) {
			terms = DEFAULT_TERMS;
		} else if (typeof opt.terms === 'number') {
			terms = opt.terms;
		} else {
			throw new TypeError('options.terms must be a positive safe integer');
		}
	} else {
		throw new TypeError('Second argument must be a positive integer or an options object { terms }');
	}

	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('terms must be a positive safe integer (>= 1)');
	}
	return terms;
}

/**
 * Computes the cube root of an exact rational number `{ num: bigint, den: bigint }`
 * in lowest terms using exact dyadic range reduction and the generalized binomial series
 * for `(1 + u)^(1/3)`.
 *
 * - Handles positive, negative, and zero rationals (`cbrt(-x) = -cbrt(x)`).
 * - Returns the exact result for any rational whose reduced numerator and denominator
 *   are perfect integer cubes.
 * - For non-cube rationals, with the default `terms = 16`, relative error is `< 1e-18`.
 *
 * @param {{ num: bigint, den: bigint }} x - Input rational number (`den !== 0n`).
 * @param {number | { terms?: number }} [optionsOrTerms=16] - Number of binomial series terms
 *   (positive safe integer, default `16`) or an options object `{ terms?: number }`.
 * @returns {{ num: bigint, den: bigint }} Cube root as a reduced rational `{ num, den }` with `den > 0n`.
 * @throws {TypeError} If `x` is not `{ num: bigint, den: bigint }` or `optionsOrTerms` has an invalid type.
 * @throws {RangeError} If `x.den === 0n` or `terms` is not a positive safe integer.
 */
export function cbrtRationalSeries(x, optionsOrTerms = DEFAULT_TERMS) {
	const rIn = parseRational(x);
	const terms = parseTerms(optionsOrTerms);

	if (rIn.num === 0n) {
		return { num: 0n, den: 1n };
	}

	const sign = rIn.num < 0n ? -1n : 1n;
	const p = absBigInt(rIn.num);
	const q = rIn.den;

	// Exact rational cube fast-path (equivalent to u = 0 in the series identity)
	const aExact = icbrt(p);
	const bExact = icbrt(q);
	if (aExact * aExact * aExact === p && bExact * bExact * bExact === q) {
		return { num: sign * aExact, den: bExact };
	}

	// Dyadic range reduction: find s such that 2^(3*ANCHOR_BITS) < (p/q) * 2^(3s) < 2^(3*ANCHOR_BITS + 4)
	const diffBits = bitLength(p) - bitLength(q);
	const shift = Math.ceil((3 * ANCHOR_BITS + 1 - diffBits) / 3);

	let scaledNum = p;
	let scaledDen = q;
	if (shift >= 0) {
		scaledNum = p << BigInt(3 * shift);
	} else {
		scaledDen = q << BigInt(-3 * shift);
	}

	const aFloor = icbrt(scaledNum / scaledDen);
	const aCeil = aFloor + 1n;

	const aFloorCube = aFloor * aFloor * aFloor;
	const aCeilCube = aCeil * aCeil * aCeil;
	const diffFloor = scaledNum - scaledDen * aFloorCube;
	const diffCeil = scaledDen * aCeilCube - scaledNum;

	// Pick whichever of aFloor or aCeil minimizes |u| = |scaledNum / (scaledDen * a^3) - 1|
	const a = diffFloor * aCeilCube <= diffCeil * aFloorCube ? aFloor : aCeil;
	const aCube = a === aFloor ? aFloorCube : aCeilCube;

	// Anchor r = a * 2^(-shift)
	const anchor =
		shift >= 0
			? normalize(a, 1n << BigInt(shift))
			: normalize(a << BigInt(-shift), 1n);

	// u = x / r^3 - 1 = (scaledNum - scaledDen * a^3) / (scaledDen * a^3), guaranteed |u| < 0.1
	const u = normalize(scaledNum - scaledDen * aCube, scaledDen * aCube);

	// Evaluate (1 + u)^(1/3) = sum_{k=0}^{terms-1} C(1/3, k) * u^k
	let sum = { num: 1n, den: 1n };
	let term = { num: 1n, den: 1n };

	if (u.num !== 0n) {
		for (let k = 1n; k < BigInt(terms); k++) {
			const factorNum = (4n - 3n * k) * u.num;
			const factorDen = 3n * k * u.den;
			term = normalize(term.num * factorNum, term.den * factorDen);
			sum = addRational(sum, term);
		}
	}

	return normalize(sign * anchor.num * sum.num, anchor.den * sum.den);
}
