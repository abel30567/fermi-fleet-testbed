/**
 * Element-wise arithmetic subtraction over two or more equal-length `Float64Array` series.
 *
 * Computes, for each index `i` in `[0, n - 1]`:
 *
 * ```text
 * result[i] = minuend[i] - sum_{k = 0}^{m - 1} subtrahends[k][i]
 *           = minuend[i] + sum_{k = 0}^{m - 1} (-subtrahends[k][i])
 * ```
 *
 * ### Algorithm & Numerical Accuracy
 * - **Two-series fast path (`m === 1`):** Computes `minuend[i] - b[i]` directly, which is
 *   guaranteed by IEEE 754 binary64 arithmetic to be correctly rounded to the nearest
 *   representable `float64` (error at most 0.5 ulp).
 * - **Multi-series path (`m >= 2`):** Evaluates the identity
 *   `minuend[i] + sum_k (-subtrahends[k][i])` using Knuth's error-free transformation
 *   (**TwoSum**: `s = x + y`, `v = s - x`, `err = (x - (s - v)) + (y - v)`, where
 *   `x + y = s + err` holds identically in real arithmetic) combined with **Neumaier's**
 *   improved Kahan–Babuška compensated summation over the rounding residuals. This
 *   mitigates catastrophic cancellation and rounding drift when subtrahends span vastly
 *   different magnitudes.
 * - **Zero normalization:** Any result element equal to `-0` is normalized to `+0` so
 *   identities such as `a - a = 0` produce canonical `+0` entries.
 * - **Immutability:** Always allocates and returns a new `Float64Array`; input arrays are
 *   never mutated.
 *
 * @param {Float64Array} minuend - The initial `Float64Array` from which subsequent series are subtracted.
 * @param {...Float64Array} subtrahends - One or more `Float64Array` instances of the same length as `minuend`.
 * @returns {Float64Array} A new `Float64Array` containing the element-wise compensated differences.
 * @throws {TypeError} If `minuend` or any element of `subtrahends` is not a `Float64Array`.
 * @throws {RangeError} If fewer than one subtrahend is provided, if input lengths do not match,
 *   if any input element is non-finite (`NaN`, `Infinity`, `-Infinity`), or if any output
 *   element overflows to a non-finite value.
 */
export function subtractTypedSeries(minuend, ...subtrahends) {
	if (!(minuend instanceof Float64Array)) {
		throw new TypeError('minuend must be a Float64Array');
	}

	const m = subtrahends.length;
	if (m === 0) {
		throw new RangeError('subtractTypedSeries requires at least one subtrahend Float64Array');
	}

	const n = minuend.length;
	for (let k = 0; k < m; k++) {
		const s = subtrahends[k];
		if (!(s instanceof Float64Array)) {
			throw new TypeError(`subtrahends[${k}] must be a Float64Array`);
		}
		if (s.length !== n) {
			throw new RangeError(
				`Length mismatch at subtrahends[${k}]: expected ${n}, got ${s.length}`
			);
		}
	}

	// Validate finiteness of all input elements before computing.
	for (let i = 0; i < n; i++) {
		if (!Number.isFinite(minuend[i])) {
			throw new RangeError(`minuend[${i}] must be a finite number`);
		}
	}
	for (let k = 0; k < m; k++) {
		const s = subtrahends[k];
		for (let i = 0; i < n; i++) {
			if (!Number.isFinite(s[i])) {
				throw new RangeError(`subtrahends[${k}][${i}] must be a finite number`);
			}
		}
	}

	const out = new Float64Array(n);

	if (m === 1) {
		const b = subtrahends[0];
		for (let i = 0; i < n; i++) {
			const diff = minuend[i] - b[i];
			if (!Number.isFinite(diff)) {
				throw new RangeError(`Subtraction overflowed to a non-finite value at index ${i}`);
			}
			out[i] = diff === 0 ? 0 : diff;
		}
		return out;
	}

	for (let i = 0; i < n; i++) {
		let sum = minuend[i];
		let comp = 0;
		let compErr = 0;

		for (let k = 0; k < m; k++) {
			const term = -subtrahends[k][i];

			// Knuth TwoSum error-free transformation: sum + term === s + err (exact)
			const s = sum + term;
			const v = s - sum;
			const err = (sum - (s - v)) + (term - v);
			sum = s;

			// Neumaier compensated accumulation of rounding residuals
			const t = comp + err;
			if (Math.abs(comp) >= Math.abs(err)) {
				compErr += (comp - t) + err;
			} else {
				compErr += (err - t) + comp;
			}
			comp = t;
		}

		const total = sum + (comp + compErr);
		if (!Number.isFinite(total)) {
			throw new RangeError(`Subtraction overflowed to a non-finite value at index ${i}`);
		}
		out[i] = total === 0 ? 0 : total;
	}

	return out;
}
