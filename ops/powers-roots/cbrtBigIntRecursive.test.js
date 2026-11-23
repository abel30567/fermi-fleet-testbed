import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtBigIntRecursive } from './cbrtBigIntRecursive.js'

const SCALE = 10n ** 18n
const SCALE_CUBED = SCALE ** 3n

/**
 * Independent reference implementation using iterative binary search over `[0, hi]`
 * to compute `sign(n) * floor(cbrt(|n| * 10^54))`.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function cbrtBinarySearchReference(n) {
	if (n === 0n) return 0n
	const negative = n < 0n
	const target = (negative ? -n : n) * SCALE_CUBED

	let hi = 1n
	while (hi * hi * hi <= target) {
		hi <<= 1n
	}
	let lo = hi >> 1n

	while (lo + 1n < hi) {
		const mid = (lo + hi) >> 1n
		if (mid * mid * mid <= target) {
			lo = mid
		} else {
			hi = mid
		}
	}

	return negative ? -lo : lo
}

/**
 * Asserts the exact floor-magnitude bracket invariant:
 * `|r|^3 <= |n| * 10^54 < (|r| + 1)^3` and matching sign.
 *
 * @param {bigint} n
 * @param {bigint} r
 */
function assertCubeBracket(n, r) {
	if (n === 0n) {
		assert.equal(r, 0n)
		return
	}
	assert.equal(r < 0n, n < 0n, `sign mismatch for n=${n}`)
	const absN = n < 0n ? -n : n
	const absR = r < 0n ? -r : r
	const scaled = absN * SCALE_CUBED
	assert.ok(absR ** 3n <= scaled, `lower bound failed for n=${n}`)
	assert.ok((absR + 1n) ** 3n > scaled, `upper bound failed for n=${n}`)
}

