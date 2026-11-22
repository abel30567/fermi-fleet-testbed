import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductComplexIterative } from './tensorProductComplexIterative.js';

const c = (re, im = 0) => ({ re, im });

/**
 * Independent recursive reference implementation of complex tensor product
 * used to cross-check the iterative implementation.
 */
function tensorProductRecursiveRef(a, b) {
	if (Array.isArray(a)) {
		return a.map((elem) => tensorProductRecursiveRef(elem, b));
	}
	if (Array.isArray(b)) {
		return b.map((elem) => tensorProductRecursiveRef(a, elem));
	}
	const re = a.re * b.re - a.im * b.im;
	const im = a.re * b.im + a.im * b.re;
	return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im };
}

function assertComplexTensorApproxEqual(actual, expected, eps = 1e-12) {
	if (Array.isArray(expected)) {
		assert.ok(Array.isArray(actual), 'Expected an array');
		assert.equal(actual.length, expected.length);
		for (let i = 0; i < expected.length; i++) {
			assertComplexTensorApproxEqual(actual[i], expected[i], eps);
		}
		return;
	}
	assert.ok(!Array.isArray(actual), 'Expected a complex scalar');
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Real part mismatch: ${actual.re} vs ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Imaginary part mismatch: ${actual.im} vs ${expected.im}`
	);
}

function addTensors(x, y) {
	if (Array.isArray(x)) {
		return x.map((xi, idx) => addTensors(xi, y[idx]));
	}
	return c(x.re + y.re, x.im + y.im);
}

function conjTensor(x) {
	if (Array.isArray(x)) {
		return x.map(conjTensor);
	}
	return { re: x.re, im: x.im === 0 ? 0 : -x.im };
}

function flattenLeafEntries(x) {
	if (Array.isArray(x)) {
		return x.flatMap(flattenLeafEntries);
	}
	return [x];
}

function frobeniusNorm(x) {
	const leaves = flattenLeafEntries(x);
	let sumSq = 0;
	for (const z of leaves) {
		sumSq += z.re * z.re + z.im * z.im;
	}
	return Math.sqrt(sumSq);
}

function sumEntries(x) {
	const leaves = flattenLeafEntries(x);
	let re = 0;
	let im = 0;
	for (const z of leaves) {
		re += z.re;
		im += z.im;
	}
	return { re, im };
}

test('0D complex scalars (scalar × scalar)', () => {
	assert.deepStrictEqual(tensorProductComplexIterative(c(1, 2), c(3, 4)), c(-5, 10));
	assert.deepStrictEqual(tensorProductComplexIterative(c(0, 1), c(0, 1)), c(-1, 0));
	assert.deepStrictEqual(tensorProductComplexIterative(c(2, -3), c(2, 3)), c(13, 0));
	assert.deepStrictEqual(tensorProductComplexIterative(c(0, 0), c(5, -7)), c(0, 0));
});

test('scalar × 1D vector and 1D vector × scalar', () => {
	const scalar = c(0, 2); // 2i
	const vec = [c(1, 0), c(0, 1), c(3, -4)];

	assert.deepStrictEqual(tensorProductComplexIterative(scalar, vec), [
		c(0, 2),
		c(-2, 0),
		c(8, 6),
	]);
	assert.deepStrictEqual(tensorProductComplexIterative(vec, scalar), [
		c(0, 2),
		c(-2, 0),
		c(8, 6),
	]);
});

test('1D × 1D vector outer product produces 2D matrix', () => {
	const u = [c(1, 1), c(0, -2)];
	const v = [c(2, 0), c(1, -1), c(0, 3)];

	const expected = [
		[c(2, 2), c(2, 0), c(-3, 3)],
		[c(0, -4), c(-2, -2), c(6, 0)],
	];

	assert.deepStrictEqual(tensorProductComplexIterative(u, v), expected);
});

test('2D × 1D and 1D × 2D produce 3D tensors with exact index ordering', () => {
	const mat = [
		[c(1, 0), c(0, 1)],
		[c(2, -1), c(-1, 2)],
	];
	const vec = [c(1, 1), c(0, -1)];

	const res21 = tensorProductComplexIterative(mat, vec);
	assert.equal(res21.length, 2);
	assert.equal(res21[0].length, 2);
	assert.equal(res21[0][0].length, 2);
	assert.deepStrictEqual(res21[1][0][1], c(-1, -2)); // (2 - i) * (-i) = -2i + i^2 = -1 - 2i

	const res12 = tensorProductComplexIterative(vec, mat);
	assert.equal(res12.length, 2);
	assert.equal(res12[0].length, 2);
	assert.equal(res12[0][0].length, 2);
	assert.deepStrictEqual(res12[1][1][0], c(-1, -2)); // (-i) * (2 - i) = -1 - 2i
});

test('2D × 2D matrices produce 4D tensor of shape (m, n, p, q)', () => {
	const a = [
		[c(1, 2), c(3, 0)],
		[c(0, -1), c(2, 1)],
	];
	const b = [[c(0, 1), c(1, -1), c(2, 0)]];

	const result = tensorProductComplexIterative(a, b);
	assert.equal(result.length, 2);
	assert.equal(result[0].length, 2);
	assert.equal(result[0][0].length, 1);
	assert.equal(result[0][0][0].length, 3);

	// Check specific entries directly
	// a[0][0] * b[0][1] = (1 + 2i)(1 - i) = 3 + i
	assert.deepStrictEqual(result[0][0][0][1], c(3, 1));
	// a[1][1] * b[0][0] = (2 + i)(i) = -1 + 2i
	assert.deepStrictEqual(result[1][1][0][0], c(-1, 2));
});

test('empty tensor edge cases preserve outer dimensions without aliased arrays', () => {
	const vec = [c(1, 2), c(3, 4)];

	assert.deepStrictEqual(tensorProductComplexIterative([], vec), []);
	assert.deepStrictEqual(tensorProductComplexIterative([], []), []);
	assert.deepStrictEqual(tensorProductComplexIterative(c(1, 0), []), []);
	assert.deepStrictEqual(tensorProductComplexIterative([], c(1, 0)), []);

	const vecTimesEmpty = tensorProductComplexIterative(vec, []);
	assert.deepStrictEqual(vecTimesEmpty, [[], []]);
	assert.notEqual(vecTimesEmpty[0], vecTimesEmpty[1], 'Inner empty arrays must be distinct');

	const matTimesEmpty = tensorProductComplexIterative([[c(1, 0), c(2, 0)]], []);
	assert.deepStrictEqual(matTimesEmpty, [[[], []]]);
	assert.notEqual(matTimesEmpty[0][0], matTimesEmpty[0][1]);

	const empty2DTimesVec = tensorProductComplexIterative([[], []], vec);
	assert.deepStrictEqual(empty2DTimesVec, [[], []]);
	assert.notEqual(empty2DTimesVec[0], empty2DTimesVec[1]);
});

test('negative zero normalization and input immutability', () => {
	const a = [c(-0, 0), c(0, -1)];
	const b = [c(0, -0), c(-1, 0)];
	const snapshotA = structuredClone(a);
	const snapshotB = structuredClone(b);

	const res = tensorProductComplexIterative(a, b);

	assert.ok(Object.is(res[0][0].re, 0));
	assert.ok(Object.is(res[0][0].im, 0));
	assert.ok(Object.is(res[1][1].re, 0));
	assert.equal(res[1][1].im, 1);

	assert.deepStrictEqual(a, snapshotA);
	assert.deepStrictEqual(b, snapshotB);

	// Mutating output must not affect inputs
	res[0][0].re = 999;
	assert.ok(Object.is(a[0].re, -0));
	assert.ok(Object.is(b[0].re, 0));
});

test('input validation throws TypeError on invalid types, mixed depths, and sparse arrays', () => {
	const valid = [c(1, 0)];

	for (const bad of [null, undefined, 42, '1+2i', true, {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }]) {
		assert.throws(() => tensorProductComplexIterative(bad, valid), TypeError);
		assert.throws(() => tensorProductComplexIterative(valid, bad), TypeError);
	}

	// Both operands validated even when first is empty
	assert.throws(() => tensorProductComplexIterative([], null), TypeError);
	assert.throws(() => tensorProductComplexIterative([], [{}]), TypeError);

	// Mixed nesting depths
	assert.throws(() => tensorProductComplexIterative([c(1, 0), [c(2, 0)]], valid), TypeError);
	assert.throws(() => tensorProductComplexIterative([[c(2, 0)], c(1, 0)], valid), TypeError);

	// Sparse arrays
	const sparse = new Array(2);
	sparse[1] = c(1, 0);
	assert.throws(() => tensorProductComplexIterative(sparse, valid), TypeError);
	assert.throws(() => tensorProductComplexIterative(valid, sparse), TypeError);
});

test('input validation throws RangeError on ragged tensors and non-finite components', () => {
	const valid = [c(1, 0)];

	// Ragged tensors
	assert.throws(() => tensorProductComplexIterative([[c(1, 0), c(2, 0)], [c(3, 0)]], valid), RangeError);
	assert.throws(() => tensorProductComplexIterative([[], [c(1, 0)]], valid), RangeError);
	assert.throws(() => tensorProductComplexIterative(valid, [[c(1, 0)], [c(2, 0), c(3, 0)]]), RangeError);

	// Non-finite complex components
	for (const bad of [
		c(NaN, 0),
		c(0, NaN),
		c(Infinity, 1),
		c(1, -Infinity),
		[c(1, 0), c(NaN, 2)],
	]) {
		assert.throws(() => tensorProductComplexIterative(bad, valid), RangeError);
		assert.throws(() => tensorProductComplexIterative(valid, bad), RangeError);
	}
});

test('cross-check against independent recursive reference implementation across ranks 0D to 3D', () => {
	const s = c(2, -3);
	const v = [c(1, 4), c(-2, 0.5), c(0, -1)];
	const m = [
		[c(1, -1), c(2, 3)],
		[c(-4, 0), c(0.5, -2.5)],
	];
	const t3 = [
		[
			[c(1, 0), c(0, 1)],
			[c(-1, 2), c(3, -1)],
		],
		[
			[c(2, 2), c(-0.5, 0.5)],
			[c(0, 0), c(4, -3)],
		],
	];

	const pairs = [
		[s, s],
		[s, v],
		[v, s],
		[v, v],
		[v, m],
		[m, v],
		[m, m],
		[t3, m],
		[m, t3],
		[[], m],
		[m, []],
	];

	for (const [a, b] of pairs) {
		assert.deepStrictEqual(
			tensorProductComplexIterative(a, b),
			tensorProductRecursiveRef(a, b)
		);
	}
});

test('cross-check algebraic and analytical identities (associativity, bilinearity, Frobenius norm, entry sum, conjugation, trace)', () => {
	const a1 = [c(1, 2), c(-3, 0.5)];
	const a2 = [c(0.5, -1), c(2, 4)];
	const b1 = [
		[c(2, -1), c(0, 3)],
		[c(-1, -2), c(4, 1)],
	];
	const b2 = [
		[c(-2, 0.5), c(1, -1)],
		[c(3, 2), c(0, -2)],
	];
	const d = [c(1, -1), c(2, 0), c(0, 3)];

	// 1. Associativity: (a1 ⊗ b1) ⊗ d === a1 ⊗ (b1 ⊗ d)
	const leftAssoc = tensorProductComplexIterative(
		tensorProductComplexIterative(a1, b1),
		d
	);
	const rightAssoc = tensorProductComplexIterative(
		a1,
		tensorProductComplexIterative(b1, d)
	);
	assertComplexTensorApproxEqual(leftAssoc, rightAssoc);

	// 2. Bilinearity: (a1 + a2) ⊗ b1 === a1 ⊗ b1 + a2 ⊗ b1
	assertComplexTensorApproxEqual(
		tensorProductComplexIterative(addTensors(a1, a2), b1),
		addTensors(
			tensorProductComplexIterative(a1, b1),
			tensorProductComplexIterative(a2, b1)
		)
	);
	assertComplexTensorApproxEqual(
		tensorProductComplexIterative(a1, addTensors(b1, b2)),
		addTensors(
			tensorProductComplexIterative(a1, b1),
			tensorProductComplexIterative(a1, b2)
		)
	);

	// 3. Frobenius norm multiplicativity: ||a1 ⊗ b1||_F === ||a1||_F * ||b1||_F
	const prod = tensorProductComplexIterative(a1, b1);
	assert.ok(
		Math.abs(frobeniusNorm(prod) - frobeniusNorm(a1) * frobeniusNorm(b1)) <= 1e-12
	);

	// 4. Entry sum multiplicativity: sum(a1 ⊗ b1) === sum(a1) * sum(b1)
	assertComplexTensorApproxEqual(
		sumEntries(prod),
		tensorProductComplexIterative(sumEntries(a1), sumEntries(b1))
	);

	// 5. Conjugation compatibility: conj(a1 ⊗ b1) === conj(a1) ⊗ conj(b1)
	assertComplexTensorApproxEqual(
		conjTensor(prod),
		tensorProductComplexIterative(conjTensor(a1), conjTensor(b1))
	);

	// 6. Trace of vector outer product equals bilinear dot product sum_k(u_k * v_k)
	const u = [c(1, 2), c(-3, 4), c(5, -6)];
	const v = [c(-2, 1), c(0, 3), c(4, 2)];
	const outer = tensorProductComplexIterative(u, v);
	let traceRe = 0;
	let traceIm = 0;
	let dotRe = 0;
	let dotIm = 0;
	for (let k = 0; k < u.length; k++) {
		traceRe += outer[k][k].re;
		traceIm += outer[k][k].im;
		dotRe += u[k].re * v[k].re - u[k].im * v[k].im;
		dotIm += u[k].re * v[k].im + u[k].im * v[k].re;
	}
	assertComplexTensorApproxEqual(c(traceRe, traceIm), c(dotRe, dotIm));
});

test('cross-check Euler polar identity e^(i*theta) ⊗ e^(i*phi) = e^(i*(theta + phi))', () => {
	const thetas = [0, Math.PI / 6, Math.PI / 3, (2 * Math.PI) / 3, -Math.PI / 4];
	const phis = [Math.PI / 5, Math.PI / 2, Math.PI, -Math.PI / 3];

	const u = thetas.map((t) => c(Math.cos(t), Math.sin(t)));
	const v = phis.map((p) => c(Math.cos(p), Math.sin(p)));

	const result = tensorProductComplexIterative(u, v);
	for (let i = 0; i < thetas.length; i++) {
		for (let j = 0; j < phis.length; j++) {
			const angle = thetas[i] + phis[j];
			assertComplexTensorApproxEqual(
				result[i][j],
				c(Math.cos(angle), Math.sin(angle)),
				1e-12
			);
		}
	}
});
