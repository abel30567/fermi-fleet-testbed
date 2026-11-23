import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideDecimalSeries } from './divideDecimalSeries.js'

/**
 * Independent reference decimal division using native BigInt Euclidean division
 * (`/` and `%`) for cross-checking the series-based implementation.
 */
function referenceDivideBigInt(aStr, bStr, precision = 20) {
  const parse = (s) => {
    const t = s.trim()
    const neg = t.startsWith('-')
    const unsigned = t.replace(/^[+-]/, '')
    const [base, expPart] = unsigned.split(/[eE]/)
    const exp = expPart ? Number(expPart) : 0
    const [intPart, fracPart = ''] = base.split('.')
    const digits = (intPart + fracPart).replace(/^0+/, '') || '0'
    const scale = fracPart.length - exp
    return { neg: digits === '0' ? false : neg, mantissa: BigInt(digits), scale }
  }

  const a = parse(aStr)
  const b = parse(bStr)
  if (a.mantissa === 0n) return '0'

  const shift = precision + b.scale - a.scale
  const num = shift >= 0 ? a.mantissa * 10n ** BigInt(shift) : a.mantissa
  const den = shift >= 0 ? b.mantissa : b.mantissa * 10n ** BigInt(-shift)

  let q = num / den
  const r = num % den
  if (r * 2n >= den) q += 1n
  if (q === 0n) return '0'

  const sign = a.neg !== b.neg ? '-' : ''
  const s = q.toString()
  if (precision === 0) return sign + s
  const intP = s.length <= precision ? '0' : s.slice(0, s.length - precision)
  const fracP = (s.length <= precision ? s.padStart(precision, '0') : s.slice(s.length - precision)).replace(/0+$/, '')
  return fracP ? `${sign}${intP}.${fracP}` : `${sign}${intP}`
}

/**
 * Exact BigInt multiplication of two canonical decimal strings, returning
 * `{ mantissa, scale }` such that value = mantissa * 10^(-scale).
 */
function exactDecimalToScaledInt(s) {
  const neg = s.startsWith('-')
  const unsigned = s.replace(/^[+-]/, '')
  const [intPart, fracPart = ''] = unsigned.split('.')
  const mantissa = BigInt(intPart + fracPart)
  return { value: neg ? -mantissa : mantissa, scale: fracPart.length }
}

