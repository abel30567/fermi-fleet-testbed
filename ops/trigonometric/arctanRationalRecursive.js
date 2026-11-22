/**
 * Compute `arctan(x)` over exact BigInt rationals `{ num: bigint, den: bigint }`
 * using recursive argument reduction and recursive divide-and-conquer binary
 * splitting of the Maclaurin series.
 *
 * Exact / identity cases:
 * - `arctan(0) = { num: 0n, den: 1n }` (exact).
 * - Odd symmetry: `arctan(-x) = -arctan(x)`.
 * - Reciprocal reduction for `x > 1`: `arctan(x) = pi/2 - arctan(1/x)`.
 * - Unit case `x = 1`: `arctan(1) = pi/4 = 4*arctan(1/5) - arctan(1/239)` (Machin's formula).
 * - Recursive angle-addition reduction for `x in (1/8, 1)`:
 *   `arctan(x) = arctan(1/8) + arctan((8x - 1) / (8 + x))`, reducing any input
 *   in `(0, 1)` into `(0, 1/8]` in at most 6 exact rational steps.
 * - For `0 < x <= 1/8` (and the Machin constants `1/5`, `1/239`), evaluates the
 *   alternating Taylor series `sum_{k=0}^{N-1} (-1)^k x^(2k+1) / (2k+1)` using
 *   recursive binary splitting with exact BigInt arithmetic and a rigorous
 *   alternating-series remainder bound `|R_N(x)| < x^(2N+1) / (2N+1) <= tolerance`.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 *
 * @typedef {Object} ArctanOptions
 * @property {Rational} [tolerance] Positive rational upper bound on absolute error
 *   (default `{ num: 1n, den: 10n ** 15n }`, guaranteeing error <= 1e-12).
 * @property {number} [precision] Positive integer number of decimal digits of
 *   accuracy (`tolerance <= 10^(-precision)`).
 * @property {number} [terms] Positive integer number of Taylor series terms to use
 *   per reduced series evaluation (minimum term count when combined with
 *   `tolerance` or `precision`).
 *
 * @param {Rational} x Exact rational input `{ num: bigint, den: bigint }` with `den !== 0n`.
 * @param {ArctanOptions | Rational} [options] Optional accuracy configuration or
 *   positive rational tolerance.
 * @returns {Rational} Exact rational approximation to `arctan(x)` in lowest terms
 *   with `den > 0n`, `gcd(|num|, den) === 1n`, and zero as `{ num: 0n, den: 1n }`.
 * @throws {TypeError} If `x` or `options` has invalid types or structure.
 * @throws {RangeError} If `x.den === 0n` or any option is out of its valid domain.
 */
export function arctanRationalRecursive(x, options) {
	const rationalX = validateRational(x, 'x');
	const config = parseOptions(options);

	if (rationalX.num === 0n) {
		return { num: 0n, den: 1n };
	}

	return arctanRecursive(rationalX, config);
}

const ONE_FIFTH = Object.freeze({ num: 1n, den: 5n });
const ONE_EIGHTH = Object.freeze({ num: 1n, den: 8n });
const ONE_OVER_239 = Object.freeze({ num: 1n, den: 239n });
const DEFAULT_TOLERANCE = Object.freeze({ num: 1n, den: 10n ** 15n });

/**
 * Compute absolute value of a BigInt.
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
	return n < 0n ? -n : n;
}

/**
 * Compute greatest common divisor of two non-negative BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Normalize a rational (num / den) to lowest terms with den > 0n.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalize(num, den) {
	if (den === 0n) {
		throw new RangeError('Denominator must not be zero');
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

/**
 * Validate that a value is an exact rational `{ num: bigint, den: bigint }` with `den !== 0n`.
 * @param {unknown} value
 * @param {string} name
 * @returns {Rational}
 */
function validateRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with bigint properties { num, den }`);
	}
	const obj = /** @type {Record<string, unknown>} */ (value);
	if (typeof obj.num !== 'bigint' || typeof obj.den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`);
	}
	if (obj.den === 0n) {
		throw new RangeError(`${name}.den must not be zero`);
	}
	return normalize(obj.num, obj.den);
}

/**
 * Parse and validate optional tolerance / precision / terms settings.
 * @param {unknown} options
 * @returns {{ tolerance: Rational | null, terms: number | null }}
 */
