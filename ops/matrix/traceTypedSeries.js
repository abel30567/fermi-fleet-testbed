/**
 * Maximum matrix dimension `n` such that `n * n` remains a safe integer.
 * floor(sqrt(Number.MAX_SAFE_INTEGER)) = 94906265.
 */
const MAX_SAFE_DIM = 94906265;

/**
 * Computes the matrix trace `sum_{i=0}^{n-1} A_{i,i}` for each `n × n`
 * row-major matrix packed contiguously in a `Float64Array` series.
 *
 * Uses Neumaier compensated summation along each matrix diagonal to preserve
 * precision under large magnitude differences and catastrophic cancellation.
 *
 * @param {Float64Array} data - Packed row-major `n × n` matrices (`length % (n * n) === 0`).
 * @param {number} n - Positive integer matrix dimension.
 * @returns {Float64Array} A `Float64Array` of length `data.length / (n * n)` containing each matrix's trace.
 * @throws {TypeError} If `data` is not a `Float64Array` or `n` is not a number.
 * @throws {RangeError} If `n` is not a safe positive integer with `n * n <= Number.MAX_SAFE_INTEGER`,
 *   or if `data.length` is not an exact multiple of `n * n`.
 */
export function traceTypedSeries(data, n) {
	if (!(data instanceof Float64Array)) {
		throw new TypeError('data must be a Float64Array');
	}
	if (typeof n !== 'number') {
		throw new TypeError('n must be a positive integer');
	}
	if (!Number.isInteger(n) || n <= 0 || n > MAX_SAFE_DIM) {
		throw new RangeError(`n must be a positive integer <= ${MAX_SAFE_DIM}`);
	}

	const matSize = n * n;
	if (data.length % matSize !== 0) {
		throw new RangeError(
			`data.length (${data.length}) must be a multiple of n * n (${matSize})`
		);
	}

	const count = data.length / matSize;
	const out = new Float64Array(count);
	const diagStep = n + 1;

	for (let m = 0; m < count; m++) {
		const offset = m * matSize;
		let sum = data[offset];
		let c = 0;

		for (let i = 1; i < n; i++) {
			const x = data[offset + i * diagStep];
			const t = sum + x;
			if (Number.isFinite(t)) {
				if (Math.abs(sum) >= Math.abs(x)) {
					c += (sum - t) + x;
				} else {
					c += (x - t) + sum;
				}
			}
			sum = t;
		}

		out[m] = sum + c;
	}

	return out;
}