describe('divideDecimalSeries', () => {
  test('exact integer and terminating decimal division', () => {
    assert.equal(divideDecimalSeries('10', '2'), '5')
    assert.equal(divideDecimalSeries('100', '4'), '25')
    assert.equal(divideDecimalSeries('1', '4'), '0.25')
    assert.equal(divideDecimalSeries('7', '8'), '0.875')
    assert.equal(divideDecimalSeries('1.5', '0.25'), '6')
    assert.equal(divideDecimalSeries('0.0045', '0.15'), '0.03')
    assert.equal(divideDecimalSeries('123456.789', '1000'), '123.456789')
  })

  test('repeating decimals with default and custom precision', () => {
    assert.equal(divideDecimalSeries('1', '3'), '0.33333333333333333333')
    assert.equal(divideDecimalSeries('2', '3'), '0.66666666666666666667')
    assert.equal(divideDecimalSeries('1', '3', 0), '0')
    assert.equal(divideDecimalSeries('2', '3', 0), '1')
    assert.equal(divideDecimalSeries('1', '3', 5), '0.33333')
    assert.equal(divideDecimalSeries('1', '7', 12), '0.142857142857')
    assert.equal(divideDecimalSeries('1', '7', 18), '0.142857142857142857')
    assert.equal(divideDecimalSeries('22', '7', 10), '3.1428571429')
  })

  test('sign combinations and absence of negative zero', () => {
    assert.equal(divideDecimalSeries('-10', '4', 4), '-2.5')
    assert.equal(divideDecimalSeries('10', '-4', 4), '-2.5')
    assert.equal(divideDecimalSeries('-10', '-4', 4), '2.5')
    assert.equal(divideDecimalSeries('+10', '+4', 4), '2.5')
    assert.equal(divideDecimalSeries('0', '5', 10), '0')
    assert.equal(divideDecimalSeries('-0', '5', 10), '0')
    assert.equal(divideDecimalSeries('0.000', '-3.14', 10), '0')
    assert.equal(divideDecimalSeries('-1', '1000', 1), '0')
    assert.equal(divideDecimalSeries('-1', '1000', 2), '0')
    assert.equal(divideDecimalSeries('-1', '1000', 3), '-0.001')
  })

  test('exact rounding half away from zero and carry propagation', () => {
    assert.equal(divideDecimalSeries('1', '2', 0), '1')
    assert.equal(divideDecimalSeries('-1', '2', 0), '-1')
    assert.equal(divideDecimalSeries('3', '2', 0), '2')
    assert.equal(divideDecimalSeries('-3', '2', 0), '-2')
    assert.equal(divideDecimalSeries('5', '2', 0), '3')
    assert.equal(divideDecimalSeries('1', '4', 1), '0.3')
    assert.equal(divideDecimalSeries('99999', '100000', 4), '1')
    assert.equal(divideDecimalSeries('-99999', '100000', 4), '-1')
    assert.equal(divideDecimalSeries('199999', '100000', 4), '2')
  })

  test('power-of-two and boundary divisors (r = 1/2 and r near 0)', () => {
    // Power-of-two divisors hit the slowest-converging boundary r = 1/2.
    assert.equal(divideDecimalSeries('1', '2', 10), '0.5')
    assert.equal(divideDecimalSeries('1', '1024', 20), '0.0009765625')
    assert.equal(divideDecimalSeries('1', '1048576', 25), '0.00000095367431640625')
    assert.equal(divideDecimalSeries('1048576', '1048576', 20), '1')
    // Divisors just below 2^k hit r near 0.
    assert.equal(divideDecimalSeries('1', '1023', 15), '0.000977517106549')
    assert.equal(divideDecimalSeries('1', '65535', 20), '0.00001525902189669642')
    // Divisors just above 2^k hit r just below 1/2.
    assert.equal(divideDecimalSeries('1', '1025', 15), '0.000975609756098')
    assert.equal(divideDecimalSeries('1', '65537', 20), '0.00001525855623540901')
  })

  test('leading/trailing dots, whitespace, and scientific notation', () => {
    assert.equal(divideDecimalSeries('.5', '2.', 4), '0.25')
    assert.equal(divideDecimalSeries('  10.5  ', ' 2.1 ', 4), '5')
    assert.equal(divideDecimalSeries('1.5e10', '3e5', 4), '50000')
    assert.equal(divideDecimalSeries('1e-5', '4', 10), '0.0000025')
    assert.equal(divideDecimalSeries('3e500', '6e500', 10), '0.5')
    assert.equal(divideDecimalSeries('-2.5E+3', '5E-1', 4), '-5000')
    assert.equal(divideDecimalSeries('1e-1000000', '3', 20), '0')
  })

  test('arbitrary-precision operands far beyond IEEE-754 limits', () => {
    const bigA = '12345678901234567890123456789012345678901234567890'
    const bigB = '9876543210987654321098765432109876543210987654321'
    const expected = referenceDivideBigInt(bigA, bigB, 80)
    assert.equal(divideDecimalSeries(bigA, bigB, 80), expected)

    // 250 decimal places of 1 / 3
    assert.equal(divideDecimalSeries('1', '3', 250), '0.' + '3'.repeat(250))

    // High-precision divisor with small quotient (exercises workBits < bitLength(D))
    const denom = '1' + '0'.repeat(120) + '1'
    const numer = '3' + '0'.repeat(120) + '3'
    assert.equal(divideDecimalSeries(numer, denom, 10), '3')
  })

  test('input validation errors', () => {
    // Division by zero
    assert.throws(() => divideDecimalSeries('1', '0'), RangeError)
    assert.throws(() => divideDecimalSeries('1', '-0'), RangeError)
    assert.throws(() => divideDecimalSeries('1', '0.00000'), RangeError)
    assert.throws(() => divideDecimalSeries('0', '0e10'), RangeError)

    // Wrong types
    assert.throws(() => divideDecimalSeries(10, '2'), TypeError)
    assert.throws(() => divideDecimalSeries('10', 2), TypeError)
    assert.throws(() => divideDecimalSeries(null, '2'), TypeError)
    assert.throws(() => divideDecimalSeries('10', undefined), TypeError)
    assert.throws(() => divideDecimalSeries('10', '2', '5'), TypeError)
    assert.throws(() => divideDecimalSeries('10', '2', null), TypeError)

    // Malformed strings
    assert.throws(() => divideDecimalSeries('', '2'), RangeError)
    assert.throws(() => divideDecimalSeries('   ', '2'), RangeError)
    assert.throws(() => divideDecimalSeries('abc', '2'), RangeError)
    assert.throws(() => divideDecimalSeries('1.2.3', '2'), RangeError)
    assert.throws(() => divideDecimalSeries('.', '2'), RangeError)
    assert.throws(() => divideDecimalSeries('NaN', '2'), RangeError)
    assert.throws(() => divideDecimalSeries('Infinity', '2'), RangeError)
    assert.throws(() => divideDecimalSeries('1e', '2'), RangeError)
    assert.throws(() => divideDecimalSeries('1', '2e+'), RangeError)

    // Invalid precision
    assert.throws(() => divideDecimalSeries('1', '2', -1), RangeError)
    assert.throws(() => divideDecimalSeries('1', '2', 1.5), RangeError)
    assert.throws(() => divideDecimalSeries('1', '2', Number.NaN), RangeError)
    assert.throws(() => divideDecimalSeries('1', '2', Number.POSITIVE_INFINITY), RangeError)
  })

  test('independent cross-check 1: BigInt Euclidean division across diverse matrix', () => {
    const cases = [
      ['1', '1', 0],
      ['1', '3', 30],
      ['2', '3', 30],
      ['355', '113', 60],
      ['-9876543210123456789.0123456789', '123456789.987654321', 50],
      ['0.00000000000012345', '0.0000007', 40],
      ['10000000000000000000000000000000000000000', '97', 100],
      ['-1', '1048576', 35],
      ['123456789012345678901234567890', '999999999999999999999999999999', 45],
      ['500000000000000000000000000001', '1000000000000000000000000000000', 0],
      ['499999999999999999999999999999', '1000000000000000000000000000000', 0],
      ['1e25', '17', 75],
    ]

    for (const [a, b, p] of cases) {
      assert.equal(
        divideDecimalSeries(a, b, p),
        referenceDivideBigInt(a, b, p),
        `mismatch for ${a} / ${b} at precision ${p}`,
      )
    }
  })

  test('independent cross-check 2: multiplicative inverse error bound |q*b - a| <= 0.5 * 10^-p * |b|', () => {
    const pairs = [
      ['31415926535897932384626433832795', '27182818284590452353602874713527', 60],
      ['-0.000789123456789', '42.123456789012345', 45],
      ['1', '997', 120],
      ['99999999999999999999', '76543210987654321', 35],
    ]

    for (const [aStr, bStr, p] of pairs) {
      const qStr = divideDecimalSeries(aStr, bStr, p)
      const a = exactDecimalToScaledInt(aStr)
      const b = exactDecimalToScaledInt(bStr)
      const q = exactDecimalToScaledInt(qStr)

      // Compute |q * b - a| on a common denominator 10^commonScale.
      const qbScale = q.scale + b.scale
      const commonScale = Math.max(qbScale, a.scale, b.scale + p)
      const qbScaled = q.value * b.value * 10n ** BigInt(commonScale - qbScale)
      const aScaled = a.value * 10n ** BigInt(commonScale - a.scale)
      const diff = qbScaled >= aScaled ? qbScaled - aScaled : aScaled - qbScaled

      const absB = b.value < 0n ? -b.value : b.value
      // Bound: diff <= 0.5 * 10^-p * |b|  <=>  2 * diff <= |b| * 10^(commonScale - b.scale - p)
      const rhs = absB * 10n ** BigInt(commonScale - b.scale - p)
      assert.ok(
        diff * 2n <= rhs,
        `multiplicative residual too large for ${aStr} / ${bStr} at precision ${p}`,
      )
    }
  })

  test('independent cross-check 3: generating-function identity 1 / 998001', () => {
    // 1 / 998001 = 1 / (999^2) = sum_{n=0}^{inf} (n + 1) * 10^(-3*(n + 2)),
    // whose decimal expansion lists 000, 001, 002, ..., 997, 999 in order.
    const actual = divideDecimalSeries('1', '998001', 150)
    let expectedFrac = ''
    for (let k = 0; k < 50; k += 1) {
      expectedFrac += String(k).padStart(3, '0')
    }
    assert.equal(actual, `0.${expectedFrac}`)
  })
})
