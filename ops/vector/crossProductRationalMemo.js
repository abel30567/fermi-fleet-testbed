/**
 * @fileoverview Table-driven, memoized 3D vector cross product over exact rationals.
 *
 * Each rational number is represented as `{ num: bigint, den: bigint }` and
 * normalized to lowest terms with a strictly positive denominator (`den > 0n`),
 * with zero canonically represented as `{ num: 0n, den: 1n }`.
 */

/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Precomputed non-zero entries of the 3D Levi-Civita tensor ε_{ijk}.
 * Each entry `[out, i, j, sign]` contributes `sign * a[i] * b[j]` to component `out`
 * of the cross product `a × b`.
 *
 * @type {ReadonlyArray<readonly [number, number, number, bigint]>}
 */
const LEVI_CIVITA_TABLE = Object.freeze([
	Object.freeze([0, 1, 2, 1n]),
	Object.freeze([0, 2, 1, -1n]),
	Object.freeze([1, 2, 0, 1n]),
	Object.freeze([1, 0, 2, -1n]),
	Object.freeze([2, 0, 1, 1n]),
	Object.freeze([2, 1, 0, -1n]),
]);

/**
 * Precomputed GCD lookup table for small non-negative integers [0..64].
 * Speeds up reduction for common small numerators/denominators.
 */
const SMALL_GCD_LIMIT = 64;
const SMALL_GCD_TABLE = (() => {
	const table = Array.from({ length: SMALL_GCD_LIMIT + 1 }, () =>
		new Array(SMALL_GCD_LIMIT + 1).fill(0n),
	);
	for (let a = 0; a <= SMALL_GCD_LIMIT; a++) {
		for (let b = 0; b <= SMALL_GCD_LIMIT; b++) {
			let x = a;
			let y = b;
			while (y !== 0) {
				const t = x % y;
				x = y;
				y = t;
			}
			table[a][b] = BigInt(x);
		}
		Object.freeze(table[a]);
	}
	return Object.freeze(table);
})();

/** Maximum number of canonical vector-pair results retained in the memo cache. */
const MAX_CACHE_SIZE = 4096;

/**
 * Canonical memoization cache mapping `"aKey|bKey"` to frozen reduced results.
 * @type {Map<string, ReadonlyArray<Readonly<Rational>>>}
 */
const memoCache = new Map();

/**
 * Computes the absolute value of a BigInt.
 * @param {bigint} n
 * @returns {bigint}
 */
function bigintAbs(n) {
	return n < 0n ? -n : n;
}

/**
 * Computes the greatest common divisor of two non-negative BigInts,
 * using the precomputed small GCD table when both operands fit.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function bigintGcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		if (x <= BigInt(SMALL_GCD_LIMIT) && y <= BigInt(SMALL_GCD_LIMIT)) {
			return SMALL_GCD_TABLE[Number(x)][Number(y)];
		}
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Reduces a fraction `num / den` to canonical lowest terms with `den > 0n`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function reduceRational(num, den) {
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
	const g = bigintGcd(bigintAbs(n), d);
	return { num: n / g, den: d / g };
}

/**
 * Validates and canonicalizes a single rational input.
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
		throw new TypeError(`${label} must have bigint num and den properties`);
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must be non-zero`);
	}
	return reduceRational(num, den);
}

/**
 * Validates and canonicalizes a 3D vector of exact rationals.
 * @param {unknown} vec
 * @param {string} name
 * @returns {[Rational, Rational, Rational]}
 */
function parseVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 rational numbers`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3 (received ${vec.length})`);
	}
	/** @type {Rational[]} */
	const normalized = new Array(3);
	for (let idx = 0; idx < 3; idx++) {
		if (!(idx in vec)) {
			throw new TypeError(`${name}[${idx}] must not be empty`);
		}
		normalized[idx] = parseRational(vec[idx], `${name}[${idx}]`);
	}
	return /** @type {[Rational, Rational, Rational]} */ (normalized);
}

/**
 * Multiplies two canonical rationals with cross-cancellation, returning a canonical rational.
 * @param {Rational} r1
 * @param {Rational} r2
 * @returns {Rational}
 */
