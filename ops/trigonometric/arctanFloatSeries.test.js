import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arctanFloatSeries } from './arctanFloatSeries.js';

const ulpBuf = new ArrayBuffer(8);
const ulpF64 = new Float64Array(ulpBuf);
const ulpI64 = new BigInt64Array(ulpBuf);

function ulpDistance(a, b) {
	if (a === b) return 0n;
	ulpF64[0] = a;
	const ia = ulpI64[0];
	ulpF64[0] = b;
	const ib = ulpI64[0];
	const diff = ia - ib;
	return diff < 0n ? -diff : diff;
}

describe('arctanFloatSeries', () => {
	describe('input validation', () => {
		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'0',
				'1.5',
				true,
				false,
				{},
				[],
				[1],
				1n,
				Symbol('x'),
				() => 0,
			];
			for (const value of invalidInputs) {
				assert.throws(
					() => arctanFloatSeries(value),
					TypeError,
					`Expected TypeError for ${String(value)}`
				);
			}
		});

		it('throws RangeError for NaN', () => {
			assert.throws(() => arctanFloatSeries(NaN), RangeError);
		});
	});

	describe('special and boundary values', () => {
		it('preserves +0 and -0', () => {
			assert.equal(Object.is(arctanFloatSeries(0), 0), true);
			assert.equal(Object.is(arctanFloatSeries(-0), -0), true);
		});

		it('handles +Infinity and -Infinity', () => {
			assert.equal(arctanFloatSeries(Infinity), Math.PI / 2);
			assert.equal(arctanFloatSeries(-Infinity), -Math.PI / 2);
		});

		it('handles tiny and subnormal values accurately', () => {
			const tinyValues = [
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
				1e-308,
				-1e-308,
				1e-160,
				-1e-160,
				1e-16,
				-1e-16,
				2 ** -28,
				-(2 ** -28),
				2 ** -27,
				-(2 ** -27),
				2 ** -26,
				-(2 ** -26),
			];
			for (const x of tinyValues) {
				const got = arctanFloatSeries(x);
				const expected = Math.atan(x);
				assert.ok(
					ulpDistance(got, expected) <= 1n,
					`Expected <= 1 ULP for x=${x}, got ${got} vs ${expected}`
				);
			}
		});

		it('handles very large finite magnitudes without overflow', () => {
			const largeValues = [
				1e6,
				-1e6,
				1e12,
				-1e12,
				1e20,
				-1e20,
				1e150,
				-1e150,
				Number.MAX_VALUE,
				-Number.MAX_VALUE,
			];
			for (const x of largeValues) {
				const got = arctanFloatSeries(x);
				const expected = Math.atan(x);
				assert.ok(
					ulpDistance(got, expected) <= 1n,
					`Expected <= 1 ULP for x=${x}, got ${got} vs ${expected}`
				);
			}
		});

		it('matches exact known trigonometric angles', () => {
			const cases = [
				[1, Math.PI / 4],
				[-1, -Math.PI / 4],
				[Math.sqrt(3), Math.PI / 3],
				[-Math.sqrt(3), -Math.PI / 3],
				[1 / Math.sqrt(3), Math.PI / 6],
				[-1 / Math.sqrt(3), -Math.PI / 6],
				[Math.SQRT2 - 1, Math.PI / 8],
				[Math.SQRT2 + 1, (3 * Math.PI) / 8],
				[2 - Math.sqrt(3), Math.PI / 12],
				[2 + Math.sqrt(3), (5 * Math.PI) / 12],
			];
			for (const [x, expected] of cases) {
				const got = arctanFloatSeries(x);
				assert.ok(
					Math.abs(got - expected) <= 1e-15,
					`Expected arctan(${x}) ~= ${expected}, got ${got}`
				);
			}
		});

		it('is accurate across range-reduction boundaries (0.5, 1, 2)', () => {
			const boundaries = [0.5, 1, 2];
			for (const b of boundaries) {
				for (let k = -25; k <= 25; k++) {
					const x = b + k * Number.EPSILON * b;
					for (const signed of [x, -x]) {
						const got = arctanFloatSeries(signed);
						const expected = Math.atan(signed);
						assert.ok(
							ulpDistance(got, expected) <= 1n,
							`Expected <= 1 ULP near boundary ${b} at x=${signed}: got ${got}, expected ${expected}`
						);
					}
				}
			}
		});
	});

	describe('analytical identities and properties', () => {
		it('satisfies odd symmetry arctan(-x) === -arctan(x)', () => {
			const values = [1e-12, 0.01, 0.25, 0.5, 0.75, 1, 1.5, 2, 5, 100, 1e10];
			for (const x of values) {
				assert.equal(arctanFloatSeries(-x), -arctanFloatSeries(x));
			}
		});

		it('satisfies reciprocal identity arctan(x) + arctan(1/x) = pi/2 for x > 0', () => {
			const values = [1e-9, 1e-4, 0.1, 0.3, 0.5, 0.75, 1, 1.5, 2, 3.7, 10, 1e5, 1e9];
			for (const x of values) {
				const sum = arctanFloatSeries(x) + arctanFloatSeries(1 / x);
				assert.ok(
					Math.abs(sum - Math.PI / 2) <= 1e-15,
					`Failed reciprocal identity at x=${x}: sum=${sum}`
				);
			}
		});

		it('satisfies tan(arctan(x)) ~= x for moderate x', () => {
			const values = [-10, -3.5, -2, -1, -0.5, -0.1, 0, 0.1, 0.5, 1, 2, 3.5, 10];
			for (const x of values) {
				const roundTrip = Math.tan(arctanFloatSeries(x));
				const tol = 1e-14 * Math.max(1, Math.abs(x) * Math.abs(x));
				assert.ok(
					Math.abs(roundTrip - x) <= tol,
					`Failed tan(arctan(${x})) ~= ${x}: got ${roundTrip}`
				);
			}
		});

		it('satisfies addition identity arctan(a) + arctan(b) = arctan((a+b)/(1-ab)) when ab < 1', () => {
			const pairs = [
				[0.1, 0.2],
				[0.5, 0.5],
				[0.5, 1 / 3],
				[1, 0.5],
				[-0.4, 0.7],
				[2, -3],
			];
			for (const [a, b] of pairs) {
				const lhs = arctanFloatSeries(a) + arctanFloatSeries(b);
				const rhs = arctanFloatSeries((a + b) / (1 - a * b));
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-15,
					`Failed addition identity for (${a}, ${b}): lhs=${lhs}, rhs=${rhs}`
				);
			}
		});

		it('satisfies Machin formula 4*arctan(1/5) - arctan(1/239) = pi/4', () => {
			const approxPiOver4 =
				4 * arctanFloatSeries(1 / 5) - arctanFloatSeries(1 / 239);
			assert.ok(
				Math.abs(approxPiOver4 - Math.PI / 4) <= 1e-15,
				`Machin formula deviation too large: ${approxPiOver4} vs ${Math.PI / 4}`
			);
		});

		it('is strictly increasing and bounded in [-pi/2, pi/2]', () => {
			const points = [-1e6, -100, -10, -2, -1, -0.5, -0.1, 0, 0.1, 0.5, 1, 2, 10, 100, 1e6];
			let prev = -Infinity;
			for (const x of points) {
				const y = arctanFloatSeries(x);
				assert.ok(y >= -Math.PI / 2 && y <= Math.PI / 2);
				assert.ok(y > prev, `Expected strictly increasing at x=${x}: ${y} <= ${prev}`);
				prev = y;
			}
		});
	});

	describe('cross-check against Math.atan', () => {
		it('matches Math.atan within <= 1 ULP across wide domain sweep', () => {
			let maxUlp = 0n;
			let worstX = 0;

			// Power-of-two logarithmic sweep from 2^-300 to 2^300
			for (let e = -300; e <= 300; e += 3) {
				const base = Math.pow(2, e);
				for (const mult of [0.5, 0.75, 1.0, 1.3333333333333333, 1.75]) {
					for (const x of [base * mult, -base * mult]) {
						const got = arctanFloatSeries(x);
						const ref = Math.atan(x);
						const ulp = ulpDistance(got, ref);
						if (ulp > maxUlp) {
							maxUlp = ulp;
							worstX = x;
						}
					}
				}
			}

			// Uniform angular sweep over (-pi/2, pi/2)
			const N = 10000;
			for (let i = 1; i < N; i++) {
				const theta = ((i / N) - 0.5) * Math.PI * 0.999999;
				const x = Math.tan(theta);
				const got = arctanFloatSeries(x);
				const ref = Math.atan(x);
				const ulp = ulpDistance(got, ref);
				if (ulp > maxUlp) {
					maxUlp = ulp;
					worstX = x;
				}
			}

			assert.ok(
				maxUlp <= 1n,
				`Max ULP error ${maxUlp} exceeded 1 ULP at x=${worstX}`
			);
		});
	});
});
