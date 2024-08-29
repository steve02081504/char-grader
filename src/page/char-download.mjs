// from https://github.com/SillyTavern/SillyTavern
// license as AGPL-3.0 license

let sanitize = x => x // no.
import { write } from '../character-card-parser.mjs'
import fetch from '../fetch.mjs'

async function downloadChubCharacter(id) {
	const result = await fetch('https://api.chub.ai/api/characters/download', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			'format': 'tavern',
			'fullPath': id,
		}),
	})

	if (!result.ok) {
		const text = await result.text()
		console.log('Chub returned error', result.statusText, text)
		throw new Error('Failed to download character')
	}

	const buffer = await result.buffer()
	const fileName = result.headers.get('content-disposition')?.split('filename=')[1] || `${sanitize(id)}.png`
	const fileType = result.headers.get('content-type')

	return { buffer, fileName, fileType }
}

/**
 * Downloads a character card from the Pygsite.
 * @param {string} id UUID of the character
 * @returns {Promise<{buffer: Uint8Array, fileName: string, fileType: string}>}
 */
async function downloadPygmalionCharacter(id) {
	const result = await fetch(`https://server.pygmalion.chat/api/export/character/${id}/v2`)

	if (!result.ok) {
		const text = await result.text()
		console.log('Pygsite returned error', result.status, text)
		throw new Error('Failed to download character')
	}

	const jsonData = await result.json()
	const characterData = jsonData?.character

	if (!characterData || typeof characterData !== 'object') {
		console.error('Pygsite returned invalid character data', jsonData)
		throw new Error('Failed to download character')
	}

	try {
		const avatarUrl = characterData?.data?.avatar

		if (!avatarUrl) {
			console.error('Pygsite character does not have an avatar', characterData)
			throw new Error('Failed to download avatar')
		}

		const avatarResult = await fetch(avatarUrl)
		const avatarBuffer = await avatarResult.buffer()

		const cardBuffer = write(avatarBuffer, JSON.stringify(characterData))

		return {
			buffer: cardBuffer,
			fileName: `${sanitize(id)}.png`,
			fileType: 'image/png',
		}
	} catch (e) {
		console.error('Failed to download avatar, using JSON instead', e)
		return {
			buffer: Buffer.from(JSON.stringify(jsonData)),
			fileName: `${sanitize(id)}.json`,
			fileType: 'application/json',
		}
	}
}

/**
 *
 * @param {String} str
 * @returns { { id: string, type: "character" | "lorebook" } | null }
 */
function parseChubUrl(str) {
	const splitStr = str.split('/')
	const length = splitStr.length

	if (length < 2)
		return null


	let domainIndex = -1

	splitStr.forEach((part, index) => {
		if (part === 'www.chub.ai' || part === 'chub.ai' || part === 'www.characterhub.org' || part === 'characterhub.org')
			domainIndex = index
	})

	const lastTwo = domainIndex !== -1 ? splitStr.slice(domainIndex + 1) : splitStr

	const firstPart = lastTwo[0].toLowerCase()

	if (firstPart === 'characters' || firstPart === 'lorebooks') {
		const type = firstPart === 'characters' ? 'character' : 'lorebook'
		const id = type === 'character' ? lastTwo.slice(1).join('/') : lastTwo.join('/')
		return {
			id: id,
			type: type,
		}
	} else if (length === 2)
		return {
			id: lastTwo.join('/'),
			type: 'character',
		}


	return null
}

// Warning: Some characters might not exist in JannyAI.me
async function downloadJannyCharacter(uuid) {
	// This endpoint is being guarded behind Bot Fight Mode of Cloudflare
	// So hosted ST on Azure/AWS/GCP/Collab might get blocked by IP
	// Should work normally on self-host PC/Android
	const result = await fetch('https://api.jannyai.com/api/v1/download', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			'characterId': uuid,
		}),
	})

	if (result.ok) {
		const downloadResult = await result.json()
		if (downloadResult.status === 'ok') {
			const imageResult = await fetch(downloadResult.downloadUrl)
			const buffer = await imageResult.buffer()
			const fileName = `${sanitize(uuid)}.png`
			const fileType = imageResult.headers.get('content-type')

			return { buffer, fileName, fileType }
		}
	}

	console.log('Janny returned error', result.statusText, await result.text())
	throw new Error('Failed to download character')
}

