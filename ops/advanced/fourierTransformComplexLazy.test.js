import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fourierTransformComplexLazy } from './fourierTransformComplexLazy.js';

const EPS = 1e-10;

function assertComplexClose(actual, expected, eps = EPS, label = '') {
	const prefix = label ? `${label}: ` : '';
	assert.equal(typeof actual, 'object', `${prefix}result must be an object`);
	assert.notEqual(actual, null, `${prefix}result must not be null`);
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${prefix}real part mismatch: got ${actual.re}, expected ${expected.re}`,
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${prefix}imaginary part mismatch: got ${actual.im}, expected ${expected.im}`,
	);
}

function assertComplexSeqClose(actual, expected, eps = EPS) {
	assert.equal(actual.length, expected.length, 'sequence length mismatch');
	for (let i = 0; i < expected.length; i += 1) {
		assertComplexClose(actual[i], expected[i], eps, `bin[${i}]`);
	}
}

describe('fourierTransformComplexLazy', () => {
	describe('normal cases', () => {
		it('transforms a unit impulse [1, 0, 0, 0] to a flat spectrum [1, 1, 1, 1]', () => {
			const signal = [
				{ re: 1, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			];

			const spectrum = [...fourierTransformComplexLazy(signal)];

			assertComplexSeqClose(spectrum, [
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
			]);
		});

		it('transforms a constant complex signal to a DC-only spectrum', () => {
			const c = { re: 3.5, im: -1.25 };
			const signal = [c, c, c, c, c];

			const spectrum = [...fourierTransformComplexLazy(signal)];

			assertComplexSeqClose(spectrum, [
				{ re: 5 * c.re, im: 5 * c.im },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			]);
		});

		it('isolates a single pure complex sinusoid exp(+2πi * k0 * n / N) at bin k0', () => {
			const N = 8;
			const k0 = 3;
			const amplitude = { re: 2, im: -1 };
			const signal = Array.from({ length: N }, (_, n) => {
				const angle = (2 * Math.PI * k0 * n) / N;
				const cosA = Math.cos(angle);
				const sinA = Math.sin(angle);
				return {
					re: amplitude.re * cosA - amplitude.im * sinA,
					im: amplitude.re * sinA + amplitude.im * cosA,
				};
			});

			const spectrum = [...fourierTransformComplexLazy(signal)];

			const expected = Array.from({ length: N }, (_, k) =>
				k === k0
					? { re: N * amplitude.re, im: N * amplitude.im }
					: { re: 0, im: 0 },
			);
			assertComplexSeqClose(spectrum, expected);
		});

		it('computes exact analytical DFT for an arbitrary 4-point complex sequence', () => {
			// x = [1+2i, -1+0i, 0-3i, 4+1i]
			// W_4 = -i:
			// X[0] = (1+2i) + (-1+0i) + (0-3i) + (4+1i) = 4 + 0i
			// X[1] = (1+2i) + (-1)(-i) + (-3i)(-1) + (4+i)(i) = (1+2i) + i + 3i + (-1+4i) = 0 + 10i
			// X[2] = (1+2i) - (-1+0i) + (0-3i) - (4+1i) = -2 - 2i
			// X[3] = (1+2i) + (-1)(i) + (-3i)(-1) + (4+i)(-i) = (1+2i) - i + 3i + (1-4i) = 2 + 0i
			const signal = [
				{ re: 1, im: 2 },
				{ re: -1, im: 0 },
				{ re: 0, im: -3 },
				{ re: 4, im: 1 },
			];

			const spectrum = [...fourierTransformComplexLazy(signal)];

			assertComplexSeqClose(spectrum, [
				{ re: 4, im: 0 },
				{ re: 0, im: 10 },
				{ re: -2, im: -2 },
				{ re: 2, im: 0 },
			]);
		});

		it('consumes non-array generator iterables directly', () => {
			function* complexSource() {
				yield { re: 1, im: 0 };
				yield { re: 0, im: 1 };
				yield { re: -1, im: 0 };
				yield { re: 0, im: -1 };
			}

			// exp(+2πi * 1 * n / 4) -> peak of 4 at bin k=1
			const spectrum = [...fourierTransformComplexLazy(complexSource())];

			assertComplexSeqClose(spectrum, [
				{ re: 0, im: 0 },
				{ re: 4, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			]);
		});
	});

	describe('edge cases & lazy streaming behavior', () => {
		it('yields nothing for an empty iterable', () => {
			assert.deepStrictEqual([...fourierTransformComplexLazy([])], []);
			assert.deepStrictEqual(
				[...fourierTransformComplexLazy([], { inverse: true })],
				[],
			);

			function* emptyGen() {}
			assert.deepStrictEqual([...fourierTransformComplexLazy(emptyGen())], []);
		});

		it('handles a single-sample signal identically for forward and inverse transforms', () => {
			const sample = [{ re: -7.25, im: 4.5 }];

			assertComplexSeqClose([...fourierTransformComplexLazy(sample)], sample);
			assertComplexSeqClose(
				[...fourierTransformComplexLazy(sample, { inverse: true })],
				sample,
			);
		});

		it('does not consume the input iterable until the first .next() call', () => {
			let pullCount = 0;
			function* trackedSource() {
				pullCount += 1;
				yield { re: 1, im: 0 };
				pullCount += 1;
				yield { re: 2, im: 0 };
			}

			const gen = fourierTransformComplexLazy(trackedSource());
			assert.equal(pullCount, 0, 'source must not be pulled before iteration starts');

			const first = gen.next();
			assert.equal(pullCount, 2);
			assert.equal(first.done, false);
			assertComplexClose(first.value, { re: 3, im: 0 });
		});

		it('supports lazy partial consumption of only the first m bins', () => {
			const N = 16;
			const signal = Array.from({ length: N }, (_, n) => ({
				re: Math.cos((2 * Math.PI * 2 * n) / N),
				im: Math.sin((2 * Math.PI * 2 * n) / N),
			}));

			const gen = fourierTransformComplexLazy(signal);
			const m = 4;
			const firstM = [];
			for (let k = 0; k < m; k += 1) {
				const step = gen.next();
				assert.equal(step.done, false);
				firstM.push(step.value);
			}

			// Verify only the first m bins were yielded and match expected values
			assertComplexSeqClose(firstM, [
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: N, im: 0 },
				{ re: 0, im: 0 },
			]);

			// Closing early terminates cleanly without yielding further bins
			const closed = gen.return();
			assert.equal(closed.done, true);
			assert.equal(gen.next().done, true);
		});

		it('avoids negative zero (-0) in output components', () => {
			const signal = [
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			];
			const spectrum = [...fourierTransformComplexLazy(signal)];
			for (const bin of spectrum) {
				assert.equal(Object.is(bin.re, -0), false);
				assert.equal(Object.is(bin.im, -0), false);
			}
		});

		it('fails fast on invalid inputs and options', () => {
			// Invalid signal iterables
			for (const badSignal of [null, undefined, 42, {}, 'abc']) {
				assert.throws(
					() => [...fourierTransformComplexLazy(badSignal)],
					TypeError,
				);
			}

			// Invalid options
			for (const badOptions of [null, 'inverse', 123, []]) {
				assert.throws(
					() => [...fourierTransformComplexLazy([{ re: 1, im: 0 }], badOptions)],
					TypeError,
				);
			}
			assert.throws(
				() => [...fourierTransformComplexLazy([{ re: 1, im: 0 }], { inverse: 'yes' })],
				TypeError,
			);

			// Invalid complex sample shapes / types
			for (const badSample of [
				null,
				undefined,
				5,
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: null },
			]) {
				assert.throws(
					() => [...fourierTransformComplexLazy([badSample])],
					TypeError,
				);
			}

			// Non-finite complex components
			for (const nonFinite of [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(
					() => [...fourierTransformComplexLazy([nonFinite])],
					RangeError,
				);
			}
		});

		it('stops pulling from source iterable immediately upon encountering an invalid sample', () => {
			let pulled = 0;
			function* faultySource() {
				pulled += 1;
				yield { re: 1, im: 0 };
				pulled += 1;
				yield { re: Number.NaN, im: 0 };
				pulled += 1;
				yield { re: 3, im: 0 };
			}

			assert.throws(() => [...fourierTransformComplexLazy(faultySource())], RangeError);
			assert.equal(pulled, 2, 'must fail fast without pulling subsequent elements');
		});
	});

	describe('mathematical cross-checks', () => {
		it('satisfies Parseval theorem: sum |x[n]|^2 == (1/N) * sum |X[k]|^2', () => {
			const signal = [
				{ re: 1.5, im: -2.3 },
				{ re: -0.7, im: 4.1 },
				{ re: 3.2, im: 0.9 },
				{ re: -5.4, im: -1.8 },
				{ re: 2.0, im: 3.7 },
				{ re: 0.4, im: -0.6 },
				{ re: -1.1, im: 2.5 },
			];
			const N = signal.length;

			const timeEnergy = signal.reduce(
				(acc, z) => acc + z.re * z.re + z.im * z.im,
				0,
			);

			let freqEnergy = 0;
			for (const bin of fourierTransformComplexLazy(signal)) {
				freqEnergy += bin.re * bin.re + bin.im * bin.im;
			}

			assert.ok(
				Math.abs(timeEnergy - freqEnergy / N) <= 1e-10,
				`Parseval mismatch: time=${timeEnergy}, freq/N=${freqEnergy / N}`,
			);
		});

		it('satisfies round-trip identity IDFT(DFT(x)) == x via streamed generator chaining', () => {
			const signal = [
				{ re: 2.75, im: -1.5 },
				{ re: -3.125, im: 0.625 },
				{ re: 0.0, im: 4.25 },
				{ re: 5.5, im: 2.0 },
				{ re: -1.25, im: -3.75 },
				{ re: 0.875, im: -0.125 },
			];

			const dftStream = fourierTransformComplexLazy(signal);
			const reconstructed = [
				...fourierTransformComplexLazy(dftStream, { inverse: true }),
			];

			assertComplexSeqClose(reconstructed, signal, 1e-10);
		});

		it('satisfies reverse round-trip identity DFT(IDFT(X)) == X', () => {
			const spectrum = [
				{ re: 10, im: -4 },
				{ re: -2.5, im: 7.5 },
				{ re: 0.5, im: -1.25 },
				{ re: 3.0, im: 2.0 },
				{ re: -6.0, im: 0.0 },
			];

			const timeStream = fourierTransformComplexLazy(spectrum, { inverse: true });
			const reconstructed = [...fourierTransformComplexLazy(timeStream)];

			assertComplexSeqClose(reconstructed, spectrum, 1e-10);
		});

		it('satisfies linearity: DFT(a*x + b*y) == a*DFT(x) + b*DFT(y)', () => {
			const x = [
				{ re: 1, im: 2 },
				{ re: -3, im: 0.5 },
				{ re: 2, im: -1 },
				{ re: 0.5, im: 4 },
				{ re: -1, im: -2 },
			];
			const y = [
				{ re: -2, im: 1 },
				{ re: 4, im: -3 },
				{ re: 0, im: 2.5 },
				{ re: 1.5, im: -0.5 },
				{ re: 3, im: 1 },
			];
			const a = { re: 2, im: -1 };
			const b = { re: -0.5, im: 3 };

			const mul = (u, v) => ({
				re: u.re * v.re - u.im * v.im,
				im: u.re * v.im + u.im * v.re,
			});
			const add = (u, v) => ({ re: u.re + v.re, im: u.im + v.im });

			const combined = x.map((xi, i) => add(mul(a, xi), mul(b, y[i])));
			const dftCombined = [...fourierTransformComplexLazy(combined)];
			const dftX = [...fourierTransformComplexLazy(x)];
			const dftY = [...fourierTransformComplexLazy(y)];
			const expected = dftX.map((xi, k) => add(mul(a, xi), mul(b, dftY[k])));

			assertComplexSeqClose(dftCombined, expected, 1e-10);
		});
	});
});
