import { describe, test } from 'node:test'
import assert from 'node:assert'
import { divideBigIntStable, FIXED_POINT_SCALE } from './divideBigIntStable.js'

const SCALE = 10n ** 18n

/**
 * Independent digit-by-digit base-10 long division reference for 18 fractional digits.
 * Computes the integer part, 18 decimal fractional digits, a 19th guard digit, and a
 * sticky remainder flag, then performs round-half-to-even on the decimal digit stream.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function longDivisionDecimalReference(a, b) {
	if (a === 0n) return 0n
	const negative = (a < 0n) !== (b < 0n)
	const absA = a < 0n ? -a : a
	const absB = b < 0n ? -b : b

	const intPart = absA / absB
	let rem = absA % absB

	let frac = 0n
	for (let i = 0; i < 18; i++) {
		rem *= 10n
		const digit = rem / absB
		rem %= absB
		frac = frac * 10n + digit
	}

	// 19th guard digit and sticky flag for any non-zero trailing digits
	rem *= 10n
	const guardDigit = rem / absB
	const sticky = rem % absB !== 0n

	let result = intPart * SCALE + frac
	if (guardDigit > 5n || (guardDigit === 5n && (sticky || (result & 1n) === 1n))) {
		result += 1n
	}

	return negative && result !== 0n ? -result : result
}

/**
 * Verifies the exact fixed-point round-half-to-even optimality conditions:
 * 1. Error bound: 2 * |q * b - a * scale| <= |b|
 * 2. Tie-break: if 2 * |q * b - a * scale| === |b|, then q is even
 * 3. Neighbor optimality: q - 1 and q + 1 cannot have strictly smaller error (nor equal error with even parity)
 */
function assertOptimalHalfToEven(a, b, q, scale = SCALE) {
	const absB = b < 0n ? -b : b
	const err = (candidate) => {
		const diff = candidate * b - a * scale
		return diff < 0n ? -diff : diff
	}

	const eQ = err(q)
	assert.ok(
		(eQ << 1n) <= absB,
		`Error bound violated for (${a}, ${b}): 2 * ${eQ} > ${absB}`,
	)

	if ((eQ << 1n) === absB) {
		assert.strictEqual(q & 1n, 0n, `Tie must round to even for (${a}, ${b}), got ${q}`)
	}

	for (const neighbor of [q - 1n, q + 1n]) {
		const eN = err(neighbor)
		assert.ok(
			eN > eQ || (eN === eQ && (neighbor & 1n) === 1n),
			`Neighbor ${neighbor} is at least as good as ${q} for (${a}, ${b})`,
		)
	}
}

