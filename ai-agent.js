/**
 * ai-agent.js — AI API 통합 모듈
 *
 * Groq 및 OpenRouter를 통한 LLM 호출을 전담한다.
 * 금액 계산은 하지 않으며, 자연어 해석·보고서·맥락 분석만 수행한다.
 */

const STORAGE_KEY = 'jb-pacemaker-ai-config';

const PROVIDERS = {
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
  },
};

const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const aiConfig = {
  provider: globalThis.JB_AI_CONFIG?.provider || 'groq',
  apiKey: globalThis.JB_AI_CONFIG?.apiKey || '',
  model: globalThis.JB_AI_CONFIG?.model || '',
};

function loadPersistedConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.provider) aiConfig.provider = saved.provider;
      if (saved.apiKey)   aiConfig.apiKey   = saved.apiKey;
      if (saved.model)    aiConfig.model    = saved.model;
    }
  } catch { /* localStorage 접근 불가 환경에서는 무시 */ }
}

loadPersistedConfig();

export function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aiConfig));
  } catch {
    console.warn('[ai-agent] localStorage에 설정을 저장할 수 없습니다.');
  }
}

export function setProvider(provider) {
  if (!PROVIDERS[provider]) {
    throw new Error(`지원하지 않는 AI 제공자입니다: ${provider}. 'groq' 또는 'openrouter'를 사용하세요.`);
  }
  aiConfig.provider = provider;
  aiConfig.model = '';
  saveConfig();
}

