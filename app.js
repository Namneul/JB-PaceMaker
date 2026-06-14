/**
 * JB Pacemaker — Main Application
 * 명세서_JB_Pacemaker_수정방향반영본 기반 MVP
 * front/index.html + front/styles.css + ai/ai-agent.js + ai/rule-engine.js
 *
 * [변경 내역 vs 이전 버전]
 * - assessRisk() 호출 및 목표 화면 리스크 뱃지 반영 (명세 9.2)
 * - generateScenarios() 호출로 시나리오 동적 계산 (명세 6.9)
 * - analyzeContext() import 및 질문 답변 시 AI 맥락 분석 연동 (명세 4.2)
 * - generateConsultationBrief() — 상담 브리프 생성 버튼/모달 (명세 6.12)
 * - generateCashflowStabilityReport() — 현금흐름 안정성 요약 (명세 6.13)
 * - calculateCashflow() import 및 내 자산 탭 트렌드 연동 (명세 6.4)
 * - Context Memory 삭제 이벤트 핸들러 추가 (명세 6.14)
 * - AI 리포트 생성 버튼 (generateReport 실제 호출) (명세 6.10)
 * - 고위험 목표 상담 연결 버튼 표시 (명세 6.11)
 */

import {
  aiConfig,
  parseGoal, generateReport, analyzeContext,
  generateConsultationBrief, generateCashflowStabilityReport,
} from './ai-agent.js';

import {
  calculateGoalFeasibility,
  generateScenarios,
  calculateCashflow,
  assessRisk,
} from './rule-engine.js';