//Download Character Cards from AICharactersCards.com (AICC) API.
async function downloadAICCCharacter(id) {
	const apiURL = `https://aicharactercards.com/wp-json/pngapi/v1/image/${id}`
	try {
		const response = await fetch(apiURL)
		if (!response.ok)
			throw new Error(`Failed to download character: ${response.statusText}`)


		const contentType = response.headers.get('content-type') || 'image/png' // Default to 'image/png' if header is missing
		const buffer = await response.buffer()
		const fileName = `${sanitize(id)}.png` // Assuming PNG, but adjust based on actual content or headers

		return {
			buffer: buffer,
			fileName: fileName,
			fileType: contentType,
		}
	} catch (error) {
		console.error('Error downloading character:', error)
		throw error
	}
}

/**
 * Parses an aicharactercards URL to extract the path.
 * @param {string} url URL to parse
 * @returns {string | null} AICC path
 */
function parseAICC(url) {
	const pattern = /^https?:\/\/aicharactercards\.com\/character-cards\/([^/]+)\/([^/]+)\/?$|([^/]+)\/([^/]+)$/
	const match = url.match(pattern)
	if (match)
		// Match group 1 & 2 for full URL, 3 & 4 for relative path
		return match[1] && match[2] ? `${match[1]}/${match[2]}` : `${match[3]}/${match[4]}`

	return null
}

/**
 * Download character card from generic url.
 * @param {String} url
 */
async function downloadGenericPng(url) {
	try {
		const result = await fetch.noCors(url)

		if (result.ok) {
			const buffer = await result.buffer()
			const fileName = sanitize(result.url.split('?')[0].split('/').reverse()[0])
			const contentType = result.headers.get('content-type') || 'image/png' //yoink it from AICC function lol

			return {
				buffer: buffer,
				fileName: fileName,
				fileType: contentType,
			}
		}
	} catch (error) {
		console.error('Error downloading file: ', error)
		throw error
	}
	return null
}

/**
 * Parse Risu Realm URL to extract the UUID.
 * @param {string} url Risu Realm URL
 * @returns {string | null} UUID of the character
 */
function parseRisuUrl(url) {
	// Example: https://realm.risuai.net/character/7adb0ed8d81855c820b3506980fb40f054ceef010ff0c4bab73730c0ebe92279
	// or https://realm.risuai.net/character/7adb0ed8-d818-55c8-20b3-506980fb40f0
	const pattern = /^https?:\/\/realm\.risuai\.net\/character\/([a-f0-9-]+)\/?$/i
	const match = url.match(pattern)
	return match ? match[1] : null
}

/**
 * Download RisuAI character card
 * @param {string} uuid UUID of the character
 * @returns {Promise<{buffer: Uint8Array, fileName: string, fileType: string}>}
 */
async function downloadRisuCharacter(uuid) {
	const result = await fetch.noCors(`https://realm.risuai.net/api/v1/download/png-v3/${uuid}?non_commercial=true`)

	if (!result.ok) {
		const text = await result.text()
		console.log('RisuAI returned error', result.statusText, text)
		throw new Error('Failed to download character')
	}

	const buffer = await result.buffer()
	const fileName = `${sanitize(uuid)}.png`
	const fileType = 'image/png'

	return { buffer, fileName, fileType }
}

/**
* @param {String} url
* @returns {String | null } UUID of the character
*/
function getUuidFromUrl(url) {
	// Extract UUID from URL
	const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/
	const matches = url.match(uuidRegex)

	// Check if UUID is found
	const uuid = matches ? matches[0] : null
	return uuid
}

/**
 * Filter to get the domain host of a url instead of a blanket string search.
 * @param {String} url URL to strip
 * @returns {String} Domain name
 */
function getHostFromUrl(url) {
	try {
		const urlObj = new URL(url)
		return urlObj.hostname
	} catch {
		return ''
	}
}

// rocard.ai
async function downloadRocardCharacter(id) {
	let result = await fetch('https://api.rochathub.com/rocard.tavern.v1.TavernService/DownloadTavern', {
		method: 'POST',
		body: JSON.stringify({
			tavernId: id
		}),
		headers: {
			'content-type': 'application/json'
		}
	})

	let check = async _ => {
		if (!result.ok) {
			const text = await result.text()
			console.log('Rocard returned error', result.statusText, text)
			throw new Error('Failed to download character')
		}
	}
	await check()

	const json = await result.json()
	result = await fetch(json.downloadUrl)
	await check()

	const buffer = await result.buffer()
	const fileName = `${sanitize(id)}.png`
	const fileType = result.headers.get('content-type') || 'image/png'

	return { buffer, fileName, fileType }
}

function parseRocardUrl(url) {
	// https://rocard.ai/t/114514
	const pattern = /^https?:\/\/rocard\.ai\/t\/(\d+)\/?$/i
	const match = url.match(pattern)
	return match ? match[1] : null
}

