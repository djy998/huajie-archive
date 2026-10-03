/* 花舞之街 · 活动问卷。题目规则与 Worker 的 SURVEYS 一致，换活动时更换 SURVEY.id */
const SURVEY_PROJECTS = [
  { key: "zhenli", name: "真理馆", desc: "迷宫探索", num: "31·32·34·36" },
  { key: "miumiu", name: "Miumiucandy拉拉菲尔主题店", desc: "书信、故事续写·漂流瓶", num: "33·44" },
  { key: "maitian", name: "麦田舞团", desc: "舞蹈", num: "35" },
  { key: "qingmu", name: "青木原", desc: "情景游戏/抽奖", num: "38" },
  { key: "qihai", name: "七海小镇", desc: "限时游戏（庭院）", num: "39·40" },
  { key: "lijiya", name: "丽姬娅·群星", desc: "占卜（自营）", num: "41" },
  { key: "paradise", name: "Paradise·乐园", desc: "舞蹈", num: "42" },
  { key: "matcha", name: "抹茶Sweetheart", desc: "小品", num: "43" },
  { key: "photo", name: "摄影项目", desc: "有偿摄影（自营）", num: "45" },
  { key: "longmen", name: "†龙门†龙娘伊甸园", desc: "指名", num: "49" },
  { key: "xiangqin", name: "深夜相亲大会", desc: "相亲交友活动", num: "场外" },
  { key: "band", name: "老二次元音乐社", desc: "乐队演奏", num: "场外" },
];

