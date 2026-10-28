/**
 * 话术引擎：确定性、可测试、零依赖。
 *
 * 设计原则（决定了它为什么不"胡说"）：
 * 1. 只做三件事——结构骨架、合规体检、基于用户原文的改写。
 * 2. 缺信息就留【待补：…】占位，绝不编造数据、案例、价格、时间。
 * 3. 命中红线（冒充身份 / 套取验证码 / 钓鱼 / 伪造凭据 / 恐吓骚扰）直接拒写。
 */
import { readFileSync } from 'node:fs'

const FALLBACK_SCENE = {
  id: 'generic',
  name: '通用商务沟通',
  aliases: [],
  whenToUse: '没有匹配到专门场景时的通用骨架',
  objective: '把诉求讲清楚，并拿到对方一个明确答复',
  stakeholders: ['决策人'],
  levers: ['给出可验证的信息', '降低对方的决策成本', '给对方选择权'],
  structure: [
    { slot: '称呼', hint: '用对方习惯的称呼，别用"你好"开口', example: '张总，您好。' },
    { slot: '开场', hint: '一句话说明来意，别寒暄超过一句', example: '关于上周聊过的排期，我这边同步一下进展。' },
    { slot: '背景', hint: '只给对方做判断需要的事实', example: '方案里您关心的两项已经改完。' },
    { slot: '价值', hint: '说清这件事对对方的好处', example: '这样您这边评审时就不用再等我们返工。' },
    { slot: '请求', hint: '一个具体的、可执行的请求', example: '想请您确认一下第二页的配置项。' },
    { slot: '收口', hint: '给时间点和下一步，别用"尽快"', example: '您看周四前给我答复方便吗？' },
  ],
  objections: [],
  pitfalls: ['只提要求不提价值', '用"尽快/大概"代替具体时间', '一次塞进三个以上诉求'],
  missingInfo: ['对方在这件事上的决策权', '对方的硬性约束（预算/时间/流程）', '你希望拿到的具体结果'],
  kpi: '对方给出明确答复或下一步时间',
}

function loadScenarios() {
  try {
    const data = JSON.parse(readFileSync(new URL('./scenarios.json', import.meta.url), 'utf8'))
    if (Array.isArray(data) && data.length) return data
  } catch {
    /* 数据文件缺失时退回通用骨架，插件仍可用 */
  }
  return [FALLBACK_SCENE]
}

export const SCENARIOS = loadScenarios()

/** 红线：这些不是"话术优化"，是欺诈/侵害，直接拒写。 */
const RED_LINES = [
  {
    code: 'impersonation',
    pattern: /冒充|假装(?:是|成)|伪装成|冒名|假扮|以.{0,10}(?:银行|公安|检察院|法院|客服|领导|老板|同事|供应商|平台).{0,4}(?:名义|身份|口吻)/u,
    reason: '内容涉及冒充他人身份。',
  },
  {
    code: 'credential',
    pattern: /验证码|动态码|短信码|登录密码|支付密码|口令|U盾|盾key/i,
    reason: '内容涉及向对方索要验证码/密码等凭证。',
  },
  {
    code: 'fraud-transfer',
    pattern: /安全账户|资金核查|退款链接|扫码退款|刷单|返利任务|垫付解冻/u,
    reason: '内容属于典型诈骗话术结构（安全账户/退款/刷单/解冻）。',
  },
  {
    code: 'phishing',
    pattern: /钓鱼|木马|盗号|撞库|仿冒(?:网站|App|页面)/u,
    reason: '内容涉及钓鱼或仿冒站点。',
  },
  {
    code: 'forgery',
    pattern: /伪造|假章|假合同|假截图|P图当证据|伪造流水/u,
    reason: '内容涉及伪造凭据。',
  },
  {
    code: 'coercion',
    pattern: /爆通讯录|上门堵|缠着|曝光你|搞臭|骚扰你家人|不还钱就/u,
    reason: '内容涉及恐吓、骚扰或人身施压。',
  },
]

