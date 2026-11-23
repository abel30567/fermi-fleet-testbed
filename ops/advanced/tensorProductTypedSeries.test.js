import test from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductTypedSeries } from './tensorProductTypedSeries.js';

function assertFloat64Close(actual, expected, eps = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array');
	assert.equal(actual.length, expected.length, 'length mismatch');
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		);
	}
}

test('binary tensor product of unequal-length Float64Arrays', () => {
	const u = new Float64Array([1, 2]);
	const v = new Float64Array([3, 4, 5]);
	const res = tensorProductTypedSeries(u, v);

	assert.ok(res instanceof Float64Array);
	assert.deepEqual(res, new Float64Array([3, 4, 5, 6, 8, 10]));
});

test('handles negative, fractional, and zero entries', () => {
	const u = new Float64Array([-1.5, 0, 2.25]);
	const v = new Float64Array([4, -0.5]);
	const res = tensorProductTypedSeries(u, v);

	assertFloat64Close(res, new Float64Array([-6, 0.75, 0, 0, 9, -1.125]));
});

test('higher-order (3-way and 4-way) tensor products', () => {
	const a = new Float64Array([1, 2]);
	const b = new Float64Array([3, 4]);
	const c = new Float64Array([5, 6, 7]);
	const res3 = tensorProductTypedSeries(a, b, c);

	assert.deepEqual(
		res3,
		new Float64Array([
			15, 18, 21,
			20, 24, 28,
			30, 36, 42,
			40, 48, 56,
		])
	);

	const d = new Float64Array([-1, 2]);
	const res4 = tensorProductTypedSeries(a, b, c, d);
	assert.equal(res4.length, a.length * b.length * c.length * d.length);
	assert.equal(res4[0], 1 * 3 * 5 * -1);
	assert.equal(res4[res4.length - 1], 2 * 4 * 7 * 2);
});

test('edge cases: empty inputs, singleton inputs, unit basis, immutability', () => {
	const empty = new Float64Array(0);
	const v = new Float64Array([1, 2, 3]);

	assert.deepEqual(tensorProductTypedSeries(empty, v), new Float64Array(0));
	assert.deepEqual(tensorProductTypedSeries(v, empty), new Float64Array(0));
	assert.deepEqual(tensorProductTypedSeries(v, v, empty), new Float64Array(0));

	// Singleton acts as scalar multiplication
	const scalar = new Float64Array([3.5]);
	assertFloat64Close(
		tensorProductTypedSeries(scalar, v),
		new Float64Array([3.5, 7, 10.5])
	);

	// Standard basis vectors: e_1 (len 3) ⊗ e_2 (len 4) = e_{1*4 + 2} = e_6 (len 12)
	const e1 = new Float64Array([0, 1, 0]);
	const e2 = new Float64Array([0, 0, 1, 0]);
	const basisProd = tensorProductTypedSeries(e1, e2);
	assert.equal(basisProd.length, 12);
	for (let p = 0; p < 12; p++) {
		assert.equal(basisProd[p], p === 6 ? 1 : 0);
	}

	// Does not mutate input arrays
	const uOrig = new Float64Array([2, -3]);
	const vOrig = new Float64Array([5, 7]);
	tensorProductTypedSeries(uOrig, vOrig);
	assert.deepEqual(uOrig, new Float64Array([2, -3]));
	assert.deepEqual(vOrig, new Float64Array([5, 7]));
});

test('input validation throws TypeError and RangeError appropriately', () => {
	const v = new Float64Array([1, 2]);

	assert.throws(() => tensorProductTypedSeries(), TypeError);
	assert.throws(() => tensorProductTypedSeries(v), TypeError);
	assert.throws(() => tensorProductTypedSeries([1, 2], v), TypeError);
	assert.throws(() => tensorProductTypedSeries(v, new Float32Array([1, 2])), TypeError);
	assert.throws(() => tensorProductTypedSeries(v, v, null), TypeError);

	assert.throws(
		() => tensorProductTypedSeries(new Float64Array([1, NaN]), v),
		RangeError
	);
	assert.throws(
		() => tensorProductTypedSeries(v, new Float64Array([Infinity])),
		RangeError
	);
	assert.throws(
		() => tensorProductTypedSeries(new Float64Array(0), new Float64Array([-Infinity])),
		RangeError
	);
});

