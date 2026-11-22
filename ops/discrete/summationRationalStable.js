/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the exact rational number.
 * @property {bigint} den - Non-zero denominator of the exact rational number.
 */

const ZERO = Object.freeze({ num: 0n, den: 1n });

/**
 * Computes the non-negative greatest common divisor of two BigInts using
 * the iterative Euclidean algorithm.
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
 * Validates and normalizes an input rational into canonical lowest terms
 * with a strictly positive denominator (`den > 0n`).
 *
 * @param {unknown} term
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(term, label) {
	if (term === null || typeof term !== 'object') {
		throw new TypeError(`${label} must be an object with bigint { num, den } fields`);
	}

	const { num, den } = /** @type {Record<string, unknown>} */ (term);

	if (typeof num !== 'bigint') {
		throw new TypeError(`${label}.num must be a bigint`);
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`${label}.den must be a bigint`);
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`);
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
	if (g > 1n) {
		n /= g;
		d /= g;
	}

	return { num: n, den: d };
}

/**
 * Adds two already-normalized rationals in lowest terms (`den > 0n`) using
 * Knuth's GCD-scaled addition (TAOCP Vol. 2, §4.5.1) to minimize intermediate
 * BigInt growth and avoid full-denominator GCDs.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addNormalized(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den };
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den };
	}

	if (a.den === b.den) {
		const sumNum = a.num + b.num;
		if (sumNum === 0n) {
			return { num: 0n, den: 1n };
		}
		const g = gcdBigInt(sumNum, a.den);
		return { num: sumNum / g, den: a.den / g };
	}

	const d1 = gcdBigInt(a.den, b.den);
	if (d1 === 1n) {
		// Since gcd(a.num, a.den) = gcd(b.num, b.den) = gcd(a.den, b.den) = 1,
		// the resulting fraction is already guaranteed to be in lowest terms.
		const num = a.num * b.den + b.num * a.den;
		if (num === 0n) {
			return { num: 0n, den: 1n };
		}
		return { num, den: a.den * b.den };
	}

	const aDenScaled = a.den / d1;
	const bDenScaled = b.den / d1;
	const t = a.num * bDenScaled + b.num * aDenScaled;
	if (t === 0n) {
		return { num: 0n, den: 1n };
	}

	// By Knuth's theorem, gcd(t, aDenScaled * bDenScaled * d1) = gcd(t, d1).
	const d2 = gcdBigInt(t, d1);
	const num = t / d2;
	const den = aDenScaled * bDenScaled * (d1 / d2);
	return { num, den };
}

/**
 * Pushes a normalized rational into an online balanced binary-tree accumulator
 * (carry-chain of power-of-2 partial sums). Uses O(log n) auxiliary space and
 * performs balanced pairwise reduction to avoid O(n^2) BigInt blowup.
 *
 * @param {(Rational | null)[]} buckets
 * @param {Rational} term
 */
function accumulateTerm(buckets, term) {
	if (term.num === 0n) {
		return;
	}

	let cur = term;
	let level = 0;
	while (level < buckets.length && buckets[level] !== null) {
		cur = addNormalized(/** @type {Rational} */ (buckets[level]), cur);
		buckets[level] = null;
		level += 1;
	}
	buckets[level] = cur;
}

/**
 * Collapses the remaining non-empty power-of-2 buckets from smallest to largest
 * into a single canonical rational in lowest terms.
 *
 * @param {(Rational | null)[]} buckets
 * @returns {Rational}
 */
function finalizeBuckets(buckets) {
	/** @type {Rational | null} */
	let total = null;
	for (let i = 0; i < buckets.length; i += 1) {
		const bucket = buckets[i];
		if (bucket !== null) {
			total = total === null ? bucket : addNormalized(bucket, total);
		}
	}
	if (total === null) {
		return { num: ZERO.num, den: ZERO.den };
	}
	return { num: total.num, den: total.den };
}

/**
 * Computes the exact discrete sum over rational numbers represented as
 * `{ num: bigint, den: bigint }`, returning the canonical result in lowest terms
 * with a strictly positive denominator (`den > 0n`).
 *
 * Uses online balanced pairwise / binary-splitting tree reduction combined with
 * GCD-based denominator scaling and cancellation (Knuth TAOCP Vol. 2, §4.5.1)
 * to avoid `O(n^2)` BigInt intermediate blowup and preserve exact cancellation.
 *
 * Primary signature:
 *   `summationRationalStable(terms)` where `terms` is an Array or Iterable of
 *   `{ num: bigint, den: bigint }`.
 *
 * Secondary indexed signature:
 *   `summationRationalStable(termFn, start, end)` summing `termFn(k)` for
 *   `k = start, start + 1, ..., end` (with `start` and `end` either both safe
 *   integer `number`s or both `bigint`s; returns `{ num: 0n, den: 1n }` when
 *   `start > end`).
 *
 * @param {Iterable<Rational> | ((k: any) => Rational)} termsOrFn
 *   Array/iterable of rational terms, or a term generator function `k => Rational`.
 * @param {number | bigint} [start]
 *   Inclusive lower summation index when `termsOrFn` is a function.
 * @param {number | bigint} [end]
 *   Inclusive upper summation index when `termsOrFn` is a function.
 * @returns {Rational} Exact sum in lowest terms (`den > 0n`, `{ num: 0n, den: 1n }` for empty sums).
 */
export function summationRationalStable(termsOrFn, start, end) {
	if (arguments.length === 0) {
		throw new TypeError('summationRationalStable requires an iterable of rationals or (termFn, start, end)');
	}

	/** @type {(Rational | null)[]} */
	const buckets = [];

	if (typeof termsOrFn === 'function') {
		if (arguments.length < 3 || start === undefined || end === undefined) {
			throw new TypeError('Function mode requires (termFn, start, end)');
		}

		const startType = typeof start;
		const endType = typeof end;

		if (startType === 'bigint' && endType === 'bigint') {
			const s = /** @type {bigint} */ (start);
			const e = /** @type {bigint} */ (end);
			if (s > e) {
				return { num: 0n, den: 1n };
			}
			for (let k = s; k <= e; k += 1n) {
				const raw = termsOrFn(k);
				accumulateTerm(buckets, normalizeRational(raw, `termFn(${k}n)`));
			}
			return finalizeBuckets(buckets);
		}

		if (startType === 'number' && endType === 'number') {
			const s = /** @type {number} */ (start);
			const e = /** @type {number} */ (end);
			if (!Number.isSafeInteger(s)) {
				throw new RangeError('start must be a safe integer');
			}
			if (!Number.isSafeInteger(e)) {
				throw new RangeError('end must be a safe integer');
			}
			if (s > e) {
				return { num: 0n, den: 1n };
			}
			for (let k = s; ; k += 1) {
				const raw = termsOrFn(k);
				accumulateTerm(buckets, normalizeRational(raw, `termFn(${k})`));
				if (k === e) {
					break;
				}
			}
			return finalizeBuckets(buckets);
		}

		throw new TypeError('start and end must both be safe integer numbers or both be bigints');
	}

	if (start !== undefined || end !== undefined) {
		throw new TypeError('Unexpected extra arguments when summing an iterable of rationals');
	}

	if (
		termsOrFn === null ||
		termsOrFn === undefined ||
		typeof termsOrFn === 'string' ||
		typeof termsOrFn[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('terms must be an iterable of { num: bigint, den: bigint } objects');
	}

	let index = 0;
	for (const raw of termsOrFn) {
		accumulateTerm(buckets, normalizeRational(raw, `terms[${index}]`));
		index += 1;
	}

	return finalizeBuckets(buckets);
}