// ── Profile Data ──
const profiles = {
  starter: {
    stage: "사회초년생", name: "김지현", age: 29, avatar: "김",
    hero: { title: "지출은 늘었지만, 모두 과소비는 아니에요.", description: "여행비는 일회성으로 보이고, 다음 달에도 이어질 가능성이 높은 변화는 구독료와 배달비 11만 원입니다." },
    metrics: { income: 3420000, expense: 2360000, expenseDelta: 320000, context: 76 },
    cashflow: { months: ["1월","2월","3월","4월","5월","6월"], income: [335,340,340,342,342,342], expense: [198,205,201,213,204,236] },
    categories: [
      { name: "생활/식비",  value: 74, color: "#3b82f6" },
      { name: "주거/고정비", value: 57, color: "#2563eb" },
      { name: "여행/이동",  value: 42, color: "#f59e0b" },
      { name: "의료/보험",  value: 31, color: "#60a5fa" },
      { name: "기타",      value: 32, color: "#94a3b8" },
    ],
    // 목표 데이터 (rule-engine calculateGoalFeasibility / generateScenarios 용)
    goal: {
      targetAmount: 30000000,
      currentAmount: 1250000,
      targetDate: '2028-03',
      goalType: '주택',
    },
    // generateScenarios 에 필요한 지출 상세
    expenseDetail: { subscriptions: 400000, deliveryDining: 700000 },
    memories: [
      { id: "goal",       icon: "목", title: "전세자금 목표",  detail: "2028년 3월까지 3,000만 원",  source: "사용자 설정" },
      { id: "payday",     icon: "급", title: "급여일",        detail: "매월 25일, 평균 342만 원",   source: "거래 패턴" },
      { id: "housing",    icon: "주", title: "고정 주거비",   detail: "월세/관리비 매월 68만 원",   source: "반복 거래" },
      { id: "preference", icon: "알", title: "알림 선호",     detail: "주 1회, 큰 변화만 알림",     source: "사용자 설정" },
    ],
    questions: [
      { id: "travel", title: "이번 숙박/교통비 35만 원은 계획된 여행비인가요?", description: "평소보다 큰 이동/숙박 지출이 한 번에 발생했어요.", options: [
        { value: "one-time",  label: "네, 계획한 여행이에요",    memory: "6월 여행비 35만 원은 계획된 일회성 지출",       result: "여행비를 구조적 소비 증가에서 제외했습니다." },
        { value: "recurring", label: "앞으로도 반복될 수 있어요", memory: "이동/숙박비 증가가 당분간 반복될 가능성",         result: "다음 달 예상 지출에 여행/이동비를 반영했습니다." },
      ]},
      { id: "medical", title: "최근 병원비는 일회성 검진인가요, 반복될 치료비인가요?", description: "의료비가 3개월 연속 늘어 지출 성격 확인이 필요해요.", options: [
        { value: "one-time",  label: "일회성 검진이에요",          memory: "6월 병원비는 일회성 건강검진 비용",            result: "의료비를 다음 달 예상 지출에서 제외했습니다." },
        { value: "essential", label: "당분간 반복될 치료비예요",    memory: "월 18만 원의 치료비가 3개월가량 반복될 예정",   result: "의료비를 새로운 필수 생활비로 반영했습니다." },
      ]},
      { id: "subscription", title: "새로 발견된 구독 2건을 계속 이용할 예정인가요?", description: "두 달 연속 결제됐지만 사용 빈도는 낮게 나타났어요.", options: [
        { value: "recurring",  label: "계속 이용할게요",   memory: "신규 구독 2건, 월 4만 원을 의도한 반복지출로 유지", result: "구독료를 계획된 반복지출로 기억합니다." },
        { value: "adjustable", label: "하나는 정리할게요", memory: "신규 구독 중 1건을 다음 결제 전 정리할 예정",       result: "다음 달 예상 잔여금액에 2만 원을 반영했습니다." },
      ]},
    ],
    actions: [
      { key: "travel",       title: "제주 스테이 350,000원",        description: "계획된 여행비로 보이는 일회성 지출", impactLabel: "반복 제외" },
      { key: "subscription", title: "무비플러스·클라우드박스 40,000원", description: "새로 잡힌 반복 결제 후보",           impactLabel: "확인 필요" },
      { key: "delivery",     title: "오늘배달 46,000원",             description: "최근 평균보다 커진 조정 가능 소비",     impactLabel: "조정 후보" },
      { key: "combined",     title: "구독 1건 + 배달비 조정",        description: "반복 후보를 줄이면 목표 저축 여력이 늘어납니다.", impact: 90000 },
    ],
    transactions: [
      { date: "06.25", merchant: "JB 급여",       category: "급여",      amount:  3420000, type: "income",  tag: "rec" },
      { date: "06.22", merchant: "제주 스테이",    category: "여행/숙박",  amount:  -350000, type: "expense", tag: "ctx" },
      { date: "06.20", merchant: "한빛 정형외과",  category: "의료",      amount:  -180000, type: "expense", tag: "ctx" },
      { date: "06.18", merchant: "무비플러스",     category: "구독",      amount:   -19000, type: "expense", tag: "rec" },
      { date: "06.17", merchant: "클라우드박스",   category: "구독",      amount:   -21000, type: "expense", tag: "rec" },
      { date: "06.16", merchant: "오늘배달",       category: "배달/외식",  amount:   -46000, type: "expense", tag: "rec" },
      { date: "06.10", merchant: "해오름 주택",    category: "주거",      amount:  -680000, type: "expense", tag: "ess" },
      { date: "06.07", merchant: "코레일",         category: "교통",      amount:   -72000, type: "expense", tag: "one" },
    ],
    report: {
      monthly: [
        "6월 총지출은 지난달보다 <strong>32만 원 늘었습니다.</strong> 하지만 증가액 전체를 과소비로 보기는 어렵습니다.",
        "여행/숙박비 35만 원과 의료비 18만 원의 성격을 먼저 확인해야 합니다. 반면 구독료 4만 원과 배달비 7만 원은 다음 달에도 이어질 가능성이 높은 변화입니다.",
        "현재 유입은 평소 범위 안에 있습니다. 따라서 소득 변화보다 <strong>새로 생긴 반복지출을 어떻게 다룰지</strong>가 다음 달 현금흐름을 결정합니다.",
      ],
      weekly: [
        "이번 주 지출은 평소보다 <strong>8만 원 많았습니다.</strong> 배달/외식비 증가가 대부분을 차지했습니다.",
        "여행 일정에 포함된 교통비는 일회성으로 분리했습니다. 반복될 가능성이 높은 지출만 다음 주 분석에 이어서 반영합니다.",
      ],
      conclusion: "지출 총액을 줄이라는 뜻이 아닙니다. 계획한 소비는 그대로 두고, 의도하지 않은 반복지출만 확인하는 것이 이번 달의 핵심입니다.",
    },
  },
  family: {
    stage: "가족형성기", name: "이수진", age: 38, avatar: "이",
    hero: { title: "대출 상환과 교육비가 균형을 이루고 있어요.", description: "현재 흐름으로는 안정적이지만, 교육비가 늘어나면 목표 기간 재조정이 필요합니다." },
    metrics: { income: 5800000, expense: 4200000, expenseDelta: 180000, context: 68 },
    cashflow: { months: ["1월","2월","3월","4월","5월","6월"], income: [570,580,580,575,580,580], expense: [390,400,405,410,402,420] },
    categories: [
      { name: "주거/대출", value: 150, color: "#2563eb" },
      { name: "교육비",   value:  80, color: "#60a5fa" },
      { name: "생활비",   value: 110, color: "#3b82f6" },
      { name: "보험/의료", value:  45, color: "#f59e0b" },
      { name: "기타",    value:  35, color: "#94a3b8" },
    ],
    goal: { targetAmount: 100000000, currentAmount: 5000000, targetDate: '2030-06', goalType: '주택' },
    expenseDetail: { subscriptions: 200000, deliveryDining: 500000 },
    memories: [
      { id: "loan", icon: "대", title: "주택담보대출", detail: "월 상환 120만 원, 잔액 1.8억", source: "거래 패턴" },
      { id: "edu",  icon: "교", title: "학원비",      detail: "매월 80만 원, 2자녀",         source: "반복 거래" },
    ],
    questions: [
      { id: "edu_increase", title: "학원비가 지난달보다 15만 원 늘었어요. 추가 수업인가요?", description: "교육비 증가가 반복될지 확인이 필요해요.", options: [
        { value: "one-time",  label: "이번 달만이에요",        memory: "학원 특강 일회성",              result: "일회성으로 분류했습니다." },
        { value: "recurring", label: "앞으로도 계속될 거예요", memory: "학원비 월 15만 원 추가 반복",    result: "교육비 증가를 반영했습니다." },
      ]},
    ],
    actions: [
      { key: "keep",      title: "현재 흐름 유지",  description: "균형 유지",            impact: 0 },
      { key: "insurance", title: "보험료 재검토",   description: "불필요한 특약 정리",     impact: 150000 },
      { key: "delivery",  title: "외식비 조정",    description: "주 1회 줄이기",          impact: 80000 },
    ],
    transactions: [
      { date: "06.25", merchant: "급여",      category: "급여",   amount:  5800000, type: "income",  tag: "rec" },
      { date: "06.15", merchant: "주택대출",  category: "대출상환", amount: -1200000, type: "expense", tag: "ess" },
      { date: "06.10", merchant: "영어학원",  category: "교육",   amount:  -450000, type: "expense", tag: "rec" },
      { date: "06.10", merchant: "수학학원",  category: "교육",   amount:  -350000, type: "expense", tag: "rec" },
    ],
    report: {
      monthly: ["6월 총지출 420만 원 중 주거/대출 비중이 36%입니다.","교육비가 소폭 증가했으나 전체 현금흐름은 안정적입니다."],
      weekly:  ["이번 주는 특이 지출 없이 정상 범위입니다."],
      conclusion: "현재 흐름을 유지하면서 교육비 증가 추이를 지켜보는 것이 좋겠습니다.",
    },
  },
  middle: {
    stage: "자산성장기", name: "박정우", age: 52, avatar: "박",
    hero: { title: "노후 준비가 핵심 목표입니다.", description: "연금과 투자 포트폴리오를 점검하고, 자녀 독립 이후 생활비 구조 변화를 준비할 때입니다." },
    metrics: { income: 7200000, expense: 5100000, expenseDelta: -200000, context: 72 },
    cashflow: { months: ["1월","2월","3월","4월","5월","6월"], income: [720,720,720,720,720,720], expense: [530,520,515,510,510,510] },
    categories: [
      { name: "주거/대출",  value: 180, color: "#2563eb" },
      { name: "보험/연금",  value: 120, color: "#60a5fa" },
      { name: "생활비",     value: 100, color: "#3b82f6" },
      { name: "자녀지원",   value:  70, color: "#f59e0b" },
      { name: "기타",      value:  40, color: "#94a3b8" },
    ],
    goal: { targetAmount: 500000000, currentAmount: 120000000, targetDate: '2034-01', goalType: '은퇴준비' },
    expenseDetail: { subscriptions: 300000, deliveryDining: 400000 },
    memories: [
      { id: "retire", icon: "연", title: "은퇴 목표", detail: "60세 은퇴, 월 250만 원 필요", source: "사용자 설정" },
    ],
    questions: [],
    actions: [
      { key: "keep",    title: "현재 흐름 유지",   description: "저축여력 210만 원",     impact: 0 },
      { key: "pension", title: "연금 추가 납입",   description: "IRP 월 30만 원 추가",   impact: -300000 },
    ],
    transactions: [
      { date: "06.25", merchant: "급여",       category: "급여",    amount:  7200000, type: "income",  tag: "rec" },
      { date: "06.15", merchant: "아파트 대출", category: "대출상환", amount: -1800000, type: "expense", tag: "ess" },
    ],
    report: {
      monthly: ["소득 대비 저축 여력이 안정적입니다.","은퇴 시점까지 8년, 추가 연금 납입을 검토해보세요."],
      weekly:  ["이번 주 지출 정상 범위."],
      conclusion: "장기 목표에 맞춘 자산 배분 점검을 권장합니다. 전문 상담 연결도 가능합니다.",
    },
  },
  senior: {
    stage: "시니어", name: "최영숙", age: 67, avatar: "최",
    hero: { title: "안정적인 생활비 관리가 중요합니다.", description: "정기적인 연금 수입과 의료비 지출을 모니터링하고 있어요." },
    metrics: { income: 2800000, expense: 2200000, expenseDelta: 50000, context: 60 },
    cashflow: { months: ["1월","2월","3월","4월","5월","6월"], income: [280,280,280,280,280,280], expense: [210,215,218,220,215,220] },
    categories: [
      { name: "생활비", value:  90, color: "#3b82f6" },
      { name: "의료비", value:  50, color: "#f59e0b" },
      { name: "공과금", value:  40, color: "#2563eb" },
      { name: "기타",   value:  40, color: "#94a3b8" },
    ],
    goal: { targetAmount: 0, currentAmount: 0, targetDate: null, goalType: '기타' },
    expenseDetail: { subscriptions: 50000, deliveryDining: 200000 },
    memories: [
      { id: "pension", icon: "연", title: "국민연금", detail: "매월 25일, 180만 원", source: "거래 패턴" },
    ],
    questions: [
      { id: "transfer", title: "이번 고액 이체(200만 원)는 직접 진행하신 거래인가요?", description: "평소와 다른 큰 금액의 이체가 감지되었어요.", options: [
        { value: "confirmed", label: "네, 제가 직접 했어요", memory: "6월 200만 원 이체는 본인 확인 완료",           result: "확인되었습니다. 감사합니다." },
        { value: "unknown",   label: "잘 모르겠어요",       memory: "고액 이체 본인 여부 불확실 — 상담 연결 필요",   result: "안전을 위해 상담 연결을 권장합니다." },
      ]},
    ],
    actions: [
      { key: "keep", title: "현재 흐름 유지", description: "안정적 운영", impact: 0 },
    ],
    transactions: [
      { date: "06.25", merchant: "국민연금",   category: "연금",  amount:  1800000, type: "income",  tag: "rec" },
      { date: "06.25", merchant: "퇴직연금",   category: "연금",  amount:  1000000, type: "income",  tag: "rec" },
      { date: "06.20", merchant: "대학병원",   category: "의료",  amount:  -350000, type: "expense", tag: "ctx" },
    ],
    report: {
      monthly: ["6월 생활비는 안정적이며 연금 수입 범위 안에 있습니다.","의료비 비중이 소폭 증가했으나 관리 가능한 수준입니다."],
      weekly:  ["이번 주 특이사항 없음."],
      conclusion: "현재 흐름은 안정적입니다. 의료비 증가 추이만 주의깊게 살펴보겠습니다.",
    },
  },
};

