import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notFuzzyStable } from './notFuzzyStable.js';

/**
 * Independent exact IEEE 754 binary64 -> BigInt scaled-integer decoder.
 * Represents any finite double x with |x| <= 2 as an exact BigInt numerator
 * over the fixed denominator 2^1074 (since Number.MIN_VALUE = 2^-1074).
 */
const SCALE_SHIFT = 1074n;
const ONE_SCALED = 1n << SCALE_SHIFT;
const buf = new ArrayBuffer(8);
const view = new DataView(buf);

function doubleToExactScaledBigInt(x) {
	assert.ok(Number.isFinite(x), 'expected finite double');
	if (x === 0) return 0n;
	view.setFloat64(0, x, false);
	const bits = view.getBigUint64(0, false);
	const sign = (bits >> 63n) === 1n ? -1n : 1n;
	const expBits = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & ((1n << 52n) - 1n);

	let mantissa;
	let exponent; // value = sign * mantissa * 2^exponent
	if (expBits === 0) {
		// Subnormal
		mantissa = frac;
		exponent = -1074;
	} else {
		// Normal
		mantissa = (1n << 52n) | frac;
		exponent = expBits - 1023 - 52;
	}

	const shift = BigInt(exponent) + SCALE_SHIFT;
	assert.ok(shift >= 0n, 'value smaller than 2^-1074');
	return sign * (mantissa << shift);
}

