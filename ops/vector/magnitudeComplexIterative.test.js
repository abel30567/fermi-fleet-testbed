import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeComplexIterative } from './magnitudeComplexIterative.js';

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected);
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= bound,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, bound=${bound})`
	);
}

describe('magnitudeComplexIterative', () => {
	test('computes magnitude for normal complex vectors', () => {
		assert.equal(magnitudeComplexIterative([{ re: 3, im: 4 }]), 5);
		assert.equal(magnitudeComplexIterative([{ re: -3, im: -4 }]), 5);
		assert.equal(
			magnitudeComplexIterative([
				{ re: 1, im: 2 },
				{ re: 2, im: 0 },
			]),
			3
		);
		assertClose(
			magnitudeComplexIterative([
				{ re: 1, im: 1 },
				{ re: 1, im: -1 },
			]),
			2
		);
		assertClose(
			magnitudeComplexIterative([
				{ re: 0, im: 5 },
				{ re: 12, im: 0 },
			]),
			13
		);
		assertClose(
			magnitudeComplexIterative([
				{ re: 0.5, im: -1.5 },
				{ re: 2.25, im: 0.75 },
				{ re: -1, im: 3 },
			]),
			Math.sqrt(0.25 + 2.25 + 5.0625 + 0.5625 + 1 + 9)
		);
	});

	test('handles edge cases: empty, zero, negative zero, real-only, imaginary-only', () => {
		assert.ok(Object.is(magnitudeComplexIterative([]), 0));
		assert.ok(Object.is(magnitudeComplexIterative([{ re: 0, im: 0 }]), 0));
		assert.ok(Object.is(magnitudeComplexIterative([{ re: -0, im: -0 }]), 0));
		assert.ok(
			Object.is(
				magnitudeComplexIterative([
					{ re: 0, im: 0 },
					{ re: -0, im: 0 },
				]),
				0
			)
		);
		assert.equal(magnitudeComplexIterative([{ re: -7, im: 0 }]), 7);
		assert.equal(magnitudeComplexIterative([{ re: 0, im: -9 }]), 9);
	});

	test('avoids intermediate overflow and underflow for extreme scales', () => {
		assertClose(
			magnitudeComplexIterative([
				{ re: 3e200, im: 4e200 },
			]),
			5e200
		);
		assertClose(
			magnitudeComplexIterative([
				{ re: 3e-200, im: 4e-200 },
			]),
			5e-200,
			1e-12,
			0
		);
		assertClose(
			magnitudeComplexIterative([
				{ re: 1e250, im: 0 },
				{ re: 0, im: 1e250 },
			]),
			Math.SQRT2 * 1e250
		);
		assertClose(
			magnitudeComplexIterative([
				{ re: 1e-250, im: 0 },
				{ re: 0, im: 1e-250 },
			]),
			Math.SQRT2 * 1e-250,
			1e-12,
			0
		);
		// Increasing scale mid-vector (triggers rescaling branch for both re and im)
		assertClose(
			magnitudeComplexIterative([
				{ re: 1e-100, im: 2e-100 },
				{ re: 3e100, im: 4e100 },
			]),
			5e100
		);
	});

	test('does not mutate the input vector or its elements', () => {
		const v = [
			Object.freeze({ re: 3, im: 4 }),
			Object.freeze({ re: 0, im: 12 }),
		];
		Object.freeze(v);
		assert.equal(magnitudeComplexIterative(v), 13);
	});

	test('validates invalid inputs with TypeError and RangeError', () => {
		// Non-array inputs -> TypeError
		for (const bad of [null, undefined, 42, 'abc', {}, { re: 1, im: 2 }, new Float64Array([1, 2])]) {
			assert.throws(() => magnitudeComplexIterative(bad), TypeError);
		}

		// Invalid elements -> TypeError
		for (const badEl of [null, undefined, 5, '1+2i', [1, 2], true]) {
			assert.throws(() => magnitudeComplexIterative([badEl]), TypeError);
		}

		// Sparse array -> TypeError
		const sparse = new Array(2);
		sparse[1] = { re: 1, im: 0 };
		assert.throws(() => magnitudeComplexIterative(sparse), TypeError);

		// Missing or non-numeric re/im -> TypeError
		assert.throws(() => magnitudeComplexIterative([{ re: 1 }]), TypeError);
		assert.throws(() => magnitudeComplexIterative([{ im: 1 }]), TypeError);
		assert.throws(() => magnitudeComplexIterative([{ re: '3', im: 4 }]), TypeError);
		assert.throws(() => magnitudeComplexIterative([{ re: 3, im: null }]), TypeError);
		assert.throws(() => magnitudeComplexIterative([{ re: 3n, im: 4 }]), TypeError);

		// Non-finite numbers -> RangeError
		assert.throws(() => magnitudeComplexIterative([{ re: NaN, im: 0 }]), RangeError);
		assert.throws(() => magnitudeComplexIterative([{ re: 0, im: NaN }]), RangeError);
		assert.throws(() => magnitudeComplexIterative([{ re: Infinity, im: 1 }]), RangeError);
		assert.throws(() => magnitudeComplexIterative([{ re: 1, im: -Infinity }]), RangeError);
		assert.throws(
			() =>
				magnitudeComplexIterative([
					{ re: 1, im: 2 },
					{ re: 3, im: Infinity },
				]),
			RangeError
		);
	});

	test('cross-checks against Math.hypot and naive sum-of-squares reference', () => {
		// Deterministic LCG PRNG
		let seed = 0x12345678;
		const nextRand = () => {
			seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
			return (seed / 0xffffffff) * 20 - 10;
		};

		for (const len of [1, 2, 5, 17, 64]) {
			const v = Array.from({ length: len }, () => ({ re: nextRand(), im: nextRand() }));
			const actual = magnitudeComplexIterative(v);

			const hypotRef = Math.hypot(...v.flatMap(({ re, im }) => [re, im]));
			const naiveRef = Math.sqrt(v.reduce((acc, { re, im }) => acc + re * re + im * im, 0));

			assertClose(actual, hypotRef);
			assertClose(actual, naiveRef);
		}
	});

	test('satisfies complex vector norm mathematical identities', () => {
		const u = [
			{ re: 1.5, im: -2.25 },
			{ re: -3, im: 0.5 },
			{ re: 4.1, im: 1.7 },
		];
		const v = [
			{ re: -0.5, im: 3.1 },
			{ re: 2.2, im: -1.4 },
			{ re: -0.8, im: 2.9 },
		];

		const normU = magnitudeComplexIterative(u);
		const normV = magnitudeComplexIterative(v);

		// 1. Conjugate invariance: ||conj(u)|| == ||u||
		const conjU = u.map(({ re, im }) => ({ re, im: -im }));
		assertClose(magnitudeComplexIterative(conjU), normU);

		// 2. Complex scalar homogeneity: ||c * u|| == |c| * ||u||
		const c = { re: -2.5, im: 1.75 };
		const absC = Math.hypot(c.re, c.im);
		const scaledU = u.map(({ re, im }) => ({
			re: c.re * re - c.im * im,
			im: c.re * im + c.im * re,
		}));
		assertClose(magnitudeComplexIterative(scaledU), absC * normU);

		// 3. Per-component unitary phase rotation invariance: ||diag(e^{i*theta_k}) * u|| == ||u||
		const rotatedU = u.map(({ re, im }, k) => {
			const theta = 0.7 * (k + 1);
			const cos = Math.cos(theta);
			const sin = Math.sin(theta);
			return { re: re * cos - im * sin, im: re * sin + im * cos };
		});
		assertClose(magnitudeComplexIterative(rotatedU), normU);

		// 4. Hermitian inner product identity: ||u||^2 == <u, u>
		const innerUU = u.reduce(
			(acc, { re, im }) => ({
				re: acc.re + re * re + im * im,
				im: acc.im + im * re - re * im,
			}),
			{ re: 0, im: 0 }
		);
		assertClose(normU * normU, innerUU.re);
		assert.equal(innerUU.im, 0);

		// 5. Parallelogram law: ||u + v||^2 + ||u - v||^2 == 2(||u||^2 + ||v||^2)
		const uPlusV = u.map((el, i) => ({ re: el.re + v[i].re, im: el.im + v[i].im }));
		const uMinusV = u.map((el, i) => ({ re: el.re - v[i].re, im: el.im - v[i].im }));
		const normSum = magnitudeComplexIterative(uPlusV);
		const normDiff = magnitudeComplexIterative(uMinusV);
		assertClose(normSum * normSum + normDiff * normDiff, 2 * (normU * normU + normV * normV));

		// 6. Triangle inequality: ||u + v|| <= ||u|| + ||v||
		assert.ok(normSum <= normU + normV + 1e-12);
	});
});