/* 题型：choice（multi / exclusive / other）、score、card、text；show 为显示条件 */
const SURVEY = {
  id: "moguri2026",
  title: "活动调查问卷",
  intro: "感谢参与「2026莫古力中秋月轮祭」！问卷约需 3～5 分钟，* 为必答题，未提交的内容会自动暂存。",
  closedText: "本次问卷已经结束收集啦，感谢您的关注和支持！",
  sections: [
    {
      title: "活动宣传",
      items: [
        {
          kind: "choice", key: "promo_channels", short: "了解渠道", multi: true, required: true,
          label: "您是从哪些渠道或平台了解到本次活动的？", desc: "可多选",
          options: [
            { key: "qq_group", label: "QQ群消息" },
            { key: "qzone", label: "QQ空间" },
            { key: "nga", label: "NGA" },
            { key: "stone", label: "石之家" },
            { key: "bilibili", label: "B站 / 直播间" },
            { key: "site", label: "花街网站" },
            { key: "recruit", label: "游戏内招募板" },
            { key: "shout", label: "游戏内喊话" },
            { key: "friend", label: "亲友介绍" },
            { key: "other", label: "其他", other: true },
          ],
          other: { key: "promo_channels_other", max: 40 },
        },
        {
          kind: "choice", key: "promo_seen", short: "看过宣传内容", required: true, pair: true,
          label: "您是否看到过本次活动的海报、宣传视频、游园手册等宣传内容？",
          options: [{ key: "yes", label: "是" }, { key: "no", label: "否" }],
        },
        {
          kind: "score", key: "promo_score", short: "宣传内容满意度", required: true, show: { key: "promo_seen", any: ["yes"] },
          label: "您对本次活动的海报、宣传视频、游园手册等宣传内容的满意度",
        },
        {
          kind: "text", key: "promo_note", short: "宣传方面的意见", multiline: true, max: 500,
          label: "您对本次活动的宣传工作是否有意见或建议？",
        },
      ],
    },
    {
      title: "票务与购票系统",
      items: [
        {
          kind: "choice", key: "ticket_way", short: "获得活动票的方式", multi: true, required: true, long: true,
          label: "您是通过什么方式获得活动票的？", desc: "可多选",
          options: [
            { key: "presale", label: "在花街网站购票系统预售登记" },
            { key: "onsite", label: "活动现场购买现场票" },
            { key: "proxy", label: "亲友代购 / 团体票等其他途径" },
            { key: "none", label: "没有购买活动票", exclusive: true },
          ],
        },
        {
          kind: "score", key: "ticket_score", short: "票务满意度", required: true,
          show: { key: "ticket_way", any: ["presale", "onsite", "proxy"] },
          label: "您对本次活动票务工作的满意度", desc: "票价、购票方式、取票等",
        },
        {
          kind: "score", key: "system_score", short: "购票系统满意度", required: true, show: { key: "ticket_way", any: ["presale"] },
          label: "您对花街网站购票系统的使用体验满意度", desc: "填写登记、人机验证、查询登记、截图保存等",
        },
        {
          kind: "text", key: "ticket_note", short: "票务 / 购票系统的意见", multiline: true, max: 500,
          label: "您对本次活动的票务工作或购票系统是否有意见或建议？",
          desc: "如票价、限购、取票方式、购票页面的使用体验",
        },
      ],
    },
    {
      title: "游玩项目",
      items: [
        {
          kind: "choice", key: "projects", short: "参与的项目", multi: true, required: true, wide: true,
          label: "本次活动中，您参与了哪些游玩项目？", desc: "可多选",
          options: [
            ...SURVEY_PROJECTS.map((p) => ({ key: p.key, label: p.name, sub: `${p.num} · ${p.desc}` })),
            { key: "none", label: "没有参与任何项目", exclusive: true },
          ],
        },
        ...SURVEY_PROJECTS.map((p) => ({
          kind: "score", key: `pj_${p.key}`, required: true, show: { key: "projects", any: [p.key] },
          card: { title: p.name, sub: `${p.num} · ${p.desc}` },
          label: "您对这个项目的满意度",
          comment: { key: `pj_${p.key}_note`, label: "对这个项目的意见或建议", max: 500 },
        })),
        {
          kind: "text", key: "none_reason", short: "没参与项目的原因", multiline: true, max: 500, show: { key: "projects", any: ["none"] },
          label: "您没有参与任何项目的原因是？",
        },
      ],
    },
    {
      title: "活动场地与花街网站",
      items: [
        {
          kind: "score", key: "place_score", short: "场地满意度", required: true,
          label: "您对本次活动场地的满意度", desc: "街区布置、房屋、游玩动线、拥挤程度等",
        },
        {
          kind: "text", key: "place_note", short: "场地方面的意见", multiline: true, max: 500,
          label: "对于活动场地您是否有意见或建议？",
        },
        {
          kind: "score", key: "site_score", short: "网站满意度", required: true,
          label: "您对花街网站的整体满意度", desc: "页面设计、功能、加载速度、手机端体验等",
        },
        {
          kind: "text", key: "site_note", short: "网站评价与建议", multiline: true, max: 500,
          label: "您对花街网站有什么评价或建议？", desc: "想要的新功能、遇到的问题、用着不顺手的地方都可以说说",
        },
      ],
    },
    {
      title: "总体评价",
      items: [
        {
          kind: "score", key: "again_score", short: "再次参与意愿", required: true, lo: "不再参与", hi: "非常期待",
          label: "今后如果举办类似的活动，您的参与意愿",
        },
        {
          kind: "text", key: "again_note", short: "对以后活动的建议", multiline: true, max: 500,
          label: "对于类似活动，您有哪些想要保留的项目、期待的新项目或者活动形式上的建议？",
        },
        {
          kind: "score", key: "survey_score", short: "问卷满意度", required: true,
          label: "您对这份调查问卷的题量、覆盖面、答题体验等方面的满意度",
        },
        {
          kind: "text", key: "survey_note", short: "对问卷的意见", multiline: true, max: 500,
          label: "您对这份调查问卷是否有意见或建议？",
        },
        {
          kind: "text", key: "other_note", short: "其他感想", multiline: true, max: 1000,
          label: "对于本次中秋月轮祭活动，您还有哪些感想或建议？", desc: "如想去的项目没能参加上等",
        },
        {
          kind: "text", key: "contact", short: "联系方式", max: 60,
          label: "如果愿意让我们联系您，请留下游戏id或联系方式",
          desc: "选填。仅工作人员可见，只用于和本问卷有关的联系", placeholder: "如：乔薇塔@梦羽宝境 / QQ号",
        },
      ],
    },
  ],
};