function parseOptions(options) {
	if (options === undefined) {
		return { tolerance: DEFAULT_TOLERANCE, terms: null };
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be an object or a positive rational { num, den }');
	}

	const obj = /** @type {Record<string, unknown>} */ (options);

	// Allow passing a rational tolerance directly as the second argument
	if ('num' in obj || 'den' in obj) {
		const tol = validateRational(obj, 'tolerance');
		if (tol.num <= 0n) {
			throw new RangeError('tolerance must be strictly positive');
		}
		return { tolerance: tol, terms: null };
	}

	let tolerance = null;
	let terms = null;

	if (obj.tolerance !== undefined) {
		const tol = validateRational(obj.tolerance, 'options.tolerance');
		if (tol.num <= 0n) {
			throw new RangeError('options.tolerance must be strictly positive');
		}
		tolerance = tol;
	}

	if (obj.precision !== undefined) {
		if (typeof obj.precision !== 'number') {
			throw new TypeError('options.precision must be a positive integer');
		}
		if (!Number.isInteger(obj.precision) || !Number.isSafeInteger(obj.precision) || obj.precision < 1) {
			throw new RangeError('options.precision must be a positive safe integer');
		}
		const precTol = { num: 1n, den: 10n ** BigInt(obj.precision) };
		tolerance = tolerance === null ? precTol : minRat(tolerance, precTol);
	}

	if (obj.terms !== undefined) {
		if (typeof obj.terms !== 'number') {
			throw new TypeError('options.terms must be a positive integer');
		}
		if (!Number.isInteger(obj.terms) || !Number.isSafeInteger(obj.terms) || obj.terms < 1) {
			throw new RangeError('options.terms must be a positive safe integer');
		}
		terms = obj.terms;
	}

	if (tolerance === null && terms === null) {
		tolerance = DEFAULT_TOLERANCE;
	}

	return { tolerance, terms };
}

/**
 * Return the smaller of two normalized rationals.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function minRat(a, b) {
	return a.num * b.den <= b.num * a.den ? a : b;
}

/**
 * Exact rational addition.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRat(a, b) {
	return normalize(a.num * b.den + b.num * a.den, a.den * b.den);
}

/**
 * Exact rational subtraction.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function subRat(a, b) {
	return normalize(a.num * b.den - b.num * a.den, a.den * b.den);
}

/**
 * Exact rational multiplication by a BigInt integer.
 * @param {Rational} a
 * @param {bigint} k
 * @returns {Rational}
 */
function scaleRat(a, k) {
	return normalize(a.num * k, a.den);
}

/**
 * Scale a tolerance config by 1 / divisor (positive BigInt).
 * @param {{ tolerance: Rational | null, terms: number | null }} config
 * @param {bigint} divisor
 * @returns {{ tolerance: Rational | null, terms: number | null }}
 */
function tightenConfig(config, divisor) {
	if (config.tolerance === null) {
		return config;
	}
	return {
		tolerance: normalize(config.tolerance.num, config.tolerance.den * divisor),
		terms: config.terms,
	};
}

/**
 * Top-level recursive dispatcher handling sign symmetry, reciprocal reduction
 * for |x| > 1, unit Machin identity for x = 1, and recursive unit-interval reduction.
 *
 * @param {Rational} x Normalized rational.
 * @param {{ tolerance: Rational | null, terms: number | null }} config
 * @returns {Rational}
 */
function arctanRecursive(x, config) {
	if (x.num === 0n) {
		return { num: 0n, den: 1n };
	}

	// Odd symmetry: arctan(-x) = -arctan(x)
	if (x.num < 0n) {
		const pos = arctanRecursive({ num: -x.num, den: x.den }, config);
		return { num: -pos.num, den: pos.den };
	}

	// Exact unit case: arctan(1) = pi / 4
	if (x.num === x.den) {
		return computePiOverFour(config);
	}

	// Reciprocal reduction for x > 1: arctan(x) = pi/2 - arctan(1/x)
	if (x.num > x.den) {
		const piOverFour = computePiOverFour(tightenConfig(config, 4n));
		const piOverTwo = scaleRat(piOverFour, 2n);
		const reciprocal = { num: x.den, den: x.num };
		const arctanReciprocal = arctanRecursive(reciprocal, tightenConfig(config, 2n));
		return subRat(piOverTwo, arctanReciprocal);
	}

	// 0 < x < 1: recursively reduce x into (0, 1/8]
	const { steps, remainder } = reduceUnitIntervalRecursive(x, 0n);

	if (steps === 0n) {
		return arctanSmall(remainder, config);
	}

	if (remainder.num === 0n) {
		const base = arctanSmall(ONE_EIGHTH, tightenConfig(config, steps));
		return scaleRat(base, steps);
	}

	// Split error budget equally between `steps * arctan(1/8)` and `arctan(remainder)`
	const base = arctanSmall(ONE_EIGHTH, tightenConfig(config, 2n * steps));
	const remVal = arctanSmall(remainder, tightenConfig(config, 2n));
	return addRat(scaleRat(base, steps), remVal);
}

