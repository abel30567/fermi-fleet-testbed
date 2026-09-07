export function add(a, b) {
	return a + b
}

export function cartesianToCylindrical(x, y, z) {
	const r = Math.sqrt(x * x + y * y)
	const theta = Math.atan2(y, x)
	return [r, theta, z]
}
