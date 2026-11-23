/**
 * Computes the trace of a square complex matrix whose entries are `{ re, im }`
 * objects, using the closed-form diagonal sum identity
 * `tr(A) = sum_{k=0}^{n-1} A[k][k]` with Neumaier compensated summation on the
 * real and imaginary components to minimize floating-point cancellation error.
 *
 * @typedef {{ re: number, im: number }} Complex
 *
 * @param {Complex[][]} matrix - An `n x n` square matrix of finite complex numbers `{ re, im }`.
 * @returns {Complex} The complex trace `{ re, im }` of `matrix`.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ re, im }` number objects.
 * @throws {RangeError} If `matrix` is not square or contains non-finite (`NaN`/`Infinity`) components.
 */
export function traceComplexSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be an array of rows.');
	}

	const n = matrix.length;
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array.`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected square matrix of size ${n}x${n}, but row ${i} has length ${row.length}.`,
			);
		}
		for (let j = 0; j < n; j++) {
			const entry = row[j];
			if (entry === null || typeof entry !== 'object') {
				throw new TypeError(`Expected entry at [${i}][${j}] to be a { re, im } object.`);
			}
			if (typeof entry.re !== 'number' || typeof entry.im !== 'number') {
				throw new TypeError(
					`Expected entry at [${i}][${j}] to have numeric re and im properties.`,
				);
			}
			if (!Number.isFinite(entry.re) || !Number.isFinite(entry.im)) {
				throw new RangeError(
					`Expected entry at [${i}][${j}] to have finite re and im values.`,
				);
			}
		}
	}

	// Neumaier compensated summation for real and imaginary diagonal series
	let reSum = 0;
	let reComp = 0;
	let imSum = 0;
	let imComp = 0;

	for (let k = 0; k < n; k++) {
		const { re, im } = matrix[k][k];

		const reNext = reSum + re;
		if (Math.abs(reSum) >= Math.abs(re)) {
			reComp += (reSum - reNext) + re;
		} else {
			reComp += (re - reNext) + reSum;
		}
		reSum = reNext;

		const imNext = imSum + im;
		if (Math.abs(imSum) >= Math.abs(im)) {
			imComp += (imSum - imNext) + im;
		} else {
			imComp += (im - imNext) + imSum;
		}
		imSum = imNext;
	}

	const reTotal = reSum + reComp;
	const imTotal = imSum + imComp;

	return {
		re: reTotal === 0 ? 0 : reTotal,
		im: imTotal === 0 ? 0 : imTotal,
	};
}