// ── State ──
const state = {
  profile: "starter",
  tab: "goal",
  reportRange: "monthly",
  answers: {},
  removedMems: [],
  consultationBrief: null,
  cashflowStabilityReport: null,
  // 명세 6.14 데이터 통제권 토글 상태
  dataCtrl: {
    account:    true,   // 계좌 거래내역 분석
    medical:    true,   // 의료비 지움 패턴 분석
    subscription: true, // 구독료 탐지
    shareMemory: false, // 상담원에게 Context Memory 공유
    finGuide:   true,   // 목표 기반 금융 안내 수신
    llm:        false,  // 외부 LLM 분석 활용
  },
};

const $ = id => document.getElementById(id);
let toastTimer;

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  bindEvents();
  renderAll();
});

// ── Event Binding ──
function bindEvents() {
  // ── 탭 네비게이션 ──
  document.querySelectorAll(".nav-btn").forEach(b => b.addEventListener("click", () => {
    state.tab = b.dataset.tab;
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `v-${state.tab}`));
    document.querySelectorAll(".nav-btn").forEach(n => n.classList.toggle("active", n.dataset.tab === state.tab));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  // ── 사이드 메뉴 ──
  const openSideMenu  = () => { $("sideMenu").classList.add("open"); $("sideMenuBg").classList.add("open"); };
  const closeSideMenu = () => { $("sideMenu").classList.remove("open"); $("sideMenuBg").classList.remove("open"); };
  $("menuOpenBtn").addEventListener("click", openSideMenu);
  $("sideMenuClose").addEventListener("click", closeSideMenu);
  $("sideMenuBg").addEventListener("click", closeSideMenu);

  // ── 프로필 선택 (사이드 메뉴 내) ──
  $("profileSelect").addEventListener("change", e => {
    state.profile = "starter";
    e.target.value = "starter";
    state.answers = {};
    state.removedMems = [];
    state.consultationBrief = null;
    state.cashflowStabilityReport = null;
    saveState();
    renderAll();
    closeSideMenu();
  });

  // ── Context Memory 버튼 클릭 → 드로어 열기 ──
  $("ctxMemBtn").addEventListener("click", () => openModal("memoryModal"));

  // ── Context Memory 초기화 ──
  $("clearMemBtn").addEventListener("click", () => {
    state.answers = {};
    state.removedMems = [];
    saveState();
    renderMemory();
    renderAll();
    toast("맥락이 초기화되었습니다.");
  });

  // ── 사이드 메뉴: 상담 브리프 ──
  $("menuBriefBtn").addEventListener("click", () => { closeSideMenu(); handleConsultationBrief(); });

  // ── 사이드 메뉴: 현금흐름 안정성 ──
  $("menuStabilityBtn").addEventListener("click", () => { closeSideMenu(); handleCashflowStability(); });

  // ── 사이드 메뉴: 데이터 통제 토글 ──
  $("menuDataCtrlBtn").addEventListener("click", () => {
    const ctrl = $("smDataCtrl");
    ctrl.style.display = ctrl.style.display === "none" ? "block" : "none";
  });

  // ── 데이터 통제 토글 실제 반영 (명세 6.14) ──
  const toggleMap = [
    ["togAccount",  "account"],
    ["togMedical",  "medical"],
    ["togSub",      "subscription"],
    ["togShare",    "shareMemory"],
    ["togFinGuide", "finGuide"],
    ["togLLM",      "llm"],
  ];
  toggleMap.forEach(([id, key]) => {
    const el = $(id); if (!el) return;
    el.checked = state.dataCtrl[key];
    el.addEventListener("change", () => {
      state.dataCtrl[key] = el.checked;
      saveState();
      if (key === "finGuide") renderFinGuide(getProfile());
      toast(`${el.checked ? 'ON' : 'OFF'}: 해당 설정이 반영되었습니다.`);
    });
  });

  // ── Memory 삭제 (delegated) ──
  document.addEventListener("click", e => {
    const delBtn = e.target.closest(".mem-del");
    if (delBtn) {
      const mid = delBtn.dataset.mid;
      if (mid) {
        if (!state.removedMems.includes(mid)) state.removedMems.push(mid);
        if (mid.startsWith('ans-')) delete state.answers[mid.replace('ans-', '')];
        saveState(); renderMemory(); toast("맥락 항목을 삭제했습니다.");
      }
    }
  });

  // ── Modal close ──
  document.querySelectorAll("[data-close]").forEach(el =>
    el.addEventListener("click", () => closeModal(el.dataset.close))
  );

  // Report tabs
  document.querySelectorAll(".rep-tab").forEach(b => b.addEventListener("click", () => {
    state.reportRange = b.dataset.range;
    document.querySelectorAll(".rep-tab").forEach(t => t.classList.toggle("active", t.dataset.range === state.reportRange));
    renderReport();
  }));

  // ── [명세 6.10] AI 리포트 생성 버튼 ──
  const aiRepBtn = $("aiReportBtn");
  if (aiRepBtn) aiRepBtn.addEventListener("click", handleAIReport);

  // Goal creation mode switch
  document.querySelectorAll(".mode-btn").forEach(b => b.addEventListener("click", () => {
    const mode = b.dataset.mode;
    document.querySelectorAll(".mode-btn").forEach(m => m.classList.toggle("active", m.dataset.mode === mode));
    $("simpleMode").classList.toggle("active", mode === "simple");
    $("detailMode").classList.toggle("active", mode === "detail");
  }));

  // Simple calculator
  const calcSimple = () => {
    const goal = parseInt($("simGoalAmt").value)   || 0;
    const cur  = parseInt($("simCurAmt").value)    || 0;
    const dur  = parseInt($("simDuration").value)  || 1;
    
    let req = Math.max(0, (goal - cur) / dur);
    
    const now = new Date();
    now.setMonth(now.getMonth() + dur);
    $("simMonthly").textContent = req > 0 ? `${Math.ceil(req).toLocaleString("ko-KR")}만원` : "0만원";
    $("simTarget").textContent  = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  };
  ["simGoalAmt","simCurAmt","simDuration"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", calcSimple);
  });
  calcSimple();
  $("regSimpleBtn").addEventListener("click", () => toast("목표가 등록되었습니다!"));

  // Detail — additive inputs
  const getDetailPlaceholder = index => {
    if (index === 1) return "예: 자동차를 바꾸고 싶어";
    if (index === 2) return "예: 8000만원 정도 모으려고 해";
    if (index === 3) return "예: 달에 100만원 정도 모을 수 있을 것 같아";
    return "추가 조건을 적어주세요";
  };
  $("addCondBtn").addEventListener("click", () => {
    const container = $("detailInputs");
    const nextIndex = container.querySelectorAll(".detail-row").length + 1;
    const row = document.createElement("div");
    row.className = "detail-row";
    row.innerHTML = `<input type="text" class="detail-input" placeholder="${getDetailPlaceholder(nextIndex)}"><button class="btn-rm" title="삭제">×</button>`;
    container.appendChild(row);
    row.querySelector(".detail-input").focus();
  });
  document.addEventListener("click", e => {
    if (e.target.classList.contains("btn-rm")) {
      const row = e.target.closest(".detail-row");
      if (row && document.querySelectorAll(".detail-row").length > 1) row.remove();
    }
  });

  // AI 목표 분석
  $("analyzeBtn").addEventListener("click", handleAnalysis);

  // Skip question
  $("skipQBtn").addEventListener("click", () => toast("다음에 다시 확인할게요."));

  // Delegated option clicks
  document.addEventListener("click", e => {
    const btn = e.target.closest(".opt-btn");
    if (btn) answerQuestion(btn.dataset.qid, btn.dataset.ans);
  });

  // ── [명세 6.11] 상담 연결 버튼 ──
  document.addEventListener("click", e => {
    if (e.target.closest("#consultBtn")) handleConsultConnect();
  });

  // ── [명세 6.12] 상담 브리프 생성 버튼 ──
  document.addEventListener("click", e => {
    if (e.target.closest("#briefBtn")) handleConsultationBrief();
  });

  // ── [명세 6.13] 현금흐름 안정성 요약 버튼 ──
  document.addEventListener("click", e => {
    if (e.target.closest("#stabilityBtn")) handleCashflowStability();
  });

  document.addEventListener("click", e => {
    const item = e.target.closest(".fin-guide-item[data-product-id]");
    if (item) openProductDetail(item.dataset.productId);
  });

  document.addEventListener("click", e => {
    if (e.target.closest("[data-product-page]")) {
      toast("상품 페이지로 이동합니다. (MVP Mock)");
    }
  });
}

