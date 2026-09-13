#!/usr/bin/env node
// Pull new runs from Nike Run Club into activities/.
//
// Auth comes from .env (see .env.example). Nothing else is written: one JSON
// file per run, named by its end timestamp, the same shape the rest of the
// repo already reads.
//
// Usage:
//   npm run sync                 fetch runs newer than the ones on disk
//   npm run sync -- --all        walk the whole history, filling any gaps
//   npm run sync -- --dry-run    list what would be downloaded
//   npm run sync -- --limit 5    stop after 5 new runs

import { readdirSync, existsSync, mkdirSync, writeFileSync, renameSync, unlinkSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ACTIVITIES_DIR = join(ROOT, 'activities')

const BASE_URL = 'https://api.nike.com/plus/v3'
const TOKEN_REFRESH_URL = 'https://api.nike.com/idn/shim/oauth/2.0/token'
// Nike's own public client id for the Run Club app.
const CLIENT_ID = 'HlHa2Cje3ctlaOqnxvgZXNaAs7T9nAuH'
const UX_ID = 'com.nike.sport.running.droid.3.8'

// Nike Training Club sessions come back from the same endpoint; they aren't runs.
const NTC_APP_IDS = new Set(['com.nike.ntc.brand.ios', 'com.nike.ntc.brand.droid'])

function parseArgs (argv) {
  const opts = { all: false, dryRun: false, limit: Infinity }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--all' || arg === '-a') opts.all = true
    else if (arg === '--dry-run' || arg === '-n') opts.dryRun = true
    else if (arg === '--limit' || arg === '-l') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 1) fail(`--limit needs a positive number, got "${argv[i]}"`)
      opts.limit = n
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    } else fail(`Unknown option "${arg}". Try --help.`)
  }
  return opts
}

// The comment block at the top of this file is the help text.
function usage () {
  const lines = []
  for (const line of readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1)) {
    if (!line.startsWith('//')) break
    lines.push(line.slice(3))
  }
  return lines.join('\n').trim()
}

function fail (message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

// Minimal .env reader so this stays dependency-free. Real environment
// variables win, so you can override without editing the file.
function loadEnv () {
  const path = join(ROOT, '.env')
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function getAccessToken () {
  const refresh = process.env.NIKE_REFRESH_TOKEN?.trim()
  const access = process.env.NIKE_ACCESS_TOKEN?.trim()

  if (refresh) {
    const response = await fetch(TOKEN_REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refresh,
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        ux_id: UX_ID
      })
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      fail(`Refreshing the token failed (HTTP ${response.status}). ${body.slice(0, 200)}\n` +
        '  The refresh token has probably been revoked — grab a new one (see .env.example).')
    }
    const data = await response.json()
    if (!data.access_token) fail('The refresh response had no access_token in it.')
    console.log('Refreshed the access token.')
    return data.access_token
  }

  if (access) return access

  fail('No credentials. Copy .env.example to .env and put a Nike token in it.\n' +
    '  Set NIKE_REFRESH_TOKEN (preferred, keeps working) or NIKE_ACCESS_TOKEN (expires in about an hour).')
}

async function nikeGet (path, token, { attempts = 3 } = {}) {
  const url = `${BASE_URL}/${path}`
  for (let attempt = 1; ; attempt++) {
    let response
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) {
      if (attempt >= attempts) throw error
      await sleep(attempt * 2000)
      continue
    }
    if (response.ok) return response.json()
    if (response.status === 401 || response.status === 403) {
      fail(`Nike rejected the token (HTTP ${response.status}).\n` +
        '  Access tokens expire after about an hour. Set NIKE_REFRESH_TOKEN in .env, or paste a fresh NIKE_ACCESS_TOKEN.')
    }
    if (attempt >= attempts || (response.status < 500 && response.status !== 429)) {
      const body = await response.text().catch(() => '')
      throw new Error(`GET ${url} failed: HTTP ${response.status} ${body.slice(0, 200)}`)
    }
    await sleep(attempt * 3000)
  }
}

function existingTimestamps () {
  if (!existsSync(ACTIVITIES_DIR)) mkdirSync(ACTIVITIES_DIR, { recursive: true })
  return new Set(
    readdirSync(ACTIVITIES_DIR)
      .filter(name => name.endsWith('.json'))
      .map(name => name.slice(0, -5))
  )
}

function saveActivity (activity) {
  const name = `${activity.end_epoch_ms}.json`
  const path = join(ACTIVITIES_DIR, name)
  const tmp = `${path}.partial`
  try {
    writeFileSync(tmp, JSON.stringify(activity, null, 4))
    renameSync(tmp, path)
  } catch (error) {
    if (existsSync(tmp)) unlinkSync(tmp)
    throw error
  }
  return name
}

function describe (activity) {
  const when = new Date(activity.end_epoch_ms).toISOString().slice(0, 16).replace('T', ' ')
  const km = activity.summaries?.find(s => s.metric === 'distance' && s.summary === 'total')?.value
  const title = activity.tags?.['com.nike.name'] ?? 'Run'
  return `${when}  ${km ? `${km.toFixed(2)} km` : '     ?  '}  ${title}`
}

async function main () {
  const opts = parseArgs(process.argv.slice(2))
  loadEnv()

  const have = existingTimestamps()
  console.log(`${have.size} runs already in activities/`)

  const token = await getAccessToken()

  const downloaded = []
  let skipped = 0
  let beforeId = null
  let page = 0

  paging: while (true) {
    const cursor = beforeId ?? '*'
    const listing = await nikeGet(
      `activities/before_id/v3/${cursor}?limit=30&types=run%2Cjogging&include_deleted=false`,
      token
    )
    const activities = listing.activities ?? []
    page++
    if (!activities.length) break

    let newOnPage = 0
    for (const summary of activities) {
      if (NTC_APP_IDS.has(summary.app_id)) continue
      if (have.has(String(summary.end_epoch_ms))) { skipped++; continue }
      newOnPage++

      if (opts.dryRun) {
        console.log(`  would fetch  ${describe(summary)}`)
        downloaded.push(summary)
      } else {
        const full = await nikeGet(`activity/${summary.id}?metrics=ALL`, token)
        const name = saveActivity(full)
        have.add(String(full.end_epoch_ms))
        downloaded.push(full)
        console.log(`  saved ${name}  ${describe(full)}`)
        await sleep(300)
      }

      if (downloaded.length >= opts.limit) {
        console.log(`Reached --limit ${opts.limit}.`)
        break paging
      }
    }

    beforeId = listing.paging?.before_id
    if (!beforeId) break
    // Default run walks back only until it catches up with what's on disk.
    if (!opts.all && newOnPage === 0) break
  }

  if (opts.dryRun) {
    console.log(`\n${downloaded.length} new run(s) available, ${skipped} already on disk. Nothing written.`)
    return
  }

  if (!downloaded.length) {
    console.log(`\nNothing new — you're up to date.`)
    return
  }

  console.log(`\nAdded ${downloaded.length} run(s) to activities/.`)
  console.log('Run `npm run dev` to rebuild the data and see them.')
}

main().catch(error => fail(error.stack ?? String(error)))
