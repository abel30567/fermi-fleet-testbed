import test from 'node:test';
import assert from 'node:assert/strict';
import { determinantFloatMemo } from './determinantFloatMemo.js';

/**
 * Assert two float64 values are within a combined relative + absolute tolerance.
 */
function assertApprox(actual, expected, relTol = 1e-9, absTol = 1e-11) {
	assert.equal(typeof actual, 'number');
	assert.ok(Number.isFinite(actual), `Expected finite number, got ${actual}`);
	const diff = Math.abs(actual - expected);
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, limit=${limit})`,
	);
}

/**
 * Deterministic LCG PRNG for reproducible test matrices.
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return (state / 0x100000000) * 4 - 2; // [-2, 2)
	};
}

/**
 * Independent reference determinant via Householder QR decomposition.
 * Completely independent algorithm from Leibniz tables, bitmask cofactor DP, and LU.
 */
function referenceDetQR(matrix) {
	const n = matrix.length;
	if (n === 0) return 1;
	const R = matrix.map((row) => row.slice());
	let sign = 1;

	for (let k = 0; k < n; k++) {
		let normSq = 0;
		for (let i = k; i < n; i++) {
			normSq += R[i][k] * R[i][k];
		}
		const norm = Math.sqrt(normSq);
		if (norm === 0) return 0;

		const x0 = R[k][k];
		const alpha = x0 >= 0 ? -norm : norm;
		const v = new Array(n - k);
		v[0] = x0 - alpha;
		for (let i = k + 1; i < n; i++) {
			v[i - k] = R[i][k];
		}
		let vNormSq = 0;
		for (let i = 0; i < v.length; i++) {
			vNormSq += v[i] * v[i];
		}
		if (vNormSq === 0) continue;

		// Each nontrivial Householder reflection has det(H) = -1
		sign = -sign;

		for (let j = k; j < n; j++) {
			let dot = 0;
			for (let i = k; i < n; i++) {
				dot += v[i - k] * R[i][j];
			}
			const scale = (2 * dot) / vNormSq;
			for (let i = k; i < n; i++) {
				R[i][j] -= scale * v[i - k];
			}
		}
	}

	let prod = sign;
	for (let i = 0; i < n; i++) {
		prod *= R[i][i];
	}
	return prod === 0 ? 0 : prod;
}

/**
 * Independent matrix multiplication for algebraic identity cross-checks.
 */
function matMul(A, B) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let sum = 0;
			for (let k = 0; k < n; k++) {
				sum += A[i][k] * B[k][j];
			}
			return sum;
		}),
	);
}

function transpose(A) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i]),
	);
}

test('base cases: 0x0 and 1x1 matrices', () => {
	assert.strictEqual(determinantFloatMemo([]), 1);
	assert.strictEqual(determinantFloatMemo([[0]]), 0);
	assert.strictEqual(determinantFloatMemo([[-0]]), 0);
	assert.ok(Object.is(determinantFloatMemo([[-0]]), 0));
	assert.strictEqual(determinantFloatMemo([[42.5]]), 42.5);
	assert.strictEqual(determinantFloatMemo([[-7.25]]), -7.25);
});

test('2x2 and 3x3 matrices (precomputed Leibniz table path)', () => {
	assert.strictEqual(
		determinantFloatMemo([
			[1, 2],
			[3, 4],
		]),
		-2,
	);
	assert.strictEqual(
		determinantFloatMemo([
			[2.5, -1.5],
			[4, 3],
		]),
		13.5,
	);
	assert.strictEqual(
		determinantFloatMemo([
			[6, 1, 1],
			[4, -2, 5],
			[2, 8, 7],
		]),
		-306,
	);

	// 3x3 rotation matrix around Z axis has determinant 1
	const theta = 1.23456789;
	const c = Math.cos(theta);
	const s = Math.sin(theta);
	assertApprox(
		determinantFloatMemo([
			[c, -s, 0],
			[s, c, 0],
			[0, 0, 1],
		]),
		1,
		1e-14,
		1e-14,
	);
});

test('4x4 through 10x10 matrices (bitmask DP memoized path)', () => {
	// Known 4x4 integer matrix: det = 24
	assert.strictEqual(
		determinantFloatMemo([
			[3, 2, 0, 1],
			[4, 0, 1, 2],
			[3, 0, 2, 1],
			[9, 2, 3, 1],
		]),
		24,
	);

	// 5x5 matrix with known exact determinant
	assert.strictEqual(
		determinantFloatMemo([
			[2, -1, 0, 0, 0],
			[-1, 2, -1, 0, 0],
			[0, -1, 2, -1, 0],
			[0, 0, -1, 2, -1],
			[0, 0, 0, -1, 2],
		]),
		6, // n x n tridiagonal with 2 on diag and -1 on sub/super diag has det = n + 1
	);

	// Tridiagonal exact formula det(T_n) = n + 1 across n = 4..10
	for (let n = 4; n <= 10; n++) {
		const T = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => {
				if (i === j) return 2;
				if (Math.abs(i - j) === 1) return -1;
				return 0;
			}),
		);
		assert.strictEqual(determinantFloatMemo(T), n + 1);
	}
});

test('large matrices n > 10 (LU partial-pivoting path)', () => {
	// Tridiagonal det(T_n) = n + 1 for n = 11, 15, 20
	for (const n of [11, 15, 20]) {
		const T = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => {
				if (i === j) return 2;
				if (Math.abs(i - j) === 1) return -1;
				return 0;
			}),
		);
		assertApprox(determinantFloatMemo(T), n + 1, 1e-11, 1e-11);
	}

	// Upper triangular 14x14 matrix: det is product of diagonal
	const n = 14;
	const U = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			if (j < i) return 0;
			if (j === i) return i % 2 === 0 ? 1.5 : -0.5;
			return (i + j) * 0.25;
		}),
	);
	const expected = Math.pow(1.5, 7) * Math.pow(-0.5, 7);
	assertApprox(determinantFloatMemo(U), expected, 1e-12, 1e-12);
});

test('singular matrices and -0 normalization across all code paths', () => {
	for (const n of [2, 3, 4, 6, 12]) {
		// Duplicate rows
		const dup = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i === 1 ? j + 1 : i * n + j + 1)),
		);
		dup[0] = dup[1].slice();
		const resDup = determinantFloatMemo(dup);
		assert.ok(Object.is(resDup, 0), `Expected +0 for singular ${n}x${n}, got ${resDup}`);

		// Zero column
		const zeroCol = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (j === n - 1 ? 0 : i + j + 1)),
		);
		const resZero = determinantFloatMemo(zeroCol);
		assert.ok(Object.is(resZero, 0), `Expected +0 for zero-col ${n}x${n}, got ${resZero}`);
	}

	// Matrix with -0 entries that could produce -0 without normalization
	const negZero = [
		[-0, 1],
		[-0, 2],
	];
	assert.ok(Object.is(determinantFloatMemo(negZero), 0));
});

test('extreme scaling avoids spurious intermediate overflow/underflow in LU path', () => {
	// 12x12 diagonal matrix alternating 1e200 and 1e-200 has true determinant 1,
	// even though prefix products of 1e200 alone would overflow if ordered poorly.
	const n = 12;
	const diag = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			if (i !== j) return 0;
			return i < 6 ? 1e200 : 1e-200;
		}),
	);
	assertApprox(determinantFloatMemo(diag), 1, 1e-12, 1e-12);
});

test('immutability and memoization cache behavior', () => {
	const m = [
		[1, 2, 3, 4],
		[5, 6, 7, 8],
		[2, 6, 4, 8],
		[3, 1, 1, 2],
	];
	const snapshot = m.map((r) => r.slice());

	const first = determinantFloatMemo(m);
	assert.deepStrictEqual(m, snapshot, 'Input matrix must not be mutated');

	// Cache hit with identical values in a new array instance
	const second = determinantFloatMemo(snapshot);
	assert.strictEqual(second, first);

	// Mutating original matrix produces the new determinant (no stale reference caching)
	m[0][0] = 10;
	const updated = determinantFloatMemo(m);
	assert.notStrictEqual(updated, first);
	assertApprox(updated, referenceDetQR(m), 1e-11, 1e-11);

	// Exercise LRU cache eviction past MAX_CACHE_SIZE (1024)
	for (let k = 1; k <= 1100; k++) {
		const det = determinantFloatMemo([
			[k, 1],
			[0, 2],
		]);
		assert.strictEqual(det, 2 * k);
	}
	// Earlier evicted entry still computes accurately on re-query
	assert.strictEqual(
		determinantFloatMemo([
			[1, 1],
			[0, 2],
		]),
		2,
	);
});

test('independent cross-check: Householder QR reference across dimensions 1..15', () => {
	const rng = makeRng(20261123);
	for (let n = 1; n <= 15; n++) {
		for (let trial = 0; trial < 3; trial++) {
			const A = Array.from({ length: n }, () =>
				Array.from({ length: n }, () => rng()),
			);
			const actual = determinantFloatMemo(A);
			const expected = referenceDetQR(A);
			assertApprox(actual, expected, 1e-9, 1e-9);
		}
	}
});

test('independent cross-check: Vandermonde closed-form formula', () => {
	for (const xs of [
		[1, 2, 4],
		[-2, 0.5, 1.5, 3],
		[-1.5, -0.5, 0, 0.75, 2.25, 3.5],
		[-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
	]) {
		const n = xs.length;
		const V = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => Math.pow(xs[i], j)),
		);
		let expected = 1;
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				expected *= xs[j] - xs[i];
			}
		}
		assertApprox(determinantFloatMemo(V), expected, 1e-8, 1e-8);
	}
});

test('independent cross-check: algebraic identities (multiplicativity, transpose, scaling, row ops)', () => {
	const rng = makeRng(987654321);
	for (const n of [2, 3, 5, 8, 12]) {
		const A = Array.from({ length: n }, () =>
			Array.from({ length: n }, () => rng()),
		);
		const B = Array.from({ length: n }, () =>
			Array.from({ length: n }, () => rng()),
		);

		const detA = determinantFloatMemo(A);
		const detB = determinantFloatMemo(B);

		// det(A * B) = det(A) * det(B)
		assertApprox(determinantFloatMemo(matMul(A, B)), detA * detB, 1e-8, 1e-8);

		// det(A^T) = det(A)
		assertApprox(determinantFloatMemo(transpose(A)), detA, 1e-9, 1e-9);

		// det(c * A) = c^n * det(A)
		const c = 1.25;
		const cA = A.map((row) => row.map((v) => v * c));
		assertApprox(determinantFloatMemo(cA), Math.pow(c, n) * detA, 1e-8, 1e-8);

		// Swapping two rows negates determinant
		const swapped = A.map((row) => row.slice());
		[swapped[0], swapped[n - 1]] = [swapped[n - 1], swapped[0]];
		assertApprox(determinantFloatMemo(swapped), -detA, 1e-9, 1e-9);

		// Adding a multiple of one row to another preserves determinant
		const sheared = A.map((row) => row.slice());
		for (let j = 0; j < n; j++) {
			sheared[0][j] += 3.5 * sheared[1][j];
		}
		assertApprox(determinantFloatMemo(sheared), detA, 1e-8, 1e-8);
	}
});

test('input validation rejects invalid types, non-square shapes, and non-finite entries', () => {
	// Non-array inputs
	for (const bad of [null, undefined, 42, '[[1]]', {}, new Float64Array([1])]) {
		assert.throws(() => determinantFloatMemo(bad), TypeError);
	}

	// Non-array rows
	assert.throws(() => determinantFloatMemo([1, 2]), TypeError);
	assert.throws(() => determinantFloatMemo([[1, 2], null]), TypeError);

	// Non-square matrices
	assert.throws(() => determinantFloatMemo([[]]), RangeError);
	assert.throws(() => determinantFloatMemo([[1, 2]]), RangeError);
	assert.throws(() => determinantFloatMemo([[1], [2]]), RangeError);
	assert.throws(() => determinantFloatMemo([[1, 2], [3]]), RangeError);

	// Non-number elements and sparse arrays
	assert.throws(() => determinantFloatMemo([['1']]), TypeError);
	assert.throws(() => determinantFloatMemo([[1n]]), TypeError);
	assert.throws(() => determinantFloatMemo([[undefined]]), TypeError);
	assert.throws(() => determinantFloatMemo([[null]]), TypeError);
	assert.throws(() => determinantFloatMemo([new Array(1)]), TypeError);

	// Non-finite numbers
	assert.throws(() => determinantFloatMemo([[NaN]]), RangeError);
	assert.throws(() => determinantFloatMemo([[Infinity]]), RangeError);
	assert.throws(() => determinantFloatMemo([[-Infinity]]), RangeError);
	assert.throws(
		() =>
			determinantFloatMemo([
				[1, 2],
				[3, Number.NaN],
			]),
		RangeError,
	);
});
