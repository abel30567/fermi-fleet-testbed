import test from 'node:test';
import assert from 'node:assert/strict';
import { fourierTransformFloatIterative } from './fourierTransformFloatIterative.js';

function assertClose(actual, expected, eps = 1e-10, message = '') {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`${message ? message + ': ' : ''}expected ${actual} to be within ${eps} of ${expected}`
	);
}

function assertComplexArrayClose(actual, expected, eps = 1e-10) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assertClose(actual[i].re, expected[i].re, eps, `index ${i} re`);
		assertClose(actual[i].im, expected[i].im, eps, `index ${i} im`);
	}
}

test('handles empty input array', () => {
	assert.deepEqual(fourierTransformFloatIterative([]), []);
	assert.deepEqual(fourierTransformFloatIterative(new Float64Array(0)), []);
});

test('handles single-element real and complex signals', () => {
	assert.deepEqual(fourierTransformFloatIterative([42.5]), [{ re: 42.5, im: 0 }]);
	assert.deepEqual(
		fourierTransformFloatIterative([{ re: -3.25, im: 7.5 }]),
		[{ re: -3.25, im: 7.5 }]
	);
	assert.deepEqual(
		fourierTransformFloatIterative([{ re: -3.25, im: 7.5 }], { inverse: true }),
		[{ re: -3.25, im: 7.5 }]
	);
});

test('computes exact known DFT for impulse, constant, and alternating signals', () => {
	// Unit impulse [1, 0, 0, 0] -> all bins equal 1 + 0i
	const impulse = fourierTransformFloatIterative([1, 0, 0, 0]);
	assertComplexArrayClose(impulse, [
		{ re: 1, im: 0 },
		{ re: 1, im: 0 },
		{ re: 1, im: 0 },
		{ re: 1, im: 0 },
	]);

	// Constant signal [3, 3, 3, 3] -> [12, 0, 0, 0]
	const constant = fourierTransformFloatIterative([3, 3, 3, 3]);
	assertComplexArrayClose(constant, [
		{ re: 12, im: 0 },
		{ re: 0, im: 0 },
		{ re: 0, im: 0 },
		{ re: 0, im: 0 },
	]);

	// Nyquist alternating signal [1, -1, 1, -1] -> [0, 0, 4, 0]
	const nyquist = fourierTransformFloatIterative([1, -1, 1, -1]);
	assertComplexArrayClose(nyquist, [
		{ re: 0, im: 0 },
		{ re: 0, im: 0 },
		{ re: 4, im: 0 },
		{ re: 0, im: 0 },
	]);
});

test('computes known textbook 4-point DFT [1, 2, 3, 4]', () => {
	// X[0] = 10, X[1] = -2 + 2i, X[2] = -2, X[3] = -2 - 2i
	const out = fourierTransformFloatIterative([1, 2, 3, 4]);
	assertComplexArrayClose(out, [
		{ re: 10, im: 0 },
		{ re: -2, im: 2 },
		{ re: -2, im: 0 },
		{ re: -2, im: -2 },
	]);
});

test('detects pure cosine and sine frequency bins accurately', () => {
	const N = 16;
	const k0 = 3;
	const cosSignal = Array.from({ length: N }, (_, n) => Math.cos((2 * Math.PI * k0 * n) / N));
	const cosSpec = fourierTransformFloatIterative(cosSignal);

	for (let k = 0; k < N; k++) {
		const expectedRe = k === k0 || k === N - k0 ? N / 2 : 0;
		assertClose(cosSpec[k].re, expectedRe, 1e-10, `cos bin ${k} re`);
		assertClose(cosSpec[k].im, 0, 1e-10, `cos bin ${k} im`);
	}

	const sinSignal = Array.from({ length: N }, (_, n) => Math.sin((2 * Math.PI * k0 * n) / N));
	const sinSpec = fourierTransformFloatIterative(sinSignal);

	for (let k = 0; k < N; k++) {
		const expectedIm = k === k0 ? -N / 2 : k === N - k0 ? N / 2 : 0;
		assertClose(sinSpec[k].re, 0, 1e-10, `sin bin ${k} re`);
		assertClose(sinSpec[k].im, expectedIm, 1e-10, `sin bin ${k} im`);
	}
});

test('supports non-power-of-two prime lengths and Float64Array inputs', () => {
	const arr = [0.5, -1.25, 3.75, 0.0, 2.125, -0.875, 1.5];
	const fromArray = fourierTransformFloatIterative(arr);
	const fromTyped = fourierTransformFloatIterative(new Float64Array(arr));

	assertComplexArrayClose(fromTyped, fromArray, 1e-14);
	// Conjugate symmetry for real input: X[N - k] = conj(X[k])
	for (let k = 1; k < arr.length; k++) {
		assertClose(fromArray[arr.length - k].re, fromArray[k].re, 1e-12);
		assertClose(fromArray[arr.length - k].im, -fromArray[k].im, 1e-12);
	}
});

