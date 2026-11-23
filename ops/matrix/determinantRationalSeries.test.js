import test from 'node:test';
import assert from 'node:assert/strict';
import { determinantRationalSeries } from './determinantRationalSeries.js';

/** Helper to construct a rational `{ num, den }`. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

/** Exact BigInt gcd for assertions and independent helpers. */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

function normQ(num, den) {
	if (num === 0n) return { num: 0n, den: 1n };
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

function addQ(a, b) {
	return normQ(a.num * b.den + b.num * a.den, a.den * b.den);
}

function subQ(a, b) {
	return normQ(a.num * b.den - b.num * a.den, a.den * b.den);
}

function mulQ(a, b) {
	return normQ(a.num * b.num, a.den * b.den);
}

function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`);
	assert.equal(gcd(r.num, r.den), 1n, `expected reduced rational, got ${r.num}/${r.den}`);
}

/** Independent Laplace cofactor expansion along row 0 for cross-checking. */
function detLaplace(matrix) {
	const n = matrix.length;
	if (n === 1) return normQ(matrix[0][0].num, matrix[0][0].den);
	if (n === 2) {
		return subQ(mulQ(matrix[0][0], matrix[1][1]), mulQ(matrix[0][1], matrix[1][0]));
	}
	let total = q(0);
	for (let c = 0; c < n; c++) {
		const minor = [];
		for (let r = 1; r < n; r++) {
			minor.push(matrix[r].filter((_, j) => j !== c));
		}
		const term = mulQ(matrix[0][c], detLaplace(minor));
		total = c % 2 === 0 ? addQ(total, term) : subQ(total, term);
	}
	return total;
}

/** Exact rational matrix multiplication for det(AB) = det(A)det(B) cross-check. */
function matMulQ(A, B) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let sum = q(0);
			for (let k = 0; k < n; k++) {
				sum = addQ(sum, mulQ(A[i][k], B[k][j]));
			}
			return sum;
		})
	);
}

/** Build n x n Hilbert matrix H[i][j] = 1 / (i + j + 1). */
function hilbertMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => q(1, i + j + 1))
	);
}

/** Exact closed-form Hilbert determinant via Cauchy formula: c(n)^4 / c(2n). */
function exactHilbertDet(n) {
	const fact = (k) => {
		let res = 1n;
		for (let i = 2n; i <= BigInt(k); i++) res *= i;
		return res;
	};
	const c = (m) => {
		let prod = 1n;
		for (let k = 1; k < m; k++) prod *= fact(k);
		return prod;
	};
	const cn = c(n);
	return normQ(cn * cn * cn * cn, c(2 * n));
}

test('1x1 matrices including unreduced and negative denominators', () => {
	const r1 = determinantRationalSeries([[q(7, 3)]]);
	assertCanonical(r1);
	assert.deepEqual(r1, q(7, 3));

	const r2 = determinantRationalSeries([[q(-6, -9)]]);
	assertCanonical(r2);
	assert.deepEqual(r2, q(2, 3));

	const r3 = determinantRationalSeries([[q(4, -10)]]);
	assertCanonical(r3);
	assert.deepEqual(r3, q(-2, 5));

	const r4 = determinantRationalSeries([[q(0, -7)]]);
	assertCanonical(r4);
	assert.deepEqual(r4, q(0, 1));
});

test('2x2 rational matrix', () => {
	const M = [
		[q(1, 2), q(1, 3)],
		[q(1, 4), q(1, 5)],
	];
	// (1/2)*(1/5) - (1/3)*(1/4) = 1/10 - 1/12 = 1/60
	const res = determinantRationalSeries(M);
	assertCanonical(res);
	assert.deepEqual(res, q(1, 60));
});

test('3x3 rational matrix', () => {
	const M = [
		[q(1, 2), q(-2, 3), q(3, 4)],
		[q(4, 5), q(1, 6), q(-1, 2)],
		[q(-3, 7), q(2, 5), q(5, 3)],
	];
	const res = determinantRationalSeries(M);
	assertCanonical(res);
	assert.deepEqual(res, detLaplace(M));
});

test('4x4 rational matrix', () => {
	const M = [
		[q(2, 3), q(1, 5), q(-3, 2), q(4, 7)],
		[q(-1, 4), q(5, 3), q(2, 9), q(-1, 2)],
		[q(3, 5), q(-2, 7), q(7, 4), q(1, 3)],
		[q(1, 2), q(3, 4), q(-5, 6), q(2, 5)],
	];
	const res = determinantRationalSeries(M);
	assertCanonical(res);
	assert.deepEqual(res, detLaplace(M));
});

test('Hilbert matrices H_1 through H_6 match closed-form Cauchy determinant', () => {
	const known = [
		q(1, 1),
		q(1, 12),
		q(1, 2160),
		q(1, 6048000),
		q(1, 266716800000n),
		q(1, 186313420339200000n),
	];
	for (let n = 1; n <= 6; n++) {
		const res = determinantRationalSeries(hilbertMatrix(n));
		assertCanonical(res);
		assert.deepEqual(res, known[n - 1]);
		assert.deepEqual(res, exactHilbertDet(n));
	}
});

test('identity, diagonal, and triangular matrices', () => {
	for (const n of [1, 2, 3, 5]) {
		const I = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i === j ? q(1) : q(0)))
		);
		assert.deepEqual(determinantRationalSeries(I), q(1, 1));
	}

	const upperTri = [
		[q(2, 3), q(9, 4), q(-5, 7), q(11, 2)],
		[q(0), q(-3, 5), q(8, 3), q(1, 9)],
		[q(0), q(0), q(5, 2), q(-4, 11)],
		[q(0), q(0), q(0), q(7, 4)],
	];
	// Product of diagonal: (2/3)*(-3/5)*(5/2)*(7/4) = -7/4
	const res = determinantRationalSeries(upperTri);
	assertCanonical(res);
	assert.deepEqual(res, q(-7, 4));
});

test('singular matrices return exact zero { num: 0n, den: 1n }', () => {
	const zeroRow = [
		[q(1, 2), q(3, 4), q(5, 6)],
		[q(0), q(0), q(0)],
		[q(7, 8), q(9, 10), q(11, 12)],
	];
	assert.deepEqual(determinantRationalSeries(zeroRow), q(0, 1));

	const zeroCol = [
		[q(1, 3), q(0), q(2, 5)],
		[q(4, 7), q(0), q(-1, 2)],
		[q(5, 9), q(0), q(3, 4)],
	];
	assert.deepEqual(determinantRationalSeries(zeroCol), q(0, 1));

	// Row 2 = (1/2)*Row 0 + (3/4)*Row 1
	const dependent = [
		[q(2, 3), q(-1, 5), q(4, 7), q(1, 2)],
		[q(-3, 4), q(2, 3), q(1, 5), q(5, 6)],
		[q(-11, 48), q(2, 5), q(61, 140), q(7, 8)],
		[q(5, 2), q(1, 3), q(-2, 7), q(3, 5)],
	];
	assert.deepEqual(determinantRationalSeries(dependent), q(0, 1));
});

test('row swap sign flip and pivoting with leading zeros', () => {
	const A = [
		[q(0), q(2, 3), q(1, 5)],
		[q(3, 4), q(0), q(-2, 7)],
		[q(1, 2), q(-5, 6), q(0)],
	];
	const detA = determinantRationalSeries(A);
	assertCanonical(detA);
	assert.deepEqual(detA, detLaplace(A));

	// Swap row 0 and row 2 -> determinant negates
	const swapped = [A[2], A[1], A[0]];
	const detSwapped = determinantRationalSeries(swapped);
	assert.deepEqual(detSwapped, { num: -detA.num, den: detA.den });

	// 4x4 anti-diagonal permutation matrix has 2 swaps => det = +1
	const anti4 = [
		[q(0), q(0), q(0), q(1)],
		[q(0), q(0), q(1), q(0)],
		[q(0), q(1), q(0), q(0)],
		[q(1), q(0), q(0), q(0)],
	];
	assert.deepEqual(determinantRationalSeries(anti4), q(1, 1));

	// 3x3 anti-diagonal permutation matrix has 1 swap => det = -1
	const anti3 = [
		[q(0), q(0), q(1)],
		[q(0), q(1), q(0)],
		[q(1), q(0), q(0)],
	];
	assert.deepEqual(determinantRationalSeries(anti3), q(-1, 1));
});

test('large BigInt rationals beyond IEEE 754 precision and non-mutation', () => {
	const big = 10n ** 30n;
	const M = [
		[q(big + 1n, big), q(1n, big)],
		[q(1n, big), q(big - 1n, big)],
	];
	// ((big+1)(big-1) - 1) / big^2 = (big^2 - 2) / big^2
	const snapshot = M.map((row) => row.map((cell) => ({ ...cell })));
	const res = determinantRationalSeries(M);
	assertCanonical(res);
	assert.deepEqual(res, normQ(big * big - 2n, big * big));
	assert.deepEqual(M, snapshot);
});

test('independent cross-checks: det(A*B) = det(A)*det(B), det(A^T) = det(A), det(cA) = c^n det(A)', () => {
	const A = [
		[q(0), q(3, 5), q(-1, 2), q(2, 7)],
		[q(4, 3), q(-2, 5), q(1, 4), q(0)],
		[q(-1, 6), q(5, 2), q(0), q(-3, 4)],
		[q(2, 9), q(0), q(7, 3), q(1, 5)],
	];
	const B = [
		[q(1, 2), q(-1, 3), q(2, 5), q(3, 7)],
		[q(5, 4), q(2, 9), q(-3, 2), q(1, 6)],
		[q(-2, 3), q(4, 5), q(1, 7), q(-5, 8)],
		[q(3, 11), q(-7, 4), q(2, 3), q(4, 9)],
	];

	const detA = determinantRationalSeries(A);
	const detB = determinantRationalSeries(B);
	const detAB = determinantRationalSeries(matMulQ(A, B));

	assertCanonical(detAB);
	assert.deepEqual(detA, detLaplace(A));
	assert.deepEqual(detB, detLaplace(B));
	assert.deepEqual(detAB, mulQ(detA, detB));

	// Transpose identity
	const AT = A[0].map((_, j) => A.map((row) => row[j]));
	assert.deepEqual(determinantRationalSeries(AT), detA);

	// Scaling identity: det(c * A) = c^4 * det(A)
	const c = q(-3, 5);
	const cA = A.map((row) => row.map((cell) => mulQ(c, cell)));
	const c4 = mulQ(mulQ(c, c), mulQ(c, c));
	assert.deepEqual(determinantRationalSeries(cA), mulQ(c4, detA));
});

test('independent Laplace cross-check on 5x5 matrix with zeros and negative denominators', () => {
	const M = [
		[q(0, 1), q(2, -3), q(1, 4), q(0, 5), q(3, 5)],
		[q(5, 6), q(0, 1), q(-2, 3), q(4, -7), q(1, 2)],
		[q(-3, 4), q(1, 5), q(0, 1), q(2, 3), q(-1, 6)],
		[q(1, 2), q(-4, 5), q(3, 7), q(0, 1), q(2, 9)],
		[q(4, -9), q(3, 2), q(-1, 5), q(5, 4), q(0, 1)],
	];
	const res = determinantRationalSeries(M);
	assertCanonical(res);
	assert.deepEqual(res, detLaplace(M));
});

test('invalid inputs throw descriptive TypeError or RangeError', () => {
	assert.throws(() => determinantRationalSeries(null), TypeError);
	assert.throws(() => determinantRationalSeries(undefined), TypeError);
	assert.throws(() => determinantRationalSeries(42), TypeError);
	assert.throws(() => determinantRationalSeries('matrix'), TypeError);
	assert.throws(() => determinantRationalSeries({}), TypeError);

	assert.throws(() => determinantRationalSeries([]), RangeError);
	assert.throws(() => determinantRationalSeries([[]]), RangeError);
	assert.throws(() => determinantRationalSeries([[q(1), q(2)]]), RangeError);
	assert.throws(
		() =>
			determinantRationalSeries([
				[q(1), q(2)],
				[q(3)],
			]),
		RangeError
	);
	assert.throws(() => determinantRationalSeries([q(1)]), TypeError);

	assert.throws(() => determinantRationalSeries([[null]]), TypeError);
	assert.throws(() => determinantRationalSeries([[{ num: 1, den: 1n }]]), TypeError);
	assert.throws(() => determinantRationalSeries([[{ num: 1n, den: 1 }]]), TypeError);
	assert.throws(() => determinantRationalSeries([[{ num: 1n }]]), TypeError);
	assert.throws(() => determinantRationalSeries([[{ num: 1n, den: 0n }]]), RangeError);

	// Validation must run across the entire matrix even if row 0 is all zeros
	assert.throws(
		() =>
			determinantRationalSeries([
				[q(0), q(0)],
				[q(1), { num: 1n, den: 0n }],
			]),
		RangeError
	);
});
