function adminErr(t,e,n={}){return t?n[t.error]?n[t.error]:t.error==="unknown action"?"网站后台（Worker）和网页的版本对不上，请部署最新的 worker.js":t.error==="rate_limited"?"操作太频繁了，歇一会儿再试":t.error==="server_error"?"服务器出错了，稍后再试":e:"连接失败，检查一下网络后再试"}let internalAdminPassword=null,editingAnnouncementId=null,pendingAnnouncementImageUrl=null;const PW_FAIL_CAPTCHA_EVERY=5,getPwFailCount=()=>Number(storage.get(STORE.pwFails))||0;function setPwFailCount(t){t>0?storage.set(STORE.pwFails,t):storage.remove(STORE.pwFails)}function initInternal(){$("internalSubmit").addEventListener("click",checkInternalPassword),$("internalPassword").addEventListener("keydown",t=>{t.key==="Enter"&&checkInternalPassword()}),$("internalPasswordShow").addEventListener("change",t=>{$("internalPassword").type=t.target.checked?"text":"password"})}async function checkInternalPassword(){const t=$("internalPassword"),e=$("internalMsg"),n=$("internalSubmit");if(!WORKER_URL){setMsg(e,"数据库还没配置好，暂时无法验证密码。");return}n.disabled=!0,setMsg(e,"验证中…");const a=await callWorker({action:"get_announcements",password:t.value});if(n.disabled=!1,!a){setMsg(e,"连接失败，检查一下网络后再试");return}if(a.error==="viewer_closed"){setMsg(e,"「购票情况」页面目前已关闭，请联系管理员");return}if(!a.ok){const s=getPwFailCount()+1;setPwFailCount(s),s%PW_FAIL_CAPTCHA_EVERY===0?(setMsg(e,"密码不对，错误次数太多，先完成人机验证"),openCaptcha("internal")):setMsg(e,"密码不对，再试试");return}if(setPwFailCount(0),setMsg(e,""),$("internalGate").hidden=!0,a.isViewer){enterTicketViewer(t.value,a.perms);return}$("internalBoard").hidden=!1,renderAnnouncements(a.items,a.isAdmin),$("adminPills").hidden=!a.isAdmin,a.isAdmin&&(internalAdminPassword=t.value)}function announcementDate(t){const e=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(t||"")),n=e?new Date(Date.UTC(+e[1],+e[2]-1,+e[3],+e[4],+e[5],+e[6])):new Date(t);return Number.isNaN(n.getTime())?"":n.toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai"})}function renderAnnouncements(t,e){const n=$("announcementList");if(!t||!t.length){n.innerHTML='<div class="empty-note">公告板还没有内容</div>';return}n.innerHTML=t.map(a=>{let s="",i="";if(e){const c=[a.show_a&&"A",a.show_b&&"B"].filter(Boolean);s=`<span class="announcement-audience">[${c.length?c.join("+"):"谁都看不到"}]</span>`,i=`
        <div class="announcement-admin-btns">
          <button type="button" class="announcement-edit-btn" data-id="${a.id}">编辑</button>
          <button type="button" class="announcement-delete-btn" data-id="${a.id}">删除</button>
        </div>`}const o=a.image_url?`<img src="${escapeHtml(workerImageUrl(a.image_url))}" loading="lazy" class="announcement-image" data-lightbox>`:"";return`
      <div class="announcement">
        <div class="date">${escapeHtml(announcementDate(a.created_at))}${s}</div>
        <div class="body">${escapeHtml(a.body)}</div>
        ${o}
        ${i}
      </div>`}).join(""),e&&(n.querySelectorAll(".announcement-edit-btn").forEach(a=>{a.addEventListener("click",()=>{const s=t.find(i=>String(i.id)===a.dataset.id);s&&startEditAnnouncement(s)})}),n.querySelectorAll(".announcement-delete-btn").forEach(a=>{a.addEventListener("click",()=>deleteAnnouncement(a.dataset.id))}))}async function refreshAnnouncements(){const t=await callWorker({action:"get_announcements",password:internalAdminPassword});t&&t.ok&&renderAnnouncements(t.items,t.isAdmin)}function showAnnouncementImagePreview(t){$("announcementImagePreviewImg").src=t||"",$("announcementImagePreview").hidden=!t}const readAsDataURL=t=>new Promise((e,n)=>{const a=new FileReader;a.onload=()=>e(a.result),a.onerror=()=>n(new Error("read fail")),a.readAsDataURL(t)});async function compressImageFile(t,e=1600,n=.82){const a=await readAsDataURL(t),s=await new Promise((v,w)=>{const f=new Image;f.onload=()=>v(f),f.onerror=()=>w(new Error("decode fail")),f.src=a});let i=s.naturalWidth,o=s.naturalHeight;const c=Math.min(1,e/Math.max(i,o));i=Math.round(i*c),o=Math.round(o*c);const p=document.createElement("canvas");p.width=i,p.height=o,p.getContext("2d").drawImage(s,0,0,i,o);const l=await new Promise(v=>p.toBlob(v,"image/webp",n));if(!l)throw new Error("encode fail");return{base64:(await readAsDataURL(l)).split(",")[1],contentType:l.type||"image/webp"}}function initAnnouncementImageUpload(){const t=$("announcementImageInput"),e=$("announcementImagePickBtn"),n=$("announcementImageStatus");e.addEventListener("click",()=>t.click()),$("announcementImageRemoveBtn").addEventListener("click",()=>{pendingAnnouncementImageUrl=null,showAnnouncementImagePreview(null)}),t.addEventListener("change",async()=>{const a=t.files&&t.files[0];if(t.value="",!!a){setMsg(n,"图片处理中…"),e.disabled=!0;try{const{base64:s,contentType:i}=await compressImageFile(a),o=await callWorker({action:"upload_announcement_image",password:internalAdminPassword,image:s,content_type:i});if(!o||!o.ok)throw new Error(o&&o.error||"upload failed");pendingAnnouncementImageUrl=new URL(`image/${o.key}`,workerBase()).href,showAnnouncementImagePreview(pendingAnnouncementImageUrl),setMsg(n,"")}catch{setMsg(n,"图片上传失败，请重试")}e.disabled=!1}})}function startEditAnnouncement(t){openAdminPanel("postAnnouncementPanel"),editingAnnouncementId=t.id,$("announcementText").value=t.body,$("announceShowA").checked=!!t.show_a,$("announceShowB").checked=!!t.show_b,pendingAnnouncementImageUrl=t.image_url||null,showAnnouncementImagePreview(pendingAnnouncementImageUrl),$("postAnnouncementBtn").textContent="保存修改",$("cancelEditAnnouncementBtn").hidden=!1,$("announcementText").focus({preventScroll:!0})}function cancelEditAnnouncement(){editingAnnouncementId=null,pendingAnnouncementImageUrl=null,showAnnouncementImagePreview(null),$("announcementText").value="",$("announceShowA").checked=!0,$("announceShowB").checked=!0,$("postAnnouncementBtn").textContent="发布",$("cancelEditAnnouncementBtn").hidden=!0}async function deleteAnnouncement(t){if(!confirm("确定要删除这条公告吗？删除后无法恢复。"))return;const e=await callWorker({action:"delete_announcement",password:internalAdminPassword,id:t});if(!e||!e.ok){showToast("删除失败，请重试");return}showToast("已删除"),String(editingAnnouncementId)===String(t)&&cancelEditAnnouncement(),refreshAnnouncements()}async function submitAnnouncement(){const t=$("announcementText"),e=$("postAnnouncementMsg"),n=$("postAnnouncementBtn"),a=!!editingAnnouncementId;if(setMsg(e,""),!t.value.trim()){setMsg(e,"写点内容再发布吧");return}n.disabled=!0;const s=await callWorker({action:a?"edit_announcement":"post_announcement",password:internalAdminPassword,id:editingAnnouncementId,content:t.value,show_a:$("announceShowA").checked,show_b:$("announceShowB").checked,image_url:pendingAnnouncementImageUrl});if(n.disabled=!1,!s||!s.ok){setMsg(e,a?"保存失败，请重试":"发布失败，请重试");return}cancelEditAnnouncement(),closeAdminPanel(),showToast(a?"公告已更新":"公告已发布"),refreshAnnouncements()}function initPostAnnouncement(){$("cancelEditAnnouncementBtn").addEventListener("click",cancelEditAnnouncement),$("postAnnouncementBtn").addEventListener("click",submitAnnouncement)}let internalViewPassword=null,ticketViewTimer=0;function enterTicketViewer(t,e){internalViewPassword=t,ticketAdmin.role="viewer",ticketAdmin.perms=e||{stats:!0,survey:!1,pickup:!1},ticketAdmin.tab="orders";const n=$("ticketAdminPanel");n.classList.add("is-readonly"),n.querySelector("h2").textContent="购票情况",$("ticketViewHost").appendChild(n),n.hidden=!1;const a=$("surveyAdminPanel"),s=!!(ticketAdmin.perms.survey&&window.HJ_SURVEY_READY);s&&(a.classList.add("is-readonly"),$("ticketViewHost").appendChild(a),a.hidden=!0),$("viewerPills").hidden=!s,$("ticketViewBoard").hidden=!1,refreshTicketAdmin(),clearInterval(ticketViewTimer),ticketViewTimer=setInterval(()=>{!document.hidden&&!$("view-internal").hidden&&!$("ticketViewBoard").hidden&&!n.hidden&&refreshTicketAdmin()},60*1e3)}function initViewerPills(){$("viewerPills").addEventListener("click",t=>{const e=t.target.closest("[data-viewer-panel]");if(!e)return;const n=e.dataset.viewerPanel;$("viewerPills").querySelectorAll("[data-viewer-panel]").forEach(a=>a.classList.toggle("is-active",a===e)),["ticketAdminPanel","surveyAdminPanel"].forEach(a=>{$(a).hidden=a!==n}),n==="surveyAdminPanel"?refreshSurveyAdmin():refreshTicketAdmin()})}const ADMIN_PANEL_REFRESH={lockdownPanel:()=>refreshLockdownStatus(),captchaPanel:()=>refreshCaptchaSwitch(),starlightPanel:()=>syncStarlightPanel(),ticketAdminPanel:()=>refreshTicketAdmin(),feedbackAdminPanel:()=>refreshFeedbackAdmin(),venueAdminPanel:()=>refreshVenueAdmin(),popupAdminPanel:()=>refreshPopupAdmin(),huayuAdminPanel:()=>refreshHuayuAdmin(),surveyAdminPanel:()=>window.HJ_SURVEY_READY?refreshSurveyAdmin():($("surveyAdminStatus").textContent="问卷脚本 survey.js 没有加载成功（没上传或被缓存挡住），刷新页面再试",null)};function stashAdminPanels(){[...$("adminModalHost").children].forEach(t=>{t.hidden=!0,$("adminPanelStash").appendChild(t)})}function openAdminPanel(t){const e=$(t);e&&(stashAdminPanels(),$("adminModalHost").appendChild(e),e.hidden=!1,$("adminModalOverlay").dataset.closeOnlyX=e.dataset.closeOnlyX||"",$("adminModalOverlay").hidden=!1,playEnterAnim(document.querySelector("#adminModalOverlay .admin-modal")),ADMIN_PANEL_REFRESH[t]?.())}function closeAdminPanel(){$("adminModalOverlay").hidden=!0,stashAdminPanels()}function initAdminPanels(){$("adminPills").querySelectorAll("[data-admin-panel]").forEach(t=>{t.addEventListener("click",()=>openAdminPanel(t.dataset.adminPanel))}),$("adminModalClose").addEventListener("click",closeAdminPanel),closeOnBackdrop($("adminModalOverlay"),closeAdminPanel)}async function refreshLockdownStatus(){const t=$("lockdownStatus");t.textContent="当前状态：读取中…";const e=await callWorker({action:"get_lockdown"});if(!e){t.textContent="当前状态：读取失败";return}siteLockdown=!!e.value,t.textContent=e.value?"当前状态：已关闭（纯静态展示，联系方式 / 活动群 / 场地登记 / 活动问卷 / 点赞都不可用）":"当前状态：已开启（正常运行）",$("lockdownToggleBtn").textContent=e.value?"开启分享功能":"关闭分享功能",$("lockdownToggleBtn").dataset.current=e.value?"1":"0"}function initLockdownToggle(){const t=$("lockdownToggleBtn");t.addEventListener("click",async()=>{const e=$("lockdownMsg");setMsg(e,""),t.disabled=!0;const n=await callWorker({action:"set_lockdown",password:internalAdminPassword,value:t.dataset.current!=="1"});if(t.disabled=!1,!n||!n.ok){setMsg(e,adminErr(n,"切换失败，请重新登录内部入口后再试"));return}siteLockdown=!!n.value,showToast(n.value?"分享功能已关闭（纯静态展示）":"分享功能已开启"),refreshLockdownStatus()})}async function refreshCaptchaSwitch(){const t=$("captchaStatus");t.textContent="当前状态：读取中…";const e=await callWorker({action:"get_captcha"});if(!e||!e.ok){t.textContent="当前状态：读取失败";return}applyCaptchaEnabled(!!e.enabled),t.textContent=e.enabled?"当前状态：已开启（正常验证）":"当前状态：已关闭（全站不验证，任何人都能直接提交，请尽快开回来）",$("captchaToggleBtn").textContent=e.enabled?"关闭机器人验证":"开启机器人验证",$("captchaToggleBtn").dataset.current=e.enabled?"1":"0"}function initCaptchaSwitch(){const t=$("captchaToggleBtn");t.addEventListener("click",async()=>{const e=$("captchaSwitchMsg");setMsg(e,""),t.disabled=!0;const n=await callWorker({action:"set_captcha",password:internalAdminPassword,enabled:t.dataset.current!=="1"});if(t.disabled=!1,!n||!n.ok){setMsg(e,adminErr(n,"切换失败，请重新登录内部入口后再试"));return}applyCaptchaEnabled(!!n.enabled),showToast(n.enabled?"机器人验证已开启":"机器人验证已关闭（压测模式）"),refreshCaptchaSwitch()})}function syncStarlightPanel(){refreshStarlightStatus(),$("starlightStart").value=hjStarlight?epochToCnLocal(hjStarlight.start):"",$("starlightEnd").value=hjStarlight?epochToCnLocal(hjStarlight.end):"",setMsg($("starlightMsg"),"")}async function saveStarlight(t){const e=$("starlightMsg"),n=[$("starlightSaveBtn"),$("starlightClearBtn")];setMsg(e,"保存中…"),n.forEach(s=>{s.disabled=!0});const a=await callWorker({action:"set_starlight",password:internalAdminPassword,value:t});if(n.forEach(s=>{s.disabled=!1}),!a||!a.ok){setMsg(e,adminErr(a,"保存失败，请重新登录内部入口后再试"));return}applyStarlight(t),syncStarlightPanel(),showToast(t?"星芒节时段已保存，期间全站天气显示为小雪":"已清除星芒节覆盖，天气恢复正常计算")}function initStarlightPanel(){$("starlightSaveBtn").addEventListener("click",()=>{const t=$("starlightMsg"),e=cnLocalToEpoch($("starlightStart").value),n=cnLocalToEpoch($("starlightEnd").value);if(!e||!n){setMsg(t,"先把开始和结束时间都填完整");return}if(n<=e){setMsg(t,"结束时间要晚于开始时间");return}saveStarlight({start:e,end:n})}),$("starlightClearBtn").addEventListener("click",()=>saveStarlight(null))}const ticketAdmin={status:null,orders:[],rounds:[],role:"admin",perms:{stats:!0,survey:!0,pickup:!0},tab:"settings",day:null,statsRound:"",search:"",edit:null,editHolders:[],pointsDirty:!1,guideLoaded:!1,logItems:null},TA_TABS=["settings","orders","stats"],isTicketViewer=()=>ticketAdmin.role==="viewer",ticketAdminPassword=()=>internalAdminPassword||internalViewPassword,cnHm=t=>t?formatCnTime(t).slice(11):"",cnMdHm=t=>t?`${Number(formatCnTime(t).slice(5,7))}/${Number(formatCnTime(t).slice(8,10))} ${cnHm(t)}`:"",VERIFY_MODE_TEXT={cf:"自动验证",ff14:"狒科生",poem:"文科生",math:"理科生",off:"验证关闭时提交",manual:"手动验证"};function fmtDuration(t){const e=Math.max(0,Math.round(t/1e3));if(e<60)return`${e} 秒`;const n=Math.floor(e/60);if(n<60)return`${n} 分 ${e%60} 秒`;const a=Math.floor(n/60);return a<24?`${a} 小时 ${n%60} 分`:`${Math.floor(a/24)} 天 ${a%24} 小时`}function ticketRoundList(){const t=ticketAdmin.status,e=new Map;return ticketAdmin.rounds.forEach(n=>e.set(n.key,{...n,estimated:!1})),ticketAdmin.orders.forEach(n=>{if(e.has(n.day))return;const a=/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/.exec(n.day),s=a?Date.parse(`${a[1]}T${a[2]||"00:00"}:00+08:00`)+(a[2]?0:(t?.resetMin||0)*6e4):0,i=t?t.limit:0;e.set(n.day,{key:n.day,startAt:s,base:i,extra:0,quota:i,source:"",openedAt:-1,estimated:!0})}),t?.round&&!e.has(t.round.key)&&e.set(t.round.key,{...t.round,estimated:!1}),[...e.values()].sort((n,a)=>n.startAt-a.startAt||String(n.key).localeCompare(String(a.key)))}function computeTicketDuplicates(t){const e=i=>String(i).replace(/\s+/g,"").toLowerCase(),n=i=>`${String(i.name||"").replace(/\s+/g,"").toLowerCase()}@${i.server}`,a=new Map,s=new Map;return t.filter(i=>!i.voided).forEach(i=>{const o=e(i.contact);a.set(o,(a.get(o)||0)+1),ticketActiveHolders(i.holders).forEach(c=>{if(c.pending)return;const p=n(c);s.set(p,(s.get(p)||0)+1)})}),new Map(t.map(i=>[i.id,i.voided?{contact:!1,holders:i.holders.map(()=>!1)}:{contact:a.get(e(i.contact))>1,holders:i.holders.map(o=>!o.voided&&!o.pending&&s.get(n(o))>1)}]))}function setTicketSwitch(t,e,n,a){t.setAttribute("aria-pressed",e?"true":"false"),t.classList.toggle("is-on",e),t.textContent=e?n:a}function ticketTotals(t){const e=t.filter(o=>!o.voided),n=(o,c)=>o.reduce((p,l)=>p+c(l),0),a=e.filter(o=>o.picked),s=e.filter(o=>o.overLimit),i=t.filter(o=>o.voided);return{liveOrders:e.length,liveTickets:n(e,o=>o.qty),pickedOrders:a.length,pickedTickets:n(a,o=>o.qty),overOrders:s.length,overTickets:n(s,o=>o.qty),voidOrders:i.length,voidTickets:n(i,o=>o.qty),partialVoidTickets:n(e,o=>o.holders.filter(c=>c&&c.voided).length),pending:n(e,o=>ticketActiveHolders(o.holders).filter(c=>c.pending).length)}}const tasItems=t=>t.map(([e,n])=>`<div class="tas-item"><span>${e}</span><b>${n}</b></div>`).join("");function renderTicketAdmin(){const t=ticketAdmin.status;if(!t)return;const e=isTicketViewer(),n=t.round||{key:t.day,quota:t.limit,base:t.limit,extra:0,startAt:0};$("ticketAdminStatus").textContent=`当前这一轮：${ticketRoundLabel(n.key,!0)}`+(n.startAt?`（${formatCnTime(n.startAt)} 开始，国服时间）`:"");const a=ticketAdmin.orders.filter(c=>c.day===n.key&&!c.voided),s=a.filter(c=>c.overLimit).reduce((c,p)=>c+p.qty,0),i=ticketTotals(ticketAdmin.orders);$("ticketAdminStats").innerHTML=tasItems([["本轮已售",`${t.sold} 张`],["本轮票额",`${n.quota} 张${n.extra?`<small>临时 ${n.extra>0?"+":""}${n.extra}</small>`:""}`],["本轮余票",`${t.remaining} 张`],["本轮订单",`${a.length} 单${s?`（超额 ${s} 张）`:""}`],["累计有效",`${i.liveOrders} 单 / ${i.liveTickets} 张`],["已取票",`${i.pickedOrders} 单 / ${i.pickedTickets} 张`]]);const o=e?["orders",...ticketAdmin.perms.stats?["stats"]:[]]:TA_TABS;o.includes(ticketAdmin.tab)||(ticketAdmin.tab=o[0]),document.querySelectorAll("#ticketAdminTabs [data-ta-tab]").forEach(c=>{const p=c.dataset.taTab===ticketAdmin.tab;c.hidden=!o.includes(c.dataset.taTab),c.classList.toggle("is-active",p),c.setAttribute("aria-selected",p?"true":"false")}),$("ticketAdminTabs").hidden=o.length<2,document.querySelectorAll("#ticketAdminPanel [data-ta-pane]").forEach(c=>{c.hidden=c.dataset.taPane!==ticketAdmin.tab}),ticketAdmin.tab==="settings"?renderTicketSettings(t):ticketAdmin.tab==="orders"?renderTicketOrders():renderTicketStats()}function renderTicketFlagSwitches(t){document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach(e=>{setTicketSwitch(e,!!t[e.dataset.taFlag],e.dataset.on,e.dataset.off)})}const setIdle=(t,e)=>{t&&document.activeElement!==t&&(t.value=e)};function renderTicketSettings(t){setTicketSwitch($("ticketOpenBtn"),t.open,"已开放（点击关闭）","已关闭（点击开放）"),setTicketSwitch($("ticketPendingBtn"),t.allowPending,"允许待定（点击关闭）","不允许待定（点击开启）"),setTicketSwitch($("ticketTestBtn"),!!t.testMode,"显示「（测试）」（点击去掉）","不显示（点击加上）"),setIdle($("ticketTitleInput"),t.title||TICKET_TITLE),$("ticketTitlePreview").textContent=`访客看到的标题：${t.title||TICKET_TITLE}${t.testMode?"（测试）":""}`,$("ticketTitlePreview").hidden=!1,setIdle($("ticketCooldownInput"),String(t.cooldownMin??30)),setIdle($("ticketPerPersonInput"),String(t.perPerson??"")),renderTicketSchedule(t);const e=t.round||{key:t.day,base:t.limit,extra:0,quota:t.limit,startAt:0,source:""},n={daily:"每日刷新",custom:"自定义刷新点",init:"首次记录的轮次"};$("ticketRoundBox").innerHTML=`
    <p><b>${escapeHtml(ticketRoundLabel(e.key,!0))}</b>`+(e.startAt?`<small>${escapeHtml(formatCnTime(e.startAt))} 开始 · ${n[e.source]||""}</small>`:"")+`</p>
    <p>票额：基础 <b>${e.base}</b> 张${e.extra?` ${e.extra>0?"+":"−"} 临时 <b>${Math.abs(e.extra)}</b> 张`:""} = <b>${e.quota}</b> 张
      · 已售 <b>${t.sold}</b> · 余 <b>${t.remaining}</b></p>`,$("ticketExtraClearBtn").disabled=!e.extra,setTicketSwitch($("ticketDailyBtn"),t.dailyOn!==!1,"开（点击关闭）","关（点击打开）"),setIdle($("ticketResetInput"),minutesToHHMM(t.resetMin||0)),setIdle($("ticketLimitInput"),String(t.limit)),document.querySelectorAll(".ta-daily-only").forEach(o=>o.classList.toggle("is-off",t.dailyOn===!1)),$("ticketLimitCurWrap").hidden=!(e.source==="daily"||e.source==="init"),ticketAdmin.pointsDirty||renderTicketPoints(t.points||[],e.startAt),renderTicketNext(t);const a=t.remainingMode||"full";setIdle($("ticketRemainModeSelect"),a);const s=ticketStockHtml(a,t.remaining,t.stockLevel,t.roundWord||"今日");$("ticketRemainPreview").textContent=`访客现在看到：${s?s.replace(/<[^>]+>/g,""):"（不显示余票）"}`+(a==="range"?"　｜ 档位：≤10 张「余票10张以内」，≤ 票额 50% 「余票不多」，其余「余票充裕」":""),$("ticketRemainPreview").hidden=!1,setTicketSwitch($("ticketShowSchedBtn"),t.showSchedule!==!1,"显示（点击隐藏）","不显示（点击显示）"),setTicketSwitch($("ticketShowResetBtn"),t.showReset!==!1,"显示（点击隐藏）","不显示（点击显示）"),setTicketSwitch($("ticketViewerBtn"),t.viewerEnabled!==!1,"已开放（点击关闭）","已关闭（点击开放）"),renderTicketFlagSwitches(t),setIdle($("ticketIdleInput"),String(t.idleMin??10));const i=!!t.isolated;document.querySelectorAll(".ta-idle-row").forEach(o=>{o.classList.toggle("is-disabled",i),o.querySelectorAll("input, button").forEach(c=>{c.disabled=i})}),$("ticketIdleIsoNote").hidden=!i,setIdle($("ticketLogHoursInput"),String(t.viewerLogHours??24))}function renderTicketSchedule(t){setIdle($("ticketOpenAtInput"),epochToCnLocal(t.openAt)),setIdle($("ticketCloseAtInput"),epochToCnLocal(t.closeAt));const e=[];t.openAt&&e.push(`将于 ${formatCnTime(t.openAt)} 自动开启`),t.closeAt&&e.push(`将于 ${formatCnTime(t.closeAt)} 自动关闭`);const n=$("ticketSchedNote");n.textContent=e.length?`${e.join("；")}（国服时间；计划执行后自动清除）`:"",n.hidden=!e.length}function renderTicketPoints(t,e){const n=t.filter(a=>a.at>(e||0));$("ticketPointsList").innerHTML=n.length?n.map(a=>ticketPointRowHtml(epochToCnLocal(a.at),a.qty)).join(""):'<p class="ta-empty" data-points-empty>还没有自定义刷新点</p>'}function ticketPointRowHtml(t="",e=""){return`<div class="ta-point" data-point>
    <input type="datetime-local" class="ta-point-at" value="${escapeHtml(t)}" aria-label="刷新时间（国服）">
    <input type="number" class="ta-point-qty" min="0" max="100000" step="1" inputmode="numeric" value="${escapeHtml(String(e))}" placeholder="票额" aria-label="这一轮的票额">
    <span class="ta-point-unit">张</span>
    <button type="button" class="tt-act is-void" data-point-del>删除</button>
  </div>`}function renderTicketNext(t){const e=t.nextRefresh,n=$("ticketNextInfo"),a=$("ticketNextInput"),s=$("ticketNextNote");if($("ticketNextSaveBtn").disabled=!e,a.disabled=!e,!e){n.textContent="不会再刷新",setIdle(a,""),$("ticketNextResetBtn").hidden=!0,s.textContent="每日刷新关着，也没有以后的自定义刷新点：票额不重置，一直用当前这一轮的票额。",s.hidden=!1;return}n.textContent=`${formatCnTime(e.at)}（${e.kind==="daily"?"每日刷新":"自定义刷新点"}）`,setIdle(a,String(e.qty)),$("ticketNextResetBtn").hidden=!e.override;const i=[];e.override?i.push(`已单独设为 ${e.qty} 张（默认是 ${e.defaultQty} 张），只对这一次刷新有效。`):e.kind==="custom"?i.push("改这里会同步改掉下面列表里这个刷新点的票额。"):i.push(`默认按每日票额 ${e.defaultQty} 张；改这里只影响这一次，之后恢复每日票额。`),e.pendingOverride&&i.push(`另外已为 ${formatCnTime(e.pendingOverride.at)} 的每日刷新单独设了 ${e.pendingOverride.qty} 张。`),s.textContent=i.join(" "),s.hidden=!1}function ticketOrderMatches(t,e){if(!e)return!0;const n=[t.contact,String(t.seq),...t.holders.map(a=>formatHolder(a))].join(" ").toLowerCase();return e.toLowerCase().split(/\s+/).filter(Boolean).every(a=>n.includes(a))}function renderTicketOrders(){const t=ticketAdmin.status,e=isTicketViewer(),n=ticketAdmin.orders,a=ticketRoundList().filter(l=>l.key===t.day||n.some(m=>m.day===l.key));(ticketAdmin.day===null||ticketAdmin.day&&!a.some(l=>l.key===ticketAdmin.day))&&(ticketAdmin.day=t.day);const s=ticketAdmin.day==="";$("ticketDaySelect").innerHTML=`<option value=""${s?" selected":""}>全部轮次（${ticketTotals(n).liveOrders} 单）</option>`+a.slice().reverse().map(l=>{const m=ticketTotals(n.filter(v=>v.day===l.key));return`<option value="${escapeHtml(l.key)}"${l.key===ticketAdmin.day?" selected":""}>${escapeHtml(ticketRoundLabel(l.key,!0))}（${m.liveOrders} 单 / ${m.liveTickets} 张${m.voidOrders?` · 作废 ${m.voidOrders}`:""}）</option>`}).join(""),setIdle($("ticketSearchInput"),ticketAdmin.search);const i=computeTicketDuplicates(n),o=new Map(a.map((l,m)=>[l.key,m])),c=n.filter(l=>(s||l.day===ticketAdmin.day)&&ticketOrderMatches(l,ticketAdmin.search)).sort((l,m)=>(o.get(l.day)??0)-(o.get(m.day)??0)||l.seq-m.seq),p=!e||ticketAdmin.perms.pickup;if($("ticketAdminPanel").classList.toggle("can-pick",p),$("ticketAdminTbody").innerHTML=c.length?c.map(l=>{const m=i.get(l.id)||{contact:!1,holders:[]},v=l.holders.map((y,g)=>y.voided?`<span class="tt-h-void"><s>${escapeHtml(formatHolder(y))}</s><small>已作废</small></span>`:`<span class="${m.holders[g]?"is-dup":""}">${escapeHtml(formatHolder(y))}</span>`).join("<br>"),w=[l.message?`${escapeHtml(l.message)}<small>${l.anonymous?"匿名":"实名"}</small>`:"",!e&&l.adminNote?`<small class="tt-note">备注：${escapeHtml(l.adminNote)}</small>`:""].join(""),f=new Date(l.createdAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:!1,...s?{month:"numeric",day:"numeric"}:{},hour:"2-digit",minute:"2-digit",second:"2-digit"}),d=e?"":[l.voided?"":'<button type="button" class="tt-act" data-act="edit">编辑</button>',!l.voided&&l.holders.length>1?'<button type="button" class="tt-act" data-act="partial">部分作废</button>':"",l.voided?'<button type="button" class="tt-act is-restore" data-act="restore">恢复</button>':'<button type="button" class="tt-act is-void" data-act="void">作废</button>'].join(""),u=l.picked&&l.pickedAt?`${l.pickedBy==="viewer"?"只读端":"管理员"} ${cnMdHm(l.pickedAt)} 勾选`:"",r=l.voided?"—":p?`<label class="tt-pick" title="${escapeHtml(u)}"><input type="checkbox" data-pick${l.picked?" checked":""} aria-label="第 ${l.seq} 号已取票"><span>${l.picked?"已取":"未取"}</span></label>`:l.picked?`<span class="tt-picked" title="${escapeHtml(u)}">已取</span>`:'<span class="tt-unpicked">未取</span>';return`<tr class="${[l.voided?"is-void":l.overLimit?"is-over":"",l.picked&&!l.voided?"is-picked":""].filter(Boolean).join(" ")}" data-order-id="${l.id}">
      <td>${l.seq}${s?`<small class="tt-round">${escapeHtml(ticketRoundLabel(l.day))}</small>`:""}</td>
      <td class="${m.contact?"is-dup":""}">${escapeHtml(l.contact)}</td>
      <td>${l.qty}</td>
      <td>${v}</td>
      <td class="tt-msg">${w}</td>
      <td>${f}</td>
      <td class="tt-actions"><div class="tt-acts">${d}</div></td>
      <td class="tt-pick-cell">${r}</td>
    </tr>`}).join(""):`<tr><td colspan="8" class="tt-empty">${ticketAdmin.search?"没有符合搜索条件的订单":"这一轮还没有订单"}</td></tr>`,ticketAdmin.edit){const l=n.find(m=>m.id===ticketAdmin.edit.id);!l||l.voided?closeTicketEdit():ticketAdmin.edit.mode==="partial"&&renderTicketPartial()}}function ticketServerOptions(t){return'<option value="">选择区服</option>'+TICKET_SERVER_GROUPS.map(e=>`<optgroup label="【${e.dc}】">${e.servers.map(n=>`<option value="${n}"${n===t?" selected":""}>${n}</option>`).join("")}</optgroup>`).join("")}function openTicketEdit(t){ticketAdmin.edit={mode:"edit",id:t.id},ticketAdmin.editHolders=t.holders.map(a=>({...a}));const e=ticketRoundList(),n=$("ticketEditBox");n.innerHTML=`
    <h3 class="venue-edit-title">编辑订单 · ${escapeHtml(ticketRoundLabel(t.day,!0))} 第 ${t.seq} 号</h3>
    <div class="ta-edit-grid">
      <label class="ta-field"><span>所属轮次</span><select id="teDay">${e.map(a=>`<option value="${escapeHtml(a.key)}"${a.key===t.day?" selected":""}>${escapeHtml(ticketRoundLabel(a.key,!0))}</option>`).join("")}</select></label>
      <label class="ta-field"><span>联系方式</span><input type="text" id="teContact" maxlength="40" autocomplete="off"></label>
    </div>
    <div class="ta-field"><span>持票人（张数 = 没作废的持票人数）</span><div id="teHolders"></div>
      <button type="button" class="tt-act" id="teAddHolder">+ 添加持票人</button></div>
    <label class="ta-field"><span>留言</span><textarea id="teMessage" maxlength="200"></textarea></label>
    <div class="ta-edit-checks">
      <label class="audience-opt"><input type="checkbox" id="teAnon"><span>匿名留言</span></label>
      <label class="audience-opt"><input type="checkbox" id="teOver"><span>超额（导出标红）</span></label>
    </div>
    <label class="ta-field"><span>管理备注（只有管理员能看到）</span><textarea id="teNote" maxlength="500"></textarea></label>
    <div class="venue-edit-actions">
      <button type="button" id="teSave">保存</button>
      <button type="button" class="ticket-btn-ghost" id="teCancel">取消</button>
    </div>
    <p class="form-msg" id="teMsg" hidden></p>`,$("teContact").value=t.contact,$("teMessage").value=t.message||"",$("teAnon").checked=t.anonymous,$("teOver").checked=t.overLimit,$("teNote").value=t.adminNote||"",renderTicketEditHolders(),n.hidden=!1,n.scrollIntoView({behavior:"smooth",block:"nearest"})}function renderTicketEditHolders(){const t=$("teHolders");t.innerHTML=ticketAdmin.editHolders.map((e,n)=>e.voided?`<div class="te-holder is-void"><span><s>${escapeHtml(formatHolder(e))}</s>（已作废，在「部分作废」里恢复）</span></div>`:`<div class="te-holder" data-h="${n}">
        <input type="text" class="te-name" maxlength="12" placeholder="角色名" autocomplete="off" spellcheck="false"${e.pending?" disabled":""}>
        <select class="te-server"${e.pending?" disabled":""}>${ticketServerOptions(e.server)}</select>
        <label class="audience-opt"><input type="checkbox" class="te-pending"${e.pending?" checked":""}><span>待定</span></label>
        <button type="button" class="tt-act is-void" data-h-del>删除</button>
      </div>`).join(""),t.querySelectorAll(".te-holder[data-h]").forEach(e=>{const n=ticketAdmin.editHolders[Number(e.dataset.h)];e.querySelector(".te-name").value=n.pending?"":n.name||""})}function collectTicketEditHolders(){$("teHolders").querySelectorAll(".te-holder[data-h]").forEach(t=>{const e=Number(t.dataset.h),n=t.querySelector(".te-pending").checked;ticketAdmin.editHolders[e]=n?{pending:!0}:{name:normalizeTicketName(t.querySelector(".te-name").value),server:t.querySelector(".te-server").value}})}function closeTicketEdit(){ticketAdmin.edit=null,ticketAdmin.editHolders=[];const t=$("ticketEditBox");t.hidden=!0,t.innerHTML=""}async function saveTicketEdit(){const t=$("teMsg"),e=ticketAdmin.orders.find(i=>i.id===ticketAdmin.edit?.id);if(!e){closeTicketEdit();return}collectTicketEditHolders();const n=$("teContact").value.trim();if(!n){setMsg(t,"请填写联系方式");return}const a=ticketAdmin.editHolders;for(const[i,o]of a.entries()){if(o.voided||o.pending)continue;const c=o.name?ticketNameError(o.name):"请填写持票人 id（或者勾「待定」）";if(c){setMsg(t,`第 ${i+1} 位持票人：${c}`);return}if(!o.server){setMsg(t,`第 ${i+1} 位持票人：请选择区服`);return}}if(!ticketActiveHolders(a).length){setMsg(t,"至少要留一位持票人；整单不要了请用「作废」");return}setMsg(t,""),$("teSave").disabled=!0;const s=await callWorker({action:"ticket_admin_edit",password:internalAdminPassword,id:e.id,rev:e.rev,contact:n,holders:a,day:$("teDay").value,message:$("teMessage").value,anonymous:$("teAnon").checked,overLimit:$("teOver").checked,adminNote:$("teNote").value});if($("teSave")&&($("teSave").disabled=!1),!s||!s.ok){const i={conflict:"这一单刚刚被改过（编辑 / 作废 / 部分作废），已为你刷新，请重新打开编辑",bad_contact:"请填写联系方式",bad_holders:"持票人数量不对（1–50 位）",bad_holder_name:"有持票人没填 id",bad_holder_server:"有持票人没选区服",bad_holder_name_format:"持票人 id 不符合要求：不能有数字，最多 6 个字，只能用汉字、英文字母和「·」",no_active_holder:"至少要留一位持票人",bad_day:"所选轮次不存在，刷新后再试"};setMsg(t,adminErr(s,"保存失败，请重新登录内部入口后再试",i)),s?.error==="conflict"&&(closeTicketEdit(),await refreshTicketAdmin());return}ticketAdminApplyOrder(s.order,s.status),closeTicketEdit(),renderTicketAdmin(),showToast(s.overQuota?`已保存。注意：${ticketRoundLabel(s.order.day)}这一轮已经超出票额`:`第 ${s.order.seq} 号已保存`)}function ticketAdminApplyOrder(t,e){const n=ticketAdmin.orders.findIndex(a=>a.id===t.id);n>=0&&(ticketAdmin.orders[n]={...ticketAdmin.orders[n],...t}),e&&(ticketAdmin.status=e)}function openTicketPartial(t){ticketAdmin.edit={mode:"partial",id:t.id},renderTicketPartial(),$("ticketEditBox").hidden=!1,$("ticketEditBox").scrollIntoView({behavior:"smooth",block:"nearest"})}function renderTicketPartial(){const t=ticketAdmin.orders.find(n=>n.id===ticketAdmin.edit?.id);if(!t){closeTicketEdit();return}const e=ticketActiveHolders(t.holders).length;$("ticketEditBox").innerHTML=`
    <h3 class="venue-edit-title">部分作废 · ${escapeHtml(ticketRoundLabel(t.day,!0))} 第 ${t.seq} 号（现在 ${t.qty} 张）</h3>
    <p class="hint">作废的那张票额当场放回；恢复时这一轮票额不够的话，这一单会被标成超额。至少留一张，整单不要了请用「作废」。</p>
    <div class="ta-partial">${t.holders.map((n,a)=>`
      <div class="ta-partial-row${n.voided?" is-void":""}">
        <span>${a+1}. ${n.voided?`<s>${escapeHtml(formatHolder(n))}</s> <small>已作废</small>`:escapeHtml(formatHolder(n))}</span>
        ${n.voided?`<button type="button" class="tt-act is-restore" data-pv="${a}" data-pv-void="0">恢复</button>`:`<button type="button" class="tt-act is-void" data-pv="${a}" data-pv-void="1"${e<=1?' disabled title="至少留一张"':""}>作废这张</button>`}
      </div>`).join("")}</div>
    <div class="venue-edit-actions"><button type="button" class="ticket-btn-ghost" id="tpClose">关闭</button></div>
    <p class="form-msg" id="tpMsg" hidden></p>`}async function ticketPartialVoid(t,e){const n=ticketAdmin.orders.find(i=>i.id===ticketAdmin.edit?.id);if(!n)return;const a=n.holders[t];if(e&&!confirm(`确定作废第 ${n.seq} 号里的「${formatHolder(a)}」这一张吗？

