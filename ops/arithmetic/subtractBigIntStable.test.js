import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractBigIntStable } from './subtractBigIntStable.js';

/**
 * Independent schoolbook base-10^9 subtraction for arbitrary BigInts
 * (uses only string decimal parsing, non-negative chunk arithmetic, and sign handling).
 */
function schoolbookSubtract(a, b) {
	const BASE = 1_000_000_000n;

	const toChunks = (n) => {
		const s = (n < 0n ? -n : n).toString();
		const chunks = [];
		for (let i = s.length; i > 0; i -= 9) {
			const start = Math.max(0, i - 9);
			chunks.push(BigInt(s.slice(start, i)));
		}
		return chunks;
	};

	const fromChunks = (chunks, negative) => {
		let acc = 0n;
		for (let i = chunks.length - 1; i >= 0; i--) {
			acc = acc * BASE + chunks[i];
		}
		return negative && acc !== 0n ? -acc : acc;
	};

	const cmpMag = (x, y) => {
		if (x.length !== y.length) return x.length < y.length ? -1 : 1;
		for (let i = x.length - 1; i >= 0; i--) {
			if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
		}
		return 0;
	};

	const addMag = (x, y) => {
		const out = [];
		const len = Math.max(x.length, y.length);
		let carry = 0n;
		for (let i = 0; i < len; i++) {
			const sum = (x[i] ?? 0n) + (y[i] ?? 0n) + carry;
			out.push(sum % BASE);
			carry = sum / BASE;
		}
		if (carry > 0n) out.push(carry);
		return out;
	};

	// Requires |x| >= |y|
	const subMag = (x, y) => {
		const out = [];
		let borrow = 0n;
		for (let i = 0; i < x.length; i++) {
			let d = x[i] - (y[i] ?? 0n) - borrow;
			if (d < 0n) {
				d += BASE;
				borrow = 1n;
			} else {
				borrow = 0n;
			}
			out.push(d);
		}
		return out;
	};

	// Compute a - b = a + (-b)
	const negA = a < 0n;
	const negNegB = b > 0n;
	const magA = toChunks(a);
	const magB = toChunks(b);

	if (negA === negNegB) {
		return fromChunks(addMag(magA, magB), negA);
	}
	const cmp = cmpMag(magA, magB);
	if (cmp === 0) return 0n;
	if (cmp > 0) return fromChunks(subMag(magA, magB), negA);
	return fromChunks(subMag(magB, magA), negNegB);
}

describe('subtractBigIntStable', () => {
	it('handles normal positive, negative, and zero integer cases', () => {
		assert.equal(subtractBigIntStable(10n, 3n), 7n);
		assert.equal(subtractBigIntStable(3n, 10n), -7n);
		assert.equal(subtractBigIntStable(42n, 42n), 0n);
		assert.equal(subtractBigIntStable(-10n, 3n), -13n);
		assert.equal(subtractBigIntStable(10n, -3n), 13n);
		assert.equal(subtractBigIntStable(-10n, -3n), -7n);
		assert.equal(subtractBigIntStable(-3n, -10n), 7n);
		assert.equal(subtractBigIntStable(0n, 0n), 0n);
		assert.equal(subtractBigIntStable(99n, 0n), 99n);
		assert.equal(subtractBigIntStable(0n, 99n), -99n);
		assert.equal(subtractBigIntStable(0n, -99n), 99n);
	});

	it('avoids catastrophic cancellation on huge nearly-equal BigInts', () => {
		const base100 = 10n ** 100n;
		assert.equal(subtractBigIntStable(base100 + 1n, base100), 1n);
		assert.equal(subtractBigIntStable(base100, base100 + 1n), -1n);

		const base256 = 2n ** 256n;
		assert.equal(subtractBigIntStable(base256 + 123456789n, base256 + 123456780n), 9n);
		assert.equal(subtractBigIntStable(-base256 - 5n, -base256 - 12n), 7n);
	});

	it('handles values far beyond IEEE-754 MAX_SAFE_INTEGER and MAX_VALUE without overflow', () => {
		const huge = 10n ** 400n;
		assert.equal(subtractBigIntStable(huge, -huge), 2n * huge);
		assert.equal(subtractBigIntStable(-huge, huge), -2n * huge);
		assert.equal(subtractBigIntStable(huge, huge), 0n);

		const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
		assert.equal(subtractBigIntStable(maxSafe + 2n, maxSafe + 1n), 1n);
	});

	it('is exact for 10^18-scaled fixed-point BigInt values (no binary float drift)', () => {
		const SCALE = 10n ** 18n;
		const fp = (whole, frac18 = 0n) => whole * SCALE + frac18;

		// Classic IEEE-754 failure: 0.3 - 0.1 - 0.2 !== 0 in float64
		const zeroPointThree = 300_000_000_000_000_000n;
		const zeroPointOne = 100_000_000_000_000_000n;
		const zeroPointTwo = 200_000_000_000_000_000n;
		const step1 = subtractBigIntStable(zeroPointThree, zeroPointOne);
		assert.equal(step1, zeroPointTwo);
		assert.equal(subtractBigIntStable(step1, zeroPointTwo), 0n);

		// Large fixed-point subtraction with 1 wei (10^-18) precision preserved
		const largeA = fp(1_000_000_000_000n, 1n);
		const largeB = fp(1_000_000_000_000n, 0n);
		assert.equal(subtractBigIntStable(largeA, largeB), 1n);
	});

	it('works cleanly with Array.prototype.reduce without choking on extra callback arguments', () => {
		const values = [100n, 25n, 10n, -5n];
		assert.equal(values.reduce(subtractBigIntStable), 70n);
	});

	it('validates inputs strictly and throws TypeError on non-BigInt arguments', () => {
		const invalidValues = [
			0,
			1,
			-1,
			1.5,
			NaN,
			Infinity,
			-Infinity,
			'1',
			'0n',
			true,
			false,
			null,
			undefined,
			{},
			[],
			Symbol('x'),
			Object(1n),
		];

		for (const bad of invalidValues) {
			assert.throws(() => subtractBigIntStable(bad, 1n), TypeError);
			assert.throws(() => subtractBigIntStable(1n, bad), TypeError);
		}
		assert.throws(() => subtractBigIntStable(), TypeError);
		assert.throws(() => subtractBigIntStable(5n), TypeError);
	});

	it('matches independent two\'s-complement, schoolbook multi-limb subtraction, and algebraic invariants', () => {
		// Deterministic LCG generating signed arbitrary-precision BigInts up to ~256 bits
		let seed = 0x123456789abcdef0123456789abcdef1n;
		const MOD = 1n << 256n;
		const nextBigInt = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) % MOD;
			const mag = seed >> (seed % 200n);
			return (seed & 1n) === 0n ? mag : -mag;
		};

		for (let i = 0; i < 100; i++) {
			const a = nextBigInt();
			const b = nextBigInt();
			const c = nextBigInt();

			const result = subtractBigIntStable(a, b);

			// Cross-check 1: bitwise two's-complement negation (independent of unary/binary '-')
			const twosComplement = a + (~b + 1n);
			assert.equal(result, twosComplement);

			// Cross-check 2: schoolbook base-10^9 digit-by-digit subtraction
			assert.equal(result, schoolbookSubtract(a, b));

			// Cross-check 3: algebraic invariants
			assert.equal(result + b, a);
			assert.equal(subtractBigIntStable(b, a), -result);
			assert.equal(subtractBigIntStable(a + c, b + c), result);
		}
	});
});
