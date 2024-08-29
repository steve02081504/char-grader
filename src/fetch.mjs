class exResponse extends Response {
	constructor() {}
	/**
	 * Reads the response body and returns it as a Uint8Array.
	 *
	 * @return {Promise<Uint8Array>} The response body as a Uint8Array.
	 */
	async buffer() {
		const reader = this.body.getReader()
		let buffer = []

		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer = buffer.concat([...value])
		}

		return new Uint8Array(buffer)
	}
}

/**
 * Sends a request and returns a response with a modified prototype.
 *
 * @param {string|URL|Request} input - The URL or request to fetch.
 * @param {RequestInit} [init] - Optional request initialization options.
 * @return {Promise<exResponse>} A response object with the exResponse prototype.
 */
let exfetch = async (input, init) => Object.setPrototypeOf(await fetch(input, init), exResponse.prototype)

/**
 * Sends a no-cors request and returns a response with a modified prototype.
 *
 * @param {string|URL|Request} input - The URL or request to fetch.
 * @param {RequestInit} [init] - Optional request initialization options.
 * @return {Promise<exResponse>} A response object with the exResponse prototype.
 */
exfetch.noCors = (input, init) => exfetch(input,init).catch(
	_ => exfetch(`https://nocors.steve02081504.workers.dev/?${input}`, init)
)

export default exfetch
