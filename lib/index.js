import { buildVariants, lint, pickScene, redLine, renderPlan, SCENARIOS } from './engine.js'

export const name = 'dsh-pitchkit'
export const inject = []

const CHANNELS = ['邮件', '微信', '电话', '面谈', '短信']

const PARAMETERS = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['build', 'lint', 'variants'],
      description: 'build=完整设计（骨架+三版+对方反应+合规检查）；lint=只体检一段现成话术；variants=只要三版改写',
    },
    scene: {
      type: 'string',
      description: `业务场景。可选：${SCENARIOS.map(s => s.name).join('、')}。留空则从 draft/objective 里自动识别。`,
    },
    channel: { type: 'string', enum: CHANNELS, description: '渠道，默认 邮件。影响版式：邮件带主题行，微信/短信会压到 180 字内。' },
    audience: { type: 'string', description: '对方是谁：角色、决策权、已知关切、和你方关系。例："某制造企业采购张经理，谨慎，卡预算"' },
    objective: { type: 'string', description: '这次沟通要拿到的具体结果，别写"推进一下"。例："拿到本周五前确认的配置项清单"' },
    draft: { type: 'string', description: '用户原话术或要点。有就基于它改写，没有就按骨架给占位版。' },
    value: { type: 'string', description: '对对方的好处，一句话，必须是能兑现的事实。' },
    time: { type: 'string', description: '期望的时间点。例："本周五"、"3 月 31 日前"。' },
  },
  additionalProperties: false,
}

function text(value) {
  return String(value)
}

function sceneList() {
  return SCENARIOS.map(s => `- ${s.name}（id: ${s.id}）：${s.whenToUse}`).join('\n')
}

function refusal(block) {
  return [
    `这个方向我不写：${block.reason}`,
    '',
    '冒充身份、索要验证码/密码、退款或"安全账户"、钓鱼仿冒、伪造凭据、恐吓骚扰，这些属于欺诈或侵害，写出来第一个承担责任的是发消息的人（《反电信网络诈骗法》《刑法》相关条款）。',
    '',
    '如果真正的目的是把一件正当的事推进下去，换三个方向都能达到同样效果：',
    '1. 说清真实身份和来意，把"为什么找你"讲明白；',
    '2. 把请求换成对方能得到的确定好处，而不是制造焦虑；',
    '3. 给对方拒绝的余地和替代方案，反而更容易拿到答复。',
    '',
    '把场景和目标按这个方向重新描述一次，我照着写。',
  ].join('\n')
}

export function apply(ctx) {
  ctx.inject(['tools'], child => {
    child.tools.register({
      name: 'talk_track',
      description:
        '商务沟通话术工作台（销售跟进、报价谈判、异议处理、催款、涨价、续约、拒绝、投诉）。' +
        '输入场景+对方情况+原话术，返回：结构骨架、基于原话改写的三版（稳健/亲和/推进）、对方可能的回应与接法、合规与风险检查、发前待确认清单。' +
        '它不会编造数据或案例——缺信息时返回【待补：…】占位，需要你按用户真实信息补齐后再定稿。' +
        '做法：先调用本工具拿骨架和检查项，再按骨架把最终话术写给用户，不要直接把占位符发出去。',
      parameters: PARAMETERS,
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      isConcurrencySafe: () => true,
      execute: async (args, exec) => {
        exec?.signal?.throwIfAborted?.()
        const input = args && typeof args === 'object' ? args : {}
        const joined = [input.scene, input.draft, input.objective, input.audience, input.value].filter(Boolean).join('\n')

        const block = redLine(joined)
        if (block.blocked) return text(refusal(block))

        const channel = CHANNELS.includes(input.channel) ? input.channel : '邮件'
        const scene = pickScene({ scene: input.scene ?? '', draft: input.draft ?? '', objective: input.objective ?? '' })
        const draft = typeof input.draft === 'string' ? input.draft.trim() : ''

        if (input.mode === 'lint') {
          if (!draft) return text(`体检模式需要 draft（要检查的那段话术）。\n\n当前可用场景：\n${sceneList()}`)
          const findings = lint(draft)
          if (!findings.length) return text('未发现明显问题：称呼、请求、时间、理由都齐，也没有绝对化用语。直接发。')
          const rank = { high: 0, medium: 1, low: 2 }
          findings.sort((a, b) => rank[a.level] - rank[b.level])
          return text(
            [
              '## 体检结果',
              ...findings.map(f => {
                const tag = f.level === 'high' ? '高' : f.level === 'medium' ? '中' : '低'
                return `- [${tag}] ${f.advice}${f.basis ? `（依据：${f.basis}）` : ''}`
              }),
              '',
              '改完再跑一次 lint 复核，别把新加的词带出新的问题。',
            ].join('\n'),
          )
        }

        if (input.mode === 'variants') {
          if (!draft) return text('三版改写需要 draft（原话术）。只给要点的话请用 mode=build。')
          const variants = buildVariants({
            draft,
            scene,
            audience: input.audience ?? '',
            channel,
            objective: input.objective ?? '',
            value: input.value ?? '',
            time: input.time ?? '',
          })
          return text(variants.map(v => `### ${v.label}\n\`\`\`text\n${v.text}\n\`\`\``).join('\n\n'))
        }

        const findings = draft ? lint(draft) : []
        const variants = buildVariants({
          draft,
          scene,
          audience: input.audience ?? '',
          channel,
          objective: input.objective ?? '',
          value: input.value ?? '',
          time: input.time ?? '',
        })
        const plan = renderPlan({
          scene,
          channel,
          audience: input.audience ?? '',
          objective: input.objective ?? '',
          variants,
          findings,
          draft,
        })
        const head = draft
          ? ''
          : `> 没有原话术，下面是骨架 + 占位版；把【待补】换成真实信息再发。\n\n可用场景：\n${sceneList()}\n\n`
        return text(head + plan)
      },
    })
  })

  const prompt = ctx.get?.('systemPrompt')
  if (prompt?.section) {
    prompt.section({
      name: 'dsh-pitchkit',
      order: 140,
      text: () =>
        '需要写商务沟通话术（跟进、报价、谈判、催款、涨价、续约、拒绝、投诉安抚）时，先调用 talk_track 工具取结构骨架与合规检查；' +
        '工具返回的【待补：…】必须换成用户给的真实信息，不许自行编造数据、案例或时间。',
    })
  }
}

export default { name, inject, apply }