import test from 'node:test';
import assert from 'node:assert/strict';
import { transposeTypedSeries } from './transposeTypedSeries.js';

test('square matrices (explicit and inferred dimensions)', () => {
	const a = new Float64Array([1, 2, 3, 4]);
	const expected2x2 = new Float64Array([1, 3, 2, 4]);
	assert.deepEqual(transposeTypedSeries(a, 2, 2), expected2x2);
	assert.deepEqual(transposeTypedSeries(a), expected2x2);

	const b = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
	const expected3x3 = new Float64Array([1, 4, 7, 2, 5, 8, 3, 6, 9]);
	assert.deepEqual(transposeTypedSeries(b, 3, 3), expected3x3);
	assert.deepEqual(transposeTypedSeries(b), expected3x3);
});

test('rectangular matrices (wide and tall)', () => {
	// 2x3 -> 3x2
	const wide = new Float64Array([1, 2, 3, 4, 5, 6]);
	assert.deepEqual(
		transposeTypedSeries(wide, 2, 3),
		new Float64Array([1, 4, 2, 5, 3, 6]),
	);

	// 3x2 -> 2x3
	const tall = new Float64Array([1, 4, 2, 5, 3, 6]);
	assert.deepEqual(
		transposeTypedSeries(tall, 3, 2),
		new Float64Array([1, 2, 3, 4, 5, 6]),
	);
});

test('row vector, column vector, and 1x1 matrix', () => {
	const rowVec = new Float64Array([10, 20, 30, 40]);
	assert.deepEqual(transposeTypedSeries(rowVec, 1, 4), new Float64Array([10, 20, 30, 40]));

	const colVec = new Float64Array([-1.5, 0.25, 3.75]);
	assert.deepEqual(transposeTypedSeries(colVec, 3, 1), new Float64Array([-1.5, 0.25, 3.75]));

	const scalar = new Float64Array([42.5]);
	assert.deepEqual(transposeTypedSeries(scalar, 1, 1), new Float64Array([42.5]));
	assert.deepEqual(transposeTypedSeries(scalar), new Float64Array([42.5]));
});

test('immutability: returns a new Float64Array without mutating input', () => {
	const input = new Float64Array([1, 2, 3, 4, 5, 6]);
	const snapshot = new Float64Array(input);
	const out = transposeTypedSeries(input, 2, 3);

	assert.ok(out instanceof Float64Array);
	assert.notEqual(out, input);
	assert.notEqual(out.buffer, input.buffer);
	assert.deepEqual(input, snapshot);

	out[0] = 999;
	assert.equal(input[0], 1);

	// Also verify 1x1 and vector cases return distinct buffers
	const vec = new Float64Array([7, 8, 9]);
	const vecT = transposeTypedSeries(vec, 1, 3);
	assert.notEqual(vecT, vec);
	vecT[1] = -100;
	assert.equal(vec[1], 8);
});

test('special floating-point values: NaN, Infinity, -Infinity, and -0', () => {
	const input = new Float64Array([NaN, Infinity, -Infinity, -0, 0, -1e-300]);
	const out = transposeTypedSeries(input, 2, 3);
	// Expected 3x2: [NaN, -0, Infinity, 0, -Infinity, -1e-300]
	assert.equal(out.length, 6);
	assert.ok(Number.isNaN(out[0]));
	assert.ok(Object.is(out[1], -0));
	assert.equal(out[2], Infinity);
	assert.ok(Object.is(out[3], 0));
	assert.equal(out[4], -Infinity);
	assert.equal(out[5], -1e-300);
});

test('input validation: invalid matrix types', () => {
	for (const bad of [
		null,
		undefined,
		[1, 2, 3, 4],
		new Float32Array([1, 2, 3, 4]),
		new Int32Array([1, 2, 3, 4]),
		'1234',
		42,
		{ length: 4, 0: 1, 1: 2, 2: 3, 3: 4 },
	]) {
		assert.throws(() => transposeTypedSeries(bad, 2, 2), TypeError);
		assert.throws(() => transposeTypedSeries(bad), TypeError);
	}
});

