import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosBigIntRecursive } from './cosBigIntRecursive.js'

const SCALE = 10n ** 18n

/**
 * Independent reference implementation using iterative Machin pi and
 * direct iterative Taylor series summation at 60-digit precision.
 * Used as an independent cross-check against the recursive binary-splitting implementation.
 */
function referenceCosBigInt(x) {
	const ax = x < 0n ? -x : x
	if (ax === 0n) return SCALE

	const digits = ax.toString().length + 60
	const scale = 10n ** BigInt(digits)

	const atanInv = (m) => {
		const m2 = m * m
		let p = scale / m
		let sum = p
		let k = 1n
		while (p !== 0n) {
			p /= m2
			const term = p / (2n * k + 1n)
			if (term === 0n) break
			sum += (k & 1n) === 1n ? -term : term
			k += 1n
		}
		return sum
	}

	const pi = 16n * atanInv(5n) - 4n * atanInv(239n)
	const twoPi = 2n * pi
	const halfPi = pi / 2n

	let rem = (ax * scale) % twoPi
	if (rem > pi) rem = twoPi - rem
	let sign = 1n
	if (rem > halfPi) {
		rem = pi - rem
		sign = -1n
	}

	// Iterative Taylor series: cos(theta) = sum_{k=0..inf} (-1)^k * theta^(2k) / (2k)!
	const workScale = 10n ** 45n
	const theta = rem / 10n ** BigInt(digits - 45)
	let term = workScale
	let sum = workScale
	let k = 1n
	while (term !== 0n) {
		term = (-term * theta) / workScale
		term = (term * theta) / workScale
		term /= (2n * k - 1n) * (2n * k)
		sum += term
		k += 1n
	}

	if (sum <= 0n) return 0n
	const down = 10n ** 27n
	const mag = (sum * 2n + down) / (2n * down)
	return sign * mag
}

describe('cosBigIntRecursive', () => {
	test('exact known values for small integers', () => {
		assert.equal(cosBigIntRecursive(0n), 1_000_000_000_000_000_000n)
		assert.equal(cosBigIntRecursive(1n), 540_302_305_868_139_717n)
		assert.equal(cosBigIntRecursive(2n), -416_146_836_547_142_387n)
		assert.equal(cosBigIntRecursive(3n), -989_992_496_600_445_457n)
		assert.equal(cosBigIntRecursive(4n), -653_643_620_863_611_915n)
		assert.equal(cosBigIntRecursive(5n), 283_662_185_463_226_264n)
		assert.equal(cosBigIntRecursive(6n), 960_170_286_650_366_021n)
		assert.equal(cosBigIntRecursive(10n), -839_071_529_076_452_452n)
	})

	test('even-function symmetry: cos(-x) === cos(x)', () => {
		const samples = [1n, 2n, 3n, 7n, 22n, 355n, 10n ** 15n, 10n ** 50n, 10n ** 120n]
		for (const x of samples) {
			assert.equal(cosBigIntRecursive(-x), cosBigIntRecursive(x))
		}
	})

	test('edge cases: near multiples of pi, large BigInts, and dynamic pi precision', () => {
		// 355 is extremely close to 113 * pi (355/113 ≈ pi to 6 decimal places), so cos(355) ≈ -1
		const cos355 = cosBigIntRecursive(355n)
		assert.ok(cos355 < -999_999_999_000_000_000n && cos355 >= -SCALE)

		// 710 is extremely close to 226 * pi (even multiple), so cos(710) ≈ +1
		const cos710 = cosBigIntRecursive(710n)
		assert.ok(cos710 > 999_999_998_000_000_000n && cos710 <= SCALE)

		// Values well beyond Number.MAX_SAFE_INTEGER and beyond precomputed 110-digit pi
		const largeInputs = [
			10n ** 20n,
			10n ** 60n,
			10n ** 120n,
			-(10n ** 125n) - 123456789n,
		]
		for (const x of largeInputs) {
			const res = cosBigIntRecursive(x)
			assert.equal(typeof res, 'bigint')
			assert.ok(res >= -SCALE && res <= SCALE)
		}
	})

	test('input validation throws TypeError for non-BigInt arguments', () => {
		const invalidInputs = [
			undefined,
			null,
			0,
			1,
			-1,
			3.14,
			NaN,
			Infinity,
			-Infinity,
			'0',
			'1',
			'1n',
			true,
			false,
			{},
			[],
			Symbol('angle'),
			() => 0n,
		]

		for (const bad of invalidInputs) {
			assert.throws(() => cosBigIntRecursive(bad), TypeError)
		}
		assert.throws(() => cosBigIntRecursive(), TypeError)
	})

	test('independent cross-check against Math.cos across [-100, 100]', () => {
		for (let i = -100; i <= 100; i++) {
			const actual = cosBigIntRecursive(BigInt(i))
			const expectedApprox = BigInt(Math.round(Math.cos(i) * 1e15)) * 1000n
			const diff = actual > expectedApprox ? actual - expectedApprox : expectedApprox - actual
			assert.ok(
				diff <= 10_000n,
				`Mismatch at ${i}: actual=${actual}, Math.cos approx=${expectedApprox}, diff=${diff}`
			)
		}
	})

	test('independent cross-check against iterative high-precision reference (exact ULP match)', () => {
		const inputs = [
			0n,
			1n,
			2n,
			3n,
			11n,
			22n,
			355n,
			710n,
			-42n,
			1_000_000_000n,
			10n ** 20n,
			10n ** 65n,
			10n ** 120n,
			-(10n ** 130n) + 7n,
		]

		for (const x of inputs) {
			assert.equal(
				cosBigIntRecursive(x),
				referenceCosBigInt(x),
				`Exact ULP mismatch at x=${x}`
			)
		}
	})

	test('independent trigonometric identity cross-checks (double-angle & product-to-sum)', () => {
		// Double-angle identity: cos(2x) = 2 * cos^2(x) - 1
		const angles = [1n, 3n, 17n, 355n, 10n ** 25n, 10n ** 120n]
		for (const x of angles) {
			const cx = cosBigIntRecursive(x)
			const c2x = cosBigIntRecursive(2n * x)
			const rhs = (2n * cx * cx + SCALE / 2n) / SCALE - SCALE
			const diff = c2x > rhs ? c2x - rhs : rhs - c2x
			assert.ok(
				diff <= 3n,
				`Double-angle identity failed for x=${x}: cos(2x)=${c2x}, 2cos^2(x)-1=${rhs}`
			)
		}

		// Product-to-sum identity: cos(x + y) + cos(x - y) = 2 * cos(x) * cos(y)
		const pairs = [
			[1n, 2n],
			[5n, 13n],
			[10n ** 30n, 10n ** 30n + 7n],
			[10n ** 120n, 355n],
		]
		for (const [x, y] of pairs) {
			const lhs = cosBigIntRecursive(x + y) + cosBigIntRecursive(x - y)
			const prod = 2n * cosBigIntRecursive(x) * cosBigIntRecursive(y)
			const rhs = prod >= 0n ? (prod + SCALE / 2n) / SCALE : (prod - SCALE / 2n) / SCALE
			const diff = lhs > rhs ? lhs - rhs : rhs - lhs
			assert.ok(
				diff <= 3n,
				`Product-to-sum identity failed for (${x}, ${y}): lhs=${lhs}, rhs=${rhs}`
			)
		}
	})
})
