/**
 * Fixed-point scale factor (10^18) used for representing non-integer
 * matrix inverse entries as exact BigInt integers.
 */
export const SCALE = 10n ** 18n;

const ZERO_RAT = Object.freeze({ num: 0n, den: 1n });

/**
 * Computes the non-negative greatest common divisor of two BigInts
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Constructs a reduced rational number { num, den } with den > 0n.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function ratMake(num, den) {
	if (den === 0n) {
		throw new RangeError('Division by zero in rational arithmetic');
	}
	if (num === 0n) {
		return ZERO_RAT;
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	if (d === 1n) {
		return { num: n, den: 1n };
	}
	const g = gcdBigInt(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Negates a reduced rational number.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @returns {{ num: bigint, den: bigint }}
 */
function ratNeg(a) {
	if (a.num === 0n) return ZERO_RAT;
	return { num: -a.num, den: a.den };
}

/**
 * Adds two reduced rational numbers, returning a reduced rational.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratAdd(a, b) {
	if (a.num === 0n) return b;
	if (b.num === 0n) return a;
	if (a.den === 1n && b.den === 1n) {
		const sum = a.num + b.num;
		return sum === 0n ? ZERO_RAT : { num: sum, den: 1n };
	}
	if (a.den === b.den) {
		return ratMake(a.num + b.num, a.den);
	}
	const g = gcdBigInt(a.den, b.den);
	const aDenDivG = a.den / g;
	const bDenDivG = b.den / g;
	const num = a.num * bDenDivG + b.num * aDenDivG;
	if (num === 0n) return ZERO_RAT;
	const den = aDenDivG * b.den;
	const g2 = gcdBigInt(num, g);
	return { num: num / g2, den: den / g2 };
}

/**
 * Subtracts two reduced rational numbers (a - b).
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratSub(a, b) {
	return ratAdd(a, ratNeg(b));
}

/**
 * Multiplies two reduced rational numbers using cross-cancellation.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratMul(a, b) {
	if (a.num === 0n || b.num === 0n) return ZERO_RAT;
	if (a.den === 1n && b.den === 1n) {
		return { num: a.num * b.num, den: 1n };
	}
	const g1 = gcdBigInt(a.num, b.den);
	const g2 = gcdBigInt(b.num, a.den);
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	};
}

/**
 * Computes the multiplicative inverse of a reduced rational number.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @returns {{ num: bigint, den: bigint }}
 */
function ratInv(a) {
	if (a.num === 0n) {
		throw new RangeError('Matrix is singular and cannot be inverted');
	}
	if (a.num < 0n) {
		return { num: -a.den, den: -a.num };
	}
	return { num: a.den, den: a.num };
}

/**
 * Converts a reduced rational number to a fixed-point BigInt scaled by `scale`,
 * rounding to the nearest integer with ties rounded away from zero.
 *
 * @param {{ num: bigint, den: bigint }} r
 * @param {bigint} [scale=SCALE]
 * @returns {bigint}
 */
function ratToFixed(r, scale = SCALE) {
	if (r.num === 0n) return 0n;
	const scaled = r.num * scale;
	if (r.den === 1n) return scaled;
	const neg = scaled < 0n;
	const absScaled = neg ? -scaled : scaled;
	let q = absScaled / r.den;
	const rem = absScaled % r.den;
	if (rem * 2n >= r.den) {
		q += 1n;
	}
	if (q === 0n) return 0n;
	return neg ? -q : q;
}

/**
 * Transposes a 2D matrix of arbitrary element type.
 *
 * @template T
 * @param {T[][]} m
 * @returns {T[][]}
 */
function transpose(m) {
	const rows = m.length;
	const cols = m[0].length;
	const res = Array.from({ length: cols }, () => new Array(rows));
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			res[j][i] = m[i][j];
		}
	}
	return res;
}

/**
 * Extracts a rectangular submatrix [r0, r1) x [c0, c1).
 *
 * @template T
 * @param {T[][]} m
 * @param {number} r0
 * @param {number} r1
 * @param {number} c0
 * @param {number} c1
 * @returns {T[][]}
 */
