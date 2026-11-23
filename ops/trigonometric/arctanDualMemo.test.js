import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arctanDualMemo } from './arctanDualMemo.js';

function assertClose(actual, expected, tol = 1e-12, msg = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${msg ? `${msg}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	);
}

describe('arctanDualMemo', () => {
	describe('normal cases', () => {
		it('computes value and derivative for positive and negative real inputs', () => {
			const samples = [
				{ v: 0.5, d: 1 },
				{ v: -0.5, d: 1 },
				{ v: 2, d: 3 },
				{ v: -2, d: -4 },
				{ v: 0.123456789, d: 2.5 },
				{ v: -3.7, d: 0.75 },
				{ v: 5.25, d: -1.5 },
				{ v: -12.34, d: 6.78 },
			];

			for (const x of samples) {
				const res = arctanDualMemo(x);
				const expectedV = Math.atan(x.v);
				const expectedD = x.d / (1 + x.v * x.v);
				assertClose(res.v, expectedV, 1e-15, `v for ${JSON.stringify(x)}`);
				assertClose(res.d, expectedD, 1e-15, `d for ${JSON.stringify(x)}`);
			}
		});

		it('handles zero derivative cleanly for arbitrary primal values', () => {
			for (const v of [-10, -1, 0, 0.37, 4.5, 1e6]) {
				const res = arctanDualMemo({ v, d: 0 });
				assertClose(res.v, Math.atan(v), 1e-15);
				assert.ok(Object.is(res.d, 0));
			}
		});

		it('respects linearity in the derivative component d', () => {
			const v = 1.37;
			const base = arctanDualMemo({ v, d: 1 });
			for (const scale of [-5, -0.25, 0, 2.5, 100]) {
				const scaled = arctanDualMemo({ v, d: scale });
				assert.equal(scaled.v, base.v);
				assertClose(scaled.d, base.d * scale, 1e-14);
			}
		});

		it('preserves odd symmetry of atan and even symmetry of its derivative', () => {
			for (const v of [0.1, 0.73, 1, Math.sqrt(3), 2.5, 10, 1000]) {
				const pos = arctanDualMemo({ v, d: 1 });
				const neg = arctanDualMemo({ v: -v, d: 1 });
				assertClose(pos.v, -neg.v, 1e-15);
				assertClose(pos.d, neg.d, 1e-15);
			}
		});
	});

	describe('special values', () => {
		it('handles 0 and -0 accurately without producing -0', () => {
			const r0 = arctanDualMemo({ v: 0, d: 1 });
			assert.ok(Object.is(r0.v, 0));
			assert.equal(r0.d, 1);

			const rNeg0 = arctanDualMemo({ v: -0, d: -0 });
			assert.ok(Object.is(rNeg0.v, 0));
			assert.ok(Object.is(rNeg0.d, 0));
		});

		it('handles ±1 and exact trigonometric constants', () => {
			const rPos1 = arctanDualMemo({ v: 1, d: 1 });
			assert.equal(rPos1.v, Math.PI / 4);
			assert.equal(rPos1.d, 0.5);

			const rNeg1 = arctanDualMemo({ v: -1, d: 2 });
			assert.equal(rNeg1.v, -Math.PI / 4);
			assert.equal(rNeg1.d, 1);

			const rSqrt3 = arctanDualMemo({ v: Math.sqrt(3), d: 4 });
			assert.equal(rSqrt3.v, Math.PI / 3);
			assert.equal(rSqrt3.d, 1);

			const rNegSqrt3 = arctanDualMemo({ v: -Math.sqrt(3), d: 4 });
			assert.equal(rNegSqrt3.v, -Math.PI / 3);
			assert.equal(rNegSqrt3.d, 1);

			const rInvSqrt3 = arctanDualMemo({ v: 1 / Math.sqrt(3), d: 4 });
			assert.equal(rInvSqrt3.v, Math.PI / 6);
			assertClose(rInvSqrt3.d, 3, 1e-15);

			const rNegInvSqrt3 = arctanDualMemo({ v: -1 / Math.sqrt(3), d: -4 });
			assert.equal(rNegInvSqrt3.v, -Math.PI / 6);
			assertClose(rNegInvSqrt3.d, -3, 1e-15);
		});

		it('handles very small and very large values without overflow', () => {
			const tiny = arctanDualMemo({ v: 1e-12, d: 1 });
			assertClose(tiny.v, 1e-12, 1e-24);
			assertClose(tiny.d, 1, 1e-15);

			const largePos = arctanDualMemo({ v: 1e8, d: 1 });
			assertClose(largePos.v, Math.PI / 2 - 1e-8, 1e-15);
			assertClose(largePos.d, 1e-16, 1e-28);

			const largeNeg = arctanDualMemo({ v: -1e8, d: 1 });
			assertClose(largeNeg.v, -Math.PI / 2 + 1e-8, 1e-15);
			assertClose(largeNeg.d, 1e-16, 1e-28);

			// Overflow-safe derivative when |v| > 1e150 and d is large
			const hugeNoOverflow = arctanDualMemo({ v: 1e160, d: 1e300 });
			assertClose(hugeNoOverflow.v, Math.PI / 2, 1e-15);
			assertClose(hugeNoOverflow.d, 1e-20, 1e-34);

			const maxVal = arctanDualMemo({ v: Number.MAX_VALUE, d: 1 });
			assert.equal(maxVal.v, Math.PI / 2);
			assert.ok(Object.is(maxVal.d, 0));

			const negMaxVal = arctanDualMemo({ v: -Number.MAX_VALUE, d: -1 });
			assert.equal(negMaxVal.v, -Math.PI / 2);
			assert.ok(Object.is(negMaxVal.d, 0));
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-object, null, array, or missing arguments', () => {
			assert.throws(() => arctanDualMemo(), TypeError);
			assert.throws(() => arctanDualMemo(null), TypeError);
			assert.throws(() => arctanDualMemo(undefined), TypeError);
			assert.throws(() => arctanDualMemo(1), TypeError);
			assert.throws(() => arctanDualMemo('0.5'), TypeError);
			assert.throws(() => arctanDualMemo([0.5, 1]), TypeError);
			assert.throws(() => arctanDualMemo(true), TypeError);
		});

		it('throws TypeError when v or d are missing or non-numeric', () => {
			assert.throws(() => arctanDualMemo({}), TypeError);
			assert.throws(() => arctanDualMemo({ v: 1 }), TypeError);
			assert.throws(() => arctanDualMemo({ d: 1 }), TypeError);
			assert.throws(() => arctanDualMemo({ v: '1', d: 1 }), TypeError);
			assert.throws(() => arctanDualMemo({ v: 1, d: '1' }), TypeError);
			assert.throws(() => arctanDualMemo({ v: null, d: 1 }), TypeError);
			assert.throws(() => arctanDualMemo({ v: 1, d: undefined }), TypeError);
		});

		it('throws RangeError for NaN and infinite components', () => {
			assert.throws(() => arctanDualMemo({ v: NaN, d: 1 }), RangeError);
			assert.throws(() => arctanDualMemo({ v: 1, d: NaN }), RangeError);
			assert.throws(() => arctanDualMemo({ v: Infinity, d: 1 }), RangeError);
			assert.throws(() => arctanDualMemo({ v: -Infinity, d: 1 }), RangeError);
			assert.throws(() => arctanDualMemo({ v: 1, d: Infinity }), RangeError);
			assert.throws(() => arctanDualMemo({ v: 1, d: -Infinity }), RangeError);
		});
	});

	describe('precomputed table and memoization behavior', () => {
		it('returns fresh objects on repeated calls so caller mutation cannot corrupt cache', () => {
			const input = { v: 0.777, d: 1.25 };
			const first = arctanDualMemo(input);
			const second = arctanDualMemo(input);

			assert.deepStrictEqual(first, second);
			assert.notStrictEqual(first, second);

			first.v = 999;
			first.d = -999;

			const third = arctanDualMemo(input);
			assert.deepStrictEqual(third, second);
			assert.notStrictEqual(third, second);
		});

		it('returns exact precomputed values across the [-4, 4] binary grid', () => {
			for (let k = -256; k <= 256; k += 1) {
				const v = k / 64;
				const res = arctanDualMemo({ v, d: 1 });
				assert.equal(res.v, Math.atan(v), `grid point v=${v}`);
				assert.equal(res.d, 1 / (1 + v * v), `grid denom v=${v}`);
			}
		});

		it('handles bounded cache eviction gracefully beyond cache capacity', () => {
			const count = 2048;
			const results = [];
			for (let i = 0; i < count; i += 1) {
				const v = 0.00137 * i + 0.000123;
				const res = arctanDualMemo({ v, d: 1 });
				results.push({ v, res });
			}

			// Re-query early (evicted) and recent (cached) entries to ensure consistent accuracy
			for (const idx of [0, 1, 50, 500, 1024, 1500, count - 1]) {
				const { v, res } = results[idx];
				const again = arctanDualMemo({ v, d: 1 });
				assert.deepStrictEqual(again, res);
				assert.notStrictEqual(again, res);
				assertClose(again.v, Math.atan(v), 1e-15);
				assertClose(again.d, 1 / (1 + v * v), 1e-15);
			}
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('matches central finite-difference derivative across wide domain', () => {
			const h = 1e-6;
			const points = [-10, -4.1, -2.3, -1, -0.42, 0, 0.314, 1, 1.732, 3.99, 4.01, 15];

			for (const v of points) {
				const d = 1.7;
				const { d: dualD } = arctanDualMemo({ v, d });
				const approxDeriv = (Math.atan(v + h) - Math.atan(v - h)) / (2 * h);
				assertClose(dualD, approxDeriv * d, 1e-9, `finite diff at v=${v}`);
			}
		});

		it('satisfies tan(arctan(x)) == x in both primal and dual components', () => {
			// For dual y = arctan(x), dual tan(y) = { v: tan(y.v), d: y.d / cos(y.v)^2 } == x
			const testInputs = [
				{ v: 0, d: 1 },
				{ v: 0.25, d: -2.5 },
				{ v: -0.9, d: 3.1 },
				{ v: 1, d: 1 },
				{ v: -1, d: -1 },
				{ v: 2.718281828, d: 0.5 },
				{ v: -7.5, d: 4.2 },
				{ v: 25, d: -0.3 },
			];

			for (const x of testInputs) {
				const y = arctanDualMemo(x);
				const recoveredV = Math.tan(y.v);
				const cosY = Math.cos(y.v);
				const recoveredD = y.d / (cosY * cosY);

				const vTol = Math.max(1e-12, Math.abs(x.v) * 1e-12);
				const dTol = Math.max(1e-12, Math.abs(x.d) * 1e-12);
				assertClose(recoveredV, x.v, vTol, `tan(atan(v)) for v=${x.v}`);
				assertClose(recoveredD, x.d, dTol, `d/dx tan(atan(x)) for v=${x.v}`);
			}
		});

		it('satisfies chain rule for composed dual functions atan(v^2 + 1)', () => {
			// g(t) = t^2 + 1 => g'(t) = 2t
			// d/dt atan(t^2 + 1) = 2t / (1 + (t^2 + 1)^2)
			for (const t of [-3, -1.2, 0, 0.5, 2.4]) {
				const inner = { v: t * t + 1, d: 2 * t };
				const res = arctanDualMemo(inner);
				const expectedV = Math.atan(t * t + 1);
				const expectedD = (2 * t) / (1 + (t * t + 1) ** 2);
				assertClose(res.v, expectedV, 1e-15);
				assertClose(res.d, expectedD, 1e-15);
			}
		});
	});
});
