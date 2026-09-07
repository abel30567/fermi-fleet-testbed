export function add(a, b) {
	return a + b
}

export function directionalDerivativeN(f, point, dir, h = 1e-5) {
	const norm = Math.sqrt(dir.reduce((sum, d) => sum + d * d, 0))
	if (norm === 0) {
		throw new RangeError('direction vector must not be zero')
	}
	const unit = dir.map((d) => d / norm)
	const forward = point.map((p, i) => p + h * unit[i])
	const backward = point.map((p, i) => p - h * unit[i])
	return (f(forward) - f(backward)) / (2 * h)
}
