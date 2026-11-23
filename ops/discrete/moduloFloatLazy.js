/**
 * Lazily computes discrete modulo over IEEE-754 float64 numbers using a
 * streaming generator.
 *
 * Accepts scalars, iterables (arrays, typed arrays, Sets, generators, custom
 * iterables), or any combination of scalar and iterable inputs. Iterables are
 * consumed lazily one element at a time without buffering, and underlying
 * iterators are closed on early termination or error.
 *
 * Supported modulo modes:
 * - `'floored'` (default): Knuth floored modulo `a - m * floor(a / m)`. The
 *   result has the same sign as `divisor` (in `[0, m)` for `m > 0` and `(m, 0]`
 *   for `m < 0`).
 * - `'euclidean'`: Euclidean modulo. The result is always in `[0, |m|)`.
 * - `'truncated'`: IEEE-754 truncated remainder (`a % m`), with `-0` normalized
 *   to `0`.
 *
 * All modes derive the result from IEEE-754 exact remainder (`a % m`), avoiding
 * catastrophic cancellation for large float64 magnitudes while normalizing `-0`
 * to `+0` and preventing boundary round-up to the divisor when `|r| << |m|`.
 *
 * @param {number | Iterable<number>} dividends
 *   A finite float64 dividend or a non-string iterable of finite float64
 *   dividends.
 * @param {number | Iterable<number>} divisors
 *   A finite non-zero float64 divisor or a non-string iterable of finite
 *   non-zero float64 divisors.
 * @param {object} [options]
 *   Optional configuration object.
 * @param {'floored' | 'euclidean' | 'truncated'} [options.mode='floored']
 *   Modulo sign convention.
 * @returns {Generator<number, void, undefined>}
 *   A lazy generator yielding IEEE-754 float64 modulo results. When both inputs
 *   are iterables, iteration stops as soon as the shorter iterable is exhausted.
 *   When both inputs are scalars, the generator yields a single result.
 * @throws {TypeError}
 *   If an input is neither a number nor a non-string iterable, if an iterable
 *   yields a non-number element, or if `options` is not a plain object.
 * @throws {RangeError}
 *   If any dividend or divisor is non-finite (`NaN`, `±Infinity`), if any
 *   divisor is `0` or `-0`, or if `options.mode` is unsupported.
 */
export function moduloFloatLazy(dividends, divisors, options) {
	const mode = validateOptions(options);
	const dividendsIsIterable = isValidIterable(dividends);
	const divisorsIsIterable = isValidIterable(divisors);

	if (!dividendsIsIterable) {
		validateDividend(dividends);
	}
	if (!divisorsIsIterable) {
		validateDivisor(divisors);
	}

	return moduloFloatStream(
		dividends,
		divisors,
		dividendsIsIterable,
		divisorsIsIterable,
		mode,
	);
}

const VALID_MODES = new Set(['floored', 'euclidean', 'truncated']);

function isValidIterable(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof value[Symbol.iterator] === 'function'
	);
}

function validateOptions(options) {
	if (options === undefined) {
		return 'floored';
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided');
	}
	const { mode = 'floored' } = options;
	if (typeof mode !== 'string' || !VALID_MODES.has(mode)) {
		throw new RangeError(
			`Unsupported modulo mode: ${String(mode)}. Expected 'floored', 'euclidean', or 'truncated'`,
		);
	}
	return mode;
}

function validateDividend(value) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Expected dividend to be a finite float64 number, received ${typeof value}`,
		);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(
			`Expected dividend to be a finite float64 number, received ${value}`,
		);
	}
	return value;
}

function validateDivisor(value) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Expected divisor to be a finite non-zero float64 number, received ${typeof value}`,
		);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(
			`Expected divisor to be a finite non-zero float64 number, received ${value}`,
		);
	}
	if (value === 0) {
		throw new RangeError('Divisor must be non-zero');
	}
	return value;
}

function computeModulo(dividend, divisor, mode) {
	let r = dividend % divisor;
	if (r === 0) {
		return 0;
	}
	if (mode === 'truncated') {
		return r;
	}
	if (mode === 'euclidean') {
		if (r < 0) {
			const absDivisor = Math.abs(divisor);
			r += absDivisor;
			if (r === absDivisor || r === 0) {
				return 0;
			}
		}
		return r;
	}
	// 'floored' (Knuth discrete modulo)
	if ((r < 0 && divisor > 0) || (r > 0 && divisor < 0)) {
		r += divisor;
		if (r === divisor || r === 0) {
			return 0;
		}
	}
	return r;
}

function* moduloFloatStream(
	dividends,
	divisors,
	dividendsIsIterable,
	divisorsIsIterable,
	mode,
) {
	const iterA = dividendsIsIterable ? dividends[Symbol.iterator]() : null;
	const iterB = divisorsIsIterable ? divisors[Symbol.iterator]() : null;
	let doneA = false;
	let doneB = false;

	try {
		while (true) {
			let a = dividends;
			if (iterA) {
				const nextA = iterA.next();
				if (nextA.done) {
					doneA = true;
					break;
				}
				a = validateDividend(nextA.value);
			}

			let b = divisors;
			if (iterB) {
				const nextB = iterB.next();
				if (nextB.done) {
					doneB = true;
					break;
				}
				b = validateDivisor(nextB.value);
			}

			yield computeModulo(a, b, mode);

			if (!iterA && !iterB) {
				break;
			}
		}
	} finally {
		try {
			if (iterA && !doneA && typeof iterA.return === 'function') {
				iterA.return();
			}
		} finally {
			if (iterB && !doneB && typeof iterB.return === 'function') {
				iterB.return();
			}
		}
	}
}