const SURVEY_SCORE_LO = "非常不满意";
const SURVEY_SCORE_HI = "非常满意";
const SURVEY_SECTION_NO = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const SURVEY_DRAFT_KEY = STORE.surveyDraft + SURVEY.id;
const SURVEY_DONE_KEY = STORE.surveyDone + SURVEY.id;
const SURVEY_DRAFT_TTL = 30 * 86400000;

/* SURVEY_ITEMS 为页面题目，SURVEY_FIELDS 为提交字段 */
const SURVEY_ITEMS = SURVEY.sections.flatMap((sec, si) => sec.items.map((it) => ({ ...it, section: si })));

function surveyFlatten(items) {
  const fields = [];
  items.forEach((it) => {
    const show = it.show ? { key: it.show.key, any: [...it.show.any] } : null;
    if (it.kind === "choice") {
      const ex = it.options.find((o) => o.exclusive);
      fields.push({ key: it.key, type: it.multi ? "multi" : "single", options: it.options.map((o) => o.key), exclusive: ex ? ex.key : "", required: !!it.required, show });
      const oth = it.options.find((o) => o.other);
      if (oth && it.other) fields.push({ key: it.other.key, type: "text", max: it.other.max, required: false, show: { key: it.key, any: [oth.key] } });
    } else if (it.kind === "score") {
      fields.push({ key: it.key, type: "score", required: !!it.required, show });
      if (it.comment) fields.push({ key: it.comment.key, type: "text", max: it.comment.max, required: false, show });
    } else {
      fields.push({ key: it.key, type: "text", max: it.max, required: !!it.required, show });
    }
  });
  return fields;
}
const SURVEY_FIELDS = surveyFlatten(SURVEY_ITEMS);
const SURVEY_FIELD_ITEM = new Map();   // 字段 → 所属的题
SURVEY_ITEMS.forEach((it) => {
  SURVEY_FIELD_ITEM.set(it.key, it);
  if (it.other) SURVEY_FIELD_ITEM.set(it.other.key, it);
  if (it.comment) SURVEY_FIELD_ITEM.set(it.comment.key, it);
});

/* 校验规则与 Worker 一致：返回 { answers } 或 { field, reason } */
const surveyCleanText = (v) => v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();

function surveyNormalizeAnswers(fields, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { field: "", reason: "invalid" };
  const out = {};
  for (const f of fields) {
    if (f.show) {
      const dep = out[f.show.key];
      const vals = Array.isArray(dep) ? dep : dep === undefined ? [] : [dep];
      if (!f.show.any.some((v) => vals.includes(v))) continue;
    }
    const v = raw[f.key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) {
      if (f.required) return { field: f.key, reason: "required" };
      continue;
    }
    if (f.type === "single") {
      if (typeof v !== "string" || !f.options.includes(v)) return { field: f.key, reason: "invalid" };
      out[f.key] = v;
    } else if (f.type === "multi") {
      if (!Array.isArray(v) || new Set(v).size !== v.length || v.some((x) => typeof x !== "string" || !f.options.includes(x))) return { field: f.key, reason: "invalid" };
      if (f.exclusive && v.includes(f.exclusive) && v.length > 1) return { field: f.key, reason: "exclusive" };
      out[f.key] = f.options.filter((o) => v.includes(o));
    } else if (f.type === "score") {
      if (!Number.isInteger(v) || v < 1 || v > 10) return { field: f.key, reason: "invalid" };
      out[f.key] = v;
    } else {
      if (typeof v !== "string") return { field: f.key, reason: "invalid" };
      const t = surveyCleanText(v);
      if (!t) {
        if (f.required) return { field: f.key, reason: "required" };
        continue;
      }
      if (t.length > f.max) return { field: f.key, reason: "too_long" };
      out[f.key] = t;
    }
  }
  return { answers: out };
}

/* 按当前填写内容算出每个字段显示与否（与上面的丢题规则一致） */
function surveyVisibility(raw) {
  const vis = {};
  for (const f of SURVEY_FIELDS) {
    let on = true;
    if (f.show) {
      const dep = raw[f.show.key];
      const vals = Array.isArray(dep) ? dep : dep ? [dep] : [];
      on = !!vis[f.show.key] && f.show.any.some((v) => vals.includes(v));
    }
    vis[f.key] = on;
  }
  return vis;
}

