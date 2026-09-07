export function add(a, b) {
	return a + b
}

export function limit(f, x, h = 1e-6) {
	const left = f(x - h)
	const right = f(x + h)
	if (!isFinite(left) || !isFinite(right)) return NaN
	if (Math.abs(left - right) > 1e-4) return NaN
	return (left + right) / 2
}