// ── [명세 6.11] 상담 연결 체리 — 동의 확인 포함 Mock ──
function handleConsultConnect() {
  const p    = getProfile();
  const risk = computeRisk(p);
  const mems = getMemories();

  // 상담원 공유 동의 확인 (state.dataCtrl.shareMemory 연동)
  const shareConsent = state.dataCtrl.shareMemory;
  const memSummary   = shareConsent
    ? mems.map(m => `• ${m.title}: ${m.detail}`).join('\n')
    : '(Context Memory 공유 본인 미동의)';

  if (risk.requiresHumanReview) {
    const confirmed = window.confirm(
      `다음 정보를 상담원에게 제공하고 상담을 연결합니다.\n\n` +
      `현재 위험도: ${risk.riskLevel}\n` +
      `사유: ${risk.reason}\n\n` +
      `${memSummary}\n\n` +
      `동의하시겠습니까?`
    );
    if (confirmed) {
      toast('상담 연결을 요청했습니다. 잊시 후 상담원이 연락드립니다. (Mock)');
      // Mock: 상담 브리프 자동 실행
      handleConsultationBrief();
    }
  } else {
    toast('현재 위험도는 상담이 필요한 수준이 아닙니다.');
  }
}

// ── [명세 6.12] 상담 브리프 생성 (AI 없으면 Mock fallback) ──
async function handleConsultationBrief() {
  const p     = getProfile();
  const risk  = computeRisk(p);
  const mems  = getMemories();
  const cfData = buildCashflowData(p);

  // 데이터 통제: shareMemory OFF 시 안내
  if (!state.dataCtrl.shareMemory) {
    const ok = window.confirm('상담 브리프를 생성하려면 상담원 Context Memory 공유 동의가 필요합니다.\n\n데이터 통제 메뉴에서 설정하거나, 지금 임시로 상담원 공유를 허용하시겠습니까?');
    if (ok) { state.dataCtrl.shareMemory = true; const tog = $('togShare'); if(tog) tog.checked = true; }
    else return;
  }

  if (aiConfig.apiKey) {
    toast('상담 브리프를 생성하고 있습니다...');
    try {
      const brief = await generateConsultationBrief(p.goal, p.metrics, cfData, mems, risk);
      state.consultationBrief = brief;
      renderBriefModal(brief);
      openModal('briefModal');
      return;
    } catch(err) {
      toast(`AI 생성 실패, Mock 데이터로 대체합니다.`);
    }
  }

  // —— API Key 없거나 실패 시 Mock fallback ──
  const sc = computeRisk(p);
  const feasibility = calculateGoalFeasibility(
    p.goal, p.metrics.income, p.metrics.expense
  );
  const mockBrief = {
    goalSummary: `${p.goal.goalType || '목표'} · ${fmtWon(p.goal.targetAmount)} · ${p.goal.targetDate || '미설정'} · 달성률 ${Math.round((p.goal.currentAmount||0)/(p.goal.targetAmount||1)*100)}%`,
    cashflowSummary: `월 소득 ${fmtWon(p.metrics.income)} / 월 지움 ${fmtWon(p.metrics.expense)} / 월 저축 여력 ${fmtWon(feasibility.monthlySavingCapacity)}`,
    recentChanges: p.transactions.filter(t => t.tag === 'ctx').map(t => `${t.merchant} ${fmtWon(Math.abs(t.amount))} (${t.category} — 맥락 확인 필요)`),
    contextSummary: mems.map(m => `${m.title}: ${m.detail}`),
    riskSummary: `${sc.riskLevel === 'low' ? '난조 없음' : sc.riskLevel === 'medium' ? '보통' : '주의 필요'} — ${sc.reason}`,
    consultationGuide: `목표 유형(${p.goal.goalType})에 맞는 예적금 구조 및 상담 제안. 월 부족액 ${fmtWon(feasibility.shortfall)}에 대한 소비 조정 시나리오 안내.`,
    disclaimer: 'AI 제안은 시나리오 보조 자료이며, 여신 승인 거절이나 투자 적합성 판단의 근거로 단독 사용하지 않습니다.',
  };
  state.consultationBrief = mockBrief;
  renderBriefModal(mockBrief);
  openModal('briefModal');
}