test('normalizes negative zero outputs to positive zero', () => {
	const out = fourierTransformFloatIterative([-0, -0]);
	for (const bin of out) {
		assert.ok(!Object.is(bin.re, -0));
		assert.ok(!Object.is(bin.im, -0));
	}
});

test('cross-check: Parseval theorem holds for real and complex signals', () => {
	const signals = [
		[1.5, -2.25, 0.75, 4.1, -3.3, 2.0, -0.5],
		[
			{ re: 1.2, im: -0.7 },
			{ re: -2.4, im: 3.1 },
			{ re: 0.5, im: 0.9 },
			{ re: 4.0, im: -1.8 },
			{ re: -1.1, im: -2.2 },
		],
	];

	for (const sig of signals) {
		const N = sig.length;
		const timeEnergy = sig.reduce((acc, s) => {
			const re = typeof s === 'number' ? s : s.re;
			const im = typeof s === 'number' ? 0 : s.im;
			return acc + re * re + im * im;
		}, 0);

		const spec = fourierTransformFloatIterative(sig);
		const freqEnergy = spec.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0) / N;

		assertClose(freqEnergy, timeEnergy, 1e-10, 'Parseval energy equality');
	}
});

test('cross-check: forward then inverse DFT round-trip recovers original signal', () => {
	const original = [
		{ re: 2.5, im: -1.25 },
		{ re: -0.75, im: 3.5 },
		{ re: 4.125, im: 0.0 },
		{ re: -3.0, im: -2.75 },
		{ re: 1.625, im: 1.125 },
		{ re: 0.0, im: -4.25 },
		{ re: -1.875, im: 2.0 },
		{ re: 3.25, im: -0.5 },
		{ re: -2.125, im: 1.75 },
	];

	const spectrum = fourierTransformFloatIterative(original);
	const recovered = fourierTransformFloatIterative(spectrum, { inverse: true });

	assertComplexArrayClose(recovered, original, 1e-11);
});

test('cross-check: linearity property DFT(a*x + b*y) = a*DFT(x) + b*DFT(y)', () => {
	const x = [1.1, -2.3, 0.4, 3.7, -1.5, 2.2];
	const y = [-0.9, 1.8, 2.5, -0.6, 4.1, -3.0];
	const a = 2.5;
	const b = -1.75;

	const combined = x.map((xi, i) => a * xi + b * y[i]);
	const lhs = fourierTransformFloatIterative(combined);
	const dftX = fourierTransformFloatIterative(x);
	const dftY = fourierTransformFloatIterative(y);
	const rhs = dftX.map((cx, i) => ({
		re: a * cx.re + b * dftY[i].re,
		im: a * cx.im + b * dftY[i].im,
	}));

	assertComplexArrayClose(lhs, rhs, 1e-11);
});

test('rejects invalid signal container types', () => {
	for (const bad of [null, undefined, 123, '123', {}, new Int32Array([1, 2])]) {
		assert.throws(() => fourierTransformFloatIterative(bad), TypeError);
	}
});

test('rejects invalid sample elements and non-finite float64 values', () => {
	assert.throws(() => fourierTransformFloatIterative(['1']), TypeError);
	assert.throws(() => fourierTransformFloatIterative([null]), TypeError);
	assert.throws(() => fourierTransformFloatIterative([undefined]), TypeError);
	assert.throws(() => fourierTransformFloatIterative([1n]), TypeError);
	assert.throws(() => fourierTransformFloatIterative([[1, 2]]), TypeError);
	assert.throws(() => fourierTransformFloatIterative([{ re: 1 }]), TypeError);
	assert.throws(() => fourierTransformFloatIterative([{ re: '1', im: 0 }]), TypeError);

	assert.throws(() => fourierTransformFloatIterative([NaN]), RangeError);
	assert.throws(() => fourierTransformFloatIterative([Infinity]), RangeError);
	assert.throws(() => fourierTransformFloatIterative([-Infinity]), RangeError);
	assert.throws(() => fourierTransformFloatIterative([{ re: 1, im: NaN }]), RangeError);
	assert.throws(() => fourierTransformFloatIterative([{ re: Infinity, im: 0 }]), RangeError);
	assert.throws(() => fourierTransformFloatIterative(new Float64Array([1, NaN])), RangeError);
});

test('rejects invalid options argument', () => {
	assert.throws(() => fourierTransformFloatIterative([1, 2], null), TypeError);
	assert.throws(() => fourierTransformFloatIterative([1, 2], true), TypeError);
	assert.throws(() => fourierTransformFloatIterative([1, 2], []), TypeError);
	assert.throws(() => fourierTransformFloatIterative([1, 2], { inverse: 'yes' }), TypeError);
	assert.throws(() => fourierTransformFloatIterative([1, 2], { inverse: 1 }), TypeError);
});