/* 文字对照（管理页、导出共用） */
function surveyOptionLabel(it, key) {
  const o = it.options?.find((x) => x.key === key);
  return o ? o.label : key;
}

function surveyFieldHeader(key) {
  const it = SURVEY_FIELD_ITEM.get(key);
  if (!it) return key;
  const name = it.card ? it.card.title : it.short || it.label;
  if (it.other && key === it.other.key) return `${name}·其他`;
  if (it.comment && key === it.comment.key) return `${name}·意见或建议`;
  return it.card ? `${name}·满意度` : name;
}

function surveyAnswerText(key, value) {
  if (value === undefined || value === null || value === "") return "";
  const it = SURVEY_FIELD_ITEM.get(key);
  if (it && it.kind === "choice" && key === it.key) {
    return Array.isArray(value) ? value.map((k) => surveyOptionLabel(it, k)).join("、") : surveyOptionLabel(it, value);
  }
  return Array.isArray(value) ? value.join("、") : String(value);
}

/* 表单：控件用 data-sv-choice / data-sv-score / data-sv-text="字段" 标记，每道题的外框是 data-sv-item */
function surveyItemHtml(it) {
  const esc = escapeHtml;
  const id = (k) => `sv-${k}`;
  const sub = (text) => (text ? `<p class="ticket-sub">${esc(text)}</p>` : "");
  const req = it.required ? " is-required" : "";
  const no = '<span class="survey-no" data-sv-no></span>';
  const err = '<p class="survey-err" data-sv-err role="alert" hidden></p>';

  if (it.kind === "choice") {
    const type = it.multi ? "checkbox" : "radio";
    const cls = it.pair ? " is-pair" : it.wide ? " is-wide" : it.long ? " is-long" : "";
    return `
      <div class="ticket-field survey-q" data-sv-item="${it.key}">
        <span class="ticket-label${req}" id="${id(it.key)}-label">${no}${esc(it.label)}</span>
        ${sub(it.desc)}
        <div class="survey-options${cls}" role="${it.multi ? "group" : "radiogroup"}" aria-labelledby="${id(it.key)}-label">
          ${it.options.map((o) => `<label class="venue-choice survey-choice"><input type="${type}" name="${id(it.key)}" value="${o.key}" data-sv-choice="${it.key}"${o.exclusive ? " data-sv-exclusive" : ""}><span class="survey-choice-text">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</span></label>`).join("")}
        </div>
        ${it.other ? `<input type="text" class="venue-other survey-other" data-sv-text="${it.other.key}" maxlength="${it.other.max}" placeholder="请补充说明（选填）" aria-label="补充说明" hidden>` : ""}
        ${err}
      </div>`;
  }

  if (it.kind === "score") {
    const lo = it.lo || SURVEY_SCORE_LO;
    const hi = it.hi || SURVEY_SCORE_HI;
    const head = it.card
      ? `<p class="survey-card-title">${no}${esc(it.card.title)}</p><p class="survey-card-sub">${esc(it.card.sub)}</p>
         <span class="ticket-label survey-card-label${req}" id="${id(it.key)}-label">${esc(it.label)}</span>`
      : `<span class="ticket-label${req}" id="${id(it.key)}-label">${no}${esc(it.label)}</span>${sub(it.desc)}`;
    const opts = Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
      `<label class="survey-scale-opt"><input type="radio" name="${id(it.key)}" value="${n}" data-sv-score="${it.key}" aria-label="${n} 分${n === 1 ? ` ${esc(lo)}` : n === 10 ? ` ${esc(hi)}` : ""}"><span>${n}</span></label>`).join("");
    return `
      <div class="ticket-field survey-q${it.card ? " is-card" : ""}" data-sv-item="${it.key}">
        ${head}
        <div class="survey-scale" role="radiogroup" aria-labelledby="${id(it.key)}-label">${opts}</div>
        <div class="survey-scale-ends" aria-hidden="true"><span>1 = ${esc(lo)}</span><span>10 = ${esc(hi)}</span></div>
        ${err}
        ${it.comment ? `
          <label class="survey-sublabel" for="${id(it.comment.key)}">${esc(it.comment.label)}</label>
          <textarea id="${id(it.comment.key)}" data-sv-text="${it.comment.key}" maxlength="${it.comment.max}" placeholder="选填" rows="2"></textarea>` : ""}
      </div>`;
  }

  const placeholder = esc(it.placeholder || "选填");
  return `
    <div class="ticket-field survey-q" data-sv-item="${it.key}">
      <label class="ticket-label${req}" for="${id(it.key)}">${no}${esc(it.label)}</label>
      ${sub(it.desc)}
      ${it.multiline
        ? `<textarea id="${id(it.key)}" data-sv-text="${it.key}" maxlength="${it.max}" placeholder="${placeholder}"></textarea>`
        : `<input type="text" id="${id(it.key)}" data-sv-text="${it.key}" maxlength="${it.max}" placeholder="${placeholder}">`}
      ${err}
    </div>`;
}