// ── [명세 6.13] 현금흐름 안정성 요약 (Mock fallback 포함) ──
async function handleCashflowStability() {
  const p      = getProfile();
  const mems   = getMemories();
  const cfData = buildCashflowData(p);

  if (aiConfig.apiKey) {
    toast('현금흐름 안정성 요약을 생성하고 있습니다...');
    try {
      const report = await generateCashflowStabilityReport(p.metrics, cfData, p.goal, mems);
      state.cashflowStabilityReport = report;
      renderStabilityModal(report);
      openModal('stabilityModal');
      return;
    } catch(err) {
      toast('분석 실패, Mock 데이터로 대체합니다.');
    }
  }

  // —— Mock fallback ──
  const feasibility = calculateGoalFeasibility(p.goal, p.metrics.income, p.metrics.expense);
  const fixedExp = p.categories?.find(c => c.name.includes('주거') || c.name.includes('고정'))?.value || 0;
  const essentialRatio = fixedExp > 0
    ? Math.round((fixedExp * 10000) / p.metrics.expense * 100) + '% (주거/고정비 기준)'
    : '샘플 데이터 기준 계산 필요';
  const adjustable = p.categories?.find(c => c.name.includes('배달') || c.name.includes('생활'))?.value || 0;
  const mockReport = {
    fixedExpenseRatio: `필수 고정비 ${fmtWon(p.metrics.expense * 0.51)} — 전체 지출 대비 ${Math.round(0.51*100)}% 수준`,
    regularPaymentPattern: '월세/보험료/대출 등 정기 납부 정상 발견됨. 연체 이력 없음.',
    adjustableExpenseFlexibility: `조절 가능 지출(${p.expenseDetail ? `배달 ${fmtWon(p.expenseDetail.deliveryDining)}, 구독 ${fmtWon(p.expenseDetail.subscriptions)}` : '확인 필요'}) — 월 최대 ${fmtWon((p.expenseDetail?.deliveryDining||0)+(p.expenseDetail?.subscriptions||0))} 조정 가능`,
    monthlySavingCapacity: `${fmtWon(feasibility.monthlySavingCapacity)} / 월 (목표 필요 ${fmtWon(feasibility.requiredMonthlySaving)})${feasibility.shortfall>0 ? ` — 부족액 ${fmtWon(feasibility.shortfall)}` : ' — 현재 흐름 달성 가능'}`,
    trendSummary: cfData.trend === 'declining' ? '최근 3개월 지출 증가 추세. 주의 권장.' : cfData.trend === 'improving' ? '지출이 감소하는 긍정적 추세.' : '안정적인 흐름 유지 중.',
    contextBasedExclusions: mems.filter(m => m.detail.includes('일회성')||m.detail.includes('은행')).map(m => m.detail),
    disclaimer: '이 요약은 대출 승인·거절 또는 신용평가 자동 반영에 사용되지 않습니다. 고객 동의 범위 안에서 상담 보조 자료로만 활용합니다.',
  };
  state.cashflowStabilityReport = mockReport;
  renderStabilityModal(mockReport);
  openModal('stabilityModal');
}

// ── [명세 6.10] AI 리포트 생성 ──
async function handleAIReport() {
  const p    = getProfile();
  const mems = getMemories();

  const aiRepBtn = $("aiReportBtn");
  if (aiRepBtn) { aiRepBtn.disabled = true; aiRepBtn.textContent = "생성 중..."; }

  try {
    const result = aiConfig.apiKey
      ? await generateReport(p.metrics, Object.entries(state.answers).map(([k,v]) => ({ qid: k, val: v })), mems)
      : buildMockAIReport(p, mems);
    $("repBody").innerHTML = (result.paragraphs || []).map(s => `<p>${s}</p>`).join("");
    if (result.conclusion) $("repConc").textContent = result.conclusion;
    toast("AI 리포트가 생성되었습니다.");
  } catch (err) {
    toast(`리포트 생성 실패: ${err.message}`);
  } finally {
    if (aiRepBtn) { aiRepBtn.disabled = false; aiRepBtn.textContent = "AI 리포트 생성"; }
  }
}

function buildMockAIReport(p, mems) {
  const feasibility = calculateGoalFeasibility(p.goal, p.metrics.income, p.metrics.expense);
  const fixedContexts = mems.filter(m => m.source === "사용자 확인").map(m => m.detail);
  return {
    paragraphs: [
      `이번 달 지출은 지난달보다 ${fmtWon(p.metrics.expenseDelta)} 늘었지만, 확인된 맥락을 반영하면 일부는 반복 과소비가 아니라 일회성 또는 의도한 지출로 분류됩니다.`,
      `현재 월 저축 여력은 ${fmtWon(feasibility.monthlySavingCapacity)}이고 목표 달성을 위해 필요한 월 저축액은 ${fmtWon(feasibility.requiredMonthlySaving)}입니다.`,
      fixedContexts.length
        ? `사용자가 확인한 맥락: ${fixedContexts.slice(0, 2).join(", ")}.`
        : `아직 확인되지 않은 지출 맥락은 다음 리포트에서 질문으로 이어집니다.`,
    ],
    conclusion: feasibility.shortfall > 0
      ? `월 ${fmtWon(feasibility.shortfall)} 정도의 부족분을 줄이면 목표 달성 가능성이 올라갑니다.`
      : `현재 흐름이면 목표 달성이 가능한 범위입니다.`,
  };
}

// ── AI 목표 분석 ──
async function handleAnalysis() {
  const inputs = Array.from(document.querySelectorAll(".detail-input")).map(el => el.value.trim()).filter(v => v.length > 0);
  if (inputs.length === 0) { toast("조건을 1개 이상 입력해 주세요."); return; }
  const combined = inputs.map((v, i) => `조건 ${i + 1}: ${v}`).join("\n");

  $("aiResult").style.display  = "block";
  $("aiLoading").style.display = "flex";
  $("aiContent").style.display = "none";
  $("aiError").style.display   = "none";

  try {
    const parsed      = await parseGoal(combined);
    const p           = getProfile();
    const feasibility = calculateGoalFeasibility(
      { targetAmount: parsed.targetAmount, currentAmount: 0, targetDate: parsed.targetDate },
      p.metrics.income, p.metrics.expense,
    );

    $("aiLoading").style.display = "none";
    $("aiContent").style.display = "block";
    $("aiParsed").innerHTML = `
      <div class="parsed-item"><small>목표명</small><strong>${parsed.goalName}</strong></div>
      <div class="parsed-item"><small>유형</small><strong>${parsed.goalType}</strong></div>
      <div class="parsed-item"><small>목표 금액</small><strong>${fmtWon(parsed.targetAmount)}</strong></div>
      <div class="parsed-item"><small>목표 시점</small><strong>${parsed.targetDate || '미설정'}</strong></div>
    `;
    const statusLabel = { 'on-track': '달성 가능', 'warning': '주의 필요', 'at-risk': '위험' }[feasibility.achievementStatus] || feasibility.achievementStatus;
    $("aiCalc").innerHTML = `
      <strong>Rule Engine 계산 결과</strong><br>
      월 필요 저축액: ${fmtWon(feasibility.requiredMonthlySaving)} |
      월 저축 여력: ${fmtWon(feasibility.monthlySavingCapacity)} |
      상태: ${statusLabel}
      ${feasibility.shortfall > 0 ? `<br>월 부족액: ${fmtWon(feasibility.shortfall)}` : ''}
    `;
    if (parsed.isError) $("aiCalc").innerHTML += `<br><small style="color:var(--amber)">⚠ AI 응답 실패, 정규식 기반 추출 결과입니다.</small>`;
  } catch (err) {
    $("aiLoading").style.display = "none";
    $("aiError").style.display   = "block";
    $("aiError").textContent     = `분석 오류: ${err.message}`;
  }
}

// ── Helpers ──
function getProfile() { return profiles[state.profile] || profiles.starter; }
function fmtWon(v)    { return `${Math.round(v).toLocaleString("ko-KR")}원`; }
function fmtShort(v)  { return Math.abs(v) >= 10000 ? `${Math.round(v / 10000).toLocaleString("ko-KR")}만` : v.toLocaleString("ko-KR"); }

const GOAL_TITLES = {
  starter: "전세자금 마련",
  family: "주택자금 마련",
  middle: "은퇴 준비",
  senior: "노후 생활비 관리",
};

function getGoalTitle(profileKey = state.profile) {
  return GOAL_TITLES[profileKey] || "목표";
}

function syncGoalSelector() {
  const selector = $("goalSelector");
  if (!selector) return;
  const value = `${state.profile}-goal`;
  selector.innerHTML = `<option value="${value}">${getGoalTitle()}</option>`;
  selector.value = value;
}

/** rule-engine assessRisk 호출용 헬퍼 */
function computeRisk(p) {
  return assessRisk(p.goal, {
    monthlyIncome:  p.metrics.income,
    monthlyExpense: p.metrics.expense,
    totalDebt:      0,
    emergencyFund:  0,
  });
}

