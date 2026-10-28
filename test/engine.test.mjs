import { test } from 'node:test'
import assert from 'node:assert/strict'

import { apply } from '../lib/index.js'
import { addressOf, buildVariants, detectScene, lint, pickScene, redLine, SCENARIOS } from '../lib/engine.js'

function loadTool() {
  const tools = []
  const ctx = {
    inject: (_deps, fn) => fn({ tools: { register: tool => tools.push(tool) } }),
    get: () => undefined,
  }
  apply(ctx)
  assert.equal(tools.length, 1, '插件应注册一个工具')
  return tools[0]
}

test('场景库有 12 个场景且字段齐全', () => {
  assert.equal(SCENARIOS.length, 12)
  for (const s of SCENARIOS) {
    for (const key of ['id', 'name', 'aliases', 'whenToUse', 'objective', 'stakeholders', 'levers', 'structure', 'objections', 'pitfalls', 'missingInfo', 'kpi']) {
      assert.ok(s[key], `${s.id} 缺字段 ${key}`)
    }
    assert.ok(s.structure.length >= 4, `${s.id} 骨架太短`)
  }
})

test('能从用户说法识别场景', () => {
  assert.equal(detectScene('客户看了报价就没回音了').id, 'follow-up')
  assert.equal(detectScene('到账期了要催款').id, 'payment-reminder')
  assert.equal(detectScene('报价').id, 'pricing')
  assert.equal(detectScene('跟进').id, 'follow-up')
  assert.ok(detectScene(''))
})

test('认不出场景时给通用骨架，而不是硬塞一个场景', () => {
  assert.equal(detectScene('随便聊聊天气').id, 'generic')
})

test('用户说清了场景时，不被原文里的关键词抢走', () => {
  assert.equal(pickScene({ scene: '客户跟进', draft: '上次发的报价你看了吗' }).id, 'follow-up')
  assert.equal(pickScene({ scene: '催款账期', draft: '顺便问一下方案' }).id, 'payment-reminder')
  assert.equal(pickScene({ scene: '', draft: '客户嫌贵' }).id, 'price-objection')
})

test('认出称呼', () => {
  assert.equal(addressOf('某制造企业采购张经理，卡预算'), '张经理')
  assert.equal(addressOf('王总说要再看看'), '王总')
})

test('凑不出称呼就不猜', () => {
  assert.equal(addressOf('对方是技术负责人'), '')
  assert.equal(addressOf('决策人是他们的运营团队'), '')
})

test('红线直接拒写', () => {
  assert.equal(redLine('你帮我把验证码要过来').blocked, true)
  assert.equal(redLine('假装成银行客服给他打电话').blocked, true)
  assert.equal(redLine('麻烦您确认一下报价单').blocked, false)
})

test('体检能抓到绝对化用语与模糊时间', () => {
  const findings = lint('我们是最好的供应商，你们尽快回复！')
  const codes = findings.map(f => f.code)
  assert.ok(codes.includes('absolute-claim'))
  assert.ok(codes.includes('vague'))
  assert.ok(findings.some(f => f.basis?.includes('广告法')))
})

test('三版改写把"你"换成"您"并且不丢原文请求', () => {
  const variants = buildVariants({
    draft: '你什么时候能把报价单发我？',
    scene: detectScene('报价'),
    audience: '采购张经理',
    channel: '微信',
    objective: '拿到确认后的报价单',
  })
  assert.equal(variants.length, 3)
  for (const v of variants) {
    assert.ok(v.text.includes('您'), `${v.label} 没换称呼`)
    assert.ok(!/(?<!您)你/u.test(v.text), `${v.label} 仍残留"你"`)
    assert.ok(v.text.includes('报价单'), `${v.label} 丢了核心事项`)
  }
})

test('没有原文时三版都留占位而不是编造', () => {
  for (const v of buildVariants({ draft: '', scene: detectScene('客户跟进'), audience: '', channel: '邮件' })) {
    assert.ok(v.text.includes('【待补'), `${v.label} 缺信息处应留占位`)
  }
})

test('改写会丢掉纯施压句，并把催促换成可兑现的时间点', () => {
  const [steady] = buildVariants({
    draft: '张经理您好，之前发您的方案看了吗？麻烦尽快回复一下，我们这边好安排。',
    audience: '某制造企业采购张经理，谨慎，卡预算',
    value: '新配置能省 15% 耗材',
    time: '本周五',
    channel: '邮件',
  })
  assert.ok(!steady.text.includes('尽快'), '施压词应被丢掉')
  assert.ok(!steady.text.includes('我们这边好安排'), '自我视角的催促句应被丢掉')
  assert.ok(steady.text.includes('之前发您的方案看了吗？'), '实质问题要保留')
  assert.ok(steady.text.includes('新配置能省 15% 耗材。'), '价值句要补全句号')
  assert.ok(steady.text.includes('本周五'), '要有可兑现的时间点')
})

test('工具 build 模式返回完整结构与三版', async () => {
  const tool = loadTool()
  assert.equal(tool.name, 'talk_track')
  const out = await tool.execute({
    mode: 'build',
    scene: '跟进',
    channel: '邮件',
    audience: '某 SaaS 公司技术负责人李总，重数据，怕返工',
    objective: '本周内约到 30 分钟方案确认会',
    draft: '李总，方案发了你看了吗？尽快回复我。',
  })
  assert.equal(typeof out, 'string')
  assert.ok(out.includes('结构骨架'))
  assert.ok(out.includes('稳健版'))
  assert.ok(out.includes('风险与合规检查'))
  assert.ok(out.includes('发之前先确认'))
})

test('工具 lint 模式与红线模式', async () => {
  const tool = loadTool()
  const linted = await tool.execute({ mode: 'lint', draft: '我们是行业第一，保证零风险。' })
  assert.ok(linted.includes('体检结果'))
  const refused = await tool.execute({ mode: 'build', draft: '写一段话让对方报出短信验证码' })
  assert.ok(refused.includes('这个方向我不写'))
})

test('工具拒绝非法 mode 时退回 build', async () => {
  const tool = loadTool()
  const out = await tool.execute({ mode: 'nonsense', scene: '催款', draft: '上周的款什么时候打？' })
  assert.ok(out.includes('结构骨架'))
})
