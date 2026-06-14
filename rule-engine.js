/**
 * rule-engine.js — 재무 계산 엔진
 *
 * LLM이 금액을 직접 계산하지 않는다.
 * Rule Engine이 금액, 기간, 달성 가능성, 부족액을 계산한다.
 *
 * 이 모듈은 순수 JavaScript 수학 연산만 수행하며, AI 호출을 포함하지 않는다.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 두 날짜 사이의 개월 수를 계산한다.
 * @param {Date} from
 * @param {Date} to
 * @returns {number} 남은 개월 수 (최소 0)
 */
function monthsBetween(from, to) {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  return Math.max(0, months);
}

/**
 * 현재 날짜로부터 N개월 후의 YYYY-MM 문자열을 반환한다.
 * @param {number} months
 * @returns {string}
 */
function addMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * YYYY-MM 문자열을 Date 객체로 변환한다.
 * @param {string} yyyyMM
 * @returns {Date}
 */
function parseYearMonth(yyyyMM) {
  const [year, month] = yyyyMM.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// calculateGoalFeasibility
// ---------------------------------------------------------------------------

/**
 * 목표 달성 가능성을 계산한다.
 *
 * @param {object} goal
 * @param {number} goal.targetAmount — 목표 금액 (원)
 * @param {number} goal.currentAmount — 현재 저축액 (원, 기본 0)
 * @param {string} goal.targetDate — 목표 날짜 (YYYY-MM)
 * @param {number} monthlyIncome — 월 수입 (원)
 * @param {number} monthlyExpense — 월 지출 (원)
 * @returns {object}
 */
export function calculateGoalFeasibility(goal, monthlyIncome, monthlyExpense) {
  const targetAmount = goal.targetAmount || 0;
  const currentAmount = goal.currentAmount || 0;
  const remaining = Math.max(0, targetAmount - currentAmount);

  const monthlySavingCapacity = Math.max(0, monthlyIncome - monthlyExpense);

  const now = new Date();
  const targetDate = goal.targetDate ? parseYearMonth(goal.targetDate) : null;
  const remainingMonths = targetDate ? monthsBetween(now, targetDate) : null;

  let requiredMonthlySaving = 0;
  if (remainingMonths !== null && remainingMonths > 0) {
    requiredMonthlySaving = Math.ceil(remaining / remainingMonths);
  } else if (remaining > 0) {
    requiredMonthlySaving = remaining; // 기간 미지정: 전액을 한 달로 간주
  }

  const shortfall = Math.max(0, requiredMonthlySaving - monthlySavingCapacity);

  let achievementStatus;
  if (remaining === 0) {
    achievementStatus = 'on-track';
  } else if (monthlySavingCapacity <= 0) {
    achievementStatus = 'at-risk';
  } else {
    const ratio = requiredMonthlySaving / monthlySavingCapacity;
    if (ratio <= 1) {
      achievementStatus = 'on-track';
    } else if (ratio <= 1.5) {
      achievementStatus = 'warning';
    } else {
      achievementStatus = 'at-risk';
    }
  }

  let expectedAchievementDate = null;
  if (remaining === 0) {
    expectedAchievementDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  } else if (monthlySavingCapacity > 0) {
    const monthsNeeded = Math.ceil(remaining / monthlySavingCapacity);
    expectedAchievementDate = addMonths(monthsNeeded);
  }

  return {
    monthlySavingCapacity,
    requiredMonthlySaving,
    remainingMonths,
    shortfall,
    achievementStatus,
    expectedAchievementDate,
  };
}

// ---------------------------------------------------------------------------
// generateScenarios
// ---------------------------------------------------------------------------

/**
 * What-if 시나리오를 생성한다.
 *
 * @param {object} goal — { targetAmount, currentAmount, targetDate }
 * @param {object} profile — { monthlyIncome, monthlyExpense, subscriptions, deliveryDining }
 * @param {object} [adjustments] — 선택적 조정값
 * @param {number} [adjustments.subscriptionReduction] — 구독 절감 비율 (0~1, 기본 0.5)
 * @param {number} [adjustments.deliveryDiningReduction] — 배달/외식 절감 비율 (0~1, 기본 0.3)
 * @param {number} [adjustments.extensionMonths] — 목표 기간 연장 개월 수 (기본 6)
 * @returns {Array<object>}
 */
export function generateScenarios(goal, profile, adjustments = {}) {
  const targetAmount = goal.targetAmount || 0;
  const currentAmount = goal.currentAmount || 0;
  const remaining = Math.max(0, targetAmount - currentAmount);

  const monthlyIncome = profile.monthlyIncome || 0;
  const monthlyExpense = profile.monthlyExpense || 0;
  const subscriptions = profile.subscriptions || 0;
  const deliveryDining = profile.deliveryDining || 0;

  const baseSaving = Math.max(0, monthlyIncome - monthlyExpense);

  const subscriptionReduction = clamp(adjustments.subscriptionReduction ?? 0.5, 0, 1);
  const deliveryDiningReduction = clamp(adjustments.deliveryDiningReduction ?? 0.3, 0, 1);
  const extensionMonths = adjustments.extensionMonths ?? 6;

  const now = new Date();
  const targetDate = goal.targetDate ? parseYearMonth(goal.targetDate) : null;
  const baseRemainingMonths = targetDate ? monthsBetween(now, targetDate) : null;

  function computeExpectedDate(monthlySaving) {
    if (remaining === 0) return addMonths(0);
    if (monthlySaving <= 0) return null;
    return addMonths(Math.ceil(remaining / monthlySaving));
  }

  function computeImpactMonths(monthlySaving) {
    if (remaining === 0) return 0;
    if (monthlySaving <= 0) return null;
    const months = Math.ceil(remaining / monthlySaving);
    if (baseSaving <= 0) return null;
    const baseMonths = Math.ceil(remaining / baseSaving);
    return baseMonths - months;
  }

  const scenarios = [];

  // 1. 현재 흐름 유지
  scenarios.push({
    name: '현재 흐름 유지',
    description: '지출 패턴을 변경하지 않고 현재 저축 여력으로 진행합니다.',
    monthlySaving: baseSaving,
    expectedDate: computeExpectedDate(baseSaving),
    impactMonths: 0,
    monthlyImpact: 0,
  });

  // 2. 구독 서비스 절감
  const subSaved = Math.round(subscriptions * subscriptionReduction);
  const subSaving = baseSaving + subSaved;
  scenarios.push({
    name: '구독 서비스 절감',
    description: `구독료의 ${Math.round(subscriptionReduction * 100)}%를 절감합니다 (월 ${subSaved.toLocaleString()}원 절약).`,
    monthlySaving: subSaving,
    expectedDate: computeExpectedDate(subSaving),
    impactMonths: computeImpactMonths(subSaving),
    monthlyImpact: subSaved,
  });

  // 3. 배달/외식 절감
  const ddSaved = Math.round(deliveryDining * deliveryDiningReduction);
  const ddSaving = baseSaving + ddSaved;
  scenarios.push({
    name: '배달/외식 절감',
    description: `배달·외식비의 ${Math.round(deliveryDiningReduction * 100)}%를 절감합니다 (월 ${ddSaved.toLocaleString()}원 절약).`,
    monthlySaving: ddSaving,
    expectedDate: computeExpectedDate(ddSaving),
    impactMonths: computeImpactMonths(ddSaving),
    monthlyImpact: ddSaved,
  });

  // 4. 복합 절감
  const combinedSaved = subSaved + ddSaved;
  const combinedSaving = baseSaving + combinedSaved;
  scenarios.push({
    name: '복합 절감',
    description: `구독료와 배달·외식비를 동시에 절감합니다 (월 ${combinedSaved.toLocaleString()}원 절약).`,
    monthlySaving: combinedSaving,
    expectedDate: computeExpectedDate(combinedSaving),
    impactMonths: computeImpactMonths(combinedSaving),
    monthlyImpact: combinedSaved,
  });

  // 5. 목표 기간 연장
  if (baseRemainingMonths !== null) {
    const extendedMonths = baseRemainingMonths + extensionMonths;
    const extendedMonthlySaving =
      extendedMonths > 0 ? Math.ceil(remaining / extendedMonths) : remaining;
    const monthlySavingDiff = Math.max(0, (baseRemainingMonths > 0
      ? Math.ceil(remaining / baseRemainingMonths)
      : remaining) - extendedMonthlySaving);

    scenarios.push({
      name: '목표 기간 연장',
      description: `목표 달성 기한을 ${extensionMonths}개월 연장하여 월 부담을 줄입니다 (월 ${monthlySavingDiff.toLocaleString()}원 부담 감소).`,
      monthlySaving: extendedMonthlySaving,
      expectedDate: addMonths(extendedMonths),
      impactMonths: -extensionMonths,
      monthlyImpact: -monthlySavingDiff,
    });
  } else {
    // 목표 기간 미설정 시
    scenarios.push({
      name: '목표 기간 연장',
      description: '목표 기한이 설정되지 않아 기간 연장 시나리오를 계산할 수 없습니다.',
      monthlySaving: baseSaving,
      expectedDate: computeExpectedDate(baseSaving),
      impactMonths: 0,
      monthlyImpact: 0,
    });
  }

  return scenarios;
}

// ---------------------------------------------------------------------------
// classifyTransaction
// ---------------------------------------------------------------------------

/**
 * 거래를 분류한다.
 *
 * @param {object} transaction — { amount, category, merchant, date, description }
 * @param {Array<object>} history — 과거 거래 내역
 * @returns {object} { classification, confidence, recurrenceScore, adjustability }
 */
export function classifyTransaction(transaction, history = []) {
  const amount = Math.abs(transaction.amount || 0);
  const category = (transaction.category || '').toLowerCase();
  const merchant = (transaction.merchant || '').toLowerCase();
  const description = (transaction.description || '').toLowerCase();

  // --- 반복성 판단 ---
  const matchingHistory = history.filter((h) => {
    const hMerchant = (h.merchant || '').toLowerCase();
    const hCategory = (h.category || '').toLowerCase();
    return (
      (merchant && hMerchant === merchant) ||
      (category && hCategory === category && Math.abs((h.amount || 0) - amount) / Math.max(amount, 1) < 0.1)
    );
  });

  const recurrenceScore = clamp(matchingHistory.length / 3, 0, 1);
  const isRecurring = recurrenceScore >= 0.5;

  // --- 필수 지출 판단 ---
  const essentialKeywords = [
    '월세', '관리비', '전기', '수도', '가스', '통신', '보험', '교통',
    '의료', '약국', '병원', '학비', '등록금', '대출', '이자',
    'rent', 'utility', 'insurance', 'medical', 'loan',
  ];

  const adjustableKeywords = [
    '커피', '카페', '배달', '외식', '택시', '쇼핑', '구독',
    '넷플릭스', '유튜브', '게임', '엔터테인먼트', '취미',
    'coffee', 'delivery', 'dining', 'subscription', 'entertainment',
  ];

  const combined = `${category} ${merchant} ${description}`;
  const isEssential = essentialKeywords.some((kw) => combined.includes(kw));
  const isAdjustable = adjustableKeywords.some((kw) => combined.includes(kw));

  // --- 분류 결정 ---
  let classification;
  if (isEssential) {
    classification = isRecurring ? 'recurring' : 'essential';
  } else if (isAdjustable) {
    classification = 'adjustable';
  } else if (isRecurring) {
    classification = 'recurring';
  } else {
    classification = 'one-time';
  }

  // --- 조정 가능성 ---
  let adjustability;
  if (isEssential) {
    adjustability = 'low';
  } else if (isAdjustable) {
    adjustability = 'high';
  } else if (isRecurring) {
    adjustability = 'medium';
  } else {
    adjustability = 'medium';
  }

  // --- 신뢰도 ---
  let confidence = 0.5;
  if (isEssential || isAdjustable) confidence += 0.3;
  if (isRecurring) confidence += 0.1;
  if (merchant) confidence += 0.1;
  confidence = clamp(confidence, 0, 1);

  return {
    classification,
    confidence: Math.round(confidence * 100) / 100,
    recurrenceScore: Math.round(recurrenceScore * 100) / 100,
    adjustability,
  };
}

// ---------------------------------------------------------------------------
// calculateCashflow
// ---------------------------------------------------------------------------

/**
 * N개월간의 월별 현금흐름을 계산한다.
 *
 * @param {Array<object>} transactions — { amount, date, type? }
 *   amount > 0 = 수입, amount < 0 = 지출 (또는 type: 'income'|'expense' 으로 구분)
 * @param {number} [months=6] — 분석 기간 (개월)
 * @returns {object}
 */
export function calculateCashflow(transactions = [], months = 6) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  // 월별 버킷 초기화
  const buckets = new Map();
  for (let i = 0; i < months; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, { month: key, income: 0, expense: 0, balance: 0 });
  }

  // 거래 분류 및 합산
  for (const tx of transactions) {
    const txDate = new Date(tx.date);
    if (txDate < startDate || txDate > now) continue;

    const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;

    const amount = tx.amount || 0;
    const isIncome =
      tx.type === 'income' || (tx.type == null && amount > 0);

    if (isIncome) {
      bucket.income += Math.abs(amount);
    } else {
      bucket.expense += Math.abs(amount);
    }
  }

  // 잔액 계산
  const monthsData = [];
  for (const bucket of buckets.values()) {
    bucket.balance = bucket.income - bucket.expense;
    // 원 단위 반올림
    bucket.income = Math.round(bucket.income);
    bucket.expense = Math.round(bucket.expense);
    bucket.balance = Math.round(bucket.balance);
    monthsData.push(bucket);
  }

  const validMonths = monthsData.filter((m) => m.income > 0 || m.expense > 0);
  const count = validMonths.length || 1;

  const averageIncome = Math.round(
    validMonths.reduce((sum, m) => sum + m.income, 0) / count,
  );
  const averageExpense = Math.round(
    validMonths.reduce((sum, m) => sum + m.expense, 0) / count,
  );

  // 추세 판단: 최근 3개월 잔액 평균 vs 이전 잔액 평균
  let trend = 'stable';
  if (validMonths.length >= 4) {
    const mid = Math.floor(validMonths.length / 2);
    const earlyAvg =
      validMonths.slice(0, mid).reduce((s, m) => s + m.balance, 0) / mid;
    const lateAvg =
      validMonths.slice(mid).reduce((s, m) => s + m.balance, 0) /
      (validMonths.length - mid);
    const diff = lateAvg - earlyAvg;
    const threshold = averageIncome * 0.05 || 50000;

    if (diff > threshold) {
      trend = 'improving';
    } else if (diff < -threshold) {
      trend = 'declining';
    }
  }

  return {
    months: monthsData,
    averageIncome,
    averageExpense,
    trend,
  };
}

