import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectionComplexMemo } from './projectionComplexMemo.js';

const EPS = 1e-12;

/**
 * Independent Hermitian inner product: <a, b> = sum(a[k] * conj(b[k])).
 */
function innerProduct(a, b) {
	let re = 0;
	let im = 0;
	for (let i = 0; i < a.length; i++) {
		re += a[i].re * b[i].re + a[i].im * b[i].im;
		im += a[i].im * b[i].re - a[i].re * b[i].im;
	}
	return { re, im };
}

/**
 * Independent naive projection: (<u, v> / <v, v>) * v.
 */
function naiveProjection(u, v) {
	const num = innerProduct(u, v);
	const denom = innerProduct(v, v).re;
	const scaleRe = num.re / denom;
	const scaleIm = num.im / denom;
	return v.map(({ re, im }) => ({
		re: scaleRe * re - scaleIm * im,
		im: scaleRe * im + scaleIm * re,
	}));
}

function normSq(vec) {
	return innerProduct(vec, vec).re;
}

function assertComplexClose(actual, expected, tol = EPS, msg = '') {
	assert.equal(typeof actual.re, 'number', `${msg} re should be number`);
	assert.equal(typeof actual.im, 'number', `${msg} im should be number`);
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg} re mismatch: got ${actual.re}, expected ${expected.re}`,
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg} im mismatch: got ${actual.im}, expected ${expected.im}`,
	);
}

function assertVectorClose(actual, expected, tol = EPS, msg = '') {
	assert.equal(actual.length, expected.length, `${msg} length mismatch`);
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], tol, `${msg}[${i}]`);
	}
}

