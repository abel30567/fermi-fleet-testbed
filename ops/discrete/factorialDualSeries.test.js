import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialDualSeries } from './factorialDualSeries.js';

const EULER_GAMMA = 0.5772156649015328606;

/**
 * Helper to assert two numbers agree within a relative/absolute tolerance.
 */
function assertClose(actual, expected, tol = 1e-12, msg = '') {
	const scale = Math.max(1, Math.abs(expected));
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tol * scale,
		`${msg ? msg + ': ' : ''}expected ${expected}, got ${actual} (diff=${diff}, tol=${tol * scale})`,
	);
}

/**
 * Dual number multiplication: (a.v + a.d*e)(b.v + b.d*e) = a.v*b.v + (a.v*b.d + a.d*b.v)*e.
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	};
}

describe('factorialDualSeries', () => {
	describe('normal cases: non-negative integers', () => {
		it('computes 0! and 1! with exact closed-form derivatives', () => {
			const r0 = factorialDualSeries({ v: 0, d: 1 });
			assert.equal(r0.v, 1);
			assertClose(r0.d, -EULER_GAMMA, 1e-15);

			const r1 = factorialDualSeries({ v: 1, d: 1 });
			assert.equal(r1.v, 1);
			assertClose(r1.d, 1 - EULER_GAMMA, 1e-15);
		});

		it('computes small integer factorials and derivatives', () => {
			const expected = [
				{ n: 2, v: 2, d: 2 * (1.5 - EULER_GAMMA) },
				{ n: 3, v: 6, d: 6 * (11 / 6 - EULER_GAMMA) },
				{ n: 4, v: 24, d: 24 * (25 / 12 - EULER_GAMMA) },
				{ n: 5, v: 120, d: 120 * (137 / 60 - EULER_GAMMA) },
				{ n: 10, v: 3628800, d: 3628800 * (7381 / 2520 - EULER_GAMMA) },
			];

			for (const { n, v, d } of expected) {
				const res = factorialDualSeries({ v: n, d: 1 });
				assert.equal(res.v, v, `v at n=${n}`);
				assertClose(res.d, d, 1e-14, `d at n=${n}`);
			}
		});

		it('respects linearity in the dual tangent component d (chain rule)', () => {
			const base = factorialDualSeries({ v: 6, d: 1 });
			for (const scale of [-3.5, -1, 0, 0.25, 7]) {
				const scaled = factorialDualSeries({ v: 6, d: scale });
				assert.equal(scaled.v, base.v);
				assertClose(scaled.d, scale * base.d, 1e-14, `scale=${scale}`);
			}
		});
	});

	describe('normal cases: non-integer real arguments (Gamma continuation)', () => {
		it('matches exact analytical values at half-integers', () => {
			const sqrtPi = Math.sqrt(Math.PI);
			const ln2 = Math.LN2;

			// (-0.5)! = Gamma(0.5) = sqrt(pi), psi(0.5) = -gamma - 2*ln(2)
			const rNegHalf = factorialDualSeries({ v: -0.5, d: 1 });
			assertClose(rNegHalf.v, sqrtPi, 1e-13, '(-0.5)! v');
			assertClose(rNegHalf.d, sqrtPi * (-EULER_GAMMA - 2 * ln2), 1e-13, '(-0.5)! d');

			// (0.5)! = Gamma(1.5) = sqrt(pi)/2, psi(1.5) = 2 - gamma - 2*ln(2)
			const rHalf = factorialDualSeries({ v: 0.5, d: 1 });
			assertClose(rHalf.v, sqrtPi / 2, 1e-13, '(0.5)! v');
			assertClose(rHalf.d, (sqrtPi / 2) * (2 - EULER_GAMMA - 2 * ln2), 1e-13, '(0.5)! d');

			// (1.5)! = Gamma(2.5) = 3*sqrt(pi)/4, psi(2.5) = 8/3 - gamma - 2*ln(2)
			const rThreeHalves = factorialDualSeries({ v: 1.5, d: 1 });
			assertClose(rThreeHalves.v, (3 * sqrtPi) / 4, 1e-13, '(1.5)! v');
			assertClose(
				rThreeHalves.d,
				((3 * sqrtPi) / 4) * (8 / 3 - EULER_GAMMA - 2 * ln2),
				1e-13,
				'(1.5)! d',
			);

			// (-1.5)! = Gamma(-0.5) = -2*sqrt(pi), psi(-0.5) = 2 - gamma - 2*ln(2)
			const rNegThreeHalves = factorialDualSeries({ v: -1.5, d: 1 });
			assertClose(rNegThreeHalves.v, -2 * sqrtPi, 1e-13, '(-1.5)! v');
			assertClose(
				rNegThreeHalves.d,
				-2 * sqrtPi * (2 - EULER_GAMMA - 2 * ln2),
				1e-13,
				'(-1.5)! d',
			);
		});
	});

	describe('edge cases', () => {
		it('handles d = 0 cleanly without NaN even when value overflows', () => {
			assert.deepEqual(factorialDualSeries({ v: 0, d: 0 }), { v: 1, d: 0 });
			assert.deepEqual(factorialDualSeries({ v: 171, d: 0 }), { v: Infinity, d: 0 });
			assert.deepEqual(factorialDualSeries({ v: 171.5, d: 0 }), { v: Infinity, d: 0 });
		});

		it('handles negative zero inputs cleanly', () => {
			const res = factorialDualSeries({ v: -0, d: 1 });
			assert.equal(res.v, 1);
			assertClose(res.d, -EULER_GAMMA, 1e-15);
		});

		it('stays finite at the largest float64 integer factorial n = 170', () => {
			const res = factorialDualSeries({ v: 170, d: 1 });
			assert.ok(Number.isFinite(res.v), '170! v should be finite');
			assert.ok(Number.isFinite(res.d), '170! d should be finite');
			assertClose(res.v, 7.257415615307999e306, 1e-14);
		});

		it('returns signed Infinity on float64 overflow for v >= 171', () => {
			const pos = factorialDualSeries({ v: 171, d: 1 });
			assert.equal(pos.v, Infinity);
			assert.equal(pos.d, Infinity);

			const neg = factorialDualSeries({ v: 171, d: -2 });
			assert.equal(neg.v, Infinity);
			assert.equal(neg.d, -Infinity);

			const realOverflow = factorialDualSeries({ v: 171.25, d: 1 });
			assert.equal(realOverflow.v, Infinity);
			assert.equal(realOverflow.d, Infinity);
		});

		it('underflows cleanly to {v: 0, d: 0} for large negative non-integers', () => {
			const res = factorialDualSeries({ v: -180.5, d: 1 });
			assert.equal(res.v, 0);
			assert.equal(res.d, 0);
		});

		it('stays accurate near the minimum of Gamma(x + 1) around x ~= 0.461632145', () => {
			// psi(x_min + 1) = 0 at x_min ~= 0.46163214496836234
			const res = factorialDualSeries({ v: 0.46163214496836234, d: 1 });
			assertClose(res.v, 0.8856031944108887, 1e-13);
			assert.ok(Math.abs(res.d) < 1e-13, `expected derivative near 0, got ${res.d}`);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError for non-object or malformed dual inputs', () => {
			for (const bad of [null, undefined, 5, '5', true, [], [1, 2], {}, { v: 1 }, { d: 1 }, { v: '1', d: 0 }, { v: 1, d: '0' }]) {
				assert.throws(() => factorialDualSeries(bad), TypeError, `should throw TypeError for ${JSON.stringify(bad)}`);
			}
		});

		it('throws RangeError for NaN or non-finite components', () => {
			for (const bad of [
				{ v: NaN, d: 1 },
				{ v: 1, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 1, d: Infinity },
				{ v: 1, d: -Infinity },
			]) {
				assert.throws(() => factorialDualSeries(bad), RangeError);
			}
		});

		it('throws RangeError at negative integer poles', () => {
			for (const pole of [-1, -2, -3, -10, -100]) {
				assert.throws(
					() => factorialDualSeries({ v: pole, d: 1 }),
					RangeError,
					`should throw RangeError at pole v=${pole}`,
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies the dual-number recurrence (x + 1)! = (x + 1) * x! iteratively from n = 0', () => {
			let cur = { v: 1, d: -EULER_GAMMA }; // (0 + 1*eps)!
			for (let n = 1; n <= 25; n++) {
				cur = dualMul({ v: n, d: 1 }, cur);
				const actual = factorialDualSeries({ v: n, d: 1 });
				assertClose(actual.v, cur.v, 1e-13, `recurrence v at n=${n}`);
				assertClose(actual.d, cur.d, 1e-13, `recurrence d at n=${n}`);
			}
		});

		it('satisfies the dual functional equation (x + 1)! = (x + 1) * x! for non-integers', () => {
			for (const x of [-3.3, -1.7, -0.25, 0.3, 2.75, 11.4, 25.6]) {
				const fx = factorialDualSeries({ v: x, d: 1.5 });
				const fxPlus1 = factorialDualSeries({ v: x + 1, d: 1.5 });
				const expected = dualMul({ v: x + 1, d: 1.5 }, fx);
				assertClose(fxPlus1.v, expected.v, 1e-12, `functional eq v at x=${x}`);
				assertClose(fxPlus1.d, expected.d, 1e-12, `functional eq d at x=${x}`);
			}
		});

		it('matches central finite differences of the value component across integers and reals', () => {
			const h = 1e-6;
			for (const x of [-2.4, -0.6, 0, 1, 3, 5, 12, 4.25, 15.8]) {
				const res = factorialDualSeries({ v: x, d: 1 });
				const plus = factorialDualSeries({ v: x + h, d: 0 }).v;
				const minus = factorialDualSeries({ v: x - h, d: 0 }).v;
				const fd = (plus - minus) / (2 * h);
				assertClose(res.d, fd, 1e-7, `finite-diff cross-check at x=${x}`);
			}
		});

		it('satisfies Euler reflection identity in dual arithmetic: x! * (-x)! = pi*x / sin(pi*x)', () => {
			for (const x of [0.2, 0.37, 0.75, 1.3, 2.6]) {
				const pos = factorialDualSeries({ v: x, d: 1 });
				const neg = factorialDualSeries({ v: -x, d: -1 });
				const prod = dualMul(pos, neg);

				const px = Math.PI * x;
				const s = Math.sin(px);
				const c = Math.cos(px);
				const expectedV = px / s;
				const expectedD = (Math.PI * (s - px * c)) / (s * s);

				assertClose(prod.v, expectedV, 1e-12, `reflection v at x=${x}`);
				assertClose(prod.d, expectedD, 1e-12, `reflection d at x=${x}`);
			}
		});
	});
});