function submatrix(m, r0, r1, c0, c1) {
	const rows = r1 - r0;
	const cols = c1 - c0;
	const res = Array.from({ length: rows }, () => new Array(cols));
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			res[i][j] = m[r0 + i][c0 + j];
		}
	}
	return res;
}

/**
 * Recursive divide-and-conquer matrix multiply-accumulate over BigInt matrices:
 * out[or0..][oc0..] += X[xr0..xr1][xc0..xc1] * Y[yr0..yr1][yc0..yc1].
 */
function matMulAddIntRecursive(
	X,
	xr0,
	xr1,
	xc0,
	xc1,
	Y,
	yr0,
	yr1,
	yc0,
	yc1,
	out,
	or0,
	oc0,
) {
	const r = xr1 - xr0;
	const p = xc1 - xc0;
	const c = yc1 - yc0;

	if (r === 1 && p === 1 && c === 1) {
		out[or0][oc0] += X[xr0][xc0] * Y[yr0][yc0];
		return;
	}

	if (r >= p && r >= c) {
		const half = r >> 1;
		const rm = xr0 + half;
		matMulAddIntRecursive(X, xr0, rm, xc0, xc1, Y, yr0, yr1, yc0, yc1, out, or0, oc0);
		matMulAddIntRecursive(X, rm, xr1, xc0, xc1, Y, yr0, yr1, yc0, yc1, out, or0 + half, oc0);
	} else if (c >= p) {
		const half = c >> 1;
		const cm = yc0 + half;
		matMulAddIntRecursive(X, xr0, xr1, xc0, xc1, Y, yr0, yr1, yc0, cm, out, or0, oc0);
		matMulAddIntRecursive(X, xr0, xr1, xc0, xc1, Y, yr0, yr1, cm, yc1, out, or0, oc0 + half);
	} else {
		const half = p >> 1;
		const pm = xc0 + half;
		const ypm = yr0 + half;
		matMulAddIntRecursive(X, xr0, xr1, xc0, pm, Y, yr0, ypm, yc0, yc1, out, or0, oc0);
		matMulAddIntRecursive(X, xr0, xr1, pm, xc1, Y, ypm, yr1, yc0, yc1, out, or0, oc0);
	}
}

/**
 * Multiplies two BigInt matrices using recursive divide-and-conquer.
 *
 * @param {bigint[][]} X
 * @param {bigint[][]} Y
 * @returns {bigint[][]}
 */
function matMulIntRecursive(X, Y) {
	const r = X.length;
	const p = X[0].length;
	const c = Y[0].length;
	const out = Array.from({ length: r }, () => new Array(c).fill(0n));
	matMulAddIntRecursive(X, 0, r, 0, p, Y, 0, p, 0, c, out, 0, 0);
	return out;
}

/**
 * Recursive divide-and-conquer matrix multiply-accumulate over rational matrices:
 * out[or0..][oc0..] += X[xr0..xr1][xc0..xc1] * Y[yr0..yr1][yc0..yc1].
 */
function matMulAddRatRecursive(
	X,
	xr0,
	xr1,
	xc0,
	xc1,
	Y,
	yr0,
	yr1,
	yc0,
	yc1,
	out,
	or0,
	oc0,
) {
	const r = xr1 - xr0;
	const p = xc1 - xc0;
	const c = yc1 - yc0;

	if (r === 1 && p === 1 && c === 1) {
		const prod = ratMul(X[xr0][xc0], Y[yr0][yc0]);
		if (prod.num !== 0n) {
			out[or0][oc0] = ratAdd(out[or0][oc0], prod);
		}
		return;
	}

	if (r >= p && r >= c) {
		const half = r >> 1;
		const rm = xr0 + half;
		matMulAddRatRecursive(X, xr0, rm, xc0, xc1, Y, yr0, yr1, yc0, yc1, out, or0, oc0);
		matMulAddRatRecursive(X, rm, xr1, xc0, xc1, Y, yr0, yr1, yc0, yc1, out, or0 + half, oc0);
	} else if (c >= p) {
		const half = c >> 1;
		const cm = yc0 + half;
		matMulAddRatRecursive(X, xr0, xr1, xc0, xc1, Y, yr0, yr1, yc0, cm, out, or0, oc0);
		matMulAddRatRecursive(X, xr0, xr1, xc0, xc1, Y, yr0, yr1, cm, yc1, out, or0, oc0 + half);
	} else {
		const half = p >> 1;
		const pm = xc0 + half;
		const ypm = yr0 + half;
		matMulAddRatRecursive(X, xr0, xr1, xc0, pm, Y, yr0, ypm, yc0, yc1, out, or0, oc0);
		matMulAddRatRecursive(X, xr0, xr1, pm, xc1, Y, ypm, yr1, yc0, yc1, out, or0, oc0);
	}
}