这张的票额会放回这一轮，之后可以再恢复。`))return;const s=await callWorker({action:"ticket_admin_void_holder",password:internalAdminPassword,id:n.id,index:t,voided:e,rev:n.rev});if(!s||!s.ok){const i={conflict:"这一单刚刚被改过，已为你刷新，请再点一次",last_holder:"至少要留一张；整单不要了请用「作废」",order_voided:"这一单已经整单作废了",not_changed:"这一张的状态已经变过了，已为你刷新"};setMsg($("tpMsg"),adminErr(s,"操作失败，请重新登录内部入口后再试",i)),["conflict","not_changed"].includes(s?.error)&&await refreshTicketAdmin();return}ticketAdminApplyOrder(s.order,s.status),renderTicketAdmin(),showToast(e?`已作废第 ${s.order.seq} 号的一张，现在 ${s.order.qty} 张`:`已恢复，现在 ${s.order.qty} 张${s.becameOver?"（这一轮票额不够，这一单标成了超额）":""}`)}async function ticketAdminVoid(t,e){const n=$("ticketAdminMsg");setMsg(n,"");const a=await callWorker({action:"ticket_admin_void",password:internalAdminPassword,id:t,voided:e});if(!a||!a.ok){if(a&&a.error==="not_changed"){setMsg(n,"这一单的状态已经变过了，已为你刷新"),await refreshTicketAdmin();return}setMsg(n,adminErr(a,"操作失败，请重新登录内部入口后再试"));return}ticketAdminApplyOrder(a.order,a.status),renderTicketAdmin(),showToast(a.order.voided?`第 ${a.order.seq} 号已作废，票额已放回`:`第 ${a.order.seq} 号已恢复${a.order.overLimit?"（票额已满，按超额票计）":""}`)}async function ticketTogglePickup(t,e,n){const a=$("ticketAdminMsg");setMsg(a,""),n.disabled=!0;const s=await callWorker({action:"ticket_pickup",password:ticketAdminPassword(),id:t,picked:e});if(n.disabled=!1,s&&s.order&&ticketAdminApplyOrder(s.order),!s||!s.ok){const i={not_changed:"这一单已经是这个状态了（可能别人刚勾过），已同步",order_voided:"这一单已作废，不能勾选取票",no_permission:"管理员没有开放只读端勾选取票",viewer_closed:"「购票情况」页面已被管理员关闭"};setMsg(a,adminErr(s,"勾选失败，请重新登录后再试",i)),s?.order||(n.checked=!e),renderTicketAdmin();return}renderTicketAdmin()}function renderTicketStats(){const t=ticketAdmin.orders,e=ticketRoundList().filter(l=>l.key===ticketAdmin.status.day||t.some(m=>m.day===l.key));ticketAdmin.statsRound&&!e.some(l=>l.key===ticketAdmin.statsRound)&&(ticketAdmin.statsRound="");const n=ticketAdmin.statsRound;$("ticketStatsRound").innerHTML='<option value="">全部轮次</option>'+e.slice().reverse().map(l=>`<option value="${escapeHtml(l.key)}"${l.key===n?" selected":""}>${escapeHtml(ticketRoundLabel(l.key,!0))}</option>`).join("");const a=t.filter(l=>!n||l.day===n),s=a.filter(l=>!l.voided),i=ticketTotals(a),o=Math.max(300,($("ticketStatsBody").clientWidth||640)-2),p=[`<div class="ticket-admin-stats">${tasItems([["有效订单",`${i.liveOrders} 单`],["有效票数",`${i.liveTickets} 张`],["已取票",`${i.pickedOrders} 单 / ${i.pickedTickets} 张`],["未取票",`${i.liveOrders-i.pickedOrders} 单 / ${i.liveTickets-i.pickedTickets} 张`],["超额",`${i.overOrders} 单 / ${i.overTickets} 张`],["已作废",`${i.voidOrders} 单 / ${i.voidTickets} 张${i.partialVoidTickets?`，另部分作废 ${i.partialVoidTickets} 张`:""}`],["持票人待定",`${i.pending} 位`]])}</div>`,`<h3 class="ta-stat-title">售罄耗时</h3>${ticketSelloutTable(e,n)}`,`<h3 class="ta-stat-title">每小时售出</h3>${ticketHourlyChart(s,o)}`,`<h3 class="ta-stat-title">各服务器玩家数量</h3>${ticketServerBars(s)}`,`<h3 class="ta-stat-title">验证方式分布</h3>${ticketVerifyBars(s)}`,ticketUnpickedHtml(s)];$("ticketStatsBody").innerHTML=p.join("")}function ticketSelloutInfo(t){const e=ticketAdmin.orders.filter(p=>p.day===t.key&&!p.voided).sort((p,l)=>p.createdAt-l.createdAt),n=e.reduce((p,l)=>p+l.qty,0);let a=0,s=0;if(t.quota>0){for(const p of e)if(s+=p.qty,s>=t.quota){a=p.createdAt;break}}let i=0,o=!1;t.openedAt>0?i=Math.max(t.startAt,t.openedAt):e.length&&(i=e[0].createdAt,o=!0);let c;return e.length?a?c=`${o?"约 ":""}${fmtDuration(a-i)}`:c="未售罄":c=t.openedAt?"未售罄":"还没开放",{sold:n,soldOutAt:a,start:i,approx:o,text:c}}function ticketSelloutTable(t,e){if(!t.length)return'<p class="fb-empty">还没有轮次</p>';const n=t.slice().reverse().map(s=>{const i=ticketSelloutInfo(s);return`<tr class="${s.key===e?"is-sel":""}">
      <td>${escapeHtml(ticketRoundLabel(s.key,!0))}</td>
      <td>${s.startAt?escapeHtml(cnMdHm(s.startAt)):"—"}${s.openedAt>0&&s.openedAt>s.startAt?`<small>开放 ${escapeHtml(cnMdHm(s.openedAt))}</small>`:""}</td>
      <td>${s.quota}${s.estimated?"<small>估</small>":""}</td>
      <td>${i.sold}</td>
      <td>${escapeHtml(i.text)}${i.soldOutAt?`<small>${escapeHtml(cnMdHm(i.soldOutAt))} 售罄</small>`:""}</td>
    </tr>`}).join(""),a=t.some(s=>s.estimated||s.openedAt===-1);return`<div class="ticket-table-wrap"><table class="ticket-table ta-sellout">
    <thead><tr><th>轮次</th><th>开始</th><th>票额</th><th>售出</th><th>售罄耗时</th></tr></thead><tbody>${n}</tbody></table></div>`+(a?'<p class="ta-footnote">部分轮次没有记录开放时刻或票额：售罄耗时从第一单算（标「约」），票额按现在的每日票额估算（标「估」）。</p>':"")}function ticketHourlyChart(t,e){if(!t.length)return'<p class="fb-empty">还没有订单</p>';const n=3600*1e3,s=(Math.max(...t.map(k=>k.createdAt))-Math.min(...t.map(k=>k.createdAt)))/(24*n)>14?24:1,i=k=>Math.floor((k+CN_TZ_OFFSET_MS)/(s*n)),o=new Map;t.forEach(k=>{const b=i(k.createdAt),L=o.get(b)||{tickets:0,orders:0};L.tickets+=k.qty,L.orders+=1,o.set(b,L)});const c=Math.min(...o.keys()),l=Math.max(...o.keys())-c+1,m=Array.from({length:l},(k,b)=>o.get(c+b)||{tickets:0,orders:0}),v=Math.max(1,...m.map(k=>k.tickets)),w=(()=>{const k=10**Math.floor(Math.log10(v));return[1,2,2.5,5,10].find(L=>L*k>=v)*k})(),f=190,d=34,u=8,r=12,h=26,y=e-d-u,g=f-r-h,E=y/l,S=k=>r+g-k/w*g,C=k=>(c+k)*s*n-CN_TZ_OFFSET_MS,A=k=>{const b=new Date(C(k)+CN_TZ_OFFSET_MS),L=`${b.getUTCMonth()+1}/${b.getUTCDate()}`;return s===24||b.getUTCHours()===0?L:`${b.getUTCHours()}时`},M=Math.max(3,Math.floor(y/64)),_=(s===24?[1,2,3,7,14,30]:[1,2,3,6,12,24,48,72,96,168]).find(k=>l/k<=M)||(s===24?30:168),H=(Number.isInteger(w/2)?[0,.5,1]:[0,1]).map(k=>{const b=w*k;return`<line x1="${d}" x2="${e-u}" y1="${S(b)}" y2="${S(b)}" class="ta-grid"/><text x="${d-6}" y="${S(b)+4}" class="ta-axis" text-anchor="end">${Math.round(b)}</text>`}).join(""),x=k=>d+k*E+E/2,T=m.map((k,b)=>`${x(b).toFixed(1)},${S(k.tickets).toFixed(1)}`),B=l===1?`<line x1="${d}" x2="${e-u}" y1="${S(m[0].tickets)}" y2="${S(m[0].tickets)}" class="ta-line"/>`:`<path class="ta-area" d="M${x(0)},${S(0)} L${T.join(" L")} L${x(l-1)},${S(0)} Z"/><polyline class="ta-line" points="${T.join(" ")}"/>`,I=E>=8?4:3,P=m.map((k,b)=>{const L=`${cnMdHm(C(b))}–${cnHm(C(b)+s*n)||"24:00"}：${k.tickets} 张 / ${k.orders} 单`;return`<g class="ta-bar-g"><title>${escapeHtml(L)}</title><rect x="${d+b*E}" y="${r}" width="${E}" height="${g}" class="ta-hit"/>`+(k.tickets?`<circle cx="${x(b)}" cy="${S(k.tickets)}" r="${I}" class="ta-dot"/>`:"")+"</g>"}).join(""),O=m.map((k,b)=>(c+b)%_!==0?"":`<text x="${d+b*E+E/2}" y="${f-8}" class="ta-axis" text-anchor="middle">${escapeHtml(A(b))}</text>`).join(""),R=m.reduce((k,b,L)=>b.tickets>m[k].tickets?L:k,0);return`<div class="ta-chart"><svg width="${e}" height="${f}" viewBox="0 0 ${e} ${f}" role="img" aria-label="每${s===24?"天":"小时"}售出张数">${H}<line x1="${d}" x2="${e-u}" y1="${S(0)}" y2="${S(0)}" class="ta-base"/>${B}${P}${O}</svg></div><p class="ta-footnote">单位：张（有效票）· 国服时间 · ${s===24?"跨度较长，每个点是一天":"每个点是一小时"}。最多的一${s===24?"天":"小时"}：${escapeHtml(cnMdHm(C(R)))} 起，${m[R].tickets} 张。把鼠标放到图上可以看每个时段的具体数字。</p>`}function taBarsHtml(t,e,n){const a=n||Math.max(1,...t.map(s=>s.n));return`<div class="sv-bars">${t.map(s=>`<div class="sv-bar-row"><span class="sv-bar-key">${escapeHtml(s.label)}</span><span class="sv-bar"><i style="width:${s.n/a*100}%"></i></span><span class="sv-bar-n">${s.n}<small>${e?Math.round(s.n/e*100):0}%</small></span></div>`).join("")}</div>`}function ticketServerBars(t){const e=new Map;let n=0;t.forEach(c=>ticketActiveHolders(c.holders).forEach(p=>{p.pending?n++:e.set(p.server,(e.get(p.server)||0)+1)}));const a=[...e.values()].reduce((c,p)=>c+p,0)+n;if(!a)return'<p class="fb-empty">还没有持票人</p>';const s=Math.max(1,n,...e.values()),i=TICKET_SERVER_GROUPS.map(c=>{const p=c.servers.map(m=>({label:m,n:e.get(m)||0})).filter(m=>m.n).sort((m,v)=>v.n-m.n),l=p.reduce((m,v)=>m+v.n,0);return l?`<p class="ta-dc">【${c.dc}】${l} 人</p>${taBarsHtml(p,a,s)}`:""}).join(""),o=[...e.entries()].filter(([c])=>!TICKET_SERVERS.includes(c)).map(([c,p])=>({label:c,n:p}));return`<p class="ta-footnote">按持票人计（一张票一位），共 ${a} 位；百分比按全部持票人算。</p>${i}`+(o.length?`<p class="ta-dc">其他</p>${taBarsHtml(o,a,s)}`:"")+(n?`<p class="ta-dc">待定</p>${taBarsHtml([{label:"id 待定",n}],a,s)}`:"")}function ticketVerifyBars(t){if(!t.length)return'<p class="fb-empty">还没有订单</p>';const e={};t.forEach(s=>{const i=s.verifyMode||"";e[i]=(e[i]||0)+1});const a=["cf","ff14","poem","math","manual","off",""].filter(s=>e[s]).map(s=>({label:s?VERIFY_MODE_TEXT[s]:"未记录",n:e[s]}));return`<p class="ta-footnote">按订单计，共 ${t.length} 单。</p>${taBarsHtml(a,t.length)}`}function ticketUnpickedList(t){const e=ticketRoundList(),n=new Map(e.map((a,s)=>[a.key,s]));return t.filter(a=>!a.picked).sort((a,s)=>(n.get(a.day)??0)-(n.get(s.day)??0)||a.seq-s.seq)}function ticketUnpickedHtml(t){const e=ticketUnpickedList(t),n=e.reduce((s,i)=>s+i.qty,0),a=`<div class="ta-list-head"><h3 class="ta-stat-title">未取票名单</h3><span>${e.length} 单 / ${n} 张</span>
    ${e.length?`<button type="button" class="tt-act" data-copy-unpicked="full">复制（含联系方式）</button>
    <button type="button" class="tt-act" data-copy-unpicked="ids">复制（只有持票人）</button>`:""}</div>`;return e.length?`${a}<details class="ta-unpicked"${e.length<=30?" open":""}><summary>${e.length<=30?"名单":`展开名单（${e.length} 单）`}</summary><div class="ticket-table-wrap"><table class="ticket-table">
    <thead><tr><th>轮次</th><th>序号</th><th>联系方式</th><th>张数</th><th>持票人</th></tr></thead><tbody>${e.map(s=>`<tr>
      <td>${escapeHtml(ticketRoundLabel(s.day))}</td><td>${s.seq}</td><td>${escapeHtml(s.contact)}</td><td>${s.qty}</td>
      <td>${ticketActiveHolders(s.holders).map(i=>escapeHtml(formatHolder(i))).join("、")}</td></tr>`).join("")}</tbody></table></div></details>
    <textarea class="ta-copy-fallback" id="ticketUnpickedFallback" readonly hidden></textarea>`:`${a}<p class="fb-empty">没有未取票的有效订单</p>`}function ticketUnpickedText(t){const e=ticketAdmin.statsRound,n=ticketAdmin.orders.filter(o=>!o.voided&&(!e||o.day===e)),a=ticketUnpickedList(n),s=[];let i=null;return a.forEach(o=>{o.day!==i&&(s.push(`【${ticketRoundLabel(o.day)}】`),i=o.day);const c=ticketActiveHolders(o.holders).map(formatHolder).join("、");s.push(t==="full"?`${o.seq}. ${o.contact}：${c}（${o.qty} 张）`:`${o.seq}. ${c}`)}),s.join(`
