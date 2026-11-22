import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tanDualIterative } from './tanDualIterative.js';

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-14, label = '') {
	const diff = Math.abs(actual - expected);
	const tol = Math.max(absTol, relTol * Math.abs(expected));
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	);
}

describe('tanDualIterative', () => {
	describe('normal cases', () => {
		test('evaluates exact known angles (0, ±π/4, ±π/6, ±π/3)', () => {
			const atZero = tanDualIterative({ v: 0, d: 1 });
			assert.equal(atZero.v, 0);
			assert.equal(atZero.d, 1);

			const atPiOver4 = tanDualIterative({ v: Math.PI / 4, d: 1 });
			assertClose(atPiOver4.v, 1, 1e-14, 1e-14, 'tan(π/4)');
			assertClose(atPiOver4.d, 2, 1e-14, 1e-14, 'sec²(π/4)');

			const atNegPiOver4 = tanDualIterative({ v: -Math.PI / 4, d: 2.5 });
			assertClose(atNegPiOver4.v, -1, 1e-14, 1e-14, 'tan(-π/4)');
			assertClose(atNegPiOver4.d, 5, 1e-14, 1e-14, 'sec²(-π/4) * 2.5');

			const atPiOver3 = tanDualIterative({ v: Math.PI / 3, d: -1.5 });
			assertClose(atPiOver3.v, Math.sqrt(3), 1e-14, 1e-14, 'tan(π/3)');
			assertClose(atPiOver3.d, -6, 1e-14, 1e-14, 'sec²(π/3) * -1.5');

			const atPiOver6 = tanDualIterative({ v: Math.PI / 6, d: 3 });
			assertClose(atPiOver6.v, 1 / Math.sqrt(3), 1e-14, 1e-14, 'tan(π/6)');
			assertClose(atPiOver6.d, 4, 1e-14, 1e-14, 'sec²(π/6) * 3');
		});

		test('evaluates angles across all four quadrants with arbitrary derivatives', () => {
			const cases = [
				{ v: 0.35, d: 1 },
				{ v: 2.15, d: -2.25 },
				{ v: 3.9, d: 0.5 },
				{ v: 5.75, d: 4.1 },
				{ v: -1.1, d: -0.75 },
				{ v: -2.6, d: 3.3 }
			];

			for (const { v, d } of cases) {
				const res = tanDualIterative({ v, d });
				const expectedV = Math.tan(v);
				const expectedD = d / (Math.cos(v) ** 2);
				assertClose(res.v, expectedV, 1e-13, 1e-14, `v at ${v}`);
				assertClose(res.d, expectedD, 1e-13, 1e-14, `d at ${v}`);
			}
		});

		test('preserves chain rule for composite function tan(t² + 0.3)', () => {
			const t = 0.8;
			const inner = { v: t * t + 0.3, d: 2 * t };
			const res = tanDualIterative(inner);
			const expectedV = Math.tan(inner.v);
			const expectedD = (1 + expectedV * expectedV) * (2 * t);
			assertClose(res.v, expectedV, 1e-14, 1e-14, 'composite primal');
			assertClose(res.d, expectedD, 1e-14, 1e-14, 'composite derivative');
		});
	});

	describe('edge cases', () => {
		test('handles zero derivative d = 0', () => {
			for (const v of [0, 0.5, -Math.PI / 4, 2.3, 100]) {
				const res = tanDualIterative({ v, d: 0 });
				assertClose(res.v, Math.tan(v), 1e-13, 1e-14, `v at ${v}`);
				assert.equal(res.d, 0);
			}
		});

		test('handles integer multiples of π', () => {
			for (const k of [-4, -1, 1, 2, 7]) {
				const v = k * Math.PI;
				const res = tanDualIterative({ v, d: 2.5 });
				assertClose(res.v, Math.tan(v), 1e-12, 1e-14, `tan(${k}π)`);
				assertClose(res.d, 2.5, 1e-13, 1e-14, `sec²(${k}π) * 2.5`);
			}
		});

		test('maintains accuracy for large positive and negative angles', () => {
			const largeAngles = [1e3, -1e3, 1e5, -1e6, 1e8, -1e10, 1e12];
			for (const v of largeAngles) {
				const d = 1.75;
				const res = tanDualIterative({ v, d });
				const expectedV = Math.tan(v);
				const expectedD = (1 + expectedV * expectedV) * d;
				assertClose(res.v, expectedV, 1e-12, 1e-13, `large angle v=${v}`);
				assertClose(res.d, expectedD, 1e-12, 1e-13, `large angle d=${v}`);
			}
		});

		test('handles angles very close to poles while outside |cos(v)| < 1e-15', () => {
			const nearPoles = [
				Math.PI / 2 - 1e-6,
				Math.PI / 2 + 1e-6,
				-Math.PI / 2 + 1e-8,
				3 * Math.PI / 2 - 1e-9
			];
			for (const v of nearPoles) {
				const res = tanDualIterative({ v, d: 1 });
				const expectedV = Math.tan(v);
				const expectedD = 1 + expectedV * expectedV;
				assertClose(res.v, expectedV, 1e-7, 1e-12, `near pole v=${v}`);
				assertClose(res.d, expectedD, 1e-6, 1e-12, `near pole d=${v}`);
			}
		});

		test('throws RangeError at poles and within |cos(v)| < 1e-15', () => {
			const poles = [
				Math.PI / 2,
				-Math.PI / 2,
				(3 * Math.PI) / 2,
				(-3 * Math.PI) / 2,
				(5 * Math.PI) / 2,
				Math.PI / 2 + 1e-16,
				Math.PI / 2 - 1e-16
			];
			for (const v of poles) {
				assert.throws(
					() => tanDualIterative({ v, d: 1 }),
					RangeError,
					`Expected RangeError at pole v=${v}`
				);
			}
		});

		test('throws RangeError when derivative overflows to non-finite near a pole', () => {
			assert.throws(
				() => tanDualIterative({ v: Math.PI / 2 - 1e-12, d: 1e300 }),
				RangeError
			);
		});

		test('respects odd symmetry for primal and even symmetry for derivative', () => {
			for (const v of [0.2, 0.9, 1.3, 2.4]) {
				const pos = tanDualIterative({ v, d: 1.5 });
				const neg = tanDualIterative({ v: -v, d: 1.5 });
				assertClose(neg.v, -pos.v, 1e-14, 1e-14, `odd primal at ${v}`);
				assertClose(neg.d, pos.d, 1e-14, 1e-14, `even derivative at ${v}`);
			}
		});

		test('throws TypeError on invalid dual objects and non-finite inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				0,
				'0',
				true,
				[0, 1],
				() => {},
				{},
				{ v: 0 },
				{ d: 1 },
				{ v: '0', d: 1 },
				{ v: 0, d: '1' },
				{ v: null, d: 1 },
				{ v: 0, d: undefined },
				{ v: NaN, d: 1 },
				{ v: 0, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 0, d: Infinity },
				{ v: 0, d: -Infinity }
			];

			for (const input of invalidInputs) {
				assert.throws(
					() => tanDualIterative(input),
					TypeError,
					`Expected TypeError for input: ${String(input)}`
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		test('cross-checks against Math.tan and identity 1 + tan²(v) across [-10, 10]', () => {
			for (let i = -100; i <= 100; i += 1) {
				const v = i * 0.1;
				if (Math.abs(Math.cos(v)) < 1e-3) {
					continue;
				}
				const d = 0.7 - 0.01 * i;
				const res = tanDualIterative({ v, d });
				const refTan = Math.tan(v);
				const refDeriv = (1 + refTan * refTan) * d;
				assertClose(res.v, refTan, 1e-13, 1e-14, `Math.tan cross-check v=${v}`);
				assertClose(res.d, refDeriv, 1e-13, 1e-14, `1 + tan²(v) cross-check v=${v}`);
			}
		});

		test('cross-checks derivative against central finite-difference numerical derivative', () => {
			const h = 1e-6;
			const testPoints = [
				{ v: -2.4, d: 1 },
				{ v: -0.8, d: -2.3 },
				{ v: 0, d: 1.5 },
				{ v: 0.65, d: 3.2 },
				{ v: 1.2, d: 0.4 },
				{ v: 2.7, d: -1.1 }
			];

			for (const { v, d } of testPoints) {
				const res = tanDualIterative({ v, d });
				const numericalDeriv = ((Math.tan(v + h) - Math.tan(v - h)) / (2 * h)) * d;
				assertClose(res.d, numericalDeriv, 1e-8, 1e-9, `finite-diff at v=${v}`);
			}
		});

		test('cross-checks against tangent angle-addition identity', () => {
			const pairs = [
				[0.3, 0.4],
				[-0.5, 1.1],
				[0.7, -0.25]
			];
			for (const [a, b] of pairs) {
				const ta = tanDualIterative({ v: a, d: 1 });
				const tb = tanDualIterative({ v: b, d: 0 });
				const tab = tanDualIterative({ v: a + b, d: 1 });

				// Dual quotient rule on (ta + tb) / (1 - ta * tb)
				const numV = ta.v + tb.v;
				const numD = ta.d + tb.d;
				const denV = 1 - ta.v * tb.v;
				const denD = -(ta.d * tb.v + ta.v * tb.d);
				const combinedV = numV / denV;
				const combinedD = (numD * denV - numV * denD) / (denV * denV);

				assertClose(tab.v, combinedV, 1e-13, 1e-14, `addition primal (${a}, ${b})`);
				assertClose(tab.d, combinedD, 1e-13, 1e-14, `addition deriv (${a}, ${b})`);
			}
		});
	});
});
