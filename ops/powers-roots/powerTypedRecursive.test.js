import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { powerTypedRecursive } from './powerTypedRecursive.js';

/**
 * Helper to assert two Float64Arrays match element-wise within a relative/absolute tolerance.
 *
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 * @param {number} [tol=1e-12]
 */
function assertCloseArray(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array');
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		const a = actual[i];
		const e = expected[i];
		if (Number.isNaN(e)) {
			assert.ok(Number.isNaN(a), `index ${i}: expected NaN, got ${a}`);
		} else if (!Number.isFinite(e)) {
			assert.equal(a, e, `index ${i}: expected ${e}, got ${a}`);
		} else {
			const scale = Math.max(1, Math.abs(e));
			assert.ok(
				Math.abs(a - e) <= tol * scale,
				`index ${i}: expected ${e} +/- ${tol * scale}, got ${a}`
			);
		}
	}
}

describe('powerTypedRecursive', () => {
	it('computes element-wise powers for typical Float64Array inputs', () => {
		const bases = new Float64Array([2, 3, 4, 5, 10]);
		const exponents = new Float64Array([3, 2, 0.5, 1, 4]);
		const result = powerTypedRecursive(bases, exponents);

		assert.ok(result instanceof Float64Array);
		assert.deepEqual(result, new Float64Array([8, 9, 2, 5, 10000]));
	});

	it('handles empty Float64Array inputs', () => {
		const empty = new Float64Array(0);
		const result = powerTypedRecursive(empty, new Float64Array(0));
		assert.ok(result instanceof Float64Array);
		assert.equal(result.length, 0);

		const scalarResult = powerTypedRecursive(empty, 3);
		assert.ok(scalarResult instanceof Float64Array);
		assert.equal(scalarResult.length, 0);
	});

	it('handles single-element Float64Array inputs', () => {
		const res = powerTypedRecursive(new Float64Array([7]), new Float64Array([3]));
		assert.deepEqual(res, new Float64Array([343]));

		const resScalar = powerTypedRecursive(new Float64Array([9]), 0.5);
		assert.deepEqual(resScalar, new Float64Array([3]));
	});

	it('handles zero exponents per IEEE-754 semantics', () => {
		const bases = new Float64Array([0, -0, 1, -5, 42.5, Infinity, -Infinity, NaN]);
		const exponents = new Float64Array(bases.length).fill(0);
		const result = powerTypedRecursive(bases, exponents);

		for (let i = 0; i < result.length; i++) {
			assert.equal(result[i], 1, `index ${i}: expected 1, got ${result[i]}`);
		}
	});

	it('handles fractional and negative exponents', () => {
		const bases = new Float64Array([16, 27, 2, 4, -2, -2, -4]);
		const exponents = new Float64Array([0.25, 1 / 3, -3, -0.5, 3, 4, 0.5]);
		const result = powerTypedRecursive(bases, exponents);

		assertCloseArray(
			result,
			new Float64Array([2, 3, 0.125, 0.5, -8, 16, NaN]),
			1e-12
		);
	});

	it('handles special floating-point values (Infinity, -0, NaN, overflow/underflow)', () => {
		const bases = new Float64Array([0, -0, Infinity, 1e200, 1e-200, NaN]);
		const exponents = new Float64Array([-1, -1, 2, 2, 2, 2]);
		const result = powerTypedRecursive(bases, exponents);

		assert.equal(result[0], Infinity);
		assert.equal(result[1], -Infinity);
		assert.equal(result[2], Infinity);
		assert.equal(result[3], Infinity);
		assert.equal(result[4], 0);
		assert.ok(Number.isNaN(result[5]));
	});

	it('supports a scalar numeric exponent', () => {
		const bases = new Float64Array([-3, -2, -1, 0, 1, 2, 3]);
		const squares = powerTypedRecursive(bases, 2);
		assert.deepEqual(squares, new Float64Array([9, 4, 1, 0, 1, 4, 9]));

		const cubes = powerTypedRecursive(bases, 3);
		assert.deepEqual(cubes, new Float64Array([-27, -8, -1, 0, 1, 8, 27]));
	});

	it('does not mutate inputs and handles aliased bases/exponents safely', () => {
		const bases = new Float64Array([1, 2, 3, 4]);
		const exponents = new Float64Array([4, 3, 2, 1]);
		const basesCopy = new Float64Array(bases);
		const expCopy = new Float64Array(exponents);

		const result = powerTypedRecursive(bases, exponents);
		assert.notEqual(result, bases);
		assert.notEqual(result, exponents);
		assert.deepEqual(bases, basesCopy);
		assert.deepEqual(exponents, expCopy);

		const selfPow = powerTypedRecursive(bases, bases);
		assert.deepEqual(selfPow, new Float64Array([1, 4, 27, 256]));
		assert.deepEqual(bases, basesCopy);
	});

	it('throws TypeError on invalid input types', () => {
		const valid = new Float64Array([1, 2, 3]);

		assert.throws(() => powerTypedRecursive([1, 2, 3], valid), TypeError);
		assert.throws(() => powerTypedRecursive(new Float32Array([1, 2, 3]), valid), TypeError);
		assert.throws(() => powerTypedRecursive(null, valid), TypeError);
		assert.throws(() => powerTypedRecursive(undefined, valid), TypeError);
		assert.throws(() => powerTypedRecursive(2, valid), TypeError);

		assert.throws(() => powerTypedRecursive(valid, [1, 2, 3]), TypeError);
		assert.throws(() => powerTypedRecursive(valid, new Float32Array([1, 2, 3])), TypeError);
		assert.throws(() => powerTypedRecursive(valid, null), TypeError);
		assert.throws(() => powerTypedRecursive(valid, undefined), TypeError);
		assert.throws(() => powerTypedRecursive(valid, '2'), TypeError);
		assert.throws(() => powerTypedRecursive(valid, {}), TypeError);
	});

	it('throws RangeError on mismatched Float64Array lengths', () => {
		assert.throws(
			() => powerTypedRecursive(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
			RangeError
		);
		assert.throws(
			() => powerTypedRecursive(new Float64Array(0), new Float64Array([1])),
			RangeError
		);
	});

	it('matches iterative Math.pow across varied array lengths including large odd sizes', () => {
		// Deterministic LCG for reproducible pseudo-random test vectors
		let seed = 123456789;
		const nextRand = () => {
			seed = (1664525 * seed + 1013904223) >>> 0;
			return seed / 0x100000000;
		};

		for (const n of [2, 3, 7, 16, 63, 1025]) {
			const bases = new Float64Array(n);
			const exponents = new Float64Array(n);
			const expected = new Float64Array(n);

			for (let i = 0; i < n; i++) {
				// Mix positive, negative, fractional, and integer values
				const b = (nextRand() - 0.3) * 10;
				const e = b < 0 ? Math.floor((nextRand() - 0.5) * 10) : (nextRand() - 0.5) * 6;
				bases[i] = b;
				exponents[i] = e;
				expected[i] = Math.pow(b, e);
			}

			const actual = powerTypedRecursive(bases, exponents);
			assert.deepEqual(actual, expected);
		}
	});

	it('cross-checks against exp(y * ln(x)) and exponent laws for positive bases', () => {
		const n = 257;
		const bases = new Float64Array(n);
		const expA = new Float64Array(n);
		const expB = new Float64Array(n);
		const expSum = new Float64Array(n);
		const viaExpLog = new Float64Array(n);

		for (let i = 0; i < n; i++) {
			const x = 0.25 + (i * 0.137);
			const y1 = -2.5 + (i % 19) * 0.31;
			const y2 = 1.75 - (i % 13) * 0.27;
			bases[i] = x;
			expA[i] = y1;
			expB[i] = y2;
			expSum[i] = y1 + y2;
			viaExpLog[i] = Math.exp(y1 * Math.log(x));
		}

		const powA = powerTypedRecursive(bases, expA);
		const powB = powerTypedRecursive(bases, expB);
		const powSum = powerTypedRecursive(bases, expSum);

		// Cross-check 1: x^y === exp(y * ln(x))
		assertCloseArray(powA, viaExpLog, 1e-11);

		// Cross-check 2: x^y1 * x^y2 === x^(y1 + y2)
		const prod = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			prod[i] = powA[i] * powB[i];
		}
		assertCloseArray(prod, powSum, 1e-11);
	});
});
