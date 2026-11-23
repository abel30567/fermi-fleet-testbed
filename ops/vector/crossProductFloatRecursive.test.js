import test from 'node:test';
import assert from 'node:assert/strict';
import { crossProductFloatRecursive } from './crossProductFloatRecursive.js';

function dot(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
}

function normSq(u) {
	return dot(u, u);
}

function addVec(u, v) {
	return [u[0] + v[0], u[1] + v[1], u[2] + v[2]];
}

function scaleVec(s, u) {
	return [s * u[0], s * u[1], s * u[2]];
}

function assertClose(actual, expected, tol = 1e-10) {
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`expected ${actual} to be within ${tol * scale} of ${expected}`
	);
}

function assertVecClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assertClose(actual[i], expected[i], tol);
	}
}

test('standard basis vectors obey the right-hand rule', () => {
	const i = [1, 0, 0];
	const j = [0, 1, 0];
	const k = [0, 0, 1];

	assert.deepStrictEqual(crossProductFloatRecursive(i, j), k);
	assert.deepStrictEqual(crossProductFloatRecursive(j, k), i);
	assert.deepStrictEqual(crossProductFloatRecursive(k, i), j);

	assert.deepStrictEqual(crossProductFloatRecursive(j, i), [0, 0, -1]);
	assert.deepStrictEqual(crossProductFloatRecursive(k, j), [-1, 0, 0]);
	assert.deepStrictEqual(crossProductFloatRecursive(i, k), [0, -1, 0]);
});

test('computes exact cross products for integer and fractional float64 vectors', () => {
	assert.deepStrictEqual(crossProductFloatRecursive([1, 2, 3], [4, 5, 6]), [-3, 6, -3]);
	assert.deepStrictEqual(crossProductFloatRecursive([3, -3, 1], [4, 9, 2]), [-15, -2, 39]);
	assertVecClose(
		crossProductFloatRecursive([0.5, -1.25, 2.5], [-3.0, 0.25, 1.5]),
		[-2.5, -8.25, -3.625],
		1e-12
	);
});

test('handles edge cases: zero, parallel, anti-parallel, negative zero, and immutability', () => {
	const zero = [0, 0, 0];
	const v = [2.5, -4.125, 7.75];
	const vCopy = [...v];

	assert.deepStrictEqual(crossProductFloatRecursive(zero, zero), [0, 0, 0]);
	assert.deepStrictEqual(crossProductFloatRecursive(zero, v), [0, 0, 0]);
	assert.deepStrictEqual(crossProductFloatRecursive(v, zero), [0, 0, 0]);
	assert.deepStrictEqual(crossProductFloatRecursive(v, v), [0, 0, 0]);
	assert.deepStrictEqual(crossProductFloatRecursive(v, scaleVec(-2, v)), [0, 0, 0]);

	// Negative zero inputs produce canonical +0 components (no -0).
	const res = crossProductFloatRecursive([-0, 1, -0], [0, -0, 1]);
	assert.deepStrictEqual(res, [1, 0, 0]);
	assert.ok(Object.is(res[1], 0));
	assert.ok(Object.is(res[2], 0));

	// Inputs must not be mutated.
	assert.deepStrictEqual(v, vCopy);
});

test('handles very small and very large float64 magnitudes', () => {
	assert.deepStrictEqual(
		crossProductFloatRecursive([2 ** -500, 0, 0], [0, 2 ** -500, 0]),
		[0, 0, 2 ** -1000]
	);
	assert.deepStrictEqual(
		crossProductFloatRecursive([2 ** 500, 0, 0], [0, 2 ** 500, 0]),
		[0, 0, 2 ** 1000]
	);
	assertVecClose(
		crossProductFloatRecursive([1e150, 0, 0], [0, 1e150, 0]),
		[0, 0, 1e300],
		1e-12
	);
	// IEEE-754 overflow behavior when intermediate products exceed Number.MAX_VALUE.
	assert.deepStrictEqual(
		crossProductFloatRecursive([1e200, 0, 0], [0, 1e200, 0]),
		[0, 0, Infinity]
	);
});