export function setApiKey(key) {
  aiConfig.apiKey = key;
  saveConfig();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getProviderConfig() {
  const cfg = PROVIDERS[aiConfig.provider];
  if (!cfg) throw new Error('AI 제공자가 설정되지 않았습니다.');
  return cfg;
}

function getModel() {
  return aiConfig.model || getProviderConfig().defaultModel;
}

function extractJSON(text) {
  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)```/;
  const fenceMatch = text.match(fenceRegex);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : text.trim();
  return JSON.parse(cleaned);
}

async function callLLM(messages, { temperature = 0.3 } = {}) {
  if (!aiConfig.apiKey) {
    throw new Error('API 키가 설정되지 않았습니다. setApiKey()로 키를 설정해 주세요.');
  }

  const provider = getProviderConfig();
  const model = getModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`AI API 오류 (${response.status}): ${errorBody || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI 응답에서 내용을 찾을 수 없습니다.');
    return extractJSON(content);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('AI 요청이 시간 초과되었습니다 (15초). 네트워크 상태를 확인해 주세요.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// parseGoal (명세 6.3)
// ---------------------------------------------------------------------------

const PARSE_GOAL_SYSTEM_PROMPT = `당신은 한국어 재무 목표 분석 전문가입니다.

사용자가 자연어로 재무 목표를 입력합니다. 입력에는 여러 조건이 포함될 수 있습니다.
모든 조건을 종합하여 하나의 목표로 통합하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "goalName": "목표 이름 (간결하게)",
  "goalType": "여행|결혼|자동차|대출상환|은퇴준비|교육|주택|기타 중 하나",
  "targetAmount": 숫자(원 단위, 숫자만),
  "targetDate": "YYYY-MM 형식 또는 null",
  "confidence": 0.0~1.0 사이의 숫자,
  "replyMessage": "사용자에게 보낼 친근한 확인 메시지"
}

규칙:
- goalType은 반드시 위 목록 중 하나여야 합니다.
- targetAmount는 반드시 숫자여야 합니다. '5억'은 500000000, '3천만원'은 30000000입니다.
- targetDate가 불명확하면 null로 설정하세요.
- confidence는 입력 내용이 얼마나 명확한지를 나타냅니다.
- replyMessage는 사용자의 목표를 요약하고 격려하는 짧은 한국어 문장입니다.`;

export async function parseGoal(naturalLanguageInput) {
  try {
    return await callLLM(
      [
        { role: 'system', content: PARSE_GOAL_SYSTEM_PROMPT },
        { role: 'user',   content: naturalLanguageInput },
      ],
      { temperature: 0.3 },
    );
  } catch (err) {
    console.error('[ai-agent] parseGoal 실패, 폴백 처리:', err.message);
    return buildGoalFallback(naturalLanguageInput, err.message);
  }
}

function buildGoalFallback(input, errorMessage) {
  let targetAmount = 0;
  let goalType = '기타';
  let goalName = input.slice(0, 30);

  const amountPatterns = [
    { regex: /(\d+(?:\.\d+)?)\s*억/g,              multiplier: 100_000_000 },
    { regex: /(\d+(?:,\d{3})*(?:\.\d+)?)\s*천만/g, multiplier: 10_000_000  },
    { regex: /(\d+(?:,\d{3})*(?:\.\d+)?)\s*백만/g, multiplier: 1_000_000   },
    { regex: /(\d+(?:,\d{3})*(?:\.\d+)?)\s*만/g,   multiplier: 10_000      },
  ];

  for (const { regex, multiplier } of amountPatterns) {
    const match = regex.exec(input);
    if (match) {
      targetAmount = parseFloat(match[1].replace(/,/g, '')) * multiplier;
      break;
    }
  }

  let targetDate = null;
  const dateMatch = input.match(/(\d{4})[-년]\s*(\d{1,2})월?/);
  if (dateMatch) {
    targetDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}`;
  }

  const typeKeywords = {
    여행:    ['여행', '해외', '유럽', '일본', '미국'],
    결혼:    ['결혼', '웨딩', '혼수'],
    자동차:  ['자동차', '차량', '차', '중고차'],
    대출상환: ['대출', '빚', '상환', '갚'],
    은퇴준비: ['은퇴', '노후', '연금'],
    교육:    ['교육', '학비', '유학', '등록금'],
    주택:    ['주택', '아파트', '집', '전세', '월세', '부동산'],
  };

  for (const [type, keywords] of Object.entries(typeKeywords)) {
    if (keywords.some(kw => input.includes(kw))) { goalType = type; break; }
  }

  return {
    goalName, goalType, targetAmount, targetDate,
    confidence: 0.3,
    replyMessage: 'AI 분석에 실패하여 기본값으로 설정했습니다. 목표를 수동으로 확인해 주세요.',
    isError: true,
    errorDetail: errorMessage,
  };
}

// ---------------------------------------------------------------------------
// generateReport (명세 6.10)
// ---------------------------------------------------------------------------

const REPORT_SYSTEM_PROMPT = `당신은 따뜻하고 공감 능력이 뛰어난 한국어 재무 상담사입니다.

사용자의 재무 프로필, 질문 응답, 맥락 기억을 바탕으로 공감적인 재무 리포트를 작성하세요.

절대 규칙:
- 투자 추천을 하지 마세요. (주식, 펀드, 코인, 부동산 투자 등 일체 금지)
- 구체적 금융 상품을 추천하지 마세요.
- 사용자의 감정과 상황에 공감하세요.
- 격려와 실행 가능한 생활 습관 개선 제안에 집중하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "paragraphs": ["문단1", "문단2", ...],
  "conclusion": "종합 결론 한 문장",
  "riskLevel": "low|medium|high|critical 중 하나"
}

paragraphs는 3~5개의 문단으로 구성하세요. 각 문단은 자연스러운 한국어 문장이어야 합니다.`;

export async function generateReport(profile, answers, contextMemories) {
  const userContent = JSON.stringify({ profile, answers: answers || [], contextMemories: contextMemories || [] }, null, 2);
  try {
    return await callLLM(
      [{ role: 'system', content: REPORT_SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { temperature: 0.7 },
    );
  } catch (err) {
    console.error('[ai-agent] generateReport 실패:', err.message);
    return {
      paragraphs: ['리포트 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', `오류 내용: ${err.message}`],
      conclusion: '리포트를 생성할 수 없습니다.',
      riskLevel: 'medium',
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// analyzeContext (명세 4.2 Context Question Agent)
// ---------------------------------------------------------------------------

const CONTEXT_SYSTEM_PROMPT = `당신은 한국어 재무 맥락 분석 전문가입니다.

사용자의 거래 내역에 대한 질문과 답변을 분석하여 인사이트를 도출하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "insight": "이 거래/답변에서 발견한 핵심 인사이트",
  "classification": "필수지출|선택지출|저축|투자|수입|기타 중 하나",
  "impact": "positive|neutral|negative 중 하나",
  "memoryNote": "향후 참고할 짧은 메모"
}

규칙:
- 사용자의 답변을 존중하고 판단하지 마세요.
- insight는 2~3문장으로 작성하세요.
- memoryNote는 한 문장으로 작성하세요.`;

export async function analyzeContext(transaction, question, userAnswer) {
  const userContent = JSON.stringify({ transaction, question, userAnswer }, null, 2);
  try {
    return await callLLM(
      [{ role: 'system', content: CONTEXT_SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { temperature: 0.3 },
    );
  } catch (err) {
    console.error('[ai-agent] analyzeContext 실패:', err.message);
    return {
      insight: '맥락 분석에 실패했습니다.',
      classification: '기타',
      impact: 'neutral',
      memoryNote: `분석 실패: ${err.message}`,
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// generateConsultationBrief (명세 6.12 — 상담 브리프 생성)
// ---------------------------------------------------------------------------

const CONSULTATION_BRIEF_PROMPT = `당신은 한국어 재무 상담 보조 전문가입니다.

고객의 목표, 현금흐름, 맥락 기억, 리스크 평가를 바탕으로 상담원이 빠르게 파악할 수 있는
1페이지 상담 브리프를 작성하세요.

절대 규칙:
- 대출 승인·거절, 투자 적합성 판단 등 최종 금융 판단을 내리지 마세요.
- 상담원에게 제공되는 보조 자료임을 명시하세요.
- 고객 동의 하에 공유되는 자료임을 전제로 작성하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "goalSummary": "고객 목표 요약 (1~2문장)",
  "cashflowSummary": "현금흐름 요약 (소득, 지출, 저축여력)",
  "recentChanges": ["최근 주요 지출 변화 항목1", "항목2"],
  "contextSummary": ["저장된 생활 맥락 요약1", "요약2"],
  "riskSummary": "위험도 및 상담 필요 사유",
  "consultationGuide": "상담 진행 시 참고사항 (RAG 기반, 상품 확정 금지)",
  "disclaimer": "이 브리프는 상담 보조 자료이며 대출·투자 판단의 근거로 단독 사용할 수 없습니다."
}`;

/**
 * 상담원용 1페이지 브리프를 생성한다. (명세 6.12)
 *
 * @param {object} goal              — 고객 목표
 * @param {object} profile           — 재무 프로필
 * @param {object} cashflow          — calculateCashflow 결과
 * @param {Array}  contextMemories   — Context Memory 목록
 * @param {object} riskAssessment    — assessRisk 결과
 * @returns {Promise<object>}
 */
export async function generateConsultationBrief(goal, profile, cashflow, contextMemories, riskAssessment) {
  const userContent = JSON.stringify({ goal, profile, cashflow, contextMemories: contextMemories || [], riskAssessment }, null, 2);
  try {
    return await callLLM(
      [{ role: 'system', content: CONSULTATION_BRIEF_PROMPT }, { role: 'user', content: userContent }],
      { temperature: 0.4 },
    );
  } catch (err) {
    console.error('[ai-agent] generateConsultationBrief 실패:', err.message);
    return {
      goalSummary: '목표 정보를 불러올 수 없습니다.',
      cashflowSummary: '현금흐름 분석 실패.',
      recentChanges: [],
      contextSummary: [],
      riskSummary: `분석 실패: ${err.message}`,
      consultationGuide: '상담 전 수동으로 고객 정보를 확인해 주세요.',
      disclaimer: '이 브리프는 상담 보조 자료이며 대출·투자 판단의 근거로 단독 사용할 수 없습니다.',
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// generateCashflowStabilityReport (명세 6.13 — 현금흐름 안정성 요약)
// ---------------------------------------------------------------------------

const CASHFLOW_STABILITY_PROMPT = `당신은 한국어 재무 분석 전문가입니다.

고객의 현금흐름 데이터를 바탕으로 상환 여력과 생활비 안정성을 설명하는 요약을 작성하세요.

절대 규칙:
- 대출 승인·거절, 신용평가 점수 산정에 직접 활용하는 지표가 아님을 명시하세요.
- 상담원 및 심사 담당자의 보조 자료로만 제공됨을 전제로 작성하세요.
- 의료비, 가족지원비 등 민감 지출은 상세 상호명 없이 카테고리 수준으로만 기술하세요.
- 투자 권유, 대출 권유를 하지 마세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "fixedExpenseRatio": "필수 고정비 유지율 설명 (수치 포함)",
  "regularPaymentPattern": "정기 납부 규칙성 설명",
  "adjustableExpenseFlexibility": "조절 가능 지출의 탄력성 설명",
  "monthlySavingCapacity": "월 저축 가능액 설명",
  "trendSummary": "최근 3~6개월 지출 구조 변화 요약",
  "contextBasedExclusions": ["일회성으로 확인된 지출 항목 (카테고리만)"],
  "disclaimer": "이 요약은 상담 보조 자료이며 신용평가 자동 반영 또는 대출 심사 자동 결정에 사용되지 않습니다."
}`;

/**
 * 현금흐름 안정성 요약을 생성한다. (명세 6.13)
 * 자동차 구매·대출상환 목표에서 상담 보조 자료로 활용.
 *
 * @param {object} profile        — { monthlyIncome, monthlyExpense }
 * @param {object} cashflow       — calculateCashflow 결과
 * @param {object} goal           — 고객 목표
 * @param {Array}  contextMemories — Context Memory 목록
 * @returns {Promise<object>}
 */
export async function generateCashflowStabilityReport(profile, cashflow, goal, contextMemories) {
  const userContent = JSON.stringify({ profile, cashflow, goal, contextMemories: contextMemories || [] }, null, 2);
  try {
    return await callLLM(
      [{ role: 'system', content: CASHFLOW_STABILITY_PROMPT }, { role: 'user', content: userContent }],
      { temperature: 0.3 },
    );
  } catch (err) {
    console.error('[ai-agent] generateCashflowStabilityReport 실패:', err.message);
    return {
      fixedExpenseRatio: '분석 실패.',
      regularPaymentPattern: '분석 실패.',
      adjustableExpenseFlexibility: '분석 실패.',
      monthlySavingCapacity: '분석 실패.',
      trendSummary: `오류: ${err.message}`,
      contextBasedExclusions: [],
      disclaimer: '이 요약은 상담 보조 자료이며 신용평가 자동 반영 또는 대출 심사 자동 결정에 사용되지 않습니다.',
      isError: true,
    };
  }
}
