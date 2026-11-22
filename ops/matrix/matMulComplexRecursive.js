/**
 * Normalize IEEE 754 negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validate a 2D complex matrix and flatten it into contiguous real and imaginary
 * `Float64Array` buffers.
 *
 * @param {unknown} matrix
 * @param {string} name
 * @returns {{ rows: number, cols: number, re: Float64Array, im: Float64Array }}
 * @throws {TypeError} If `matrix` or any row is not an array, or any entry is not
 *   an object `{ re, im }` with numeric `re` and `im` properties.
 * @throws {RangeError} If `matrix` is empty, ragged (inconsistent row lengths), or
 *   contains non-finite (`NaN`, `Infinity`, `-Infinity`) components.
 */
function validateAndFlattenMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of complex numbers`);
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError(`${name} must be a non-empty matrix`);
	}

	let cols = -1;
	let re = null;
	let im = null;

	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array`);
		}
		if (i === 0) {
			cols = row.length;
			if (cols === 0) {
				throw new RangeError(`${name} must have at least one column`);
			}
			re = new Float64Array(rows * cols);
			im = new Float64Array(rows * cols);
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular (row ${i} has length ${row.length}, expected ${cols})`,
			);
		}

		const rowOffset = i * cols;
		for (let j = 0; j < cols; j++) {
			const entry = row[j];
			if (entry === null || typeof entry !== 'object') {
				throw new TypeError(`${name}[${i}][${j}] must be an object { re, im }`);
			}
			const r = entry.re;
			const m = entry.im;
			if (typeof r !== 'number' || typeof m !== 'number') {
				throw new TypeError(
					`${name}[${i}][${j}] must have numeric re and im properties`,
				);
			}
			if (!Number.isFinite(r) || !Number.isFinite(m)) {
				throw new RangeError(
					`${name}[${i}][${j}] must have finite re and im components`,
				);
			}
			re[rowOffset + j] = r;
			im[rowOffset + j] = m;
		}
	}

	return { rows, cols, re, im };
}

/**
 * Add an `m × n` temporary complex buffer into a target sub-block of `C`.
 *
 * @param {Float64Array} cRe
 * @param {Float64Array} cIm
 * @param {number} cCols
 * @param {number} cRow0
 * @param {number} cCol0
 * @param {Float64Array} tRe
 * @param {Float64Array} tIm
 * @param {number} m
 * @param {number} n
 */
function addSubBlock(cRe, cIm, cCols, cRow0, cCol0, tRe, tIm, m, n) {
	for (let i = 0; i < m; i++) {
		const cBase = (cRow0 + i) * cCols + cCol0;
		const tBase = i * n;
		for (let j = 0; j < n; j++) {
			cRe[cBase + j] += tRe[tBase + j];
			cIm[cBase + j] += tIm[tBase + j];
		}
	}
}

/**
 * Recursive divide-and-conquer complex block matrix multiplication:
 * computes `C_sub = A_sub * B_sub` where `A_sub` is `m × k` and `B_sub` is `k × n`.
 *
 * At each step, the largest dimension among `(m, k, n)` is bisected until reaching
 * the `1 × 1 × 1` scalar complex multiplication base case. Splitting the shared
 * inner dimension `k` combines the two halves via pairwise summation for improved
 * floating-point accuracy (`O(eps * log k)` error growth).
 *
 * @param {Float64Array} aRe
 * @param {Float64Array} aIm
 * @param {number} aCols
 * @param {number} aRow0
 * @param {number} aCol0
 * @param {Float64Array} bRe
 * @param {Float64Array} bIm
 * @param {number} bCols
 * @param {number} bRow0
 * @param {number} bCol0
 * @param {Float64Array} cRe
 * @param {Float64Array} cIm
 * @param {number} cCols
 * @param {number} cRow0
 * @param {number} cCol0
 * @param {number} m
 * @param {number} k
 * @param {number} n
 */
function multiplyBlockRecursive(
	aRe,
	aIm,
	aCols,
	aRow0,
	aCol0,
	bRe,
	bIm,
	bCols,
	bRow0,
	bCol0,
	cRe,
	cIm,
	cCols,
	cRow0,
	cCol0,
	m,
	k,
	n,
) {
	if (m === 1 && k === 1 && n === 1) {
		const aIdx = aRow0 * aCols + aCol0;
		const bIdx = bRow0 * bCols + bCol0;
		const cIdx = cRow0 * cCols + cCol0;
		const ar = aRe[aIdx];
		const ai = aIm[aIdx];
		const br = bRe[bIdx];
		const bi = bIm[bIdx];
		cRe[cIdx] = ar * br - ai * bi;
		cIm[cIdx] = ar * bi + ai * br;
		return;
	}

	if (m >= k && m >= n) {
		const m1 = m >> 1;
		const m2 = m - m1;
		multiplyBlockRecursive(
			aRe, aIm, aCols, aRow0, aCol0,
			bRe, bIm, bCols, bRow0, bCol0,
			cRe, cIm, cCols, cRow0, cCol0,
			m1, k, n,
		);
		multiplyBlockRecursive(
			aRe, aIm, aCols, aRow0 + m1, aCol0,
			bRe, bIm, bCols, bRow0, bCol0,
			cRe, cIm, cCols, cRow0 + m1, cCol0,
			m2, k, n,
		);
	} else if (n >= m && n >= k) {
		const n1 = n >> 1;
		const n2 = n - n1;
		multiplyBlockRecursive(
			aRe, aIm, aCols, aRow0, aCol0,
			bRe, bIm, bCols, bRow0, bCol0,
			cRe, cIm, cCols, cRow0, cCol0,
			m, k, n1,
		);
		multiplyBlockRecursive(
			aRe, aIm, aCols, aRow0, aCol0,
			bRe, bIm, bCols, bRow0, bCol0 + n1,
			cRe, cIm, cCols, cRow0, cCol0 + n1,
			m, k, n2,
		);
	} else {
		const k1 = k >> 1;
		const k2 = k - k1;
		multiplyBlockRecursive(
			aRe, aIm, aCols, aRow0, aCol0,
			bRe, bIm, bCols, bRow0, bCol0,
			cRe, cIm, cCols, cRow0, cCol0,
			m, k1, n,
		);
		const tRe = new Float64Array(m * n);
		const tIm = new Float64Array(m * n);
		multiplyBlockRecursive(
			aRe, aIm, aCols, aRow0, aCol0 + k1,
			bRe, bIm, bCols, bRow0 + k1, bCol0,
			tRe, tIm, n, 0, 0,
			m, k2, n,
		);
		addSubBlock(cRe, cIm, cCols, cRow0, cCol0, tRe, tIm, m, n);
	}
}

/**
 * Multiply two matrices over the complex numbers using a recursive
 * divide-and-conquer algorithm.
 *
 * Each complex entry is represented as `{ re, im }` with finite real numbers.
 *
 * Algorithm:
 * - Validates and snapshots both input matrices into contiguous real/imaginary
 *   `Float64Array` buffers without mutating the inputs.
 * - Recursively splits the largest dimension among `(m, k, n)` in half
 *   (cache-oblivious block divide-and-conquer) down to the `1 × 1 × 1` scalar
 *   complex multiplication base case.
 * - Handles arbitrary non-empty rectangular dimensions `(m × k)` and `(k × n)`
 *   directly without power-of-two padding, and uses pairwise summation along
 *   the shared inner dimension `k` for enhanced numerical stability.
 * - Normalizes `-0` to `0` in all returned complex components.
 *
 * @param {Array<Array<{ re: number, im: number }>>} a Left complex matrix of shape `m × k`.
 * @param {Array<Array<{ re: number, im: number }>>} b Right complex matrix of shape `k × n`.
 * @returns {Array<Array<{ re: number, im: number }>>} Product complex matrix `a * b` of shape `m × n`.
 * @throws {TypeError} If `a` or `b` is not a 2D array of `{ re, im }` objects with numeric components.
 * @throws {RangeError} If `a` or `b` is empty, ragged, contains non-finite values, or has incompatible inner dimensions (`a[0].length !== b.length`).
 */
export function matMulComplexRecursive(a, b) {
	const matA = validateAndFlattenMatrix(a, 'a');
	const matB = validateAndFlattenMatrix(b, 'b');

	if (matA.cols !== matB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions: (${matA.rows}x${matA.cols}) and (${matB.rows}x${matB.cols})`,
		);
	}

	const m = matA.rows;
	const k = matA.cols;
	const n = matB.cols;

	const cRe = new Float64Array(m * n);
	const cIm = new Float64Array(m * n);

	multiplyBlockRecursive(
		matA.re, matA.im, k, 0, 0,
		matB.re, matB.im, n, 0, 0,
		cRe, cIm, n, 0, 0,
		m, k, n,
	);

	const result = new Array(m);
	for (let i = 0; i < m; i++) {
		const row = new Array(n);
		const base = i * n;
		for (let j = 0; j < n; j++) {
			row[j] = {
				re: normalizeZero(cRe[base + j]),
				im: normalizeZero(cIm[base + j]),
			};
		}
		result[i] = row;
	}

	return result;
}