`)}async function copyTicketUnpicked(t){const e=ticketUnpickedText(t);try{await navigator.clipboard.writeText(e),showToast("未取票名单已复制")}catch{const a=$("ticketUnpickedFallback");a.value=e,a.hidden=!1,a.focus(),a.select(),showToast("自动复制失败，已全选，请手动复制（Ctrl+C / 长按）")}}let ticketAdminTimer=0;async function refreshTicketAdmin(){const t=await callWorker({action:"ticket_admin_get",password:ticketAdminPassword()});return t&&t.error==="viewer_closed"?(clearInterval(ticketViewTimer),ticketAdmin.orders=[],$("ticketAdminStats").innerHTML="",$("ticketAdminTbody").innerHTML="",$("ticketStatsBody").innerHTML="",$("ticketAdminStatus").textContent="「购票情况」页面已被管理员关闭",!1):!t||!t.ok?($("ticketAdminStatus").textContent="读取失败："+adminErr(t,"请重新登录内部入口后再试"),!1):(ticketAdmin.status=t.status,ticketAdmin.orders=Array.isArray(t.orders)?t.orders:[],ticketAdmin.rounds=Array.isArray(t.rounds)?t.rounds:[],ticketAdmin.role=t.role==="viewer"||!internalAdminPassword?"viewer":"admin",ticketAdmin.perms=t.perms||(isTicketViewer()?{stats:!0,survey:!1,pickup:!1}:{stats:!0,survey:!0,pickup:!0}),renderTicketAdmin(),!0)}async function ticketAdminSet(t,e){const n=$("ticketAdminMsg");setMsg(n,"");const a=await callWorker({action:"ticket_admin_set",password:internalAdminPassword,...t});if(!a||!a.ok){const s={bad_limit:"票额需为 0 以上的整数",bad_per_person:"单人限购需为 1–20 之间的整数",bad_cooldown:"购票间隔需为 0–1440 之间的整数（分钟）",bad_reset:"刷新时间格式不对",bad_title:"标题太长了（最多 60 个字）",bad_remaining_mode:"余票显示方式不对",bad_schedule:"定时时间格式不对",bad_idle:"停留时间需为 0–1440 之间的整数（分钟）",bad_log_hours:"日志间隔需为 1–720 之间的整数（小时）",bad_extra:"临时加票的数量不对",extra_below_zero:"减得太多了：这一轮的票额不能小于 0",bad_points:"刷新点太多了（最多 60 个）",bad_point_time:"有刷新点的时间没填或格式不对",bad_point_qty:"有刷新点的票额不是 0 以上的整数",no_next_refresh:"现在没有下一次刷新（每日刷新关着，也没有自定义刷新点）",bad_next_qty:"下一次刷新的票额需为 0 以上的整数",bad_guide:"须知内容格式不对",guide_too_long:"须知太长了（最多 12000 个字）"};return setMsg(n,adminErr(a,"保存失败，请重新登录内部入口后再试",s)),!1}return ticketAdmin.status=a.status,renderTicketAdmin(),applyTicketEntryVisibility(ticketEntryVisibleFor(a.status)),scheduleTicketEntryCheck({ok:!0,...a.status}),e&&showToast(e),!0}async function loadTicketLog(){const t=$("ticketLogList");t.hidden=!1,t.innerHTML='<p class="fb-empty">读取中…</p>';const e=await callWorker({action:"ticket_log_get",password:internalAdminPassword});if(!e||!e.ok){t.innerHTML=`<p class="fb-empty">${escapeHtml(adminErr(e,"读取失败，请重新登录内部入口后再试"))}</p>`;return}if(!e.items.length){t.innerHTML='<p class="fb-empty">只读端还没有勾选过取票</p>';return}t.innerHTML=e.items.map(n=>{const a=n.ops.slice().sort((i,o)=>i.lastAt-o.lastAt),s=a.filter(i=>i.picked).length;return`<div class="fb-item ta-log-item">
      <div class="fb-head"><span class="venue-date">${escapeHtml(cnMdHm(n.windowStart))} – ${escapeHtml(cnMdHm(n.windowStart+n.hours*3600*1e3))}</span>
        <span class="fb-time">${n.hours} 小时 · ${a.length} 单（现在已取 ${s} 单）</span></div>
      <ul class="ta-log-ops">${a.map(i=>`<li>${escapeHtml(ticketRoundLabel(i.day))} 第 ${i.seq} 号 → <b>${i.picked?"已取票":"取消取票"}</b><small>${escapeHtml(cnMdHm(i.lastAt))}${i.count>1?`（这段时间里操作了 ${i.count} 次，第一次 ${escapeHtml(cnHm(i.firstAt))}）`:""}</small></li>`).join("")}</ul>
    </div>`}).join("")}async function loadTicketGuideEditor(){if(ticketAdmin.guideLoaded)return;const t=await callWorker({action:"get_ticket_guide"});if(!t||!t.ok){setMsg($("ticketGuideMsg"),adminErr(t,"须知读取失败，刷新后再试"));return}$("ticketGuideInput").value=t.text||TICKET_GUIDE_DEFAULT,$("ticketGuideState").textContent=t.text?"（已修改过）":"（现在用的是默认须知）",ticketAdmin.guideLoaded=!0,renderTicketGuidePreview()}function renderTicketGuidePreview(){$("ticketGuidePreview").innerHTML=renderGuideMarkup($("ticketGuideInput").value)}async function saveTicketGuide(t){const e=t.trim()===TICKET_GUIDE_DEFAULT.trim()?"":t;await ticketAdminSet({guide:e},e?"购票须知已保存":"购票须知已恢复默认")&&($("ticketGuideState").textContent=e?"（已修改过）":"（现在用的是默认须知）",ticketGuide.loaded=!1,$("ticketGuideContent").innerHTML=renderGuideMarkup(e||TICKET_GUIDE_DEFAULT))}let excelJsPromise=null;function loadExcelJs(){if(window.ExcelJS)return Promise.resolve(window.ExcelJS);const t=["https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js","https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"],e=n=>new Promise((a,s)=>{const i=document.createElement("script");i.src=t[n],i.onload=()=>window.ExcelJS?a(window.ExcelJS):s(new Error("no ExcelJS")),i.onerror=()=>{i.remove(),n+1<t.length?e(n+1).then(a,s):s(new Error("load failed"))},document.head.appendChild(i)});return excelJsPromise??=e(0).catch(n=>{throw excelJsPromise=null,n}),excelJsPromise}const XL_RED="FFE02020",XL_ORANGE="FFED7D31",XL_GREEN="FF92D050";function ticketMessageLine(t){const e=ticketActiveHolders(t.holders).find(n=>!n.pending)||t.holders.find(n=>n&&!n.pending);return e?t.anonymous?`来自${e.server}的冒险者：${t.message}`:`${e.name}@${e.server}：${t.message}`:`某位冒险者：${t.message}`}async function buildTicketWorkbook(t){const e=await loadExcelJs(),n=new e.Workbook,a={horizontal:"center",vertical:"middle"},s=t.filter(r=>!r.voided),i=computeTicketDuplicates(t),o=ticketRoundList().filter(r=>s.some(h=>h.day===r.key)),c=Math.max(5,...s.map(r=>ticketActiveHolders(r.holders).length)),p=c+4,l=n.addWorksheet("预售票"),m=["联系方式","序号","购票数量",...Array.from({length:c},(r,h)=>`购票id（${h+1}）`),"是否取票"];let v=1;o.forEach(r=>{const h=s.filter(A=>A.day===r.key).sort((A,M)=>A.seq-M.seq),y=h.reduce((A,M)=>A+M.qty,0);l.mergeCells(v,1,v,p-2);const g=l.getCell(v,1),E=/^(\d{4})-(\d{2})-(\d{2})$/.exec(r.key);E?(g.value=new Date(Date.UTC(Number(E[1]),Number(E[2])-1,Number(E[3]))),g.numFmt="yyyy/m/d"):g.value=ticketRoundLabel(r.key,!0),g.alignment=a,g.font={bold:!0},g.fill={type:"pattern",pattern:"solid",fgColor:{argb:XL_GREEN}},l.getCell(v,p-1).value="售出票数：",l.getCell(v,p-1).alignment=a;const S=v+2,C=v+1+Math.max(1,h.length);l.getCell(v,p).value={formula:`SUM(C${S}:C${C})`,result:y},l.getCell(v,p).alignment=a,v++,m.forEach((A,M)=>{const _=l.getCell(v,M+1);_.value=A,_.alignment=a,_.font={bold:!0}}),v++,h.length||v++,h.forEach(A=>{const M=i.get(A.id)||{contact:!1,holders:[]},_=A.holders.map((x,T)=>({h:x,i:T})).filter(x=>!x.h.voided);[A.contact,A.seq,A.qty,...Array.from({length:c},(x,T)=>_[T]?formatHolder(_[T].h):null),A.picked?"是":null].forEach((x,T)=>{const B=l.getCell(v,T+1);B.value=x,B.alignment=a;let I=A.overLimit?XL_RED:null;T===0&&M.contact&&(I=XL_ORANGE),T>=3&&T<3+c&&_[T-3]&&M.holders[_[T-3].i]&&(I=XL_ORANGE),I&&(B.font={color:{argb:I},bold:A.overLimit})}),v++}),v++}),o.length||(l.getCell(1,1).value="还没有有效订单"),l.getColumn(1).width=16,l.getColumn(2).width=6,l.getColumn(3).width=9;for(let r=4;r<4+c;r++)l.getColumn(r).width=22;l.getColumn(p).width=10;const w=p+2;[["标注说明",{bold:!0}],["每一块是一轮（两次票额刷新之间）；绿色格是这一轮的日期",null],["红字：提交时这一轮票额已满（超额登记，整单标红）",{color:{argb:XL_RED}}],["橙字：联系方式或持票 id 与其他订单重复",{color:{argb:XL_ORANGE}}],["作废的订单和持票人不在本页，见「已作废」页",null]].forEach(([r,h],y)=>{const g=l.getCell(y+1,w);g.value=r,h&&(g.font=h)}),l.getColumn(w).width=50;const f=s.filter(r=>r.message);if(ticketAdmin.status?.messageOn!==!1||f.length){const r=n.addWorksheet("留言");r.addRow(["轮次","序号","留言"]),r.getRow(1).font={bold:!0},f.forEach(h=>r.addRow([ticketRoundLabel(h.day,!0),h.seq,ticketMessageLine(h)])),r.getColumn(1).width=20,r.getColumn(2).width=6,r.getColumn(3).width=90,r.getColumn(3).alignment={wrapText:!0,vertical:"top"}}const d=n.addWorksheet("已作废");d.addRow(["轮次","序号","联系方式","作废范围","作废的持票人","留言","登记时间（国服）"]),d.getRow(1).font={bold:!0};const u=r=>new Date(r).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:!1});return t.forEach(r=>{r.voided&&d.addRow([ticketRoundLabel(r.day,!0),r.seq,r.contact,`整单（${r.qty} 张）`,ticketActiveHolders(r.holders).map(formatHolder).join("、"),r.message||"",u(r.createdAt)]);const h=r.holders.filter(y=>y&&y.voided);h.length&&d.addRow([ticketRoundLabel(r.day,!0),r.seq,r.contact,`部分（${h.length} 张）${r.voided?"，后来整单作废":""}`,h.map(formatHolder).join("、"),r.message||"",u(r.createdAt)])}),[20,6,16,18,40,40,20].forEach((r,h)=>{d.getColumn(h+1).width=r}),n}async function exportTicketExcel(t=""){const n=await(await buildTicketWorkbook(ticketAdmin.orders)).xlsx.writeBuffer(),a=new Blob([n],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),s=new Date(Date.now()+8*3600*1e3).toISOString().slice(0,16).replace(/[-:]/g,"").replace("T","-"),i=document.createElement("a");i.href=URL.createObjectURL(a),i.download=`花街购票信息${ticketAdmin.status?.testMode?"（测试）":""}${t}_${s}.xlsx`,document.body.appendChild(i),i.click(),i.remove(),setTimeout(()=>URL.revokeObjectURL(i.href),1e4)}async function withAdminBusy(t,e){const n=$("ticketAdminMsg");setMsg(n,""),t.disabled=!0;try{await e(n)}finally{t.disabled=!1}}function initTicketAdmin(){const t=()=>$("ticketAdminMsg"),e=(d,u,r,h)=>{const y=$(d).value.trim(),g=Number(y);return y===""||!Number.isInteger(g)||g<u||g>r?(setMsg(t(),h),null):($(d).blur(),g)},n=(d,u)=>$(d).addEventListener("keydown",r=>{r.key==="Enter"&&u()});$("ticketAdminTabs").addEventListener("click",d=>{const u=d.target.closest("[data-ta-tab]");u&&(ticketAdmin.tab=u.dataset.taTab,renderTicketAdmin())}),$("ticketOpenBtn").addEventListener("click",()=>{const d=!ticketAdmin.status?.open;ticketAdminSet({open:d},d?"购票已开放":"购票已关闭")}),$("ticketPendingBtn").addEventListener("click",()=>{const d=!ticketAdmin.status?.allowPending;ticketAdminSet({allowPending:d},d?"已允许持票 id 待定":"已关闭持票 id 待定")});const a=()=>{const d=$("ticketTitleInput").value.trim();if(d.length>60){setMsg(t(),"标题太长了（最多 60 个字）");return}$("ticketTitleInput").blur(),ticketAdminSet({title:d},d?"购票页标题已保存":"已恢复默认标题")};$("ticketTitleSaveBtn").addEventListener("click",a),n("ticketTitleInput",a),$("ticketTestBtn").addEventListener("click",()=>{const d=!ticketAdmin.status?.testMode;ticketAdminSet({testMode:d},d?"标题已加上「（测试）」":"标题已去掉「（测试）」")});const s=()=>{const d=e("ticketPerPersonInput",1,20,"单人限购需为 1–20 之间的整数");d!==null&&ticketAdminSet({perPerson:d},`单人限购已设为 ${d} 张`)};$("ticketPerPersonSaveBtn").addEventListener("click",s),n("ticketPerPersonInput",s);const i=()=>{const d=e("ticketCooldownInput",0,1440,"购票间隔需为 0–1440 之间的整数（分钟）");d!==null&&ticketAdminSet({cooldownMin:d},d?`再次购票间隔已设为 ${d} 分钟`:"已取消再次购票间隔")};$("ticketCooldownSaveBtn").addEventListener("click",i),n("ticketCooldownInput",i),$("ticketSchedSaveBtn").addEventListener("click",()=>{const d=cnLocalToEpoch($("ticketOpenAtInput").value),u=cnLocalToEpoch($("ticketCloseAtInput").value);if($("ticketOpenAtInput").value&&!d){setMsg(t(),"开启时间格式不对");return}if($("ticketCloseAtInput").value&&!u){setMsg(t(),"关闭时间格式不对");return}if(!d&&!u){setMsg(t(),"至少填一个时间，或点「清除」取消定时");return}const r=Date.now(),h=[d&&d<=r?"开启":"",u&&u<=r?"关闭":""].filter(Boolean);if(h.length&&!confirm(`定时${h.join("和")}的时间已经过去了，保存后会立刻生效。确定吗？`))return;const y=[];d&&y.push(`${formatCnTime(d)} 开启`),u&&y.push(`${formatCnTime(u)} 关闭`),ticketAdminSet({openAt:d,closeAt:u},`已设定：${y.join("，")}（国服时间）`)}),$("ticketSchedClearBtn").addEventListener("click",()=>{$("ticketOpenAtInput").value="",$("ticketCloseAtInput").value="",ticketAdminSet({openAt:0,closeAt:0},"已清除定时开关")});const o=d=>{const u=e("ticketExtraInput",1,1e5,"临时加票请填 1 以上的整数");if(u===null)return;const r=ticketAdmin.status?.round;if(d<0&&r&&r.quota-u<0){setMsg(t(),`这一轮现在只有 ${r.quota} 张票额，减不了 ${u} 张`);return}ticketAdminSet({extraDelta:d*u},`当前这一轮${d>0?"加":"减"}了 ${u} 张票额`).then(h=>{h&&($("ticketExtraInput").value="")})};$("ticketExtraAddBtn").addEventListener("click",()=>o(1)),$("ticketExtraSubBtn").addEventListener("click",()=>o(-1)),$("ticketExtraClearBtn").addEventListener("click",()=>{confirm("把当前这一轮的临时加票清零（恢复成这一轮开始时的票额）吗？")&&ticketAdminSet({extraSet:0},"临时加票已清零")}),$("ticketDailyBtn").addEventListener("click",()=>{const d=ticketAdmin.status?.dailyOn===!1;!d&&!confirm(`关闭每日刷新吗？

