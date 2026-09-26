/* =============================================================================
   花舞之街 · 薰风花语町 —— 活动问卷 survey.js
   -----------------------------------------------------------------------------
   最新活动详情页的「反馈与建议」标签页里的站内问卷（参考往年问卷星的活动调查改写）。
   数据进 Worker 的 survey_responses 表（第一次用到时自动建表，不动任何已有的表），
   管理员在内部入口的「活动问卷」里看统计、逐份查看、作废 / 恢复、开放 / 关闭、导出 Excel（见 admin.js 7d 节）。
   页面里紧跟 venue.js 加载：
       <script src="venue.js?v=3"></script>
       <script src="survey.js?v=1"></script>
       <script>initApp();</script>
   依赖主脚本：$、callWorker、setMsg、showToast、escapeHtml、storage、captchaOn、siteLockdown、
   STATIC_MODE_MSG、TURNSTILE_SITE_KEY、openSiteAbout。
   admin.js 也会用到这里的题目定义和文字对照（SURVEY、SURVEY_FIELDS、surveyAnswerText…）。
   改了本文件之后把 index.html 里 survey.js?v= 的数字 +1。

   题目规则（key、题型、选项 key、必答、显示条件、字数上限）要和 worker.js 的 SURVEYS 保持一致：
     - 只改题目 / 选项的文字、说明：只改这里，不用动 Worker
     - 增删题目或选项、改显示条件 / 必答 / 字数上限：这里和 worker.js 两边一起改
   换一场活动做新问卷时：把 SURVEY.id 换成新的（例如 "newyear2027"），Worker 的 SURVEYS 里加同名的一份，
   旧问卷的答卷按 id 分开存，互不影响。
   ============================================================================= */

/* 本次活动的游玩项目：按「活动店家」（LATEST_EVENT.areas）+ 摄影项目（游园手册 45 号房，自营） */
const SURVEY_PROJECTS = [
  { key: "zhenli",   name: "真理馆",                   desc: "迷宫探索",             num: "31·32·34·36" },
  { key: "miumiu",   name: "Miumiucandy拉拉菲尔主题店", desc: "书信、故事续写·漂流瓶", num: "33·44" },
  { key: "maitian",  name: "麦田舞团",                 desc: "舞蹈",                 num: "35" },
  { key: "qingmu",   name: "青木原",                   desc: "情景游戏/抽奖",        num: "38" },
  { key: "qihai",    name: "七海小镇",                 desc: "限时游戏（庭院）",     num: "39·40" },
  { key: "lijiya",   name: "丽姬娅·群星",              desc: "占卜（自营）",         num: "41" },
  { key: "paradise", name: "Paradise·乐园",            desc: "舞蹈",                 num: "42" },
  { key: "matcha",   name: "抹茶Sweetheart",           desc: "小品",                 num: "43" },
  { key: "photo",    name: "摄影项目",                 desc: "有偿摄影（自营）",     num: "45" },
  { key: "longmen",  name: "†龙门†龙娘伊甸园",         desc: "指名",                 num: "49" },
  { key: "xiangqin", name: "深夜相亲大会",             desc: "相亲交友活动",         num: "场外" },
  { key: "band",     name: "老二次元音乐社",           desc: "乐队演奏",             num: "场外" },
];

/* 题目定义。题型：
     choice —— 单选（multi 不写）/ 多选（multi: true）；选项带 exclusive 表示「选了它就不能选别的」，
               带 other 表示「其他」，选中后出现补充说明框（other.key）；
               pair / wide / long 只影响排版（两列 / 宽格子 / 手机上一行一个）
     score  —— 1～10 分打分；card 表示用卡片样式（游玩项目）；
               comment 表示卡片里附带的「意见或建议」框
     text   —— 文字；multiline 为多行
   short：题目的简称，只在管理页（评分一览、逐份查看）和导出的 Excel 表头里用
   show：{ key, any: [...] } —— 只有前面那道题选了 any 里的任一项时才显示（被隐藏的题不提交） */