const surveyFormHtml = () => SURVEY.sections.map((sec, si) => `
  <section class="survey-sec" aria-label="${escapeHtml(sec.title)}">
    <h3 class="survey-sec-title"><span class="survey-sec-no">${SURVEY_SECTION_NO[si] || si + 1}</span>${escapeHtml(sec.title)}</h3>
    ${sec.items.map(surveyItemHtml).join("")}
  </section>`).join("");

/* 所有字段的原始值（包括隐藏的题，草稿要用） */
function surveyReadRaw(root) {
  const raw = {};
  for (const f of SURVEY_FIELDS) {
    if (f.type === "single") raw[f.key] = root.querySelector(`input[data-sv-choice="${f.key}"]:checked`)?.value || "";
    else if (f.type === "multi") raw[f.key] = [...root.querySelectorAll(`input[data-sv-choice="${f.key}"]:checked`)].map((el) => el.value);
    else if (f.type === "score") {
      const el = root.querySelector(`input[data-sv-score="${f.key}"]:checked`);
      raw[f.key] = el ? Number(el.value) : null;
    } else raw[f.key] = root.querySelector(`[data-sv-text="${f.key}"]`)?.value || "";
  }
  return raw;
}

/* 把原始值填回表单（恢复草稿），不认识的值忽略 */
function surveyApplyRaw(root, raw) {
  for (const f of SURVEY_FIELDS) {
    const v = raw[f.key];
    if (f.type === "single" || f.type === "multi") {
      const want = new Set(Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []);
      if (f.exclusive && want.size > 1) want.delete(f.exclusive);
      root.querySelectorAll(`input[data-sv-choice="${f.key}"]`).forEach((el) => { el.checked = want.has(el.value); });
    } else if (f.type === "score") {
      root.querySelectorAll(`input[data-sv-score="${f.key}"]`).forEach((el) => { el.checked = Number(el.value) === v; });
    } else {
      root.querySelector(`[data-sv-text="${f.key}"]`).value = typeof v === "string" ? v.slice(0, f.max) : "";
    }
  }
}

function surveyClearForm(root) {
  root.querySelectorAll("input, textarea").forEach((el) => {
    if (el.type === "radio" || el.type === "checkbox") el.checked = false;
    else el.value = "";
  });
  root.querySelectorAll(".survey-q.is-error").forEach(clearSurveyError);
}

/* 按填写内容显示 / 隐藏题目，给看得见的题重新编号 */
function surveySync(root) {
  const vis = surveyVisibility(surveyReadRaw(root));
  let n = 0;
  SURVEY_ITEMS.forEach((it) => {
    const box = root.querySelector(`[data-sv-item="${it.key}"]`);
    box.hidden = !vis[it.key];
    if (vis[it.key]) {
      box.dataset.no = String(++n);
      box.querySelector("[data-sv-no]").textContent = `${n}. `;
    }
    if (it.other) box.querySelector(`[data-sv-text="${it.other.key}"]`).hidden = !vis[it.other.key];
  });
}

function clearSurveyError(box) {
  box.classList.remove("is-error");
  setMsg(box.querySelector("[data-sv-err]"), "");
}

const SURVEY_REASON_TEXT = {
  required: "这道题还没有回答",
  invalid: "这道题的答案不对，请重新选一下",
  exclusive: "该选项不能与其他选项同时选择",
  too_long: "超出字数上限",
};

