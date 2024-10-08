import { char_grader } from '../char_grader.mjs'
import { write } from '../character-card-parser.mjs'
import { encoder } from '../get_token_size.mjs'
import { downloadCharacter, getCharacterSource } from './char-download.mjs'
import { extractPngsFromRar } from './rar.mjs'
import { extractPngsFromZip } from './zip.mjs'
import { Buffer } from 'buffer'
import { Converter } from 'showdown'

let tokenized_text_switch = document.getElementById('tokenized_text_switch')
let data_view_lines = []
var fullscreenElement = document.getElementById('fullscreen-div')
var logsElement = document.getElementById('logs')
var scoreElement = document.getElementById('score')
var imageElement = document.getElementById('image')
var readmeElement = document.getElementById('cardReadme')
var contentViewTextElement = document.getElementById('content_text')
var contentViewElement = document.getElementById('content_view')
var shareCardButton = document.getElementById('copy-link')
var converter = new Converter({
	strikethrough: true,
	tables: true,
	tasklists: true,
	openLinksInNewWindows: true,
	underline: true,
	simpleLineBreaks: true,
	emoji: true,
	disableForced4SpacesIndentedSublists: true,
})

let common_passwords = [
	null,
	'password',
	'dgsm',
	'DGSM',
	'hshwk',
	'114514',
	'1919810',
	'45450721',
	'domsubntr',
	'类脑ΟΔΥΣΣΕΙΑ',
	'DOTA2',
	'666',
	'159',
	'123',
	'1234',
	'123456',
	'12345678',
]
/**
 * Handles the file selection event, loading the selected files and processing their contents.
 *
 * @param {Event} event - The file selection event.
 * @return {Promise<void>} A promise that resolves when the file selection has been handled.
 */
export async function handleFileSelect(event) {
	for (let file of event.target.files)
		if (await loadFile(file, file.type)) return
	if (event.target.getData) {
		let urls = event.target.getData('text/uri-list')
		for (let url of urls.split('\n'))
			if (url && await fetchAndProcessFile(url)) return
		let text = event.target.getData('text/plain')
		if (text && await fetchAndProcessFile(text)) return
		alert('Not a supported drop format: ' + event.target.types.join(', ') + '.')
	}
}

let packing_flag
function setLocationSearch(newSearch) {
	let newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname + newSearch
	window.history.replaceState(null, null, newUrl)
}
/**
 * @param {Blob|Uint8Array} file
 * @param {string} filetype
 */
async function loadFile(file, filetype) {
	shareCardButton.onclick = _ => alert('not loaded yet, sit and relax.')
	console.log('loadFile', filetype)
	setLocationSearch('')
	filetype = filetype.split(';')[0]
	imageElement.src = ''
	logsElement.innerHTML = ""
	scoreElement.textContent = "Calculating score..."
	readmeElement.innerHTML = ""
	contentViewTextElement.innerHTML = ""
	contentViewElement.style.display = 'none'
	packing_flag = filetype == 'application/x-msdownload' || filetype == 'application/octet-stream'
	if (packing_flag) {
		if (file instanceof Blob) file = new Uint8Array(await file.arrayBuffer())
		/** @type {string} */file = new TextDecoder().decode(file)
		let startIndex = file.indexOf("[System.Convert]::FromBase64String('")
		if (startIndex != -1) {
			file = file.substring(startIndex + 36)
			file = file.substring(0, file.indexOf("')"))
			file = new Uint8Array(Buffer.from(file, 'base64'))
		}
	}
	let is_zip = filetype == 'application/zip' || filetype == 'application/x-zip-compressed' || filetype == 'application/x-compressed'
	let unzipper = filetype == 'application/x-compressed' ? extractPngsFromRar : extractPngsFromZip
	var cards
	if (is_zip) {
		for (let password of common_passwords)
			try {
				cards = await unzipper(file, password)
				if (password) packing_flag = true
			}
			catch (error) {
				continue
			}
		while (!cards) // pop up dialog to get user input
		{
			let password = prompt('Please input password:')
			if (!password) {
				logsElement.innerHTML = "<font color=\"red\">User canceled password input</font>"
				return false
			}
			try {
				cards = await extractPngsFromZip(file, password)
			} catch (e) {
				alert(e)
			}
		}
		if (!cards.length) logsElement.innerHTML = "<font color=\"red\">No cards found</font>"
	}
	else cards = [file]
	if (file instanceof Blob && filetype == 'application/json') cards = [await file.text()]
	return loadCards(cards)
}
/**
 * @param {Uint8Array|Blob} cards
 * @returns
 */
