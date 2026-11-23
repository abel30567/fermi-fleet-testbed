import test from 'node:test';
import assert from 'node:assert/strict';
import { convolutionTypedRecursive } from './convolutionTypedRecursive.js';

/**
 * Independent iterative reference implementation of discrete 1D convolution.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {'full' | 'same' | 'valid'} [mode='full']
 * @returns {Float64Array}
 */
function referenceConvolve(a, b, mode = 'full') {
	if (a.length === 0 || b.length === 0) {
		return new Float64Array(0);
	}
	const full = new Float64Array(a.length + b.length - 1);
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			full[i + j] += a[i] * b[j];
		}
	}
	if (mode === 'full') return full;
	const minLen = Math.min(a.length, b.length);
	const maxLen = Math.max(a.length, b.length);
	if (mode === 'same') {
		const start = Math.floor((minLen - 1) / 2);
		return full.slice(start, start + maxLen);
	}
	const start = minLen - 1;
	return full.slice(start, start + maxLen - minLen + 1);
}

/**
 * Deterministic LCG PRNG for reproducible tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return (state / 0x100000000) * 20 - 10;
	};
}

/**
 * Asserts two Float64Arrays have equal length and element-wise closeness.
 *
 * @param {Float64Array} actual
 * @param {Float64Array | number[]} expected
 * @param {number} [tol=1e-11]
 */
function assertCloseArray(actual, expected, tol = 1e-11) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array');
	assert.equal(actual.length, expected.length, 'array length mismatch');
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i]);
		const scale = Math.max(1, Math.abs(expected[i]));
		assert.ok(
			diff <= tol * scale,
			`index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff}`,
		);
	}
}

test('normal cases: basic integer and floating-point full convolutions', () => {
	const a = new Float64Array([1, 2, 3]);
	const b = new Float64Array([4, 5, 6]);
	const res = convolutionTypedRecursive(a, b);
	assertCloseArray(res, [4, 13, 28, 27, 18], 0);

	// Moving average filter
	const signal = new Float64Array([2, 4, 6, 8, 10]);
	const kernel = new Float64Array([0.5, 0.5]);
	assertCloseArray(convolutionTypedRecursive(signal, kernel), [1, 3, 5, 7, 9, 5], 1e-15);

	// Asymmetric lengths (signal shorter than kernel)
	const shortSig = new Float64Array([1, -2]);
	const longKer = new Float64Array([3, 0.5, -1, 4, 2]);
	assertCloseArray(
		convolutionTypedRecursive(shortSig, longKer),
		[3, -5.5, -2, 6, -6, -4],
		1e-15,
	);
});

test('normal cases: full, same, and valid modes', () => {
	const a = new Float64Array([1, 2, 3, 4, 5]);
	const b = new Float64Array([1, 0, -1]);

	// Full: [1, 2, 2, 2, 2, -4, -5]
	assertCloseArray(convolutionTypedRecursive(a, b, 'full'), [1, 2, 2, 2, 2, -4, -5], 0);
	// Same (length 5, centered): [2, 2, 2, 2, -4]
	assertCloseArray(convolutionTypedRecursive(a, b, 'same'), [2, 2, 2, 2, -4], 0);
	// Valid (length 3): [2, 2, 2]
	assertCloseArray(convolutionTypedRecursive(a, b, 'valid'), [2, 2, 2], 0);

	// Even kernel length with same and valid
	const c = new Float64Array([1, 2, 3, 4]);
	const d = new Float64Array([1, 2]);
	assertCloseArray(convolutionTypedRecursive(c, d, 'full'), [1, 4, 7, 10, 8], 0);
	assertCloseArray(convolutionTypedRecursive(c, d, 'same'), [1, 4, 7, 10], 0);
	assertCloseArray(convolutionTypedRecursive(c, d, 'valid'), [4, 7, 10], 0);
});

