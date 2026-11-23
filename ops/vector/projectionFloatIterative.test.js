import test from 'node:test';
import assert from 'node:assert/strict';
import { projectionFloatIterative } from './projectionFloatIterative.js';

/**
 * Asserts two numeric vectors are element-wise close within `tol`.
 * @param {number[]} actual
 * @param {number[]} expected
 * @param {number} [tol=1e-12]
 */
function assertVectorClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} !== ${expected.length}`);
	for (let i = 0; i < actual.length; i++) {
		const diff = Math.abs(actual[i] - expected[i]);
		const scale = Math.max(1, Math.abs(expected[i]));
		assert.ok(
			diff <= tol * scale,
			`index ${i}: expected ${expected[i]} (±${tol * scale}), got ${actual[i]} (diff=${diff})`
		);
	}
}

/**
 * Independent reference using BigInt exact rational arithmetic for integer vectors.
 * Returns IEEE-754 float64 approximations of exact rational components.
 * @param {number[]} a - Integer vector
 * @param {number[]} b - Non-zero integer vector
 * @returns {number[]}
 */
function exactRationalProjection(a, b) {
	let dotAB = 0n;
	let dotBB = 0n;
	for (let i = 0; i < a.length; i++) {
		const ai = BigInt(a[i]);
		const bi = BigInt(b[i]);
		dotAB += ai * bi;
		dotBB += bi * bi;
	}
	return b.map((bi) => {
		const num = dotAB * BigInt(bi);
		const val = Number(num) / Number(dotBB);
		return val === 0 ? 0 : val;
	});
}

/**
 * Independent reference using normalized unit vector via Math.hypot:
 *   u = b / ||b||, proj_b(a) = (a · u) * u
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function unitVectorProjection(a, b) {
	const normB = Math.hypot(...b);
	const u = b.map((x) => x / normB);
	const coeff = a.reduce((acc, ai, idx) => acc + ai * u[idx], 0);
	return u.map((ui) => {
		const v = coeff * ui;
		return v === 0 ? 0 : v;
	});
}

test('normal cases: 1D, 2D, 3D, and negative components', () => {
	assertVectorClose(projectionFloatIterative([5], [2]), [5]);
	assertVectorClose(projectionFloatIterative([-3], [4]), [-3]);
	assertVectorClose(projectionFloatIterative([3, 4], [1, 0]), [3, 0]);
	assertVectorClose(projectionFloatIterative([1, 2], [3, 4]), [1.32, 1.76]);
	assertVectorClose(
		projectionFloatIterative([1, 2, 3], [4, 5, 6]),
		[(32 * 4) / 77, (32 * 5) / 77, (32 * 6) / 77]
	);
	assertVectorClose(
		projectionFloatIterative([-2, 3, -4], [1, -1, 2]),
		[(-13 * 1) / 6, (-13 * -1) / 6, (-13 * 2) / 6]
	);
});

test('edge cases: orthogonal, parallel, anti-parallel, self, and zero a vector', () => {
	// Orthogonal vectors -> exact +0 vector (no -0)
	const ortho = projectionFloatIterative([1, 0], [0, -5]);
	assert.deepStrictEqual(ortho, [0, 0]);
	assert.ok(Object.is(ortho[0], 0));
	assert.ok(Object.is(ortho[1], 0));

	// Zero vector a onto signed vector b -> exact +0 vector (no -0)
	const zeroA = projectionFloatIterative([0, 0, 0], [-2, 3, -4]);
	assert.deepStrictEqual(zeroA, [0, 0, 0]);
	for (const x of zeroA) {
		assert.ok(Object.is(x, 0));
	}

	// Self projection: proj_v(v) = v
	const v = [2.5, -7.25, 0.5, 11.125];
	assertVectorClose(projectionFloatIterative(v, v), v);

	// Parallel and anti-parallel
	const b = [1.5, -2.5, 4.0];
	const parallel = b.map((x) => 3.5 * x);
	const antiParallel = b.map((x) => -2.25 * x);
	assertVectorClose(projectionFloatIterative(parallel, b), parallel);
	assertVectorClose(projectionFloatIterative(antiParallel, b), antiParallel);
});

test('does not mutate input arrays', () => {
	const a = [3, -1, 4];
	const b = [1, 5, -9];
	const aCopy = [...a];
	const bCopy = [...b];

	const res = projectionFloatIterative(a, b);
	assert.deepStrictEqual(a, aCopy);
	assert.deepStrictEqual(b, bCopy);
	assert.notEqual(res, a);
	assert.notEqual(res, b);
});

test('algebraic properties: idempotence, scale invariance, orthogonality of residual, Pythagorean theorem, linearity', () => {
	const a1 = [2.3, -4.7, 1.1, 8.9, -0.4];
	const a2 = [-1.2, 5.6, 3.3, -2.1, 7.5];
	const b = [0.8, -1.6, 2.4, 0.5, -3.2];

	const p = projectionFloatIterative(a1, b);

	// Idempotence: proj_b(proj_b(a)) = proj_b(a)
	assertVectorClose(projectionFloatIterative(p, b), p);

	// Scale invariance in b: proj_{c*b}(a) = proj_b(a) for c != 0
	for (const c of [7.5, -0.25, 1e-4, -1e4]) {
		const cb = b.map((x) => c * x);
		assertVectorClose(projectionFloatIterative(a1, cb), p);
	}

	// Residual (a - p) is orthogonal to b
	const residualDotB = a1.reduce((acc, ai, i) => acc + (ai - p[i]) * b[i], 0);
	assert.ok(Math.abs(residualDotB) < 1e-12, `residualDotB=${residualDotB}`);

	// Pythagorean theorem: ||a||^2 = ||p||^2 + ||a - p||^2
	const normA2 = a1.reduce((acc, x) => acc + x * x, 0);
	const normP2 = p.reduce((acc, x) => acc + x * x, 0);
	const normR2 = a1.reduce((acc, ai, i) => acc + (ai - p[i]) ** 2, 0);
	assert.ok(Math.abs(normA2 - (normP2 + normR2)) < 1e-11);

	// Linearity in first argument: proj_b(alpha*a1 + beta*a2) = alpha*proj_b(a1) + beta*proj_b(a2)
	const alpha = -3.25;
	const beta = 1.75;
	const combined = a1.map((x, i) => alpha * x + beta * a2[i]);
	const p1 = projectionFloatIterative(a1, b);
	const p2 = projectionFloatIterative(a2, b);
	const expectedLinear = p1.map((x, i) => alpha * x + beta * p2[i]);
	assertVectorClose(projectionFloatIterative(combined, b), expectedLinear);
});

test('independent cross-check against BigInt exact rational arithmetic', () => {
	// Deterministic LCG for reproducible integer test vectors across dimensions 1..30
	let seed = 123456789;
	const nextInt = () => {
		seed = (1103515245 * seed + 12345) & 0x7fffffff;
		return (seed % 201) - 100; // [-100, 100]
	};

	for (let dim = 1; dim <= 30; dim++) {
		const a = Array.from({ length: dim }, nextInt);
		const b = Array.from({ length: dim }, nextInt);
		if (b.every((x) => x === 0)) {
			b[0] = 1;
		}
		const actual = projectionFloatIterative(a, b);
		const expected = exactRationalProjection(a, b);
		assertVectorClose(actual, expected, 1e-12);
	}
});

test('independent cross-check against unit-vector Math.hypot formula', () => {
	const cases = [
		[
			[0.123456, -9.876543, 3.1415926, 2.7182818],
			[-1.4142135, 1.7320508, -2.2360679, 0.5772156],
		],
		[
			Array.from({ length: 64 }, (_, i) => Math.sin(i + 1) * 10),
			Array.from({ length: 64 }, (_, i) => Math.cos(2 * i + 0.5) * 5),
		],
		[
			[1e-6, -2e-6, 3e-6],
			[4e-6, 5e-6, -6e-6],
		],
	];

	for (const [a, b] of cases) {
		assertVectorClose(projectionFloatIterative(a, b), unitVectorProjection(a, b), 1e-12);
	}
});

test('input validation: throws TypeError for non-arrays and non-number elements', () => {
	for (const bad of [null, undefined, 42, '123', {}, new Float64Array([1, 2])]) {
		assert.throws(() => projectionFloatIterative(bad, [1, 2]), TypeError);
		assert.throws(() => projectionFloatIterative([1, 2], bad), TypeError);
	}

	assert.throws(() => projectionFloatIterative([1, '2'], [1, 2]), TypeError);
	assert.throws(() => projectionFloatIterative([1, 2], [1, null]), TypeError);
	assert.throws(() => projectionFloatIterative([1, undefined], [1, 2]), TypeError);
	assert.throws(() => projectionFloatIterative([1, 2], [1, true]), TypeError);

	// Sparse array hole
	// eslint-disable-next-line no-sparse-arrays
	const sparse = [1, , 3];
	assert.throws(() => projectionFloatIterative(sparse, [1, 2, 3]), TypeError);
	assert.throws(() => projectionFloatIterative([1, 2, 3], sparse), TypeError);
});

test('input validation: throws RangeError for empty, mismatched, non-finite, zero b, overflow/underflow', () => {
	// Empty vectors
	assert.throws(() => projectionFloatIterative([], []), RangeError);
	assert.throws(() => projectionFloatIterative([], [1]), RangeError);
	assert.throws(() => projectionFloatIterative([1], []), RangeError);

	// Mismatched lengths
	assert.throws(() => projectionFloatIterative([1, 2], [1, 2, 3]), RangeError);
	assert.throws(() => projectionFloatIterative([1, 2, 3], [1]), RangeError);

	// Non-finite elements
	for (const bad of [NaN, Infinity, -Infinity]) {
		assert.throws(() => projectionFloatIterative([bad, 1], [1, 2]), RangeError);
		assert.throws(() => projectionFloatIterative([1, 2], [1, bad]), RangeError);
	}

	// Zero vector b
	assert.throws(() => projectionFloatIterative([1], [0]), RangeError);
	assert.throws(() => projectionFloatIterative([1, 2, 3], [0, -0, 0]), RangeError);

	// Overflow in dot product
	assert.throws(() => projectionFloatIterative([1e200, 1e200], [1e200, 1e200]), RangeError);
	assert.throws(() => projectionFloatIterative([1e308, 1], [1e10, 1]), RangeError);

	// Underflow of b · b to zero
	assert.throws(() => projectionFloatIterative([1, 2], [1e-200, 1e-200]), RangeError);
});
