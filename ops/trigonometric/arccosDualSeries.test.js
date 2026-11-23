import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arccosDualSeries } from './arccosDualSeries.js';

function assertClose(actual, expected, tol = 1e-13, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	);
}

describe('arccosDualSeries', () => {
	describe('normal cases', () => {
		it('evaluates special angles accurately across all branches', () => {
			const cases = [
				{ x: { v: 0, d: 1 }, expectedV: Math.PI / 2, expectedD: -1 },
				{ x: { v: 0.5, d: 1 }, expectedV: Math.PI / 3, expectedD: -2 / Math.sqrt(3) },
				{ x: { v: -0.5, d: 1 }, expectedV: (2 * Math.PI) / 3, expectedD: -2 / Math.sqrt(3) },
				{ x: { v: Math.SQRT1_2, d: 2 }, expectedV: Math.PI / 4, expectedD: -2 * Math.SQRT2 },
				{ x: { v: -Math.SQRT1_2, d: -3 }, expectedV: (3 * Math.PI) / 4, expectedD: 3 * Math.SQRT2 },
				{ x: { v: Math.sqrt(3) / 2, d: 1 }, expectedV: Math.PI / 6, expectedD: -2 },
				{ x: { v: -Math.sqrt(3) / 2, d: 0.5 }, expectedV: (5 * Math.PI) / 6, expectedD: -1 },
			];

			for (const { x, expectedV, expectedD } of cases) {
				const res = arccosDualSeries(x);
				assertClose(res.v, expectedV, 1e-14, `value at v=${x.v}`);
				assertClose(res.d, expectedD, 1e-14, `deriv at v=${x.v}`);
			}
		});

		it('returns positive zero derivative when d is 0 on interior points', () => {
			for (const v of [-0.9, -0.5, 0, 0.5, 0.9]) {
				const res = arccosDualSeries({ v, d: 0 });
				assert.ok(Object.is(res.d, 0), `expected +0 derivative at v=${v}, got ${res.d}`);
			}
		});

		it('does not mutate the input object', () => {
			const input = Object.freeze({ v: 0.25, d: -1.5 });
			const res = arccosDualSeries(input);
			assert.notEqual(res, input);
			assertClose(res.v, Math.acos(0.25), 1e-14);
			assertClose(res.d, 1.5 / Math.sqrt(1 - 0.0625), 1e-14);
		});
	});

	describe('edge cases', () => {
		it('handles domain endpoints v = 1 and v = -1', () => {
			const pos1 = arccosDualSeries({ v: 1, d: 1 });
			assert.ok(Object.is(pos1.v, 0));
			assert.equal(pos1.d, -Infinity);

			const pos1NegD = arccosDualSeries({ v: 1, d: -2 });
			assert.ok(Object.is(pos1NegD.v, 0));
			assert.equal(pos1NegD.d, Infinity);

			const pos1ZeroD = arccosDualSeries({ v: 1, d: 0 });
			assert.ok(Object.is(pos1ZeroD.v, 0));
			assert.ok(Number.isNaN(pos1ZeroD.d));

			const neg1 = arccosDualSeries({ v: -1, d: 1 });
			assert.equal(neg1.v, Math.PI);
			assert.equal(neg1.d, -Infinity);

			const neg1NegD = arccosDualSeries({ v: -1, d: -0.5 });
			assert.equal(neg1NegD.v, Math.PI);
			assert.equal(neg1NegD.d, Infinity);

			const neg1ZeroD = arccosDualSeries({ v: -1, d: 0 });
			assert.equal(neg1ZeroD.v, Math.PI);
			assert.ok(Number.isNaN(neg1ZeroD.d));
		});

		it('maintains accuracy very close to endpoints without catastrophic cancellation', () => {
			// Exact power of 2 so 1 - eps and -1 + eps are represented without rounding error
			const eps = 2 ** -40;
			const nearPos1 = arccosDualSeries({ v: 1 - eps, d: 1 });
			assertClose(nearPos1.v, Math.sqrt(2 * eps), 1e-15, 'near +1 value');
			assertClose(nearPos1.v, Math.acos(1 - eps), 1e-15, 'near +1 vs Math.acos');
			assertClose(nearPos1.d, -1 / Math.sqrt(eps * (2 - eps)), 1e-9, 'near +1 deriv');

			const nearNeg1 = arccosDualSeries({ v: -1 + eps, d: 1 });
			assertClose(nearNeg1.v, Math.PI - Math.sqrt(2 * eps), 1e-15, 'near -1 value');
			assertClose(nearNeg1.v, Math.acos(-1 + eps), 1e-15, 'near -1 vs Math.acos');
			assertClose(nearNeg1.d, -1 / Math.sqrt(eps * (2 - eps)), 1e-9, 'near -1 deriv');
		});

		it('is continuous across the +/-0.5 branch boundaries and handles -0', () => {
			const h = 1e-12;
			for (const b of [-0.5, 0.5]) {
				const left = arccosDualSeries({ v: b - h, d: 1 });
				const mid = arccosDualSeries({ v: b, d: 1 });
				const right = arccosDualSeries({ v: b + h, d: 1 });
				assertClose(left.v, mid.v, 1e-10, `left continuity at ${b}`);
				assertClose(right.v, mid.v, 1e-10, `right continuity at ${b}`);
				assertClose(left.d, mid.d, 1e-10, `left deriv continuity at ${b}`);
				assertClose(right.d, mid.d, 1e-10, `right deriv continuity at ${b}`);
			}

			const negZero = arccosDualSeries({ v: -0, d: -0 });
			assertClose(negZero.v, Math.PI / 2, 1e-15);
			assert.ok(Object.is(negZero.d, 0));
		});

		it('rejects invalid inputs with TypeError or RangeError', () => {
			for (const bad of [null, undefined, 0.5, '0.5', [0.5, 1], {}, { v: 0.5 }, { d: 1 }, { v: '0', d: 1 }, { v: 0, d: '1' }]) {
				assert.throws(() => arccosDualSeries(bad), TypeError);
			}

			for (const outOfRange of [
				{ v: 1.0001, d: 1 },
				{ v: -1.0001, d: 1 },
				{ v: 2, d: 0 },
				{ v: NaN, d: 1 },
				{ v: 0, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 0, d: Infinity },
				{ v: 0, d: -Infinity },
			]) {
				assert.throws(() => arccosDualSeries(outOfRange), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches Math.acos across a dense grid over [-1, 1]', () => {
			const steps = 200;
			for (let i = 0; i <= steps; i++) {
				const v = -1 + (2 * i) / steps;
				const res = arccosDualSeries({ v, d: 1 });
				assertClose(res.v, Math.acos(v), 1e-14, `Math.acos match at v=${v}`);
			}
		});

		it('matches central finite-difference derivative approximation', () => {
			const h = 1e-6;
			const samples = [
				{ v: -0.95, d: 1.3 },
				{ v: -0.6, d: -2.1 },
				{ v: -0.25, d: 0.7 },
				{ v: 0, d: 3.5 },
				{ v: 0.3, d: -1.2 },
				{ v: 0.72, d: 0.4 },
				{ v: 0.95, d: -0.8 },
			];

			for (const x of samples) {
				const res = arccosDualSeries(x);
				const fd = ((Math.acos(x.v + h) - Math.acos(x.v - h)) / (2 * h)) * x.d;
				assertClose(res.d, fd, 1e-7, `finite-diff at v=${x.v}`);
			}
		});

		it('satisfies dual-number inverse identity cos(arccos(x)) = x and reflection arccos(x) + arccos(-x) = pi', () => {
			const samples = [
				{ v: -0.85, d: 2.5 },
				{ v: -0.35, d: -1.7 },
				{ v: 0.15, d: 0.9 },
				{ v: 0.85, d: -3.2 },
			];

			for (const x of samples) {
				const y = arccosDualSeries(x);
				// Dual cosine: cos(y) = { v: cos(y.v), d: -sin(y.v) * y.d }
				const cosY = { v: Math.cos(y.v), d: -Math.sin(y.v) * y.d };
				assertClose(cosY.v, x.v, 1e-14, `cos(arccos(x)).v at v=${x.v}`);
				assertClose(cosY.d, x.d, 1e-13, `cos(arccos(x)).d at v=${x.v}`);

				// Reflection identity: arccos(x) + arccos(-x) = { v: pi, d: 0 }
				const yNeg = arccosDualSeries({ v: -x.v, d: -x.d });
				assertClose(y.v + yNeg.v, Math.PI, 1e-14, `reflection value at v=${x.v}`);
				assertClose(y.d + yNeg.d, 0, 1e-13, `reflection deriv at v=${x.v}`);
			}
		});

		it('satisfies chain rule composition arccos(sin(t)) = pi/2 - t on (-pi/2, pi/2)', () => {
			for (const t of [-1.2, -0.4, 0, 0.5, 1.1]) {
				const sinDual = { v: Math.sin(t), d: Math.cos(t) };
				const composed = arccosDualSeries(sinDual);
				assertClose(composed.v, Math.PI / 2 - t, 1e-14, `arccos(sin(${t})).v`);
				assertClose(composed.d, -1, 1e-13, `arccos(sin(${t})).d`);
			}
		});
	});
});
