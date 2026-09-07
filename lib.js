export function add(a, b) {
	return a + b
}

export function cartesianToPolar(x, y) {
	const r = Math.sqrt(x * x + y * y)
	const theta = Math.atan2(y, x)
	return [r, theta]
}