const SURVEY = {
  id: "moguri2026",
  title: "活动调查问卷",
  intro: "感谢您参与「2026莫古力中秋月轮祭」！问卷大约需要 3～5 分钟，带 * 的为必答题。"
    + "填到一半离开也没关系，已填的内容会暂存在这台设备的浏览器里。您的反馈会让我们未来的活动办得更好！",
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
            { key: "qzone",    label: "QQ空间" },
            { key: "nga",      label: "NGA" },
            { key: "stone",    label: "石之家" },
            { key: "bilibili", label: "B站 / 直播间" },
            { key: "site",     label: "花街网站" },
            { key: "recruit",  label: "游戏内招募板" },
            { key: "shout",    label: "游戏内喊话" },
            { key: "friend",   label: "亲友介绍" },
            { key: "other",    label: "其他", other: true },
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
            { key: "onsite",  label: "活动现场购买现场票" },
            { key: "proxy",   label: "亲友代购 / 团体票等其他途径" },
            { key: "none",    label: "没有购买活动票", exclusive: true },
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
          desc: "比如票价、限购、取票方式，或者购票页面哪里不好用",
        },
      ],
    },
    {
      title: "游玩项目",
      items: [
        {
          kind: "choice", key: "projects", short: "参与的项目", multi: true, required: true, wide: true,
          label: "本次活动中，您参与了哪些游玩项目？", desc: "可多选，选中的项目会在下方出现对应的评分",
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
          label: "您对花街网站的整体满意度", desc: "页面设计、功能、加载速度、手机上的使用体验等",
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
          label: "对于本次中秋月轮祭活动，您还有哪些感想或建议？", desc: "比如想去的项目没能参加上等",
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
const SURVEY_DRAFT_KEY = `hj_survey_draft_${SURVEY.id}`;   // 没提交的草稿（本机）
const SURVEY_DONE_KEY = `hj_survey_done_${SURVEY.id}`;     // 本机已经提交过（{ id, at }）
const SURVEY_DRAFT_TTL = 30 * 86400000;                    // 草稿保留 30 天

/* ---- 题目展开 ----------------------------------------------------------------
   SURVEY_ITEMS：页面上的一道道题（带所在分节）
   SURVEY_FIELDS：真正提交的答案字段（「其他」补充、卡片里的意见框各算一个字段）。
   校验规则只看 SURVEY_FIELDS，worker.js 的 SURVEYS 就是它去掉文字后的样子 */
const SURVEY_ITEMS = SURVEY.sections.flatMap((sec, si) => sec.items.map((it) => ({ ...it, section: si })));

function surveyFlatten(items) {
  const fields = [];
  items.forEach((it) => {
    const show = it.show ? { key: it.show.key, any: [...it.show.any] } : null;
    if (it.kind === "choice") {
      const ex = it.options.find((o) => o.exclusive);
      fields.push({
        key: it.key, type: it.multi ? "multi" : "single", options: it.options.map((o) => o.key),
        exclusive: ex ? ex.key : "", required: !!it.required, show,
      });
      const oth = it.options.find((o) => o.other);
      if (oth && it.other) {
        fields.push({ key: it.other.key, type: "text", max: it.other.max, required: false, show: { key: it.key, any: [oth.key] } });
      }
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
/* 字段 → 所属的题 */
const SURVEY_FIELD_ITEM = new Map();
SURVEY_ITEMS.forEach((it) => {
  SURVEY_FIELD_ITEM.set(it.key, it);
  if (it.other) SURVEY_FIELD_ITEM.set(it.other.key, it);
  if (it.comment) SURVEY_FIELD_ITEM.set(it.comment.key, it);
});

/* ---- 校验（和 worker.js 的 readSurveyAnswers 逻辑完全一致） --------------------
   raw：{ 字段: 值 }。按顺序逐题判断：显示条件不满足的题直接丢掉；
   成功返回 { answers }，失败返回 { field, reason }（reason：required / invalid / exclusive / too_long） */
function surveyCleanText(v) {
  return v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();
}

function surveyNormalizeAnswers(fields, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { field: "", reason: "invalid" };
  const out = {};
  for (const f of fields) {
    if (f.show) {
      const dep = out[f.show.key];
      const vals = Array.isArray(dep) ? dep : dep === undefined ? [] : [dep];
      if (!f.show.any.some((v) => vals.includes(v))) continue;
    }
    const v = Object.prototype.hasOwnProperty.call(raw, f.key) ? raw[f.key] : undefined;
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      if (f.required) return { field: f.key, reason: "required" };
      continue;
    }
    if (f.type === "single") {
      if (typeof v !== "string" || !f.options.includes(v)) return { field: f.key, reason: "invalid" };
      out[f.key] = v;
    } else if (f.type === "multi") {
      if (!Array.isArray(v) || new Set(v).size !== v.length
        || v.some((x) => typeof x !== "string" || !f.options.includes(x))) return { field: f.key, reason: "invalid" };
      if (f.exclusive && v.includes(f.exclusive) && v.length > 1) return { field: f.key, reason: "exclusive" };
      out[f.key] = f.options.filter((o) => v.includes(o));
    } else if (f.type === "score") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 10) return { field: f.key, reason: "invalid" };
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

/* 按当前填写内容算出每个字段显示与否（和上面的丢题规则一致） */
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

/* ---- 文字对照（管理页、导出共用） ------------------------------------------- */
function surveyItemTitle(it) {
  return it.card ? it.card.title : it.label;
}
function surveyOptionLabel(it, key) {
  const o = it.options && it.options.find((x) => x.key === key);
  return o ? o.label : key;
}
/* 一个字段的简短名字（管理页逐份查看、导出 Excel 的表头用） */
function surveyFieldHeader(key) {
  const it = SURVEY_FIELD_ITEM.get(key);
  if (!it) return key;
  const name = it.card ? it.card.title : it.short || it.label;
  if (it.other && key === it.other.key) return `${name}（其他·补充）`;
  if (it.comment && key === it.comment.key) return `${name}·意见或建议`;
  return it.card ? `${name}·满意度` : name;
}
/* 一个字段的答案 → 文字（单选 / 多选换成选项文字，分数原样） */
function surveyAnswerText(key, value) {
  if (value === undefined || value === null || value === "") return "";
  const it = SURVEY_FIELD_ITEM.get(key);
  if (it && it.kind === "choice" && key === it.key) {
    return Array.isArray(value) ? value.map((k) => surveyOptionLabel(it, k)).join("、") : surveyOptionLabel(it, value);
  }
  return Array.isArray(value) ? value.join("、") : String(value);
}


/* =============================================================================
   表单构建
   控件都用 data-sv-* 标记（不靠 id 取值）：
     data-sv-choice="字段"  单选 / 多选框     data-sv-score="字段"  打分
     data-sv-text="字段"    文字框            data-sv-item="题 key" 每道题的外框
   ============================================================================= */
function surveyItemHtml(it) {
  const esc = escapeHtml;
  const id = (k) => `sv-${k}`;
  const sub = (text) => (text ? `<p class="ticket-sub">${esc(text)}</p>` : "");
  const req = it.required ? " is-required" : "";
  const no = `<span class="survey-no" data-sv-no></span>`;
  const err = `<p class="survey-err" data-sv-err role="alert" hidden></p>`;

  if (it.kind === "choice") {
    const type = it.multi ? "checkbox" : "radio";
    const cls = it.pair ? " is-pair" : it.wide ? " is-wide" : it.long ? " is-long" : "";
    return `
      <div class="ticket-field survey-q" data-sv-item="${it.key}">
        <span class="ticket-label${req}" id="${id(it.key)}-label">${no}${esc(it.label)}</span>
        ${sub(it.desc)}
        <div class="survey-options${cls}" role="${it.multi ? "group" : "radiogroup"}" aria-labelledby="${id(it.key)}-label">
          ${it.options.map((o) => `
            <label class="venue-choice survey-choice">
              <input type="${type}" name="${id(it.key)}" value="${o.key}" data-sv-choice="${it.key}"${o.exclusive ? " data-sv-exclusive" : ""}>
              <span class="survey-choice-text">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</span>
            </label>`).join("")}
        </div>
        ${it.other ? `<input type="text" class="venue-other survey-other" data-sv-text="${it.other.key}" maxlength="${it.other.max}"
               placeholder="请补充说明（选填）" aria-label="「其他」的补充说明" hidden>` : ""}
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
    return `
      <div class="ticket-field survey-q${it.card ? " is-card" : ""}" data-sv-item="${it.key}">
        ${head}
        <div class="survey-scale" role="radiogroup" aria-labelledby="${id(it.key)}-label">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `
            <label class="survey-scale-opt">
              <input type="radio" name="${id(it.key)}" value="${n}" data-sv-score="${it.key}"
                     aria-label="${n} 分${n === 1 ? `（${esc(lo)}）` : n === 10 ? `（${esc(hi)}）` : ""}">
              <span>${n}</span>
            </label>`).join("")}
        </div>
        <div class="survey-scale-ends" aria-hidden="true"><span>1 = ${esc(lo)}</span><span>10 = ${esc(hi)}</span></div>
        ${err}
        ${it.comment ? `
          <label class="survey-sublabel" for="${id(it.comment.key)}">${esc(it.comment.label)}<em>（选填）</em></label>
          <textarea id="${id(it.comment.key)}" data-sv-text="${it.comment.key}" maxlength="${it.comment.max}" placeholder="选填" rows="2"></textarea>` : ""}
      </div>`;
  }

  return `
    <div class="ticket-field survey-q" data-sv-item="${it.key}">
      <label class="ticket-label${req}" for="${id(it.key)}">${no}${esc(it.label)}</label>
      ${sub(it.desc)}
      ${it.multiline
        ? `<textarea id="${id(it.key)}" data-sv-text="${it.key}" maxlength="${it.max}" placeholder="${esc(it.placeholder || "选填")}"></textarea>`
        : `<input type="text" id="${id(it.key)}" data-sv-text="${it.key}" maxlength="${it.max}" placeholder="${esc(it.placeholder || "选填")}">`}
      ${err}
    </div>`;
}

function surveyFormHtml() {
  return SURVEY.sections.map((sec, si) => `
    <section class="survey-sec" aria-label="${escapeHtml(sec.title)}">
      <h3 class="survey-sec-title"><span class="survey-sec-no">${SURVEY_SECTION_NO[si] || si + 1}</span>${escapeHtml(sec.title)}</h3>
      ${sec.items.map(surveyItemHtml).join("")}
    </section>`).join("");
}

/* 读出表单里所有字段的原始值（包括被隐藏的题，草稿要用） */
function surveyReadRaw(root) {
  const raw = {};
  for (const f of SURVEY_FIELDS) {
    if (f.type === "single") {
      raw[f.key] = root.querySelector(`input[data-sv-choice="${f.key}"]:checked`)?.value || "";
    } else if (f.type === "multi") {
      raw[f.key] = [...root.querySelectorAll(`input[data-sv-choice="${f.key}"]:checked`)].map((el) => el.value);
    } else if (f.type === "score") {
      const el = root.querySelector(`input[data-sv-score="${f.key}"]:checked`);
      raw[f.key] = el ? Number(el.value) : null;
    } else {
      raw[f.key] = root.querySelector(`[data-sv-text="${f.key}"]`)?.value || "";
    }
  }
  return raw;
}

/* 把原始值填回表单（恢复草稿用）；不认识的值直接忽略 */
function surveyApplyRaw(root, raw) {
  for (const f of SURVEY_FIELDS) {
    const v = raw[f.key];
    if (f.type === "single" || f.type === "multi") {
      const want = new Set(Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []);
      root.querySelectorAll(`input[data-sv-choice="${f.key}"]`).forEach((el) => { el.checked = want.has(el.value); });
      /* 草稿被改坏、「没有…」和别的选项同时勾着时，只留「没有…」以外的 */
      if (f.exclusive && want.has(f.exclusive) && want.size > 1) {
        const ex = root.querySelector(`input[data-sv-choice="${f.key}"][value="${f.exclusive}"]`);
        if (ex) ex.checked = false;
      }
    } else if (f.type === "score") {
      root.querySelectorAll(`input[data-sv-score="${f.key}"]`).forEach((el) => { el.checked = Number(el.value) === v; });
    } else {
      const el = root.querySelector(`[data-sv-text="${f.key}"]`);
      if (el) el.value = typeof v === "string" ? v.slice(0, f.max) : "";
    }
  }
}

function surveyClearForm(root) {
  root.querySelectorAll("input, textarea").forEach((el) => {
    if (el.type === "radio" || el.type === "checkbox") el.checked = false;
    else el.value = "";
  });
  surveyClearErrors(root);
}

/* 按填写内容显示 / 隐藏题目，给看得见的题重新编号 */
function surveySync(root) {
  const vis = surveyVisibility(surveyReadRaw(root));
  let n = 0;
  SURVEY_ITEMS.forEach((it) => {
    const box = root.querySelector(`[data-sv-item="${it.key}"]`);
    if (!box) return;
    box.hidden = !vis[it.key];
    if (vis[it.key]) {
      n++;
      box.dataset.no = String(n);
      box.querySelector("[data-sv-no]").textContent = `${n}. `;
    }
    if (it.other) {
      const other = box.querySelector(`[data-sv-text="${it.other.key}"]`);
      if (other) other.hidden = !vis[it.other.key];
    }
  });
}

function surveyClearErrors(root) {
  root.querySelectorAll(".survey-q.is-error").forEach((box) => {
    box.classList.remove("is-error");
    const e = box.querySelector("[data-sv-err]");
    if (e) { e.hidden = true; e.textContent = ""; }
  });
}

const SURVEY_REASON_TEXT = {
  required: "这道题还没有回答",
  invalid: "这道题的答案不对，请重新选一下",
  exclusive: "「没有…」和其他选项不能同时选",
  too_long: "写得太长了",
};

/* 在题目上标红并滚过去；返回表单底部要显示的一句话 */
function surveyShowFieldError(root, field, reason) {
  const it = SURVEY_FIELD_ITEM.get(field);
  const box = it && root.querySelector(`[data-sv-item="${it.key}"]`);
  if (!box || box.hidden) return "提交的内容有问题，请检查一下再提交";
  const f = SURVEY_FIELDS.find((x) => x.key === field);
  let text = SURVEY_REASON_TEXT[reason] || SURVEY_REASON_TEXT.invalid;
  if (reason === "too_long" && f && f.max) text = `写得太长了（最多 ${f.max} 字）`;
  if (reason === "required" && it.card) text = "请给这个项目打个分";
  box.classList.add("is-error");
  const e = box.querySelector("[data-sv-err]");
  if (e) { e.textContent = text; e.hidden = false; }
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusEl = (it.other && field === it.other.key) || (it.comment && field === it.comment.key)
    ? box.querySelector(`[data-sv-text="${field}"]`)
    : box.querySelector("input, textarea");
  focusEl?.focus({ preventScroll: true });
  const where = it.card ? `第 ${box.dataset.no} 题（${it.card.title}）` : `第 ${box.dataset.no} 题`;
  return reason === "required" ? `${where}还没有回答，已帮你定位到那里` : `${where}：${text}`;
}


/* =============================================================================
   页面：挂在最新活动详情页的「反馈与建议」里（index.html 的 openDetail 调用 mountSurvey）
   ============================================================================= */
const surveyState = {
  card: null,          // 整张问卷卡片（只建一次，切换页面不重建，填了一半的内容不会丢）
  mode: "form",        // form / blocked / done
  proof: null,         // 人机验证凭证（Turnstile 过期时以 gate.getProof() 为准）
  gateOpened: false,
  nearSubmit: false,   // 提交区已经进入（或接近）屏幕：这时才出验证题，免得填到一半题目过期
  submitting: false,
  draftTimer: 0,
  verifyMissing: false,
};
let surveyGate = null;

const surveyFieldsRoot = () => $("surveyFields");

function surveyDone() {
  try {
    const v = JSON.parse(storage.get(SURVEY_DONE_KEY) || "null");
    return v && typeof v === "object" ? v : null;
  } catch (e) {
    return null;
  }
}

/* ---- 草稿 ---- */
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
  let d = null;
  try { d = JSON.parse(storage.get(SURVEY_DRAFT_KEY) || "null"); } catch (e) { d = null; }
  if (!d || typeof d !== "object" || !d.raw || typeof d.raw !== "object" || Array.isArray(d.raw)
    || !(Date.now() - Number(d.at) < SURVEY_DRAFT_TTL)) {
    storage.remove(SURVEY_DRAFT_KEY);
    return false;
  }
  surveyApplyRaw(surveyFieldsRoot(), d.raw);
  return true;
}

/* ---- 显示状态 ---- */
function setSurveyMode(mode, blockedText = "") {
  surveyState.mode = mode;
  $("surveyBlocked").hidden = mode !== "blocked";
  $("surveyBlocked").textContent = mode === "blocked" ? blockedText : "";
  $("surveyForm").hidden = mode !== "form";
  $("surveyDoneBox").hidden = mode !== "done";
  if (mode === "form") surveyMaybeOpenGate();
}

function showSurveyDone(done) {
  $("surveyDoneNote").textContent = done && done.id
    ? `问卷编号 #${done.id}。每一份问卷我们都会认真阅读，感谢您抽出时间！`
    : "每一份问卷我们都会认真阅读，感谢您抽出时间！";
  setSurveyMode("done");
}

/* 问卷所在的标签页现在看得见吗 */
function surveyVisibleNow() {
  const card = surveyState.card;
  return !!card && card.isConnected && !$("view-detail").hidden && !$("panel-feedback").hidden
    && card.parentNode === $("panel-feedback");
}

/* ---- 人机验证：提交区快进入屏幕时才出题 ---- */
function surveyMaybeOpenGate(force = false) {
  const host = $("surveyVerify");
  if (!host) return;
  host.hidden = !captchaOn;
  if (!captchaOn || surveyState.gateOpened || surveyState.mode !== "form") return;
  if (!force && (!surveyState.nearSubmit || !surveyVisibleNow())) return;
  if (!surveyGate) {
    if (!window.HJVerify) {
      if (!surveyState.verifyMissing) console.error("[验证] verify.js 没有加载成功，问卷的人机验证不可用");
      surveyState.verifyMissing = true;
      return;
    }
    surveyGate = HJVerify.createGate(host, {
      post: callWorker,
      turnstileSiteKey: TURNSTILE_SITE_KEY,
      onPass: (proof) => {
        surveyState.proof = proof;
        setMsg($("surveyMsg"), "");
      },
    });
  }
  surveyState.proof = null;
  surveyGate.open();
  surveyState.gateOpened = true;
}

function surveyCurrentProof() {
  if (surveyGate && typeof surveyGate.getProof === "function") return surveyGate.getProof();
  return surveyState.proof;
}

/* 机器人验证总开关变了（主脚本 applyCaptchaEnabled 调用） */
function syncSurveyCaptcha(changed) {
  const host = $("surveyVerify");
  if (!host) return;
  host.hidden = !captchaOn;
  if (!changed) return;
  if (captchaOn) {
    surveyState.gateOpened = false;
    surveyMaybeOpenGate();
  } else {
    surveyState.proof = null;
    if (surveyGate) surveyGate.hide();
    surveyState.gateOpened = false;
  }
}

function surveyResetCaptcha() {
  surveyState.proof = null;
  if (captchaOn && surveyGate && surveyState.gateOpened) surveyGate.refresh();
}

/* ---- 开放状态：每次打开「反馈与建议」都问一次 Worker ---- */
let surveyStatusSeq = 0;
async function refreshSurveyStatus() {
  const seq = ++surveyStatusSeq;
  const data = await callWorker({ action: "get_survey_status", survey: SURVEY.id });
  if (seq !== surveyStatusSeq || !surveyState.card) return;
  /* 连不上 / Worker 还是旧版本：先让访客照常填，提交时由 Worker 说了算 */
  if (!data || !data.ok) return;
  siteLockdown = !!data.lockdown;   // 顺手同步「分享功能开关」（和 isLockedDown 读的是同一个开关）
  if (surveyState.mode === "done" || surveyState.submitting) return;
  if (data.lockdown) {
    setSurveyMode("blocked", STATIC_MODE_MSG);
  } else if (!data.open) {
    setSurveyMode("blocked", SURVEY.closedText);
  } else {
    setSurveyMode("form");
  }
}

/* index.html 的 selectDetailTab 切到「反馈与建议」时调用 */
function onSurveyTabShown() {
  if (!surveyState.card || surveyState.card.parentNode !== $("panel-feedback")) return;
  if (surveyState.mode === "done") return;
  refreshSurveyStatus();
  /* 标签页刚显示出来，等布局完成再看提交区在不在屏幕里（IntersectionObserver 会自己补报，这里是兜底） */
  requestAnimationFrame(() => surveyMaybeOpenGate());
}

/* ---- 提交 ---- */
const SURVEY_ERRORS = {
  rate_limited: "提交太频繁了，请过一会儿再试",
  too_large: "填写的内容太多了，删减一些再提交",
  bad_survey: "问卷不存在或已下线，刷新一下页面再试",
  db_error: "问卷保存失败，请稍后再试（一直这样的话请联系管理员）",
  server_error: "网站后台出了点问题，请稍后再试",
  "unknown action": "网站后台还没更新，暂时无法提交问卷，请联系活动群群主",
};
/* Worker 在这些情况下还没走到人机验证那一步，凭证没被用掉，不用重做验证 */
const SURVEY_PRE_VERIFY = ["closed", "survey_closed", "bad_answer", "bad_survey", "too_large", "rate_limited", "unknown action"];

async function submitSurvey(e) {
  e.preventDefault();
  if (surveyState.submitting) return;
  const root = surveyFieldsRoot();
  const msg = $("surveyMsg");
  surveyClearErrors(root);
  surveySync(root);

  const res = surveyNormalizeAnswers(SURVEY_FIELDS, surveyReadRaw(root));
  if (!res.answers) {
    setMsg(msg, surveyShowFieldError(root, res.field, res.reason));
    return;
  }
  const proof = captchaOn ? surveyCurrentProof() : null;
  if (captchaOn && !proof) {
    surveyMaybeOpenGate(true);
    setMsg(msg, surveyGate
      ? "请先完成下方的人机验证（自动验证，或点「自动验证不成功？点击手动验证」换手动验证）"
      : "人机验证组件没加载出来，刷新页面再试一次");
    $("surveyVerify").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  setMsg(msg, "");
  surveyState.submitting = true;
  const btn = $("surveySubmitBtn");
  btn.disabled = true;
  btn.textContent = "提交中…";
  const data = await callWorker({ action: "submit_survey", survey: SURVEY.id, answers: res.answers, ...(proof || {}) });
  surveyState.submitting = false;
  btn.disabled = false;
  btn.textContent = "提交问卷";
  const errKey = data && !data.ok ? data.error : "";
  if (!(data && !data.ok && SURVEY_PRE_VERIFY.includes(errKey))) surveyResetCaptcha();

  if (!data) {
    setMsg(msg, "网络连接失败，这次可能没有提交成功。检查一下网络后再点一次「提交问卷」（已填的内容不会丢）");
    return;
  }
  if (!data.ok) {
    if (errKey === "closed") {
      siteLockdown = true;
      setSurveyMode("blocked", STATIC_MODE_MSG);
      showToast(STATIC_MODE_MSG);
      return;
    }
    if (errKey === "survey_closed") {
      setSurveyMode("blocked", SURVEY.closedText);
      return;
    }
    if (errKey === "captcha") {
      setMsg(msg, "人机验证未通过或已过期，已换一题，请重新验证后提交");
      $("surveyVerify").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (errKey === "bad_answer") {
      setMsg(msg, surveyShowFieldError(root, data.field, data.reason));
      return;
    }
    setMsg(msg, SURVEY_ERRORS[errKey] || "提交失败，请稍后再试");
    return;
  }

  const done = { id: Number(data.id) || 0, at: Date.now() };
  storage.set(SURVEY_DONE_KEY, JSON.stringify(done));
  clearTimeout(surveyState.draftTimer);
  surveyState.draftTimer = 0;
  storage.remove(SURVEY_DRAFT_KEY);
  surveyClearForm(root);
  surveySync(root);
  $("surveyDraftNote").hidden = true;
  if (surveyGate) surveyGate.hide();
  surveyState.gateOpened = false;
  surveyState.proof = null;
  showSurveyDone(done);
  $("surveyDoneBox").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---- 构建整张卡片（只做一次） ---- */
function buildSurveyCard() {
  const card = document.createElement("div");
  card.className = "gate-card ticket-card survey-card";
  card.innerHTML = `
    <h2>${escapeHtml(SURVEY.title)}</h2>
    <p class="hint survey-intro">${escapeHtml(SURVEY.intro)}</p>
    <p class="ticket-blocked" id="surveyBlocked" hidden></p>
    <form id="surveyForm" novalidate autocomplete="off">
      <p class="survey-draft-note" id="surveyDraftNote" hidden>已为你恢复上次没提交的内容
        <button type="button" class="survey-link" id="surveyDraftClear">清空重填</button></p>
      <div class="survey-form" id="surveyFields">${surveyFormHtml()}</div>
      <div class="survey-submit" id="surveySubmitArea">
        <div class="verify-host ticket-verify" id="surveyVerify"></div>
        <div class="ticket-submit-row">
          <button type="submit" id="surveySubmitBtn">提交问卷</button>
        </div>
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

  form.addEventListener("change", (e) => {
    const t = e.target;
    /* 「没有…」和其他选项互斥：勾了「没有…」就把别的取消，勾了别的就把「没有…」取消 */
    if (t.matches && t.matches('input[type="checkbox"][data-sv-choice]') && t.checked) {
      const group = root.querySelectorAll(`input[data-sv-choice="${t.dataset.svChoice}"]`);
      const exclusive = t.hasAttribute("data-sv-exclusive");
      group.forEach((el) => {
        if (el !== t && el.checked && (exclusive || el.hasAttribute("data-sv-exclusive"))) el.checked = false;
      });
    }
    surveySync(root);
    const box = t.closest && t.closest(".survey-q");
    if (box && box.classList.contains("is-error")) {
      box.classList.remove("is-error");
      const err = box.querySelector("[data-sv-err]");
      if (err) err.hidden = true;
    }
    /* 刚选中「其他」：光标直接放进补充说明框 */
    if (t.matches && t.matches("input[data-sv-choice]") && t.checked && t.value === "other") {
      const it = SURVEY_FIELD_ITEM.get(t.dataset.svChoice);
      if (it && it.other) root.querySelector(`[data-sv-text="${it.other.key}"]`)?.focus();
    }
    setMsg($("surveyMsg"), "");
    surveySaveDraftSoon();
  });
  form.addEventListener("input", (e) => {
    const box = e.target.closest && e.target.closest(".survey-q.is-error");
    if (box && e.target.matches("[data-sv-text]")) {
      box.classList.remove("is-error");
      const err = box.querySelector("[data-sv-err]");
      if (err) err.hidden = true;
    }
    setMsg($("surveyMsg"), "");
    surveySaveDraftSoon();
  });
  /* 在输入框 / 选项上按回车不提交整份问卷（只有点「提交问卷」才提交；输入法上屏时的回车不拦） */
  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
    if (e.target && e.target.tagName === "INPUT") e.preventDefault();
  });
  form.addEventListener("submit", submitSurvey);

  card.querySelector("#surveyDraftClear").addEventListener("click", () => {
    if (!confirm("确定清空已填写的内容、从头开始填吗？")) return;
    surveyClearForm(root);
    surveySync(root);
    storage.remove(SURVEY_DRAFT_KEY);
    $("surveyDraftNote").hidden = true;
    setMsg($("surveyMsg"), "");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  card.querySelector("#surveyAboutLink").addEventListener("click", () => {
    if (typeof openSiteAbout === "function") openSiteAbout("feedback");
  });

  /* 切到后台 / 关页面前把草稿立刻存一下（手机上 QQ / 微信内置浏览器切出去常会被回收） */
  document.addEventListener("visibilitychange", () => { if (document.hidden && surveyState.draftTimer) surveySaveDraftNow(); });
  window.addEventListener("pagehide", () => { if (surveyState.draftTimer) surveySaveDraftNow(); });

  /* 提交区快进入屏幕时再出验证题 */
  const area = card.querySelector("#surveySubmitArea");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        surveyState.nearSubmit = true;
        surveyMaybeOpenGate();
      }
    }, { rootMargin: "0px 0px 240px 0px" }).observe(area);
  } else {
    surveyState.nearSubmit = true;
  }
}

/* index.html 的 openDetail（最新活动）调用：把问卷放进「反馈与建议」标签页 */
function mountSurvey(panel) {
  if (!panel) return;
  if (!surveyState.card) {
    buildSurveyCard();
    panel.innerHTML = "";
    panel.appendChild(surveyState.card);
    initSurveyCard();
    const root = surveyFieldsRoot();
    const done = surveyDone();
    if (done) {
      showSurveyDone(done);
    } else {
      $("surveyDraftNote").hidden = !surveyRestoreDraft();
      setSurveyMode(siteLockdown ? "blocked" : "form", siteLockdown ? STATIC_MODE_MSG : "");
    }
    surveySync(root);
    return;
  }
  if (surveyState.card.parentNode !== panel) {
    panel.innerHTML = "";
    panel.appendChild(surveyState.card);
  }
}

window.HJ_SURVEY_READY = true;