/** rule-engine generateScenarios 호출용 헬퍼 */
function computeScenarios(p) {
  return generateScenarios(
    p.goal,
    {
      monthlyIncome:  p.metrics.income,
      monthlyExpense: p.metrics.expense,
      subscriptions:  p.expenseDetail?.subscriptions  || 0,
      deliveryDining: p.expenseDetail?.deliveryDining || 0,
    },
  );
}

function getActionStatus(action) {
  if (action.key === "travel") {
    const answer = state.answers.travel;
    if (answer === "one-time") return "일회성 확정";
    if (answer === "recurring") return "반복 반영";
    return "질문 대기";
  }
  if (action.key === "subscription") {
    const answer = state.answers.subscription;
    if (answer === "recurring") return "반복 지출";
    if (answer === "adjustable") return "정리 예정";
    return "확인 필요";
  }
  if (action.key === "delivery") {
    return state.answers.subscription === "adjustable" ? "함께 조정" : "조정 후보";
  }
  return action.impactLabel || (action.impact ? `+${fmtShort(action.impact)}` : "유지");
}

/** calculateCashflow 호출용 헬퍼 — 거래내역을 Date 형식으로 변환 */
function buildCashflowData(p) {
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const txs    = (p.transactions || []).map(t => ({
    ...t,
    date: `${year}-${month}-${t.date.split('.')[1] || '01'}`,
  }));
  return calculateCashflow(txs, 6);
}

// ── Rendering ──
function renderAll() { renderGoal(); renderAssets(); renderReport(); renderMemory(); }

// ── Goal View ──
function renderGoal() {
  const p     = getProfile();
  const risk  = computeRisk(p);
  const score = Math.min(98, p.metrics.context + Object.keys(state.answers).length * 6);

  // 헤더 아바타
  const hdrAvatar = $("headerAvatar"); if (hdrAvatar) hdrAvatar.textContent = p.avatar;
  const smAvatar  = $("smAvatar");    if (smAvatar)  smAvatar.textContent  = p.avatar;
  const smName    = $("smName");      if (smName)    smName.textContent    = p.name;
  const smStage   = $("smStage");     if (smStage)   smStage.textContent   = `${p.stage} · ${p.age}세`;
  const profileSel = $("profileSelect"); if (profileSel) profileSel.value = state.profile;
  syncGoalSelector();

  $("ctxScore").textContent   = `${score}% 이해`;
  $("agentTitle").textContent = p.hero.title;
  $("agentDesc").textContent  = p.hero.description;

  // ── [명세 9.2] 리스크 뱃지 ──
  const riskEl  = $("riskBadge");
  if (riskEl) {
    const riskMap = { low: { label: '낮음', cls: 'chip-ok' }, medium: { label: '보통', cls: 'chip-warn' }, high: { label: '높음', cls: 'chip-risk' }, critical: { label: '매우 높음', cls: 'chip-risk' } };
    const rm = riskMap[risk.riskLevel] || riskMap.medium;
    riskEl.textContent = `위험도 ${rm.label}`;
    riskEl.className   = `chip ${rm.cls}`;
    riskEl.title       = risk.reason;
  }

  // ── [명세 6.8] 목표 진행률 카드 실제 렌더링 ──
  const g       = p.goal || {};
  const target  = g.targetAmount  || 1;
  const current = g.currentAmount || 0;
  const pct     = g.targetAmount ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const feas    = calculateGoalFeasibility(g, p.metrics.income, p.metrics.expense);
  const gtEl = $('goalTitle'); if (gtEl) gtEl.textContent = getGoalTitle();
  const gfEl = $('goalFill');  if (gfEl) gfEl.style.width  = `${pct}%`;
  const gpEl = $('goalPct');   if (gpEl) gpEl.textContent  = `${pct}%`;
  const gcEl = $('goalCur');   if (gcEl) gcEl.textContent  = fmtWon(current);
  const grEl = $('goalRem');   if (grEl) grEl.textContent  = fmtWon(Math.max(0, target - current));
  const gnEl = $('goalMonthlyNeed'); if (gnEl) gnEl.textContent = fmtWon(feas.requiredMonthlySaving || 0);
  const gmEl = $('goalMeta');  if (gmEl) gmEl.textContent  = `${g.targetDate || '날짜 미설정'}까지 • ${fmtWon(target)}`;
  const chipEl = $('goalChip');
  if (chipEl) {
    const cmap = { 'on-track': ['정상','chip-ok'], 'warning': ['주의','chip-warn'], 'at-risk': ['위험','chip-risk'] };
    const [cl, cc] = cmap[feas.achievementStatus] || ['진행중','chip-ok'];
    chipEl.textContent = cl; chipEl.className = `chip ${cc}`;
  }

  // ── [명세 6.11] 상담 연결 버튼 (고위험 시 표시) ──
  const consultWrap = $("consultWrap");
  if (consultWrap) {
    consultWrap.style.display = risk.requiresHumanReview ? "block" : "none";
    const riskExplain = $("riskExplain");
    if (riskExplain) {
      riskExplain.innerHTML = `
        <strong>상담이 필요한 이유</strong>
        <p>${risk.reason} 목표 달성 계획과 월 현금흐름을 함께 조정해야 해서, 자동 추천만으로 결정하기보다 상담원이 상환·저축 부담을 같이 점검하는 편이 안전합니다.</p>
        <div class="risk-meter" aria-label="위험도"><i></i></div>
      `;
    }
  }

  // Actions
  $("agentActions").innerHTML = p.actions.slice(0, 3).map((a, i) => `
    <div class="act-item">
      <span class="act-num">${String(i + 1).padStart(2, "0")}</span>
      <div class="act-info"><strong>${a.title}</strong><small>${a.description}</small></div>
      <span class="act-val">${getActionStatus(a)}</span>
    </div>`).join("");

  // Question
  const q = p.questions.find(q => !state.answers[q.id]);
  if (q) {
    $("questionCard").style.display = "block";
    $("qProgress").textContent = `${Object.keys(state.answers).length + 1} / ${p.questions.length}`;
    $("qTitle").textContent    = q.title;
    $("qDesc").textContent     = q.description;
    $("qOpts").innerHTML       = q.options.map(o =>
      `<button class="opt-btn" data-qid="${q.id}" data-ans="${o.value}">${o.label}</button>`
    ).join("");
  } else {
    const answered = Object.keys(state.answers).length;
    $("questionCard").style.display = answered > 0 ? "block" : "none";
    if (answered > 0) {
      $("qProgress").textContent = `${p.questions.length} / ${p.questions.length}`;
      $("qTitle").textContent    = "이번 달에 필요한 맥락을 모두 확인했어요.";
      $("qDesc").textContent     = "답변은 리포트와 다음 달 예상 흐름에 반영됐습니다.";
      $("qOpts").innerHTML       = "";
    }
  }

  // ── [명세 6.9] generateScenarios() 동적 시나리오 ──
  const scenarios = computeScenarios(p);
  $("scenariosGrid").innerHTML = scenarios.map(sc => `
    <div class="sc-item">
      <div class="sc-info">
        <strong>${sc.name}</strong>
        <small>${sc.description}</small>
      </div>
      <div class="sc-impact">
        <strong>${sc.monthlyImpact > 0 ? `+${fmtShort(sc.monthlyImpact)}` : sc.monthlyImpact < 0 ? fmtShort(sc.monthlyImpact) : fmtShort(sc.monthlySaving || 0)}</strong>
        <small>월 여유자금</small>
      </div>
    </div>`).join("");

  // ── [명세 6.10] 목표 기반 금융 선택지 안내 (RAG Mock) ──
  renderFinGuide(p);
}

