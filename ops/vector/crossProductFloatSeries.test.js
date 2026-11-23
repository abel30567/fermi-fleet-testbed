import test from 'node:test';
import assert from 'node:assert/strict';
import { crossProductFloatSeries } from './crossProductFloatSeries.js';

function dot(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
}

function normSq(u) {
	return dot(u, u);
}

function vecAdd(u, v) {
	return [u[0] + v[0], u[1] + v[1], u[2] + v[2]];
}

function vecScale(s, u) {
	return [s * u[0], s * u[1], s * u[2]];
}

function assertVecClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, 3);
	for (let i = 0; i < 3; i += 1) {
		const diff = Math.abs(actual[i] - expected[i]);
		const scale = Math.max(1, Math.abs(expected[i]));
		assert.ok(
			diff <= tol * scale,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`
		);
	}
}

test('standard basis vectors obey right-hand rule', () => {
	const i = [1, 0, 0];
	const j = [0, 1, 0];
	const k = [0, 0, 1];

	assert.deepEqual(crossProductFloatSeries(i, j), k);
	assert.deepEqual(crossProductFloatSeries(j, k), i);
	assert.deepEqual(crossProductFloatSeries(k, i), j);

	assert.deepEqual(crossProductFloatSeries(j, i), [0, 0, -1]);
	assert.deepEqual(crossProductFloatSeries(k, j), [-1, 0, 0]);
	assert.deepEqual(crossProductFloatSeries(i, k), [0, -1, 0]);
});

test('general integer and floating-point vectors', () => {
	assert.deepEqual(crossProductFloatSeries([2, 3, 4], [5, 6, 7]), [-3, 6, -3]);
	assert.deepEqual(crossProductFloatSeries([1, -2, 3], [-4, 5, -6]), [-3, -6, -3]);
	assertVecClose(
		crossProductFloatSeries([1.5, -2.25, 0.75], [-3.5, 4.125, -2.5]),
		[2.53125, 1.125, -1.6875],
		1e-15
	);
});

test('zero, parallel, and anti-parallel vectors yield [0, 0, 0] without negative zero', () => {
	const zero = [0, 0, 0];
	const v = [3.5, -7.25, 11.125];

	for (const res of [
		crossProductFloatSeries(zero, v),
		crossProductFloatSeries(v, zero),
		crossProductFloatSeries(zero, zero),
		crossProductFloatSeries(v, v),
		crossProductFloatSeries(v, vecScale(2.5, v)),
		crossProductFloatSeries(v, vecScale(-3, v)),
	]) {
		assert.deepEqual(res, [0, 0, 0]);
		for (const c of res) {
			assert.equal(Object.is(c, -0), false);
		}
	}
});

test('compensated arithmetic avoids catastrophic cancellation on nearly parallel vectors', () => {
	// With naive float64: (1 + 2^-27) * (1 + 2^-26) - (1 + 2^-26) * (1 + 2^-27) vs slight perturbation
	const a = [1, 1 + 2 ** -27, 0];
	const b = [1 + 2 ** -26, (1 + 2 ** -27) * (1 + 2 ** -26) + 2 ** -52, 0];
	// Exact z component is 1 * ((1+2^-27)(1+2^-26) + 2^-52) - (1+2^-27)*(1+2^-26)
	// Note (1+2^-27)*(1+2^-26) = 1 + 2^-26 + 2^-27 + 2^-53, which rounds in float64.
	// Use exact representable operands where a0*b1 and a1*b0 agree in top 52 bits:
	const u = [1 + 2 ** -27, 1 + 2 ** -26, 0];
	const v = [1 + 2 ** -26, 1 + 2 ** -25, 0];
	// Exact det = (1 + 2^-27)(1 + 2^-25) - (1 + 2^-26)^2
	//           = (1 + 2^-25 + 2^-27 + 2^-52) - (1 + 2^-25 + 2^-52)
	//           = 2^-27
	const exactZ = 2 ** -27;
	const res = crossProductFloatSeries(u, v);
	assert.equal(res[0], 0);
	assert.equal(res[1], 0);
	assert.equal(res[2], exactZ);

	// Even tighter cancellation: difference solely in the 2^-53 term
	const u2 = [1 + 2 ** -26, 1 + 2 ** -27, 0];
	const v2 = [1 + 2 ** -27, 1 + 2 ** -26, 0];
	// Exact det = (1 + 2^-26)^2 - (1 + 2^-27)^2
	//           = (2^-25 + 2^-52) - (2^-26 + 2^-54)
	//           = 2^-26 + 3 * 2^-54
	const res2 = crossProductFloatSeries(u2, v2);
	const expected2 = 2 ** -26 + 3 * 2 ** -54;
	assert.ok(Math.abs(res2[2] - expected2) <= 2 ** -53 * expected2);

	// Keep unused variable warning-free check for a, b orthogonality
	const ab = crossProductFloatSeries(a, b);
	assert.equal(ab[0], 0);
	assert.equal(ab[1], 0);
	assert.ok(ab[2] > 0);
});

test('large parallel vectors avoid spurious NaN from intermediate overflow', () => {
	const big = [1e200, -2e200, 3e200];
	const res = crossProductFloatSeries(big, big);
	assert.deepEqual(res, [0, 0, 0]);
});

test('independent cross-checks: orthogonality, anti-commutativity, bilinearity, Lagrange, and Jacobi identities', () => {
	const vectors = [
		[1.23, -4.56, 7.89],
		[-0.125, 3.75, -2.5],
		[9.5, 0.25, -6.125],
		[-5.4, -3.2, 1.8],
		[0.001, -1000.5, 42.125],
	];

	for (let i = 0; i < vectors.length; i += 1) {
		for (let j = 0; j < vectors.length; j += 1) {
			const a = vectors[i];
			const b = vectors[j];
			const axb = crossProductFloatSeries(a, b);
			const bxa = crossProductFloatSeries(b, a);

			// 1. Orthogonality: (a × b) · a = 0 and (a × b) · b = 0
			const scaleA = Math.sqrt(normSq(axb) * normSq(a));
			const scaleB = Math.sqrt(normSq(axb) * normSq(b));
			assert.ok(Math.abs(dot(axb, a)) <= 1e-13 * Math.max(1, scaleA));
			assert.ok(Math.abs(dot(axb, b)) <= 1e-13 * Math.max(1, scaleB));

			// 2. Anti-commutativity: a × b = -(b × a)
			assertVecClose(axb, vecScale(-1, bxa), 1e-15);

			// 3. Lagrange's identity: ||a × b||^2 = ||a||^2 ||b||^2 - (a · b)^2
			const lhs = normSq(axb);
			const rhs = normSq(a) * normSq(b) - dot(a, b) ** 2;
			assert.ok(
				Math.abs(lhs - rhs) <= 1e-12 * Math.max(1, normSq(a) * normSq(b)),
				`Lagrange failed: lhs=${lhs}, rhs=${rhs}`
			);
		}
	}

	// 4. Bilinearity: (s*a + t*b) × c = s*(a × c) + t*(b × c)
	const a = vectors[0];
	const b = vectors[1];
	const c = vectors[2];
	const s = 2.75;
	const t = -1.5;
	const leftBilin = crossProductFloatSeries(vecAdd(vecScale(s, a), vecScale(t, b)), c);
	const rightBilin = vecAdd(
		vecScale(s, crossProductFloatSeries(a, c)),
		vecScale(t, crossProductFloatSeries(b, c))
	);
	assertVecClose(leftBilin, rightBilin, 1e-13);

	// 5. Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = [0, 0, 0]
	const t1 = crossProductFloatSeries(a, crossProductFloatSeries(b, c));
	const t2 = crossProductFloatSeries(b, crossProductFloatSeries(c, a));
	const t3 = crossProductFloatSeries(c, crossProductFloatSeries(a, b));
	const jacobi = vecAdd(vecAdd(t1, t2), t3);
	const magScale = Math.sqrt(normSq(a) * normSq(b) * normSq(c));
	assertVecClose(jacobi, [0, 0, 0], 1e-13 * magScale);

	// 6. BAC-CAB vector triple product identity: a × (b × c) = b(a·c) - c(a·b)
	const bacCab = vecAdd(vecScale(dot(a, c), b), vecScale(-dot(a, b), c));
	assertVecClose(t1, bacCab, 1e-13);
});

test('input validation rejects invalid types, wrong lengths, and non-finite elements', () => {
	const valid = [1, 2, 3];

	// Non-array inputs
	for (const bad of [null, undefined, 42, '123', { 0: 1, 1: 2, 2: 3 }, new Float64Array([1, 2, 3])]) {
		assert.throws(() => crossProductFloatSeries(bad, valid), TypeError);
		assert.throws(() => crossProductFloatSeries(valid, bad), TypeError);
	}

	// Wrong lengths
	for (const bad of [[], [1], [1, 2], [1, 2, 3, 4]]) {
		assert.throws(() => crossProductFloatSeries(bad, valid), RangeError);
		assert.throws(() => crossProductFloatSeries(valid, bad), RangeError);
	}

	// Non-number elements and sparse arrays
	const sparse = new Array(3);
	sparse[0] = 1;
	sparse[2] = 3;
	for (const bad of [['1', 2, 3], [1, null, 3], [1, 2, undefined], [1, 2n, 3], sparse]) {
		assert.throws(() => crossProductFloatSeries(bad, valid), TypeError);
		assert.throws(() => crossProductFloatSeries(valid, bad), TypeError);
	}

	// Non-finite numbers
	for (const bad of [[NaN, 2, 3], [1, Infinity, 3], [1, 2, -Infinity]]) {
		assert.throws(() => crossProductFloatSeries(bad, valid), RangeError);
		assert.throws(() => crossProductFloatSeries(valid, bad), RangeError);
	}
});
