/**
 * Computes the number of k-permutations of n distinct items, P(n, k) = n! / (n - k)!,
 * element-wise over Float64Array inputs using a straightforward iterative product.
 *
 * For each index i:
 * - P(n, k) = n * (n - 1) * ... * (n - k + 1) when 0 <= k <= n
 * - P(n, 0) = 1 for any integer n >= 0
 * - P(n, k) = 0 when k > n
 * - Results exceeding Number.MAX_VALUE overflow to Infinity.
 *
 * @param {Float64Array} n - Non-negative integer counts of available items.
 * @param {Float64Array} k - Non-negative integer counts of items to arrange.
 * @returns {Float64Array} Element-wise permutation counts P(n[i], k[i]).
 * @throws {TypeError} If `n` or `k` is not a Float64Array.
 * @throws {RangeError} If `n` and `k` have different lengths, or if any element is not a non-negative finite integer.
 */
export function permutationsTypedIterative(n, k) {
	if (!(n instanceof Float64Array) || !(k instanceof Float64Array)) {
		throw new TypeError('Both n and k must be Float64Array instances');
	}
	const len = n.length;
	if (len !== k.length) {
		throw new RangeError(
			`Input Float64Arrays must have equal length (got ${len} and ${k.length})`
		);
	}

	const result = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		const ni = n[i];
		const ki = k[i];

		if (!Number.isInteger(ni) || ni < 0) {
			throw new RangeError(
				`n[${i}] must be a non-negative finite integer (got ${ni})`
			);
		}
		if (!Number.isInteger(ki) || ki < 0) {
			throw new RangeError(
				`k[${i}] must be a non-negative finite integer (got ${ki})`
			);
		}

		if (ki > ni) {
			result[i] = 0;
			continue;
		}

		let acc = 1;
		for (let j = 0; j < ki; j++) {
			acc *= ni - j;
			if (!Number.isFinite(acc)) {
				break;
			}
		}
		result[i] = acc;
	}

	return result;
}