const ABSOLUTE_TERMS = [
  '最好', '最佳', '最强', '最优', '最低价', '最便宜', '全网最低', '行业第一', '全国第一',
  '第一品牌', '唯一', '顶级', '国家级', '世界级', '100%', '绝对', '彻底解决', '保证',
  '包过', '稳赚', '零风险', '无风险', '永久有效', '万能', '独家首发', '官方指定',
]

const PRESSURE_TERMS = [
  '最后一天', '最后机会', '过期不候', '名额有限', '今天必须', '马上涨价', '限时',
  '仅剩', '不回复视为', '后果自负', '你必须', '再不', '错过就没有',
]

const VAGUE_TERMS = ['尽快', '大概', '可能', '到时候', '尽量', '差不多', '后续再说', '看看吧', '有空']



const SURNAMES =
  '张王李刘陈杨黄赵周吴徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦傅方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'

/**
 * 从自由描述里认出一个称呼：只认「姓 + 职衔」相邻的情况，认不出返回空串。
 * 刻意不从「负责人」「美女」这类词里凑职称——凑出来的称呼发给客户就是事故。
 */
export function addressOf(audience = '') {
  const text = String(audience)
  const titled = new RegExp(`([${SURNAMES}])\\s*(总|经理|总监|主任|老师|部长|先生|女士|工|哥|姐)`, 'u').exec(text)
  return titled ? titled[1] + titled[2] : ''
}

/**
 * 每个场景的短关键词。别名是「一句完整说法」，关键词是「一个词」——
 * 用户只打「报价」「跟进」这种两三个字时，靠关键词才不会掉到通用骨架里。
 */
const SCENE_KEYWORDS = {
  'cold-outreach': ['首次联系', '第一次联系', '陌拜', '陌生拜访', '破冰', '初次'],
  'follow-up': ['跟进', '没回音', '没回复', '不回消息', '不回', '已读不回', '晾着', '催一下'],
  pricing: ['报价', '报价单', '价格', '让价', '折扣', '商务条款', '谈价'],
  'price-objection': ['嫌贵', '太贵', '超预算', '砍价', '不值', '预算不够', '预算只有'],
  competitive: ['竞品', '比价', '在比', '对比', '别家', '选型', '友商'],
  discovery: ['需求', '调研', '澄清', '深聊', '访谈', '摸需求'],
  'payment-reminder': ['催款', '回款', '账期', '逾期', '付款', '发票', '该付'],
  'delivery-chase': ['催进度', '交付', '延期', '上线', '排期', '卡住'],
  'price-increase': ['涨价', '调价', '上调', '成本上涨'],
  renewal: ['续约', '续费', '到期', '续签', '不想续'],
  'request-decline': ['拒绝', '做不了', '说不', '过分要求', '往后拖'],
  complaint: ['投诉', '发火', '安抚', '退款', '服务问题', '找人'],
}

export function detectScene(input = '') {
  const text = String(input).trim()
  if (!text) return SCENARIOS[0] ?? FALLBACK_SCENE
  let best = null
  let bestScore = 0
  for (const scene of SCENARIOS) {
    let score = 0
    for (const key of [scene.name, ...(scene.aliases ?? [])].filter(Boolean)) {
      if (key.length > 1 && text.includes(key)) score += 2 + key.length
    }
    for (const word of SCENE_KEYWORDS[scene.id] ?? []) {
      if (text.includes(word)) score += 1 + word.length
    }
    if (score > bestScore) {
      best = scene
      bestScore = score
    }
  }
  return best ?? FALLBACK_SCENE
}

function keywordScore(scene, text) {
  return (SCENE_KEYWORDS[scene.id] ?? []).reduce((sum, word) => (text.includes(word) ? sum + 1 + word.length : sum), 0)
}

/**
 * 用户明说了场景就以他说的为准（先匹配 id/名称/别名，再匹配关键词），没明说才从文本里猜。
 * 否则原文里出现「报价」两个字，就会把「客户跟进」抢成报价场景。
 */
