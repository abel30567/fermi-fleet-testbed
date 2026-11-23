import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divideRationalIterative } from './divideRationalIterative.js';

/**
 * Independent recursive Euclidean GCD used solely for test cross-checking.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function independentGcd(a, b) {
	const x = a < 0n ? -a : a;
	const y = b < 0n ? -b : b;
	return y === 0n ? x : independentGcd(y, x % y);
}

/**
 * Asserts canonical lowest-terms invariants on a rational result.
 *
 * @param {{ num: bigint, den: bigint }} q
 */
function assertCanonical(q) {
	assert.equal(typeof q.num, 'bigint');
	assert.equal(typeof q.den, 'bigint');
	assert.ok(q.den > 0n, `expected positive denominator, got ${q.den}`);
	if (q.num === 0n) {
		assert.equal(q.den, 1n);
	} else {
		assert.equal(independentGcd(q.num, q.den), 1n, `not in lowest terms: ${q.num}/${q.den}`);
	}
}

describe('divideRationalIterative', () => {
	describe('normal cases', () => {
		it('divides simple positive rationals', () => {
			assert.deepEqual(
				divideRationalIterative({ num: 1n, den: 2n }, { num: 3n, den: 4n }),
				{ num: 2n, den: 3n },
			);
			assert.deepEqual(
				divideRationalIterative({ num: 7n, den: 5n }, { num: 14n, den: 15n }),
				{ num: 3n, den: 2n },
			);
		});

		it('handles integer-valued rationals', () => {
			assert.deepEqual(
				divideRationalIterative({ num: 6n, den: 1n }, { num: 3n, den: 1n }),
				{ num: 2n, den: 1n },
			);
			assert.deepEqual(
				divideRationalIterative({ num: 5n, den: 1n }, { num: 2n, den: 1n }),
				{ num: 5n, den: 2n },
			);
		});

		it('normalizes signs across all sign combinations', () => {
			assert.deepEqual(
				divideRationalIterative({ num: -3n, den: 4n }, { num: 5n, den: 6n }),
				{ num: -9n, den: 10n },
			);
			assert.deepEqual(
				divideRationalIterative({ num: 3n, den: 4n }, { num: -5n, den: 6n }),
				{ num: -9n, den: 10n },
			);
			assert.deepEqual(
				divideRationalIterative({ num: -3n, den: 4n }, { num: -5n, den: 6n }),
				{ num: 9n, den: 10n },
			);
			assert.deepEqual(
				divideRationalIterative({ num: 3n, den: -4n }, { num: 5n, den: -6n }),
				{ num: 9n, den: 10n },
			);
			assert.deepEqual(
				divideRationalIterative({ num: -3n, den: -4n }, { num: -5n, den: 6n }),
				{ num: -9n, den: 10n },
			);
		});

		it('reduces unreduced input rationals to lowest terms', () => {
			assert.deepEqual(
				divideRationalIterative({ num: 6n, den: 9n }, { num: 4n, den: 10n }),
				{ num: 5n, den: 3n },
			);
			assert.deepEqual(
				divideRationalIterative({ num: 120n, den: 360n }, { num: 45n, den: 135n }),
				{ num: 1n, den: 1n },
			);
		});
	});

	describe('edge cases', () => {
		it('returns { num: 0n, den: 1n } when dividend is zero regardless of signs', () => {
			assert.deepEqual(
				divideRationalIterative({ num: 0n, den: 1n }, { num: 5n, den: 7n }),
				{ num: 0n, den: 1n },
			);
			assert.deepEqual(
				divideRationalIterative({ num: 0n, den: -99n }, { num: -42n, den: -13n }),
				{ num: 0n, den: 1n },
			);
		});

		it('handles identity, negation, self-division, and reciprocal', () => {
			const r = { num: -17n, den: 23n };
			assert.deepEqual(divideRationalIterative(r, { num: 1n, den: 1n }), r);
			assert.deepEqual(divideRationalIterative(r, { num: -1n, den: 1n }), { num: 17n, den: 23n });
			assert.deepEqual(divideRationalIterative(r, r), { num: 1n, den: 1n });
			assert.deepEqual(divideRationalIterative({ num: 1n, den: 1n }, r), { num: -23n, den: 17n });
		});

		it('does not mutate input objects', () => {
			const a = Object.freeze({ num: -6n, den: -8n });
			const b = Object.freeze({ num: 9n, den: -12n });
			const result = divideRationalIterative(a, b);
			assert.deepEqual(result, { num: -1n, den: 1n });
			assert.deepEqual(a, { num: -6n, den: -8n });
			assert.deepEqual(b, { num: 9n, den: -12n });
		});

		it('handles very large BigInts and consecutive Fibonacci numbers (worst-case Euclidean GCD)', () => {
			let fPrev = 0n;
			let fCurr = 1n;
			for (let i = 0; i < 200; i += 1) {
				const next = fPrev + fCurr;
				fPrev = fCurr;
				fCurr = next;
			}
			const scale = 10n ** 40n + 7n;
			const a = { num: fCurr * scale, den: fPrev };
			const b = { num: fPrev * scale, den: fCurr };
			const q = divideRationalIterative(a, b);
			assertCanonical(q);
			// (F_201 * scale / F_200) / (F_200 * scale / F_201) = F_201^2 / F_200^2
			assert.deepEqual(q, { num: fCurr * fCurr, den: fPrev * fPrev });
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError for non-object or malformed inputs', () => {
			const valid = { num: 1n, den: 2n };
			const badValues = [
				null,
				undefined,
				42,
				'1/2',
				true,
				[1n, 2n],
				{},
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: NaN, den: 1n },
				{ num: 1n, den: Infinity },
				{ num: '1', den: '2' },
			];

			for (const bad of badValues) {
				assert.throws(() => divideRationalIterative(bad, valid), TypeError);
				assert.throws(() => divideRationalIterative(valid, bad), TypeError);
			}
		});

		it('throws RangeError for zero denominators', () => {
			assert.throws(
				() => divideRationalIterative({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
				RangeError,
			);
			assert.throws(
				() => divideRationalIterative({ num: 1n, den: 2n }, { num: 1n, den: 0n }),
				RangeError,
			);
			assert.throws(
				() => divideRationalIterative({ num: 0n, den: 0n }, { num: 1n, den: 2n }),
				RangeError,
			);
		});

		it('throws RangeError for division by zero', () => {
			assert.throws(
				() => divideRationalIterative({ num: 1n, den: 2n }, { num: 0n, den: 1n }),
				RangeError,
			);
			assert.throws(
				() => divideRationalIterative({ num: 0n, den: 1n }, { num: 0n, den: 5n }),
				RangeError,
			);
			assert.throws(
				() => divideRationalIterative({ num: -3n, den: 7n }, { num: 0n, den: -9n }),
				RangeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies exact cross-multiplication, round-trip, scaling invariance, and float agreement across a deterministic grid', () => {
			// Deterministic LCG generating non-trivial BigInt numerators and denominators
			let seed = 0x123456789abcdef1n;
			const nextSigned = (bound) => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
				const val = (seed % (2n * bound + 1n)) - bound;
				return val;
			};

			for (let i = 0; i < 100; i += 1) {
				const aNum = nextSigned(500n);
				let aDen = nextSigned(500n);
				if (aDen === 0n) aDen = 1n;

				let bNum = nextSigned(500n);
				if (bNum === 0n) bNum = 1n;
				let bDen = nextSigned(500n);
				if (bDen === 0n) bDen = 1n;

				const a = { num: aNum, den: aDen };
				const b = { num: bNum, den: bDen };
				const q = divideRationalIterative(a, b);

				// 1. Canonical lowest-terms form verified via independent recursive GCD
				assertCanonical(q);

				// 2. Exact cross-multiplication: (q.num / q.den) == (a.num * b.den) / (a.den * b.num)
				assert.equal(q.num * a.den * b.num, q.den * a.num * b.den);

				// 3. Round-trip division: q / (1 / b) == canonical(a)
				const invB = { num: b.den, den: b.num };
				const recoveredA = divideRationalIterative(q, invB);
				const canonicalA = divideRationalIterative(a, { num: 1n, den: 1n });
				assert.deepEqual(recoveredA, canonicalA);

				// 4. Scaling invariance: (k*a.num / k*a.den) / (m*b.num / m*b.den) == q
				const scaledQ = divideRationalIterative(
					{ num: a.num * -13n, den: a.den * -13n },
					{ num: b.num * 29n, den: b.den * 29n },
				);
				assert.deepEqual(scaledQ, q);

				// 5. IEEE-754 floating-point agreement within relative/absolute tolerance
				const floatExpected = (Number(a.num) / Number(a.den)) / (Number(b.num) / Number(b.den));
				const floatActual = Number(q.num) / Number(q.den);
				const diff = Math.abs(floatActual - floatExpected);
				const tol = 1e-12 * Math.max(1, Math.abs(floatExpected));
				assert.ok(diff <= tol, `float mismatch: ${floatActual} vs ${floatExpected}`);
			}
		});
	});
});