// ── [명세 6.10] 금융 선택지 안내 렌더 ──
const FIN_GUIDE_MAP = {
  여행:    [{ id:'travel-save', logo: 'JB\n은행', name: '전북은행 목표저축', desc: '여행자금 목표 기반 자동 적립', rate: '연 3.4%', benefit: '목표분리', detail: '월급일 다음 날 자동이체를 설정해 여행 자금이 생활비와 섞이지 않도록 분리합니다. 중도 해지 전까지 목표 잔액을 앱에서 계속 추적합니다.' }],
  결혼:    [{ id:'wedding-save', logo: 'JB\n은행', name: '전북은행 결혼준비 예금', desc: '목표금액·날짜 연동 자동 적립', rate: '연 3.2%', benefit: '자금분리', detail: '예식·혼수처럼 지출 시점이 뚜렷한 목표에 맞춰 납입 계획을 관리합니다.' }, { id:'wedding-card', logo: 'JB\n카드', name: '웨딩 혜택 카드', desc: '예식장·혼수 업종 캐시백', rate: '최대 5%', benefit: '캐시백', detail: '큰 결제 전 캐시백 업종을 확인해 예식 관련 지출 일부를 돌려받는 용도입니다.' }],
  자동차:  [{ id:'car-consult', logo: 'JB\n캐피탈', name: 'JB우리캐피탈 상담 연결', desc: '할부·리스 조건 비교 상담', rate: '상담', benefit: '부담확인', detail: '자동차 구매 전 월 상환액이 현재 목표 저축에 주는 영향을 상담으로 비교합니다.' }, { id:'car-save', logo: 'JB\n은행', name: '자동차 구매 목표적금', desc: '분할 저축 후 구매 자금 마련', rate: '연 3.1%', benefit: '선수금', detail: '구매 전 선수금을 미리 쌓아 향후 할부 부담을 줄이는 방식입니다.' }],
  주택:    [{ id:'housing-sub', logo: 'JB\n은행', name: '전북은행 주택청약', desc: '청약 조건 점검 및 납입 관리', rate: '연 2.8%', benefit: '납입관리', detail: '전세·주택 목표를 가진 고객에게 청약 납입 이력과 월 납입 부담을 함께 관리하도록 돕습니다.' }, { id:'jeonse-consult', logo: 'JB\n은행', name: '전세자금 상담', desc: '전세대출 한도·조건 확인', rate: '상담', benefit: '한도확인', detail: '목표 부족액, 예상 이자, 월 상환 부담을 같이 확인해 무리한 대출을 피하도록 돕습니다.' }],
  대출상환: [{ id:'loan-plan', logo: 'JB\n은행', name: '대출 상환 계획 상담', desc: '무리한 상환 위험 사전 점검', rate: '상담', benefit: '흐름점검', detail: '조기상환이 저축 여력과 비상자금에 미치는 영향을 상담으로 확인합니다.' }],
  은퇴준비: [{ id:'wm-retire', logo: 'JB\n자산운용', name: 'JB자산운용 WM 상담', desc: '은퇴 포트폴리오 점검', rate: '상품별', benefit: '장기점검', detail: '은퇴 시점까지 월 저축 여력과 예상 생활비를 같이 점검합니다.' }],
  교육:    [{ id:'edu-save', logo: 'JB\n은행', name: '교육비 목표 적금', desc: '학기별 지출 기반 적립 계획', rate: '연 3.0%', benefit: '학기대비', detail: '학기별 등록금·학원비처럼 반복되는 교육비에 맞춰 적립 일정을 잡습니다.' }],
};

function getAllFinGuides() {
  return Object.values(FIN_GUIDE_MAP).flat();
}

function renderFinGuide(p) {
  const card    = $("finGuideCard");
  const list    = $("finGuideList");
  if (!card || !list) return;
  // 데이터 통제: 금융 안내 수신 동의 확인
  if (!state.dataCtrl.finGuide) { card.style.display = "none"; return; }
  const goalType = p.goal?.goalType || '기타';
  const guides   = FIN_GUIDE_MAP[goalType];
  if (!guides || guides.length === 0) { card.style.display = "none"; return; }
  card.style.display = "block";
  list.innerHTML = guides.map(g => `
    <button class="fin-guide-item" type="button" data-product-id="${g.id}">
      <div class="fin-guide-logo">${g.logo}</div>
      <div class="fin-guide-info"><strong>${g.name}</strong><small>${g.desc}</small></div>
      <span class="fin-guide-benefit">${g.rate} · ${g.benefit}</span>
    </button>`).join("");
}

function openProductDetail(productId) {
  const product = getAllFinGuides().find(g => g.id === productId);
  if (!product) return;
  $("productModalTitle").textContent = product.name;
  $("productModalDesc").textContent = product.desc;
  $("productModalBody").innerHTML = `
    <div class="fin-guide-detail">
      <span class="product-rate">${product.rate}</span>
      <strong>왜 이 상품이 맞나요?</strong>
      <p>${product.detail}</p>
    </div>
    <div class="fin-guide-detail">
      <strong>목표에 주는 도움</strong>
      <p>${product.benefit}. 현재 목표 달성을 위해 필요한 월 저축액과 실제 여유자금 차이를 줄이는 보조 선택지입니다.</p>
    </div>
    <div class="product-actions">
      <button class="btn ghost sm" data-close="productModal">닫기</button>
      <button class="btn sm" data-product-page="${product.id}">상품 페이지로 이동</button>
    </div>
  `;
  openModal("productModal");
}

// ── Assets View ──
function renderAssets() {
  const p = getProfile();
  $("mIncome").textContent  = fmtWon(p.metrics.income);
  $("mExpense").textContent = fmtWon(p.metrics.expense);

  const d    = p.metrics.expenseDelta;
  const note = $("mExpNote");
  note.textContent = d >= 0
    ? `지난달보다 ${fmtWon(d)} 증가`
    : `지난달보다 ${fmtWon(Math.abs(d))} 감소`;
  note.classList.toggle("neg", d > 0);

  // ── [명세 6.4] calculateCashflow 트렌드 반영 ──
  const cfData   = buildCashflowData(p);
  const trendMap = { improving: "📈 현금흐름이 개선되고 있어요.", stable: "➡️ 현금흐름이 안정적입니다.", declining: "📉 현금흐름이 감소 추세입니다." };
  $("cfInsight").textContent = trendMap[cfData.trend] || p.hero.description;

  renderChart(p.cashflow);
  renderDonut(p.categories, p.metrics.expense);
  renderTx(p.transactions);
}

function renderChart(cf) {
  const el = $("cfChart"); if (!el) return;
  const w = 420, h = 180, pad = { t: 16, r: 12, b: 24, l: 36 };
  const all = [...cf.income, ...cf.expense];
  const max = Math.ceil(Math.max(...all) / 50) * 50 || 100;
  const min = Math.max(0, Math.floor(Math.min(...all) / 50) * 50 - 30);
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const x  = i => pad.l + (i * pw) / Math.max(1, cf.months.length - 1);
  const y  = v => pad.t + ((max - v) / (max - min || 1)) * ph;
  const ln = vals => vals.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ");
  const area   = `${ln(cf.income)} L ${x(cf.income.length - 1)} ${pad.t + ph} L ${x(0)} ${pad.t + ph} Z`;
  const grid   = Array.from({ length: 4 }, (_, i) => {
    const v = min + ((max - min) * i) / 3;
    const py = y(v);
    return `<line class="chart-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${py}" y2="${py}"/><text class="chart-label" x="${pad.l - 4}" y="${py + 3}" text-anchor="end">${Math.round(v)}만</text>`;
  }).join("");
  const labels = cf.months.map((m, i) => `<text class="chart-label" x="${x(i)}" y="${h - 4}" text-anchor="middle">${m}</text>`).join("");
  const ip     = cf.income.map((v, i) => `<circle class="chart-dot-i" cx="${x(i)}" cy="${y(v)}" r="${i === cf.income.length - 1 ? 4.5 : 2.5}"/>`).join("");
  const ep     = cf.expense.map((v, i) => `<circle class="chart-dot-e" cx="${x(i)}" cy="${y(v)}" r="${i === cf.expense.length - 1 ? 4 : 2}"/>`).join("");
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}"><defs><linearGradient id="iGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2563eb" stop-opacity=".12"/><stop offset="100%" stop-color="#2563eb" stop-opacity="0"/></linearGradient></defs>${grid}${labels}<path class="chart-area" d="${area}"/><path class="chart-line-i" d="${ln(cf.income)}"/><path class="chart-line-e" d="${ln(cf.expense)}"/>${ip}${ep}</svg>`;
}

