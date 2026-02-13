/**
 * PC 管理端网关
 * 使用小程序 appid/secret 获取 access_token，并转发 PC 端请求到云函数 adminPcLogin / pcGateway
 * 环境变量：APPID, SECRET, ENV（云开发环境 ID）
 * 启动前先复制 .env.example 为 .env，填入 APPID 和 SECRET
 */
import express from 'express'
import fetch from 'node-fetch'
import { readFileSync } from 'fs'

// 读取 .env 文件（简单实现，无需 dotenv 依赖）
try {
  const envContent = readFileSync(new URL('./.env', import.meta.url), 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  })
} catch { /* .env 文件可选 */ }

const app = express()
app.use(express.json({ limit: '2mb' }))

// CORS — 限制为已知前端域名（可通过环境变量 CORS_ORIGINS 配置，逗号分隔）
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim())
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  } else if (!origin) {
    // 非浏览器请求（如 curl、服务器间调用）允许通过
    res.header('Access-Control-Allow-Origin', '')
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.header('Access-Control-Allow-Credentials', 'true')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

const APPID = process.env.APPID || ''
const SECRET = process.env.SECRET || ''
const ENV = process.env.ENV || 'cloud1-0g0grbwt8c230b0d'

let cachedToken = null
let tokenExpiry = 0

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errcode) {
    throw new Error(data.errmsg || '获取 access_token 失败')
  }
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken
}

async function invokeCloudFunction(name, event) {
  const access_token = await getAccessToken()
  const url = `https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=${access_token}&env=${encodeURIComponent(ENV)}&name=${encodeURIComponent(name)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('云函数返回非 JSON: ' + text.slice(0, 200))
  }
  if (json.errcode && json.errcode !== 0) {
    throw new Error(json.errmsg || '云函数调用失败')
  }
  if (json.result) {
    try {
      return typeof json.result === 'string' ? JSON.parse(json.result) : json.result
    } catch {
      return json.result
    }
  }
  return json
}

app.post('/api/login', async (req, res) => {
  try {
    if (!APPID || !SECRET) {
      return res.status(500).json({ ok: false, error: { code: 'CONFIG', message: '服务端未配置 APPID/SECRET' } })
    }
    const { username, password } = req.body || {}
    const result = await invokeCloudFunction('adminPcLogin', { username, password })
    res.json(result)
  } catch (err) {
    console.error('login error:', err)
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || '登录失败' } })
  }
})

app.post('/api/call', async (req, res) => {
  try {
    if (!APPID || !SECRET) {
      return res.status(500).json({ ok: false, error: { code: 'CONFIG', message: '服务端未配置 APPID/SECRET' } })
    }
    const { token, action, data } = req.body || {}
    const result = await invokeCloudFunction('pcGateway', { token, action, data: data || {} })
    res.json(result)
  } catch (err) {
    console.error('call error:', err)
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || '请求失败' } })
  }
})

app.get('/health', (req, res) => {
  res.json({ ok: true, env: ENV ? 'ok' : 'missing' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log('PC 网关已启动: http://localhost:' + PORT)
  if (!APPID || !SECRET) console.warn('警告：未设置 APPID/SECRET，请在环境变量中配置')
})