test('input validation: dimensions, non-positive, non-integer, partial, and mismatches', () => {
	const m4 = new Float64Array([1, 2, 3, 4]);
	const m6 = new Float64Array([1, 2, 3, 4, 5, 6]);
	const empty = new Float64Array(0);

	// Empty matrix
	assert.throws(() => transposeTypedSeries(empty), RangeError);
	assert.throws(() => transposeTypedSeries(empty, 0, 0), RangeError);
	assert.throws(() => transposeTypedSeries(empty, 0, 3), RangeError);

	// Non-square length when rows/cols omitted
	assert.throws(() => transposeTypedSeries(m6), RangeError);

	// Only one dimension supplied or non-number dimension
	assert.throws(() => transposeTypedSeries(m4, 2), TypeError);
	assert.throws(() => transposeTypedSeries(m4, undefined, 2), TypeError);
	assert.throws(() => transposeTypedSeries(m4, '2', 2), TypeError);
	assert.throws(() => transposeTypedSeries(m4, 2, null), TypeError);

	// Non-positive or non-integer or non-finite dimensions
	assert.throws(() => transposeTypedSeries(m4, -2, -2), RangeError);
	assert.throws(() => transposeTypedSeries(m4, 0, 4), RangeError);
	assert.throws(() => transposeTypedSeries(m4, 1.5, 2), RangeError);
	assert.throws(() => transposeTypedSeries(m4, NaN, 2), RangeError);
	assert.throws(() => transposeTypedSeries(m4, Infinity, 2), RangeError);
	assert.throws(() => transposeTypedSeries(m4, Number.MAX_SAFE_INTEGER + 1, 1), RangeError);

	// Dimension mismatch
	assert.throws(() => transposeTypedSeries(m6, 2, 2), RangeError);
	assert.throws(() => transposeTypedSeries(m6, 3, 3), RangeError);
});

test('algebraic cross-check: involution (A^T)^T === A across shapes', () => {
	const shapes = [
		[1, 1],
		[1, 7],
		[7, 1],
		[4, 4],
		[3, 5],
		[5, 3],
		[11, 17],
	];

	for (const [rows, cols] of shapes) {
		const a = new Float64Array(rows * cols);
		for (let i = 0; i < a.length; i++) {
			a[i] = Math.sin(i * 1.37 + 0.5) * 100;
		}
		const aT = transposeTypedSeries(a, rows, cols);
		const aTT = transposeTypedSeries(aT, cols, rows);
		assert.deepEqual(aTT, a);
	}
});

test('algebraic cross-check: Frobenius norm preservation and linearity (aA + bB)^T = aA^T + bB^T', () => {
	const rows = 4;
	const cols = 6;
	const n = rows * cols;
	const A = new Float64Array(n);
	const B = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		A[i] = (i + 1) * 0.75 - 8.25;
		B[i] = Math.cos(i * 0.9) * 5.0;
	}

	const AT = transposeTypedSeries(A, rows, cols);
	const BT = transposeTypedSeries(B, rows, cols);

	// Frobenius norm preservation: ||A||_F === ||A^T||_F
	const frobeniusSq = (arr) => arr.reduce((acc, v) => acc + v * v, 0);
	const normA = Math.sqrt(frobeniusSq(A));
	const normAT = Math.sqrt(frobeniusSq(AT));
	assert.ok(Math.abs(normA - normAT) <= 1e-12 * normA);

	// Linearity: (alpha*A + beta*B)^T = alpha*A^T + beta*B^T
	const alpha = 2.5;
	const beta = -1.75;
	const combo = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		combo[i] = alpha * A[i] + beta * B[i];
	}
	const lhs = transposeTypedSeries(combo, rows, cols);
	for (let i = 0; i < n; i++) {
		const rhs = alpha * AT[i] + beta * BT[i];
		assert.ok(Math.abs(lhs[i] - rhs) <= 1e-12);
	}

	// Adjointness identity: <A x, y> === <x, A^T y>
	const x = new Float64Array(cols);
	const y = new Float64Array(rows);
	for (let c = 0; c < cols; c++) x[c] = (c + 1) * 0.5;
	for (let r = 0; r < rows; r++) y[r] = (r - 1.5) * 1.25;

	let axDotY = 0;
	for (let r = 0; r < rows; r++) {
		let sum = 0;
		for (let c = 0; c < cols; c++) sum += A[r * cols + c] * x[c];
		axDotY += sum * y[r];
	}

	let xDotATy = 0;
	for (let c = 0; c < cols; c++) {
		let sum = 0;
		for (let r = 0; r < rows; r++) sum += AT[c * rows + r] * y[r];
		xDotATy += x[c] * sum;
	}
	assert.ok(Math.abs(axDotY - xDotATy) <= 1e-11);
});
