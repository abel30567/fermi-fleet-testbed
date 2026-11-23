/**
 * Computes the orthogonal vector projection of vector `a` onto vector `b`
 * over IEEE-754 float64 Numbers using a straightforward iterative algorithm:
 *
 *   proj_b(a) = ((a · b) / (b · b)) * b
 *
 * Zero-valued components in the returned vector are normalized to `+0`.
 * Input vectors are not mutated.
 *
 * @param {number[]} a - The vector to project (non-empty array of finite numbers).
 * @param {number[]} b - The non-zero vector to project onto (same length as `a`, finite numbers).
 * @returns {number[]} The projected vector `proj_b(a)` as a new array of IEEE-754 float64 numbers.
 * @throws {TypeError} If `a` or `b` is not an Array, or contains any non-number element.
 * @throws {RangeError} If `a` or `b` is empty, lengths differ, any element is non-finite,
 *   `b` is the zero vector (or `b · b` underflows to zero), or intermediate/result arithmetic overflows.
 */
export function projectionFloatIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array');
	}

	const n = a.length;
	if (n === 0 || b.length === 0) {
		throw new RangeError('Input vectors must be non-empty');
	}
	if (n !== b.length) {
		throw new RangeError(`Input vectors must have the same length (got ${n} and ${b.length})`);
	}

	for (let i = 0; i < n; i++) {
		const ai = a[i];
		if (typeof ai !== 'number') {
			throw new TypeError(`Element a[${i}] must be a number`);
		}
		if (!Number.isFinite(ai)) {
			throw new RangeError(`Element a[${i}] must be a finite number`);
		}

		const bi = b[i];
		if (typeof bi !== 'number') {
			throw new TypeError(`Element b[${i}] must be a number`);
		}
		if (!Number.isFinite(bi)) {
			throw new RangeError(`Element b[${i}] must be a finite number`);
		}
	}

	let dotAB = 0;
	let dotBB = 0;
	for (let i = 0; i < n; i++) {
		dotAB += a[i] * b[i];
		dotBB += b[i] * b[i];
	}

	if (dotBB === 0) {
		throw new RangeError('Cannot project onto a zero vector (b · b is zero)');
	}
	if (!Number.isFinite(dotBB) || !Number.isFinite(dotAB)) {
		throw new RangeError('Overflow encountered while computing dot products');
	}

	const scalar = dotAB / dotBB;
	if (!Number.isFinite(scalar)) {
		throw new RangeError('Projection scalar is not finite');
	}

	const result = new Array(n);
	for (let i = 0; i < n; i++) {
		const val = scalar * b[i];
		if (!Number.isFinite(val)) {
			throw new RangeError(`Overflow encountered at result[${i}]`);
		}
		result[i] = val === 0 ? 0 : val;
	}

	return result;
}
