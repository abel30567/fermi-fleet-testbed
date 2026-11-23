import test from 'node:test';
import assert from 'node:assert/strict';
import { arctanDualIterative } from './arctanDualIterative.js';

function assertClose(actual, expected, eps = 1e-14, message = '') {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`${message ? message + ': ' : ''}expected ${actual} to be within ${eps} of ${expected} (diff=${Math.abs(actual - expected)})`,
	);
}

test('exact special values and derivatives', () => {
	const atZero = arctanDualIterative({ v: 0, d: 1 });
	assert.equal(atZero.v, 0);
	assert.equal(atZero.d, 1);

	const atOne = arctanDualIterative({ v: 1, d: 1 });
	assertClose(atOne.v, Math.PI / 4, 1e-15, 'arctan(1).v');
	assertClose(atOne.d, 0.5, 1e-15, 'arctan(1).d');

	const atNegOne = arctanDualIterative({ v: -1, d: 1 });
	assertClose(atNegOne.v, -Math.PI / 4, 1e-15, 'arctan(-1).v');
	assertClose(atNegOne.d, 0.5, 1e-15, 'arctan(-1).d');

	const atInvSqrt3 = arctanDualIterative({ v: 1 / Math.sqrt(3), d: 1 });
	assertClose(atInvSqrt3.v, Math.PI / 6, 1e-15, 'arctan(1/sqrt(3)).v');
	assertClose(atInvSqrt3.d, 0.75, 1e-15, 'arctan(1/sqrt(3)).d');

	const atSqrt3 = arctanDualIterative({ v: Math.sqrt(3), d: 1 });
	assertClose(atSqrt3.v, Math.PI / 3, 1e-15, 'arctan(sqrt(3)).v');
	assertClose(atSqrt3.d, 0.25, 1e-15, 'arctan(sqrt(3)).d');
});

test('forward-mode chain rule scaling with arbitrary derivative d', () => {
	const r1 = arctanDualIterative({ v: 2, d: 0 });
	assertClose(r1.v, Math.atan(2), 1e-15);
	assert.equal(r1.d, 0);

	const r2 = arctanDualIterative({ v: 2, d: -5 });
	assertClose(r2.v, Math.atan(2), 1e-15);
	assertClose(r2.d, -1, 1e-15);

	const r3 = arctanDualIterative({ v: -3, d: 7.5 });
	assertClose(r3.v, Math.atan(-3), 1e-15);
	assertClose(r3.d, 0.75, 1e-15);
});

test('edge cases: negative zero, tiny values, near +/-1, and huge values', () => {
	const negZero = arctanDualIterative({ v: -0, d: 1 });
	assert.ok(Object.is(negZero.v, -0), 'preserves -0 for value');
	assert.equal(negZero.d, 1);

	const tiny = arctanDualIterative({ v: 1e-14, d: 2 });
	assertClose(tiny.v, 1e-14, 1e-28);
	assertClose(tiny.d, 2, 1e-15);

	const subnormal = arctanDualIterative({ v: Number.MIN_VALUE, d: 1 });
	assert.equal(subnormal.v, Number.MIN_VALUE);
	assert.equal(subnormal.d, 1);

	for (const v of [0.9999999, 1.0000001, -0.9999999, -1.0000001]) {
		const res = arctanDualIterative({ v, d: 1 });
		assertClose(res.v, Math.atan(v), 1e-14, `near boundary v=${v}`);
		assertClose(res.d, 1 / (1 + v * v), 1e-15, `near boundary d for v=${v}`);
	}

	const large = arctanDualIterative({ v: 1e100, d: 1 });
	assertClose(large.v, Math.PI / 2, 1e-15);
	assert.equal(large.d, 1e-200);

	const negMax = arctanDualIterative({ v: -Number.MAX_VALUE, d: 1 });
	assertClose(negMax.v, -Math.PI / 2, 1e-15);
	assert.equal(negMax.d, 0);

	// Overflow-safe derivative when v^2 overflows Number.MAX_VALUE but d / v^2 is finite
	const huge = arctanDualIterative({ v: 1e155, d: 1e308 });
	assertClose(huge.v, Math.PI / 2, 1e-15);
	assertClose(huge.d, 0.01, 1e-15, 'overflow-safe derivative');
});

test('does not mutate input dual number object', () => {
	const input = Object.freeze({ v: 0.75, d: -2.5 });
	const out = arctanDualIterative(input);
	assert.equal(input.v, 0.75);
	assert.equal(input.d, -2.5);
	assertClose(out.v, Math.atan(0.75), 1e-15);
	assertClose(out.d, -2.5 / (1 + 0.75 * 0.75), 1e-15);
});