describe('projectionComplexMemo', () => {
	it('projects 1D complex vector onto any non-zero 1D complex vector identically', () => {
		const u = [{ re: 3, im: -4 }];
		const v = [{ re: 1, im: 2 }];
		const result = projectionComplexMemo(u, v);
		assertVectorClose(result, u);
	});

	it('projects 2D complex vector onto another complex vector (hand-calculated)', () => {
		// u = [1 + i, 2 - i], v = [1, i]
		// <u, v> = (1 + i)*1 + (2 - i)*(-i) = (1 + i) + (-1 - 2i) = 0 - i
		// <v, v> = 1 + 1 = 2
		// proj = (-i / 2) * [1, i] = [-0.5i, 0.5]
		const u = [
			{ re: 1, im: 1 },
			{ re: 2, im: -1 },
		];
		const v = [
			{ re: 1, im: 0 },
			{ re: 0, im: 1 },
		];
		const result = projectionComplexMemo(u, v);
		assertVectorClose(result, [
			{ re: 0, im: -0.5 },
			{ re: 0.5, im: 0 },
		]);
	});

	it('projects onto precomputed standard basis vectors in 3D', () => {
		const u = [
			{ re: 4, im: -2 },
			{ re: -1, im: 5 },
			{ re: 3, im: 7 },
		];
		const e2 = [
			{ re: 0, im: 0 },
			{ re: 1, im: 0 },
			{ re: 0, im: 0 },
		];
		const result = projectionComplexMemo(u, e2);
		assert.deepStrictEqual(result, [
			{ re: 0, im: 0 },
			{ re: -1, im: 5 },
			{ re: 0, im: 0 },
		]);
	});

	it('projects real vectors embedded in complex space accurately', () => {
		const u = [
			{ re: 3, im: 0 },
			{ re: 4, im: 0 },
		];
		const v = [
			{ re: 1, im: 0 },
			{ re: 1, im: 0 },
		];
		const result = projectionComplexMemo(u, v);
		assertVectorClose(result, [
			{ re: 3.5, im: 0 },
			{ re: 3.5, im: 0 },
		]);
	});

	it('returns zero vector when u and v are orthogonal under Hermitian inner product', () => {
		// u = [1, i], v = [1, -i] => <u, v> = 1*1 + i*(+i) = 1 - 1 = 0
		const u = [
			{ re: 1, im: 0 },
			{ re: 0, im: 1 },
		];
		const v = [
			{ re: 1, im: 0 },
			{ re: 0, im: -1 },
		];
		const result = projectionComplexMemo(u, v);
		assert.deepStrictEqual(result, [
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
		]);
		// Ensure no -0 values
		for (const c of result) {
			assert.ok(!Object.is(c.re, -0));
			assert.ok(!Object.is(c.im, -0));
		}
	});

	it('returns u when u is parallel to v (same vector and complex scalar multiple)', () => {
		const v = [
			{ re: 2, im: -1 },
			{ re: 0, im: 3 },
			{ re: -1, im: -2 },
		];
		// u = v
		assertVectorClose(projectionComplexMemo(v, v), v);

		// u = (3 - 2i) * v
		const alpha = { re: 3, im: -2 };
		const u = v.map(({ re, im }) => ({
			re: alpha.re * re - alpha.im * im,
			im: alpha.re * im + alpha.im * re,
		}));
		assertVectorClose(projectionComplexMemo(u, v), u);
	});

	it('returns zero vector when u is the zero vector', () => {
		const u = [
			{ re: 0, im: 0 },
			{ re: -0, im: 0 },
		];
		const v = [
			{ re: 2, im: 5 },
			{ re: -3, im: 1 },
		];
		const result = projectionComplexMemo(u, v);
		assert.deepStrictEqual(result, [
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
		]);
	});

	it('is invariant under scaling target vector v by any non-zero complex scalar', () => {
		const u = [
			{ re: 2, im: 3 },
			{ re: -1, im: 4 },
			{ re: 5, im: -2 },
		];
		const v = [
			{ re: 1, im: -2 },
			{ re: 3, im: 1 },
			{ re: -2, im: 2 },
		];
		const scalar = { re: -4, im: 7 };
		const scaledV = v.map(({ re, im }) => ({
			re: scalar.re * re - scalar.im * im,
			im: scalar.re * im + scalar.im * re,
		}));

		const p1 = projectionComplexMemo(u, v);
		const p2 = projectionComplexMemo(u, scaledV);
		assertVectorClose(p1, p2);
	});

	it('handles extreme target magnitudes without overflow or underflow', () => {
		const u = [
			{ re: 1, im: 2 },
			{ re: 3, im: 4 },
		];
		const hugeV = [
			{ re: 1e200, im: 0 },
			{ re: 0, im: 1e200 },
		];
		const tinyV = [
			{ re: 1e-200, im: 0 },
			{ re: 0, im: 1e-200 },
		];
		const unitV = [
			{ re: 1, im: 0 },
			{ re: 0, im: 1 },
		];

		const expected = projectionComplexMemo(u, unitV);
		assertVectorClose(projectionComplexMemo(u, hugeV), expected);
		assertVectorClose(projectionComplexMemo(u, tinyV), expected);
	});

	it('returns fresh cloned arrays on cache hits and resists caller mutation', () => {
		const u = [
			{ re: 1.5, im: -2.5 },
			{ re: 3.25, im: 0.75 },
		];
		const v = [
			{ re: 2, im: 1 },
			{ re: -1, im: 3 },
		];

		const first = projectionComplexMemo(u, v);
		const second = projectionComplexMemo(u, v);

		assert.deepStrictEqual(second, first);
		assert.notEqual(second, first, 'cached result must be a fresh array');
		assert.notEqual(second[0], first[0], 'cached elements must be fresh objects');

		// Mutate first output aggressively
		first[0].re = 99999;
		first[0].im = -99999;
		first.push({ re: 1, im: 1 });

		// Mutate original input objects after caching
		const expectedCopy = second.map(({ re, im }) => ({ re, im }));
		const third = projectionComplexMemo(
			[
				{ re: 1.5, im: -2.5 },
				{ re: 3.25, im: 0.75 },
			],
			[
				{ re: 2, im: 1 },
				{ re: -1, im: 3 },
			],
		);
		assert.deepStrictEqual(third, expectedCopy);
	});

	it('handles bounded cache eviction gracefully beyond cache capacity', () => {
		const v = [
			{ re: 1, im: 1 },
			{ re: 2, im: -1 },
		];
		for (let i = 1; i <= 600; i++) {
			const u = [
				{ re: i, im: -i * 0.5 },
				{ re: i * 0.25, im: i },
			];
			const proj = projectionComplexMemo(u, v);
			const expected = naiveProjection(u, v);
			assertVectorClose(proj, expected, 1e-9, `iteration ${i}`);
		}
	});

	it('throws RangeError for zero target vector v', () => {
		const u = [
			{ re: 1, im: 2 },
			{ re: 3, im: 4 },
		];
		assert.throws(
			() =>
				projectionComplexMemo(u, [
					{ re: 0, im: 0 },
					{ re: 0, im: 0 },
				]),
			RangeError,
		);
		assert.throws(
			() => projectionComplexMemo([{ re: 1, im: 0 }], [{ re: -0, im: -0 }]),
			RangeError,
		);
	});

	it('validates invalid inputs with appropriate error types', () => {
		const valid = [{ re: 1, im: 0 }];

		// Non-array inputs -> TypeError
		for (const bad of [null, undefined, 42, 'vec', { re: 1, im: 0 }]) {
			assert.throws(() => projectionComplexMemo(bad, valid), TypeError);
			assert.throws(() => projectionComplexMemo(valid, bad), TypeError);
		}

		// Empty vectors -> RangeError
		assert.throws(() => projectionComplexMemo([], []), RangeError);
		assert.throws(() => projectionComplexMemo([], valid), RangeError);
		assert.throws(() => projectionComplexMemo(valid, []), RangeError);

		// Length mismatch -> RangeError
		assert.throws(
			() => projectionComplexMemo([valid[0], valid[0]], valid),
			RangeError,
		);

		// Invalid complex element types -> TypeError
		for (const badEl of [
			null,
			undefined,
			5,
			'1+i',
			[1, 2],
			{ re: 1 },
			{ im: 2 },
			{ re: '1', im: 0 },
			{ re: 0, im: null },
		]) {
			assert.throws(() => projectionComplexMemo([badEl], valid), TypeError);
			assert.throws(() => projectionComplexMemo(valid, [badEl]), TypeError);
		}

		// Non-finite complex components -> RangeError
		for (const badNum of [NaN, Infinity, -Infinity]) {
			assert.throws(
				() => projectionComplexMemo([{ re: badNum, im: 0 }], valid),
				RangeError,
			);
			assert.throws(
				() => projectionComplexMemo([{ re: 0, im: badNum }], valid),
				RangeError,
			);
			assert.throws(
				() => projectionComplexMemo(valid, [{ re: badNum, im: 1 }]),
				RangeError,
			);
			assert.throws(
				() => projectionComplexMemo(valid, [{ re: 1, im: badNum }]),
				RangeError,
			);
		}
	});

	it('cross-check: residual orthogonality, idempotency, Pythagorean identity, and naive formula', () => {
		const testPairs = [
			{
				u: [
					{ re: 2, im: -3 },
					{ re: 4, im: 1 },
					{ re: -1, im: 5 },
				],
				v: [
					{ re: 1, im: 2 },
					{ re: -3, im: 1 },
					{ re: 2, im: -2 },
				],
			},
			{
				u: [
					{ re: -7.25, im: 3.5 },
					{ re: 0.125, im: -4.75 },
					{ re: 6.5, im: 2.25 },
					{ re: -1.5, im: -0.5 },
				],
				v: [
					{ re: 0.5, im: -1.25 },
					{ re: 2.75, im: 3.125 },
					{ re: -4.25, im: 0.75 },
					{ re: 1.5, im: -2.5 },
				],
			},
		];

		for (const { u, v } of testPairs) {
			const proj = projectionComplexMemo(u, v);

			// 1. Matches independent naive implementation
			assertVectorClose(proj, naiveProjection(u, v), 1e-11, 'naive cross-check');

			// 2. Orthogonality of residual: <u - proj_v(u), v> === 0
			const residual = u.map((uk, k) => ({
				re: uk.re - proj[k].re,
				im: uk.im - proj[k].im,
			}));
			const resInner = innerProduct(residual, v);
			assertComplexClose(resInner, { re: 0, im: 0 }, 1e-11, 'residual orthogonality');

			// 3. Idempotency: proj_v(proj_v(u)) === proj_v(u)
			const projTwice = projectionComplexMemo(proj, v);
			assertVectorClose(projTwice, proj, 1e-11, 'idempotency');

			// 4. Pythagorean identity: ||proj_v(u)||^2 + ||u - proj_v(u)||^2 === ||u||^2
			const lhs = normSq(proj) + normSq(residual);
			const rhs = normSq(u);
			assert.ok(
				Math.abs(lhs - rhs) <= 1e-10,
				`Pythagorean mismatch: ${lhs} vs ${rhs}`,
			);
		}
	});

	it('cross-check: complex linearity in first argument u', () => {
		const u1 = [
			{ re: 1, im: 2 },
			{ re: -3, im: 4 },
			{ re: 5, im: -1 },
		];
		const u2 = [
			{ re: -2, im: 1 },
			{ re: 4, im: 3 },
			{ re: 0, im: 2 },
		];
		const v = [
			{ re: 3, im: -1 },
			{ re: 2, im: 2 },
			{ re: -1, im: 4 },
		];
		const a = { re: 2, im: -3 };
		const b = { re: -1, im: 4 };

		const mul = (c, z) => ({
			re: c.re * z.re - c.im * z.im,
			im: c.re * z.im + c.im * z.re,
		});
		const combo = u1.map((z1, i) => {
			const az1 = mul(a, z1);
			const bz2 = mul(b, u2[i]);
			return { re: az1.re + bz2.re, im: az1.im + bz2.im };
		});

		const pCombo = projectionComplexMemo(combo, v);
		const p1 = projectionComplexMemo(u1, v);
		const p2 = projectionComplexMemo(u2, v);
		const expected = p1.map((z1, i) => {
			const az1 = mul(a, z1);
			const bz2 = mul(b, p2[i]);
			return { re: az1.re + bz2.re, im: az1.im + bz2.im };
		});

		assertVectorClose(pCombo, expected, 1e-11, 'linearity');
	});
});