test('normal cases: does not mutate input arrays and handles self-convolution', () => {
	const a = new Float64Array([1.5, -2.5, 3.5, 0.5]);
	const aCopy = new Float64Array(a);
	const b = new Float64Array([2, -1]);
	const bCopy = new Float64Array(b);

	convolutionTypedRecursive(a, b);
	assert.deepEqual(a, aCopy);
	assert.deepEqual(b, bCopy);

	// Self-convolution (aliased signal and kernel reference)
	const selfConv = convolutionTypedRecursive(a, a);
	assertCloseArray(selfConv, referenceConvolve(a, a), 1e-14);
	assert.deepEqual(a, aCopy);
});

test('edge cases: empty arrays, single-element arrays, impulses, and zeros', () => {
	const empty = new Float64Array(0);
	const nonEmpty = new Float64Array([1, 2, 3]);

	for (const mode of ['full', 'same', 'valid']) {
		assert.equal(convolutionTypedRecursive(empty, nonEmpty, mode).length, 0);
		assert.equal(convolutionTypedRecursive(nonEmpty, empty, mode).length, 0);
		assert.equal(convolutionTypedRecursive(empty, empty, mode).length, 0);
	}

	// Single-element arrays
	assertCloseArray(
		convolutionTypedRecursive(new Float64Array([3.5]), new Float64Array([-2])),
		[-7],
		0,
	);
	assertCloseArray(
		convolutionTypedRecursive(new Float64Array([5]), new Float64Array([1, 2, 3, 4])),
		[5, 10, 15, 20],
		0,
	);

	// Unit impulse and delayed impulse
	const signal = new Float64Array([4, -1, 7, 2.5]);
	assertCloseArray(convolutionTypedRecursive(signal, new Float64Array([1])), signal, 0);
	assertCloseArray(
		convolutionTypedRecursive(signal, new Float64Array([0, 0, 1])),
		[0, 0, 4, -1, 7, 2.5],
		0,
	);

	// All-zero kernel with negative signal produces +0 (no -0 artifacts)
	const zeroRes = convolutionTypedRecursive(new Float64Array([-1, -2, -3]), new Float64Array([0, 0]));
	assert.equal(zeroRes.length, 4);
	for (let i = 0; i < zeroRes.length; i++) {
		assert.ok(Object.is(zeroRes[i], 0), `expected +0 at index ${i}`);
	}
});

test('edge cases: high dynamic range preserves precision without cancellation', () => {
	const a = new Float64Array([1e12, 1e-4, 1e-4, 1e12]);
	const b = new Float64Array([1e-4, 1e12, 1e12, 1e-4]);
	const actual = convolutionTypedRecursive(a, b);
	const expected = referenceConvolve(a, b);
	assertCloseArray(actual, expected, 1e-14);
});

test('invalid inputs: non-Float64Array, non-finite values, and invalid modes', () => {
	const valid = new Float64Array([1, 2, 3]);

	// Non-Float64Array signal or kernel
	const badInputs = [
		null,
		undefined,
		[1, 2, 3],
		new Float32Array([1, 2, 3]),
		new Int32Array([1, 2, 3]),
		42,
		'123',
		{ length: 2, 0: 1, 1: 2 },
	];
	for (const bad of badInputs) {
		assert.throws(() => convolutionTypedRecursive(bad, valid), TypeError);
		assert.throws(() => convolutionTypedRecursive(valid, bad), TypeError);
	}

	// Non-finite elements
	for (const badVal of [NaN, Infinity, -Infinity]) {
		assert.throws(
			() => convolutionTypedRecursive(new Float64Array([1, badVal, 3]), valid),
			RangeError,
		);
		assert.throws(
			() => convolutionTypedRecursive(valid, new Float64Array([badVal])),
			RangeError,
		);
	}

	// Invalid mode
	assert.throws(() => convolutionTypedRecursive(valid, valid, 123), TypeError);
	assert.throws(() => convolutionTypedRecursive(valid, valid, null), TypeError);
	assert.throws(() => convolutionTypedRecursive(valid, valid, 'circular'), RangeError);
	assert.throws(() => convolutionTypedRecursive(valid, valid, ''), RangeError);
});

