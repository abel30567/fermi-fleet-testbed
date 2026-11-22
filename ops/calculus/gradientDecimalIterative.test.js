import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gradientDecimalIterative } from './gradientDecimalIterative.js';

// ---------------------------------------------------------------------------
// Independent BigInt arbitrary-precision decimal helpers for test fixtures
// and analytical cross-checks (zero external dependencies, no float64 loss).
// ---------------------------------------------------------------------------

function parseExact(str) {
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(str);
  if (!match) {
    throw new Error(`Invalid test decimal: ${str}`);
  }
  const [, sign, intPart = '', frac1, frac2, expStr] = match;
  const fracPart = frac1 ?? frac2 ?? '';
  const digits = (intPart + fracPart).replace(/^0+/, '');
  if (!digits) return { v: 0n, s: 0 };
  const netExp = (expStr ? Number(expStr) : 0) - fracPart.length;
  let v;
  let s;
  if (netExp >= 0) {
    v = BigInt(digits) * (10n ** BigInt(netExp));
    s = 0;
  } else {
    v = BigInt(digits);
    s = -netExp;
  }
  return { v: sign === '-' ? -v : v, s };
}

function divHalfAway(n, d) {
  let neg = false;
  if (n < 0n) { neg = !neg; n = -n; }
  if (d < 0n) { neg = !neg; d = -d; }
  const q = n / d;
  const r = n % d;
  const out = r * 2n >= d ? q + 1n : q;
  return neg && out !== 0n ? -out : out;
}

function fmtDec({ v, s }, prec = s) {
  let scaled = v;
  if (s > prec) {
    scaled = divHalfAway(v, 10n ** BigInt(s - prec));
  } else if (s < prec) {
    scaled = v * (10n ** BigInt(prec - s));
  }
  if (scaled === 0n) return '0';
  const neg = scaled < 0n;
  const digits = (neg ? -scaled : scaled).toString();
  const prefix = neg ? '-' : '';
  if (prec === 0) return prefix + digits;
  const padded = digits.length <= prec ? digits.padStart(prec + 1, '0') : digits;
  const split = padded.length - prec;
  const intPart = padded.slice(0, split);
  const fracPart = padded.slice(split).replace(/0+$/, '');
  return fracPart ? `${prefix}${intPart}.${fracPart}` : `${prefix}${intPart}`;
}

function dAdd(a, b) {
  if (a.s === b.s) return { v: a.v + b.v, s: a.s };
  if (a.s > b.s) return { v: a.v + b.v * (10n ** BigInt(a.s - b.s)), s: a.s };
  return { v: a.v * (10n ** BigInt(b.s - a.s)) + b.v, s: b.s };
}

function dSub(a, b) {
  return dAdd(a, { v: -b.v, s: b.s });
}

function dMul(a, b) {
  return { v: a.v * b.v, s: a.s + b.s };
}

function dScale(a, k) {
  return { v: a.v * BigInt(k), s: a.s };
}

function dDiv(a, b, prec) {
  const shift = prec + b.s - a.s;
  const q = shift >= 0
    ? divHalfAway(a.v * (10n ** BigInt(shift)), b.v)
    : divHalfAway(a.v, b.v * (10n ** BigInt(-shift)));
  return { v: q, s: prec };
}

function dAbsSubStr(aStr, bStr) {
  const diff = dSub(parseExact(aStr), parseExact(bStr));
  return { v: diff.v < 0n ? -diff.v : diff.v, s: diff.s };
}

function dLessOrEqual(a, b) {
  const diff = dSub(a, b);
  return diff.v <= 0n;
}

/**
 * Computes exp(x) via BigInt Taylor series to `prec` decimal places.
 * Uses range reduction exp(x) = (exp(x / 2^m))^(2^m) so |x / 2^m| <= 0.25.
 */
