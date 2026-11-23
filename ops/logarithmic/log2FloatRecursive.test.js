import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { log2FloatRecursive } from './log2FloatRecursive.js';

const f64View = new Float64Array(1);
const i64View = new BigInt64Array(f64View.buffer);

/**
 * Computes the distance in ULPs (units in the last place) between two finite float64 numbers.
 */
function ulpDistance(a, b) {
	if (Object.is(a, b) || (a === 0 && b === 0)) {
		return 0n;
	}
	f64View[0] = a;
	const ia = i64View[0];
	f64View[0] = b;
	const ib = i64View[0];
	const diff = ia - ib;
	return diff < 0n ? -diff : diff;
}

describe('log2FloatRecursive', () => {
	test('validates input type and rejects non-numbers', () => {
		const invalidInputs = [
			undefined,
			null,
			'2',
			'NaN',
			true,
			false,
			2n,
			{},
			[2],
			Symbol('x'),
			() => 2,
		];
		for (const bad of invalidInputs) {
			assert.throws(() => log2FloatRecursive(bad), TypeError);
		}
	});

	test('handles IEEE-754 special values', () => {
		assert.ok(Number.isNaN(log2FloatRecursive(Number.NaN)));
		assert.ok(Number.isNaN(log2FloatRecursive(-1)));
		assert.ok(Number.isNaN(log2FloatRecursive(-Number.MIN_VALUE)));
		assert.ok(Number.isNaN(log2FloatRecursive(-Number.MAX_VALUE)));
		assert.ok(Number.isNaN(log2FloatRecursive(-Infinity)));
		assert.equal(log2FloatRecursive(0), -Infinity);
		assert.equal(log2FloatRecursive(-0), -Infinity);
		assert.equal(log2FloatRecursive(Infinity), Infinity);
		assert.ok(Object.is(log2FloatRecursive(1), 0));
	});

	test('returns exact integers for powers of two across entire float64 range', () => {
		for (let exp = -1074; exp <= 1023; exp += 1) {
			const val = 2 ** exp;
			assert.equal(
				log2FloatRecursive(val),
				exp,
				`Expected exact log2(2^${exp}) === ${exp}`
			);
		}
	});

	test('computes accurate results for normal cases, constants, subnormals, and near-1 values', () => {
		const samples = [
			Number.MIN_VALUE,
			Number.MIN_VALUE * 3,
			Number.MIN_VALUE * 1e5,
			2 ** -1022,
			2 ** -1022 * 1.5,
			1e-100,
			0.1,
			0.25,
			0.3,
			0.75,
			Math.SQRT1_2,
			1 - 2 ** -53,
			1 - Number.EPSILON,
			1 - 1e-12,
			1 - 1e-6,
			1 + 1e-12,
			1 + Number.EPSILON,
			1 + 1e-6,
			Math.SQRT2,
			1.5,
			Math.E,
			3,
			Math.PI,
			10,
			42,
			1000,
			1e100,
			Number.MAX_SAFE_INTEGER,
			Number.MAX_VALUE,
		];

		for (const x of samples) {
			const actual = log2FloatRecursive(x);
			const expected = Math.log2(x);
			const ulps = ulpDistance(actual, expected);
			assert.ok(
				ulps <= 1n,
				`x=${x}: actual=${actual}, expected=${expected}, ulps=${ulps}`
			);
		}
	});

	test('independent cross-check: matches Math.log2 across deterministic pseudo-random float64 sweep', () => {
		// Deterministic LCG for reproducible coverage across exponents and mantissas
		let state = 0x12345678;
		const nextUnit = () => {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			return state / 0x100000000;
		};

		for (let i = 0; i < 2000; i += 1) {
			const exp = Math.floor(nextUnit() * 2040) - 1020;
			const mantissa = 1 + nextUnit();
			const x = mantissa * 2 ** exp;
			const actual = log2FloatRecursive(x);
			const expected = Math.log2(x);
			const ulps = ulpDistance(actual, expected);
			assert.ok(
				ulps <= 1n,
				`Sweep i=${i}, x=${x}: actual=${actual}, expected=${expected}, ulps=${ulps}`
			);
		}
	});

	test('independent cross-check: inverse identity 2 ** log2FloatRecursive(x) ≈ x', () => {
		const values = [
			1e-300,
			1e-50,
			1e-5,
			0.123456789,
			0.999999,
			1.000001,
			2.718281828459045,
			3.141592653589793,
			12345.6789,
			1e50,
			1e300,
		];

		for (const x of values) {
			const y = log2FloatRecursive(x);
			const reconstructed = 2 ** y;
			const relErr = Math.abs(reconstructed - x) / x;
			assert.ok(
				relErr < 1e-13,
				`Inverse check failed for x=${x}: y=${y}, 2**y=${reconstructed}, relErr=${relErr}`
			);
		}
	});

	test('independent cross-check: logarithmic algebraic identities and monotonicity', () => {
		const pairs = [
			[3, 5],
			[0.7, 19.3],
			[1e-40, 1e60],
			[Math.PI, Math.E],
			[1.0001, 0.9999],
		];

		for (const [a, b] of pairs) {
			const la = log2FloatRecursive(a);
			const lb = log2FloatRecursive(b);

			// Product rule: log2(a * b) ≈ log2(a) + log2(b)
			const lProd = log2FloatRecursive(a * b);
			const prodScale = Math.max(1, Math.abs(lProd));
			assert.ok(
				Math.abs(lProd - (la + lb)) <= 1e-14 * prodScale,
				`Product rule failed for (${a}, ${b})`
			);

			// Quotient rule: log2(a / b) ≈ log2(a) - log2(b)
			const lQuot = log2FloatRecursive(a / b);
			const quotScale = Math.max(1, Math.abs(lQuot));
			assert.ok(
				Math.abs(lQuot - (la - lb)) <= 1e-14 * quotScale,
				`Quotient rule failed for (${a}, ${b})`
			);
		}

		// Power rule: log2(x ** k) ≈ k * log2(x)
		for (const k of [-3, -1, 0.5, 2, 5]) {
			const x = 7.25;
			const lhs = log2FloatRecursive(x ** k);
			const rhs = k * log2FloatRecursive(x);
			assert.ok(
				Math.abs(lhs - rhs) <= 1e-14 * Math.max(1, Math.abs(rhs)),
				`Power rule failed for k=${k}`
			);
		}

		// Strict monotonicity on strictly increasing positive values
		const ordered = [
			Number.MIN_VALUE,
			2 ** -1022,
			1e-10,
			0.5,
			1 - Number.EPSILON,
			1,
			1 + Number.EPSILON,
			2,
			100,
			Number.MAX_VALUE,
		];
		for (let i = 1; i < ordered.length; i += 1) {
			assert.ok(
				log2FloatRecursive(ordered[i - 1]) < log2FloatRecursive(ordered[i]),
				`Monotonicity violated between ${ordered[i - 1]} and ${ordered[i]}`
			);
		}
	});
});