function mulRational(r1, r2) {
	if (r1.num === 0n || r2.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = bigintGcd(bigintAbs(r1.num), r2.den);
	const g2 = bigintGcd(bigintAbs(r2.num), r1.den);
	return {
		num: (r1.num / g1) * (r2.num / g2),
		den: (r1.den / g2) * (r2.den / g1),
	};
}

/**
 * Adds a signed rational term (`sign * term`) to a canonical rational accumulator.
 * @param {Rational} acc
 * @param {Rational} term
 * @param {bigint} sign
 * @returns {Rational}
 */
function addSignedRational(acc, term, sign) {
	const signedNum = sign * term.num;
	if (signedNum === 0n) {
		return acc;
	}
	if (acc.num === 0n) {
		return { num: signedNum, den: term.den };
	}
	return reduceRational(acc.num * term.den + signedNum * acc.den, acc.den * term.den);
}

/**
 * Builds a canonical string key for a normalized 3D rational vector.
 * @param {readonly [Rational, Rational, Rational]} vec
 * @returns {string}
 */
function vectorKey(vec) {
	return `${vec[0].num}/${vec[0].den},${vec[1].num}/${vec[1].den},${vec[2].num}/${vec[2].den}`;
}

/**
 * Returns a fresh deep copy of a 3D rational vector, optionally negated.
 * @param {ReadonlyArray<Readonly<Rational>>} vec
 * @param {boolean} [negate=false]
 * @returns {[Rational, Rational, Rational]}
 */
function cloneVector(vec, negate = false) {
	return [
		{ num: negate ? -vec[0].num : vec[0].num, den: vec[0].den },
		{ num: negate ? -vec[1].num : vec[1].num, den: vec[1].den },
		{ num: negate ? -vec[2].num : vec[2].num, den: vec[2].den },
	];
}

/**
 * Stores a computed result in the bounded memoization cache.
 * @param {string} key
 * @param {readonly [Rational, Rational, Rational]} result
 */
function cacheResult(key, result) {
	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		if (oldestKey !== undefined) {
			memoCache.delete(oldestKey);
		}
	}
	const frozen = Object.freeze([
		Object.freeze({ num: result[0].num, den: result[0].den }),
		Object.freeze({ num: result[1].num, den: result[1].den }),
		Object.freeze({ num: result[2].num, den: result[2].den }),
	]);
	memoCache.set(key, frozen);
}

/**
 * Computes the exact 3D vector cross product `a × b` over rational numbers
 * represented as `{ num: bigint, den: bigint }`.
 *
 * Uses a precomputed Levi-Civita index/sign table, a small-integer GCD lookup
 * table, and a bounded canonical memoization cache (exploiting anti-symmetry
 * `b × a = -(a × b)`). Returned arrays and rational objects are always fresh
 * copies in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 *
 * @param {readonly [Rational, Rational, Rational]} a - First 3D rational vector.
 * @param {readonly [Rational, Rational, Rational]} b - Second 3D rational vector.
 * @returns {[Rational, Rational, Rational]} The exact reduced cross product `a × b`.
 * @throws {TypeError} If either input is not an array or contains invalid rational entries.
 * @throws {RangeError} If either vector does not have length 3 or has a zero denominator.
 */
export function crossProductRationalMemo(a, b) {
	const normA = parseVector3(a, 'a');
	const normB = parseVector3(b, 'b');

	const keyA = vectorKey(normA);
	const keyB = vectorKey(normB);

	if (keyA === keyB) {
		return [
			{ num: 0n, den: 1n },
			{ num: 0n, den: 1n },
			{ num: 0n, den: 1n },
		];
	}

	const cacheKey = `${keyA}|${keyB}`;
	const cached = memoCache.get(cacheKey);
	if (cached !== undefined) {
		return cloneVector(cached, false);
	}

	const reverseKey = `${keyB}|${keyA}`;
	const reverseCached = memoCache.get(reverseKey);
	if (reverseCached !== undefined) {
		return cloneVector(reverseCached, true);
	}

	/** @type {[Rational, Rational, Rational]} */
	const acc = [
		{ num: 0n, den: 1n },
		{ num: 0n, den: 1n },
		{ num: 0n, den: 1n },
	];

	for (const [out, i, j, sign] of LEVI_CIVITA_TABLE) {
		const product = mulRational(normA[i], normB[j]);
		acc[out] = addSignedRational(acc[out], product, sign);
	}

	cacheResult(cacheKey, acc);
	return cloneVector(acc, false);
}