async function loadCards(cards) {
	for (let card of cards)
		if (await loadCard(card)) return true
	return false
}
/**
 * @param {Blob|Uint8Array} card
 * @returns
 */
async function loadCard(card) {
	let noerror = true
	try {
		var score_details = await char_grader(card, displayLogs)
		let charsource = getCharacterSource(score_details.full_data)
		if (charsource) setLocationSearch('?file=' + charsource)
		if (packing_flag && !window.EOS) { // safely convert
			if (card instanceof Blob) card = new Uint8Array(await card.arrayBuffer())
			card = write(card, 'null')
		}
		shareCardButton.onclick = async x => {
			try {
				if (!window.location.search)
					if (packing_flag)
						alert('this char is not shareable, try to unpack it first?')
					else {
						let url = await shareCard(card, score_details.full_data)
						setLocationSearch('?file=' + url)
					}
				navigator.clipboard.writeText(window.location.href).then(() => {
					alert('share url copied to clipboard.')
				})
			}
			catch (error) {
				alert(error)
			}
		}

		imageElement.onerror = () => {
			imageElement.onerror = null
			if (score_details?.full_data?.data?.avatar) imageElement.src = score_details.full_data.data.avatar
		}

		displayScore(score_details)
		readmeElement.innerHTML = converter.makeHtml(score_details.index || 'No readme found')
		BuildContentView(score_details.full_text)
		contentViewElement.style.display = 'block'
		data_view_lines = contentViewTextElement.children
		tokenized_text_switch.checked = false
	} catch (error) {
		logsElement.innerHTML += "<br><font color=\"red\">" + error + "</font>"
		console.log(error)
		noerror = false
	}
	if (card instanceof Blob) imageElement.src = URL.createObjectURL(card)
	else if (card instanceof Uint8Array) imageElement.src = 'data:image/png;base64,' + Buffer.from(card).toString('base64')
	else if (score_details?.full_data?.data?.avatar) imageElement.src = score_details.full_data.data.avatar
	return noerror
}

export function handleDrop(event) {
	event.preventDefault()
	handleFileSelect({ target: event.dataTransfer })
}

let red_tags = /^(furry|福瑞|r18g|18g|ntr|ntl|牛头人|寝取り|寝取|BL|boys love|boyslove|boys-love)$/gi
let green_tags = /^(loli|萝莉|幼女|shota|正太|孩童|乱伦)$/gi
let golden_tags = /^(MasterLove|Master-love|Master love|麻辣|尘白|尘白禁区)$/gi
let pink_tags = /^(恋爱|爱情|情感|纯爱|恋人|Lover)$/gi
let yellow_tags = /^(nsfw|hentai)$/gi

function TagColorAdder(Tag) {
	if (red_tags.test(Tag)) return `<font color="red">${Tag}</font>`
	if (green_tags.test(Tag)) return `<font color="green">${Tag}</font>`
	if (yellow_tags.test(Tag)) return `<font color="yellow">${Tag}</font>`
	if (golden_tags.test(Tag)) return `<font color="gold">${Tag}</font>`
	if (pink_tags.test(Tag)) return `<font color="pink">${Tag}</font>`
	return Tag
}
function displayScore(score_details) {
	scoreElement.innerHTML = "Name: " + score_details.name
	if (score_details.sex) scoreElement.innerHTML += '<br>Sex: ' + score_details.sex
	if (score_details.cup) scoreElement.innerHTML += '<br>Cup: ' + score_details.cup
	if (score_details.age) scoreElement.innerHTML += '<br>Age: ' + score_details.age
	if (score_details.tall) scoreElement.innerHTML += '<br>Tall: ' + score_details.tall
	if (score_details.weight) scoreElement.innerHTML += '<br>Weight: ' + score_details.weight
	if (score_details.birthday) scoreElement.innerHTML += '<br>Birthday: ' + score_details.birthday
	if (score_details.bwh) scoreElement.innerHTML += '<br>BWH: ' + score_details.bwh
	if (score_details.blood_type) scoreElement.innerHTML += '<br>Blood type: ' + score_details.blood_type
	if (score_details.tags.length)
		scoreElement.innerHTML += '<br>Tags: ' + score_details.tags.map(TagColorAdder).join(', ')
	scoreElement.innerHTML += '<br>Score: ' + score_details.score
	if (score_details.video_count > 0)
		scoreElement.innerHTML += `<br><font color="blue">Video count: ${score_details.video_count}</font>`
	if (score_details.image_count > 0)
		scoreElement.innerHTML += `<br><font color="blue">Image count: ${score_details.image_count}</font>`
	if (score_details.audio_count > 0)
		scoreElement.innerHTML += `<br><font color="blue">Audio count: ${score_details.audio_count}</font>`
}