关闭后只在下面的「自定义刷新点」刷新票额；没有自定义刷新点时票额一直不重置。
当前这一轮不受影响。`)||ticketAdminSet({dailyOn:d},d?"已打开每日刷新":"已关闭每日刷新")});const c=()=>{const d=hhmmToMinutes($("ticketResetInput").value);if(d===null){setMsg(t(),"请填写刷新时间（时:分）");return}d!==(ticketAdmin.status?.resetMin||0)&&!confirm(`确定把每日票额刷新时间改为 ${minutesToHHMM(d)}（国服时间）吗？

当前这一轮不受影响，从下一次到 `+minutesToHHMM(d)+" 起按新时间刷新。")||($("ticketResetInput").blur(),ticketAdminSet({resetMin:d},`每日票额将在 ${minutesToHHMM(d)} 刷新（国服时间）`))};$("ticketResetSaveBtn").addEventListener("click",c),n("ticketResetInput",c);const p=()=>{const d=e("ticketLimitInput",0,1e5,"每日票额需为 0 以上的整数");if(d===null)return;const u=!$("ticketLimitCurWrap").hidden&&$("ticketLimitCurChk").checked;ticketAdminSet({limit:d,limitApplyCurrent:u},u?`每日票额已设为 ${d} 张（当前这一轮也改成 ${d} 张）`:`每日票额已设为 ${d} 张（从下一次每日刷新开始）`)};$("ticketLimitSaveBtn").addEventListener("click",p),n("ticketLimitInput",p);const l=$("ticketPointsList");l.addEventListener("input",()=>{ticketAdmin.pointsDirty=!0}),l.addEventListener("click",d=>{const u=d.target.closest("[data-point-del]");u&&(u.closest("[data-point]").remove(),ticketAdmin.pointsDirty=!0,l.querySelector("[data-point]")||(l.innerHTML='<p class="ta-empty" data-points-empty>还没有自定义刷新点（记得点「保存刷新点」）</p>'))}),$("ticketPointAddBtn").addEventListener("click",()=>{l.querySelector("[data-points-empty]")?.remove(),l.insertAdjacentHTML("beforeend",ticketPointRowHtml("",ticketAdmin.status?.limit??"")),ticketAdmin.pointsDirty=!0,l.querySelector("[data-point]:last-child .ta-point-at")?.focus()}),$("ticketPointSaveBtn").addEventListener("click",async()=>{const d=[...l.querySelectorAll("[data-point]")],u=[];for(const[g,E]of d.entries()){const S=E.querySelector(".ta-point-at").value,C=E.querySelector(".ta-point-qty").value.trim(),A=cnLocalToEpoch(S),M=Number(C);if(!A){setMsg(t(),`第 ${g+1} 个刷新点没填时间`);return}if(C===""||!Number.isInteger(M)||M<0){setMsg(t(),`第 ${g+1} 个刷新点的票额要填 0 以上的整数`);return}u.push({at:A,qty:M})}const r=u.map(g=>Math.floor(g.at/6e4));if(new Set(r).size!==r.length){setMsg(t(),"有两个刷新点是同一分钟，删掉一个再保存");return}const h=u.filter(g=>g.at<=Date.now());if(h.length&&!confirm(`有 ${h.length} 个刷新点的时间已经过去了（${h.map(g=>formatCnTime(g.at)).join("、")}）。

保存后会立刻以其中最晚的那个开始新的一轮（这一轮没卖完的票不结转）。确定吗？`))return;ticketAdmin.pointsDirty=!1,await ticketAdminSet({points:u},u.length?`已保存 ${u.length} 个刷新点`:"已清空自定义刷新点")||(ticketAdmin.pointsDirty=!0)}),$("ticketPointResetBtn").addEventListener("click",()=>{ticketAdmin.pointsDirty=!1,renderTicketAdmin()});const m=()=>{const d=e("ticketNextInput",0,1e5,"下一次刷新的票额需为 0 以上的整数");d!==null&&(ticketAdmin.pointsDirty&&ticketAdmin.status?.nextRefresh?.kind==="custom"&&!confirm("自定义刷新点列表里有还没保存的修改，会被这次保存覆盖。继续吗？")||(ticketAdmin.pointsDirty=!1,ticketAdminSet({nextQty:d},`下一次刷新的票额已设为 ${d} 张`)))};$("ticketNextSaveBtn").addEventListener("click",m),n("ticketNextInput",m),$("ticketNextResetBtn").addEventListener("click",()=>ticketAdminSet({nextQty:null},"下一次刷新恢复默认票额"));const v={full:"购票页显示具体余票张数",range:"购票页只显示余票大致范围",hidden:"购票页不显示余票"};$("ticketRemainModeSelect").addEventListener("change",d=>{const u=d.target.value;d.target.blur(),ticketAdminSet({remainingMode:u},v[u]||"已保存")}),$("ticketShowSchedBtn").addEventListener("click",()=>{const d=ticketAdmin.status?.showSchedule===!1;ticketAdminSet({showSchedule:d},d?"购票页显示定时开启 / 关闭时间":"购票页不显示定时开启 / 关闭时间")}),$("ticketShowResetBtn").addEventListener("click",()=>{const d=ticketAdmin.status?.showReset===!1;ticketAdminSet({showReset:d},d?"购票页显示刷新时间":"购票页不显示刷新时间")}),$("ticketViewerBtn").addEventListener("click",()=>{const d=ticketAdmin.status?.viewerEnabled===!1;ticketAdminSet({viewerEnabled:d},d?"「购票情况」查看页已开放":"「购票情况」查看页已关闭，查看密码暂时进不去（已经打开的页面下次刷新时也会被挡住）")}),document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach(d=>{d.addEventListener("click",()=>{const u=d.dataset.taFlag,r=!ticketAdmin.status?.[u];d.dataset.confirmOn&&r&&!confirm(d.dataset.confirmOn)||ticketAdminSet({[u]:r},r?d.dataset.toastOn:d.dataset.toastOff)})});const w=()=>{const d=e("ticketIdleInput",0,1440,"停留时间需为 0–1440 之间的整数（分钟），0 = 不限制");d!==null&&ticketAdminSet({idleMin:d},d?`购票页停留超过 ${d} 分钟将跳回首页`:"已取消购票页停留时间限制")};$("ticketIdleSaveBtn").addEventListener("click",w),n("ticketIdleInput",w),$("ticketGuideEditor").addEventListener("toggle",d=>{d.currentTarget.open&&loadTicketGuideEditor()}),$("ticketGuideInput").addEventListener("input",()=>{clearTimeout($("ticketGuideInput")._t),$("ticketGuideInput")._t=setTimeout(renderTicketGuidePreview,250)}),$("ticketGuideSaveBtn").addEventListener("click",d=>withAdminBusy(d.currentTarget,async()=>{if(!ticketAdmin.guideLoaded){setMsg($("ticketGuideMsg"),"须知还没读出来，稍等一下再保存");return}setMsg($("ticketGuideMsg"),""),await saveTicketGuide($("ticketGuideInput").value)})),$("ticketGuideResetBtn").addEventListener("click",d=>withAdminBusy(d.currentTarget,async()=>{confirm("把购票须知恢复成默认内容吗？现在编辑框里的内容会被替换掉。")&&($("ticketGuideInput").value=TICKET_GUIDE_DEFAULT,renderTicketGuidePreview(),ticketAdmin.guideLoaded=!0,await saveTicketGuide(TICKET_GUIDE_DEFAULT))}));const f=()=>{const d=e("ticketLogHoursInput",1,720,"日志间隔需为 1–720 之间的整数（小时）");d!==null&&ticketAdminSet({viewerLogHours:d},`只读端操作日志改为每 ${d} 小时合并一条`)};$("ticketLogHoursSaveBtn").addEventListener("click",f),n("ticketLogHoursInput",f),$("ticketLogBtn").addEventListener("click",d=>withAdminBusy(d.currentTarget,loadTicketLog)),$("ticketDaySelect").addEventListener("change",d=>{ticketAdmin.day=d.target.value,renderTicketAdmin()}),$("ticketSearchInput").addEventListener("input",d=>{ticketAdmin.search=d.target.value.trim(),renderTicketOrders()}),$("ticketAdminTbody").addEventListener("click",async d=>{const u=d.target.closest("[data-act]");if(!u)return;const r=Number(u.closest("[data-order-id]").dataset.orderId),h=ticketAdmin.orders.find(E=>E.id===r);if(!h)return;const y=u.dataset.act;if(y==="edit"){openTicketEdit(h);return}if(y==="partial"){openTicketPartial(h);return}const g=y==="void";if(!(g&&!confirm(`确定作废第 ${h.seq} 号（${h.qty} 张）吗？