/* 标红出错的题并滚过去，返回表单底部的提示 */
function surveyShowFieldError(root, field, reason) {
  const it = SURVEY_FIELD_ITEM.get(field);
  const box = it && root.querySelector(`[data-sv-item="${it.key}"]`);
  if (!box || box.hidden) return "提交的内容有问题，请检查一下再提交";
  const max = SURVEY_FIELDS.find((x) => x.key === field)?.max;
  const text = reason === "too_long" && max ? `最多 ${max} 字`
    : reason === "required" && it.card ? "请给这个项目打个分"
    : SURVEY_REASON_TEXT[reason] || SURVEY_REASON_TEXT.invalid;
  box.classList.add("is-error");
  setMsg(box.querySelector("[data-sv-err]"), text);
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  const own = (it.other && field === it.other.key) || (it.comment && field === it.comment.key);
  box.querySelector(own ? `[data-sv-text="${field}"]` : "input, textarea")?.focus({ preventScroll: true });
  const where = it.card ? `第 ${box.dataset.no} 题（${it.card.title}）` : `第 ${box.dataset.no} 题`;
  return reason === "required" ? `${where}还没有回答，已帮你定位到那里` : `${where}：${text}`;
}

/* 问卷卡片只创建一次，切换页面不丢失已填内容 */
const surveyState = {
  card: null,
  mode: "form",       // form / blocked / done
  nearSubmit: false,  // 提交区接近屏幕时才出验证题，免得填到一半题目过期
  submitting: false,
  draftTimer: 0,
};
let surveyGate = null;

const surveyFieldsRoot = () => $("surveyFields");

function surveySaveDraftNow() {
  clearTimeout(surveyState.draftTimer);
  surveyState.draftTimer = 0;
  if (!surveyState.card || surveyState.mode !== "form") return;
  const raw = surveyReadRaw(surveyFieldsRoot());
  const empty = Object.values(raw).every((v) => v === "" || v === null || (Array.isArray(v) && !v.length));
  if (empty) storage.remove(SURVEY_DRAFT_KEY);
  else storage.set(SURVEY_DRAFT_KEY, JSON.stringify({ at: Date.now(), raw }));
}

function surveySaveDraftSoon() {
  clearTimeout(surveyState.draftTimer);
  surveyState.draftTimer = setTimeout(surveySaveDraftNow, 500);
}

function surveyRestoreDraft() {
  const d = storage.json(SURVEY_DRAFT_KEY);
  if (!d?.raw || typeof d.raw !== "object" || Array.isArray(d.raw) || !(Date.now() - Number(d.at) < SURVEY_DRAFT_TTL)) {
    storage.remove(SURVEY_DRAFT_KEY);
    return false;
  }
  surveyApplyRaw(surveyFieldsRoot(), d.raw);
  return true;
}

function setSurveyMode(mode, text = "") {
  surveyState.mode = mode;
  setMsg($("surveyBlocked"), mode === "blocked" ? text : "");
  $("surveyForm").hidden = mode !== "form";
  $("surveyDoneBox").hidden = mode !== "done";
  if (mode === "form") surveyGate.open();
}

function showSurveyDone(done) {
  $("surveyDoneNote").textContent = done.id
    ? `问卷编号 #${done.id}。每一份问卷我们都会认真阅读，感谢您抽出时间！`
    : "每一份问卷我们都会认真阅读，感谢您抽出时间！";
  setSurveyMode("done");
}

/* 问卷所在的标签页现在看得见吗 */
function surveyVisibleNow() {
  const card = surveyState.card;
  return !!card && !$("view-detail").hidden && !$("panel-feedback").hidden && card.parentNode === $("panel-feedback");
}

/* 每次打开时查询开放状态；查询失败时照常填写，由 Worker 判断 */
let surveyStatusSeq = 0;
async function refreshSurveyStatus() {
  const seq = ++surveyStatusSeq;
  const data = await callWorker({ action: "get_survey_status", survey: SURVEY.id }, { quiet: true });
  if (seq !== surveyStatusSeq || !data?.ok) return;
  siteLockdown = !!data.lockdown;
  if (surveyState.mode === "done" || surveyState.submitting) return;
  if (data.lockdown) setSurveyMode("blocked", STATIC_MODE_MSG);
  else if (!data.open) setSurveyMode("blocked", SURVEY.closedText);
  else setSurveyMode("form");
}

