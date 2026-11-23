import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fourierTransformComplexLazy } from './fourierTransformComplexLazy.js';

const EPS = 1e-10;

function assertComplexClose(actual, expected, tol = EPS, msg = '') {
	assert.equal(typeof actual.re, 'number', `${msg} re should be number`);
	assert.equal(typeof actual.im, 'number', `${msg} im should be number`);
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg} expected re ${expected.re}, got ${actual.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg} expected im ${expected.im}, got ${actual.im}`
	);
}

function assertComplexArrayClose(actual, expected, tol = EPS) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < actual.length; i++) {
		assertComplexClose(actual[i], expected[i], tol, `index ${i}:`);
	}
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im };
}

function complexAbsSq(z) {
	return z.re * z.re + z.im * z.im;
}

describe('fourierTransformComplexLazy', () => {
	describe('normal cases', () => {
		it('transforms a 4-point pure complex exponential i^n', () => {
			const input = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
				{ re: -1, im: 0 },
				{ re: 0, im: -1 },
			];
			const result = [...fourierTransformComplexLazy(input)];
			assert.deepStrictEqual(result, [
				{ re: 0, im: 0 },
				{ re: 4, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			]);
		});

		it('transforms a unit impulse to a flat spectrum', () => {
			const input = [
				{ re: 1, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			];
			const result = [...fourierTransformComplexLazy(input)];
			assertComplexArrayClose(
				result,
				Array.from({ length: 5 }, () => ({ re: 1, im: 0 }))
			);
		});

		it('transforms a constant complex sequence into DC bin only', () => {
			const c = { re: 2.5, im: -1.5 };
			const input = [c, c, c, c];
			const result = [...fourierTransformComplexLazy(input)];
			assertComplexArrayClose(result, [
				{ re: 10, im: -6 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			]);
		});

		it('transforms a real cosine wave into symmetric spectral peaks', () => {
			const N = 8;
			const m = 2;
			const input = Array.from({ length: N }, (_, n) => ({
				re: Math.cos((2 * Math.PI * m * n) / N),
				im: 0,
			}));
			const result = [...fourierTransformComplexLazy(input)];
			const expected = Array.from({ length: N }, (_, k) => ({
				re: k === m || k === N - m ? N / 2 : 0,
				im: 0,
			}));
			assertComplexArrayClose(result, expected);
		});

		it('supports inverse DFT and unitary/none normalization modes', () => {
			const signal = [
				{ re: 1, im: 2 },
				{ re: -3, im: 0.5 },
				{ re: 4, im: -1 },
				{ re: 0, im: 2.5 },
			];

			const forward = [...fourierTransformComplexLazy(signal)];
			const recovered = [
				...fourierTransformComplexLazy(forward, { inverse: true }),
			];
			assertComplexArrayClose(recovered, signal);

			const unitaryFwd = [
				...fourierTransformComplexLazy(signal, { normalize: 'unitary' }),
			];
			const unitaryInv = [
				...fourierTransformComplexLazy(unitaryFwd, {
					inverse: true,
					normalize: 'unitary',
				}),
			];
			assertComplexArrayClose(unitaryInv, signal);

			const unscaledInv = [
				...fourierTransformComplexLazy(forward, {
					inverse: true,
					normalize: 'none',
				}),
			];
			assertComplexArrayClose(
				unscaledInv,
				signal.map(({ re, im }) => ({ re: re * 4, im: im * 4 }))
			);
		});

		it('supports evaluating custom and fractional frequencies', () => {
			const signal = [
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
			];
			// At k = 0.5, sum_{n=0}^3 exp(-i*pi*n/4) = 1 + (sqrt(2)/2 - i*sqrt(2)/2) + (-i) + (-sqrt(2)/2 - i*sqrt(2)/2)
			// = 1 + i*(-1 - sqrt(2))
			const [bin0, binHalf, binWrap] = [
				...fourierTransformComplexLazy(signal, {
					frequencies: [0, 0.5, 4],
				}),
			];
			assertComplexClose(bin0, { re: 4, im: 0 });
			assertComplexClose(binHalf, { re: 1, im: -1 - Math.SQRT2 });
			assertComplexClose(binWrap, { re: 4, im: 0 });
		});
	});

	describe('edge cases', () => {
		it('yields nothing for an empty input iterable', () => {
			assert.deepStrictEqual([...fourierTransformComplexLazy([])], []);
			const emptyGen = (function* () {})();
			assert.deepStrictEqual([...fourierTransformComplexLazy(emptyGen)], []);
		});

		it('does not pull from frequencies when input is empty', () => {
			let freqPulled = 0;
			function* freqs() {
				freqPulled += 1;
				yield 0;
			}
			const result = [
				...fourierTransformComplexLazy([], { frequencies: freqs() }),
			];
			assert.deepStrictEqual(result, []);
			assert.equal(freqPulled, 0);
		});

		it('handles a single-element sequence for forward, inverse, and unitary', () => {
			const single = [{ re: -3.5, im: 7.25 }];
			assert.deepStrictEqual([...fourierTransformComplexLazy(single)], single);
			assert.deepStrictEqual(
				[...fourierTransformComplexLazy(single, { inverse: true })],
				single
			);
			assert.deepStrictEqual(
				[...fourierTransformComplexLazy(single, { normalize: 'unitary' })],
				single
			);
		});

		it('handles prime-length and non-power-of-two sequences', () => {
			for (const len of [3, 5, 6, 7, 11]) {
				const seq = Array.from({ length: len }, (_, n) => ({
					re: Math.sin(n + 1),
					im: Math.cos(2 * n - 0.5),
				}));
				const roundTrip = [
					...fourierTransformComplexLazy(
						fourierTransformComplexLazy(seq),
						{ inverse: true }
					),
				];
				assertComplexArrayClose(roundTrip, seq);
			}
		});

		it('normalizes negative zero to positive zero', () => {
			const result = [...fourierTransformComplexLazy([{ re: -0, im: -0 }])];
			assert.ok(Object.is(result[0].re, 0));
			assert.ok(Object.is(result[0].im, 0));
		});

		it('handles negative integer frequencies via periodicity', () => {
			const seq = [
				{ re: 1, im: -1 },
				{ re: 2, im: 3 },
				{ re: -4, im: 0.5 },
				{ re: 0.25, im: -2 },
			];
			const full = [...fourierTransformComplexLazy(seq)];
			const neg = [
				...fourierTransformComplexLazy(seq, { frequencies: [-1, -4, 5] }),
			];
			assertComplexClose(neg[0], full[3]);
			assertComplexClose(neg[1], full[0]);
			assertComplexClose(neg[2], full[1]);
		});
	});

	describe('lazy and streaming behavior', () => {
		it('does not consume the input iterable until iteration begins', () => {
			let pulled = 0;
			function* source() {
				const data = [
					{ re: 1, im: 0 },
					{ re: 2, im: -1 },
					{ re: 0, im: 3 },
				];
				for (const item of data) {
					pulled += 1;
					yield item;
				}
			}

			const gen = fourierTransformComplexLazy(source());
			assert.equal(pulled, 0);

			const first = gen.next();
			assert.equal(pulled, 3);
			assert.equal(first.done, false);
			assertComplexClose(first.value, { re: 3, im: 2 });
		});

		it('supports early termination and infinite frequency generators lazily', () => {
			let freqCount = 0;
			function* infiniteFrequencies() {
				let k = 0;
				while (true) {
					freqCount += 1;
					yield k;
					k += 1;
				}
			}

			const gen = fourierTransformComplexLazy(
				[
					{ re: 1, im: 0 },
					{ re: 0, im: 1 },
					{ re: -1, im: 0 },
					{ re: 0, im: -1 },
				],
				{ frequencies: infiniteFrequencies() }
			);

			assert.equal(freqCount, 0);

			const firstThree = [];
			for (const bin of gen) {
				firstThree.push(bin);
				if (firstThree.length === 3) break;
			}

			assert.equal(freqCount, 3);
			assert.deepStrictEqual(firstThree, [
				{ re: 0, im: 0 },
				{ re: 4, im: 0 },
				{ re: 0, im: 0 },
			]);
		});

		it('fails fast on invalid streamed element without pulling subsequent elements', () => {
			let pulled = 0;
			function* faultyStream() {
				pulled += 1;
				yield { re: 1, im: 0 };
				pulled += 1;
				yield { re: 2, im: NaN };
				pulled += 1;
				yield { re: 3, im: 0 };
			}

			const gen = fourierTransformComplexLazy(faultyStream());
			assert.equal(pulled, 0);
			assert.throws(() => gen.next(), RangeError);
			assert.equal(pulled, 2);
		});

		it('works with non-array iterables and direct generator composition', () => {
			const setInput = new Set([
				{ re: 1, im: 2 },
				{ re: -1, im: 0.5 },
				{ re: 3, im: -4 },
				{ re: 0.5, im: 1.5 },
			]);

			const directChained = fourierTransformComplexLazy(
				fourierTransformComplexLazy(setInput),
				{ inverse: true }
			);
			assertComplexArrayClose([...directChained], [...setInput]);
		});
	});

	describe('invalid input handling', () => {
		it('rejects non-iterable and string inputs eagerly', () => {
			for (const bad of [null, undefined, 42, true, {}, '123']) {
				assert.throws(() => fourierTransformComplexLazy(bad), TypeError);
			}
		});

		it('rejects invalid options eagerly', () => {
			assert.throws(() => fourierTransformComplexLazy([], null), TypeError);
			assert.throws(() => fourierTransformComplexLazy([], []), TypeError);
			assert.throws(() => fourierTransformComplexLazy([], 'opt'), TypeError);
			assert.throws(
				() => fourierTransformComplexLazy([], { inverse: 1 }),
				TypeError
			);
			assert.throws(
				() => fourierTransformComplexLazy([], { normalize: 123 }),
				TypeError
			);
			assert.throws(
				() => fourierTransformComplexLazy([], { normalize: 'ortho' }),
				RangeError
			);
			assert.throws(
				() => fourierTransformComplexLazy([], { frequencies: '012' }),
				TypeError
			);
			assert.throws(
				() => fourierTransformComplexLazy([], { frequencies: 42 }),
				TypeError
			);
		});

		it('rejects malformed complex elements during iteration', () => {
			for (const badEl of [
				null,
				undefined,
				5,
				[1, 2],
				{ re: '1', im: 0 },
				{ re: 1 },
				{},
			]) {
				const gen = fourierTransformComplexLazy([badEl]);
				assert.throws(() => [...gen], TypeError);
			}

			for (const nonFinite of [
				{ re: NaN, im: 0 },
				{ re: 0, im: Infinity },
				{ re: -Infinity, im: 1 },
			]) {
				const gen = fourierTransformComplexLazy([nonFinite]);
				assert.throws(() => [...gen], RangeError);
			}
		});

		it('rejects invalid frequency values lazily during iteration', () => {
			const badTypeGen = fourierTransformComplexLazy([{ re: 1, im: 0 }], {
				frequencies: ['0'],
			});
			assert.throws(() => [...badTypeGen], TypeError);

			const badRangeGen = fourierTransformComplexLazy([{ re: 1, im: 0 }], {
				frequencies: [Infinity],
			});
			assert.throws(() => [...badRangeGen], RangeError);
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies Parseval / Plancherel energy conservation', () => {
			const signal = [
				{ re: 1.5, im: -2.2 },
				{ re: -0.7, im: 3.1 },
				{ re: 4.0, im: 0.4 },
				{ re: -2.3, im: -1.8 },
				{ re: 0.9, im: 2.7 },
				{ re: 3.3, im: -0.6 },
				{ re: -1.1, im: 1.9 },
			];
			const N = signal.length;
			const timeEnergy = signal.reduce((acc, z) => acc + complexAbsSq(z), 0);

			const spectrum = [...fourierTransformComplexLazy(signal)];
			const freqEnergy =
				spectrum.reduce((acc, z) => acc + complexAbsSq(z), 0) / N;
			assert.ok(Math.abs(timeEnergy - freqEnergy) <= EPS);

			const unitarySpectrum = [
				...fourierTransformComplexLazy(signal, { normalize: 'unitary' }),
			];
			const unitaryEnergy = unitarySpectrum.reduce(
				(acc, z) => acc + complexAbsSq(z),
				0
			);
			assert.ok(Math.abs(timeEnergy - unitaryEnergy) <= EPS);
		});

		it('satisfies linearity over complex scalars', () => {
			const x = [
				{ re: 1, im: -2 },
				{ re: 0.5, im: 3 },
				{ re: -1.5, im: 0.25 },
				{ re: 2, im: -0.75 },
				{ re: -0.5, im: 1.25 },
			];
			const y = [
				{ re: -2, im: 1 },
				{ re: 1.25, im: -0.5 },
				{ re: 3, im: 2 },
				{ re: -0.5, im: -1.5 },
				{ re: 0.75, im: 0.5 },
			];
			const alpha = { re: 2, im: -1.5 };
			const beta = { re: -0.75, im: 3 };

			const combined = x.map((xi, i) =>
				complexAdd(complexMul(alpha, xi), complexMul(beta, y[i]))
			);

			const dftCombined = [...fourierTransformComplexLazy(combined)];
			const dftX = [...fourierTransformComplexLazy(x)];
			const dftY = [...fourierTransformComplexLazy(y)];
			const expected = dftX.map((Xk, k) =>
				complexAdd(complexMul(alpha, Xk), complexMul(beta, dftY[k]))
			);

			assertComplexArrayClose(dftCombined, expected);
		});

		it('satisfies the circular convolution theorem', () => {
			const a = [
				{ re: 1, im: 0.5 },
				{ re: -2, im: 1 },
				{ re: 0.5, im: -1.5 },
				{ re: 3, im: 2 },
				{ re: -1, im: 0.25 },
				{ re: 2.5, im: -0.75 },
			];
			const b = [
				{ re: -0.5, im: 2 },
				{ re: 1.5, im: -1 },
				{ re: 2, im: 0.5 },
				{ re: -1.25, im: 1.75 },
				{ re: 0.75, im: -2.25 },
				{ re: -2, im: 0.5 },
			];
			const N = a.length;

			// Direct O(N^2) circular convolution in time domain
			const conv = Array.from({ length: N }, (_, n) => {
				let acc = { re: 0, im: 0 };
				for (let m = 0; m < N; m++) {
					const idx = (n - m + N) % N;
					acc = complexAdd(acc, complexMul(a[m], b[idx]));
				}
				return acc;
			});

			// Frequency-domain pointwise product -> inverse DFT
			const A = [...fourierTransformComplexLazy(a)];
			const B = [...fourierTransformComplexLazy(b)];
			const product = A.map((Ak, k) => complexMul(Ak, B[k]));
			const convViaDft = [
				...fourierTransformComplexLazy(product, { inverse: true }),
			];

			assertComplexArrayClose(convViaDft, conv);
		});

		it('matches independent naive O(N^2) reference DFT formula', () => {
			const signal = [
				{ re: 0.3, im: -1.7 },
				{ re: 2.4, im: 0.8 },
				{ re: -3.1, im: 2.2 },
				{ re: 1.9, im: -0.4 },
				{ re: -0.8, im: -2.9 },
				{ re: 4.2, im: 1.1 },
			];
			const N = signal.length;

			const reference = Array.from({ length: N }, (_, k) => {
				let re = 0;
				let im = 0;
				for (let n = 0; n < N; n++) {
					const theta = (-2 * Math.PI * k * n) / N;
					const c = Math.cos(theta);
					const s = Math.sin(theta);
					re += signal[n].re * c - signal[n].im * s;
					im += signal[n].re * s + signal[n].im * c;
				}
				return { re, im };
			});

			const actual = [...fourierTransformComplexLazy(signal)];
			assertComplexArrayClose(actual, reference);
		});
	});
});