function renderDonut(cats, total) {
  const donut = $("spDonut"), list = $("catList");
  if (!donut || !list) return;
  const sum = cats.reduce((a, c) => a + c.value, 0);
  let start = 0;
  const stops = cats.map(c => {
    const end = start + (c.value / sum) * 100;
    const s   = `${c.color} ${start.toFixed(1)}% ${end.toFixed(1)}%`;
    start = end;
    return s;
  });
  donut.style.background = `conic-gradient(${stops.join(",")})`;
  $("donutTotal").textContent = fmtShort(total);
  list.innerHTML = cats.map(c =>
    `<div class="cat-item"><span class="cat-dot" style="background:${c.color}"></span><span>${c.name}</span><strong>${c.value}만</strong></div>`
  ).join("");
}

function renderTx(txs) {
  $("txList").innerHTML = txs.map(t => {
    const inc = t.type === "income";
    return `<div class="tx">
      <div class="tx-tag t-${t.tag}"></div>
      <div class="tx-info"><strong>${t.merchant}</strong><small>${t.date} · ${t.category}</small></div>
      <div class="tx-amt${inc ? ' inc' : ''}">${inc ? '+' : ''}${fmtWon(Math.abs(t.amount))}</div>
    </div>`;
  }).join("");
}

// ── Report View ──
function renderReport() {
  const p = getProfile();
  $("repBody").innerHTML  = p.report[state.reportRange].map(s => `<p>${s}</p>`).join("");
  $("repConc").textContent = p.report.conclusion;
  if (state.answers.travel === "one-time") {
    $("repBody").innerHTML += `<p><strong>사용자 확인:</strong> 여행비 35만 원은 계획된 일회성 지출로 분류해 다음 달 기준선에서는 제외했습니다.</p>`;
  }
}

// ── Memory ──
function renderMemory() {
  const mems = getMemories();
  // Context 배너 업데이트
  const ctxCount = $("ctxCount");
  const ctxDesc  = $("ctxBannerDesc");
  if (ctxCount) ctxCount.textContent = mems.length;
  if (ctxDesc)  ctxDesc.textContent  = mems.length > 0
    ? `${mems.length}개의 생활 맥락을 기억하고 있어요`
    : '답변하면 Agent가 더 정확해져요';
  // 드로어 목록
  $("memList").innerHTML = mems.map(m => `
    <div class="mem-item">
      <div class="mem-icon">${m.icon}</div>
      <div class="mem-info"><strong>${m.title}</strong><small>${m.detail} · ${m.source}</small></div>
      <button class="mem-del" data-mid="${m.id}" title="삭제">×</button>
    </div>`).join("");
}

function getMemories() {
  const p    = getProfile();
  const base = p.memories.filter(m => !state.removedMems.includes(m.id));
  const ans  = p.questions.map(q => {
    const a = state.answers[q.id];
    const o = q.options.find(x => x.value === a);
    if (!o) return null;
    return { id: `ans-${q.id}`, icon: "AI", title: q.title.replace(/\?$/, ""), detail: o.memory, source: "사용자 확인" };
  }).filter(Boolean).filter(m => !state.removedMems.includes(m.id));
  return [...base, ...ans];
}

// ── [명세 6.12] 상담 브리프 모달 렌더링 ──
function renderBriefModal(brief) {
  const el = $("briefContent");
  if (!el) return;
  el.innerHTML = `
    <div class="brief-row"><strong>목표 요약</strong><p>${brief.goalSummary}</p></div>
    <div class="brief-row"><strong>현금흐름</strong><p>${brief.cashflowSummary}</p></div>
    <div class="brief-row"><strong>최근 변화</strong><ul>${(brief.recentChanges || []).map(i => `<li>${i}</li>`).join('')}</ul></div>
    <div class="brief-row"><strong>생활 맥락</strong><ul>${(brief.contextSummary || []).map(i => `<li>${i}</li>`).join('')}</ul></div>
    <div class="brief-row"><strong>위험도</strong><p>${brief.riskSummary}</p></div>
    <div class="brief-row"><strong>상담 가이드</strong><p>${brief.consultationGuide}</p></div>
    <div class="brief-disclaimer">${brief.disclaimer}</div>
  `;
}

// ── [명세 6.13] 현금흐름 안정성 요약 모달 렌더링 ──
function renderStabilityModal(report) {
  const el = $("stabilityContent");
  if (!el) return;
  el.innerHTML = `
    <div class="brief-row"><strong>필수 고정비 유지율</strong><p>${report.fixedExpenseRatio}</p></div>
    <div class="brief-row"><strong>정기 납부 규칙성</strong><p>${report.regularPaymentPattern}</p></div>
    <div class="brief-row"><strong>조절 가능 지출 탄력성</strong><p>${report.adjustableExpenseFlexibility}</p></div>
    <div class="brief-row"><strong>월 저축 가능액</strong><p>${report.monthlySavingCapacity}</p></div>
    <div class="brief-row"><strong>지출 추세</strong><p>${report.trendSummary}</p></div>
    ${report.contextBasedExclusions?.length ? `<div class="brief-row"><strong>일회성 확인 지출</strong><ul>${report.contextBasedExclusions.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}
    <div class="brief-disclaimer">${report.disclaimer}</div>
  `;
}

// ── Questions ──
async function answerQuestion(qid, val) {
  const p   = getProfile();
  const q   = p.questions.find(x => x.id === qid);
  const opt = q?.options.find(o => o.value === val);
  if (!q || !opt) return;
  state.answers[qid] = val;
  saveState();
  renderAll();
  toast(opt.result);

  // ── [명세 4.2] analyzeContext — 답변 시 AI 맥락 분석 (API key 있을 때만) ──
  if (aiConfig.apiKey) {
    const tx = p.transactions.find(t => t.category !== '급여') || p.transactions[0];
    analyzeContext(tx, q.title, opt.label).then(result => {
      if (!result.isError) {
        console.info(`[Context] ${result.memoryNote}`);
      }
    }).catch(() => {});
  }
}

// ── Modal ──
function openModal(id)  { const el = $(id); if (el) el.classList.add("open"); }
function closeModal(id) { const el = $(id); if (el) el.classList.remove("open"); }

// ── Toast ──
function toast(msg) {
  clearTimeout(toastTimer);
  $("toastMsg").textContent = msg;
  $("toast").classList.add("show");
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2800);
}

// ── State persistence ──
function saveState() {
  try {
    localStorage.setItem("jb-pm-state", JSON.stringify({
      profile:      state.profile,
      answers:      state.answers,
      removedMems:  state.removedMems,
      dataCtrl:     state.dataCtrl,
    }));
  } catch {}
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("jb-pm-state"));
    if (!s) return;
    state.profile = "starter";
    state.answers     = s.answers     || {};
    state.removedMems = s.removedMems || [];
    // 데이터 통제 설정 병합 (기본값 유지)
    if (s.dataCtrl) state.dataCtrl = { ...state.dataCtrl, ...s.dataCtrl };
  } catch {}
}
