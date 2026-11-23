/**
 * Exact rational number represented in lowest terms with a positive denominator.
 *
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator (`0n` when zero).
 * @property {bigint} den - Strictly positive denominator (`1n` when `num === 0n`).
 */

/**
 * Options for {@link summationRationalLazy}.
 *
 * @typedef {Object} SummationRationalLazyOptions
 * @property {Rational} [initial] - Starting accumulator value (defaults to `{ num: 0n, den: 1n }`).
 * @property {boolean} [includeInitial=false] - When `true`, yields the normalized initial value before consuming any element from `terms`.
 */

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
 * Validates and normalizes an exact rational object `{ num: bigint, den: bigint }`
 * into canonical lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }` for zero).
 *
 * @param {unknown} value
 * @param {string} label - Descriptive label used in validation errors.
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with BigInt num and den properties`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`);
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`);
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	const sign = den < 0n ? -1n : 1n;
	const signedNum = num * sign;
	const posDen = den * sign;
	const g = gcdBigInt(signedNum, posDen);
	return {
		num: signedNum / g,
		den: posDen / g,
	};
}

/**
 * Adds two already-normalized rationals and returns the exact sum in lowest terms.
 *
 * Uses cross-cancellation via `g = gcd(a.den, b.den)` to minimize intermediate
 * BigInt growth and keep the result reduced.
 *
 * @param {Rational} a - Normalized rational.
 * @param {Rational} b - Normalized rational.
 * @returns {Rational} Normalized sum `a + b`.
 */
function addNormalizedRationals(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den };
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den };
	}
	const g = gcdBigInt(a.den, b.den);
	const aDenReduced = a.den / g;
	const bDenReduced = b.den / g;
	const num = a.num * bDenReduced + b.num * aDenReduced;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	const h = gcdBigInt(num, g);
	return {
		num: num / h,
		den: aDenReduced * (b.den / h),
	};
}

/**
 * Lazily computes discrete running summations over an iterable of exact rationals
 * `{ num: bigint, den: bigint }`, yielding each partial sum in canonical lowest terms
 * (`den > 0n`, `gcd(|num|, den) === 1n`, zero represented as `{ num: 0n, den: 1n }`).
 *
 * The input sequence is consumed lazily one element per `.next()` call using a
 * generator, supporting infinite iterables and constant auxiliary sequence memory.
 * Top-level arguments are validated eagerly at call time; individual terms are
 * validated as they are pulled from the iterable.
 *
 * @param {Iterable<Rational>} terms - Iterable sequence of exact rational terms to sum.
 * @param {SummationRationalLazyOptions} [options] - Optional configuration.
 * @returns {Generator<Rational, void, undefined>} Generator yielding exact partial sums in lowest terms.
 * @throws {TypeError} If `terms` is not a non-string iterable, `options` is invalid, or any rational has non-BigInt fields.
 * @throws {RangeError} If any rational (or `options.initial`) has a zero denominator.
 */
export function summationRationalLazy(terms, options) {
	if (
		terms === null ||
		terms === undefined ||
		typeof terms === 'string' ||
		typeof terms[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('terms must be a non-string iterable of rational objects');
	}

	let acc = { num: 0n, den: 1n };
	let includeInitial = false;

	if (options !== undefined) {
		if (typeof options !== 'object' || options === null || Array.isArray(options)) {
			throw new TypeError('options must be a plain object when provided');
		}
		if (options.initial !== undefined) {
			acc = normalizeRational(options.initial, 'options.initial');
		}
		if (options.includeInitial !== undefined) {
			if (typeof options.includeInitial !== 'boolean') {
				throw new TypeError('options.includeInitial must be a boolean');
			}
			includeInitial = options.includeInitial;
		}
	}

	return (function* streamPartialSums() {
		if (includeInitial) {
			yield { num: acc.num, den: acc.den };
		}

		let index = 0;
		for (const rawTerm of terms) {
			const term = normalizeRational(rawTerm, `terms[${index}]`);
			acc = addNormalizedRationals(acc, term);
			index += 1;
			yield { num: acc.num, den: acc.den };
		}
	})();
}
