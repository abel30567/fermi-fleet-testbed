/**
 * Computes the tensor (outer / Kronecker) product over two or more `Float64Array`
 * inputs using a closed-form mixed-radix stride decomposition.
 *
 * For inputs `A_0, A_1, ..., A_{k-1}` of lengths `n_0, n_1, ..., n_{k-1}`, the
 * result is a row-major `Float64Array` of length `N = n_0 * n_1 * ... * n_{k-1}`
 * whose entry at flat index `p` satisfies the closed-form identity:
 *
 *   T[p] = ∏_{r=0}^{k-1} A_r[ floor(p / s_r) mod n_r ],
 *   where s_r = ∏_{t=r+1}^{k-1} n_t.
 *
 * For two vectors `u` (length `m`) and `v` (length `n`), this reduces to the
 * flattened `m x n` outer product `T[i * n + j] = u[i] * v[j]`.
 *
 * @param {Float64Array} a - First input vector of finite IEEE 754 doubles.
 * @param {Float64Array} b - Second input vector of finite IEEE 754 doubles.
 * @param {...Float64Array} rest - Optional additional input vectors for higher-order tensor products.
 * @returns {Float64Array} Flattened row-major tensor product of length `∏ inputs[r].length`.
 * @throws {TypeError} If fewer than two arguments are provided or any argument is not a `Float64Array`.
 * @throws {RangeError} If any input element is non-finite (`NaN`, `Infinity`, `-Infinity`) or output size overflows.
 */
export function tensorProductTypedSeries(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			'tensorProductTypedSeries requires at least two Float64Array arguments'
		);
	}

	const factors = [a, b, ...rest];
	const k = factors.length;

	for (let r = 0; r < k; r++) {
		const arr = factors[r];
		if (!(arr instanceof Float64Array)) {
			throw new TypeError(
				`Argument at index ${r} must be a Float64Array`
			);
		}
		for (let i = 0; i < arr.length; i++) {
			if (!Number.isFinite(arr[i])) {
				throw new RangeError(
					`Argument at index ${r} contains non-finite value at offset ${i}`
				);
			}
		}
	}

	let totalLength = 1;
	for (let r = 0; r < k; r++) {
		const len = factors[r].length;
		if (len === 0) {
			return new Float64Array(0);
		}
		if (totalLength > Math.floor(Number.MAX_SAFE_INTEGER / len)) {
			throw new RangeError(
				'Tensor product output length exceeds Number.MAX_SAFE_INTEGER'
			);
		}
		totalLength *= len;
	}

	const out = new Float64Array(totalLength);

	if (k === 2) {
		const u = factors[0];
		const v = factors[1];
		const m = u.length;
		const n = v.length;
		for (let i = 0; i < m; i++) {
			const ui = u[i];
			const rowOffset = i * n;
			for (let j = 0; j < n; j++) {
				out[rowOffset + j] = ui * v[j];
			}
		}
		return out;
	}

	const strides = new Array(k);
	let stride = 1;
	for (let r = k - 1; r >= 0; r--) {
		strides[r] = stride;
		stride *= factors[r].length;
	}

	for (let p = 0; p < totalLength; p++) {
		let prod = 1;
		for (let r = 0; r < k; r++) {
			const idx = Math.floor(p / strides[r]) % factors[r].length;
			prod *= factors[r][idx];
		}
		out[p] = prod;
	}

	return out;
}