describe('notFuzzyStable', () => {
	describe('scalar normal cases', () => {
		it('computes Zadeh negation 1 - mu for standard membership values', () => {
			assert.equal(notFuzzyStable(0), 1);
			assert.equal(notFuzzyStable(1), 0);
			assert.equal(notFuzzyStable(0.5), 0.5);
			assert.equal(notFuzzyStable(0.25), 0.75);
			assert.equal(notFuzzyStable(0.75), 0.25);
			assert.equal(notFuzzyStable(0.1), 0.9);
			assert.equal(notFuzzyStable(0.3), 0.7);
			assert.equal(notFuzzyStable(0.875), 0.125);
		});

		it('normalizes -0 input and avoids -0 output', () => {
			assert.ok(Object.is(notFuzzyStable(-0), 1));
			assert.ok(Object.is(notFuzzyStable(1), 0));
			assert.ok(Object.is(notFuzzyStable(1, { compensated: true }).value, 0));
			assert.ok(Object.is(notFuzzyStable(1, { compensated: true }).error, 0));
		});
	});

	describe('fuzzy set containers', () => {
		it('handles Array fuzzy sets without mutating the input', () => {
			const input = [0, 0.25, 0.5, 0.75, 1];
			const snapshot = [...input];
			const result = notFuzzyStable(input);
			assert.deepEqual(result, [1, 0.75, 0.5, 0.25, 0]);
			assert.deepEqual(input, snapshot);
			assert.deepEqual(notFuzzyStable([]), []);
		});

		it('handles numeric TypedArray fuzzy sets and returns Float64Array', () => {
			const f64 = new Float64Array([0, 0.2, 0.5, 1]);
			const res64 = notFuzzyStable(f64);
			assert.ok(res64 instanceof Float64Array);
			assert.deepEqual(Array.from(res64), [1, 0.8, 0.5, 0]);

			const f32 = new Float32Array([0, 0.25, 0.75, 1]);
			const res32 = notFuzzyStable(f32);
			assert.ok(res32 instanceof Float64Array);
			assert.deepEqual(Array.from(res32), [1, 0.75, 0.25, 0]);

			const u8 = new Uint8Array([0, 1, 0]);
			const resU8 = notFuzzyStable(u8);
			assert.ok(resU8 instanceof Float64Array);
			assert.deepEqual(Array.from(resU8), [1, 0, 1]);

			assert.equal(notFuzzyStable(new Float64Array(0)).length, 0);
		});

		it('handles Map fuzzy sets preserving key types and insertion order', () => {
			const sym = Symbol('x');
			const objKey = { id: 1 };
			const input = new Map([
				['cold', 0.25],
				[sym, 0.5],
				[objKey, 1],
			]);
			const result = notFuzzyStable(input);
			assert.ok(result instanceof Map);
			assert.notEqual(result, input);
			assert.deepEqual(Array.from(result.keys()), ['cold', sym, objKey]);
			assert.equal(result.get('cold'), 0.75);
			assert.equal(result.get(sym), 0.5);
			assert.ok(Object.is(result.get(objKey), 0));
			assert.equal(notFuzzyStable(new Map()).size, 0);
		});

		it('handles plain Object and null-prototype Object fuzzy sets safely', () => {
			const input = { a: 0, b: 0.25, c: 1 };
			const result = notFuzzyStable(input);
			assert.deepEqual(result, { a: 1, b: 0.75, c: 0 });
			assert.notEqual(result, input);
			assert.deepEqual(notFuzzyStable({}), {});

			const nullProto = Object.create(null);
			nullProto.x = 0.5;
			nullProto.__proto__ = 0.25;
			const nullRes = notFuzzyStable(nullProto);
			assert.equal(Object.getPrototypeOf(nullRes), null);
			assert.equal(nullRes.x, 0.5);
			assert.equal(nullRes.__proto__, 0.75);
		});
	});

	describe('numerical stability, compensated mode, and tolerance', () => {
		it('guarantees zero rounding error for mu in [0.5, 1] (Sterbenz Lemma)', () => {
			const values = [0.5, 0.5 + Number.EPSILON, 0.6, 0.7, 0.9, 1 - Number.EPSILON / 2, 1];
			for (const mu of values) {
				const res = notFuzzyStable(mu, { compensated: true });
				assert.equal(res.error, 0);
				assert.equal(res.errorBound, 0);
				assert.equal(res.value, 1 - mu);
			}
		});

		it('preserves exact involution for mu = 0.1 where naive 1 - (1 - 0.1) drifts', () => {
			// Demonstrate the IEEE 754 drift in naive double negation
			assert.notEqual(1 - (1 - 0.1), 0.1);

			const first = notFuzzyStable(0.1, { compensated: true });
			assert.equal(first.value, 0.9);
			assert.equal(first.error, -(2 ** -55));
			assert.ok(Math.abs(first.error) <= first.errorBound);

			const second = notFuzzyStable(first, { compensated: true });
			assert.equal(second.value, 0.1);
			assert.equal(second.error, 0);
			assert.equal(notFuzzyStable(first), 0.1);
		});

		it('prevents catastrophic absorption for sub-ulp and subnormal memberships', () => {
			const tinyValues = [1e-17, 1e-20, 1e-100, 2 ** -54, 0.5 - 2 ** -54, Number.MIN_VALUE];
			for (const mu of tinyValues) {
				const neg = notFuzzyStable(mu, { compensated: true });
				assert.ok(Math.abs(neg.error) <= neg.errorBound);

				const doubleNeg = notFuzzyStable(neg, { compensated: true });
				assert.equal(doubleNeg.value, mu, `exact involution failed for ${mu}`);
				assert.equal(doubleNeg.error, 0);
			}
		});

		it('computes accurate compensated cardinality and error bounds on large fuzzy sets', () => {
			// 10,000 elements each with mu = 1e-17: naive (1 - mu) rounds every element to 1,
			// losing 10,000 * 1e-17 = 1e-13 from cardinality.
			const n = 10_000;
			const mu = 1e-17;
			const set = new Array(n).fill(mu);
			const res = notFuzzyStable(set, { compensated: true });

			assert.equal(res.value.length, n);
			assert.equal(res.errors.length, n);
			assert.equal(res.maxError, mu);
			assert.ok(Math.abs(res.totalError - n * mu) <= 1e-25);
			assert.ok(res.totalError <= res.errorBound);

			const expectedCardinality = n - n * mu;
			assert.equal(res.cardinality, expectedCardinality);
		});

		it('supports compensated diagnostics for TypedArray, Map, and plain Object', () => {
			const arrRes = notFuzzyStable(new Float64Array([0.1, 0.6]), { compensated: true });
			assert.ok(arrRes.value instanceof Float64Array);
			assert.ok(arrRes.errors instanceof Float64Array);
			assert.equal(arrRes.errors[0], -(2 ** -55));
			assert.equal(arrRes.errors[1], 0);
			assert.ok(arrRes.totalError <= arrRes.errorBound);

			const mapRes = notFuzzyStable(new Map([['a', 0.1], ['b', 0.5]]), { compensated: true });
			assert.ok(mapRes.value instanceof Map);
			assert.ok(mapRes.errors instanceof Map);
			assert.equal(mapRes.errors.get('a'), -(2 ** -55));
			assert.equal(mapRes.errors.get('b'), 0);

			const objRes = notFuzzyStable({ a: 0.1, b: 0.9 }, { compensated: true });
			assert.equal(objRes.value.a, 0.9);
			assert.equal(objRes.errors.a, -(2 ** -55));
			assert.equal(objRes.errors.b, 0);
			assert.equal(objRes.cardinality, 1);
		});

		it('clamps boundary drift within options.tolerance', () => {
			assert.equal(notFuzzyStable(-1e-15, { tolerance: 1e-12 }), 1);
			assert.ok(Object.is(notFuzzyStable(1 + 1e-15, { tolerance: 1e-12 }), 0));
			assert.deepEqual(
				notFuzzyStable([-1e-15, 0.5, 1 + 1e-15], { tolerance: 1e-12 }),
				[1, 0.5, 0],
			);
			assert.throws(() => notFuzzyStable(-1e-11, { tolerance: 1e-12 }), RangeError);
			assert.throws(() => notFuzzyStable(1 + 1e-11, { tolerance: 1e-12 }), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches exact arbitrary-precision BigInt IEEE 754 arithmetic with zero bit error', () => {
			const samples = [
				0,
				Number.MIN_VALUE,
				2 ** -1022,
				1e-300,
				1e-20,
				2 ** -55,
				2 ** -54,
				2 ** -53,
				1e-12,
				0.1,
				0.2,
				0.3,
				1 / 3,
				1 / 7,
				Math.SQRT1_2 / 2,
				0.5 - 2 ** -54,
				0.5 - 2 ** -53,
				0.5,
				0.5 + 2 ** -53,
				Math.SQRT1_2,
				0.7,
				0.9,
				1 - 2 ** -53,
				1 - 2 ** -52,
				1,
			];

			for (const mu of samples) {
				const { value, error, errorBound } = notFuzzyStable(mu, { compensated: true });
				const exactMu = doubleToExactScaledBigInt(mu);
				const exactExpected = ONE_SCALED - exactMu;
				const exactComputed =
					doubleToExactScaledBigInt(value) + doubleToExactScaledBigInt(error);

				assert.equal(
					exactComputed,
					exactExpected,
					`exact EFT identity value + error === 1 - mu failed for mu=${mu}`,
				);
				assert.ok(Math.abs(error) <= errorBound);
				assert.ok(value >= 0 && value <= 1);
			}
		});

		it('satisfies Zadeh fuzzy algebra axioms (antitonicity, De Morgan, cardinality conservation)', () => {
			const grid = [0, 0.01, 0.1, 0.25, 0.3333333333333333, 0.5, 0.7, 0.9, 0.99, 1];

			// Antitonicity: a <= b => not(a) >= not(b)
			for (let i = 0; i < grid.length; i++) {
				for (let j = i; j < grid.length; j++) {
					assert.ok(notFuzzyStable(grid[i]) >= notFuzzyStable(grid[j]));
				}
			}

			// De Morgan's Laws for Zadeh t-norm (min) and t-conorm (max):
			// not(min(a, b)) === max(not(a), not(b))
			// not(max(a, b)) === min(not(a), not(b))
			for (const a of grid) {
				for (const b of grid) {
					assert.equal(
						notFuzzyStable(Math.min(a, b)),
						Math.max(notFuzzyStable(a), notFuzzyStable(b)),
					);
					assert.equal(
						notFuzzyStable(Math.max(a, b)),
						Math.min(notFuzzyStable(a), notFuzzyStable(b)),
					);
				}
			}

			// Cardinality conservation: |A| + |not(A)| === |U|
			const comp = notFuzzyStable(grid, { compensated: true });
			const sumA = grid.reduce((acc, x) => acc + x, 0);
			assert.ok(Math.abs((sumA + comp.cardinality) - grid.length) <= 1e-14);
		});
	});

	describe('input validation', () => {
		it('throws RangeError for out-of-range and non-finite scalar values', () => {
			for (const bad of [-0.001, -Number.MIN_VALUE, -1e-16, 1 + Number.EPSILON, 1.001, NaN, Infinity, -Infinity]) {
				assert.throws(() => notFuzzyStable(bad), RangeError);
			}
		});

		it('throws TypeError for unsupported input types', () => {
			const badInputs = [
				null,
				undefined,
				'0.5',
				true,
				false,
				1n,
				Symbol('s'),
				() => 0.5,
				new Set([0.5]),
				new Date(),
				/regex/,
				new DataView(new ArrayBuffer(8)),
				new BigInt64Array(1),
				new BigUint64Array(1),
			];
			for (const bad of badInputs) {
				assert.throws(() => notFuzzyStable(bad), TypeError);
			}
		});

		it('rejects sparse arrays and invalid container elements', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [0.2, , 0.5];
			assert.throws(() => notFuzzyStable(sparse), TypeError);
			assert.throws(() => notFuzzyStable(sparse, { compensated: true }), TypeError);

			assert.throws(() => notFuzzyStable([0.2, '0.5']), TypeError);
			assert.throws(() => notFuzzyStable([0.2, 1.5]), RangeError);
			assert.throws(() => notFuzzyStable(new Float64Array([0.2, NaN])), RangeError);
			assert.throws(() => notFuzzyStable(new Map([['a', -0.1]])), RangeError);
			assert.throws(() => notFuzzyStable(new Map([['a', null]])), TypeError);
			assert.throws(() => notFuzzyStable({ a: 2 }), RangeError);
			assert.throws(() => notFuzzyStable({ a: undefined }), TypeError);
		});

		it('validates the options object', () => {
			assert.throws(() => notFuzzyStable(0.5, null), TypeError);
			assert.throws(() => notFuzzyStable(0.5, []), TypeError);
			assert.throws(() => notFuzzyStable(0.5, 'bad'), TypeError);
			assert.throws(() => notFuzzyStable(0.5, { tolerance: '0' }), TypeError);
			assert.throws(() => notFuzzyStable(0.5, { tolerance: -1e-9 }), RangeError);
			assert.throws(() => notFuzzyStable(0.5, { tolerance: 0.6 }), RangeError);
			assert.throws(() => notFuzzyStable(0.5, { tolerance: NaN }), RangeError);
			assert.throws(() => notFuzzyStable(0.5, { compensated: 1 }), TypeError);
		});
	});
});