async function downloadGithubCharacter(id) {
	const result = await fetch(`https://api.github.com/repos/${id}/releases/latest`)

	if (!result.ok) {
		const text = await result.text()
		console.log('GitHub returned error', result.statusText, text)
		throw new Error('Failed to download character')
	}

	const json = await result.json()
	const assets = json.assets
	let content_type_list = [ // png/jpg/apng/json/zip/exe
		'image/png', 'image/jpeg', 'image/apng', 'application/json', 'application/zip', 'application/x-msdownload'
	]
	for (const type of content_type_list) {
		let asset = assets.filter(asset => asset.content_type == type)?.[0]
		if (asset) {
			const buffer = await (await fetch.noCors(asset.browser_download_url)).buffer()
			const fileName = asset.name
			const fileType = type
			return { buffer, fileName, fileType }
		}
	}

	throw new Error('Failed to download character')
}
function parseGithubUrl(url) {
	const pattern = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i
	const match = url.match(pattern)
	if (!match) return null
	const [, owner, repo] = match
	return `${owner}/${repo}`
}

export async function downloadCharacter(url) {
	const host = getHostFromUrl(url)
	/** @type {{ buffer: Uint8Array, fileName: string, fileType: string }} */
	let result
	let type

	const isChub = host.includes('chub.ai') || host.includes('characterhub.org')
	const isJannnyContent = host.includes('janitorai')
	const isPygmalionContent = host.includes('pygmalion.chat')
	const isAICharacterCardsContent = host.includes('aicharactercards.com')
	const isRisu = host.includes('realm.risuai.net')
	const isRocard = host.includes('rocard.ai')
	const isGitHub = host.includes('github.com')

	if (isPygmalionContent) {
		const uuid = getUuidFromUrl(url)
		if (!uuid)
			throw new Error('Not found')


		type = 'character'
		result = await downloadPygmalionCharacter(uuid)
	}
	else if (isJannnyContent) {
		const uuid = getUuidFromUrl(url)
		if (!uuid)
			throw new Error('Not found')


		type = 'character'
		result = await downloadJannyCharacter(uuid)
	}
	else if (isAICharacterCardsContent) {
		const AICCParsed = parseAICC(url)
		if (!AICCParsed)
			throw new Error('Not found')

		type = 'character'
		result = await downloadAICCCharacter(AICCParsed)
	}
	else if (isChub) {
		const chubParsed = parseChubUrl(url)
		type = chubParsed?.type

		if (chubParsed?.type === 'character') {
			console.log('Downloading chub character:', chubParsed.id)
			result = await downloadChubCharacter(chubParsed.id)
		}
		else if (chubParsed?.type === 'lorebook') {
			console.log('Downloading chub lorebook:', chubParsed.id)
			result = await downloadChubLorebook(chubParsed.id)
		}
	}
	else if (isRisu) {
		const uuid = parseRisuUrl(url)
		if (!uuid)
			throw new Error('Not found')


		type = 'character'
		result = await downloadRisuCharacter(uuid)
	}
	else if (isRocard) {
		const id = parseRocardUrl(url)
		if (!id)
			throw new Error('Not found')

		type = 'character'
		result = await downloadRocardCharacter(id)
	}
	else if (isGitHub) {
		const id = parseGithubUrl(url)
		if (!id)
			throw new Error('Not found')

		type = 'character'
		result = await downloadGithubCharacter(id)
	}
	else {
		console.log('Downloading from generic url.')
		type = 'character'
		result = await downloadGenericPng(url)
	}

	if (!result)
		throw new Error('Not found')

	return { ...result, type }
}


export function getCharacterSource(charData) {
	if (!charData) return ''
	const chubId = charData?.data?.extensions?.chub?.full_path
	if (chubId)
		return `https://chub.ai/characters/${chubId}`

	const pygmalionId = charData?.data?.extensions?.pygmalion_id
	if (pygmalionId)
		return `https://pygmalion.chat/${pygmalionId}`

	const githubRepo = charData?.data?.extensions?.github_repo
	if (githubRepo)
		return `https://github.com/${githubRepo}`

	const sourceUrl = charData?.data?.extensions?.source_url
	if (sourceUrl)
		return sourceUrl

	const risuId = charData?.data?.extensions?.risuai?.source
	if (Array.isArray(risuId) && risuId.length && typeof risuId[0] === 'string' && risuId[0].startsWith('risurealm:')) {
		const realmId = risuId[0].split(':')[1]
		return `https://realm.risuai.net/character/${realmId}`
	}

	return ''
}