/**
 * Multiplies two rational matrices using recursive divide-and-conquer.
 *
 * @param {{ num: bigint, den: bigint }[][]} X
 * @param {{ num: bigint, den: bigint }[][]} Y
 * @returns {{ num: bigint, den: bigint }[][]}
 */
function matMulRatRecursive(X, Y) {
	const r = X.length;
	const p = X[0].length;
	const c = Y[0].length;
	const out = Array.from({ length: r }, () => new Array(c).fill(ZERO_RAT));
	matMulAddRatRecursive(X, 0, r, 0, p, Y, 0, p, 0, c, out, 0, 0);
	return out;
}

/**
 * Element-wise addition of two rational matrices.
 */
function matAddRat(A, B) {
	const rows = A.length;
	const cols = A[0].length;
	const res = Array.from({ length: rows }, () => new Array(cols));
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			res[i][j] = ratAdd(A[i][j], B[i][j]);
		}
	}
	return res;
}

/**
 * Element-wise subtraction of two rational matrices (A - B).
 */
function matSubRat(A, B) {
	const rows = A.length;
	const cols = A[0].length;
	const res = Array.from({ length: rows }, () => new Array(cols));
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			res[i][j] = ratSub(A[i][j], B[i][j]);
		}
	}
	return res;
}

/**
 * Element-wise negation of a rational matrix.
 */
function matNegRat(A) {
	const rows = A.length;
	const cols = A[0].length;
	const res = Array.from({ length: rows }, () => new Array(cols));
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			res[i][j] = ratNeg(A[i][j]);
		}
	}
	return res;
}

/**
 * Recursively inverts a symmetric positive semi-definite (PSD) rational matrix G
 * via block Schur complement divide-and-conquer.
 *
 * For an invertible matrix A, G = A^T A is strictly symmetric positive definite (SPD),
 * guaranteeing that every leading principal submatrix P and every Schur complement
 * S = T - Q^T P^{-1} Q is also SPD and invertible without pivoting.
 * If A is singular, G is singular PSD and a 1x1 zero pivot is guaranteed to be reached.
 *
 * @param {{ num: bigint, den: bigint }[][]} G
 * @returns {{ num: bigint, den: bigint }[][]}
 */
function invertSpdRecursive(G) {
	const n = G.length;
	if (n === 1) {
		return [[ratInv(G[0][0])]];
	}

	const k = n >> 1;

	// Partition G = [[P, Q], [Q^T, T]]
	const P = submatrix(G, 0, k, 0, k);
	const Q = submatrix(G, 0, k, k, n);
	const T = submatrix(G, k, n, k, n);

	// 1. Recursively invert P
	const PInv = invertSpdRecursive(P);

	// 2. U = P^{-1} Q, Schur complement S = T - Q^T U
	const U = matMulRatRecursive(PInv, Q);
	const QTU = matMulRatRecursive(transpose(Q), U);
	const S = matSubRat(T, QTU);

	// 3. Recursively invert Schur complement S
	const SInv = invertSpdRecursive(S);

	// 4. Assemble inverse blocks:
	//    [[P^{-1} + W U^T, -W], [-W^T, S^{-1}]], where W = U S^{-1}
	const W = matMulRatRecursive(U, SInv);
	const WUT = matMulRatRecursive(W, transpose(U));
	const topLeft = matAddRat(PInv, WUT);
	const topRight = matNegRat(W);
	const bottomLeft = transpose(topRight);

	const inv = Array.from({ length: n }, () => new Array(n));
	for (let i = 0; i < k; i++) {
		for (let j = 0; j < k; j++) {
			inv[i][j] = topLeft[i][j];
		}
		for (let j = k; j < n; j++) {
			inv[i][j] = topRight[i][j - k];
		}
	}
	for (let i = k; i < n; i++) {
		for (let j = 0; j < k; j++) {
			inv[i][j] = bottomLeft[i - k][j];
		}
		for (let j = k; j < n; j++) {
			inv[i][j] = SInv[i - k][j - k];
		}
	}
	return inv;
}

