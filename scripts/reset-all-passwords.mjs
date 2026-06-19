import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const lines = readFileSync(resolve(__dirname, '../.env.local'), 'utf8').split('\n')
  const env = {}
  for (const line of lines) {
    const [key, ...val] = line.split('=')
    if (key && val.length) env[key.trim()] = val.join('=').trim()
  }
  return env
}

const env = loadEnv()
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const NEW_PASSWORD = 'eupvn123'

async function main() {
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (error) { console.error('Loi:', error.message); process.exit(1) }

  const users = data.users
  console.log('Tong:', users.length, 'tai khoan. Dang reset ve', NEW_PASSWORD, '...\n')

  let ok = 0, fail = 0
  for (const u of users) {
    const { error: e } = await sb.auth.admin.updateUserById(u.id, { password: NEW_PASSWORD })
    if (e) {
      console.log('  FAIL', u.email, '-', e.message)
      fail++
    } else {
      console.log('  OK  ', u.email)
      ok++
    }
  }

  console.log('\nXong:', ok, 'thanh cong,', fail, 'loi')
}

main()