test('cross-check: polarization identity ((u_i + v_j)^2 - (u_i - v_j)^2) / 4', () => {
	const u = new Float64Array([1.25, -3.5, 0.75, 4.0]);
	const v = new Float64Array([-2.0, 0.5, 3.25]);
	const actual = tensorProductTypedSeries(u, v);

	const viaPolarization = new Float64Array(u.length * v.length);
	for (let i = 0; i < u.length; i++) {
		for (let j = 0; j < v.length; j++) {
			const sum = u[i] + v[j];
			const diff = u[i] - v[j];
			viaPolarization[i * v.length + j] = (sum * sum - diff * diff) / 4;
		}
	}

	assertFloat64Close(actual, viaPolarization, 1e-12);
});

test('cross-check: bivariate power-series generating function identity', () => {
	const u = new Float64Array([1.1, -2.3, 0.7, 4.2]);
	const v = new Float64Array([-0.9, 3.4, -1.5, 2.8, 0.6]);
	const T = tensorProductTypedSeries(u, v);

	const evalPoly = (coeffs, x) => {
		let sum = 0;
		let pow = 1;
		for (let i = 0; i < coeffs.length; i++) {
			sum += coeffs[i] * pow;
			pow *= x;
		}
		return sum;
	};

	const points = [
		[0.5, -0.25],
		[1.0, 1.0],
		[-0.75, 0.8],
		[1.2, -0.6],
	];

	for (const [x, y] of points) {
		let lhs = 0;
		let xPow = 1;
		for (let i = 0; i < u.length; i++) {
			let yPow = 1;
			for (let j = 0; j < v.length; j++) {
				lhs += T[i * v.length + j] * xPow * yPow;
				yPow *= y;
			}
			xPow *= x;
		}
		const rhs = evalPoly(u, x) * evalPoly(v, y);
		assert.ok(
			Math.abs(lhs - rhs) <= 1e-11,
			`generating function mismatch at (${x}, ${y}): ${lhs} vs ${rhs}`
		);
	}
});

test('cross-check: inner-product, Frobenius norm, trace, associativity, and bilinearity identities', () => {
	const dot = (a, b) => {
		let s = 0;
		for (let i = 0; i < a.length; i++) s += a[i] * b[i];
		return s;
	};

	const u = new Float64Array([1.5, -2.0, 3.25]);
	const v = new Float64Array([0.5, 4.0, -1.25]);
	const x = new Float64Array([-0.75, 2.5, 1.0]);
	const y = new Float64Array([3.0, -1.5, 2.25]);

	const uv = tensorProductTypedSeries(u, v);
	const xy = tensorProductTypedSeries(x, y);

	// <u ⊗ v, x ⊗ y> = <u, x> * <v, y>
	assert.ok(Math.abs(dot(uv, xy) - dot(u, x) * dot(v, y)) <= 1e-12);

	// ||u ⊗ v||_2^2 = ||u||_2^2 * ||v||_2^2
	assert.ok(Math.abs(dot(uv, uv) - dot(u, u) * dot(v, v)) <= 1e-12);

	// tr(u ⊗ v) = u · v for equal-length vectors
	let trace = 0;
	for (let i = 0; i < u.length; i++) {
		trace += uv[i * v.length + i];
	}
	assert.ok(Math.abs(trace - dot(u, v)) <= 1e-12);

	// Associativity: (u ⊗ v) ⊗ x === u ⊗ (v ⊗ x) === tensorProductTypedSeries(u, v, x)
	const leftAssoc = tensorProductTypedSeries(uv, x);
	const rightAssoc = tensorProductTypedSeries(u, tensorProductTypedSeries(v, x));
	const direct3 = tensorProductTypedSeries(u, v, x);
	assertFloat64Close(direct3, leftAssoc, 1e-12);
	assertFloat64Close(direct3, rightAssoc, 1e-12);

	// Bilinearity: (u + x) ⊗ v = u ⊗ v + x ⊗ v
	const uPlusX = new Float64Array(u.length);
	for (let i = 0; i < u.length; i++) uPlusX[i] = u[i] + x[i];
	const lhsDist = tensorProductTypedSeries(uPlusX, v);
	const xv = tensorProductTypedSeries(x, v);
	const rhsDist = new Float64Array(uv.length);
	for (let p = 0; p < uv.length; p++) rhsDist[p] = uv[p] + xv[p];
	assertFloat64Close(lhsDist, rhsDist, 1e-12);

	// Rank-1 matrix-vector product: (u v^T) y = u * (v · y)
	const vy = dot(v, y);
	for (let i = 0; i < u.length; i++) {
		let rowDot = 0;
		for (let j = 0; j < v.length; j++) {
			rowDot += uv[i * v.length + j] * y[j];
		}
		assert.ok(Math.abs(rowDot - u[i] * vy) <= 1e-12);
	}
});