describe('cbrtBigIntRecursive', () => {
	test('computes exact fixed-point cube roots for positive perfect cubes', () => {
		assert.equal(cbrtBigIntRecursive(0n), 0n)
		assert.equal(cbrtBigIntRecursive(1n), 1n * SCALE)
		assert.equal(cbrtBigIntRecursive(8n), 2n * SCALE)
		assert.equal(cbrtBigIntRecursive(27n), 3n * SCALE)
		assert.equal(cbrtBigIntRecursive(64n), 4n * SCALE)
		assert.equal(cbrtBigIntRecursive(125n), 5n * SCALE)
		assert.equal(cbrtBigIntRecursive(1000n), 10n * SCALE)
		assert.equal(cbrtBigIntRecursive(1_000_000n), 100n * SCALE)
		assert.equal(cbrtBigIntRecursive(123456789n ** 3n), 123456789n * SCALE)
	})

	test('computes exact fixed-point cube roots for negative perfect cubes', () => {
		assert.equal(cbrtBigIntRecursive(-1n), -1n * SCALE)
		assert.equal(cbrtBigIntRecursive(-8n), -2n * SCALE)
		assert.equal(cbrtBigIntRecursive(-27n), -3n * SCALE)
		assert.equal(cbrtBigIntRecursive(-64n), -4n * SCALE)
		assert.equal(cbrtBigIntRecursive(-1000n), -10n * SCALE)
		assert.equal(cbrtBigIntRecursive(-(987654321n ** 3n)), -987654321n * SCALE)
	})

	test('computes accurate 10^18-scaled values for known irrational cube roots', () => {
		// cbrt(2)  = 1.2599210498948731647672106...
		assert.equal(cbrtBigIntRecursive(2n), 1_259_921_049_894_873_164n)
		// cbrt(3)  = 1.4422495703074083823216383...
		assert.equal(cbrtBigIntRecursive(3n), 1_442_249_570_307_408_382n)
		// cbrt(10) = 2.1544346900318837217592935...
		assert.equal(cbrtBigIntRecursive(10n), 2_154_434_690_031_883_721n)
		// cbrt(-2) = -1.2599210498948731647672106...
		assert.equal(cbrtBigIntRecursive(-2n), -1_259_921_049_894_873_164n)
	})

	test('handles edge cases around cube boundaries and huge BigInts', () => {
		const bigRoot = 10n ** 80n + 7n
		const bigCube = bigRoot ** 3n

		const cases = [
			7n,
			9n,
			26n,
			28n,
			63n,
			65n,
			(2n ** 64n) - 1n,
			2n ** 64n,
			2n ** 128n,
			-(2n ** 256n),
			10n ** 100n,
			-(10n ** 150n),
			10n ** 300n,
			bigCube - 1n,
			bigCube,
			bigCube + 1n,
			-(bigCube - 1n),
			-bigCube,
			-(bigCube + 1n)
		]

		for (const n of cases) {
			assertCubeBracket(n, cbrtBigIntRecursive(n))
		}

		assert.equal(cbrtBigIntRecursive(bigCube), bigRoot * SCALE)
		assert.equal(cbrtBigIntRecursive(-bigCube), -bigRoot * SCALE)
		assert.ok(cbrtBigIntRecursive(bigCube - 1n) < bigRoot * SCALE)
		assert.ok(cbrtBigIntRecursive(bigCube + 1n) >= bigRoot * SCALE)
	})

	test('preserves odd symmetry and monotonicity', () => {
		const values = [0n, 1n, 2n, 5n, 27n, 100n, 10n ** 20n, 2n ** 127n - 1n]
		let prev = null
		for (const v of values) {
			const pos = cbrtBigIntRecursive(v)
			const neg = cbrtBigIntRecursive(-v)
			assert.equal(neg, -pos)
			if (prev !== null) {
				assert.ok(pos > prev, `monotonicity failed at v=${v}`)
			}
			prev = pos
		}
	})

	test('rejects invalid non-BigInt inputs with TypeError', () => {
		const invalidInputs = [
			0,
			8,
			-27,
			1.5,
			NaN,
			Infinity,
			-Infinity,
			'8',
			'8n',
			'',
			null,
			undefined,
			true,
			false,
			{},
			[],
			Symbol('cbrt'),
			() => 8n
		]

		for (const input of invalidInputs) {
			assert.throws(
				() => cbrtBigIntRecursive(input),
				{ name: 'TypeError' },
				`expected TypeError for input ${String(input)}`
			)
		}

		assert.throws(() => cbrtBigIntRecursive(), { name: 'TypeError' })
	})

	test('cross-checks against independent binary-search BigInt cube root', () => {
		const testValues = []
		for (let i = -200n; i <= 200n; i += 1n) {
			testValues.push(i)
		}
		for (let exp = 3n; exp <= 180n; exp += 13n) {
			const p = 2n ** exp
			testValues.push(p - 1n, p, p + 1n, -(p - 1n), -p, -(p + 1n))
		}
		const huge = 31415926535897932384626433832795028841971693993751n
		testValues.push(huge, -huge, huge ** 3n - 1n, huge ** 3n, huge ** 3n + 1n)

		for (const n of testValues) {
			const actual = cbrtBigIntRecursive(n)
			const expected = cbrtBinarySearchReference(n)
			assert.equal(actual, expected, `mismatch against binary search for n=${n}`)
			assertCubeBracket(n, actual)
		}
	})

	test('cross-checks against Math.cbrt within floating-point tolerance', () => {
		const samples = [
			-1e12,
			-999999,
			-42,
			-2,
			-1,
			0,
			1,
			2,
			7,
			42,
			123456,
			9876543210,
			1e15
		]

		for (const x of samples) {
			const actual = Number(cbrtBigIntRecursive(BigInt(x))) / 1e18
			const expected = Math.cbrt(x)
			const tolerance = Math.max(1e-14, Math.abs(expected) * 1e-14)
			assert.ok(
				Math.abs(actual - expected) <= tolerance,
				`Math.cbrt mismatch for ${x}: got ${actual}, expected ${expected}`
			)
		}
	})
})