// ---------------------------------------------------------------------------
// assessRisk
// ---------------------------------------------------------------------------

/**
 * 목표의 리스크 수준을 평가한다.
 *
 * @param {object} goal — { targetAmount, currentAmount, targetDate }
 * @param {object} profile — { monthlyIncome, monthlyExpense, totalDebt, emergencyFund }
 * @returns {object} { riskLevel, requiresHumanReview, reason }
 */
export function assessRisk(goal, profile) {
  const targetAmount = goal.targetAmount || 0;
  const currentAmount = goal.currentAmount || 0;
  const monthlyIncome = profile.monthlyIncome || 0;
  const monthlyExpense = profile.monthlyExpense || 0;
  const totalDebt = profile.totalDebt || 0;
  const emergencyFund = profile.emergencyFund || 0;

  const remaining = Math.max(0, targetAmount - currentAmount);
  const monthlySaving = Math.max(0, monthlyIncome - monthlyExpense);

  const reasons = [];
  let score = 0; // 0 = low risk, higher = more risk

  // 1. 저축 여력 대비 목표 금액
  if (monthlySaving <= 0) {
    score += 40;
    reasons.push('월 저축 여력이 없습니다 (지출이 수입 이상).');
  } else {
    const monthsNeeded = remaining / monthlySaving;
    const targetDate = goal.targetDate ? parseYearMonth(goal.targetDate) : null;
    const remainingMonths = targetDate ? monthsBetween(new Date(), targetDate) : null;

    if (remainingMonths !== null && monthsNeeded > remainingMonths * 1.5) {
      score += 30;
      reasons.push('현재 저축 속도로는 목표 기한 내 달성이 어렵습니다.');
    } else if (remainingMonths !== null && monthsNeeded > remainingMonths) {
      score += 15;
      reasons.push('목표 달성이 빠듯합니다. 지출 조정이 필요할 수 있습니다.');
    }
  }

  // 2. 부채 비율
  if (monthlyIncome > 0) {
    const debtToIncomeRatio = totalDebt / (monthlyIncome * 12);
    if (debtToIncomeRatio > 3) {
      score += 25;
      reasons.push('부채가 연소득의 3배를 초과합니다.');
    } else if (debtToIncomeRatio > 1.5) {
      score += 15;
      reasons.push('부채가 연소득의 1.5배를 초과합니다.');
    }
  }

  // 3. 비상금 수준
  if (monthlyExpense > 0) {
    const emergencyMonths = emergencyFund / monthlyExpense;
    if (emergencyMonths < 1) {
      score += 20;
      reasons.push('비상자금이 1개월 생활비 미만입니다.');
    } else if (emergencyMonths < 3) {
      score += 10;
      reasons.push('비상자금이 3개월 생활비 미만입니다.');
    }
  }

  // 4. 지출 비율
  if (monthlyIncome > 0) {
    const expenseRatio = monthlyExpense / monthlyIncome;
    if (expenseRatio > 0.95) {
      score += 15;
      reasons.push('지출이 수입의 95% 이상입니다.');
    } else if (expenseRatio > 0.8) {
      score += 5;
      reasons.push('지출이 수입의 80% 이상입니다.');
    }
  }

  // 리스크 레벨 결정
  let riskLevel;
  if (score >= 60) {
    riskLevel = 'critical';
  } else if (score >= 35) {
    riskLevel = 'high';
  } else if (score >= 15) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  const requiresHumanReview = riskLevel === 'critical' || riskLevel === 'high';

  return {
    riskLevel,
    requiresHumanReview,
    reason: reasons.length > 0 ? reasons.join(' ') : '특이 위험 요소가 발견되지 않았습니다.',
  };
}
