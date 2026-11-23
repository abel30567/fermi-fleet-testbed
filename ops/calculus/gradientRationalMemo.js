/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * Exact rational number represented in lowest terms with `den > 0n`
 * and `0` represented canonically as `{ num: 0n, den: 1n }`.
 */

/**
 * @typedef {{ coeff: Rational, powers: number[] }} MonomialTerm
 * Multivariate polynomial monomial representing `coeff * x_0^powers[0] * ... * x_{n-1}^powers[n-1]`.
 */

const ZERO = Object.freeze({ num: 0n, den: 1n });
const ONE = Object.freeze({ num: 1n, den: 1n });

const MAX_POLY_CACHE_ENTRIES = 512;
const MAX_RESULT_CACHE_ENTRIES = 2048;

/**
 * Precomputed differentiation table cache keyed by canonical polynomial string.
 * @type {Map<string, { dim: number, maxPowers: number[], partials: Array<Array<{ coeff: Rational, powers: number[] }>> }>}
 */
const polyTableCache = new Map();

/**
 * Canonical gradient result memoization cache keyed by `${polyKey}@${pointKey}`.
 * @type {Map<string, Rational[]>}
 */
const resultCache = new Map();

/**
 * Compute greatest common divisor of two non-negative BigInts using Euclidean algorithm.
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
 * Normalize a rational number `(num / den)` into canonical lowest terms with `den > 0n`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero');
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
 * Validate and normalize a Rational object `{ num: bigint, den: bigint }`.
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function parseRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with bigint num and den properties`);
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must be BigInts`);
	}
	return normalizeRational(num, den);
}

/**
 * Add two normalized rationals, returning a normalized rational.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	if (a.num === 0n) return { num: b.num, den: b.den };
	if (b.num === 0n) return { num: a.num, den: a.den };
	const g = gcdBigInt(a.den, b.den);
	const aScale = b.den / g;
	const bScale = a.den / g;
	const num = a.num * aScale + b.num * bScale;
	const den = a.den * aScale;
	return normalizeRational(num, den);
}

/**
 * Multiply two normalized rationals using cross-cancellation.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = gcdBigInt(a.num, b.den);
	const g2 = gcdBigInt(b.num, a.den);
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	};
}

/**
 * Insert into a bounded Map using FIFO eviction.
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 * @param {number} maxEntries
 */
function setBoundedCache(cache, key, value, maxEntries) {
	if (cache.size >= maxEntries && !cache.has(key)) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey !== undefined) {
			cache.delete(oldestKey);
		}
	}
	cache.set(key, value);
}

/**
 * Compare two equal-length integer exponent arrays lexicographically.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function comparePowers(a, b) {
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return a[i] - b[i];
		}
	}
	return 0;
}

/**
 * Validate inputs and canonicalize polynomial terms by combining like monomials,
 * reducing coefficients, dropping zero terms, and sorting lexicographically by powers.
 *
 * @param {unknown} terms
 * @param {unknown} point
 * @returns {{ canonicalTerms: Array<{ coeff: Rational, powers: number[] }>, normalizedPoint: Rational[], polyKey: string, pointKey: string }}
 */
