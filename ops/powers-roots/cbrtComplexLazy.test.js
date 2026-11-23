import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtComplexLazy } from './cbrtComplexLazy.js';

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function complexCube(z) {
	return complexMul(complexMul(z, z), z);
}

function complexSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im };
}

function complexDiv(a, b) {
	const denom = b.re * b.re + b.im * b.im;
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	};
}

function assertComplexClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.hypot(actual.re - expected.re, actual.im - expected.im);
	const scale = Math.hypot(expected.re, expected.im);
	const limit = Math.max(absTol, relTol * scale);
	assert.ok(
		diff <= limit,
		`Expected { re: ${expected.re}, im: ${expected.im} } (+/- ${limit}), got { re: ${actual.re}, im: ${actual.im} } (diff=${diff})`,
	);
}

/**
 * Independent reference solver for principal cube root via Newton-Raphson on f(w) = w^3 - z.
 * Starts from a quadrant-appropriate initial guess in the principal sector (-pi/3, pi/3].
 */
function newtonCbrtComplex(z) {
	if (z.re === 0 && z.im === 0) {
		return { re: 0, im: 0 };
	}
	const r = Math.hypot(z.re, z.im);
	const roughMag = Math.exp(Math.log(r) / 3);
	// Coarse initial direction inside the principal sector (-pi/3, pi/3]
	let w =
		z.im > 0
			? { re: roughMag * 0.85, im: roughMag * 0.5 }
			: z.im < 0
				? { re: roughMag * 0.85, im: -roughMag * 0.5 }
				: z.re > 0
					? { re: roughMag, im: 0 }
					: { re: roughMag * 0.5, im: roughMag * 0.86 };

	for (let i = 0; i < 40; i += 1) {
		const w2 = complexMul(w, w);
		const w3 = complexMul(w2, w);
		const f = complexSub(w3, z);
		const df = { re: 3 * w2.re, im: 3 * w2.im };
		const step = complexDiv(f, df);
		w = complexSub(w, step);
		if (Math.hypot(step.re, step.im) <= 1e-15 * Math.hypot(w.re, w.im)) {
			break;
		}
	}
	return w;
}

