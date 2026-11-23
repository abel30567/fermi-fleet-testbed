/**
 * Computes the component-wise vector sum of two equal-length vectors of finite
 * IEEE-754 float64 numbers using the closed-form standard-basis series identity:
 *
 *   a + b = sum_{i=0}^{n-1} (a_i + b_i) * e_i
 *
 * where `{e_0, ..., e_{n-1}}` is the standard orthonormal basis of R^n.
 *
 * Neither input array is mutated; a new array of length `a.length` is returned.
 *
 * @param {readonly number[]} a - First input vector of finite float64 numbers.
 * @param {readonly number[]} b - Second input vector of finite float64 numbers, matching `a.length`.
 * @returns {number[]} New vector whose i-th component equals `a[i] + b[i]`.
 * @throws {TypeError} If `a` or `b` is not an Array, or contains any non-number element.
 * @throws {RangeError} If `a.length !== b.length`, or any element is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function vectorAddFloatSeries(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of finite numbers.');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of finite numbers.');
	}

	const n = a.length;
	if (n !== b.length) {
		throw new RangeError(
			`Vector lengths must match: received a.length=${n} and b.length=${b.length}.`
		);
	}

	const result = new Array(n);

	for (let i = 0; i < n; i++) {
		const ai = a[i];
		const bi = b[i];

		if (typeof ai !== 'number') {
			throw new TypeError(`Element a[${i}] must be a number.`);
		}
		if (!Number.isFinite(ai)) {
			throw new RangeError(`Element a[${i}] must be a finite number.`);
		}
		if (typeof bi !== 'number') {
			throw new TypeError(`Element b[${i}] must be a number.`);
		}
		if (!Number.isFinite(bi)) {
			throw new RangeError(`Element b[${i}] must be a finite number.`);
		}

		// Closed-form basis coefficient for e_i: c_i = a_i + b_i.
		result[i] = ai + bi;
	}

	return result;
}