test('optional iteration controls (maxIterations and tolerance)', () => {
	const accurate = arctanDualIterative({ v: 0.5, d: 1 }, { maxIterations: 50, tolerance: 1e-12 });
	assertClose(accurate.v, Math.atan(0.5), 1e-11);
	assertClose(accurate.d, 1 / 1.25, 1e-15);

	const oneStep = arctanDualIterative({ v: 0.1, d: 1 }, { maxIterations: 1 });
	assertClose(oneStep.v, 0.1, 1e-15);
	assertClose(oneStep.d, 1 / 1.01, 1e-15);
});

test('invalid dual number inputs throw TypeError or RangeError', () => {
	for (const bad of [null, undefined, 0, 1, '1', true, [], [1, 1]]) {
		assert.throws(() => arctanDualIterative(bad), TypeError);
	}

	for (const bad of [
		{},
		{ v: 1 },
		{ d: 1 },
		{ v: '1', d: 1 },
		{ v: 1, d: '1' },
		{ v: null, d: 1 },
		{ v: 1, d: undefined },
	]) {
		assert.throws(() => arctanDualIterative(bad), TypeError);
	}

	for (const bad of [
		{ v: Number.NaN, d: 1 },
		{ v: 1, d: Number.NaN },
		{ v: Number.POSITIVE_INFINITY, d: 1 },
		{ v: Number.NEGATIVE_INFINITY, d: 1 },
		{ v: 1, d: Number.POSITIVE_INFINITY },
		{ v: 1, d: Number.NEGATIVE_INFINITY },
	]) {
		assert.throws(() => arctanDualIterative(bad), RangeError);
	}
});

test('invalid options throw TypeError or RangeError', () => {
	const valid = { v: 0.5, d: 1 };

	for (const badOpts of [null, 42, 'opts', []]) {
		assert.throws(() => arctanDualIterative(valid, badOpts), TypeError);
	}

	assert.throws(() => arctanDualIterative(valid, { maxIterations: '10' }), TypeError);
	assert.throws(() => arctanDualIterative(valid, { tolerance: '1e-6' }), TypeError);

	for (const maxIterations of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => arctanDualIterative(valid, { maxIterations }), RangeError);
	}

	for (const tolerance of [-1e-6, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => arctanDualIterative(valid, { tolerance }), RangeError);
	}
});

test('cross-check against Math.atan across a wide domain', () => {
	const samples = [
		-1000, -50, -10, -2.5, -1.2, -0.8, -0.5, -0.125, -0.01, -1e-6,
		0, 1e-6, 0.01, 0.125, 0.5, 0.8, 1.2, 2.5, 10, 50, 1000,
	];

	for (const v of samples) {
		const res = arctanDualIterative({ v, d: 1 });
		assertClose(res.v, Math.atan(v), 1e-14, `Math.atan cross-check at v=${v}`);
	}
});

test('independent cross-check: central finite-difference derivative approximation', () => {
	const h = 1e-6;
	const testCases = [
		{ v: -4.2, d: 1.5 },
		{ v: -0.7, d: -2.3 },
		{ v: 0, d: 3.1 },
		{ v: 0.35, d: 0.8 },
		{ v: 1.5, d: -4.0 },
		{ v: 8.75, d: 2.2 },
	];

	for (const { v, d } of testCases) {
		const res = arctanDualIterative({ v, d });
		const fPlus = arctanDualIterative({ v: v + h, d: 0 }).v;
		const fMinus = arctanDualIterative({ v: v - h, d: 0 }).v;
		const numericDeriv = ((fPlus - fMinus) / (2 * h)) * d;
		assertClose(res.d, numericDeriv, 1e-9, `finite-difference check at v=${v}, d=${d}`);
	}
});

test('independent cross-check: trigonometric and algebraic identities', () => {
	const positiveValues = [0.05, 0.25, 0.7, 1.0, 1.8, 4.5, 25];

	for (const v of positiveValues) {
		const pos = arctanDualIterative({ v, d: 1 });
		const neg = arctanDualIterative({ v: -v, d: 1 });

		// Odd value symmetry, even derivative symmetry
		assertClose(pos.v + neg.v, 0, 1e-15, `odd symmetry at v=${v}`);
		assertClose(pos.d, neg.d, 1e-15, `even derivative symmetry at v=${v}`);

		// Reciprocal identity: arctan(v) + arctan(1/v) = pi/2
		// and derivative of arctan(v) + arctan(1/v) wrt v is 0
		const inv = arctanDualIterative({ v: 1 / v, d: -1 / (v * v) });
		assertClose(pos.v + inv.v, Math.PI / 2, 1e-14, `reciprocal value identity at v=${v}`);
		assertClose(pos.d + inv.d, 0, 1e-14, `reciprocal derivative identity at v=${v}`);

		// Inverse of tan: tan(arctan(v)) = v
		assertClose(Math.tan(pos.v), v, 1e-12 * Math.max(1, v), `tan(arctan(v)) at v=${v}`);
	}
});