function validateAndCanonicalize(terms, point) {
	if (!Array.isArray(terms)) {
		throw new TypeError('terms must be an array of monomial objects { coeff, powers }');
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be a non-empty array of rationals');
	}
	const dim = point.length;
	if (dim === 0) {
		throw new RangeError('point must be a non-empty array of rationals');
	}

	/** @type {Rational[]} */
	const normalizedPoint = new Array(dim);
	/** @type {string[]} */
	const pointParts = new Array(dim);
	for (let i = 0; i < dim; i++) {
		const coord = parseRational(point[i], `point[${i}]`);
		normalizedPoint[i] = coord;
		pointParts[i] = `${coord.num}/${coord.den}`;
	}

	/** @type {Map<string, { coeff: Rational, powers: number[] }>} */
	const combined = new Map();

	for (let t = 0; t < terms.length; t++) {
		const term = terms[t];
		if (typeof term !== 'object' || term === null || Array.isArray(term)) {
			throw new TypeError(`terms[${t}] must be an object with coeff and powers`);
		}
		const coeff = parseRational(term.coeff, `terms[${t}].coeff`);
		if (!Array.isArray(term.powers)) {
			throw new TypeError(`terms[${t}].powers must be an array of non-negative safe integers`);
		}
		if (term.powers.length !== dim) {
			throw new RangeError(
				`terms[${t}].powers length (${term.powers.length}) must match point dimension (${dim})`,
			);
		}

		/** @type {number[]} */
		const powers = new Array(dim);
		for (let j = 0; j < dim; j++) {
			const p = term.powers[j];
			if (typeof p !== 'number' || !Number.isInteger(p) || !Number.isSafeInteger(p)) {
				throw new TypeError(`terms[${t}].powers[${j}] must be a non-negative safe integer`);
			}
			if (p < 0) {
				throw new RangeError(`terms[${t}].powers[${j}] must be non-negative`);
			}
			powers[j] = p;
		}

		if (coeff.num === 0n) {
			continue;
		}

		const pKey = powers.join(',');
		const existing = combined.get(pKey);
		if (existing) {
			existing.coeff = addRational(existing.coeff, coeff);
		} else {
			combined.set(pKey, { coeff, powers });
		}
	}

	/** @type {Array<{ coeff: Rational, powers: number[] }>} */
	const canonicalTerms = [];
	for (const entry of combined.values()) {
		if (entry.coeff.num !== 0n) {
			canonicalTerms.push(entry);
		}
	}
	canonicalTerms.sort((a, b) => comparePowers(a.powers, b.powers));

	const polyParts = canonicalTerms.map(
		(entry) => `${entry.coeff.num}/${entry.coeff.den}:[${entry.powers.join(',')}]`,
	);
	const polyKey = `${dim}|${polyParts.join(';')}`;
	const pointKey = pointParts.join(',');

	return { canonicalTerms, normalizedPoint, polyKey, pointKey };
}

/**
 * Build or retrieve the precomputed partial-derivative table and per-variable max-exponent table
 * for a canonical polynomial.
 *
 * @param {string} polyKey
 * @param {number} dim
 * @param {Array<{ coeff: Rational, powers: number[] }>} canonicalTerms
 * @returns {{ dim: number, maxPowers: number[], partials: Array<Array<{ coeff: Rational, powers: number[] }>> }}
 */
function getOrBuildPolyTable(polyKey, dim, canonicalTerms) {
	const cached = polyTableCache.get(polyKey);
	if (cached) {
		return cached;
	}

	/** @type {number[]} */
	const maxPowers = new Array(dim).fill(0);
	/** @type {Array<Array<{ coeff: Rational, powers: number[] }>>} */
	const partials = new Array(dim);

	for (let axis = 0; axis < dim; axis++) {
		/** @type {Map<string, { coeff: Rational, powers: number[] }>} */
		const derivCombined = new Map();

		for (let t = 0; t < canonicalTerms.length; t++) {
			const { coeff, powers } = canonicalTerms[t];
			const exp = powers[axis];
			if (exp === 0) {
				continue;
			}
			const derivPowers = powers.slice();
			derivPowers[axis] = exp - 1;
			const derivCoeff = mulRational(coeff, { num: BigInt(exp), den: 1n });

			const dKey = derivPowers.join(',');
			const prev = derivCombined.get(dKey);
			if (prev) {
				prev.coeff = addRational(prev.coeff, derivCoeff);
			} else {
				derivCombined.set(dKey, { coeff: derivCoeff, powers: derivPowers });
			}
		}

		/** @type {Array<{ coeff: Rational, powers: number[] }>} */
		const axisTerms = [];
		for (const entry of derivCombined.values()) {
			if (entry.coeff.num !== 0n) {
				axisTerms.push(entry);
				for (let j = 0; j < dim; j++) {
					if (entry.powers[j] > maxPowers[j]) {
						maxPowers[j] = entry.powers[j];
					}
				}
			}
		}
		partials[axis] = axisTerms;
	}

	const table = { dim, maxPowers, partials };
	setBoundedCache(polyTableCache, polyKey, table, MAX_POLY_CACHE_ENTRIES);
	return table;
}

