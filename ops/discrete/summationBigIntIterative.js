/**
 * Fixed-point scale factor (`10^18`) for callers summing scaled fixed-point
 * BigInt representations.
 *
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Computes a discrete summation over exact `BigInt` values using a
 * straightforward iterative implementation.
 *
 * Supports two calling conventions:
 * 1. **Iterable form:** `summationBigIntIterative(terms)`
 *    Sums every `BigInt` element yielded by a non-string iterable (such as an
 *    `Array`, `Set`, generator, or `BigInt64Array`). Returns `0n` if empty.
 * 2. **Sigma (index-range) form:** `summationBigIntIterative(termFn, lower, upper, step = 1n)`
 *    Evaluates `Σ_{k = lower, lower + step, ..., <= upper} termFn(k)`.
 *    Returns `0n` when `lower > upper` (the empty sum).
 *
 * **Exact & Fixed-Point Semantics:**
 * Because the sum of exact integers is always an exact integer, no implicit
 * rescaling is applied. By linearity of addition, passing fixed-point `BigInt`
 * terms scaled by `SCALE` (`10n ** 18n`) directly produces the exact
 * `10n ** 18n`-scaled fixed-point sum without floating-point rounding drift.
 *
 * @param {Iterable<bigint> | ((k: bigint) => bigint)} termsOrFn
 *   Either a non-string iterable of `BigInt` terms, or a function mapping each
 *   `BigInt` index `k` to a `BigInt` term.
 * @param {bigint} [lower]
 *   Inclusive `BigInt` lower bound (required when `termsOrFn` is a function).
 * @param {bigint} [upper]
 *   Inclusive `BigInt` upper bound (required when `termsOrFn` is a function).
 * @param {bigint} [step=1n]
 *   Positive `BigInt` step increment for the index-range form (default `1n`).
 * @returns {bigint} The exact discrete sum as a `BigInt`.
 * @throws {TypeError} If `termsOrFn` is neither a function nor a non-string
 *   iterable; if unexpected extra arguments are passed with an iterable; if
 *   `lower`, `upper`, or `step` is not a `BigInt`; or if any sequence element
 *   or `termFn(k)` return value is not a `BigInt`.
 * @throws {RangeError} If `step <= 0n` in the index-range form.
 */
export function summationBigIntIterative(termsOrFn, lower, upper, step = 1n) {
	if (typeof termsOrFn === 'function') {
		if (typeof lower !== 'bigint') {
			throw new TypeError(`lower must be a BigInt, received ${typeof lower}`);
		}
		if (typeof upper !== 'bigint') {
			throw new TypeError(`upper must be a BigInt, received ${typeof upper}`);
		}
		if (typeof step !== 'bigint') {
			throw new TypeError(`step must be a BigInt, received ${typeof step}`);
		}
		if (step <= 0n) {
			throw new RangeError(`step must be a positive BigInt (> 0n), received ${step}n`);
		}

		let sum = 0n;
		for (let k = lower; k <= upper; k += step) {
			const term = termsOrFn(k);
			if (typeof term !== 'bigint') {
				throw new TypeError(
					`termFn(${k}n) must return a BigInt, received ${typeof term}`,
				);
			}
			sum += term;
		}
		return sum;
	}

	if (
		termsOrFn === null ||
		termsOrFn === undefined ||
		typeof termsOrFn === 'string' ||
		termsOrFn instanceof String ||
		typeof termsOrFn[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'termsOrFn must be a function or a non-string iterable of BigInt values',
		);
	}

	if (arguments.length > 1) {
		throw new TypeError(
			'summationBigIntIterative(terms) accepts only 1 argument when summing an iterable',
		);
	}

	let sum = 0n;
	let index = 0;
	for (const value of termsOrFn) {
		if (typeof value !== 'bigint') {
			throw new TypeError(
				`Element at index ${index} must be a BigInt, received ${typeof value}`,
			);
		}
		sum += value;
		index += 1;
	}
	return sum;
}