test('validates input types, dimensions, and finiteness', () => {
	// Non-array inputs -> TypeError
	assert.throws(() => crossProductFloatRecursive(null, [1, 2, 3]), TypeError);
	assert.throws(() => crossProductFloatRecursive([1, 2, 3], undefined), TypeError);
	assert.throws(() => crossProductFloatRecursive('123', [1, 2, 3]), TypeError);
	assert.throws(() => crossProductFloatRecursive({ 0: 1, 1: 2, 2: 3 }, [1, 2, 3]), TypeError);

	// Wrong length -> RangeError
	assert.throws(() => crossProductFloatRecursive([], [1, 2, 3]), RangeError);
	assert.throws(() => crossProductFloatRecursive([1, 2], [1, 2, 3]), RangeError);
	assert.throws(() => crossProductFloatRecursive([1, 2, 3], [1, 2, 3, 4]), RangeError);

	// Non-number elements -> TypeError
	assert.throws(() => crossProductFloatRecursive(['1', 2, 3], [1, 2, 3]), TypeError);
	assert.throws(() => crossProductFloatRecursive([1, 2, 3], [1, null, 3]), TypeError);
	assert.throws(() => crossProductFloatRecursive([1, 2, undefined], [1, 2, 3]), TypeError);
	assert.throws(() => crossProductFloatRecursive([1n, 2, 3], [1, 2, 3]), TypeError);

	// Non-finite numbers -> RangeError
	assert.throws(() => crossProductFloatRecursive([NaN, 0, 0], [1, 2, 3]), RangeError);
	assert.throws(() => crossProductFloatRecursive([1, 2, 3], [0, Infinity, 0]), RangeError);
	assert.throws(() => crossProductFloatRecursive([1, 2, 3], [0, 0, -Infinity]), RangeError);
});

test('independent cross-checks: orthogonality, anti-commutativity, Lagrange, Jacobi, bilinearity', () => {
	const vectors = [
		[1.2, -3.4, 5.6],
		[-7.8, 9.1, -2.3],
		[0.125, 4.75, -6.5],
		[-0.333, -0.667, 1.4142135623730951],
		[Math.PI, -Math.E, Math.SQRT2],
	];

	for (let i = 0; i < vectors.length; i++) {
		for (let j = 0; j < vectors.length; j++) {
			const a = vectors[i];
			const b = vectors[j];
			const c = crossProductFloatRecursive(a, b);
			const ba = crossProductFloatRecursive(b, a);

			// Orthogonality: a · (a × b) = 0 and b · (a × b) = 0
			assertClose(dot(a, c), 0, 1e-11);
			assertClose(dot(b, c), 0, 1e-11);

			// Anti-commutativity: a × b = -(b × a)
			assertVecClose(c, scaleVec(-1, ba), 1e-12);

			// Lagrange's identity: |a × b|^2 + (a · b)^2 = |a|^2 |b|^2
			const lhs = normSq(c) + dot(a, b) ** 2;
			const rhs = normSq(a) * normSq(b);
			assertClose(lhs, rhs, 1e-11);
		}
	}

	// Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0
	const [a, b, c] = vectors;
	const j1 = crossProductFloatRecursive(a, crossProductFloatRecursive(b, c));
	const j2 = crossProductFloatRecursive(b, crossProductFloatRecursive(c, a));
	const j3 = crossProductFloatRecursive(c, crossProductFloatRecursive(a, b));
	assertVecClose(addVec(addVec(j1, j2), j3), [0, 0, 0], 1e-10);

	// Bilinearity: a × (b + c) = (a × b) + (a × c) and (s * a) × b = s * (a × b)
	assertVecClose(
		crossProductFloatRecursive(a, addVec(b, c)),
		addVec(crossProductFloatRecursive(a, b), crossProductFloatRecursive(a, c)),
		1e-11
	);
	const scalar = -2.75;
	assertVecClose(
		crossProductFloatRecursive(scaleVec(scalar, a), b),
		scaleVec(scalar, crossProductFloatRecursive(a, b)),
		1e-11
	);
});
