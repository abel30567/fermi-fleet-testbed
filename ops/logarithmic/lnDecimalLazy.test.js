import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lnDecimalLazy } from './lnDecimalLazy.js';

// Known high-precision reference constants (100 fractional digits, correctly rounded):
const LN2_100 =
  '0.6931471805599453094172321214581765680755001343602552541206800094933936219696947156058633269964186875';
const LN10_100 =
  '2.3025850929940456840179914546843642076011014886287729760333279009675726096773524802359972050895982983';
const E_70 =
  '2.7182818284590452353602874713526624977572470936999595749669676277240766';

/**
 * Helper: parse a fixed-point decimal string with `precision` fractional digits
 * into an exact scaled BigInt for independent algebraic cross-checks.
 *
 * @param {string} s
 * @param {number} precision
 * @returns {bigint}
 */
function parseScaled(s, precision) {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [intPart, fracPart = ''] = body.split('.');
  assert.equal(fracPart.length, precision, `expected ${precision} fractional digits in "${s}"`);
  const val = BigInt(intPart + fracPart);
  return neg ? -val : val;
}

describe('lnDecimalLazy', () => {
  describe('normal cases and input formats', () => {
    it('computes ln for standard positive decimal strings with default precision (20)', () => {
      const results = [...lnDecimalLazy(['1', '2', '10', '0.5', '100'])];
      assert.deepEqual(results, [
        '0.00000000000000000000',
        '0.69314718055994530942',
        '2.30258509299404568402',
        '-0.69314718055994530942',
        '4.60517018598809136804',
      ]);
    });

    it('supports single decimal string input without iterating characters', () => {
      const gen = lnDecimalLazy('2.5', 15);
      assert.equal(typeof gen.next, 'function');
      assert.deepEqual([...gen], ['0.916290731874155']);
    });

    it('supports scientific notation, leading +, surrounding whitespace, and shorthand decimals', () => {
      const inputs = ['+2', '  10  ', '.5', '1.', '1e2', '1E-2', '2.5e+0'];
      const results = [...lnDecimalLazy(inputs, 10)];
      assert.deepEqual(results, [
        '0.6931471806',
        '2.3025850930',
        '-0.6931471806',
        '0.0000000000',
        '4.6051701860',
        '-4.6051701860',
        '0.9162907319',
      ]);
    });

    it('supports configurable precision including 0, small, and large precisions', () => {
      assert.deepEqual([...lnDecimalLazy(['1', '2', '10', '0.5'], 0)], ['0', '1', '2', '-1']);
      assert.deepEqual([...lnDecimalLazy(['2'], 5)], ['0.69315']);
      assert.deepEqual([...lnDecimalLazy(['2'], 50)], [
        '0.69314718055994530941723212145817656807550013436026',
      ]);
    });

    it('accepts diverse iterable types (Set, generator, custom iterable, empty iterable)', () => {
      assert.deepEqual([...lnDecimalLazy([], 10)], []);
      assert.deepEqual([...lnDecimalLazy(new Set(['1', '2']), 8)], ['0.00000000', '0.69314718']);

      const customIterable = {
        [Symbol.iterator]() {
          const items = ['1', '10'];
          let idx = 0;
          return {
            next() {
              return idx < items.length
                ? { value: items[idx++], done: false }
                : { value: undefined, done: true };
            },
          };
        },
      };
      assert.deepEqual([...lnDecimalLazy(customIterable, 6)], ['0.000000', '2.302585']);
    });
  });

  describe('edge cases', () => {
    it('returns exact zero for ln(1) across representations without negative zero', () => {
      const ones = ['1', '1.0', '1.000000000000000000000000', '+1', '1e0', '0.1e1', '10e-1'];
      const results = [...lnDecimalLazy(ones, 25)];
      for (const r of results) {
        assert.equal(r, '0.0000000000000000000000000');
      }
      // Values slightly below 1 that round to 0 must not produce "-0.00..."
      const [nearOneBelow] = [...lnDecimalLazy(['0.999999999999999999999999999999'], 10)];
      assert.equal(nearOneBelow, '0.0000000000');
    });

    it('computes ln(e) = 1 to high precision', () => {
      const [lnE] = [...lnDecimalLazy([E_70], 60)];
      assert.equal(lnE, `1.${'0'.repeat(60)}`);
    });

    it('computes ln(2) and ln(10) accurately to 100 decimal places', () => {
      const [ln2, ln10] = [...lnDecimalLazy(['2', '10'], 100)];
      assert.equal(ln2, LN2_100);
      assert.equal(ln10, LN10_100);
    });

    it('handles extreme magnitudes via exponent reduction without memory blowup', () => {
      const [lnBig, lnTiny] = [...lnDecimalLazy(['1e1000', '1e-1000'], 30)];
      // 1000 * ln(10) = 2302.585092994045684017991454684364...
      const expected = '2302.585092994045684017991454684364';
      assert.equal(lnBig, expected);
      assert.equal(lnTiny, `-${expected}`);
    });

    it('handles inputs very close to 1 accurately', () => {
      // ln(1 + 1e-12) = 1e-12 - 0.5e-24 + (1/3)e-36 - ...
      const [val] = [...lnDecimalLazy(['1.000000000001'], 35)];
      assert.equal(val, '0.00000000000099999999999950000000000');
    });
  });

  describe('input validation and error handling', () => {
    it('rejects non-iterable inputs and invalid precision synchronously', () => {
      for (const badInputs of [null, undefined, 42, {}, true, 10n]) {
        assert.throws(() => lnDecimalLazy(badInputs), TypeError);
      }
      for (const badType of ['20', null, {}, 20n, true]) {
        assert.throws(() => lnDecimalLazy(['2'], badType), TypeError);
      }
      for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity]) {
        assert.throws(() => lnDecimalLazy(['2'], badRange), RangeError);
      }
    });

    it('rejects zero and negative decimal inputs with RangeError', () => {
      const nonPositive = ['0', '0.0', '-0', '-0.0', '0e100', '-1', '-0.0000001', '-1e-50', '-2.718'];
      for (const bad of nonPositive) {
        const gen = lnDecimalLazy([bad], 10);
        assert.throws(() => gen.next(), RangeError, `expected RangeError for "${bad}"`);
      }
    });

    it('rejects malformed decimal strings and non-string sequence elements', () => {
      for (const malformed of ['', '   ', '.', '+', '-', 'e5', '1e', '1.2.3', 'abc', 'NaN', 'Infinity', '0x10', '1_000']) {
        const gen = lnDecimalLazy([malformed], 10);
        assert.throws(() => gen.next(), RangeError, `expected RangeError for "${malformed}"`);
      }
      for (const nonString of [2, null, undefined, 2n, {}]) {
        const gen = lnDecimalLazy([nonString], 10);
        assert.throws(() => gen.next(), TypeError);
      }
    });
  });

  describe('lazy streaming consumption', () => {
    it('consumes infinite iterables lazily one item at a time and cleans up on early exit', () => {
      let produced = 0;
      let cleanedUp = false;

      function* infinitePowersOfTen() {
        try {
          for (let exp = 0; ; exp++) {
            produced++;
            yield `1e${exp}`;
          }
        } finally {
          cleanedUp = true;
        }
      }

      const stream = lnDecimalLazy(infinitePowersOfTen(), 10);
      // Nothing pulled before first .next()
      assert.equal(produced, 0);

      const collected = [];
      for (const val of stream) {
        collected.push(val);
        assert.equal(produced, collected.length);
        if (collected.length === 3) break;
      }

      assert.equal(produced, 3);
      assert.equal(cleanedUp, true);
      assert.deepEqual(collected, ['0.0000000000', '2.3025850930', '4.6051701860']);
    });

    it('evaluates and validates items lazily without touching subsequent items', () => {
      let pulls = 0;
      function* sequenceWithLaterError() {
        pulls++;
        yield '1';
        pulls++;
        yield '-5';
        pulls++;
        yield '2';
      }

      const gen = lnDecimalLazy(sequenceWithLaterError(), 6);
      assert.equal(pulls, 0);

      const first = gen.next();
      assert.deepEqual(first, { value: '0.000000', done: false });
      assert.equal(pulls, 1);

      assert.throws(() => gen.next(), RangeError);
      assert.equal(pulls, 2);
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('satisfies product rule ln(a * b) = ln(a) + ln(b) at 60-digit precision', () => {
      const precision = 60;
      const pairs = [
        ['3', '7', '21'],
        ['1.25', '0.8', '1'],
        ['123456789', '987654321', '121932631112635269'],
        ['0.00037', '2700', '0.999'],
        ['3.14159265358979323846', '2', '6.28318530717958647692'],
      ];

      for (const [a, b, ab] of pairs) {
        const [lnA, lnB, lnAB] = [...lnDecimalLazy([a, b, ab], precision)];
        const diff = parseScaled(lnA, precision) + parseScaled(lnB, precision) - parseScaled(lnAB, precision);
        assert.ok(
          diff >= -1n && diff <= 1n,
          `ln(${a}) + ln(${b}) vs ln(${ab}) differed by ${diff} ulp`,
        );
      }
    });

    it('satisfies power rule ln(a^n) = n * ln(a) and reciprocal rule ln(1/x) = -ln(x)', () => {
      const precision = 50;
      const [ln2, ln1024, ln3, ln243] = [...lnDecimalLazy(['2', '1024', '3', '243'], precision)];

      const diffPow2 = parseScaled(ln1024, precision) - 10n * parseScaled(ln2, precision);
      assert.ok(diffPow2 >= -5n && diffPow2 <= 5n, `ln(1024) vs 10*ln(2) differed by ${diffPow2} ulp`);

      const diffPow3 = parseScaled(ln243, precision) - 5n * parseScaled(ln3, precision);
      assert.ok(diffPow3 >= -3n && diffPow3 <= 3n, `ln(243) vs 5*ln(3) differed by ${diffPow3} ulp`);

      const [ln8, lnEighth, ln25, lnTwentyFifth] = [
        ...lnDecimalLazy(['8', '0.125', '25', '0.04'], precision),
      ];
      assert.equal(lnEighth, `-${ln8}`);
      assert.equal(lnTwentyFifth, `-${ln25}`);
    });

    it('matches independent Mercator series for ln(1 + h) = sum (-1)^(k+1) h^k / k', () => {
      const precision = 40;
      const [actual] = [...lnDecimalLazy(['1.001'], precision)];

      // Independent computation using Mercator series with h = 1/1000 at 55 digits
      const workScale = 10n ** 55n;
      let sum = 0n;
      let power = workScale / 1000n;
      for (let k = 1n; power > 0n; k++) {
        const term = power / k;
        if (term === 0n) break;
        sum += k % 2n === 1n ? term : -term;
        power /= 1000n;
      }
      const factor = 10n ** 15n;
      const rounded = (sum + factor / 2n) / factor;
      const expected = `0.${rounded.toString().padStart(precision, '0')}`;

      assert.equal(actual, expected);
    });
  });
});
