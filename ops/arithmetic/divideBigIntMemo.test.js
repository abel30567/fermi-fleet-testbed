import { test } from 'node:test';
import assert from 'node:assert';
import { divideBigIntMemo, SCALE } from './divideBigIntMemo.js';

/**
 * Independent reference implementation via digit-by-digit decimal long division
 * to 18 fractional digits, avoiding any multiplication by SCALE or lookup tables.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function longDivisionFixed18(a, b) {
	if (a === 0n) return 0n;
	const neg = (a < 0n) !== (b < 0n);
	const absA = a < 0n ? -a : a;
	const absB = b < 0n ? -b : b;

	const intPart = absA / absB;
	let rem = absA % absB;
	let fracDigits = '';
	for (let i = 0; i < 18; i++) {
		rem *= 10n;
		const digit = rem / absB;
		rem %= absB;
		fracDigits += digit.toString();
	}
	const combined = BigInt(`${intPart.toString()}${fracDigits}`);
	return neg ? -combined : combined;
}

test('exact integer quotients and identity cases', () => {
	assert.strictEqual(SCALE, 10n ** 18n);
	assert.strictEqual(divideBigIntMemo(0n, 1n), 0n);
	assert.strictEqual(divideBigIntMemo(0n, -99999999999999999999n), 0n);
	assert.strictEqual(divideBigIntMemo(6n, 2n), 3n * SCALE);
	assert.strictEqual(divideBigIntMemo(42n, 1n), 42n * SCALE);
	assert.strictEqual(divideBigIntMemo(42n, -1n), -42n * SCALE);
	assert.strictEqual(divideBigIntMemo(-42n, -1n), 42n * SCALE);
	assert.strictEqual(divideBigIntMemo(123456789n, 123456789n), SCALE);
	assert.strictEqual(divideBigIntMemo(-123456789n, 123456789n), -SCALE);
	assert.strictEqual(divideBigIntMemo(123456789n, -123456789n), -SCALE);
	assert.strictEqual(divideBigIntMemo(-123456789n, -123456789n), SCALE);
});

test('non-integer fixed-point quotients across all sign combinations', () => {
	assert.strictEqual(divideBigIntMemo(1n, 2n), 500_000_000_000_000_000n);
	assert.strictEqual(divideBigIntMemo(-1n, 2n), -500_000_000_000_000_000n);
	assert.strictEqual(divideBigIntMemo(1n, -2n), -500_000_000_000_000_000n);
	assert.strictEqual(divideBigIntMemo(-1n, -2n), 500_000_000_000_000_000n);

	assert.strictEqual(divideBigIntMemo(1n, 3n), 333_333_333_333_333_333n);
	assert.strictEqual(divideBigIntMemo(-1n, 3n), -333_333_333_333_333_333n);
	assert.strictEqual(divideBigIntMemo(1n, -3n), -333_333_333_333_333_333n);
	assert.strictEqual(divideBigIntMemo(-1n, -3n), 333_333_333_333_333_333n);

	assert.strictEqual(divideBigIntMemo(2n, 3n), 666_666_666_666_666_666n);
	assert.strictEqual(divideBigIntMemo(22n, 7n), 3_142_857_142_857_142_857n);
	assert.strictEqual(divideBigIntMemo(-22n, 7n), -3_142_857_142_857_142_857n);
	assert.strictEqual(divideBigIntMemo(1n, 8n), 125_000_000_000_000_000n);
});

test('exhaustive precomputed 2D small-pair table verification', () => {
	for (let a = -32n; a <= 32n; a++) {
		for (let b = -32n; b <= 32n; b++) {
			if (b === 0n) continue;
			const expected = (a * SCALE) / b;
			assert.strictEqual(
				divideBigIntMemo(a, b),
				expected,
				`Mismatch for (${a}, ${b})`
			);
		}
	}
});

test('precomputed reciprocal table path (exact divisors and non-divisors of 10^18)', () => {
	const numerators = [33n, -33n, 1000n, -9876543210123456789n, 10n ** 30n + 7n];
	const divisors = [
		2n, 3n, 4n, 5n, 7n, 8n, 10n, 13n, 16n, 25n, 33n, 64n,
		97n, 100n, 125n, 128n, 199n, 200n, 250n, 255n, 256n,
		-3n, -16n, -125n, -256n
	];
	for (const a of numerators) {
		for (const b of divisors) {
			assert.strictEqual(
				divideBigIntMemo(a, b),
				(a * SCALE) / b,
				`Reciprocal table mismatch for (${a}, ${b})`
			);
		}
	}
});

test('edge cases: underflow to zero, scale boundary, and very large BigInts', () => {
	// Boundary around 10^-18
	assert.strictEqual(divideBigIntMemo(1n, SCALE), 1n);
	assert.strictEqual(divideBigIntMemo(-1n, SCALE), -1n);
	assert.strictEqual(divideBigIntMemo(1n, SCALE + 1n), 0n);
	assert.strictEqual(divideBigIntMemo(-1n, SCALE + 1n), 0n);
	assert.strictEqual(divideBigIntMemo(1n, -(SCALE + 1n)), 0n);
	assert.strictEqual(divideBigIntMemo(SCALE - 1n, SCALE), 999_999_999_999_999_999n);

	// Very large arbitrary-precision BigInts (beyond 2^256)
	const hugeA = 10n ** 120n + 1234567890123456789n;
	const hugeB = 3n * 10n ** 60n + 17n;
	assert.strictEqual(divideBigIntMemo(hugeA, hugeB), (hugeA * SCALE) / hugeB);
	assert.strictEqual(divideBigIntMemo(-hugeA, hugeB), (-hugeA * SCALE) / hugeB);

	// Power-of-two large operands
	const pA = 2n ** 300n - 1n;
	const pB = 2n ** 200n + 3n;
	assert.strictEqual(divideBigIntMemo(pA, pB), (pA * SCALE) / pB);
});

test('memoization consistency, sign canonicalization, and LRU cache eviction', () => {
	const a = 9876543210987654321n;
	const b = 1234567891n;
	const expected = (a * SCALE) / b;

	// Cold call followed by warm cache hits with sign variants
	assert.strictEqual(divideBigIntMemo(a, b), expected);
	assert.strictEqual(divideBigIntMemo(a, b), expected);
	assert.strictEqual(divideBigIntMemo(-a, b), -expected);
	assert.strictEqual(divideBigIntMemo(a, -b), -expected);
	assert.strictEqual(divideBigIntMemo(-a, -b), expected);

	// Exceed cache capacity (4096) to exercise LRU eviction and re-computation
	for (let i = 1n; i <= 4500n; i++) {
		const num = 100_000n + i;
		const den = 300n + (i % 97n);
		assert.strictEqual(divideBigIntMemo(num, den), (num * SCALE) / den);
	}

	// Re-query evicted entry and verify exactness
	assert.strictEqual(divideBigIntMemo(a, b), expected);
});

test('input validation errors', () => {
	// Division by zero
	assert.throws(() => divideBigIntMemo(0n, 0n), RangeError);
	assert.throws(() => divideBigIntMemo(1n, 0n), RangeError);
	assert.throws(() => divideBigIntMemo(-100n, 0n), RangeError);

	// Non-BigInt arguments
	const invalidInputs = [
		[1, 2n],
		[1n, 2],
		[1, 2],
		[NaN, 2n],
		[1n, Infinity],
		['10', 2n],
		[10n, '2'],
		[null, 2n],
		[10n, null],
		[undefined, 2n],
		[10n, undefined],
		[true, 2n],
		[{}, 2n],
		[[1n], 2n]
	];
	for (const [x, y] of invalidInputs) {
		assert.throws(
			() => divideBigIntMemo(x, y),
			TypeError,
			`Expected TypeError for (${String(x)}, ${String(y)})`
		);
	}
	assert.throws(() => divideBigIntMemo(), TypeError);
	assert.throws(() => divideBigIntMemo(10n), TypeError);
});

test('independent cross-check: digit-by-digit long division & Euclidean remainder invariant', () => {
	const cases = [
		[1n, 7n],
		[-1n, 7n],
		[355n, 113n],
		[-355n, 113n],
		[355n, -113n],
		[-355n, -113n],
		[1000n, 333n],
		[999_999_999_999n, 257n],
		[2n ** 128n + 19n, 3n ** 40n + 5n],
		[-(2n ** 128n + 19n), 3n ** 40n + 5n],
		[123456789012345678901234567890n, 9876543210987654321n],
		[1n, 10n ** 17n],
		[1n, 10n ** 18n],
		[1n, 10n ** 19n],
		[7n ** 25n, 256n],
		[7n ** 25n, 255n]
	];

	for (const [a, b] of cases) {
		const actual = divideBigIntMemo(a, b);
		const viaLongDiv = longDivisionFixed18(a, b);
		assert.strictEqual(
			actual,
			viaLongDiv,
			`Long division cross-check failed for (${a}, ${b})`
		);

		// Algebraic Euclidean truncation-toward-zero invariant:
		// a * SCALE === actual * b + rem, with |rem| < |b| and rem matching sign of a (or 0).
		const rem = a * SCALE - actual * b;
		const absRem = rem < 0n ? -rem : rem;
		const absB = b < 0n ? -b : b;
		assert.ok(absRem < absB, `Remainder out of bounds for (${a}, ${b})`);
		if (rem !== 0n) {
			assert.strictEqual(
				rem > 0n,
				a > 0n,
				`Remainder sign mismatch for (${a}, ${b})`
			);
		}
	}

	// Cross-check against IEEE-754 floating point for moderate exact values
	const floatPairs = [
		[7n, 4n],
		[-9n, 8n],
		[12345n, 16n],
		[100n, 25n],
		[-123n, -40n]
	];
	for (const [a, b] of floatPairs) {
		const actual = divideBigIntMemo(a, b);
		const expectedFloat = Math.round((Number(a) / Number(b)) * 1e6);
		const actualPrefix = Number(actual / 10n ** 12n);
		assert.strictEqual(actualPrefix, expectedFloat);
	}
});