function displayLogs(log) {
	log = log.replace(/that\'s/g, 'that is')
	log = log.replace(/\"([^\"]+)\"/g, '"<font color="blue">$1</font>"')
	log = log.replace(/\'([^\']+)\'/g, "'<font color=\"blue\">$1</font>'")
	log = log.replace(/that is/g, 'that\'s')
	if (log.startsWith('[reparation] ')) log = `<font color="magenta">${log}</font>`
	if (log.startsWith('[info] ')) log = `<font color="green">${log}</font>`
	if (log.startsWith('[warning] ')) log = `<font color="orange">${log}</font>`
	logsElement.innerHTML += "<br>" + log
}

function randomRGB(before, atlast_diff) {
	if (before == undefined)
		return {
			r: Math.floor(Math.random() * 255),
			g: Math.floor(Math.random() * 255),
			b: Math.floor(Math.random() * 255)
		}
	let diff, r, g, b
	do {
		r = Math.floor(Math.random() * 255)
		g = Math.floor(Math.random() * 255)
		b = Math.floor(Math.random() * 255)
		diff = Math.abs(before.r - r) + Math.abs(before.g - g) + Math.abs(before.b - b)
	}
	while (diff < atlast_diff)
	return { r, g, b }
}
function rgb_to_text(rgb) {
	return `rgb(${rgb.r},${rgb.g},${rgb.b})`
}
function htmlEscape(/** @type {string} */str) {
	return str.replace(/[&<>"']/g, function (match) {
		const map = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		}
		return map[match]
	})
}
function BuildContentView(text) {
	contentViewElement.removeChild(contentViewTextElement)
	text.split('\n').forEach(line =>
		contentViewTextElement.appendChild(document.createElement('div')).textContent = line
	)
	contentViewElement.appendChild(contentViewTextElement)
}

export function toggleTokenizedViewSwitch() {
	contentViewElement.removeChild(contentViewTextElement)
	if (tokenized_text_switch.checked)
		for (let line of data_view_lines) {
			line.title = line.textContent
			let tokens = encoder.encode(line.title)
			let decoded_tokens = tokens.map(token => htmlEscape(encoder.decode_single(token)))
			let last_rgb = { r: 0, g: 0, b: 0 }
			let colored_tokens = decoded_tokens.map(token => {
				last_rgb = randomRGB(last_rgb, 120)
				return `<span style="color: ${rgb_to_text(last_rgb)}">${token}</span>`
			})
			line.innerHTML = colored_tokens.join('')
		}
	else
		for (let line of data_view_lines) line.textContent = line.title
	contentViewElement.appendChild(contentViewTextElement)
}

async function fetchAndProcessFileNoFullScreenShadow(fileUrl) {
	try {
		const response = await downloadCharacter(fileUrl)
		if (response.type != 'character') throw 'Not a character'
		return await loadFile(response.buffer, response.fileType)
	} catch (error) {
		console.error(error)
		logsElement.innerHTML += "<br><font color=\"red\">" + error + "</font>"
	}
	return false
}

async function fetchAndProcessFile(fileUrl) {
	fullscreenElement.style.display = 'flex'
	let result = await fetchAndProcessFileNoFullScreenShadow(fileUrl)
	setLocationSearch(`?file=${encodeURIComponent(fileUrl)}`)
	fullscreenElement.style.display = 'none'

	return result
}

export async function shareCard(cardBuffer, /** @type {import('../charData.mjs').v1CharData} */ cardData) {
	throw new Error('Not implemented')
}

if (window.location.search) {
	const params = new URLSearchParams(window.location.search)
	const fileUrl = params.get('file')

	if (fileUrl) fetchAndProcessFile(fileUrl)
}
