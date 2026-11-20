export function add(a, b) {
	return a + b
}

export function curveSpeed(r, t, h = 1e-6) {
	if (typeof r !== 'function') {
		throw new TypeError('r must be a function')
	}
	if (typeof t !== 'number' || !Number.isFinite(t)) {
		throw new TypeError('t must be a finite number')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}
	const pPlus = r(t + h)
	const pMinus = r(t - h)
	if (
		(!Array.isArray(pPlus) && !ArrayBuffer.isView(pPlus)) ||
		(!Array.isArray(pMinus) && !ArrayBuffer.isView(pMinus))
	) {
		throw new TypeError('r(t) must return an array of numbers')
	}
	const n = pPlus.length
	if (pMinus.length !== n) {
		throw new RangeError('r(t + h) and r(t - h) must have the same dimension')
	}
	if (n === 0) return 0
	const denom = 2 * h
	const deriv = new Array(n)
	let maxAbs = 0
	for (let i = 0; i < n; i++) {
		const a = pPlus[i]
		const b = pMinus[i]
		if (
			typeof a !== 'number' ||
			typeof b !== 'number' ||
			!Number.isFinite(a) ||
			!Number.isFinite(b)
		) {
			throw new TypeError('Curve coordinates must be finite numbers')
		}
		const d = (a - b) / denom
		deriv[i] = d
		const absD = Math.abs(d)
		if (absD > maxAbs) maxAbs = absD
	}
	if (maxAbs === 0) return 0
	let sumSq = 0
	for (let i = 0; i < n; i++) {
		const scaled = deriv[i] / maxAbs
		sumSq += scaled * scaled
	}
	return maxAbs * Math.sqrt(sumSq)
}