/**
 * Compute pi/4 using Machin's formula:
 *   pi / 4 = 4 * arctan(1/5) - arctan(1/239)
 *
 * Error budget: 4 * (tol / 8) + (tol / 2) = tol.
 *
 * @param {{ tolerance: Rational | null, terms: number | null }} config
 * @returns {Rational}
 */
function computePiOverFour(config) {
	const a = arctanSmall(ONE_FIFTH, tightenConfig(config, 8n));
	const b = arctanSmall(ONE_OVER_239, tightenConfig(config, 2n));
	return subRat(scaleRat(a, 4n), b);
}

/**
 * Recursively reduce x in (0, 1) into (0, 1/8] via the exact rational identity:
 *   arctan(x) = arctan(1/8) + arctan((8x - 1) / (8 + x))
 *
 * Terminates in at most 6 recursive calls for any x in (0, 1).
 *
 * @param {Rational} x Positive rational with 0 < x < 1.
 * @param {bigint} steps Accumulated number of arctan(1/8) reductions.
 * @returns {{ steps: bigint, remainder: Rational }}
 */
function reduceUnitIntervalRecursive(x, steps) {
	if (8n * x.num <= x.den) {
		return { steps, remainder: x };
	}
	const next = normalize(8n * x.num - x.den, 8n * x.den + x.num);
	return reduceUnitIntervalRecursive(next, steps + 1n);
}

/**
 * Evaluate arctan(x) for 0 < x < 1 using recursive binary splitting of the
 * Maclaurin series sum_{k=0}^{N-1} (-1)^k * x^(2k+1) / (2k+1).
 *
 * @param {Rational} x Positive rational with 0 < x < 1.
 * @param {{ tolerance: Rational | null, terms: number | null }} config
 * @returns {Rational}
 */
function arctanSmall(x, config) {
	let n = 1;
	if (config.tolerance !== null) {
		n = requiredSeriesTerms(x.num, x.den, config.tolerance);
	}
	if (config.terms !== null) {
		n = config.tolerance !== null ? Math.max(n, config.terms) : config.terms;
	}

	const p = x.num;
	const q = x.den;
	const u = -(p * p);
	const v = q * q;

	const { T, D, vPow } = binarySplitArctan(0, n, u, v);
	// Series value = (p / q) * T / (D * v^(n - 1)) = (p * q * T) / (D * v^n)
	return normalize(p * q * T, D * vPow);
}

/**
 * Determine the smallest N >= 1 such that the alternating-series remainder bound
 * satisfies p^(2N+1) / ((2N+1) * q^(2N+1)) <= eps.num / eps.den.
 *
 * @param {bigint} p Positive numerator (p < q).
 * @param {bigint} q Positive denominator.
 * @param {Rational} eps Positive rational tolerance.
 * @returns {number}
 */
function requiredSeriesTerms(p, q, eps) {
	const p2 = p * p;
	const q2 = q * q;
	let n = 1;
	let pPow = p * p2; // p^3
	let qPow = q * q2; // q^3
	while (pPow * eps.den > BigInt(2 * n + 1) * qPow * eps.num) {
		n += 1;
		pPow *= p2;
		qPow *= q2;
	}
	return n;
}

/**
 * Recursive divide-and-conquer binary splitting over k in [a, b) for:
 *   sum_{k=a}^{b-1} (u / v)^(k - a) / (2k + 1) = T / (D * v^(b - a - 1))
 *
 * @param {number} a Inclusive start index.
 * @param {number} b Exclusive end index (b > a).
 * @param {bigint} u -p^2
 * @param {bigint} v q^2
 * @returns {{ T: bigint, D: bigint, uPow: bigint, vPow: bigint }}
 */
function binarySplitArctan(a, b, u, v) {
	if (b - a === 1) {
		return {
			T: 1n,
			D: 2n * BigInt(a) + 1n,
			uPow: u,
			vPow: v,
		};
	}

	const mid = a + ((b - a) >> 1);
	const left = binarySplitArctan(a, mid, u, v);
	const right = binarySplitArctan(mid, b, u, v);

	return {
		T: left.T * right.D * right.vPow + right.T * left.D * left.uPow,
		D: left.D * right.D,
		uPow: left.uPow * right.uPow,
		vPow: left.vPow * right.vPow,
	};
}
