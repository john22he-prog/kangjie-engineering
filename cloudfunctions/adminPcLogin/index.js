// 云函数：adminPcLogin — PC 端用户名密码登录，返回 JWT
// 调用方：通过 HTTP API 或网关调用（无 openid）
// users 集合需有 pcPassword 字段（可为明文，建议仅 Admin/Supervisor 设置）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 简单 JWT 生成（无第三方依赖），payload: { userId, role, exp }
// 优先从环境变量读取 JWT 密钥，生产环境必须配置 JWT_SECRET 环境变量
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.warn('[adminPcLogin] 警告：未设置 JWT_SECRET 环境变量，使用默认密钥，请尽快在云函数环境变量中配置！')
}
const JWT_SECRET_FINAL = JWT_SECRET || 'kangjie-pc-admin-' + (process.env.TCB_ENV || 'dev') + '-secret'
const TOKEN_EXP_DAYS = 7

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signHMAC(data, secret) {
  const crypto = require('crypto')
  return crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function createToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' }
  payload.exp = Math.floor(Date.now() / 1000) + TOKEN_EXP_DAYS * 86400
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signature = signHMAC(headerB64 + '.' + payloadB64, JWT_SECRET_FINAL)
  return headerB64 + '.' + payloadB64 + '.' + signature
}

exports.main = async (event, context) => {
  try {
    // 支持 HTTP 访问服务：请求体在 event.body 中
    if (event.body !== undefined) {
      try {
        const parsed = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
        Object.assign(event, parsed)
      } catch (e) {}
    }
    const { username, password } = event
    if (!username || !password) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请输入用户名和密码' } }
    }

    // 查找用户
    const { data: users } = await db.collection('users')
      .where({ username, status: 'active' })
      .limit(1)
      .get()

    if (users.length === 0) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '用户名或密码错误' } }
    }

    const user = users[0]
    const storedPassword = user.pcPassword || user.passwordHash || ''
    // 支持两种比较方式：SHA256 哈希比较（新）和明文比较（旧，兼容过渡）
    const crypto = require('crypto')
    const hashedInput = crypto.createHash('sha256').update(password).digest('hex')
    const isMatch = (storedPassword === hashedInput) || (storedPassword === password)
    if (!isMatch) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '用户名或密码错误' } }
    }
    // 如果仍是明文密码，自动升级为哈希存储
    if (storedPassword === password && storedPassword !== hashedInput) {
      try {
        await db.collection('users').where({ username }).update({
          data: { pcPassword: hashedInput, updatedAt: Date.now() }
        })
      } catch (e) {
        console.warn('自动升级密码哈希失败', e)
      }
    }

    // 检查角色
    const allowedRoles = ['Admin', 'Supervisor', 'Management']
    if (!allowedRoles.includes(user.role)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '您的角色无权登录 PC 端' } }
    }

    // 生成 JWT
    const token = createToken({
      userId: user.userId,
      role: user.role,
      username: user.username,
    })

    return {
      ok: true,
      data: {
        token,
        user: {
          userId: user.userId,
          username: user.username,
          displayName: user.displayName || user.username,
          role: user.role,
          status: user.status,
          factoryId: user.factoryId || '',
        },
      },
    }
  } catch (err) {
    console.error('adminPcLogin error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
