/**
 * 手动冒烟：node scripts/demo.mjs
 * 打印一次完整的 build 结果，用来肉眼检查话术质量。
 */
import { apply } from '../lib/index.js'

const tools = []
apply({ inject: (_d, fn) => fn({ tools: { register: t => tools.push(t) } }), get: () => undefined })

const out = await tools[0].execute({
  mode: 'build',
  scene: '客户跟进',
  channel: '邮件',
  audience: '某制造企业采购张经理，谨慎，卡预算，上次报价后就没回音',
  objective: '本周五前拿到对方对报价的明确态度（接受 / 要改哪项 / 不做了）',
  draft: '张经理你好，上次发的报价你看了吗？这个价格已经是最低了，尽快回复我。',
})

console.log(out)