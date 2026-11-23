import test from 'node:test';
import assert from 'node:assert/strict';
import { powerDualSeries } from './powerDualSeries.js';

function assertClose(actual, expected, tol = 1e-12, msg = '') {
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`${msg ? `${msg}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected}`
	);
}

function assertDualClose(actual, expected, tol = 1e-12, msg = '') {
	assertClose(actual.v, expected.v, tol, `${msg} (v)`);
	assertClose(actual.d, expected.d, tol, `${msg} (d)`);
}

function dualMul(x, y) {
	return { v: x.v * y.v, d: x.v * y.d + x.d * y.v };
}

function dualAdd(x, y) {
	return { v: x.v + y.v, d: x.d + y.d };
}

function dualLn(x) {
	return { v: Math.log(x.v), d: x.d / x.v };
}

function dualExp(x) {
	const ev = Math.exp(x.v);
	return { v: ev, d: ev * x.d };
}

test('powerDualSeries: normal cases with constant exponent and constant base', () => {
	// (x)^3 at x = 2, dx = 1 => v = 8, d = 12
	assert.deepStrictEqual(powerDualSeries({ v: 2, d: 1 }, { v: 3, d: 0 }), { v: 8, d: 12 });

	// (3x)^2 at x = 2 (a = 6, da = 3) => v = 36, d = 2 * 6 * 3 = 36
	assert.deepStrictEqual(powerDualSeries({ v: 6, d: 3 }, 2), { v: 36, d: 36 });

	// sqrt(x) = x^0.5 at x = 9, dx = 2 => v = 3, d = 0.5 * (1/3) * 2 = 1/3
	assertDualClose(powerDualSeries({ v: 9, d: 2 }, 0.5), { v: 3, d: 1 / 3 });

	// 2^x at x = 3, dx = 1 => v = 8, d = 8 * ln(2)
	assertDualClose(powerDualSeries(2, { v: 3, d: 1 }), { v: 8, d: 8 * Math.LN2 });

	// Scalar-scalar shorthand
	assert.deepStrictEqual(powerDualSeries(5, 3), { v: 125, d: 0 });
});

test('powerDualSeries: general dual^dual including self-power x^x', () => {
	// d/dx (x^x) = x^x * (1 + ln(x))
	for (const x of [0.25, 0.5, 1, 2, Math.E, 4.5]) {
		const res = powerDualSeries({ v: x, d: 1 }, { v: x, d: 1 });
		const expectedV = Math.pow(x, x);
		const expectedD = expectedV * (1 + Math.log(x));
		assertDualClose(res, { v: expectedV, d: expectedD }, 1e-12, `x^x at x=${x}`);
	}

	// Both base and exponent vary with arbitrary tangents
	// (2 + 3ε)^(4 - 5ε): v = 16, d = 4*8*3 + 16*ln(2)*(-5) = 96 - 80*ln(2)
	assertDualClose(
		powerDualSeries({ v: 2, d: 3 }, { v: 4, d: -5 }),
		{ v: 16, d: 96 - 80 * Math.LN2 }
	);
});

test('powerDualSeries: negative base with integer exponents', () => {
	// (-2 + ε)^3 = -8 + 12ε
	assert.deepStrictEqual(powerDualSeries({ v: -2, d: 1 }, 3), { v: -8, d: 12 });

	// (-2 + 5ε)^(-2) = 0.25 + 1.25ε
	assertDualClose(powerDualSeries({ v: -2, d: 5 }, -2), { v: 0.25, d: 1.25 });

	// (-3 + 4ε)^0 = 1 + 0ε
	assert.deepStrictEqual(powerDualSeries({ v: -3, d: 4 }, 0), { v: 1, d: 0 });

	// (-3 + 4ε)^1 = -3 + 4ε
	assert.deepStrictEqual(powerDualSeries({ v: -3, d: 4 }, 1), { v: -3, d: 4 });

	// Large even integer exponent on -1 where (b - 1) would lose precision in float64
	assert.deepStrictEqual(powerDualSeries({ v: -1, d: 1 }, 1e20), { v: 1, d: -1e20 });
});

test('powerDualSeries: edge cases (zero base, unit base, near-1 base, -0 normalization)', () => {
	// 0^0 with constant exponent
	assert.deepStrictEqual(powerDualSeries({ v: 0, d: 7 }, { v: 0, d: 0 }), { v: 1, d: 0 });

	// 0^1 preserves base derivative
	assert.deepStrictEqual(powerDualSeries({ v: 0, d: 3.5 }, { v: 1, d: 0 }), { v: 0, d: 3.5 });
	assert.deepStrictEqual(powerDualSeries({ v: 0, d: -2 }, { v: 1, d: 4 }), { v: 0, d: -2 });

	// 0^b for b > 1 has zero value and zero derivative
	assert.deepStrictEqual(powerDualSeries({ v: 0, d: 9 }, { v: 2, d: 3 }), { v: 0, d: 0 });
	assert.deepStrictEqual(powerDualSeries({ v: 0, d: 9 }, { v: 1.5, d: 0 }), { v: 0, d: 0 });

	// 0^b for 0 < b < 1 with constant zero base (da = 0)
	assert.deepStrictEqual(powerDualSeries({ v: 0, d: 0 }, { v: 0.5, d: 2 }), { v: 0, d: 0 });

	// Unit base: (1 + a'ε)^(b + b'ε) = 1 + (b * a')ε (ln(1) = 0 cancels b')
	assert.deepStrictEqual(powerDualSeries({ v: 1, d: 2.5 }, { v: 4, d: 100 }), { v: 1, d: 10 });

	// Base very close to 1 (tests log1p accuracy)
	const eps = 1e-12;
	const nearOne = powerDualSeries({ v: 1 + eps, d: 0 }, { v: 2, d: 1 });
	assertDualClose(nearOne, { v: Math.pow(1 + eps, 2), d: Math.pow(1 + eps, 2) * Math.log1p(eps) }, 1e-14);

	// -0 normalization
	const z = powerDualSeries({ v: -0, d: -0 }, { v: 2, d: -0 });
	assert.ok(Object.is(z.v, 0));
	assert.ok(Object.is(z.d, 0));
	const negZeroDeriv = powerDualSeries({ v: 2, d: -0 }, { v: -3, d: 0 });
	assert.ok(Object.is(negZeroDeriv.d, 0));
});

test('powerDualSeries: cross-check against central finite-difference derivatives', () => {
	const cases = [
		[{ v: 2.5, d: 1.3 }, { v: 3.7, d: -0.9 }],
		[{ v: 0.4, d: -2.1 }, { v: -1.5, d: 0.6 }],
		[{ v: 7.2, d: 0.5 }, { v: 0.25, d: 1.75 }],
		[{ v: 1.001, d: 0.8 }, { v: -0.3, d: 4.2 }],
		[{ v: -2.5, d: 1.4 }, { v: 3, d: 0 }],
		[{ v: -1.7, d: -0.8 }, { v: -4, d: 0 }],
	];

	const h = 1e-6;
	for (const [A, B] of cases) {
		const res = powerDualSeries(A, B);
		const f = (t) => Math.pow(A.v + A.d * t, B.v + B.d * t);
		const fd = (f(h) - f(-h)) / (2 * h);
		assertClose(res.v, f(0), 1e-12, `primal for A=${JSON.stringify(A)}, B=${JSON.stringify(B)}`);
		assertClose(res.d, fd, 1e-7, `finite-diff derivative for A=${JSON.stringify(A)}, B=${JSON.stringify(B)}`);
	}
});

test('powerDualSeries: cross-check against dual algebraic identities and exp(B * ln(A))', () => {
	const A = { v: 2.3, d: 0.7 };
	const A2 = { v: 1.9, d: -0.4 };
	const B1 = { v: 1.4, d: -0.5 };
	const B2 = { v: 0.8, d: 1.1 };

	// Identity 1: A^B === exp(B * ln(A))
	assertDualClose(powerDualSeries(A, B1), dualExp(dualMul(B1, dualLn(A))), 1e-12, 'exp(B*ln(A))');

	// Identity 2: A^(B1 + B2) === A^B1 * A^B2
	assertDualClose(
		powerDualSeries(A, dualAdd(B1, B2)),
		dualMul(powerDualSeries(A, B1), powerDualSeries(A, B2)),
		1e-12,
		'A^(B1+B2) = A^B1 * A^B2'
	);

	// Identity 3: (A^B1)^B2 === A^(B1 * B2)
	assertDualClose(
		powerDualSeries(powerDualSeries(A, B1), B2),
		powerDualSeries(A, dualMul(B1, B2)),
		1e-12,
		'(A^B1)^B2 = A^(B1*B2)'
	);

	// Identity 4: (A * A2)^B1 === A^B1 * A2^B1
	assertDualClose(
		powerDualSeries(dualMul(A, A2), B1),
		dualMul(powerDualSeries(A, B1), powerDualSeries(A2, B1)),
		1e-12,
		'(A*A2)^B1 = A^B1 * A2^B1'
	);

	// Identity 5: A^B1 * A^(-B1) === 1 + 0ε
	assertDualClose(
		dualMul(powerDualSeries(A, B1), powerDualSeries(A, { v: -B1.v, d: -B1.d })),
		{ v: 1, d: 0 },
		1e-12,
		'A^B * A^(-B) = 1'
	);

	// Identity 6: (A^(1/3))^3 === A
	assertDualClose(
		powerDualSeries(powerDualSeries(A, 1 / 3), 3),
		A,
		1e-12,
		'(A^(1/3))^3 = A'
	);

	// Identity 7: integer power matches repeated dual multiplication (positive and negative bases)
	for (const base of [{ v: 1.7, d: -0.6 }, { v: -2.2, d: 0.9 }]) {
		let acc = { v: 1, d: 0 };
		for (let n = 0; n <= 6; n++) {
			assertDualClose(powerDualSeries(base, n), acc, 1e-12, `repeated mul n=${n}`);
			acc = dualMul(acc, base);
		}
	}
});

test('powerDualSeries: input validation and domain errors', () => {
	// Type errors
	assert.throws(() => powerDualSeries(null, 2), TypeError);
	assert.throws(() => powerDualSeries(undefined, 2), TypeError);
	assert.throws(() => powerDualSeries('2', 2), TypeError);
	assert.throws(() => powerDualSeries([2, 1], 2), TypeError);
	assert.throws(() => powerDualSeries({ v: 2 }, 2), TypeError);
	assert.throws(() => powerDualSeries({ v: 2, d: '1' }, 2), TypeError);
	assert.throws(() => powerDualSeries({ v: 2, d: 1 }, null), TypeError);
	assert.throws(() => powerDualSeries({ v: 2, d: 1 }, { v: 3 }), TypeError);

	// Non-finite inputs
	assert.throws(() => powerDualSeries(NaN, 2), RangeError);
	assert.throws(() => powerDualSeries(Infinity, 2), RangeError);
	assert.throws(() => powerDualSeries({ v: 2, d: NaN }, 2), RangeError);
	assert.throws(() => powerDualSeries({ v: 2, d: 1 }, { v: 2, d: -Infinity }), RangeError);

	// Domain / singularity errors
	assert.throws(() => powerDualSeries({ v: -2, d: 1 }, 0.5), RangeError);
	assert.throws(() => powerDualSeries({ v: -2, d: 0 }, { v: 2, d: 1 }), RangeError);
	assert.throws(() => powerDualSeries({ v: 0, d: 1 }, -1), RangeError);
	assert.throws(() => powerDualSeries({ v: 0, d: 1 }, 0.5), RangeError);
	assert.throws(() => powerDualSeries({ v: 0, d: 0 }, { v: 0, d: 1 }), RangeError);

	// Overflow
	assert.throws(() => powerDualSeries({ v: 1e200, d: 1 }, 10), RangeError);
});