describe('cbrtComplexLazy', () => {
	describe('normal cases', () => {
		it('computes principal cube roots for positive reals, negative reals, pure imaginaries, and zero', () => {
			const inputs = [
				{ re: 0, im: 0 },
				{ re: 8, im: 0 },
				{ re: 27, im: 0 },
				{ re: -8, im: 0 },
				{ re: 0, im: 8 },
				{ re: 0, im: -8 },
			];
			const expected = [
				{ re: 0, im: 0 },
				{ re: 2, im: 0 },
				{ re: 3, im: 0 },
				{ re: 1, im: Math.sqrt(3) },
				{ re: Math.sqrt(3), im: 1 },
				{ re: Math.sqrt(3), im: -1 },
			];

			const actual = [...cbrtComplexLazy(inputs)];
			assert.equal(actual.length, expected.length);
			for (let i = 0; i < expected.length; i += 1) {
				assertComplexClose(actual[i], expected[i], 1e-14, 1e-14);
			}
		});

		it('computes principal cube roots across all four quadrants', () => {
			// Exact cubes of known principal-sector roots
			const roots = [
				{ re: 2, im: 1 }, // Q1, arg ~ 0.46 rad < pi/3
				{ re: 2, im: -1 }, // Q4, arg ~ -0.46 rad > -pi/3
				{ re: 1.5, im: 1.2 }, // Q1, arg ~ 0.67 rad < pi/3
				{ re: 1.5, im: -1.2 }, // Q4, arg ~ -0.67 rad > -pi/3
				{ re: 1, im: 1.5 }, // Q1, arg ~ 0.98 rad < pi/3 (cube is in Q2)
				{ re: 1, im: -1.5 }, // Q4, arg ~ -0.98 rad > -pi/3 (cube is in Q3)
			];
			const cubes = roots.map(complexCube);
			const results = [...cbrtComplexLazy(cubes)];

			for (let i = 0; i < roots.length; i += 1) {
				assertComplexClose(results[i], roots[i], 1e-13, 1e-13);
			}
		});

		it('accepts diverse iterable types (Set, generator, custom iterable)', () => {
			const fromSet = new Set([
				{ re: 1, im: 0 },
				{ re: -1, im: 0 },
			]);
			const resSet = [...cbrtComplexLazy(fromSet)];
			assertComplexClose(resSet[0], { re: 1, im: 0 });
			assertComplexClose(resSet[1], { re: 0.5, im: Math.sqrt(3) / 2 });

			function* sourceGen() {
				yield { re: 64, im: 0 };
				yield { re: 0, im: 27 };
			}
			const resGen = [...cbrtComplexLazy(sourceGen())];
			assertComplexClose(resGen[0], { re: 4, im: 0 });
			assertComplexClose(resGen[1], { re: (3 * Math.sqrt(3)) / 2, im: 1.5 });

			const customIterable = {
				*[Symbol.iterator]() {
					yield { re: -27, im: 0 };
				},
			};
			const resCustom = [...cbrtComplexLazy(customIterable)];
			assertComplexClose(resCustom[0], { re: 1.5, im: (3 * Math.sqrt(3)) / 2 });
		});
	});

	describe('edge cases and validation', () => {
		it('handles empty iterables', () => {
			assert.deepEqual([...cbrtComplexLazy([])], []);
		});

		it('normalizes -0 components consistently on branch cut and origin', () => {
			const [zero, negReal] = [...cbrtComplexLazy([
				{ re: -0, im: -0 },
				{ re: -8, im: -0 },
			])];
			assert.ok(Object.is(zero.re, 0));
			assert.ok(Object.is(zero.im, 0));
			assertComplexClose(negReal, { re: 1, im: Math.sqrt(3) }, 1e-14, 1e-14);
		});

		it('handles extreme magnitudes without overflow or underflow', () => {
			// hypot(1.5e308, 1.5e308) overflows Number.MAX_VALUE without scaling
			const huge = { re: 1.5e308, im: 1.5e308 };
			const [hugeRoot] = [...cbrtComplexLazy([huge])];
			assert.ok(Number.isFinite(hugeRoot.re) && Number.isFinite(hugeRoot.im));
			const expectedHugeMag = Math.cbrt(1.5e308 * Math.SQRT2);
			assertComplexClose(
				hugeRoot,
				{
					re: expectedHugeMag * Math.cos(Math.PI / 12),
					im: expectedHugeMag * Math.sin(Math.PI / 12),
				},
				1e-12,
				0,
			);

			// Very small subnormal numbers
			const tiny = { re: Number.MIN_VALUE, im: Number.MIN_VALUE };
			const [tinyRoot] = [...cbrtComplexLazy([tiny])];
			assert.ok(Number.isFinite(tinyRoot.re) && Number.isFinite(tinyRoot.im));
			assert.ok(tinyRoot.re > 0 && tinyRoot.im > 0);
			assertComplexClose(complexCube(tinyRoot), tiny, 1e-11, 1e-323);
		});

		it('throws TypeError eagerly for non-iterable or string inputs', () => {
			for (const bad of [null, undefined, 42, true, '123', { re: 1, im: 0 }]) {
				assert.throws(() => cbrtComplexLazy(bad), TypeError);
			}
		});

		it('throws TypeError for invalid element shapes and RangeError for non-finite numbers', () => {
			const badTypes = [
				null,
				undefined,
				5,
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 1, im: null },
			];
			for (const bad of badTypes) {
				assert.throws(() => [...cbrtComplexLazy([bad])], TypeError);
			}

			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			];
			for (const bad of nonFinite) {
				assert.throws(() => [...cbrtComplexLazy([bad])], RangeError);
			}
		});
	});

	describe('lazy consumption', () => {
		it('does not consume any elements before .next() is called and pulls strictly on demand', () => {
			let pulled = 0;
			function* trackedSource() {
				const items = [
					{ re: 1, im: 0 },
					{ re: 8, im: 0 },
					{ re: 27, im: 0 },
					{ re: 64, im: 0 },
				];
				for (const item of items) {
					pulled += 1;
					yield item;
				}
			}

			const gen = cbrtComplexLazy(trackedSource());
			assert.equal(pulled, 0);

			const first = gen.next();
			assert.equal(pulled, 1);
			assert.equal(first.done, false);
			assertComplexClose(first.value, { re: 1, im: 0 });

			const second = gen.next();
			assert.equal(pulled, 2);
			assert.equal(second.done, false);
			assertComplexClose(second.value, { re: 2, im: 0 });
		});

		it('works on an infinite generator and closes underlying iterator on early break', () => {
			let closed = false;
			let pulled = 0;
			function* infiniteSource() {
				try {
					let n = 1;
					while (true) {
						pulled += 1;
						yield { re: n ** 3, im: 0 };
						n += 1;
					}
				} finally {
					closed = true;
				}
			}

			const taken = [];
			for (const root of cbrtComplexLazy(infiniteSource())) {
				taken.push(root);
				if (taken.length === 5) {
					break;
				}
			}

			assert.equal(pulled, 5);
			assert.equal(closed, true);
			assert.deepEqual(
				taken.map((z) => Math.round(z.re)),
				[1, 2, 3, 4, 5],
			);
		});

		it('validates elements lazily so unconsumed invalid items do not throw', () => {
			function* sourceWithLateError() {
				yield { re: 8, im: 0 };
				yield { re: 27, im: 0 };
				yield { re: Number.NaN, im: 0 };
			}

			const gen = cbrtComplexLazy(sourceWithLateError());
			assertComplexClose(gen.next().value, { re: 2, im: 0 });
			assertComplexClose(gen.next().value, { re: 3, im: 0 });
			assert.throws(() => gen.next(), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies w^3 === z, principal sector arg(w) in (-pi/3, pi/3], and agrees with Newton-Raphson', () => {
			const samples = [
				{ re: 3, im: 4 },
				{ re: -3, im: 4 },
				{ re: -3, im: -4 },
				{ re: 3, im: -4 },
				{ re: -100, im: 0.001 },
				{ re: -100, im: -0.001 },
				{ re: 0.0005, im: 0.0007 },
				{ re: 1234.5, im: -9876.25 },
				{ re: -0.25, im: 0 },
				{ re: 0, im: -19.5 },
			];

			const roots = [...cbrtComplexLazy(samples)];
			const epsAngle = 1e-12;

			for (let i = 0; i < samples.length; i += 1) {
				const z = samples[i];
				const w = roots[i];

				// 1. Algebraic round-trip: w^3 == z
				assertComplexClose(complexCube(w), z, 1e-12, 1e-12);

				// 2. Principal branch range: arg(w) in (-pi/3, pi/3]
				const angle = Math.atan2(w.im, w.re);
				assert.ok(
					angle > -Math.PI / 3 - epsAngle && angle <= Math.PI / 3 + epsAngle,
					`Principal angle out of range for z=${JSON.stringify(z)}: arg(w)=${angle}`,
				);

				// 3. Independent Newton-Raphson cross-check
				const newtonRoot = newtonCbrtComplex(z);
				assertComplexClose(w, newtonRoot, 1e-12, 1e-12);
			}
		});

		it('preserves multiplicativity cbrt(z1 * z2) == cbrt(z1) * cbrt(z2) when arg(z1) + arg(z2) in (-pi, pi]', () => {
			const pairs = [
				[
					{ re: 1, im: 1 },
					{ re: 2, im: 1 },
				],
				[
					{ re: 3, im: -2 },
					{ re: 1, im: 4 },
				],
				[
					{ re: -1, im: 2 },
					{ re: 2, im: 1 },
				],
			];

			for (const [z1, z2] of pairs) {
				const product = complexMul(z1, z2);
				const [r1, r2, rProd] = [...cbrtComplexLazy([z1, z2, product])];
				assertComplexClose(rProd, complexMul(r1, r2), 1e-12, 1e-12);
			}
		});
	});
});