export function pickScene({ scene = '', draft = '', objective = '' } = {}) {
  const explicit = String(scene).trim()
  if (explicit) {
    const direct = SCENARIOS.find(s => {
      if (s.id === explicit || s.name === explicit) return true
      return (s.aliases ?? []).some(alias => alias === explicit || alias.includes(explicit) || explicit.includes(alias))
    })
    if (direct) return direct
    let best = null
    let bestScore = 0
    for (const candidate of SCENARIOS) {
      const score = keywordScore(candidate, explicit)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
    if (best) return best
  }
  return detectScene([explicit, draft, objective].filter(Boolean).join(' '))
}

export function redLine(input = '') {
  const text = String(input)
  for (const rule of RED_LINES) {
    if (rule.pattern.test(text)) return { blocked: true, code: rule.code, reason: rule.reason }
  }
  return { blocked: false }
}

function clean(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** 切句但保留原句尾标点——问句改成陈述句语气全变了，不能一起抹掉。 */
export function splitSentences(text = '') {
  return clean(text)
    .split(/(?<=[。！？!?；;\n])/u)
    .map(part => part.replace(/\n+/gu, ' ').trim())
    .filter(Boolean)
}

const ASK_RE = /请|麻烦|能否|可否|可以|希望|需要|要求|发我|提供|确认|安排|报价|回复|反馈|签字|盖章|约|见个面|对接/gu
const TIME_RE = /(今天|明天|后天|本周|下周|这周|周[一二三四五六日天]|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\d{1,2}\s*号|月底|月初|季度末|\d+\s*个工作日)/u

export function extractAsk(sentences) {
  return sentences.find(s => ASK_RE.test(s)) ?? ''
}

export function extractTime(text = '') {
  const m = TIME_RE.exec(String(text))
  return m ? m[1] : ''
}

function normalizePerson(text) {
  return text
    .replace(/你们/g, '您这边')
    .replace(/你/g, '您')
    .replace(/！+/gu, '。')
    .replace(/!+/gu, '。')
}

function soften(sentence) {
  let s = normalizePerson(sentence).trim()
  if (!s) return ''
  if (/^(麻烦|请|能否|可否|想请|劳烦)/u.test(s)) return s
  if (/^(把|给|发|告诉|提供|确认|安排|处理|回复|反馈|签字|盖章|付款|打款)/u.test(s)) {
    s = '麻烦您' + s
  }
  return s
}

export function hasCTA(text = '') {
  return /[？?]|请|麻烦|能否|可否|方便|您看|是否可以|答复|回复/u.test(text)
}

/** 体检：只报问题 + 给替代方向，不重写全文。 */
export function lint(text = '', opts = {}) {
  const findings = []
  const draft = clean(text)
  if (!draft) return findings

  for (const term of ABSOLUTE_TERMS) {
    if (draft.includes(term)) {
      findings.push({
        level: 'high',
        code: 'absolute-claim',
        term,
        advice: `「${term}」属于绝对化/保证性表述，换成可验证的事实或范围（如"比上一版降低 __%"）。`,
        basis: '《广告法》第九条禁止使用"国家级""最高级""最佳"等绝对化用语',
      })
    }
  }
  for (const term of PRESSURE_TERMS) {
    if (draft.includes(term)) {
      findings.push({
        level: 'medium',
        code: 'pressure',
        term,
        advice: `「${term}」是施压式表达。如果限制是真的，写清依据（如"报价有效期至 3 月 31 日"）；不是真的就删掉。`,
      })
    }
  }
  const vague = VAGUE_TERMS.filter(t => draft.includes(t))
  if (vague.length) {
    findings.push({
      level: 'medium',
      code: 'vague',
      term: vague.join('、'),
      advice: `把「${vague.join('、')}」换成具体日期、数量或条件，对方才可能行动。`,
    })
  }
  if (!/^[^，。]{0,8}(您好|你好|先生|女士|总|经理|老师|团队)/u.test(draft) && draft.length > 12) {
    findings.push({ level: 'low', code: 'no-address', advice: '开头没有称呼。加「张总，您好。」这类称呼，回复率通常更高。' })
  }
  if (!hasCTA(draft)) {
    findings.push({ level: 'medium', code: 'no-cta', advice: '通篇没有明确请求或问题，对方不知道要做什么。结尾给一个具体的、二选一的动作。' })
  }
  if (/你(?!们)/u.test(draft)) {
    findings.push({ level: 'low', code: 'pronoun', advice: '用了「你」，商务场景建议统一为「您」。' })
  }
  if (draft.length > 220) {
    findings.push({ level: 'low', code: 'too-long', advice: `正文 ${draft.length} 字，超过一屏。前三句说完目的，其余拆到附件或第二条。` })
  }
  if ((draft.match(/[！!]/gu) ?? []).length >= 2) {
    findings.push({ level: 'low', code: 'exclaim', advice: '感叹号偏多，读起来像催债。留一个以内。' })
  }
  if (/\d{15,19}/u.test(draft)) {
    findings.push({ level: 'high', code: 'pii', advice: '文中有疑似身份证/银行卡长数字，发出去前脱敏（只留后四位）。' })
  }
  if (/大概|预计|应该/u.test(draft) && !/\d/u.test(draft)) {
    findings.push({ level: 'medium', code: 'no-number', advice: '只有形容词没有数字。给对方一个可核对的数，可信度立刻不一样。' })
  }
  if (!/(因为|原因是|这样|所以|以便|好处|省|避免)/u.test(draft)) {
    findings.push({ level: 'low', code: 'no-why', advice: '只有请求没有理由。补一句「为什么现在要做这件事」，对方更容易配合。' })
  }
  return findings
}

const TOPIC_WORDS = [
  '报价单', '报价', '配置项', '方案', '合同', '条款', '排期', '进度', '交付', '上线',
  '付款', '回款', '发票', '续约', '续费', '调研', '选型', '评审', '试用', '样品', '验收', '会议',
]

/** 从原文里认出一个「在谈什么事」，认不出返回空串——主题行宁可用占位，也不要拼出半截话。 */
function topicOf(text = '') {
  return TOPIC_WORDS.find(word => String(text).includes(word)) ?? ''
}

/** 纯粹施压、又不带任何实质信息的句子（"麻烦尽快回复一下""我们这边好安排"）直接丢掉，
 *  留在改写稿里等于把用户的毛病抄一遍——压力和催促后面由"时间"槽用可兑现的节点替换。 */
const PRESSURE_SENTENCE = [
  /(尽快|抓紧|马上|立刻|速)[^，。；]{0,10}(回复|答复|回我|处理|确认|安排)/u,
  /^(麻烦|请)?您?(尽快|抓紧)/u,
  /我们这边(好|方便|才能)(安排|推进|操作|排期)/u,
]

function isPressureOnly(sentence = '') {
  const s = String(sentence).trim()
  if (!s) return false
  if (!PRESSURE_SENTENCE.some(re => re.test(s))) return false
  return !/[\d【]/u.test(s) && s.length <= 40
}

function bodyFromDraft(draft, name) {
  const nameRe = name ? new RegExp(`^${name}[，,、]?\\s*`, 'u') : null
  return splitSentences(draft)
    .map(sentence => {
      let s = sentence
      if (nameRe) s = s.replace(nameRe, '')
      s = s.replace(/^(您好|你好|老师好|大家好|打扰一下)[，,。！!]?\s*/u, '')
      return soften(s)
    })
    .filter(s => s && !isPressureOnly(s))
}

const EMPATHY_GENERIC = '这段时间您那边事情应该不少，我把要说的压成几句，不占您太多时间。'

export function buildVariants({ draft = '', scene, audience = '', channel = '邮件', objective = '', value = '', time = '' }) {
  const sentences = splitSentences(draft)
  const ask = extractAsk(sentences)
  const detectedTime = time || extractTime(draft)
  const name = addressOf(audience)
  const addressLine = name ? `${name}，您好。` : '您好，'
  const body = bodyFromDraft(draft, name)
  const core = body.join('').trim()
  const topic = topicOf(draft) || topicOf(value)
  const valueLine = value ? `${String(value).replace(/[。；;，,\s]+$/u, '')}。` : ''
  const timeLine = detectedTime
    ? `时间上想请您在 ${detectedTime}前给个答复，我好按这个时间铺排。`
    : '【待补：期望的时间点，别写"尽快"】'
  const conclusion = topic ? `关于${topic}，我直接说结论。` : '我直接说结论。'

  // 正文里已经有请求就不再加一句；原来的"请求"被当成施压句删掉时，用可兑现的时间点补回来。
  let askLine = ''
  if (!core) {
    askLine = ask ? soften(ask) : '【待补：具体请求，一句话说清要对方做什么】'
  } else if (!hasCTA(core)) {
    askLine = detectedTime
      ? `想请您在 ${detectedTime}前给我一个方向，哪怕只是"先放一放"也行。`
      : '想请您给我一个方向，方便的话回我一句就好。'
  }

  const v1 = [
    addressLine,
    core || askLine,
    core ? askLine : '',
    valueLine,
    detectedTime ? `如果 ${detectedTime}能给个方向就更好。` : '',
    '谢谢您。',
  ].filter(Boolean)

  const v2 = [
    addressLine,
    EMPATHY_GENERIC,
    core || askLine,
    core ? askLine : '',
    valueLine,
    detectedTime
      ? `您看是 ${detectedTime}前方便，还是往后挪到您更顺的时间？`
      : '您看这周哪天方便？我按您的时间来。',
    '不着急，您方便时回我就好。',
  ].filter(Boolean)

  const v3 = [
    addressLine,
    conclusion,
    core || askLine,
    core ? askLine : '',
    valueLine,
    timeLine,
    detectedTime
      ? `如果 ${detectedTime}前定不下来，您给我一个能定的日期，我按那个时间排。`
      : '如果您现在定不了，给我一个能定的时间，我按那个排。',
  ].filter(Boolean)

  return [
    { label: '稳健版', tone: '稳健', text: finish(v1, channel, topic) },
    { label: '亲和版', tone: '亲和', text: finish(v2, channel, topic) },
    { label: '推进版', tone: '推进', text: finish(v3, channel, topic) },
  ]
}

function finish(lines, channel, topic = '') {
  let text = lines.map(l => String(l).trim()).filter(Boolean).join('\n')
  if (channel === '邮件') {
    const subject = topic ? `关于${topic}的沟通` : '关于【事项】的沟通'
    text = `主题：${subject}\n\n${text}`
  }
  if (channel === '微信' || channel === '短信') {
    text = text.replace(/\n+/gu, '\n').trim()
    if (text.length > 180) text = text.slice(0, 180).replace(/[，、]$/u, '') + '……'
  }
  return text
}

export function renderPlan({ scene, channel, audience, objective, variants, findings, draft }) {
  const out = []
  out.push(`## 这次沟通的设计`)
  out.push(`- 场景：**${scene.name}**（${scene.whenToUse}）｜渠道：${channel}`)
  out.push(`- 目标：${objective || scene.objective}`)
  out.push(`- 对方关切：${(scene.stakeholders ?? []).join(' / ')}${audience ? `｜已知信息：${audience}` : ''}`)
  out.push('')
  out.push('## 结构骨架')
  for (const slot of scene.structure ?? []) {
    out.push(`- **${slot.slot}**：${slot.hint}　例：${slot.example}`)
  }
  out.push('')
  out.push('## 可直接发的三版')
  for (const v of variants) {
    out.push(`### ${v.label}`)
    out.push('```text')
    out.push(v.text)
    out.push('```')
  }
  if ((scene.objections ?? []).length) {
    out.push('')
    out.push('## 对方可能怎么说')
    for (const o of scene.objections) out.push(`- 「${o.trigger}」→ ${o.reply}`)
  }
  out.push('')
  out.push('## 风险与合规检查')
  if (!findings.length) out.push('- 未发现明显问题。')
  for (const f of findings) {
    const tag = f.level === 'high' ? '高' : f.level === 'medium' ? '中' : '低'
    out.push(`- [${tag}] ${f.advice}${f.basis ? `（依据：${f.basis}）` : ''}`)
  }
  out.push('')
  out.push('## 发之前先确认')
  for (const item of scene.missingInfo ?? []) out.push(`- ${item}`)
  if (draft) out.push('- 上面的三版都基于你给的原话改写，删掉了什么、加了什么请自己过一遍，别直接发。')
  out.push('')
  out.push(`> 成功标准：${scene.kpi ?? '对方给出明确答复'}`)
  return out.join('\n')
}