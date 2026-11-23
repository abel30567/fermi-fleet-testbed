/**
 * Normalize signed zero (-0) to +0.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Create a normalized complex number object.
 *
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
function complex(re, im) {
	return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Multiply two complex numbers.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Subtract complex number b from a.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function cSub(a, b) {
	return {
		re: a.re - b.re,
		im: a.im - b.im,
	};
}

/**
 * Add two complex numbers.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function cAdd(a, b) {
	return {
		re: a.re + b.re,
		im: a.im + b.im,
	};
}

/**
 * Divide complex number a by b using Smith's scaling formula to reduce overflow/underflow risk.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function cDiv(a, b) {
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const r = b.im / b.re;
		const denom = b.re + b.im * r;
		return {
			re: (a.re + a.im * r) / denom,
			im: (a.im - a.re * r) / denom,
		};
	}
	const r = b.re / b.im;
	const denom = b.im + b.re * r;
	return {
		re: (a.re * r + a.im) / denom,
		im: (a.im * r - a.re) / denom,
	};
}

/**
 * Validate that input is a square matrix of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} matrix
 * @returns {Array<Array<{ re: number, im: number }>>}
 */
function validateComplexSquareMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be an array of rows');
	}
	const n = matrix.length;
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			);
		}
		for (let j = 0; j < n; j++) {
			const entry = row[j];
			if (entry === null || typeof entry !== 'object') {
				throw new TypeError(`matrix[${i}][${j}] must be a complex number object { re, im }`);
			}
			if (typeof entry.re !== 'number' || typeof entry.im !== 'number') {
				throw new TypeError(`matrix[${i}][${j}] must have numeric re and im properties`);
			}
			if (!Number.isFinite(entry.re) || !Number.isFinite(entry.im)) {
				throw new RangeError(`matrix[${i}][${j}] must have finite re and im values`);
			}
		}
	}
	return matrix;
}

/**
 * Compute the determinant of a square matrix over the complex numbers.
 *
 * Each matrix entry must be an object `{ re, im }` with finite numeric real and
 * imaginary parts. Uses exact closed-form identities for sizes 0x0 through 3x3
 * and the `PA = LU` factorization identity (`det(A) = (-1)^swaps * prod(U_ii)`)
 * with partial pivoting and Smith complex division for sizes 4x4 and larger.
 *
 * Does not mutate the input matrix.
 *
 * @param {Array<Array<{ re: number, im: number }>>} matrix - Square n x n matrix of complex numbers `{ re, im }`.
 * @returns {{ re: number, im: number }} The complex determinant `{ re, im }`.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ re, im }` objects with numeric components.
 * @throws {RangeError} If `matrix` is not square or contains non-finite (`NaN`, `±Infinity`) components.
 */
export function determinantComplexSeries(matrix) {
	const m = validateComplexSquareMatrix(matrix);
	const n = m.length;

	// Closed-form: 0x0 empty product identity
	if (n === 0) {
		return complex(1, 0);
	}

	// Closed-form: 1x1
	if (n === 1) {
		return complex(m[0][0].re, m[0][0].im);
	}

	// Closed-form: 2x2 => a00*a11 - a01*a10
	if (n === 2) {
		const res = cSub(cMul(m[0][0], m[1][1]), cMul(m[0][1], m[1][0]));
		return complex(res.re, res.im);
	}

	// Closed-form: 3x3 cofactor expansion along the first row
	if (n === 3) {
		const m00 = cSub(cMul(m[1][1], m[2][2]), cMul(m[1][2], m[2][1]));
		const m01 = cSub(cMul(m[1][0], m[2][2]), cMul(m[1][2], m[2][0]));
		const m02 = cSub(cMul(m[1][0], m[2][1]), cMul(m[1][1], m[2][0]));
		const t0 = cMul(m[0][0], m00);
		const t1 = cMul(m[0][1], m01);
		const t2 = cMul(m[0][2], m02);
		const res = cAdd(cSub(t0, t1), t2);
		return complex(res.re, res.im);
	}

	// Identity-based PA = LU decomposition with partial pivoting for n >= 4:
	// det(P) * det(A) = det(L) * det(U)  =>  det(A) = (-1)^swaps * prod_{i=0}^{n-1} U[i][i]
	const u = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({ re: m[i][j].re, im: m[i][j].im }))
	);

	let swaps = 0;

	for (let k = 0; k < n; k++) {
		let pivotRow = k;
		let maxAbs = Math.hypot(u[k][k].re, u[k][k].im);

		for (let i = k + 1; i < n; i++) {
			const mag = Math.hypot(u[i][k].re, u[i][k].im);
			if (mag > maxAbs) {
				maxAbs = mag;
				pivotRow = i;
			}
		}

		if (maxAbs === 0) {
			return complex(0, 0);
		}

		if (pivotRow !== k) {
			const tmp = u[k];
			u[k] = u[pivotRow];
			u[pivotRow] = tmp;
			swaps++;
		}

		const pivot = u[k][k];
		for (let i = k + 1; i < n; i++) {
			const entry = u[i][k];
			if (entry.re === 0 && entry.im === 0) {
				continue;
			}
			const factor = cDiv(entry, pivot);
			u[i][k] = { re: 0, im: 0 };
			for (let j = k + 1; j < n; j++) {
				u[i][j] = cSub(u[i][j], cMul(factor, u[k][j]));
			}
		}
	}

	let det = swaps % 2 === 0 ? { re: 1, im: 0 } : { re: -1, im: 0 };
	for (let i = 0; i < n; i++) {
		det = cMul(det, u[i][i]);
	}

	return complex(det.re, det.im);
}
