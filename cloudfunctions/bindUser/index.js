// 云函数：bindUser — 小程序端用户名密码验证 + 绑定微信 openid
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    if (!openid) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '无法获取微信身份' } }
    }

    const { username, password } = event
    if (!username || !password) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请输入用户名和密码' } }
    }

    // 检查此 openid 是否已绑定其他账号
    const { data: boundUsers } = await db.collection('users')
      .where({ openid, status: 'active' })
      .limit(1).get()
    if (boundUsers.length > 0) {
      return {
        ok: false,
        error: { code: 'ALREADY_BOUND', message: '此微信已绑定账号：' + boundUsers[0].displayName + '，如需更换请联系管理员解绑' }
      }
    }

    // 查找用户
    const { data: users } = await db.collection('users')
      .where({ username })
      .limit(1).get()

    if (users.length === 0) {
      return { ok: false, error: { code: 'USER_NOT_FOUND', message: '用户名不存在，请联系管理员创建账号' } }
    }

    const user = users[0]

    if (user.status === 'disabled') {
      return { ok: false, error: { code: 'USER_DISABLED', message: '账号已禁用，请联系管理员' } }
    }

    // 验证密码（支持 SHA256 哈希和明文两种方式）
    const storedPassword = user.pcPassword || user.passwordHash || ''
    const crypto = require('crypto')
    const hashedInput = crypto.createHash('sha256').update(password).digest('hex')
    const isMatch = (storedPassword === hashedInput) || (storedPassword === password)

    if (!isMatch) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '密码错误' } }
    }

    // 检查该用户是否已被其他微信绑定
    if (user.openid && user.openid !== openid) {
      return {
        ok: false,
        error: { code: 'BOUND_TO_OTHER', message: '此账号已被其他微信绑定，请联系管理员解绑后重试' }
      }
    }

    // 绑定 openid
    await db.collection('users').where({ username }).update({
      data: {
        openid: openid,
        updatedAt: Date.now()
      }
    })

    // 如果密码是明文存储的，顺便升级为哈希
    if (storedPassword === password && storedPassword !== hashedInput) {
      try {
        await db.collection('users').where({ username }).update({
          data: { pcPassword: hashedInput }
        })
      } catch (e) {
        console.warn('自动升级密码哈希失败', e)
      }
    }

    return {
      ok: true,
      data: {
        user: {
          userId: user.userId,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          factoryId: user.factoryId || null
        }
      }
    }
  } catch (err) {
    console.error('bindUser error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '绑定失败: ' + (err.message || String(err)) } }
  }
}