describe('divideBigIntStable', () => {
	test('exports FIXED_POINT_SCALE as 10^18', () => {
		assert.strictEqual(FIXED_POINT_SCALE, 10n ** 18n)
	})

	test('handles exact integer and terminating decimal quotients', () => {
		assert.strictEqual(divideBigIntStable(0n, 1n), 0n)
		assert.strictEqual(divideBigIntStable(0n, -999n), 0n)
		assert.strictEqual(divideBigIntStable(1n, 1n), SCALE)
		assert.strictEqual(divideBigIntStable(42n, 6n), 7n * SCALE)
		assert.strictEqual(divideBigIntStable(1n, 2n), 500_000_000_000_000_000n)
		assert.strictEqual(divideBigIntStable(1n, 4n), 250_000_000_000_000_000n)
		assert.strictEqual(divideBigIntStable(3n, 8n), 375_000_000_000_000_000n)
		assert.strictEqual(divideBigIntStable(1n, SCALE), 1n)
	})

	test('handles repeating decimals with nearest rounding', () => {
		assert.strictEqual(divideBigIntStable(1n, 3n), 333_333_333_333_333_333n)
		assert.strictEqual(divideBigIntStable(2n, 3n), 666_666_666_666_666_667n)
		assert.strictEqual(divideBigIntStable(1n, 6n), 166_666_666_666_666_667n)
		assert.strictEqual(divideBigIntStable(1n, 7n), 142_857_142_857_142_857n)
		assert.strictEqual(divideBigIntStable(22n, 7n), 3_142_857_142_857_142_857n)
	})

	test('handles all negative sign combinations symmetrically', () => {
		assert.strictEqual(divideBigIntStable(-1n, 3n), -333_333_333_333_333_333n)
		assert.strictEqual(divideBigIntStable(1n, -3n), -333_333_333_333_333_333n)
		assert.strictEqual(divideBigIntStable(-1n, -3n), 333_333_333_333_333_333n)

		assert.strictEqual(divideBigIntStable(-2n, 3n), -666_666_666_666_666_667n)
		assert.strictEqual(divideBigIntStable(2n, -3n), -666_666_666_666_666_667n)
		assert.strictEqual(divideBigIntStable(-2n, -3n), 666_666_666_666_666_667n)

		// Negative quotient that rounds to 0n must return exact 0n
		assert.strictEqual(divideBigIntStable(-1n, 4n * SCALE), 0n)
		assert.strictEqual(divideBigIntStable(1n, -4n * SCALE), 0n)
	})

	test('implements unbiased round-half-to-even on exact midpoint ties', () => {
		const twoScale = 2n * SCALE

		// Positive ties: k + 0.5 in scaled units
		assert.strictEqual(divideBigIntStable(1n, twoScale), 0n) // 0.5 -> 0 (even)
		assert.strictEqual(divideBigIntStable(3n, twoScale), 2n) // 1.5 -> 2 (even)
		assert.strictEqual(divideBigIntStable(5n, twoScale), 2n) // 2.5 -> 2 (even)
		assert.strictEqual(divideBigIntStable(7n, twoScale), 4n) // 3.5 -> 4 (even)
		assert.strictEqual(divideBigIntStable(9n, twoScale), 4n) // 4.5 -> 4 (even)

		// Negative ties: -(k + 0.5) in scaled units
		assert.strictEqual(divideBigIntStable(-1n, twoScale), 0n) // -0.5 -> 0 (even)
		assert.strictEqual(divideBigIntStable(-3n, twoScale), -2n) // -1.5 -> -2 (even)
		assert.strictEqual(divideBigIntStable(-5n, twoScale), -2n) // -2.5 -> -2 (even)
		assert.strictEqual(divideBigIntStable(-7n, twoScale), -4n) // -3.5 -> -4 (even)
		assert.strictEqual(divideBigIntStable(3n, -twoScale), -2n)
		assert.strictEqual(divideBigIntStable(-5n, -twoScale), 2n)

		// Tie across the 10^18 integer carry boundary: (2*10^18 - 1) / (2*10^18) = 10^18 - 0.5 -> 10^18 (even)
		assert.strictEqual(divideBigIntStable(twoScale - 1n, twoScale), SCALE)
		// (2*10^18 + 1) / (2*10^18) = 10^18 + 0.5 -> 10^18 (even)
		assert.strictEqual(divideBigIntStable(twoScale + 1n, twoScale), SCALE)

		// Just below and just above half (1 remainder unit perturbation)
		const denom = 2_000_000_000_000_000_000_000n // 2000 * 10^18
		assert.strictEqual(divideBigIntStable(999n, denom), 0n) // 0.4995 -> 0
		assert.strictEqual(divideBigIntStable(1000n, denom), 0n) // 0.5000 -> 0 (even)
		assert.strictEqual(divideBigIntStable(1001n, denom), 1n) // 0.5005 -> 1
		assert.strictEqual(divideBigIntStable(2999n, denom), 1n) // 1.4995 -> 1
		assert.strictEqual(divideBigIntStable(3000n, denom), 2n) // 1.5000 -> 2 (even)
		assert.strictEqual(divideBigIntStable(3001n, denom), 2n) // 1.5005 -> 2

		// Zero net rounding bias over consecutive half-integer ties
		let roundedSum = 0n
		let exactTwiceSum = 0n
		for (let k = 0n; k < 20n; k++) {
			const numerator = 2n * k + 1n
			roundedSum += divideBigIntStable(numerator, twoScale)
			exactTwiceSum += numerator
		}
		assert.strictEqual(roundedSum * 2n, exactTwiceSum)
	})

	test('supports custom positive BigInt scales', () => {
		assert.strictEqual(divideBigIntStable(1n, 2n, 1n), 0n) // 0.5 -> 0
		assert.strictEqual(divideBigIntStable(3n, 2n, 1n), 2n) // 1.5 -> 2
		assert.strictEqual(divideBigIntStable(5n, 2n, 1n), 2n) // 2.5 -> 2
		assert.strictEqual(divideBigIntStable(7n, 2n, 1n), 4n) // 3.5 -> 4
		assert.strictEqual(divideBigIntStable(1n, 3n, 1000n), 333n)
		assert.strictEqual(divideBigIntStable(2n, 3n, 1000n), 667n)
	})

	test('preserves full exactness for huge BigInts beyond float64 range', () => {
		// Beyond Number.MAX_VALUE (~1.8e308), Number(a) / Number(b) would produce NaN (Infinity / Infinity)
		const hugeBase = 10n ** 400n
		assert.strictEqual(divideBigIntStable(hugeBase, hugeBase), SCALE)
		assert.strictEqual(divideBigIntStable(hugeBase * 3n, hugeBase * 2n), 1_500_000_000_000_000_000n)

		// Distinguishes 1 ULP in a 400-digit denominator where float64 loses all low bits
		const hugeDenom = 10n ** 400n
		const justOverHalf = hugeDenom / 2n + 1n
		const exactHalf = hugeDenom / 2n
		const justUnderHalf = hugeDenom / 2n - 1n

		// Scale = 1n tests single-unit sensitivity on 400-digit operands
		assert.strictEqual(divideBigIntStable(justUnderHalf, hugeDenom, 1n), 0n)
		assert.strictEqual(divideBigIntStable(exactHalf, hugeDenom, 1n), 0n)
		assert.strictEqual(divideBigIntStable(justOverHalf, hugeDenom, 1n), 1n)

		// Default 10^18 scale on 400-digit operands:
		// (10^400 + 10^382) / 10^400 = 1 + 10^-18 -> SCALE + 1n
		assert.strictEqual(divideBigIntStable(hugeBase + 10n ** 382n, hugeBase), SCALE + 1n)
		// (10^400 + 5 * 10^381) / 10^400 = 1 + 0.5 * 10^-18 -> SCALE (even)
		assert.strictEqual(divideBigIntStable(hugeBase + 5n * 10n ** 381n, hugeBase), SCALE)
		// (10^400 + 15 * 10^381) / 10^400 = 1 + 1.5 * 10^-18 -> SCALE + 2n (even)
		assert.strictEqual(divideBigIntStable(hugeBase + 15n * 10n ** 381n, hugeBase), SCALE + 2n)

		// 2000-bit Mersenne-like ratio
		const p = (1n << 2000n) - 1n
		const q = 1n << 1000n
		const res = divideBigIntStable(p, q)
		assertOptimalHalfToEven(p, q, res)
		assert.strictEqual(res, longDivisionDecimalReference(p, q))
	})

	test('throws RangeError on division by zero and non-positive scale', () => {
		assert.throws(() => divideBigIntStable(1n, 0n), RangeError)
		assert.throws(() => divideBigIntStable(0n, 0n), RangeError)
		assert.throws(() => divideBigIntStable(-1n, 0n), RangeError)
		assert.throws(() => divideBigIntStable(10n ** 500n, 0n), RangeError)

		assert.throws(() => divideBigIntStable(1n, 2n, 0n), RangeError)
		assert.throws(() => divideBigIntStable(1n, 2n, -1n), RangeError)
		assert.throws(() => divideBigIntStable(1n, 2n, -SCALE), RangeError)
	})

	test('throws TypeError on non-BigInt arguments', () => {
		const invalidValues = [0, 1, -1, 1.5, NaN, Infinity, -Infinity, '1', null, undefined, true, {}, []]

		for (const bad of invalidValues) {
			assert.throws(() => divideBigIntStable(bad, 1n), TypeError)
			assert.throws(() => divideBigIntStable(1n, bad), TypeError)
		}

		// For scale, undefined uses the default; all other non-BigInt values must throw TypeError
		for (const bad of invalidValues.filter((v) => v !== undefined)) {
			assert.throws(() => divideBigIntStable(1n, 2n, bad), TypeError)
		}
	})

	test('cross-checks against independent long-division reference and exact error inequality', () => {
		const cases = [
			[0n, 1n],
			[1n, 3n],
			[2n, 3n],
			[-1n, 3n],
			[1n, -3n],
			[-2n, -3n],
			[1n, 7n],
			[355n, 113n],
			[-355n, 113n],
			[1n, 2n * SCALE],
			[3n, 2n * SCALE],
			[5n, 2n * SCALE],
			[-5n, 2n * SCALE],
			[2n * SCALE - 1n, 2n * SCALE],
			[2n * SCALE + 1n, 2n * SCALE],
			[999_999_999_999_999_999n, 1_000_000_000_000_000_000n],
			[(1n << 128n) + 123456789n, (1n << 64n) + 987654321n],
			[-(10n ** 350n + 7n), 3n * 10n ** 349n + 11n],
			[10n ** 500n + 1n, 2n * 10n ** 500n],
			[3n * 10n ** 500n, 2n * 10n ** 500n],
		]

		// Deterministic pseudo-random BigInt corpus via LCG
		let seed = 0x9e3779b97f4a7c15n
		const mask = (1n << 128n) - 1n
		const nextRand = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & mask
			return seed
		}

		for (let i = 0; i < 100; i++) {
			const signA = (i & 1) === 0 ? 1n : -1n
			const signB = (i & 2) === 0 ? 1n : -1n
			const a = signA * nextRand()
			const b = signB * (nextRand() + 1n)
			cases.push([a, b])
		}

		for (const [a, b] of cases) {
			const actual = divideBigIntStable(a, b)
			const expected = longDivisionDecimalReference(a, b)
			assert.strictEqual(
				actual,
				expected,
				`Mismatch vs long-division reference for (${a}, ${b}): got ${actual}, expected ${expected}`,
			)
			assertOptimalHalfToEven(a, b, actual, SCALE)
		}
	})
})