/* 详情页切到「反馈与建议」时调用 */
function onSurveyTabShown() {
  if (!surveyState.card || surveyState.card.parentNode !== $("panel-feedback") || surveyState.mode === "done") return;
  refreshSurveyStatus();
  requestAnimationFrame(() => surveyGate.open());
}

const SURVEY_ERRORS = {
  rate_limited: "操作过于频繁，请稍后再试",
  too_large: "内容过长",
  bad_survey: "问卷不存在或已下线，刷新一下页面再试",
  server_error: "问卷保存失败，请稍后再试，一直这样的话请联系管理员",
  unknown_action: "网站后台暂时无法接收问卷，请联系活动群群主",
};

async function submitSurvey(e) {
  e.preventDefault();
  if (surveyState.submitting) return;
  const root = surveyFieldsRoot();
  const msg = $("surveyMsg");
  root.querySelectorAll(".survey-q.is-error").forEach(clearSurveyError);
  surveySync(root);

  const res = surveyNormalizeAnswers(SURVEY_FIELDS, surveyReadRaw(root));
  if (!res.answers) {
    setMsg(msg, surveyShowFieldError(root, res.field, res.reason));
    return;
  }
  surveyState.nearSubmit = true;
  const need = surveyGate.missing();
  if (need) {
    setMsg(msg, need);
    $("surveyVerify").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  setMsg(msg, "");
  surveyState.submitting = true;
  const btn = $("surveySubmitBtn");
  btn.disabled = true;
  btn.textContent = "提交中…";
  const data = await callWorker({ action: "submit_survey", survey: SURVEY.id, answers: res.answers, ...surveyGate.proof() });
  surveyState.submitting = false;
  btn.disabled = false;
  btn.textContent = "提交问卷";
  surveyGate.afterSubmit(data);

  if (!data) {
    setMsg(msg, "网络连接失败，这次可能没有提交成功。检查一下网络后再点一次「提交问卷」（已填的内容不会丢）");
  } else if (data.ok) {
    const done = { id: Number(data.id) || 0, at: Date.now() };
    storage.set(SURVEY_DONE_KEY, JSON.stringify(done));
    clearTimeout(surveyState.draftTimer);
    surveyState.draftTimer = 0;
    storage.remove(SURVEY_DRAFT_KEY);
    surveyClearForm(root);
    surveySync(root);
    $("surveyDraftNote").hidden = true;
    showSurveyDone(done);
    $("surveyDoneBox").scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (data.error === "closed") {
    siteLockdown = true;
    setSurveyMode("blocked", STATIC_MODE_MSG);
  } else if (data.error === "survey_closed") {
    setSurveyMode("blocked", SURVEY.closedText);
  } else if (data.error === "captcha") {
    setMsg(msg, CAPTCHA_FAILED_MSG);
    $("surveyVerify").scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (data.error === "bad_answer") {
    setMsg(msg, surveyShowFieldError(root, data.field, data.reason));
  } else {
    setMsg(msg, SURVEY_ERRORS[data.error] || "提交失败，请稍后再试");
  }
}

function buildSurveyCard() {
  const card = document.createElement("div");
  card.className = "gate-card ticket-card survey-card";
  card.innerHTML = `
    <h2>${escapeHtml(SURVEY.title)}</h2>
    <p class="hint survey-intro">${escapeHtml(SURVEY.intro)}</p>
    <p class="ticket-blocked" id="surveyBlocked" hidden></p>
    <form id="surveyForm" novalidate autocomplete="off">
      <p class="survey-draft-note" id="surveyDraftNote" hidden>已恢复未提交的内容 <button type="button" class="survey-link" id="surveyDraftClear">清空</button></p>
      <div class="survey-form" id="surveyFields">${surveyFormHtml()}</div>
      <div class="survey-submit" id="surveySubmitArea">
        <div class="verify-host ticket-verify" id="surveyVerify"></div>
        <div class="ticket-submit-row"><button type="submit" id="surveySubmitBtn">提交问卷</button></div>
        <p class="form-msg" id="surveyMsg" role="status" hidden></p>
      </div>
    </form>
    <div class="ticket-result survey-done" id="surveyDoneBox" hidden>
      <h3>提交成功，谢谢您的反馈！</h3>
      <p class="ticket-result-note" id="surveyDoneNote"></p>
      <p class="survey-done-more">还有想说的，随时可以点首页最下面的小字，在<button type="button" class="survey-link" id="surveyAboutLink">「反馈与建议」</button>里告诉我们。</p>
    </div>`;
  surveyState.card = card;
  return card;
}

function initSurveyCard() {
  const card = surveyState.card;
  const root = card.querySelector("#surveyFields");
  const form = card.querySelector("#surveyForm");
  const edited = () => {
    setMsg($("surveyMsg"), "");
    surveySaveDraftSoon();
  };

  form.addEventListener("change", (e) => {
    const t = e.target;
    /* 互斥：勾了「没有…」就取消其他，勾了其他就取消「没有…」 */
    if (t.matches('input[type="checkbox"][data-sv-choice]') && t.checked) {
      const exclusive = t.hasAttribute("data-sv-exclusive");
      root.querySelectorAll(`input[data-sv-choice="${t.dataset.svChoice}"]`).forEach((el) => {
        if (el !== t && el.checked && (exclusive || el.hasAttribute("data-sv-exclusive"))) el.checked = false;
      });
    }
    surveySync(root);
    const box = t.closest(".survey-q.is-error");
    if (box) clearSurveyError(box);
    if (t.matches("input[data-sv-choice]") && t.checked && t.value === "other") {
      const it = SURVEY_FIELD_ITEM.get(t.dataset.svChoice);
      if (it?.other) root.querySelector(`[data-sv-text="${it.other.key}"]`).focus();
    }
    edited();
  });
  form.addEventListener("input", (e) => {
    const box = e.target.closest(".survey-q.is-error");
    if (box && e.target.matches("[data-sv-text]")) clearSurveyError(box);
    edited();
  });
  /* 输入框里按回车不提交整份问卷（输入法上屏的回车不拦） */
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229 && e.target.tagName === "INPUT") e.preventDefault();
  });
  form.addEventListener("submit", submitSurvey);

  card.querySelector("#surveyDraftClear").addEventListener("click", () => {
    if (!confirm("清空已填写的内容？")) return;
    surveyClearForm(root);
    surveySync(root);
    storage.remove(SURVEY_DRAFT_KEY);
    $("surveyDraftNote").hidden = true;
    setMsg($("surveyMsg"), "");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  card.querySelector("#surveyAboutLink").addEventListener("click", () => openSiteAbout("feedback"));

  /* 切到后台或离开页面前立刻存草稿（手机上切出去的页面常被回收） */
  const flush = () => { if (surveyState.draftTimer) surveySaveDraftNow(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  window.addEventListener("pagehide", flush);

  surveyGate = createFormGate($("surveyVerify"), {
    shouldOpen: () => surveyState.mode === "form" && surveyState.nearSubmit && surveyVisibleNow(),
    onPass: () => setMsg($("surveyMsg"), ""),
  });
  /* 滚动到提交按钮附近才出题 */
  if (!("IntersectionObserver" in window)) { surveyState.nearSubmit = true; return; }
  new IntersectionObserver((entries) => {
    if (!entries.some((en) => en.isIntersecting)) return;
    surveyState.nearSubmit = true;
    surveyGate.open();
  }, { rootMargin: "0px 0px 240px 0px" }).observe(card.querySelector("#surveySubmitArea"));
}

/* 打开最新活动详情时调用：把问卷放进「反馈与建议」 */
function mountSurvey(panel) {
  if (surveyState.card) {
    if (surveyState.card.parentNode !== panel) panel.replaceChildren(surveyState.card);
    return;
  }
  panel.replaceChildren(buildSurveyCard());
  initSurveyCard();
  const done = storage.json(SURVEY_DONE_KEY);
  if (done && typeof done === "object") {
    showSurveyDone(done);
  } else {
    $("surveyDraftNote").hidden = !surveyRestoreDraft();
    setSurveyMode(siteLockdown ? "blocked" : "form", STATIC_MODE_MSG);
  }
  surveySync(surveyFieldsRoot());
}