作废后该单不会导出到「预售票」页，票额会放回这一轮。之后可以再恢复。`))){u.disabled=!0;try{await ticketAdminVoid(r,g)}finally{u.disabled=!1}}}),$("ticketAdminTbody").addEventListener("change",d=>{const u=d.target.closest("[data-pick]");if(!u)return;const r=Number(u.closest("[data-order-id]").dataset.orderId);ticketTogglePickup(r,u.checked,u)}),$("ticketEditBox").addEventListener("click",d=>{const u=d.target;if(u.closest("#teCancel")||u.closest("#tpClose")){closeTicketEdit();return}if(u.closest("#teSave")){saveTicketEdit();return}if(u.closest("#teAddHolder")){if(collectTicketEditHolders(),ticketAdmin.editHolders.length>=50){setMsg($("teMsg"),"一单最多 50 位持票人");return}ticketAdmin.editHolders.push({name:"",server:""}),renderTicketEditHolders();return}const r=u.closest("[data-h-del]");if(r){collectTicketEditHolders(),ticketAdmin.editHolders.splice(Number(r.closest("[data-h]").dataset.h),1),renderTicketEditHolders();return}const h=u.closest("[data-pv]");h&&(h.disabled=!0,ticketPartialVoid(Number(h.dataset.pv),h.dataset.pvVoid==="1").finally(()=>{h.disabled=!1}))}),$("ticketEditBox").addEventListener("change",d=>{const u=d.target.closest(".te-pending");if(u){const r=u.closest("[data-h]");r.querySelector(".te-name").disabled=u.checked,r.querySelector(".te-server").disabled=u.checked}}),$("ticketEditBox").addEventListener("focusout",d=>{const u=d.target.closest(".te-name");u&&(u.value=normalizeTicketName(u.value))}),$("ticketStatsRound").addEventListener("change",d=>{ticketAdmin.statsRound=d.target.value,renderTicketStats()}),$("ticketStatsBody").addEventListener("click",d=>{const u=d.target.closest("[data-copy-unpicked]");u&&copyTicketUnpicked(u.dataset.copyUnpicked)}),$("ticketRefreshBtn").addEventListener("click",d=>withAdminBusy(d.currentTarget,async()=>{await refreshTicketAdmin()&&showToast("已刷新")})),$("ticketExportBtn").addEventListener("click",d=>withAdminBusy(d.currentTarget,async u=>{if(!await refreshTicketAdmin()){setMsg(u,"读取购票数据失败，未导出");return}try{await exportTicketExcel()}catch(r){console.error(r),setMsg(u,"导出失败：表格组件加载不出来，检查一下网络后再试")}})),$("ticketClearBtn").addEventListener("click",d=>withAdminBusy(d.currentTarget,async u=>{if(!await refreshTicketAdmin()){setMsg(u,"读取购票数据失败，未执行清空");return}const r=ticketAdmin.orders.length,h=ticketAdmin.orders.filter(g=>g.voided).length;if(!confirm(`确定要清空全部购票数据吗？（共 ${r} 单${h?`，含 ${h} 单已作废`:""}）

