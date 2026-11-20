export function add(a, b) {
	return a + b
}

export function polarToCartesian(r, theta) {
	const x = r * Math.cos(theta)
	const y = r * Math.sin(theta)
	return [x === 0 ? 0 : x, y === 0 ? 0 : y]
}