function dExp(xDec, prec) {
  const work = prec + 12;
  const scale = 10n ** BigInt(work);
  // Convert xDec to fixed-point at `work`
  let xScaled = xDec.s <= work
    ? xDec.v * (10n ** BigInt(work - xDec.s))
    : divHalfAway(xDec.v, 10n ** BigInt(xDec.s - work));

  let halvings = 0;
  const threshold = scale / 4n;
  while ((xScaled < 0n ? -xScaled : xScaled) > threshold) {
    xScaled = divHalfAway(xScaled, 2n);
    halvings++;
  }

  let sum = scale;
  let term = scale;
  for (let n = 1; n < 500; n++) {
    term = divHalfAway(term * xScaled, scale * BigInt(n));
    if (term === 0n) break;
    sum += term;
  }

  for (let i = 0; i < halvings; i++) {
    sum = divHalfAway(sum * sum, scale);
  }

  return { v: divHalfAway(sum, 10n ** BigInt(work - prec)), s: prec };
}

/**
 * Computes sin(x) and cos(x) via BigInt Taylor series for moderate |x|.
 */
function dSinCos(xDec, prec) {
  const work = prec + 12;
  const scale = 10n ** BigInt(work);
  const xScaled = xDec.s <= work
    ? xDec.v * (10n ** BigInt(work - xDec.s))
    : divHalfAway(xDec.v, 10n ** BigInt(xDec.s - work));
  const x2 = divHalfAway(xScaled * xScaled, scale);

  let sinSum = xScaled;
  let sinTerm = xScaled;
  let cosSum = scale;
  let cosTerm = scale;

  for (let k = 1; k < 500; k++) {
    cosTerm = -divHalfAway(cosTerm * x2, scale * BigInt((2 * k - 1) * (2 * k)));
    sinTerm = -divHalfAway(sinTerm * x2, scale * BigInt((2 * k) * (2 * k + 1)));
    cosSum += cosTerm;
    sinSum += sinTerm;
    if (cosTerm === 0n && sinTerm === 0n) break;
  }

  const drop = 10n ** BigInt(work - prec);
  return {
    sin: { v: divHalfAway(sinSum, drop), s: prec },
    cos: { v: divHalfAway(cosSum, drop), s: prec },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('gradientDecimalIterative', () => {
  describe('normal cases (high-precision multivariable fields)', () => {
    it('computes 2D polynomial gradient at 25 and 35 decimal places beyond float64', () => {
      // f(x, y) = 3x^3*y - 2x*y^2 + 5x - 7y + 11
      // ∂f/∂x = 9x^2*y - 2y^2 + 5
      // ∂f/∂y = 3x^3 - 4xy - 7
      const f = ([xs, ys]) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        const x2 = dMul(x, x);
        const x3 = dMul(x2, x);
        const y2 = dMul(y, y);
        const t1 = dScale(dMul(x3, y), 3);
        const t2 = dScale(dMul(x, y2), -2);
        const t3 = dScale(x, 5);
        const t4 = dScale(y, -7);
        const t5 = { v: 11n, s: 0 };
        return fmtDec(dAdd(dAdd(dAdd(dAdd(t1, t2), t3), t4), t5));
      };

      const point = ['1.234567890123456789012345', '-0.987654321098765432109876'];
      const x = parseExact(point[0]);
      const y = parseExact(point[1]);
      const exactDx = dAdd(dAdd(dScale(dMul(dMul(x, x), y), 9), dScale(dMul(y, y), -2)), { v: 5n, s: 0 });
      const exactDy = dAdd(dAdd(dScale(dMul(dMul(x, x), x), 3), dScale(dMul(x, y), -4)), { v: -7n, s: 0 });

      for (const prec of [25, 35]) {
        const grad = gradientDecimalIterative(f, point, prec);
        assert.equal(grad.length, 2);
        assert.equal(grad[0], fmtDec(exactDx, prec));
        assert.equal(grad[1], fmtDec(exactDy, prec));
      }
    });

    it('computes 3D polynomial gradient at 25 decimal places', () => {
      // f(x, y, z) = x^2*y*z + y^3*z - 4x*z^2 + 2x*y - z
      // ∂f/∂x = 2xyz - 4z^2 + 2y
      // ∂f/∂y = x^2*z + 3y^2*z + 2x
      // ∂f/∂z = x^2*y + y^3 - 8xz - 1
      const f = ([xs, ys, zs]) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        const z = parseExact(zs);
        const x2 = dMul(x, x);
        const y2 = dMul(y, y);
        const y3 = dMul(y2, y);
        const z2 = dMul(z, z);
        const val = dAdd(
          dAdd(
            dAdd(dMul(dMul(x2, y), z), dMul(y3, z)),
            dAdd(dScale(dMul(x, z2), -4), dScale(dMul(x, y), 2))
          ),
          dScale(z, -1)
        );
        return fmtDec(val);
      };

      const point = ['1.3333333333333333333333333', '-2.25', '0.7142857142857142857142857'];
      const [x, y, z] = point.map(parseExact);
      const exactDx = dAdd(dAdd(dScale(dMul(dMul(x, y), z), 2), dScale(dMul(z, z), -4)), dScale(y, 2));
      const exactDy = dAdd(dAdd(dMul(dMul(x, x), z), dScale(dMul(dMul(y, y), z), 3)), dScale(x, 2));
      const exactDz = dAdd(dAdd(dMul(dMul(x, x), y), dMul(dMul(y, y), y)), dAdd(dScale(dMul(x, z), -8), { v: -1n, s: 0 }));

      const grad = gradientDecimalIterative(f, point, 25);
      assert.deepEqual(grad, [
        fmtDec(exactDx, 25),
        fmtDec(exactDy, 25),
        fmtDec(exactDz, 25),
      ]);
    });

    it('computes 2D rational scalar field gradient at 30 decimal places', () => {
      // f(x, y) = (x^2 + y) / (1 + x^2 + y^2)
      // Let D = 1 + x^2 + y^2, N = x^2 + y
      // ∂f/∂x = (2x*D - 2x*N) / D^2 = 2x*(1 + y^2 - y) / D^2
      // ∂f/∂y = (D - 2y*N) / D^2 = (1 + x^2 - y^2 - 2*x^2*y) / D^2
      const f = ([xs, ys], workPrec) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        const x2 = dMul(x, x);
        const y2 = dMul(y, y);
        const num = dAdd(x2, y);
        const den = dAdd(dAdd({ v: 1n, s: 0 }, x2), y2);
        return fmtDec(dDiv(num, den, workPrec + 2), workPrec + 2);
      };

      const point = ['1.25', '-0.75'];
      const x = parseExact(point[0]);
      const y = parseExact(point[1]);
      const x2 = dMul(x, x);
      const y2 = dMul(y, y);
      const D = dAdd(dAdd({ v: 1n, s: 0 }, x2), y2);
      const D2 = dMul(D, D);

      const numDx = dMul(dScale(x, 2), dSub(dAdd({ v: 1n, s: 0 }, y2), y));
      const numDy = dSub(dSub(dAdd({ v: 1n, s: 0 }, x2), y2), dScale(dMul(x2, y), 2));

      const grad = gradientDecimalIterative(f, point, 30);
      assert.deepEqual(grad, [
        fmtDec(dDiv(numDx, D2, 30), 30),
        fmtDec(dDiv(numDy, D2, 30), 30),
      ]);
    });

    it('computes 3D rational scalar field gradient at 25 decimal places', () => {
      // f(x, y, z) = (xy + yz + zx) / (x^2 + y^2 + z^2 + 1)
      // Let N = xy + yz + zx, D = x^2 + y^2 + z^2 + 1
      // ∂f/∂x = ((y + z)*D - 2x*N) / D^2
      // ∂f/∂y = ((x + z)*D - 2y*N) / D^2
      // ∂f/∂z = ((x + y)*D - 2z*N) / D^2
      const f = ([xs, ys, zs], workPrec) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        const z = parseExact(zs);
        const N = dAdd(dAdd(dMul(x, y), dMul(y, z)), dMul(z, x));
        const D = dAdd(dAdd(dAdd(dMul(x, x), dMul(y, y)), dMul(z, z)), { v: 1n, s: 0 });
        return fmtDec(dDiv(N, D, workPrec + 2), workPrec + 2);
      };

      const point = ['0.5', '-1.5', '2.25'];
      const [x, y, z] = point.map(parseExact);
      const N = dAdd(dAdd(dMul(x, y), dMul(y, z)), dMul(z, x));
      const D = dAdd(dAdd(dAdd(dMul(x, x), dMul(y, y)), dMul(z, z)), { v: 1n, s: 0 });
      const D2 = dMul(D, D);

      const expected = [
        fmtDec(dDiv(dSub(dMul(dAdd(y, z), D), dMul(dScale(x, 2), N)), D2, 25), 25),
        fmtDec(dDiv(dSub(dMul(dAdd(x, z), D), dMul(dScale(y, 2), N)), D2, 25), 25),
        fmtDec(dDiv(dSub(dMul(dAdd(x, y), D), dMul(dScale(z, 2), N)), D2, 25), 25),
      ];

      const grad = gradientDecimalIterative(f, point, 25);
      assert.deepEqual(grad, expected);
    });

    it('computes 30-digit gradient of transcendental scalar field exp(x) * cos(y)', () => {
      // f(x, y) = exp(x) * cos(y)
      // ∂f/∂x = exp(x) * cos(y)
      // ∂f/∂y = -exp(x) * sin(y)
      const f = ([xs, ys], workPrec) => {
        const ex = dExp(parseExact(xs), workPrec + 4);
        const { cos } = dSinCos(parseExact(ys), workPrec + 4);
        return fmtDec(dMul(ex, cos), workPrec + 2);
      };

      const point = ['0.7', '1.1'];
      const ex = dExp(parseExact(point[0]), 40);
      const { sin, cos } = dSinCos(parseExact(point[1]), 40);
      const expectedDx = fmtDec(dMul(ex, cos), 30);
      const expectedDy = fmtDec(dScale(dMul(ex, sin), -1), 30);

      const grad = gradientDecimalIterative(f, point, 30);
      assert.deepEqual(grad, [expectedDx, expectedDy]);
    });

    it('defaults precision to 20 decimal places when omitted', () => {
      // f(x) = 1 / (1 + x) => f'(x) = -1 / (1 + x)^2; at x = 2 => -1/9
      const f = ([xs], wp) => {
        const den = dAdd({ v: 1n, s: 0 }, parseExact(xs));
        return fmtDec(dDiv({ v: 1n, s: 0 }, den, wp + 2), wp + 2);
      };
      const grad = gradientDecimalIterative(f, ['2']);
      assert.deepEqual(grad, ['-0.11111111111111111111']);
    });

    it('accepts scientific notation, leading +, .5, 5., and custom options', () => {
      // f(x, y) = x^2 * y; grad = [2xy, x^2]
      const f = ([xs, ys]) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        return fmtDec(dMul(dMul(x, x), y));
      };
      const grad = gradientDecimalIterative(
        f,
        ['+1.5e-1', '-.5'],
        20,
        { initialStep: '1e-3', maxLevels: 10, tolerance: '1e-24', workPrecision: 35 }
      );
      // x = 0.15, y = -0.5 => 2xy = -0.15, x^2 = 0.0225
      assert.deepEqual(grad, ['-0.15', '0.0225']);
    });
  });

  describe('edge cases', () => {
    it('handles 1D scalar functions', () => {
      // f(x) = x^4 - 3x^2 + 2x => f'(x) = 4x^3 - 6x + 2
      const f = ([xs]) => {
        const x = parseExact(xs);
        const x2 = dMul(x, x);
        const x4 = dMul(x2, x2);
        return fmtDec(dAdd(dAdd(x4, dScale(x2, -3)), dScale(x, 2)));
      };
      // At x = 2: 4(8) - 6(2) + 2 = 22
      assert.deepEqual(gradientDecimalIterative(f, ['2'], 20), ['22']);
      // At x = -1.5: 4(-3.375) - 6(-1.5) + 2 = -13.5 + 9 + 2 = -2.5
      assert.deepEqual(gradientDecimalIterative(f, ['-1.5'], 20), ['-2.5']);
    });

    it('returns exact zero vector for constant scalar fields (never "-0")', () => {
      const constantField = () => '42.1234567890123456789012345';
      assert.deepEqual(gradientDecimalIterative(constantField, ['0', '0', '0'], 25), ['0', '0', '0']);
      assert.deepEqual(gradientDecimalIterative(constantField, ['-10.5', '3.25'], 0), ['0', '0']);
    });

    it('evaluates accurately at the origin (both zero and non-zero gradients)', () => {
      // Stationary point at origin: f(x, y) = x^2 + y^2 - x^4
      const bowl = ([xs, ys]) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        const x2 = dMul(x, x);
        const y2 = dMul(y, y);
        return fmtDec(dSub(dAdd(x2, y2), dMul(x2, x2)));
      };
      assert.deepEqual(gradientDecimalIterative(bowl, ['0', '0'], 25), ['0', '0']);

      // Non-zero gradient at origin: f(x, y, z) = 3x - 5y + 0.25z + x*y*z
      const tilted = ([xs, ys, zs]) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        const z = parseExact(zs);
        return fmtDec(
          dAdd(
            dAdd(dScale(x, 3), dScale(y, -5)),
            dAdd(dMul(z, parseExact('0.25')), dMul(dMul(x, y), z))
          )
        );
      };
      assert.deepEqual(gradientDecimalIterative(tilted, ['0', '0', '0'], 20), ['3', '-5', '0.25']);
    });

    it('normalizes tiny negative derivatives that round to zero as "0" (not "-0")', () => {
      // f(x) = -1e-25 * x => f'(x) = -1e-25, rounds to "0" at precision 20
      const tinyNeg = ([xs]) => fmtDec(dMul(parseExact('-1e-25'), parseExact(xs)));
      assert.deepEqual(gradientDecimalIterative(tinyNeg, ['0'], 20), ['0']);
      assert.deepEqual(gradientDecimalIterative(tinyNeg, ['0'], 0), ['0']);
    });

    it('supports precision = 0 with round-half-away-from-zero', () => {
      // f(x, y, z, w) = 2.5*x - 2.5*y + 3.49*z - 0.49*w
      const f = ([xs, ys, zs, ws]) => {
        const t1 = dMul(parseExact('2.5'), parseExact(xs));
        const t2 = dMul(parseExact('-2.5'), parseExact(ys));
        const t3 = dMul(parseExact('3.49'), parseExact(zs));
        const t4 = dMul(parseExact('-0.49'), parseExact(ws));
        return fmtDec(dAdd(dAdd(t1, t2), dAdd(t3, t4)));
      };
      assert.deepEqual(
        gradientDecimalIterative(f, ['1', '-1', '0', '2'], 0),
        ['3', '-3', '3', '0']
      );
    });

    it('maintains full accuracy at huge coordinate magnitudes where float64 fails', () => {
      // f(x) = x^2 at x = 10^25 => f'(x) = 2 * 10^25
      // In IEEE-754 float64, (1e25 + 1e-4) === 1e25, giving 0!
      const f = ([xs]) => {
        const x = parseExact(xs);
        return fmtDec(dMul(x, x));
      };
      const grad = gradientDecimalIterative(f, ['10000000000000000000000000'], 20);
      assert.deepEqual(grad, ['20000000000000000000000000']);
    });

    it('supports maxLevels = 1 (single central difference step)', () => {
      // Exact for quadratic polynomials
      const f = ([xs, ys]) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        return fmtDec(dAdd(dMul(x, x), dScale(dMul(y, y), 3)));
      };
      assert.deepEqual(
        gradientDecimalIterative(f, ['4', '-2'], 15, { maxLevels: 1 }),
        ['8', '-12']
      );
    });

    it('does not mutate caller point array even if fn mutates its coords argument', () => {
      const point = ['1.5', '-2.5'];
      const mutatingFn = (coords) => {
        const x = parseExact(coords[0]);
        const y = parseExact(coords[1]);
        coords[0] = '999999';
        coords.push('extra');
        return fmtDec(dAdd(dScale(x, 2), dScale(y, -3)));
      };
      const grad = gradientDecimalIterative(mutatingFn, point, 10);
      assert.deepEqual(grad, ['2', '-3']);
      assert.deepEqual(point, ['1.5', '-2.5']);
    });

    it('validates all inputs strictly and throws descriptive TypeError/RangeError', () => {
      const id = ([x]) => x;

      // Invalid fn
      assert.throws(() => gradientDecimalIterative(null, ['1']), TypeError);
      assert.throws(() => gradientDecimalIterative(123, ['1']), TypeError);
      assert.throws(() => gradientDecimalIterative('f', ['1']), TypeError);

      // Invalid point
      assert.throws(() => gradientDecimalIterative(id, null), TypeError);
      assert.throws(() => gradientDecimalIterative(id, '1'), TypeError);
      assert.throws(() => gradientDecimalIterative(id, {}), TypeError);
      assert.throws(() => gradientDecimalIterative(id, []), RangeError);
      assert.throws(() => gradientDecimalIterative(id, [1]), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['1', null]), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['']), RangeError);
      assert.throws(() => gradientDecimalIterative(id, [' 1 ']), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['abc']), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['NaN']), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['Infinity']), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1..2']), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1e']), RangeError);

      // Invalid precision
      assert.throws(() => gradientDecimalIterative(id, ['1'], '20'), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], -1), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 1.5), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], Number.NaN), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], Number.POSITIVE_INFINITY), RangeError);

      // Invalid options
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, null), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, []), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, 'opt'), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { initialStep: 0.01 }), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { initialStep: '0' }), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { initialStep: '-1e-4' }), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { initialStep: 'bad' }), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { maxLevels: '5' }), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { maxLevels: 0 }), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { maxLevels: 1.5 }), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { maxLevels: 101 }), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { tolerance: 1e-10 }), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { tolerance: '0' }), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { tolerance: '-1e-5' }), RangeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { workPrecision: '30' }), TypeError);
      assert.throws(() => gradientDecimalIterative(id, ['1'], 10, { workPrecision: -5 }), RangeError);

      // Invalid fn return values
      assert.throws(() => gradientDecimalIterative(() => 42, ['1'], 5), TypeError);
      assert.throws(() => gradientDecimalIterative(() => undefined, ['1'], 5), TypeError);
      assert.throws(() => gradientDecimalIterative(() => 'NaN', ['1'], 5), RangeError);
      assert.throws(() => gradientDecimalIterative(() => 'Infinity', ['1'], 5), RangeError);
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('satisfies directional derivative identity grad(f)·v ≈ (f(x+tv)-f(x-tv))/(2t)', () => {
      // 3D non-trivial rational field: f(x, y, z) = (x^3 + y*z + 1) / (1 + x^2 + 2y^2 + 3z^2)
      const f = ([xs, ys, zs], wp) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        const z = parseExact(zs);
        const num = dAdd(dAdd(dMul(dMul(x, x), x), dMul(y, z)), { v: 1n, s: 0 });
        const den = dAdd(
          dAdd({ v: 1n, s: 0 }, dMul(x, x)),
          dAdd(dScale(dMul(y, y), 2), dScale(dMul(z, z), 3))
        );
        return fmtDec(dDiv(num, den, wp + 4), wp + 4);
      };

      const point = ['0.8', '-1.2', '0.6'];
      const directions = [
        ['1', '2', '-1.5'],
        ['-0.3', '0.7', '0.9'],
        ['0.6', '0.8', '0'],
      ];

      const prec = 25;
      const grad = gradientDecimalIterative(f, point, prec);
      const t = parseExact('1e-10'); // Central difference error is O(t^2) ~ 1e-20

      for (const v of directions) {
        // Compute grad(f) · v
        let dot = { v: 0n, s: 0 };
        for (let i = 0; i < 3; i++) {
          dot = dAdd(dot, dMul(parseExact(grad[i]), parseExact(v[i])));
        }

        // Independent directional central difference: (f(x + t*v) - f(x - t*v)) / (2*t)
        const plusCoords = point.map((p, i) => fmtDec(dAdd(parseExact(p), dMul(t, parseExact(v[i])))));
        const minusCoords = point.map((p, i) => fmtDec(dSub(parseExact(p), dMul(t, parseExact(v[i])))));
        const fPlus = parseExact(f(plusCoords, 45));
        const fMinus = parseExact(f(minusCoords, 45));
        const dirDeriv = dDiv(dSub(fPlus, fMinus), dScale(t, 2), 30);

        const diff = dAbsSubStr(fmtDec(dot, 25), fmtDec(dirDeriv, 25));
        assert.ok(
          dLessOrEqual(diff, parseExact('1e-18')),
          `Directional derivative mismatch for v=${JSON.stringify(v)}: diff=${fmtDec(diff)}`
        );

        // Also cross-check via 1D gradient along g(s) = f(x + s*v) at s = 0 to full 25 digits!
        const gAlongV = ([ss], wp) => {
          const s = parseExact(ss);
          const shifted = point.map((p, i) => fmtDec(dAdd(parseExact(p), dMul(s, parseExact(v[i])))));
          return f(shifted, wp);
        };
        const [exactDirDeriv] = gradientDecimalIterative(gAlongV, ['0'], prec);
        const exactDiff = dAbsSubStr(fmtDec(dot, prec), exactDirDeriv);
        assert.ok(
          dLessOrEqual(exactDiff, parseExact('1e-24')),
          `High-precision directional derivative mismatch for v=${JSON.stringify(v)}: diff=${fmtDec(exactDiff)}`
        );
      }
    });

    it('satisfies linearity and product rule identities to 25 decimal places', () => {
      // f(x, y) = (x + 2y) / (1 + x^2 + y^2)
      // g(x, y) = x^2 - x*y + 3*y^2 + 1
      const f = ([xs, ys], wp) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        const num = dAdd(x, dScale(y, 2));
        const den = dAdd(dAdd({ v: 1n, s: 0 }, dMul(x, x)), dMul(y, y));
        return fmtDec(dDiv(num, den, wp + 4), wp + 4);
      };
      const g = ([xs, ys]) => {
        const x = parseExact(xs);
        const y = parseExact(ys);
        return fmtDec(
          dAdd(
            dSub(dMul(x, x), dMul(x, y)),
            dAdd(dScale(dMul(y, y), 3), { v: 1n, s: 0 })
          )
        );
      };

      const alpha = parseExact('2.75');
      const beta = parseExact('-1.4');
      const linComb = (coords, wp) => {
        const fv = parseExact(f(coords, wp));
        const gv = parseExact(g(coords, wp));
        return fmtDec(dAdd(dMul(alpha, fv), dMul(beta, gv)), wp + 2);
      };
      const prod = (coords, wp) => {
        const fv = parseExact(f(coords, wp));
        const gv = parseExact(g(coords, wp));
        return fmtDec(dMul(fv, gv), wp + 2);
      };

      const point = ['0.75', '-1.25'];
      const prec = 25;

      const gradF = gradientDecimalIterative(f, point, prec + 4);
      const gradG = gradientDecimalIterative(g, point, prec + 4);
      const gradLin = gradientDecimalIterative(linComb, point, prec);
      const gradProd = gradientDecimalIterative(prod, point, prec);

      const fAtP = parseExact(f(point, prec + 8));
      const gAtP = parseExact(g(point, prec + 8));

      for (let i = 0; i < 2; i++) {
        // Linearity: ∇(αf + βg) = α∇f + β∇g
        const expectedLin = fmtDec(
          dAdd(dMul(alpha, parseExact(gradF[i])), dMul(beta, parseExact(gradG[i]))),
          prec
        );
        assert.equal(gradLin[i], expectedLin);

        // Product rule: ∇(f*g) = g*∇f + f*∇g
        const expectedProd = fmtDec(
          dAdd(dMul(gAtP, parseExact(gradF[i])), dMul(fAtP, parseExact(gradG[i]))),
          prec
        );
        assert.equal(gradProd[i], expectedProd);
      }
    });
  });
});
