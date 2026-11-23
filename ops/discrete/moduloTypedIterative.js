/**
 * Computes the element-wise discrete (floored) modulo of two Float64Array inputs
 * using a straightforward iterative loop.
 *
 * For each index `i`, computes `dividends[i] mod divisors[i]` such that for finite
 * values the result has the same sign as `divisors[i]` (or is `+0`) and satisfies:
 * - `0 <= result[i] < divisors[i]` when `divisors[i] > 0`
 * - `divisors[i] < result[i] <= 0` when `divisors[i] < 0`
 *
 * Neither input array is mutated.
 *
 * @param {Float64Array} dividends - Element-wise dividends.
 * @param {Float64Array} divisors - Element-wise non-zero moduli (same length as `dividends`).
 * @returns {Float64Array} A new Float64Array containing the element-wise discrete modulo values.
 * @throws {TypeError} If `dividends` or `divisors` is not a Float64Array.
 * @throws {RangeError} If `dividends` and `divisors` have different lengths, or if any divisor is `0`.
 */
export function moduloTypedIterative(dividends, divisors) {
	if (!(dividends instanceof Float64Array)) {
		throw new TypeError('dividends must be a Float64Array');
	}
	if (!(divisors instanceof Float64Array)) {
		throw new TypeError('divisors must be a Float64Array');
	}

	const len = dividends.length;
	if (len !== divisors.length) {
		throw new RangeError(
			`dividends and divisors must have the same length (got ${len} and ${divisors.length})`,
		);
	}

	const result = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		const a = dividends[i];
		const m = divisors[i];

		if (m === 0) {
			throw new RangeError(`divisor at index ${i} must not be zero`);
		}

		if (Number.isNaN(a) || Number.isNaN(m) || !Number.isFinite(a)) {
			result[i] = Number.NaN;
			continue;
		}

		let r = a % m;
		if (r !== 0 && (r < 0) !== (m < 0)) {
			r += m;
			if (r === m && Number.isFinite(m)) {
				r = 0;
			}
		}

		result[i] = r === 0 ? 0 : r;
	}

	return result;
}
