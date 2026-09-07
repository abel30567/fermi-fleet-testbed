export function add(a, b) {
	return a + b
}

// Seeded linear congruential generator (Numerical Recipes constants) for reproducible sampling.
function makeLcg(seed) {
	let state = seed >>> 0
	return function next() {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 4294967296
	}
}

export function monteCarloDouble(f, ax, bx, ay, by, samples = 200000, seed) {
	const rand = seed === undefined ? Math.random : makeLcg(seed)
	const area = (bx - ax) * (by - ay)
	let sum = 0
	for (let i = 0; i < samples; i++) {
		const x = ax + rand() * (bx - ax)
		const y = ay + rand() * (by - ay)
		sum += f(x, y)
	}
	return (sum / samples) * area
}
