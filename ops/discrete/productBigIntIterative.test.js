import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productBigIntIterative } from './productBigIntIterative.js'

describe('productBigIntIterative — range form', () => {
	test('computes simple integer products over a range', () => {
		assert.equal(productBigIntIterative((i) => i, 1n, 5n), 120n)
		assert.equal(productBigIntIterative((i) => i * 2n, 1n, 4n), 384n)
		assert.equal(productBigIntIterative((i) => i + 1n, 0n, 4n), 120n)
		assert.equal(productBigIntIterative(() => 3n, 1n, 6n), 729n)
	})

	test('handles single-element range (start === end)', () => {
		let calls = 0
		const result = productBigIntIterative(
			(i) => {
				calls += 1
				return i * i
			},
			7n,
			7n
		)
		assert.equal(result, 49n)
		assert.equal(calls, 1)
	})

	test('returns 1n for empty range (start > end) without invoking fn', () => {
		let calls = 0
		const result = productBigIntIterative(
			(i) => {
				calls += 1
				return i
			},
			10n,
			5n
		)
		assert.equal(result, 1n)
		assert.equal(calls, 0)
	})

	test('short-circuits immediately when a zero factor is encountered', () => {
		let calls = 0
		const result = productBigIntIterative(
			(i) => {
				calls += 1
				return i - 3n
			},
			1n,
			1_000_000n
		)
		assert.equal(result, 0n)
		assert.equal(calls, 3)
	})

	test('handles negative indices and negative factors with correct parity', () => {
		// Even number of negative factors -> positive
		assert.equal(productBigIntIterative((i) => i, -4n, -1n), 24n)
		// Odd number of negative factors -> negative
		assert.equal(productBigIntIterative((i) => i, -5n, -1n), -120n)
		// Alternating signs: (-1)^i * i for i = 1..4 => (-1)*(2)*(-3)*(4) = 24
		assert.equal(
			productBigIntIterative((i) => (i % 2n === 0n ? i : -i), 1n, 4n),
			24n
		)
		// Range crossing zero short-circuits to 0n
		let calls = 0
		assert.equal(
			productBigIntIterative(
				(i) => {
					calls += 1
					return i
				},
				-2n,
				5n
			),
			0n
		)
		assert.equal(calls, 3)
	})

	test('supports custom positive step sizes', () => {
		// Odd double factorial: 1 * 3 * 5 * 7 * 9 = 945
		assert.equal(productBigIntIterative((i) => i, 1n, 9n, 2n), 945n)
		// Even double factorial: 2 * 4 * 6 * 8 = 384
		assert.equal(productBigIntIterative((i) => i, 2n, 8n, 2n), 384n)
		// Step larger than range width evaluates only start
		assert.equal(productBigIntIterative((i) => i + 10n, 3n, 5n, 100n), 13n)
	})

	test('handles arbitrarily large BigInt indices and outputs beyond IEEE-754 limits', () => {
		// Indices well beyond Number.MAX_SAFE_INTEGER
		const base = 10n ** 30n
		const expected = base * (base + 1n) * (base + 2n)
		assert.equal(productBigIntIterative((i) => i, base, base + 2n), expected)

		// 200! has 375 digits (exceeds Number.MAX_VALUE ~ 1.8e308)
		const fact200 = productBigIntIterative((i) => i, 1n, 200n)
		const fact199 = productBigIntIterative((i) => i, 1n, 199n)
		assert.equal(fact200 / fact199, 200n)
		assert.equal(fact200 % fact199, 0n)
		assert.equal(fact200.toString().length, 375)
	})
})

describe('productBigIntIterative — iterable / array form', () => {
	test('computes product of BigInt arrays and general iterables', () => {
		assert.equal(productBigIntIterative([2n, 3n, 5n, 7n]), 210n)
		assert.equal(productBigIntIterative([42n]), 42n)
		assert.equal(productBigIntIterative(new Set([2n, 3n, 4n])), 24n)
		assert.equal(
			productBigIntIterative(new BigInt64Array([10n, -20n, 30n])),
			-6000n
		)
	})

	test('returns 1n for empty array or iterable', () => {
		assert.equal(productBigIntIterative([]), 1n)
		assert.equal(productBigIntIterative(new Set()), 1n)
		function* emptyGen() {}
		assert.equal(productBigIntIterative(emptyGen()), 1n)
	})

	test('short-circuits on zero factor in iterable form', () => {
		let yielded = 0
		function* gen() {
			yielded += 1
			yield 5n
			yielded += 1
			yield 0n
			yielded += 1
			yield 99n
		}
		assert.equal(productBigIntIterative(gen()), 0n)
		assert.equal(yielded, 2)
		assert.equal(productBigIntIterative([3n, -4n, 0n, 7n]), 0n)
	})

	test('handles negative and very large BigInt factors', () => {
		assert.equal(productBigIntIterative([-2n, -3n, -4n]), -24n)
		assert.equal(productBigIntIterative([-2n, -3n]), 6n)
		assert.equal(
			productBigIntIterative([10n ** 50n, 10n ** 50n, -3n]),
			-3n * 10n ** 100n
		)
	})
})

