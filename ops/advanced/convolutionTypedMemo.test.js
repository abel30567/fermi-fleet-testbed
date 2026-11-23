import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convolutionTypedMemo } from './convolutionTypedMemo.js';

/**
 * Independent reference implementation of discrete 1D linear convolution
 * using the textbook summation formula:
 *   y[n] = sum_{k=0}^{M-1} x[n - k] * h[k]
 *
 * @param {Float64Array} x
 * @param {Float64Array} h
 * @returns {Float64Array}
 */
function naiveReferenceConvolution(x, h) {
	if (x.length === 0 || h.length === 0) {
		return new Float64Array(0);
	}
	const outLen = x.length + h.length - 1;
	const y = new Float64Array(outLen);
	for (let n = 0; n < outLen; n++) {
		let acc = 0;
		for (let k = 0; k < h.length; k++) {
			const idx = n - k;
			if (idx >= 0 && idx < x.length) {
				acc += x[idx] * h[k];
			}
		}
		y[n] = acc;
	}
	return y;
}

/**
 * Asserts two Float64Arrays have equal length and element-wise closeness within tolerance.
 */
function assertFloat64ArrayClose(actual, expected, tol = 1e-9) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array');
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} !== ${expected.length}`);
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`element [${i}] mismatch: ${actual[i]} vs ${expected[i]} (tol=${tol})`
		);
	}
}

describe('convolutionTypedMemo', () => {
	it('computes full convolution matching polynomial multiplication', () => {
		// (1 + 2x + 3x^2) * (4 + 5x) = 4 + 13x + 22x^2 + 15x^3
		const signal = new Float64Array([1, 2, 3]);
		const kernel = new Float64Array([4, 5]);
		const result = convolutionTypedMemo(signal, kernel);
		assertFloat64ArrayClose(result, new Float64Array([4, 13, 22, 15]), 1e-12);
	});

	it('handles identity (Dirac delta) and shift impulses', () => {
		const signal = new Float64Array([3.5, -2.25, 0, 7.125]);
		const delta = new Float64Array([1]);
		assertFloat64ArrayClose(convolutionTypedMemo(signal, delta), signal, 1e-12);

		const shiftByTwo = new Float64Array([0, 0, 1]);
		assertFloat64ArrayClose(
			convolutionTypedMemo(signal, shiftByTwo),
			new Float64Array([0, 0, 3.5, -2.25, 0, 7.125]),
			1e-12
		);
	});

	it('supports "same" and "valid" output modes', () => {
		const signal = new Float64Array([1, 2, 3, 4, 5]);
		const kernel = new Float64Array([0.25, 0.5, 0.25]);

		// full: [0.25, 1, 2, 3, 4, 3.5, 1.25]
		const full = convolutionTypedMemo(signal, kernel, { mode: 'full' });
		assertFloat64ArrayClose(full, new Float64Array([0.25, 1, 2, 3, 4, 3.5, 1.25]), 1e-12);

		// same (start = floor((3-1)/2) = 1, length = 5): [1, 2, 3, 4, 3.5]
		const same = convolutionTypedMemo(signal, kernel, { mode: 'same' });
		assertFloat64ArrayClose(same, new Float64Array([1, 2, 3, 4, 3.5]), 1e-12);

		// valid (start = 2, length = 3): [2, 3, 4]
		const valid = convolutionTypedMemo(signal, kernel, { mode: 'valid' });
		assertFloat64ArrayClose(valid, new Float64Array([2, 3, 4]), 1e-12);
	});

	it('handles empty inputs and valid mode when kernel is longer than signal', () => {
		const empty = new Float64Array(0);
		const nonEmpty = new Float64Array([1, 2, 3]);

		assert.equal(convolutionTypedMemo(empty, nonEmpty).length, 0);
		assert.equal(convolutionTypedMemo(nonEmpty, empty).length, 0);
		assert.equal(convolutionTypedMemo(empty, empty).length, 0);

		const shortSignal = new Float64Array([1, 2]);
		const longKernel = new Float64Array([1, 2, 3, 4]);
		const validEmpty = convolutionTypedMemo(shortSignal, longKernel, { mode: 'valid' });
		assert.ok(validEmpty instanceof Float64Array);
		assert.equal(validEmpty.length, 0);
	});

	it('handles single-element, negative, zero, and signed-zero inputs', () => {
		assertFloat64ArrayClose(
			convolutionTypedMemo(new Float64Array([-3]), new Float64Array([4])),
			new Float64Array([-12]),
			1e-12
		);

		const posZero = new Float64Array([0, 1, 0]);
		const negZero = new Float64Array([-0, 1, -0]);
		const kernel = new Float64Array([2, 3]);
		const r1 = convolutionTypedMemo(posZero, kernel);
		const r2 = convolutionTypedMemo(negZero, kernel);
		assertFloat64ArrayClose(r1, new Float64Array([0, 2, 3, 0]), 1e-12);
		assertFloat64ArrayClose(r2, r1, 1e-12);
	});

	it('cross-checks large inputs (FFT precomputed-table path) against naive reference convolution', () => {
		// 96 * 48 = 4608 >= 2048 triggers the table-driven radix-2 FFT path
		const signal = new Float64Array(96);
		const kernel = new Float64Array(48);
		for (let i = 0; i < signal.length; i++) {
			signal[i] = Math.sin(i * 0.37) * 2.5 - Math.cos(i * 0.13);
		}
		for (let j = 0; j < kernel.length; j++) {
			kernel[j] = Math.exp(-j * 0.08) * Math.cos(j * 0.41);
		}

		const expected = naiveReferenceConvolution(signal, kernel);
		const actual = convolutionTypedMemo(signal, kernel);
		assertFloat64ArrayClose(actual, expected, 1e-10);

		// Also verify repeated call hits memoization cache and matches exact reference
		const actualCached = convolutionTypedMemo(signal, kernel);
		assertFloat64ArrayClose(actualCached, expected, 1e-10);
		assert.notEqual(actual, actualCached, 'memoized calls must return distinct Float64Array instances');
	});

	it('satisfies algebraic convolution identities (commutativity, associativity, distributivity, sum preservation)', () => {
		const a = new Float64Array([1.5, -0.5, 2.0, 0.75]);
		const b = new Float64Array([-1.25, 3.0, 0.5]);
		const c = new Float64Array([0.5, -2.0, 1.25]);

		// Commutativity: a * b == b * a
		assertFloat64ArrayClose(convolutionTypedMemo(a, b), convolutionTypedMemo(b, a), 1e-12);

		// Associativity: (a * b) * c == a * (b * c)
		const left = convolutionTypedMemo(convolutionTypedMemo(a, b), c);
		const right = convolutionTypedMemo(a, convolutionTypedMemo(b, c));
		assertFloat64ArrayClose(left, right, 1e-12);

		// Distributivity: a * (b + c) == (a * b) + (a * c)
		const bPlusC = new Float64Array(b.length);
		for (let i = 0; i < b.length; i++) bPlusC[i] = b[i] + c[i];
		const distLeft = convolutionTypedMemo(a, bPlusC);
		const ab = convolutionTypedMemo(a, b);
		const ac = convolutionTypedMemo(a, c);
		const distRight = new Float64Array(ab.length);
		for (let i = 0; i < ab.length; i++) distRight[i] = ab[i] + ac[i];
		assertFloat64ArrayClose(distLeft, distRight, 1e-12);

		// DC gain / sum preservation: sum(a * b) == sum(a) * sum(b)
		const sum = (arr) => arr.reduce((acc, v) => acc + v, 0);
		assert.ok(Math.abs(sum(ab) - sum(a) * sum(b)) <= 1e-12);
	});

	it('preserves cache immutability, handles subarray views, and respects LRU cache eviction', () => {
		const base = new Float64Array([10, 1, 2, 3, 20, 4, 5, 30]);
		const sliceA = base.subarray(1, 4); // [1, 2, 3]
		const sliceB = base.subarray(5, 7); // [4, 5]

		const first = convolutionTypedMemo(sliceA, sliceB);
		assertFloat64ArrayClose(first, new Float64Array([4, 13, 22, 15]), 1e-12);

		// Mutate returned array; subsequent memoized call must remain uncorrupted
		first[0] = 999999;
		const second = convolutionTypedMemo(sliceA, sliceB);
		assertFloat64ArrayClose(second, new Float64Array([4, 13, 22, 15]), 1e-12);

		// Ensure useCache: false bypasses cache cleanly
		const uncached = convolutionTypedMemo(sliceA, sliceB, { useCache: false });
		assertFloat64ArrayClose(uncached, new Float64Array([4, 13, 22, 15]), 1e-12);

		// Exercise cache eviction beyond 256 entries
		const k = new Float64Array([1, 1]);
		for (let i = 0; i < 270; i++) {
			const s = new Float64Array([i, i + 1]);
			const r = convolutionTypedMemo(s, k);
			assertFloat64ArrayClose(r, new Float64Array([i, 2 * i + 1, i + 1]), 1e-12);
		}
	});

	it('validates input types, finite values, and options', () => {
		const validArr = new Float64Array([1, 2, 3]);

		assert.throws(() => convolutionTypedMemo([1, 2, 3], validArr), TypeError);
		assert.throws(() => convolutionTypedMemo(validArr, [1, 2]), TypeError);
		assert.throws(() => convolutionTypedMemo(new Float32Array([1, 2]), validArr), TypeError);
		assert.throws(() => convolutionTypedMemo(null, validArr), TypeError);
		assert.throws(() => convolutionTypedMemo(validArr, undefined), TypeError);

		assert.throws(() => convolutionTypedMemo(new Float64Array([1, NaN]), validArr), RangeError);
		assert.throws(() => convolutionTypedMemo(validArr, new Float64Array([Infinity])), RangeError);
		assert.throws(() => convolutionTypedMemo(validArr, new Float64Array([-Infinity])), RangeError);

		assert.throws(() => convolutionTypedMemo(validArr, validArr, null), TypeError);
		assert.throws(() => convolutionTypedMemo(validArr, validArr, []), TypeError);
		assert.throws(() => convolutionTypedMemo(validArr, validArr, { mode: 'circular' }), RangeError);
		assert.throws(() => convolutionTypedMemo(validArr, validArr, { useCache: 'yes' }), TypeError);
	});
});