/**
 * Precompute exact coordinate power tables `powerTables[j][k] = point[j]^k` for `0 <= k <= maxPowers[j]`.
 * Because each `point[j]` is in lowest terms (`gcd(|num|, den) === 1n`), each power
 * `(num^k, den^k)` is already reduced with zero extra GCD computations.
 *
 * @param {Rational[]} normalizedPoint
 * @param {number[]} maxPowers
 * @returns {Rational[][]}
 */
function buildPowerTables(normalizedPoint, maxPowers) {
	const dim = normalizedPoint.length;
	/** @type {Rational[][]} */
	const powerTables = new Array(dim);

	for (let j = 0; j < dim; j++) {
		const maxExp = maxPowers[j];
		/** @type {Rational[]} */
		const table = new Array(maxExp + 1);
		table[0] = ONE;
		if (maxExp > 0) {
			const base = normalizedPoint[j];
			if (base.num === 0n) {
				for (let k = 1; k <= maxExp; k++) {
					table[k] = ZERO;
				}
			} else {
				table[1] = base;
				for (let k = 2; k <= maxExp; k++) {
					const prev = table[k - 1];
					table[k] = {
						num: prev.num * base.num,
						den: prev.den * base.den,
					};
				}
			}
		}
		powerTables[j] = table;
	}

	return powerTables;
}

/**
 * Clone a cached rational vector so caller mutations cannot corrupt internal caches.
 * @param {Rational[]} vec
 * @returns {Rational[]}
 */
function cloneVector(vec) {
	return vec.map((r) => ({ num: r.num, den: r.den }));
}

/**
 * Compute the exact gradient vector `[∂f/∂x_0, ..., ∂f/∂x_{n-1}]` of a multivariate polynomial
 * over exact rationals `{ num: BigInt, den: BigInt }` in lowest terms, using precomputed
 * partial-derivative tables, per-coordinate power tables, and canonical memoization.
 *
 * Each monomial `{ coeff, powers }` represents `coeff * Π_j x_j^powers[j]`.
 * Duplicate monomials are combined, unreduced or negative-denominator rationals are canonicalized,
 * and `0^0` is treated as `1` per standard polynomial semantics.
 *
 * @param {MonomialTerm[]} terms - Array of polynomial monomials `{ coeff: Rational, powers: number[] }`.
 * @param {Rational[]} point - Non-empty evaluation point `[x_0, ..., x_{n-1}]` of exact rationals.
 * @returns {Rational[]} Exact rational gradient vector of length `point.length` in lowest terms.
 * @throws {TypeError} If `terms`, `point`, monomial fields, exponents, or rational components have invalid types.
 * @throws {RangeError} If `point` is empty, any rational denominator is `0n`, any exponent is negative,
 *   or any monomial's `powers.length` does not match `point.length`.
 */
export function gradientRationalMemo(terms, point) {
	const { canonicalTerms, normalizedPoint, polyKey, pointKey } = validateAndCanonicalize(terms, point);

	const fullKey = `${polyKey}@${pointKey}`;
	const cachedGradient = resultCache.get(fullKey);
	if (cachedGradient) {
		return cloneVector(cachedGradient);
	}

	const dim = normalizedPoint.length;
	const { maxPowers, partials } = getOrBuildPolyTable(polyKey, dim, canonicalTerms);
	const powerTables = buildPowerTables(normalizedPoint, maxPowers);

	/** @type {Rational[]} */
	const gradient = new Array(dim);

	for (let axis = 0; axis < dim; axis++) {
		const axisTerms = partials[axis];
		let sum = { num: 0n, den: 1n };

		for (let t = 0; t < axisTerms.length; t++) {
			const { coeff, powers } = axisTerms[t];
			let termVal = coeff;

			for (let j = 0; j < dim; j++) {
				const exp = powers[j];
				if (exp === 0) {
					continue;
				}
				const factor = powerTables[j][exp];
				if (factor.num === 0n) {
					termVal = ZERO;
					break;
				}
				termVal = mulRational(termVal, factor);
			}

			if (termVal.num !== 0n) {
				sum = addRational(sum, termVal);
			}
		}

		gradient[axis] = sum;
	}

	setBoundedCache(resultCache, fullKey, gradient, MAX_RESULT_CACHE_ENTRIES);
	return cloneVector(gradient);
}
