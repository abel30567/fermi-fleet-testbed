import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divideRationalStable } from './divideRationalStable.js';

function refGcd(x, y) {
	let a = x < 0n ? -x : x;
	let b = y < 0n ? -y : y;
	while (b !== 0n) {
		const t = a % b;
		a = b;
		b = t;
	}
	return a;
}

/**
 * Independent naive reference implementation (direct cross-multiplication + final GCD)
 * for cross-checking divideRationalStable.
 */
function naiveDivideRational(a, b) {
	let num = a.num * b.den;
	let den = a.den * b.num;
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g = refGcd(num, den);
	return { num: num / g, den: den / g };
}

function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n);
	} else {
		assert.equal(refGcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`);
	}
}

describe('divideRationalStable', () => {
	it('divides basic positive rationals in lowest terms', () => {
		assert.deepEqual(
			divideRationalStable({ num: 3n, den: 4n }, { num: 2n, den: 5n }),
			{ num: 15n, den: 8n },
		);
		assert.deepEqual(
			divideRationalStable({ num: 6n, den: 35n }, { num: 9n, den: 14n }),
			{ num: 4n, den: 15n },
		);
		assert.deepEqual(
			divideRationalStable({ num: 7n, den: 1n }, { num: 7n, den: 1n }),
			{ num: 1n, den: 1n },
		);
	});

	it('normalizes unreduced inputs and handles all sign combinations', () => {
		assert.deepEqual(
			divideRationalStable({ num: 12n, den: 18n }, { num: 20n, den: 30n }),
			{ num: 1n, den: 1n },
		);
		assert.deepEqual(
			divideRationalStable({ num: -3n, den: 4n }, { num: 2n, den: 5n }),
			{ num: -15n, den: 8n },
		);
		assert.deepEqual(
			divideRationalStable({ num: 3n, den: -4n }, { num: 2n, den: 5n }),
			{ num: -15n, den: 8n },
		);
		assert.deepEqual(
			divideRationalStable({ num: 3n, den: 4n }, { num: -2n, den: 5n }),
			{ num: -15n, den: 8n },
		);
		assert.deepEqual(
			divideRationalStable({ num: 3n, den: 4n }, { num: 2n, den: -5n }),
			{ num: -15n, den: 8n },
		);
		assert.deepEqual(
			divideRationalStable({ num: -3n, den: 4n }, { num: -2n, den: 5n }),
			{ num: 15n, den: 8n },
		);
		assert.deepEqual(
			divideRationalStable({ num: -3n, den: -4n }, { num: -2n, den: -5n }),
			{ num: 15n, den: 8n },
		);
	});

	it('handles zero dividend, identities, and reciprocals', () => {
		assert.deepEqual(
			divideRationalStable({ num: 0n, den: 1n }, { num: 5n, den: 7n }),
			{ num: 0n, den: 1n },
		);
		assert.deepEqual(
			divideRationalStable({ num: 0n, den: -99n }, { num: -3n, den: 4n }),
			{ num: 0n, den: 1n },
		);
		assert.deepEqual(
			divideRationalStable({ num: 1n, den: 1n }, { num: -5n, den: 8n }),
			{ num: -8n, den: 5n },
		);
		assert.deepEqual(
			divideRationalStable({ num: 10n, den: -15n }, { num: 1n, den: 1n }),
			{ num: -2n, den: 3n },
		);
		assert.deepEqual(
			divideRationalStable({ num: 10n, den: 15n }, { num: -1n, den: 1n }),
			{ num: -2n, den: 3n },
		);
	});

	it('does not mutate input objects', () => {
		const a = { num: -6n, den: -8n };
		const b = { num: 9n, den: -12n };
		const res = divideRationalStable(a, b);
		assert.deepEqual(res, { num: -1n, den: 1n });
		assert.deepEqual(a, { num: -6n, den: -8n });
		assert.deepEqual(b, { num: 9n, den: -12n });
	});

	it('handles huge BigInts and large shared factors robustly without overflow or stack limits', () => {
		// Values beyond IEEE-754 max double (~1.8e308) where floating-point division yields NaN
		const scale = 10n ** 500n;
		const resScaled = divideRationalStable(
			{ num: 3n * scale, den: 7n * scale },
			{ num: 9n * scale, den: 14n * scale },
		);
		assert.deepEqual(resScaled, { num: 2n, den: 3n });

		const huge = (1n << 2048n) + 1n;
		assert.deepEqual(
			divideRationalStable({ num: huge, den: 3n }, { num: huge, den: 5n }),
			{ num: 5n, den: 3n },
		);

		// Consecutive large Fibonacci numbers (worst case for Euclidean GCD step count)
		let f0 = 0n;
		let f1 = 1n;
		for (let i = 0; i < 1000; i++) {
			const next = f0 + f1;
			f0 = f1;
			f1 = next;
		}
		const fibRes = divideRationalStable({ num: f1, den: f0 }, { num: f0, den: f1 });
		assertCanonical(fibRes);
		assert.deepEqual(fibRes, { num: f1 * f1, den: f0 * f0 });
	});

	it('throws RangeError on division by zero or zero denominators', () => {
		assert.throws(
			() => divideRationalStable({ num: 1n, den: 2n }, { num: 0n, den: 1n }),
			RangeError,
		);
		assert.throws(
			() => divideRationalStable({ num: 0n, den: 1n }, { num: 0n, den: -5n }),
			RangeError,
		);
		assert.throws(
			() => divideRationalStable({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
			RangeError,
		);
		assert.throws(
			() => divideRationalStable({ num: 1n, den: 2n }, { num: 1n, den: 0n }),
			RangeError,
		);
		assert.throws(
			() => divideRationalStable({ num: 0n, den: 0n }, { num: 1n, den: 2n }),
			RangeError,
		);
	});

	it('throws TypeError on invalid argument types', () => {
		assert.throws(() => divideRationalStable(null, { num: 1n, den: 2n }), TypeError);
		assert.throws(() => divideRationalStable({ num: 1n, den: 2n }, undefined), TypeError);
		assert.throws(() => divideRationalStable({ num: 1, den: 2n }, { num: 1n, den: 2n }), TypeError);
		assert.throws(() => divideRationalStable({ num: 1n, den: 2 }, { num: 1n, den: 2n }), TypeError);
		assert.throws(() => divideRationalStable({ num: 1n, den: 2n }, { num: '1', den: 2n }), TypeError);
		assert.throws(() => divideRationalStable({}, { num: 1n, den: 2n }), TypeError);
	});

	it('cross-checks against naive reference, algebraic inverse, and floating-point approximation', () => {
		// Deterministic LCG PRNG for reproducible fuzzing
		let seed = 0x123456789abcdefn;
		const nextBigInt = (bound) => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
			return (seed % (2n * bound + 1n)) - bound;
		};

		for (let i = 0; i < 200; i++) {
			const aNum = nextBigInt(100000n);
			let aDen = nextBigInt(100000n);
			if (aDen === 0n) aDen = 1n;

			let bNum = nextBigInt(100000n);
			if (bNum === 0n) bNum = 1n;
			let bDen = nextBigInt(100000n);
			if (bDen === 0n) bDen = 1n;

			const a = { num: aNum, den: aDen };
			const b = { num: bNum, den: bDen };

			const actual = divideRationalStable(a, b);
			const expected = naiveDivideRational(a, b);

			assertCanonical(actual);
			assert.deepEqual(actual, expected);

			// Exact algebraic identity: (actual.num / actual.den) * (b.num / b.den) === (a.num / a.den)
			assert.equal(actual.num * b.num * a.den, actual.den * b.den * a.num);

			// Round-trip via dividing by reciprocal of b: (a / b) / (1 / b) === normalize(a)
			const invB = { num: b.den, den: b.num };
			const recovered = divideRationalStable(actual, invB);
			assert.equal(recovered.num * a.den, recovered.den * a.num);

			// Floating-point cross-check
			const approxActual = Number(actual.num) / Number(actual.den);
			const approxExpected = (Number(a.num) / Number(a.den)) / (Number(b.num) / Number(b.den));
			const tol = Math.max(1e-12, Math.abs(approxExpected) * 1e-12);
			assert.ok(
				Math.abs(approxActual - approxExpected) <= tol,
				`float mismatch: ${approxActual} vs ${approxExpected}`,
			);
		}
	});
});