describe('productBigIntIterative — independent mathematical cross-checks', () => {
	test('factorial identity: ∏_{i=1}^{n} i = n!', () => {
		assert.equal(
			productBigIntIterative((i) => i, 1n, 20n),
			2432902008176640000n
		)
		assert.equal(
			productBigIntIterative((i) => i, 1n, 50n),
			30414093201713378043612608166064768844377641568960512000000000000n
		)
		// Double factorial identity: ∏_{k=1}^{n} (2k) = 2^n * n!
		const n = 30n
		const lhs = productBigIntIterative((k) => 2n * k, 1n, n)
		const rhs = 2n ** n * productBigIntIterative((k) => k, 1n, n)
		assert.equal(lhs, rhs)
	})

	test('telescoping Fermat product identity: ∏_{k=0}^{n-1} (2^(2^k) + 1) = 2^(2^n) - 1', () => {
		for (const n of [1n, 2n, 3n, 5n, 8n]) {
			const lhs = productBigIntIterative((k) => 2n ** (2n ** k) + 1n, 0n, n - 1n)
			const rhs = 2n ** (2n ** n) - 1n
			assert.equal(lhs, rhs)
		}
	})

	test('telescoping shifted ratio identity: ∏_{k=1}^{n} (k + 1) = (n + 1) * ∏_{k=1}^{n} k', () => {
		for (const n of [1n, 10n, 40n]) {
			const numerator = productBigIntIterative((k) => k + 1n, 1n, n)
			const denominator = productBigIntIterative((k) => k, 1n, n)
			assert.equal(numerator, (n + 1n) * denominator)
		}
	})

	test('multiplicativity and range splitting identities', () => {
		const f = (i) => 2n * i + 1n
		const g = (i) => i * i + 1n

		// Range splitting: ∏_{1}^{12} f(i) = (∏_{1}^{5} f(i)) * (∏_{6}^{12} f(i))
		const full = productBigIntIterative(f, 1n, 12n)
		const left = productBigIntIterative(f, 1n, 5n)
		const right = productBigIntIterative(f, 6n, 12n)
		assert.equal(full, left * right)

		// Multiplicativity: ∏ (f(i) * g(i)) = (∏ f(i)) * (∏ g(i))
		const combined = productBigIntIterative((i) => f(i) * g(i), 1n, 10n)
		const separate =
			productBigIntIterative(f, 1n, 10n) * productBigIntIterative(g, 1n, 10n)
		assert.equal(combined, separate)

		// Agreement between range form and array form
		const arr = []
		for (let i = 1n; i <= 12n; i += 1n) {
			arr.push(f(i))
		}
		assert.equal(productBigIntIterative(arr), full)
	})
})

describe('productBigIntIterative — input validation', () => {
	test('rejects wrong argument counts', () => {
		assert.throws(() => productBigIntIterative(), TypeError)
		assert.throws(() => productBigIntIterative((i) => i, 1n), TypeError)
		assert.throws(
			() => productBigIntIterative((i) => i, 1n, 5n, 1n, 1n),
			TypeError
		)
	})

	test('rejects invalid iterable arguments', () => {
		assert.throws(() => productBigIntIterative(null), TypeError)
		assert.throws(() => productBigIntIterative(undefined), TypeError)
		assert.throws(() => productBigIntIterative(123n), TypeError)
		assert.throws(() => productBigIntIterative(123), TypeError)
		assert.throws(() => productBigIntIterative('123'), TypeError)
		assert.throws(() => productBigIntIterative({}), TypeError)
		assert.throws(() => productBigIntIterative([1n, 2, 3n]), TypeError)
		assert.throws(() => productBigIntIterative([1n, '2', 3n]), TypeError)
		assert.throws(() => productBigIntIterative([1n, null]), TypeError)
		assert.throws(() => productBigIntIterative([NaN]), TypeError)
	})

	test('rejects invalid range arguments and non-BigInt fn returns', () => {
		assert.throws(() => productBigIntIterative('not-a-fn', 1n, 5n), TypeError)
		assert.throws(() => productBigIntIterative((i) => i, 1, 5n), TypeError)
		assert.throws(() => productBigIntIterative((i) => i, 1n, 5), TypeError)
		assert.throws(() => productBigIntIterative((i) => i, 1n, 5n, 1), TypeError)
		assert.throws(() => productBigIntIterative((i) => i, 1n, 5n, 0n), RangeError)
		assert.throws(
			() => productBigIntIterative((i) => i, 1n, 5n, -1n),
			RangeError
		)
		assert.throws(
			() => productBigIntIterative((i) => Number(i), 1n, 3n),
			TypeError
		)
		assert.throws(() => productBigIntIterative(() => null, 1n, 3n), TypeError)
		assert.throws(
			() => productBigIntIterative(() => undefined, 1n, 3n),
			TypeError
		)
	})
})
