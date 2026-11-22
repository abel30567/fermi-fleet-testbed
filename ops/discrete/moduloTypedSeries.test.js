import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduloTypedSeries } from './moduloTypedSeries.js';

describe('moduloTypedSeries', () => {
	it('computes element-wise discrete modulo for positive integers and floats', () => {
		const a = new Float64Array([10, 7, 6, 0, 15, 5.5]);
		const b = new Float64Array([3, 4, 3, 5, 5, 2]);
		const out = moduloTypedSeries(a, b);

		assert.ok(out instanceof Float64Array);
		assert.equal(out.length, a.length);
		assert.deepEqual(Array.from(out), [1, 3, 0, 0, 0, 1.5]);
	});

	it('follows Knuth floored modulo sign semantics for negative dividends and divisors', () => {
		const a = new Float64Array([-7, -6, 7, -7, -1, 1]);
		const b = new Float64Array([3, 3, -3, -3, 5, -5]);
		const out = moduloTypedSeries(a, b);

		assert.deepEqual(Array.from(out), [2, 0, -2, -1, 4, -4]);
	});

	it('handles empty Float64Array inputs without error', () => {
		const out = moduloTypedSeries(new Float64Array(0), new Float64Array(0));
		assert.ok(out instanceof Float64Array);
		assert.equal(out.length, 0);
	});

	it('does not mutate input arrays and normalizes -0 to +0', () => {
		const a = new Float64Array([-0, -6, 6, -0]);
		const b = new Float64Array([3, 3, -3, -3]);
		const aSnap = Array.from(a);
		const bSnap = Array.from(b);

		const out = moduloTypedSeries(a, b);

		assert.deepEqual(Array.from(a), aSnap);
		assert.deepEqual(Array.from(b), bSnap);
		for (let i = 0; i < out.length; i++) {
			assert.equal(Object.is(out[i], 0), true, `expected +0 at index ${i}`);
		}
	});

	it('handles tiny negative dividends near zero without returning the divisor', () => {
		const a = new Float64Array([-1e-17, 1e-17]);
		const b = new Float64Array([1, -1]);
		const out = moduloTypedSeries(a, b);

		assert.equal(Object.is(out[0], 0), true);
		assert.equal(Object.is(out[1], 0), true);
	});

	it('handles extreme magnitudes where a / b overflows float64', () => {
		const a = new Float64Array([1e308, -1e308]);
		const b = new Float64Array([1e-308, 1e-308]);
		const out = moduloTypedSeries(a, b);

		for (let i = 0; i < out.length; i++) {
			assert.equal(Number.isFinite(out[i]), true);
			assert.ok(out[i] >= 0 && out[i] < b[i]);
		}
	});

	it('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2]);
		assert.throws(() => moduloTypedSeries([1, 2], valid), TypeError);
		assert.throws(() => moduloTypedSeries(valid, [1, 2]), TypeError);
		assert.throws(() => moduloTypedSeries(new Float32Array([1, 2]), valid), TypeError);
		assert.throws(() => moduloTypedSeries(valid, new Int32Array([1, 2])), TypeError);
		assert.throws(() => moduloTypedSeries(null, valid), TypeError);
		assert.throws(() => moduloTypedSeries(valid, undefined), TypeError);
	});

	it('throws RangeError for mismatched lengths, non-finite values, or zero divisors', () => {
		assert.throws(
			() => moduloTypedSeries(new Float64Array([1, 2]), new Float64Array([1])),
			RangeError
		);
		assert.throws(
			() => moduloTypedSeries(new Float64Array([NaN]), new Float64Array([2])),
			RangeError
		);
		assert.throws(
			() => moduloTypedSeries(new Float64Array([Infinity]), new Float64Array([2])),
			RangeError
		);
		assert.throws(
			() => moduloTypedSeries(new Float64Array([1]), new Float64Array([-Infinity])),
			RangeError
		);
		assert.throws(
			() => moduloTypedSeries(new Float64Array([1]), new Float64Array([NaN])),
			RangeError
		);
		assert.throws(
			() => moduloTypedSeries(new Float64Array([5, 10]), new Float64Array([2, 0])),
			RangeError
		);
		assert.throws(
			() => moduloTypedSeries(new Float64Array([5]), new Float64Array([-0])),
			RangeError
		);
	});

	it('cross-checks against independent iterative discrete reduction and BigInt Euclidean modulo', () => {
		// Independent computation 1: iterative addition/subtraction for small integers
		const iterativeMod = (a, b) => {
			let r = a;
			if (b > 0) {
				while (r >= b) r -= b;
				while (r < 0) r += b;
			} else {
				while (r <= b) r -= b;
				while (r > 0) r += b;
			}
			return r === 0 ? 0 : r;
		};

		const dividends = [];
		const divisors = [];
		const expectedIterative = [];
		for (let a = -25; a <= 25; a++) {
			for (const b of [-7, -4, -1, 1, 3, 6, 11]) {
				dividends.push(a);
				divisors.push(b);
				expectedIterative.push(iterativeMod(a, b));
			}
		}

		const out = moduloTypedSeries(new Float64Array(dividends), new Float64Array(divisors));
		assert.deepEqual(Array.from(out), expectedIterative);

		// Independent computation 2: BigInt floored modulo on large safe integers
		// Includes boundary cases where a / b rounds to an integer or b * q exceeds 2^53
		const bigA = [
			9007199254740991n,
			-9007199254740991n,
			123456789012345n,
			-98765432109876n,
			11n * 818836295885544n - 1n,
			-(11n * 818836295885544n - 1n)
		];
		const bigB = [97n, 97n, -1009n, -1009n, 11n, -11n];
		const bigExpected = bigA.map((x, i) => {
			const y = bigB[i];
			const r = ((x % y) + y) % y;
			return Number(r);
		});

		const bigOut = moduloTypedSeries(
			new Float64Array(bigA.map(Number)),
			new Float64Array(bigB.map(Number))
		);
		assert.deepEqual(Array.from(bigOut), bigExpected);
	});
});
