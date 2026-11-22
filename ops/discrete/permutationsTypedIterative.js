/**
 * Computes element-wise k-permutations P(n, k) = n! / (n - k)! over two
 * equal-length Float64Array inputs using a straightforward iterative falling
 * factorial product.
 *
 * For each index i:
 * - If k === 0, P(n, 0) = 1.
 * - If k > n, P(n, k) = 0.
 * - Otherwise, P(n, k) = n * (n - 1) * ... * (n - k + 1).
 *
 * Algorithm:
 * Validates array types, equal lengths, and element-wise domain constraints
 * (non-negative safe integers), then iteratively multiplies descending terms
 * `(n - j)` for `j = 0 .. k - 1`, short-circuiting to `Infinity` on IEEE-754
 * floating-point overflow. Runs in O(sum(min(k_i, overflowSteps))) time and
 * O(length) space.
 *
 * @param {Float64Array} nArr - Array of non-negative safe integers representing total items `n`.
 * @param {Float64Array} kArr - Array of non-negative safe integers representing selected items `k`.
 * @returns {Float64Array} A new Float64Array containing P(nArr[i], kArr[i]) for each index i.
 * @throws {TypeError} If `nArr` or `kArr` is not a Float64Array.
 * @throws {RangeError} If `nArr` and `kArr` have different lengths, or if any element is
 *   NaN, non-finite, negative, non-integer, or exceeds Number.MAX_SAFE_INTEGER.
 */
export function permutationsTypedIterative(nArr, kArr) {
	if (!(nArr instanceof Float64Array)) {
		throw new TypeError('nArr must be a Float64Array');
	}
	if (!(kArr instanceof Float64Array)) {
		throw new TypeError('kArr must be a Float64Array');
	}
	if (nArr.length !== kArr.length) {
		throw new RangeError(
			`Length mismatch: nArr.length (${nArr.length}) !== kArr.length (${kArr.length})`
		);
	}

	const len = nArr.length;
	const out = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		const n = nArr[i];
		const k = kArr[i];

		if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || !Number.isSafeInteger(n)) {
			throw new RangeError(
				`Invalid nArr[${i}] = ${n}: expected a non-negative safe integer`
			);
		}
		if (!Number.isFinite(k) || !Number.isInteger(k) || k < 0 || !Number.isSafeInteger(k)) {
			throw new RangeError(
				`Invalid kArr[${i}] = ${k}: expected a non-negative safe integer`
			);
		}

		if (k === 0) {
			out[i] = 1;
			continue;
		}
		if (k > n) {
			out[i] = 0;
			continue;
		}

		let acc = 1;
		for (let j = 0; j < k; j++) {
			acc *= n - j;
			if (!Number.isFinite(acc)) {
				acc = Infinity;
				break;
			}
		}
		out[i] = acc;
	}

	return out;
}