清空前会先自动下载一份 Excel 备份（预售票 / 留言 / 已作废三页都在），只读端操作日志和以前各轮的记录也会一起清掉，清空后无法恢复。`))return;if(r)try{await exportTicketExcel("_清空前备份")}catch(g){console.error(g),setMsg(u,"备份导出失败，已取消清空。检查网络后再试");return}const y=await callWorker({action:"ticket_admin_clear",password:internalAdminPassword,confirm:"CLEAR"});if(!y||!y.ok){setMsg(u,adminErr(y,"清空失败，请重新登录内部入口后再试"));return}await refreshTicketAdmin(),showToast(r?"已备份并清空购票数据":"购票数据已清空")})),clearInterval(ticketAdminTimer),ticketAdminTimer=setInterval(()=>{document.hidden||isTicketViewer()||!internalAdminPassword||$("ticketAdminPanel").hidden||$("adminModalOverlay").hidden||ticketAdmin.edit||ticketAdmin.tab==="settings"||refreshTicketAdmin()},60*1e3)}const feedbackAdmin={items:[],loaded:!1};function renderFeedbackAdmin(){const t=$("feedbackFilterCat").value,e=$("feedbackFilterState").value,n=feedbackAdmin.items,a=n.filter(o=>!o.handled).length;$("feedbackAdminStatus").textContent=n.length?`共 ${n.length} 条，未处理 ${a} 条`:"还没有收到反馈";const s=$("feedbackPillBadge");s.hidden=!a,s.textContent=a>99?"99+":String(a);const i=n.filter(o=>(!t||o.category===t)&&(!e||(e==="done"?o.handled:!o.handled)));$("feedbackAdminList").innerHTML=i.length?i.map(o=>{const c=new Date(o.createdAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:!1});return`<div class="fb-item${o.handled?" is-done":""}" data-fb-id="${o.id}">
      <div class="fb-head">
        <span class="fb-cat fb-cat-${escapeHtml(o.category)}">${escapeHtml(FEEDBACK_CATEGORIES[o.category]||o.category)}</span>
        <span class="fb-time">${escapeHtml(c)}（国服）</span>
        ${o.handled?'<span class="fb-state">已处理</span>':""}
      </div>
      <div class="fb-body">${escapeHtml(o.content)}</div>
      <div class="fb-contact">${o.contact?`联系方式：<b>${escapeHtml(o.contact)}</b>`:"未留联系方式"}</div>
      <div class="fb-actions">
        ${o.contact?'<button type="button" class="tt-act is-copy" data-fb-act="copy">复制联系方式</button>':""}
        <button type="button" class="tt-act ${o.handled?"is-reopen":"is-restore"}" data-fb-act="mark">${o.handled?"标记为未处理":"标记已处理"}</button>
        <button type="button" class="tt-act is-void" data-fb-act="delete">删除</button>
      </div>
    </div>`}).join(""):`<p class="fb-empty">${n.length?"没有符合筛选条件的反馈":"反馈箱还是空的"}</p>`}async function refreshFeedbackAdmin(){const t=await callWorker({action:"feedback_admin_list",password:internalAdminPassword});return!t||!t.ok?($("feedbackAdminStatus").textContent="读取失败："+adminErr(t,"请重新登录内部入口后再试"),!1):(feedbackAdmin.items=t.items,feedbackAdmin.loaded=!0,renderFeedbackAdmin(),!0)}function initFeedbackAdmin(){$("feedbackFilterCat").insertAdjacentHTML("beforeend",Object.entries(FEEDBACK_CATEGORIES).map(([t,e])=>`<option value="${t}">${e}</option>`).join("")),$("feedbackFilterCat").addEventListener("change",renderFeedbackAdmin),$("feedbackFilterState").addEventListener("change",renderFeedbackAdmin),$("feedbackRefreshBtn").addEventListener("click",async t=>{const e=t.currentTarget;e.disabled=!0;try{await refreshFeedbackAdmin()&&showToast("已刷新")}finally{e.disabled=!1}}),$("feedbackAdminList").addEventListener("click",async t=>{const e=t.target.closest("[data-fb-act]");if(!e)return;const n=Number(e.closest("[data-fb-id]").dataset.fbId),a=feedbackAdmin.items.find(c=>c.id===n);if(!a)return;const s=$("feedbackAdminMsg");setMsg(s,"");const i=e.dataset.fbAct;if(i==="copy"){copyText(a.contact,"联系方式已复制",a.contact);return}if(i==="delete"&&!confirm("确定删除这条反馈吗？删除后无法恢复。"))return;e.disabled=!0;const o=i==="mark"?await callWorker({action:"feedback_admin_mark",password:internalAdminPassword,id:n,handled:!a.handled}):await callWorker({action:"feedback_admin_delete",password:internalAdminPassword,id:n});if(e.disabled=!1,!o||!o.ok){setMsg(s,adminErr(o,"操作失败，请重新登录内部入口后再试"));return}i==="mark"?a.handled=!!o.handled:feedbackAdmin.items=feedbackAdmin.items.filter(c=>c.id!==n),renderFeedbackAdmin(),showToast(i==="mark"?a.handled?"已标记为已处理":"已标记为未处理":"已删除")})}const venueAdmin={items:[],today:"",editingId:null,loaded:!1},VENUE_SOURCE_TEXT={web:"网站登记",admin:"后台录入",import:"金数据导入"};function venueAdminFiltered(){const t=$("venueFilterState").value,e=$("venueFilterTime").value,n=venueAdmin.today||cnDate(0),a=venueAdmin.items.filter(s=>(!t||(t==="void"?s.voided:!s.voided))&&(!e||(e==="upcoming"?s.date>=n:s.date<n)));return a.sort((s,i)=>e==="upcoming"?s.date.localeCompare(i.date)||s.id-i.id:i.date.localeCompare(s.date)||i.id-s.id),a}function renderVenueAdmin(){const t=venueAdmin.items,e=venueAdmin.today||cnDate(0),n=t.filter(c=>!c.voided),a=n.filter(c=>c.date>=e).length,s=t.length-n.length;$("venueAdminStatus").textContent=t.length?`共 ${t.length} 条：有效 ${n.length} 条（今天及以后 ${a} 条）${s?`，已作废 ${s} 条`:""}`:"还没有场地登记";const i=venueAdminFiltered(),o=c=>new Date(c).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:!1,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});$("venueAdminList").innerHTML=i.length?i.map(c=>{const p=c.date<e,l=venueSummaryRows(c).filter(([m])=>!["预约日期","申请身份","使用意向","预约场地"].includes(m));return`<div class="fb-item venue-item${c.voided?" is-void":""}${p?" is-past":""}" data-venue-id="${c.id}">
      <div class="fb-head">
        <span class="venue-date">${escapeHtml(venueDateLabel(c.date))}</span>
        ${c.voided?'<span class="venue-tag is-void">已作废</span>':p?'<span class="venue-tag">已过去</span>':""}
        <span class="fb-time">#${c.id} · ${escapeHtml(VENUE_SOURCE_TEXT[c.source]||c.source)}</span>
      </div>
      <div class="venue-tags">
        <span class="fb-cat">${escapeHtml(venueIdentityText(c))}</span>
        <span class="fb-cat venue-purpose">${escapeHtml(venuePurposeText(c))}</span>
      </div>
      <div class="venue-places-line">${(c.places||[]).map(m=>`<span class="venue-chip">${escapeHtml(venuePlaceLabel(m))}</span>`).join("")}</div>
      <dl class="venue-kv">${l.map(([m,v])=>`<dt>${escapeHtml(m)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>
      ${c.adminNote?`<p class="venue-note"><b>管理备注</b>${escapeHtml(c.adminNote)}</p>`:""}
      <p class="fb-contact">提交于 ${escapeHtml(o(c.createdAt))}（国服）${c.updatedAt?` · 最后修改 ${escapeHtml(o(c.updatedAt))}`:""}</p>
      <div class="fb-actions">
        ${c.contact?'<button type="button" class="tt-act is-copy" data-venue-act="copy">复制联系方式</button>':""}
        <button type="button" class="tt-act" data-venue-act="edit">修改</button>
        ${c.voided?'<button type="button" class="tt-act is-restore" data-venue-act="restore">恢复</button>':'<button type="button" class="tt-act is-void" data-venue-act="void">作废</button>'}
      </div>
    </div>`}).join(""):`<p class="fb-empty">${t.length?"没有符合筛选条件的登记":"还没有场地登记"}</p>`}async function refreshVenueAdmin(){const t=await callWorker({action:"venue_admin_list",password:internalAdminPassword});return!t||!t.ok?($("venueAdminStatus").textContent="读取失败："+adminErr(t,"请重新登录内部入口后再试"),!1):(venueAdmin.items=t.items,venueAdmin.today=t.today||cnDate(0),venueAdmin.loaded=!0,renderVenueAdmin(),!0)}function openVenueEditor(t=null){venueAdmin.editingId=t?t.id:null;const e=$("venueAdminFields");t?fillVenueForm(e,t):clearVenueForm(e),$("venueEditTitle").textContent=t?`修改登记 #${t.id}`:"新增预约",$("venueAdminSaveBtn").textContent=t?"保存修改":"保存",setMsg($("venueAdminFormMsg"),""),$("venueEditBox").hidden=!1,$("venueNewBtn").disabled=!0,$("venueEditBox").scrollIntoView({behavior:"smooth",block:"start"})}function closeVenueEditor(){venueAdmin.editingId=null,$("venueEditBox").hidden=!0,$("venueNewBtn").disabled=!1,clearVenueForm($("venueAdminFields"))}async function saveVenueAdmin(t){t.preventDefault();const e=$("venueAdminFormMsg"),n=readVenueForm($("venueAdminFields"));if(n.error){setMsg(e,n.error),n.focus?.focus();return}const a=venueAdmin.editingId,s=$("venueAdminSaveBtn");s.disabled=!0,setMsg(e,"");const i=await callWorker({action:"venue_admin_save",password:internalAdminPassword,...a?{id:a}:{},...n.payload});if(s.disabled=!1,!i||!i.ok){setMsg(e,adminErr(i,"保存失败，请重新登录内部入口后再试",VENUE_ERRORS));return}const o=venueAdmin.items.findIndex(c=>c.id===i.item.id);o>=0?venueAdmin.items[o]=i.item:venueAdmin.items.push(i.item),closeVenueEditor(),renderVenueAdmin(),showToast(a?`登记 #${a} 已保存`:`已新增登记 #${i.item.id}`)}async function venueAdminVoid(t,e){const n=$("venueAdminMsg");setMsg(n,"");const a=await callWorker({action:"venue_admin_void",password:internalAdminPassword,id:t.id,voided:e});if(!a||!a.ok){if(a&&a.error==="not_changed"){setMsg(n,"这条登记的状态已经变过了，已为你刷新"),await refreshVenueAdmin();return}setMsg(n,adminErr(a,"操作失败，请重新登录内部入口后再试"));return}const s=venueAdmin.items.findIndex(i=>i.id===a.item.id);s>=0&&(venueAdmin.items[s]=a.item),renderVenueAdmin(),showToast(e?`登记 #${t.id} 已作废（切到「已作废」可以恢复）`:`登记 #${t.id} 已恢复`)}function initVenueAdmin(){buildVenueForm($("venueAdminFields"),{prefix:"vfa",admin:!0}),["input","change"].forEach(t=>$("venueAdminFields").addEventListener(t,()=>setMsg($("venueAdminFormMsg"),""))),$("venueFilterState").addEventListener("change",renderVenueAdmin),$("venueFilterTime").addEventListener("change",renderVenueAdmin),$("venueRefreshBtn").addEventListener("click",async t=>{const e=t.currentTarget;e.disabled=!0;try{await refreshVenueAdmin()&&showToast("已刷新")}finally{e.disabled=!1}}),$("venueNewBtn").addEventListener("click",()=>openVenueEditor(null)),$("venueAdminCancelBtn").addEventListener("click",closeVenueEditor),$("venueAdminForm").addEventListener("submit",saveVenueAdmin),$("venueAdminList").addEventListener("click",async t=>{const e=t.target.closest("[data-venue-act]");if(!e)return;const n=Number(e.closest("[data-venue-id]").dataset.venueId),a=venueAdmin.items.find(i=>i.id===n);if(!a)return;const s=e.dataset.venueAct;if(s==="copy"){copyText(a.contact,"联系方式已复制",a.contact);return}if(s==="edit"){if(venueAdmin.editingId&&venueAdmin.editingId!==n&&!confirm(`正在修改 #${venueAdmin.editingId}，还没保存。放弃那边的修改、改为修改 #${n} 吗？`))return;openVenueEditor(a);return}if(!(s==="void"&&!confirm(`确定作废登记 #${n}（${venueDateLabel(a.date)} · ${a.charId||a.contact}）吗？

作废后不会删除，切到「已作废」还能恢复。`))){e.disabled=!0;try{await venueAdminVoid(a,s==="void")}finally{e.disabled=!1}}})}const surveyAdmin={items:[],open:!0,lockdown:!1,loaded:!1,readonly:!1},surveyAdminValid=()=>surveyAdmin.items.filter(t=>!t.voided),surveyAdminTime=t=>new Date(t).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:!1,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});function surveyAdminSeqMap(){const t=new Map;return surveyAdminValid().forEach((e,n)=>t.set(e.id,n+1)),t}function surveyAdminStats(t){const e={};return SURVEY_FIELDS.forEach(n=>{e[n.key]={n:0,counts:{},sum:0,dist:Array(11).fill(0),texts:[]}}),t.forEach(n=>{const a=n.answers||{};SURVEY_FIELDS.forEach(s=>{const i=a[s.key];if(i==null||i==="")return;const o=e[s.key];if(s.type==="score"){if(!Number.isInteger(i)||i<1||i>10)return;o.n++,o.sum+=i,o.dist[i]++}else if(s.type==="single"||s.type==="multi"){const c=Array.isArray(i)?i:[i];if(!c.length)return;o.n++,c.forEach(p=>{o.counts[p]=(o.counts[p]||0)+1})}else o.n++,o.texts.push({id:n.id,text:String(i)})})}),e}const surveyAvg=t=>t.n?(t.sum/t.n).toFixed(1):"—",surveyPct=(t,e)=>e?Math.round(t/e*100):0;function surveyTextsHtml(t,e,n){return e.length?`<details class="sv-texts"><summary>${escapeHtml(t)}（${e.length} 条）</summary><ul>`+e.map(a=>`<li><span class="sv-text-id">${n.has(a.id)?`第 ${n.get(a.id)} 份`:`#${a.id}`}</span>${escapeHtml(a.text)}</li>`).join("")+"</ul></details>":""}function renderSurveyAdminStats(){const t=surveyAdminValid(),e=$("surveyAdminStats");if(!t.length){e.innerHTML=`<p class="fb-empty">${surveyAdmin.items.length?"有效答卷为 0（都被作废了）":"还没有人填写问卷"}</p>`;return}const n=surveyAdminStats(t),a=surveyAdminSeqMap(),i='<div class="sv-overview"><p class="sv-stat-sec">评分一览（平均分，满分 10 分）</p><dl class="sv-overview-list">'+[...SURVEY_ITEMS.filter(c=>c.kind==="score"&&!c.card),...SURVEY_ITEMS.filter(c=>c.kind==="score"&&c.card)].map(c=>{const p=n[c.key];return`<div class="sv-ov-item${p.n?"":" is-empty"}"><dt>${escapeHtml(c.card?`项目 · ${c.card.title}`:c.short||c.label)}</dt><dd><b>${surveyAvg(p)}</b><small>${p.n} 人</small></dd></div>`}).join("")+"</dl></div>",o=SURVEY.sections.map((c,p)=>{const l=SURVEY_ITEMS.filter(m=>m.section===p).map(m=>{const v=n[m.key];if(m.kind==="choice"){const w=Math.max(1,...m.options.map(u=>v.counts[u.key]||0)),f=m.options.map(u=>{const r=v.counts[u.key]||0;return`<div class="sv-bar-row"><span class="sv-bar-key">${escapeHtml(u.label)}</span><span class="sv-bar"><i style="width:${r/w*100}%"></i></span><span class="sv-bar-n">${r}<small>${surveyPct(r,v.n)}%</small></span></div>`}).join(""),d=m.other?surveyTextsHtml("「其他」补充说明",n[m.other.key].texts,a):"";return`<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(m.label)}</p><p class="sv-stat-meta">${v.n} 人作答${m.multi?"（多选，百分比按作答人数算）":""}</p><div class="sv-bars">${f}</div>${d}</div>`}if(m.kind==="score"){const w=Math.max(1,...v.dist.slice(1)),f=v.dist.slice(1).map((r,h)=>`<span class="sv-hist-col" title="${h+1} 分：${r} 人"><span class="sv-hist-bar"><i style="height:${r/w*100}%"></i></span><span class="sv-hist-n">${r}</span><span class="sv-hist-k">${h+1}</span></span>`).join(""),d=m.comment?surveyTextsHtml("意见或建议",n[m.comment.key].texts,a):"",u=m.card?`${escapeHtml(m.card.title)}<small>${escapeHtml(m.card.sub)}</small>`:escapeHtml(m.label);return`<div class="sv-stat${m.card?" is-card":""}"><p class="sv-stat-title">${u}</p><p class="sv-stat-meta">${v.n?`${v.n} 人打分 · 平均 <b>${surveyAvg(v)}</b> 分`:"还没有人打分"}</p>`+(v.n?`<div class="sv-hist" aria-label="1～10 分各有多少人">${f}</div>`:"")+d+"</div>"}return`<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(m.label)}</p><p class="sv-stat-meta">${v.n?`${v.n} 条`:"还没有人填写"}</p>`+surveyTextsHtml("展开查看",v.texts,a)+"</div>"}).join("");return`<p class="sv-stat-sec">${SURVEY_SECTION_NO[p]||p+1}、${escapeHtml(c.title)}</p>${l}`}).join("");e.innerHTML=i+o}function renderSurveyAdminList(){const t=$("surveyFilterState").value,e=surveyAdminSeqMap(),n=surveyAdmin.items.filter(a=>!t||(t==="void"?a.voided:!a.voided)).slice().sort((a,s)=>s.id-a.id);$("surveyAdminList").innerHTML=n.length?n.map(a=>{const s=a.answers||{},i=SURVEY_FIELDS.filter(o=>s[o.key]!==void 0&&s[o.key]!=="").map(o=>{const c=o.type==="score"?`${s[o.key]} 分`:surveyAnswerText(o.key,s[o.key]);return`<dt>${escapeHtml(surveyFieldHeader(o.key))}</dt><dd>${escapeHtml(c)}</dd>`}).join("");return`<div class="fb-item venue-item survey-item${a.voided?" is-void":""}" data-sv-id="${a.id}">
      <div class="fb-head">
        <span class="venue-date">${a.voided?`#${a.id}`:`第 ${e.get(a.id)} 份`}</span>
        ${a.voided?'<span class="venue-tag is-void">已作废</span>':""}
        <span class="fb-time">#${a.id} · ${escapeHtml(surveyAdminTime(a.createdAt))}（国服）</span>
      </div>
      <dl class="venue-kv">${i}</dl>
      <div class="fb-actions">
        ${s.contact?'<button type="button" class="tt-act is-copy" data-sv-act="copy">复制联系方式</button>':""}
        ${surveyAdmin.readonly?"":a.voided?'<button type="button" class="tt-act is-restore" data-sv-act="restore">恢复</button>':'<button type="button" class="tt-act is-void" data-sv-act="void">作废</button>'}
      </div>
    </div>`}).join(""):`<p class="fb-empty">${surveyAdmin.items.length?"没有符合筛选条件的答卷":"还没有人填写问卷"}</p>`}function renderSurveyAdmin(){const t=surveyAdmin.items,e=surveyAdminValid().length,n=t.length-e;$("surveyAdminStatus").textContent=t.length?`共 ${t.length} 份：有效 ${e} 份${n?`，已作废 ${n} 份`:""}`:"还没有人填写问卷",setTicketSwitch($("surveyOpenBtn"),surveyAdmin.open,"已开放（点击关闭）","已关闭（点击开放）"),$("surveyLockNote").hidden=!surveyAdmin.lockdown;const a=$("surveyViewSelect").value;$("surveyFilterState").hidden=a!=="list",$("surveyAdminStats").hidden=a!=="stats",$("surveyAdminList").hidden=a!=="list",a==="list"?renderSurveyAdminList():renderSurveyAdminStats()}async function refreshSurveyAdmin(){const t=await callWorker({action:"survey_admin_list",password:internalAdminPassword||internalViewPassword,survey:SURVEY.id});return!t||!t.ok?($("surveyAdminStatus").textContent=t?.error==="viewer_closed"?"管理员没有开放「活动问卷」给只读端查看":"读取失败："+adminErr(t,"请重新登录内部入口后再试",{bad_survey:`Worker 里没有「${SURVEY.id}」这份问卷，检查 worker.js 的 SURVEYS`}),!1):(surveyAdmin.readonly=!!t.readonly,$("surveyAdminPanel").classList.toggle("is-readonly",surveyAdmin.readonly),surveyAdmin.items=Array.isArray(t.items)?t.items:[],surveyAdmin.open=t.open!==!1,surveyAdmin.lockdown=!!t.lockdown,surveyAdmin.loaded=!0,renderSurveyAdmin(),!0)}async function exportSurveyExcel(){const t=await loadExcelJs(),e=new t.Workbook,n=surveyAdminValid(),a={bold:!0},s=e.addWorksheet("答卷");s.addRow(["第几份","编号","提交时间（国服）",...SURVEY_FIELDS.map(f=>surveyFieldHeader(f.key))]),s.getRow(1).font=a,n.forEach((f,d)=>{const u=f.answers||{};s.addRow([d+1,f.id,surveyAdminTime(f.createdAt),...SURVEY_FIELDS.map(r=>{const h=u[r.key];return r.type==="score"?typeof h=="number"?h:null:surveyAnswerText(r.key,h)||null})])}),s.getColumn(1).width=7,s.getColumn(2).width=7,s.getColumn(3).width=18,SURVEY_FIELDS.forEach((f,d)=>{s.getColumn(d+4).width=f.type==="score"?12:f.type==="text"?30:24}),s.views=[{state:"frozen",xSplit:1,ySplit:1}];const i=surveyAdminStats(n),o=e.addWorksheet("统计");o.addRow([`有效答卷 ${n.length} 份`]).font=a,o.addRow([]),o.addRow(["打分题","作答人数","平均分",...Array.from({length:10},(f,d)=>`${d+1}分`)]).font=a,SURVEY_ITEMS.filter(f=>f.kind==="score").forEach(f=>{const d=i[f.key];o.addRow([f.card?`${f.card.title}（${f.card.sub}）`:f.label,d.n,d.n?Number((d.sum/d.n).toFixed(2)):null,...d.dist.slice(1)])}),o.addRow([]),o.addRow(["选择题","选项","人数","占作答人数"]).font=a,SURVEY_ITEMS.filter(f=>f.kind==="choice").forEach(f=>{const d=i[f.key];f.options.forEach((u,r)=>{const h=d.counts[u.key]||0;o.addRow([r===0?`${f.label}（${d.n} 人作答）`:"",u.label,h,d.n?`${surveyPct(h,d.n)}%`:"—"])})}),o.getColumn(1).width=52,o.getColumn(2).width=28;for(let f=3;f<=13;f++)o.getColumn(f).width=9;const c=e.addWorksheet("文字意见");c.addRow(["题目","第几份","编号","内容"]).font=a;const p=surveyAdminSeqMap();SURVEY_FIELDS.filter(f=>f.type==="text").forEach(f=>{i[f.key].texts.forEach(d=>c.addRow([surveyFieldHeader(f.key),p.get(d.id),d.id,d.text]))}),c.getColumn(1).width=34,c.getColumn(2).width=8,c.getColumn(3).width=7,c.getColumn(4).width=80,c.getColumn(4).alignment={wrapText:!0,vertical:"top"};const l=await e.xlsx.writeBuffer(),m=new Blob([l],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),v=new Date(Date.now()+8*3600*1e3).toISOString().slice(0,16).replace(/[-:]/g,"").replace("T","-"),w=document.createElement("a");w.href=URL.createObjectURL(m),w.download=`花街活动问卷_${SURVEY.id}_${v}.xlsx`,document.body.appendChild(w),w.click(),w.remove(),setTimeout(()=>URL.revokeObjectURL(w.href),1e4)}async function surveyAdminVoid(t,e){const n=$("surveyAdminMsg");setMsg(n,"");const a=await callWorker({action:"survey_admin_void",password:internalAdminPassword,id:t.id,voided:e});if(!a||!a.ok){if(a&&a.error==="not_changed"){setMsg(n,"这份答卷的状态已经变过了，已为你刷新"),await refreshSurveyAdmin();return}setMsg(n,adminErr(a,"操作失败，请重新登录内部入口后再试"));return}const s=surveyAdmin.items.findIndex(i=>i.id===a.item.id);s>=0&&(surveyAdmin.items[s]=a.item),renderSurveyAdmin(),showToast(e?`答卷 #${t.id} 已作废（切到「已作废」可以恢复）`:`答卷 #${t.id} 已恢复`)}function initSurveyAdmin(){$("surveyViewSelect").addEventListener("change",renderSurveyAdmin),$("surveyFilterState").addEventListener("change",renderSurveyAdmin),$("surveyRefreshBtn").addEventListener("click",async t=>{const e=t.currentTarget;e.disabled=!0;try{await refreshSurveyAdmin()&&showToast("已刷新")}finally{e.disabled=!1}}),$("surveyOpenBtn").addEventListener("click",async t=>{const e=t.currentTarget,n=!surveyAdmin.open;if(!(!n&&!confirm(`确定关闭问卷吗？

关闭后访客看到「问卷已经结束收集」，不能再提交；已经收到的答卷不受影响，之后随时可以再开放。`))){setMsg($("surveyAdminMsg"),""),e.disabled=!0;try{const a=await callWorker({action:"survey_admin_set",password:internalAdminPassword,survey:SURVEY.id,open:n});if(!a||!a.ok){setMsg($("surveyAdminMsg"),adminErr(a,"切换失败，请重新登录内部入口后再试"));return}surveyAdmin.open=a.open,renderSurveyAdmin(),showToast(a.open?"问卷已开放":"问卷已关闭")}finally{e.disabled=!1}}}),$("surveyExportBtn").addEventListener("click",async t=>{const e=t.currentTarget,n=$("surveyAdminMsg");setMsg(n,""),e.disabled=!0;try{if(!await refreshSurveyAdmin()){setMsg(n,"读取问卷数据失败，未导出");return}if(!surveyAdminValid().length){setMsg(n,"还没有有效答卷，没有可导出的内容");return}await exportSurveyExcel()}catch(a){console.error(a),setMsg(n,"导出失败：表格组件加载不出来，检查一下网络后再试")}finally{e.disabled=!1}}),$("surveyCopyLinkBtn").addEventListener("click",()=>{const t=`${location.origin}${location.pathname}${SURVEY_HASH}`;copyText(t,"问卷链接已复制，可以直接发群里",t)}),$("surveyAdminList").addEventListener("click",async t=>{const e=t.target.closest("[data-sv-act]");if(!e)return;const n=Number(e.closest("[data-sv-id]").dataset.svId),a=surveyAdmin.items.find(i=>i.id===n);if(!a)return;const s=e.dataset.svAct;if(s==="copy"){copyText(a.answers.contact,"联系方式已复制",a.answers.contact);return}if(!(s==="void"&&!confirm(`确定作废答卷 #${n} 吗？

作废后不进统计和导出，但不会删除，切到「已作废」还能恢复。`))){e.disabled=!0;try{await surveyAdminVoid(a,s==="void")}finally{e.disabled=!1}}})}const POPUP_IMAGE_MAX_BYTES=50*1024*1024,POPUP_IMAGE_MAX_DIM=2560,popupAdmin={saved:null,imageUrl:null,loaded:!1},popupFormValue=()=>({title:$("popupTitleInput").value.trim(),body:$("popupBodyInput").value.replace(/\r\n?/g,`
`).trim(),image_url:popupAdmin.imageUrl||null});function popupFormDirty(){const t=popupAdmin.saved;if(!t)return!1;const e=popupFormValue();return e.title!==(t.title||"")||e.body!==(t.body||"")||e.image_url!==(t.image_url||null)}function showPopupImagePreview(t){$("popupImagePreviewImg").src=t?workerImageUrl(t):"",$("popupImagePreview").hidden=!t}function updatePopupBodyCount(){$("popupBodyCount").textContent=`${$("popupBodyInput").value.length} / 3000`}function renderPopupAdminStatus(){const t=popupAdmin.saved,e=$("popupToggleBtn");if(!t){$("popupAdminStatus").textContent="当前状态：读取失败",e.disabled=!0;return}const n=t.updated_at?`（内容最后修改：${formatCnTime(t.updated_at)} 国服时间）`:"";$("popupAdminStatus").textContent=t.enabled?`当前状态：已开启，访客打开首页会弹出${n}`:`当前状态：已关闭${n}`,e.textContent=t.enabled?"关闭弹窗":"开启弹窗",e.disabled=!1}function fillPopupAdminForm(t){$("popupTitleInput").value=t.title||"",$("popupBodyInput").value=t.body||"",popupAdmin.imageUrl=t.image_url||null,showPopupImagePreview(popupAdmin.imageUrl),updatePopupBodyCount()}async function refreshPopupAdmin(){$("popupAdminStatus").textContent="当前状态：读取中…",$("popupToggleBtn").disabled=!0,setMsg($("popupAdminMsg"),"");const t=await callWorker({action:"popup_admin_get",password:internalAdminPassword});if(!t||!t.ok){popupAdmin.saved=null,renderPopupAdminStatus(),setMsg($("popupAdminMsg"),t&&t.ok===!1&&!t.error?"登录状态失效了，重新登录内部入口后再试":"读取失败，刷新后再试（刚更新过 Worker 的话，确认一下新代码已经部署）");return}const e=popupAdmin.loaded&&popupFormDirty();popupAdmin.saved=t.popup,popupAdmin.loaded=!0,e||fillPopupAdminForm(t.popup),renderPopupAdminStatus(),e&&setMsg($("popupAdminMsg"),"有还没保存的修改")}function popupErrorText(t){return{empty:"标题、正文、配图至少要有一样",title_too_long:"标题太长了（最多 60 字）",body_too_long:"正文太长了（最多 3000 字）",bad_image_url:"配图地址不对，重新上传一次图片",rate_limited:"操作太频繁，歇一会儿再试"}[t]||"保存失败，请重试"}async function savePopupAdmin(t={}){const e=popupFormValue();if(!e.title&&!e.body&&!e.image_url)return setMsg($("popupAdminMsg"),popupErrorText("empty")),!1;const n=await callWorker({action:"popup_admin_save",password:internalAdminPassword,title:e.title,content:e.body,image_url:e.image_url,...t});return!n||!n.ok?(setMsg($("popupAdminMsg"),n?n.error?popupErrorText(n.error):"登录状态失效了，重新登录内部入口后再试":"连接失败，检查一下网络后再试"),!1):(popupAdmin.saved=n.popup,fillPopupAdminForm(n.popup),renderPopupAdminStatus(),setMsg($("popupAdminMsg"),""),!0)}async function compressPopupImage(t){const e=URL.createObjectURL(t);try{const n=await new Promise((s,i)=>{const o=new Image;o.onload=()=>s(o),o.onerror=()=>i(new Error("decode fail")),o.src=e}),a=[[POPUP_IMAGE_MAX_DIM,.9],[POPUP_IMAGE_MAX_DIM,.8],[2e3,.8],[1600,.75]];for(const[s,i]of a){const o=Math.min(1,s/Math.max(n.naturalWidth,n.naturalHeight)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(n.naturalWidth*o)),c.height=Math.max(1,Math.round(n.naturalHeight*o)),c.getContext("2d").drawImage(n,0,0,c.width,c.height);const p=await new Promise(m=>c.toBlob(m,"image/webp",i));if(!p)throw new Error("encode fail");const l=(await readAsDataURL(p)).split(",")[1];if(l.length<=7.5*1024*1024)return{base64:l,contentType:p.type||"image/webp"}}throw new Error("too large")}finally{URL.revokeObjectURL(e)}}function initPopupAdmin(){const t=$("popupImageInput"),e=$("popupImagePickBtn"),n=$("popupImageStatus");$("popupBodyInput").addEventListener("input",updatePopupBodyCount),e.addEventListener("click",()=>t.click()),$("popupImageRemoveBtn").addEventListener("click",()=>{popupAdmin.imageUrl=null,showPopupImagePreview(null)}),t.addEventListener("change",async()=>{const a=t.files&&t.files[0];if(t.value="",!!a){if(!/^image\//.test(a.type)){setMsg(n,"只能选图片");return}if(a.size>POPUP_IMAGE_MAX_BYTES){setMsg(n,`图片太大了（${(a.size/1024/1024).toFixed(1)}MB），限 50MB`);return}setMsg(n,"图片处理中…"),e.disabled=!0;try{const{base64:s,contentType:i}=await compressPopupImage(a);setMsg(n,"上传中…");const o=await callWorker({action:"upload_announcement_image",password:internalAdminPassword,image:s,content_type:i});if(!o||!o.ok)throw new Error(o&&o.error||"upload failed");popupAdmin.imageUrl=new URL(`image/${o.key}`,workerBase()).href,showPopupImagePreview(popupAdmin.imageUrl),setMsg(n,"已上传，记得点「保存」")}catch(s){setMsg(n,s.message==="decode fail"?"这张图浏览器打不开，换一张试试（或先转成 JPG / PNG）":s.message==="rate_limited"?"上传太频繁了（每小时 10 张），歇一会儿再试":"图片上传失败，请重试")}e.disabled=!1}}),$("popupSaveBtn").addEventListener("click",()=>withAdminBusy($("popupSaveBtn"),async()=>{await savePopupAdmin()&&showToast(popupAdmin.saved.enabled?"已保存，访客打开首页会看到新内容":"已保存（弹窗目前是关着的）")})),$("popupPreviewBtn").addEventListener("click",()=>{const a=popupFormValue();if(!a.title&&!a.body&&!a.image_url){setMsg($("popupAdminMsg"),"先写点内容再预览");return}openSitePopup(a,!0)}),$("popupToggleBtn").addEventListener("click",()=>withAdminBusy($("popupToggleBtn"),async()=>{const a=popupAdmin.saved;if(!a)return;const s=!a.enabled;if(setMsg($("popupAdminMsg"),""),s&&popupFormDirty()){if(!confirm(`有还没保存的修改，保存并开启弹窗吗？

（点「取消」什么都不做）`))return;await savePopupAdmin({enabled:!0})&&showToast("已保存并开启弹窗");return}const i=await callWorker({action:"popup_admin_set",password:internalAdminPassword,enabled:s});if(!i||!i.ok){setMsg($("popupAdminMsg"),adminErr(i,"切换失败，请重新登录内部入口后再试",{empty:"还没有内容，先写好并保存再开启"}));return}popupAdmin.saved=i.popup,renderPopupAdminStatus(),showToast(s?"弹窗公告已开启":"弹窗公告已关闭")}))}const HUAYU_ADMIN_MAX=2e4,HUAYU_MODE_NAME={open:"完全开放",decrypt:"仅开放解密",off:"彻底关闭"},HUAYU_MODE_NOTE={open:"访客可以写花语，也可以听花语",decrypt:"访客只能听花语（把花语还原成原文），不能写",off:"首页「更多」里不显示花语按钮，访客的请求一律拒绝"},HUAYU_ALGO_NOTE={1:"一代：「听花语：」+ 一串草木字，最短（中文大约一字换一字多一点）",2:"二代：写成一段像散文的句子，看起来像普通的花语短文，长度约是一代的四五倍"},HUAYU_ADMIN_ERRORS={auth:"密码失效了，请重新登录内部入口",bad_key:"解不开：密钥不对，或者花语被改动过",need_key:"这段花语用的是自定义密钥，先把密钥填上",bad_key_input:"密钥不能为空，最长 128 个字",bad_mode:"开关的值不对，刷新页面再试",bad_algo:"算法版本不对，刷新页面再试",no_key:"还没有站点密钥，先在上面设置一个",too_long:"太长了，压缩后超过了 64KB",bad_input:"内容有问题，刷新页面再试",empty:"先输入要转换的内容",net:"连接失败，检查一下网络后再试"},huayuAdmin={clearArmedAt:0,resultCopy:"",detectTimer:0};function setHuayuSeg(t,e){$(t).querySelectorAll("input").forEach(n=>{n.checked=n.value===String(e)}),alarmSegSync(t)}const huayuSegValue=t=>$(t).querySelector("input:checked")?.value;function renderHuayuAdmin(t){setHuayuSeg("huayuModeSeg",t.mode),setHuayuSeg("huayuAlgoSeg",t.algo),setHuayuSeg("huayuAdminAlgoSeg",t.algo),$("huayuModeNote").textContent=HUAYU_MODE_NOTE[t.mode]||"",$("huayuAlgoNote").textContent=HUAYU_ALGO_NOTE[t.algo]||"",$("huayuAdminStatus").textContent=`当前状态：${HUAYU_MODE_NAME[t.mode]||t.mode} · ${t.algo===1?"一代":"二代"}算法`+(t.updatedAt?`（${formatCnTime(t.updatedAt)} 更新）`:"");const e=$("huayuKeyInput");document.activeElement!==e&&(e.value=t.key||""),$("huayuOldText").textContent=t.oldCount?`保留着 ${t.oldCount} 个旧密钥，用它们写的花语仍能解开`:"没有保留旧密钥",$("huayuClearOldBtn").hidden=!t.oldCount,applyHuayuMode(t)}async function refreshHuayuAdmin(){$("huayuAdminStatus").textContent="当前状态：读取中…",setMsg($("huayuSettingMsg"),""),loadHuayuJs().catch(()=>{});const t=await callWorker({action:"huayu_admin_get",password:internalAdminPassword});if(!t||!t.ok){$("huayuAdminStatus").textContent="当前状态："+adminErr(t,"读取失败，请重新登录内部入口后再试");return}renderHuayuAdmin(t)}async function saveHuayuAdmin(t,e,n){const a=$("huayuSettingMsg");setMsg(a,""),n&&(n.disabled=!0);const s=await callWorker({action:"huayu_admin_set",password:internalAdminPassword,...t});return n&&(n.disabled=!1),!s||!s.ok?(setMsg(a,adminErr(s,"保存失败，请重新登录内部入口后再试",HUAYU_ADMIN_ERRORS)),!1):(renderHuayuAdmin(s),showToast(e),!0)}function syncHuayuAdminKeySeg(){alarmSegSync("huayuAdminKeySeg");const t=huayuSegValue("huayuAdminKeySeg")==="custom";return $("huayuAdminCustomKey").hidden=!t,t}function syncHuayuAdminInput(){clearTimeout(huayuAdmin.detectTimer),$("huayuAdminInput").value.length>HUAYU_DETECT_NOW?huayuAdmin.detectTimer=setTimeout(syncHuayuAdminInputNow,300):syncHuayuAdminInputNow()}function syncHuayuAdminInputNow(){const t=$("huayuAdminInput").value,e=window.HJHuayu;if(!e||!t){$("huayuAdminCount").textContent=t?`${t.length} 字`:"";return}const n=e.detect(t);if(!n.ok){$("huayuAdminCount").textContent=`${e.countChars(t)} 字`;return}$("huayuAdminCount").textContent=`${e.ALGO_NAMES[n.algo]}花语 ${e.countChars(t)} 字`,n.kind===1&&(setHuayuSeg("huayuAdminKeySeg","custom"),syncHuayuAdminKeySeg())}function showHuayuAdminResult(t,e,n,a){$("huayuAdminResultLabel").textContent=t,$("huayuAdminResultMeta").textContent=n,$("huayuAdminResultText").textContent=e,$("huayuAdminCopyBtn").textContent=a,huayuAdmin.resultCopy=e,$("huayuAdminResult").hidden=!1}async function huayuAdminConvert(t,e){const n=$("huayuAdminMsg");setMsg(n,"");try{await loadHuayuJs()}catch{setMsg(n,"花语脚本 huayu.js 没有加载成功（没上传或被缓存挡住），刷新页面再试");return}const a=window.HJHuayu,s=$("huayuAdminInput").value,i=syncHuayuAdminKeySeg(),o=i?$("huayuAdminCustomKey").value.trim():"",c={password:internalAdminPassword};if(!s.trim()){setMsg(n,HUAYU_ADMIN_ERRORS.empty);return}if(i&&!o){setMsg(n,"选了自定义密钥，先把密钥填上"),$("huayuAdminCustomKey").focus();return}e.disabled=!0;try{if(t==="seal"){if(a.countChars(s)>HUAYU_ADMIN_MAX){setMsg(n,`太长了，一次最多 ${HUAYU_ADMIN_MAX} 字`);return}const m=Number(huayuSegValue("huayuAdminAlgoSeg"))||2,v=await a.encrypt(s,{algo:m,post:callWorker,auth:c,key:o});if(!v.ok){setMsg(n,adminErr(v.error==="net"?null:v,"加密失败",HUAYU_ADMIN_ERRORS));return}showHuayuAdminResult("花语",v.text,`${a.ALGO_NAMES[m]} · 原文 ${v.plainChars} 字 → 花语 ${v.cipherChars} 字 · ${i?"自定义密钥":"站点密钥"}`,"复制花语");return}const p=await a.decrypt(s,{post:callWorker,auth:c,key:o});if(!p.ok){p.error==="need_key"&&(setHuayuSeg("huayuAdminKeySeg","custom"),syncHuayuAdminKeySeg(),$("huayuAdminCustomKey").focus()),setMsg(n,HUAYU_ERRORS[p.error]&&!HUAYU_ADMIN_ERRORS[p.error]?HUAYU_ERRORS[p.error]:adminErr(p.error==="net"?null:p,"解密失败",HUAYU_ADMIN_ERRORS));return}const l=p.kind===1?"自定义密钥":p.old?"旧的站点密钥":"当前站点密钥";showHuayuAdminResult("原文",p.text,`${a.ALGO_NAMES[p.algo]}花语 ${a.countChars(s)} 字 → 原文 ${a.countChars(p.text)} 字 · ${l}`,"复制原文")}finally{e.disabled=!1}}function initHuayuAdmin(){$("huayuModeSeg").addEventListener("change",async t=>{const e=t.target.value;alarmSegSync("huayuModeSeg"),$("huayuModeNote").textContent=HUAYU_MODE_NOTE[e]||"",await saveHuayuAdmin({mode:e},`花语访客端：${HUAYU_MODE_NAME[e]}`)||refreshHuayuAdmin()}),$("huayuAlgoSeg").addEventListener("change",async t=>{const e=Number(t.target.value);alarmSegSync("huayuAlgoSeg"),$("huayuAlgoNote").textContent=HUAYU_ALGO_NOTE[e]||"",await saveHuayuAdmin({algo:e},`访客写花语改用${e===1?"一代":"二代"}算法`)||refreshHuayuAdmin()}),$("huayuKeyShow").addEventListener("change",t=>{$("huayuKeyInput").type=t.target.checked?"text":"password"}),$("huayuKeySaveBtn").addEventListener("click",t=>{const e=$("huayuKeyInput").value.trim();if(!e){setMsg($("huayuSettingMsg"),"密钥不能为空");return}saveHuayuAdmin({key:e},"站点密钥已保存",t.currentTarget)}),$("huayuKeyInput").addEventListener("keydown",t=>{t.key==="Enter"&&$("huayuKeySaveBtn").click()}),$("huayuKeyRandomBtn").addEventListener("click",t=>{saveHuayuAdmin({randomKey:!0},"已换成一个随机密钥",t.currentTarget)}),$("huayuClearOldBtn").addEventListener("click",t=>{const e=t.currentTarget;if(Date.now()-huayuAdmin.clearArmedAt>4e3){huayuAdmin.clearArmedAt=Date.now(),e.textContent="再点一次确认清除",setTimeout(()=>{Date.now()-huayuAdmin.clearArmedAt>=4e3&&(e.textContent="清除旧密钥")},4100);return}huayuAdmin.clearArmedAt=0,e.textContent="清除旧密钥",saveHuayuAdmin({clearOld:!0},"旧密钥已清除",e)}),$("huayuAdminAlgoSeg").addEventListener("change",()=>alarmSegSync("huayuAdminAlgoSeg")),$("huayuAdminKeySeg").addEventListener("change",syncHuayuAdminKeySeg),$("huayuAdminInput").addEventListener("input",()=>{syncHuayuAdminInput(),setMsg($("huayuAdminMsg"),"")}),$("huayuAdminSealBtn").addEventListener("click",t=>huayuAdminConvert("seal",t.currentTarget)),$("huayuAdminOpenBtn").addEventListener("click",t=>huayuAdminConvert("open",t.currentTarget)),$("huayuAdminCopyBtn").addEventListener("click",()=>{copyText(huayuAdmin.resultCopy,"已复制","复制失败，请手动选中复制")})}const ADMIN_PANELS_HTML=`
<div class="gate-card admin-card" id="lockdownPanel" hidden>
<h2>分享功能开关</h2>
<p class="hint">关闭后网页变成纯静态展示：复制花街介绍不再附联系方式，活动群、场地使用登记、活动问卷、点赞都会提示「功能未开放」。</p>
<p class="hint" id="lockdownStatus">当前状态：加载中…</p>
<button id="lockdownToggleBtn">切换</button>
<p class="form-msg" id="lockdownMsg" hidden></p>
</div>
<div class="gate-card admin-card" id="captchaPanel" hidden>
<h2>机器人验证开关</h2>
<p class="hint">关闭后全站取消人机验证：活动群、花街介绍、复制联系方式、场地使用登记、活动问卷都不再弹验证，Worker 端也一律放行。<br>仅用于压力测试，测完记得开回来。</p>
<p class="hint" id="captchaStatus">当前状态：加载中…</p>
<button id="captchaToggleBtn">切换</button>
<p class="form-msg" id="captchaSwitchMsg" hidden></p>
</div>
<div class="gate-card admin-card" id="starlightPanel" hidden>
<h2>星芒节时间覆盖</h2>
<p class="hint">星芒节期间游戏内全境强制下雪，而天气算法不感知活动。<br>在这里按国服时间（UTC+8）设置活动时段，时段内所有天气档都会显示为「小雪」。</p>
<p class="hint" id="starlightStatus">当前状态：读取中…</p>
<div class="starlight-fields">
<label class="starlight-field">
<span>从（国服时间）</span>
<input type="datetime-local" id="starlightStart">
</label>
<span class="starlight-sep" aria-hidden="true">—</span>
<label class="starlight-field">
<span>到（国服时间）</span>
<input type="datetime-local" id="starlightEnd">
</label>
</div>
<div class="starlight-actions">
<button id="starlightSaveBtn">保存</button>
<button id="starlightClearBtn" type="button">清除覆盖</button>
</div>
<p class="form-msg" id="starlightMsg" hidden></p>
</div>
<div class="gate-card admin-card ticket-admin" id="ticketAdminPanel" hidden>
<h2>活动购票管理</h2>
<p class="hint" id="ticketAdminStatus">读取中…</p>
<div class="tabs ticket-admin-tabs" id="ticketAdminTabs" role="tablist" aria-label="购票管理">
<button type="button" class="tab-btn is-active" role="tab" data-ta-tab="settings" aria-selected="true">购票管理</button>
<button type="button" class="tab-btn" role="tab" data-ta-tab="orders" aria-selected="false">详细订单</button>
<button type="button" class="tab-btn" role="tab" data-ta-tab="stats" aria-selected="false">售票统计</button>
</div>
<div class="ticket-admin-stats" id="ticketAdminStats"></div>
<div class="ticket-admin-actions ta-topbar">
<button type="button" id="ticketExportBtn">导出 Excel</button>
<button type="button" id="ticketRefreshBtn" class="ticket-btn-ghost">刷新</button>
</div>
<p class="form-msg" id="ticketAdminMsg" hidden></p>
<div class="ta-pane" data-ta-pane="settings">
<section class="ta-group">
<h3 class="ta-group-title">基本</h3>
<div class="ticket-admin-row">
<label class="ticket-admin-key" for="ticketTitleInput">购票页标题</label>
<span class="ticket-limit-edit ticket-title-edit">
<input type="text" id="ticketTitleInput" maxlength="60" placeholder="留空则恢复默认标题">
<button type="button" id="ticketTitleSaveBtn">保存</button>
</span>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">标题后缀「（测试）」</span>
<button type="button" class="ticket-switch" id="ticketTestBtn" aria-pressed="false">—</button>
</div>
<p class="ticket-sched-note ticket-title-preview" id="ticketTitlePreview" hidden></p>
<div class="ticket-admin-row">
<span class="ticket-admin-key">购票开放</span>
<button type="button" class="ticket-switch" id="ticketOpenBtn" aria-pressed="false">—</button>
</div>
<div class="ticket-admin-row ticket-sched-row">
<span class="ticket-admin-key">定时开关（国服时间）</span>
<span class="ticket-sched-edit">
<label for="ticketOpenAtInput">开启</label>
<input type="datetime-local" id="ticketOpenAtInput">
<label for="ticketCloseAtInput">关闭</label>
<input type="datetime-local" id="ticketCloseAtInput">
<button type="button" id="ticketSchedSaveBtn">保存</button>
<button type="button" id="ticketSchedClearBtn" class="ticket-btn-ghost">清除</button>
</span>
</div>
<p class="ticket-sched-note" id="ticketSchedNote" hidden></p>
<div class="ticket-admin-row">
<span class="ticket-admin-key">持票 id 可待定</span>
<button type="button" class="ticket-switch" id="ticketPendingBtn" aria-pressed="false">—</button>
</div>
<div class="ticket-admin-row">
<label class="ticket-admin-key" for="ticketPerPersonInput">单人限购（张）</label>
<span class="ticket-limit-edit">
<input type="number" id="ticketPerPersonInput" min="1" max="20" step="1" inputmode="numeric">
<button type="button" id="ticketPerPersonSaveBtn">保存</button>
</span>
</div>
<div class="ticket-admin-row">
<label class="ticket-admin-key" for="ticketCooldownInput">再次购票间隔（分钟，0 = 不限）</label>
<span class="ticket-limit-edit">
<input type="number" id="ticketCooldownInput" min="0" max="1440" step="1" inputmode="numeric">
<button type="button" id="ticketCooldownSaveBtn">保存</button>
</span>
</div>
</section>
<section class="ta-group">
<h3 class="ta-group-title">票额与刷新</h3>
<p class="ta-group-hint">两次刷新之间叫「一轮」，每一轮开始时定下票额；没卖完的票不结转到下一轮（需要的话用「临时加票」手动加上）。</p>
<div class="ta-round" id="ticketRoundBox"></div>
<div class="ticket-admin-row">
<label class="ticket-admin-key" for="ticketExtraInput">临时加票（只对当前这一轮）</label>
<span class="ticket-limit-edit">
<input type="number" id="ticketExtraInput" min="1" max="100000" step="1" inputmode="numeric" placeholder="张数">
<button type="button" id="ticketExtraAddBtn">加上</button>
<button type="button" id="ticketExtraSubBtn" class="ticket-btn-ghost">减去</button>
<button type="button" id="ticketExtraClearBtn" class="ticket-btn-ghost">清零</button>
</span>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">每日刷新</span>
<button type="button" class="ticket-switch" id="ticketDailyBtn" aria-pressed="false">—</button>
</div>
<div class="ticket-admin-row ta-daily-only">
<label class="ticket-admin-key" for="ticketResetInput">每日刷新时间（国服时间）</label>
<span class="ticket-limit-edit">
<input type="time" id="ticketResetInput" step="60">
<button type="button" id="ticketResetSaveBtn">保存</button>
</span>
</div>
<div class="ticket-admin-row ta-daily-only">
<label class="ticket-admin-key" for="ticketLimitInput">每日票额（张）</label>
<span class="ticket-limit-edit">
<input type="number" id="ticketLimitInput" min="0" max="100000" step="1" inputmode="numeric">
<label class="audience-opt ta-inline-opt" id="ticketLimitCurWrap"><input type="checkbox" id="ticketLimitCurChk" checked><span>当前这一轮也改</span></label>
<button type="button" id="ticketLimitSaveBtn">保存</button>
</span>
</div>
<div class="ta-sub">
<p class="ta-sub-title">自定义刷新点（年月日 时:分，国服时间）</p>
<p class="ta-group-hint">到了这个时间开始新的一轮，票额按这里填的。可以和每日刷新一起用；同一分钟两个都有时按这里的。</p>
<div class="ta-points" id="ticketPointsList"></div>
<div class="ta-sub-actions">
<button type="button" id="ticketPointAddBtn" class="ticket-btn-ghost">+ 添加刷新点</button>
<button type="button" id="ticketPointSaveBtn">保存刷新点</button>
<button type="button" id="ticketPointResetBtn" class="ticket-btn-ghost">撤销修改</button>
</div>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">下一次刷新：<b id="ticketNextInfo">—</b></span>
<span class="ticket-limit-edit">
<input type="number" id="ticketNextInput" min="0" max="100000" step="1" inputmode="numeric" aria-label="下一次刷新的票额">
<button type="button" id="ticketNextSaveBtn">保存</button>
<button type="button" id="ticketNextResetBtn" class="ticket-btn-ghost" hidden>恢复默认</button>
</span>
</div>
<p class="ticket-sched-note" id="ticketNextNote" hidden></p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">购票页显示</h3>
<div class="ticket-admin-row">
<label class="ticket-admin-key" for="ticketRemainModeSelect">余票</label>
<select id="ticketRemainModeSelect">
<option value="full">完全显示（具体张数）</option>
<option value="range">显示大致范围</option>
<option value="hidden">不显示</option>
</select>
</div>
<p class="ticket-sched-note ticket-title-preview" id="ticketRemainPreview" hidden></p>
<div class="ticket-admin-row">
<span class="ticket-admin-key">定时开启 / 关闭时间</span>
<button type="button" class="ticket-switch" id="ticketShowSchedBtn" aria-pressed="false">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">刷新时间</span>
<button type="button" class="ticket-switch" id="ticketShowResetBtn" aria-pressed="false">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">超额标记对客户显示</span>
<button type="button" class="ticket-switch" data-ta-flag="showOver" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="客户能看到自己的单是超额登记" data-toast-off="超额标记不再对客户显示">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">重复标记对客户显示</span>
<button type="button" class="ticket-switch" data-ta-flag="showDup" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="客户能看到自己的登记和别人重复" data-toast-off="重复标记不再对客户显示">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">购票留言栏</span>
<button type="button" class="ticket-switch" data-ta-flag="messageOn" data-on="有（点击去掉）" data-off="没有（点击加上）"
data-toast-on="购票页加上了留言栏" data-toast-off="购票页去掉了留言栏">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">显示网站标题（标题、地址、时间天气）</span>
<button type="button" class="ticket-switch" data-ta-flag="showBrand" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="购票页显示网站标题" data-toast-off="购票页不显示网站标题、地址和时间天气">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">与首页隔离（没有返回按钮，首页没有入口）</span>
<button type="button" class="ticket-switch" data-ta-flag="isolated" data-on="已隔离（点击取消）" data-off="不隔离（点击隔离）"
data-toast-on="购票页已与首页隔离" data-toast-off="购票页已取消隔离"
data-confirm-on="与首页隔离吗？&#10;&#10;购票页没有返回按钮，首页不再显示购票入口，只能拿购票链接进入；停留时间限制同时失效。">—</button>
</div>
<div class="ticket-admin-row ta-idle-row">
<label class="ticket-admin-key" for="ticketIdleInput">停留超过几分钟跳回首页（0 = 不限制）</label>
<span class="ticket-limit-edit">
<input type="number" id="ticketIdleInput" min="0" max="1440" step="1" inputmode="numeric">
<button type="button" id="ticketIdleSaveBtn">保存</button>
</span>
</div>
<div class="ticket-admin-row ta-idle-row">
<span class="ticket-admin-key">给客户显示剩余时间</span>
<button type="button" class="ticket-switch" data-ta-flag="showIdle" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="购票页显示剩余时间" data-toast-off="购票页不显示剩余时间">—</button>
</div>
<p class="ticket-sched-note" id="ticketIdleIsoNote" hidden>现在「与首页隔离」开着，停留时间限制不生效。</p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">购票须知</h3>
<div class="ticket-admin-row">
<span class="ticket-admin-key">显示购票须知</span>
<button type="button" class="ticket-switch" data-ta-flag="guideOn" data-on="显示（点击关闭）" data-off="不显示（点击打开）"
data-toast-on="购票须知已打开" data-toast-off="购票须知已关闭：首页入口直接进购票页，购票页也没有须知按钮">—</button>
</div>
<details class="ta-guide" id="ticketGuideEditor">
<summary>编辑购票须知正文 <span id="ticketGuideState"></span></summary>
<div class="ta-guide-help">
<p>每行开头的写法决定样式（其余每一行就是一段文字，空行只是分隔）：</p>
<ul>
<li><code>^ 文字</code> 标题上方的小字　<code># 文字</code> 大标题　<code>## 文字</code> 小节标题</li>
<li><code>[票价] 名称 | 价格 | 小标签 | 时间</code> 票价卡片（连着写几行就并排几张）</li>
<li><code>### 标题</code> 卡片（连着的几张并排，卡片里可以写段落和列表，到下一个 <code>##</code> 为止）</li>
<li><code>1. 文字</code> 有序列表　<code>- 文字</code> 无序列表</li>
<li><code>Q1：问题</code> 问答（下面几行是回答，到下一个问题或 <code>##</code> 为止）</li>
<li><code>&gt; 文字</code> 居中的结尾说明　<code>-- 文字</code> 右下角署名　<code>---</code> 分隔线</li>
<li>行内：<code>**加粗**</code>　<code>__下划线__</code>　http 开头的网址自动变成链接</li>
</ul>
</div>
<textarea id="ticketGuideInput" maxlength="12000" spellcheck="false" aria-label="购票须知正文"></textarea>
<div class="ta-sub-actions">
<button type="button" id="ticketGuideSaveBtn">保存须知</button>
<button type="button" id="ticketGuideResetBtn" class="ticket-btn-ghost">恢复默认</button>
</div>
<p class="form-msg" id="ticketGuideMsg" hidden></p>
<p class="ta-sub-title">预览（访客看到的样子）</p>
<div class="ta-guide-preview" id="ticketGuidePreview"></div>
</details>
</section>
<section class="ta-group">
<h3 class="ta-group-title">只读端（查看密码登录的「购票情况」）</h3>
<div class="ticket-admin-row">
<span class="ticket-admin-key">「购票情况」查看页</span>
<button type="button" class="ticket-switch" id="ticketViewerBtn" aria-pressed="false">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">显示「售票统计」</span>
<button type="button" class="ticket-switch" data-ta-flag="viewerStats" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="只读端可以看售票统计" data-toast-off="只读端看不到售票统计了">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">显示「活动问卷」（只读）</span>
<button type="button" class="ticket-switch" data-ta-flag="viewerSurvey" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="只读端可以看活动问卷（只读，下次登录生效）" data-toast-off="只读端看不到活动问卷了">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">可以勾选取票</span>
<button type="button" class="ticket-switch" data-ta-flag="viewerPickup" data-on="可以（点击关闭）" data-off="不可以（点击打开）"
data-toast-on="只读端可以勾选取票了（操作会记日志）" data-toast-off="只读端不能勾选取票了">—</button>
</div>
<div class="ticket-admin-row">
<label class="ticket-admin-key" for="ticketLogHoursInput">操作日志每几小时合并成一条</label>
<span class="ticket-limit-edit">
<input type="number" id="ticketLogHoursInput" min="1" max="720" step="1" inputmode="numeric">
<button type="button" id="ticketLogHoursSaveBtn">保存</button>
</span>
</div>
<div class="ta-sub-actions"><button type="button" id="ticketLogBtn" class="ticket-btn-ghost">查看只读端操作日志</button></div>
<div class="fb-admin-list ta-log" id="ticketLogList" hidden></div>
</section>
<section class="ta-group ta-danger">
<h3 class="ta-group-title">数据</h3>
<div class="ta-sub-actions">
<button type="button" id="ticketClearBtn" class="ticket-btn-danger">清空购票数据</button>
</div>
</section>
</div>
<div class="ta-pane" data-ta-pane="orders" hidden>
<div class="ticket-admin-list-head">
<label for="ticketDaySelect">轮次</label>
<select id="ticketDaySelect"></select>
<input type="search" id="ticketSearchInput" class="ta-search" placeholder="搜联系方式 / 持票人 / 序号" autocomplete="off" aria-label="搜索订单">
<span class="ticket-legend"><i class="lg-over"></i>超额 <i class="lg-dup"></i>重复 <i class="lg-void"></i>已作废 <i class="lg-picked"></i>已取票</span>
</div>
<div class="venue-edit ta-edit" id="ticketEditBox" hidden></div>
<div class="ticket-table-wrap">
<table class="ticket-table ta-orders">
<thead><tr><th>序号</th><th>联系方式</th><th>数量</th><th>持票人</th><th>留言</th><th>时间</th><th class="tt-actions-th">操作</th><th>取票</th></tr></thead>
<tbody id="ticketAdminTbody"></tbody>
</table>
</div>
</div>
<div class="ta-pane" data-ta-pane="stats" hidden>
<div class="ticket-admin-list-head">
<label for="ticketStatsRound">范围</label>
<select id="ticketStatsRound"></select>
</div>
<div class="ta-stats" id="ticketStatsBody"></div>
</div>
</div>
<div class="gate-card admin-card ticket-admin feedback-admin venue-admin" id="venueAdminPanel" hidden>
<h2>场地预约</h2>
<p class="hint" id="venueAdminStatus">读取中…</p>
<div class="fb-admin-filters">
<select id="venueFilterState" aria-label="按状态筛选">
<option value="active" selected>有效</option>
<option value="void">已作废</option>
<option value="">全部状态</option>
</select>
<select id="venueFilterTime" aria-label="按预约日期筛选">
<option value="" selected>全部日期</option>
<option value="upcoming">今天及以后</option>
<option value="past">已过去</option>
</select>
<button type="button" id="venueRefreshBtn" class="ticket-btn-ghost">刷新</button>
<button type="button" id="venueNewBtn">新增预约</button>
</div>
<p class="form-msg" id="venueAdminMsg" hidden></p>
<div class="venue-edit" id="venueEditBox" hidden>
<h3 class="venue-edit-title" id="venueEditTitle">新增预约</h3>
<form id="venueAdminForm" novalidate autocomplete="off">
<div class="venue-form" id="venueAdminFields"></div>
<div class="venue-edit-actions">
<button type="submit" id="venueAdminSaveBtn">保存</button>
<button type="button" id="venueAdminCancelBtn" class="ticket-btn-ghost">取消</button>
</div>
<p class="form-msg" id="venueAdminFormMsg" hidden></p>
</form>
</div>
<div class="fb-admin-list venue-admin-list" id="venueAdminList"></div>
</div>
<div class="gate-card admin-card ticket-admin feedback-admin survey-admin" id="surveyAdminPanel" hidden>
<h2>活动问卷</h2>
<p class="hint" id="surveyAdminStatus">读取中…</p>
<div class="ticket-admin-row">
<span class="ticket-admin-key">问卷开放（访客可以填写）</span>
<button type="button" class="ticket-switch" id="surveyOpenBtn" aria-pressed="false">—</button>
</div>
<p class="ticket-sched-note" id="surveyLockNote" hidden>「分享功能开关」现在是关闭的，访客暂时提交不了问卷（开回来后自动恢复）。</p>
<div class="fb-admin-filters">
<select id="surveyViewSelect" aria-label="查看方式">
<option value="stats" selected>统计汇总</option>
<option value="list">逐份查看</option>
</select>
<select id="surveyFilterState" aria-label="按状态筛选" hidden>
<option value="active" selected>有效</option>
<option value="void">已作废</option>
<option value="">全部</option>
</select>
<button type="button" id="surveyRefreshBtn" class="ticket-btn-ghost">刷新</button>
<button type="button" id="surveyExportBtn">导出 Excel</button>
<button type="button" id="surveyCopyLinkBtn" class="ticket-btn-ghost">复制问卷链接</button>
</div>
<p class="form-msg" id="surveyAdminMsg" hidden></p>
<div class="survey-stats" id="surveyAdminStats"></div>
<div class="fb-admin-list survey-admin-list" id="surveyAdminList" hidden></div>
</div>
<div class="gate-card admin-card ticket-admin feedback-admin" id="feedbackAdminPanel" hidden>
<h2>反馈建议箱</h2>
<p class="hint" id="feedbackAdminStatus">读取中…</p>
<div class="fb-admin-filters">
<select id="feedbackFilterCat" aria-label="按类别筛选">
<option value="">全部类别</option>
</select>
<select id="feedbackFilterState" aria-label="按处理状态筛选">
<option value="">全部状态</option>
<option value="open" selected>未处理</option>
<option value="done">已处理</option>
</select>
<button type="button" id="feedbackRefreshBtn" class="ticket-btn-ghost">刷新</button>
</div>
<p class="form-msg" id="feedbackAdminMsg" hidden></p>
<div class="fb-admin-list" id="feedbackAdminList"></div>
</div>
<div class="gate-card admin-card" id="popupAdminPanel" hidden>
<h2>弹窗公告</h2>
<p class="hint">开启后，访客打开网站首页时弹出这条公告（每次打开网站最多弹一次；访客可以点「今天不再显示」）。<br>改了标题 / 正文 / 配图并保存后，所有人都会重新看到一次。</p>
<p class="hint" id="popupAdminStatus">当前状态：加载中…</p>
<button type="button" id="popupToggleBtn" disabled>切换</button>
<label class="popup-admin-label" for="popupTitleInput">标题（选填）</label>
<input type="text" id="popupTitleInput" maxlength="60" placeholder="例如：中秋月轮祭 活动回顾上线啦" autocomplete="off">
<label class="popup-admin-label" for="popupBodyInput">正文</label>
<textarea id="popupBodyInput" maxlength="3000" placeholder="写点什么…（可以换行；http 开头的网址会自动变成链接）"></textarea>
<p class="popup-admin-count" id="popupBodyCount">0 / 3000</p>
<div class="announcement-image-field">
<input type="file" id="popupImageInput" accept="image/*" hidden>
<button type="button" id="popupImagePickBtn" class="pill-btn-outline">配图（限 50MB）</button>
<span class="form-msg" id="popupImageStatus" hidden></span>
<div class="announcement-image-preview" id="popupImagePreview" hidden>
<img id="popupImagePreviewImg" alt="">
<button type="button" id="popupImageRemoveBtn" aria-label="移除图片">×</button>
</div>
</div>
<p class="hint popup-admin-note">配图只能一张。上传前会自动压成 WebP（长边不超过 2560 像素），访客手机上也打得开；动图会变成静态图。</p>
<div class="popup-admin-btns">
<button type="button" id="popupSaveBtn">保存</button>
<button type="button" id="popupPreviewBtn" class="pill-btn-outline">预览</button>
</div>
<p class="form-msg" id="popupAdminMsg" hidden></p>
</div>
<div class="gate-card admin-card huayu-admin" id="huayuAdminPanel" data-close-only-x="1" hidden>
<h2>花语加密</h2>
<p class="hint">首页右上角「更多」里的花朵按钮「听得花间语」。明文在浏览器里压缩后交给后端加密，再写成花语；<br>密钥只保存在后端（Worker），网站不保存任何明文和花语。</p>
<p class="hint" id="huayuAdminStatus">当前状态：读取中…</p>
<section class="ta-group">
<h3 class="ta-group-title">访客端</h3>
<div class="alarm-seg" id="huayuModeSeg">
<label><input type="radio" name="huayuMode" value="open"><span>完全开放</span></label>
<label><input type="radio" name="huayuMode" value="decrypt"><span>仅开放解密</span></label>
<label><input type="radio" name="huayuMode" value="off"><span>彻底关闭</span></label>
</div>
<p class="ta-group-hint" id="huayuModeNote"></p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">加密算法</h3>
<div class="alarm-seg" id="huayuAlgoSeg">
<label><input type="radio" name="huayuAlgo" value="1"><span>一代算法（V1）</span></label>
<label><input type="radio" name="huayuAlgo" value="2"><span>二代算法（V2）</span></label>
</div>
<p class="ta-group-hint" id="huayuAlgoNote"></p>
<p class="ta-group-hint">访客写花语时用这里选定的算法；听花语时一代、二代都能自动认出来，换了算法，以前的花语照样能解。</p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">站点密钥</h3>
<p class="ta-group-hint">访客写的花语、这里选「站点密钥」写的花语都用它加密。<br>换了密钥以后，以前的花语仍能用旧密钥解开（最多保留 5 个）。</p>
<div class="hy-key-row">
<input type="password" id="huayuKeyInput" maxlength="128" autocomplete="off" spellcheck="false" placeholder="站点密钥">
<button type="button" id="huayuKeySaveBtn">保存</button>
</div>
<div class="hy-key-tools">
<label class="audience-opt" for="huayuKeyShow"><input type="checkbox" id="huayuKeyShow"><span>显示密钥</span></label>
<button type="button" id="huayuKeyRandomBtn" class="pill-btn-outline">换成随机密钥</button>
</div>
<div class="hy-old-row">
<span id="huayuOldText"></span>
<button type="button" id="huayuClearOldBtn" class="pill-btn-outline" hidden>清除旧密钥</button>
</div>
<p class="form-msg" id="huayuSettingMsg" hidden></p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">转换</h3>
<p class="ta-group-hint">不受访客端开关限制；解密时自动认出一代还是二代。选「自定义密钥」写的花语，访客要自己填上密钥才听得懂（寻宝、彩蛋用）。</p>
<textarea id="huayuAdminInput" maxlength="400000" spellcheck="false" placeholder="明文或花语"></textarea>
<p class="popup-admin-count" id="huayuAdminCount"></p>
<div class="alarm-seg" id="huayuAdminAlgoSeg">
<label><input type="radio" name="huayuAdminAlgo" value="1"><span>加密用一代</span></label>
<label class="is-active"><input type="radio" name="huayuAdminAlgo" value="2" checked><span>加密用二代</span></label>
</div>
<div class="alarm-seg" id="huayuAdminKeySeg">
<label class="is-active"><input type="radio" name="huayuAdminKey" value="site" checked><span>站点密钥</span></label>
<label><input type="radio" name="huayuAdminKey" value="custom"><span>自定义密钥</span></label>
</div>
<input type="text" id="huayuAdminCustomKey" class="hy-custom-key" maxlength="128" autocomplete="off" spellcheck="false" placeholder="自定义密钥" hidden>
<div class="popup-admin-btns">
<button type="button" id="huayuAdminSealBtn">加密</button>
<button type="button" id="huayuAdminOpenBtn">解密</button>
</div>
<p class="form-msg" id="huayuAdminMsg" hidden></p>
<div class="huayu-result" id="huayuAdminResult" hidden>
<div class="huayu-result-head">
<span class="huayu-result-label" id="huayuAdminResultLabel"></span>
<span class="huayu-result-meta" id="huayuAdminResultMeta"></span>
</div>
<div class="huayu-result-text" id="huayuAdminResultText"></div>
<div class="huayu-btns">
<button type="button" id="huayuAdminCopyBtn">复制</button>
</div>
</div>
</section>
</div>
<div class="gate-card admin-card" id="postAnnouncementPanel" hidden>
<h2>发布公告</h2>
<textarea id="announcementText" placeholder="写点什么…"></textarea>
<div class="announce-audience">
<label class="audience-opt" for="announceShowA">
<input type="checkbox" id="announceShowA" checked><span>给 A 显示</span>
</label>
<label class="audience-opt" for="announceShowB">
<input type="checkbox" id="announceShowB" checked><span>给 B 显示</span>
</label>
</div>
<div class="announcement-image-field">
<input type="file" id="announcementImageInput" accept="image/*" hidden>
<button type="button" id="announcementImagePickBtn" class="pill-btn-outline">配图</button>
<span class="form-msg" id="announcementImageStatus" hidden></span>
<div class="announcement-image-preview" id="announcementImagePreview" hidden>
<img id="announcementImagePreviewImg" alt="">
<button type="button" id="announcementImageRemoveBtn" aria-label="移除图片">×</button>
</div>
</div>
<button id="postAnnouncementBtn">发布</button>
<button id="cancelEditAnnouncementBtn" type="button" class="cancel-edit-btn" hidden>取消编辑</button>
<p class="form-msg" id="postAnnouncementMsg" hidden></p>
</div>
`;function mountAdminPanels(){$("adminPanelStash").innerHTML=ADMIN_PANELS_HTML}mountAdminPanels(),initInternal(),initAdminPanels(),initLockdownToggle(),initCaptchaSwitch(),initStarlightPanel(),initTicketAdmin(),initViewerPills(),initFeedbackAdmin(),typeof buildVenueForm=="function"?initVenueAdmin():console.error("[场地预约] venue.js 没有加载成功，管理页的「场地预约」不可用"),window.HJ_SURVEY_READY?initSurveyAdmin():console.error("[活动问卷] survey.js 没有加载成功，管理页的「活动问卷」不可用"),initPostAnnouncement(),initAnnouncementImageUpload(),initPopupAdmin(),initHuayuAdmin(),window.HJ_ADMIN_READY=!0;