test('cross-check: matches direct iterative reference across diverse sizes and modes', () => {
	const rng = makeRng(20261123);
	const sizePairs = [
		[1, 1],
		[2, 2],
		[3, 5],
		[7, 4],
		[16, 16],
		[17, 19],
		[31, 13],
		[64, 33],
		[100, 37],
		[129, 256],
	];

	for (const [n, m] of sizePairs) {
		const a = Float64Array.from({ length: n }, () => rng());
		const b = Float64Array.from({ length: m }, () => rng());

		for (const mode of ['full', 'same', 'valid']) {
			const actual = convolutionTypedRecursive(a, b, mode);
			const expected = referenceConvolve(a, b, mode);
			assertCloseArray(actual, expected, 1e-12);
		}
	}
});

test('cross-check: algebraic identities and DFT convolution theorem', () => {
	const rng = makeRng(987654321);
	const a = Float64Array.from({ length: 19 }, () => rng());
	const b = Float64Array.from({ length: 13 }, () => rng());
	const c = Float64Array.from({ length: 13 }, () => rng());

	// 1. Commutativity: a * b === b * a
	assertCloseArray(convolutionTypedRecursive(a, b), convolutionTypedRecursive(b, a), 1e-12);

	// 2. Associativity: (a * b) * c === a * (b * c)
	const leftAssoc = convolutionTypedRecursive(convolutionTypedRecursive(a, b), c);
	const rightAssoc = convolutionTypedRecursive(a, convolutionTypedRecursive(b, c));
	assertCloseArray(leftAssoc, rightAssoc, 1e-11);

	// 3. Distributivity: a * (b + c) === (a * b) + (a * c)
	const bPlusC = Float64Array.from(b, (v, i) => v + c[i]);
	const lhs = convolutionTypedRecursive(a, bPlusC);
	const ab = convolutionTypedRecursive(a, b);
	const ac = convolutionTypedRecursive(a, c);
	const rhs = Float64Array.from(ab, (v, i) => v + ac[i]);
	assertCloseArray(lhs, rhs, 1e-12);

	// 4. Polynomial evaluation identity: P_{a*b}(x) === P_a(x) * P_b(x)
	const evalPoly = (coeffs, x) => {
		let acc = 0;
		let pow = 1;
		for (let i = 0; i < coeffs.length; i++) {
			acc += coeffs[i] * pow;
			pow *= x;
		}
		return acc;
	};
	for (const x of [-1, 0.5, 1, 1.25]) {
		const prod = evalPoly(a, x) * evalPoly(b, x);
		const convEval = evalPoly(ab, x);
		assert.ok(Math.abs(convEval - prod) <= 1e-10 * Math.max(1, Math.abs(prod)));
	}

	// 5. Discrete-Time Fourier Transform convolution theorem at arbitrary frequencies
	const dtft = (arr, omega) => {
		let re = 0;
		let im = 0;
		for (let n = 0; n < arr.length; n++) {
			re += arr[n] * Math.cos(omega * n);
			im -= arr[n] * Math.sin(omega * n);
		}
		return [re, im];
	};
	for (const omega of [0.3, 1.1, Math.PI / 2, 2.4]) {
		const [aRe, aIm] = dtft(a, omega);
		const [bRe, bIm] = dtft(b, omega);
		const expectedRe = aRe * bRe - aIm * bIm;
		const expectedIm = aRe * bIm + aIm * bRe;
		const [cRe, cIm] = dtft(ab, omega);
		assert.ok(Math.abs(cRe - expectedRe) <= 1e-11 * Math.max(1, Math.abs(expectedRe)));
		assert.ok(Math.abs(cIm - expectedIm) <= 1e-11 * Math.max(1, Math.abs(expectedIm)));
	}
});
