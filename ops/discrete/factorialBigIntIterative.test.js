import { test } from 'node:test'
import assert from 'node:assert'
import { factorialBigIntIterative } from './factorialBigIntIterative.js'

test('edge cases: 0n and 1n', () => {
	assert.strictEqual(factorialBigIntIterative(0n), 1n)
	assert.strictEqual(factorialBigIntIterative(1n), 1n)
})

test('small exact factorials: 2n through 12n', () => {
	const expected = [
		[2n, 2n],
		[3n, 6n],
		[4n, 24n],
		[5n, 120n],
		[6n, 720n],
		[7n, 5040n],
		[8n, 40320n],
		[9n, 362880n],
		[10n, 3628800n],
		[11n, 39916800n],
		[12n, 479001600n],
	]
	for (const [input, output] of expected) {
		assert.strictEqual(factorialBigIntIterative(input), output)
	}
})

test('medium and large exact factorials beyond Number.MAX_SAFE_INTEGER', () => {
	assert.strictEqual(
		factorialBigIntIterative(20n),
		2432902008176640000n,
	)
	assert.strictEqual(
		factorialBigIntIterative(25n),
		15511210043330985984000000n,
	)
	assert.strictEqual(
		factorialBigIntIterative(50n),
		30414093201713378043612608166064768844377641568960512000000000000n,
	)
	assert.strictEqual(
		factorialBigIntIterative(100n),
		93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n,
	)
})

test('large n: trailing zero count matches Legendre formula for 500n and 1000n', () => {
	const countTrailingZeros = (value) => {
		const s = value.toString()
		let zeros = 0
		for (let i = s.length - 1; i >= 0 && s[i] === '0'; i--) {
			zeros++
		}
		return zeros
	}
	const legendreFive = (n) => {
		let count = 0n
		for (let p = 5n; p <= n; p *= 5n) {
			count += n / p
		}
		return Number(count)
	}

	for (const n of [100n, 500n, 1000n]) {
		const fact = factorialBigIntIterative(n)
		assert.strictEqual(typeof fact, 'bigint')
		assert.strictEqual(countTrailingZeros(fact), legendreFive(n))
	}
})

test('invalid inputs: negative BigInts throw RangeError', () => {
	for (const bad of [-1n, -2n, -10n, -1000n]) {
		assert.throws(
			() => factorialBigIntIterative(bad),
			{ name: 'RangeError' },
		)
	}
})

test('invalid inputs: non-BigInt values throw TypeError', () => {
	const nonBigInts = [
		0,
		1,
		5,
		-5,
		3.5,
		NaN,
		Infinity,
		-Infinity,
		'5',
		'0',
		'',
		null,
		undefined,
		true,
		false,
		{},
		[],
		Symbol('5'),
	]
	for (const bad of nonBigInts) {
		assert.throws(
			() => factorialBigIntIterative(bad),
			{ name: 'TypeError' },
		)
	}
})

test('cross-check: recurrence relation n! / (n - 1)! === n with zero remainder', () => {
	let prev = factorialBigIntIterative(0n)
	for (let n = 1n; n <= 60n; n++) {
		const curr = factorialBigIntIterative(n)
		assert.strictEqual(curr % prev, 0n)
		assert.strictEqual(curr / prev, n)
		prev = curr
	}

	const f199 = factorialBigIntIterative(199n)
	const f200 = factorialBigIntIterative(200n)
	assert.strictEqual(f200 % f199, 0n)
	assert.strictEqual(f200 / f199, 200n)
})

test('cross-check: Wilson theorem (p - 1)! ≡ -1 (mod p) for primes and 0 (mod m) for composites > 4', () => {
	const primes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 97n, 101n]
	for (const p of primes) {
		assert.strictEqual(factorialBigIntIterative(p - 1n) % p, p - 1n)
	}

	const composites = [6n, 8n, 9n, 10n, 12n, 15n, 21n, 25n, 100n]
	for (const m of composites) {
		assert.strictEqual(factorialBigIntIterative(m - 1n) % m, 0n)
	}
})

test('cross-check: Legendre p-adic valuation of 100! for primes 2, 3, 5, 7', () => {
	const fact100 = factorialBigIntIterative(100n)
	const vP = (val, p) => {
		let count = 0n
		let cur = val
		while (cur % p === 0n) {
			cur /= p
			count++
		}
		return count
	}
	const legendre = (n, p) => {
		let sum = 0n
		for (let pk = p; pk <= n; pk *= p) {
			sum += n / pk
		}
		return sum
	}

	for (const p of [2n, 3n, 5n, 7n]) {
		assert.strictEqual(vP(fact100, p), legendre(100n, p))
	}
})