/**
 * Validates that the input is a non-empty square 2D array of BigInt values.
 *
 * @param {unknown} matrix
 */
function validateMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be a non-empty 2D array of bigint values');
	}
	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('Matrix must not be empty');
	}
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`,
			);
		}
		for (let j = 0; j < n; j++) {
			if (typeof row[j] !== 'bigint') {
				throw new TypeError(
					`Matrix entry at [${i}][${j}] must be a bigint, got ${typeof row[j]}`,
				);
			}
		}
	}
}

/**
 * Computes the matrix inverse A^{-1} of a square BigInt matrix A using exact
 * recursive divide-and-conquer block Schur complement inversion, returning
 * fixed-point BigInt entries scaled by `SCALE` (10^18).
 *
 * Algorithm:
 * 1. Forms the Gram matrix G = A^T A over exact BigInts using recursive
 *    divide-and-conquer matrix multiplication. For any invertible A, G is
 *    symmetric positive definite (SPD), so every recursive leading block and
 *    Schur complement is guaranteed invertible without pivoting; for singular A,
 *    a 1x1 zero pivot is guaranteed to be encountered.
 * 2. Recursively inverts G over exact reduced BigInt rationals via block Schur
 *    complement: splitting G = [[P, Q], [Q^T, T]] into halves of size floor(n/2)
 *    and ceil(n/2), computing P^{-1} and S^{-1} = (T - Q^T P^{-1} Q)^{-1}
 *    recursively, and combining blocks with recursive divide-and-conquer
 *    rational matrix multiplication.
 * 3. Recovers the exact rational inverse A^{-1} = G^{-1} A^T and converts each
 *    entry to fixed-point BigInt scaled by 10^18 (rounded to nearest integer,
 *    ties away from zero), eliminating all intermediate rounding error.
 *
 * @param {bigint[][]} matrix - Non-empty n x n matrix of BigInt integers.
 * @returns {bigint[][]} n x n inverse matrix with each entry scaled by 10n ** 18n.
 * @throws {TypeError} If `matrix` is not a 2D array of BigInt values.
 * @throws {RangeError} If `matrix` is empty, non-square, or singular (det(A) === 0).
 */
export function inverseBigIntRecursive(matrix) {
	validateMatrix(matrix);

	const n = matrix.length;
	if (n === 1) {
		const a00 = matrix[0][0];
		if (a00 === 0n) {
			throw new RangeError('Matrix is singular and cannot be inverted');
		}
		return [[ratToFixed(ratMake(1n, a00), SCALE)]];
	}

	const At = transpose(matrix);
	const GInt = matMulIntRecursive(At, matrix);

	const GRat = GInt.map((row) =>
		row.map((val) => (val === 0n ? ZERO_RAT : { num: val, den: 1n })),
	);
	const GInv = invertSpdRecursive(GRat);

	const AtRat = At.map((row) =>
		row.map((val) => (val === 0n ? ZERO_RAT : { num: val, den: 1n })),
	);
	const AInvRat = matMulRatRecursive(GInv, AtRat);

	return AInvRat.map((row) => row.map((entry) => ratToFixed(entry, SCALE)));
}
