function adminErr(t,e,n={}){return t?n[t.error]?n[t.error]:t.error==="auth"||!t.error?"登录已失效，请重新登录":t.error==="rate_limited"?"操作过于频繁，请稍后再试":t.error==="server_error"?"服务器出错，请稍后再试":e:"连接失败，检查一下网络后再试"}const VERIFY_MODE_NAMES={cf:"自动验证",ff14:"狒科生",poem:"文科生",math:"理科生",manual:"手动验证",off:"验证已关闭"},CN_REGIONS={Beijing:"北京",Tianjin:"天津",Hebei:"河北",Shanxi:"山西","Inner Mongolia":"内蒙古",Liaoning:"辽宁",Jilin:"吉林",Heilongjiang:"黑龙江",Shanghai:"上海",Jiangsu:"江苏",Zhejiang:"浙江",Anhui:"安徽",Fujian:"福建",Jiangxi:"江西",Shandong:"山东",Henan:"河南",Hubei:"湖北",Hunan:"湖南",Guangdong:"广东",Guangxi:"广西",Hainan:"海南",Chongqing:"重庆",Sichuan:"四川",Guizhou:"贵州",Yunnan:"云南",Tibet:"西藏",Shaanxi:"陕西",Gansu:"甘肃",Qinghai:"青海",Ningxia:"宁夏",Xinjiang:"新疆"},COUNTRY_SHORT={HK:"香港",MO:"澳门",TW:"台湾",XX:"未知",T1:"未知"};let countryNames=null;function countryName(t){if(COUNTRY_SHORT[t])return COUNTRY_SHORT[t];try{return countryNames??=new Intl.DisplayNames(["zh-CN"],{type:"region"}),countryNames.of(t)||t}catch{return t}}function geoText(t){const[e="",n=""]=String(t||"").split("|");if(!e)return"";if(e!=="CN")return[countryName(e),n].filter(Boolean).join(" ");const a=Object.keys(CN_REGIONS).find(s=>n===s||n.startsWith(s+" "));return a?CN_REGIONS[a]:["中国",n].filter(Boolean).join(" ")}const geoTitle=t=>String(t||"").split("|").filter(Boolean).join(" / "),verifyModeText=t=>VERIFY_MODE_NAMES[t]||"";function submitMetaHtml(t){const e=[geoText(t.geo),verifyModeText(t.verifyMode)].filter(Boolean).join(" · ");return e?`<span class="submit-meta" title="${escapeHtml(geoTitle(t.geo))}">${escapeHtml(e)}</span>`:""}let internalAdminPassword=null,editingAnnouncementId=null,pendingAnnouncementImageUrl=null;const PW_FAIL_CAPTCHA_EVERY=5,getPwFailCount=()=>Number(storage.get(STORE.pwFails))||0;function setPwFailCount(t){t>0?storage.set(STORE.pwFails,t):storage.remove(STORE.pwFails)}function initInternal(){$("internalSubmit").addEventListener("click",checkInternalPassword),$("internalPassword").addEventListener("keydown",t=>{t.key==="Enter"&&checkInternalPassword()}),$("internalPasswordShow").addEventListener("change",t=>{$("internalPassword").type=t.target.checked?"text":"password"})}async function checkInternalPassword(){const t=$("internalPassword"),e=$("internalMsg"),n=$("internalSubmit");if(!WORKER_URL){setMsg(e,"数据库还没配置好，暂时无法验证密码。");return}n.disabled=!0,setMsg(e,"验证中…");const a=await callWorker({action:"get_announcements",password:t.value});if(n.disabled=!1,!a){setMsg(e,"连接失败，检查一下网络后再试");return}if(a.error==="viewer_closed"){setMsg(e,"「购票情况」已关闭");return}if(!a.ok){const s=getPwFailCount()+1;setPwFailCount(s),s%PW_FAIL_CAPTCHA_EVERY===0?(setMsg(e,"密码错误次数过多，请完成人机验证"),openCaptcha("internal")):setMsg(e,"密码错误");return}if(setPwFailCount(0),setMsg(e,""),$("internalGate").hidden=!0,a.isViewer){enterTicketViewer(t.value,a.perms);return}$("internalBoard").hidden=!1,renderAnnouncements(a.items,a.isAdmin),$("adminPills").hidden=!a.isAdmin,a.isAdmin&&(internalAdminPassword=t.value)}function announcementDate(t){const e=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(t||"")),n=e?new Date(Date.UTC(+e[1],+e[2]-1,+e[3],+e[4],+e[5],+e[6])):new Date(t);return Number.isNaN(n.getTime())?"":n.toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai"})}function renderAnnouncements(t,e){const n=$("announcementList");if(!t||!t.length){n.innerHTML='<div class="empty-note">暂无公告</div>';return}n.innerHTML=t.map(a=>{let s="",o="";if(e){const l=[a.show_a&&"A",a.show_b&&"B"].filter(Boolean);s=`<span class="announcement-audience">[${l.length?l.join("+"):"不可见"}]</span>`,o=`
        <div class="announcement-admin-btns">
          <button type="button" class="announcement-edit-btn" data-id="${a.id}">编辑</button>
          <button type="button" class="announcement-delete-btn" data-id="${a.id}">删除</button>
        </div>`}const i=a.image_url?`<img src="${escapeHtml(workerImageUrl(a.image_url))}" loading="lazy" class="announcement-image" data-lightbox>`:"";return`
      <div class="announcement">
        <div class="date">${escapeHtml(announcementDate(a.created_at))}${s}</div>
        <div class="body">${escapeHtml(a.body)}</div>
        ${i}
        ${o}
      </div>`}).join(""),e&&(n.querySelectorAll(".announcement-edit-btn").forEach(a=>{a.addEventListener("click",()=>{const s=t.find(o=>String(o.id)===a.dataset.id);s&&startEditAnnouncement(s)})}),n.querySelectorAll(".announcement-delete-btn").forEach(a=>{a.addEventListener("click",()=>deleteAnnouncement(a.dataset.id))}))}async function refreshAnnouncements(){const t=await callWorker({action:"get_announcements",password:internalAdminPassword});t&&t.ok&&renderAnnouncements(t.items,t.isAdmin)}const IMAGE_MAX_BYTES=50*1024*1024;function showImagePreview(t,e){const n=$(`${t}PreviewImg`);e?n.src=workerImageUrl(e):n.removeAttribute("src"),$(`${t}Preview`).hidden=!e}const readAsDataURL=t=>new Promise((e,n)=>{const a=new FileReader;a.onload=()=>e(a.result),a.onerror=()=>n(new Error("read fail")),a.readAsDataURL(t)});async function compressImage(t,e){const n=URL.createObjectURL(t);try{const a=await new Promise((s,o)=>{const i=new Image;i.onload=()=>s(i),i.onerror=()=>o(new Error("decode fail")),i.src=n});for(const[s,o]of[[1,.88],[1,.8],[.78,.8],[.62,.75]]){const i=Math.min(1,e*s/Math.max(a.naturalWidth,a.naturalHeight)),l=document.createElement("canvas");l.width=Math.max(1,Math.round(a.naturalWidth*i)),l.height=Math.max(1,Math.round(a.naturalHeight*i)),l.getContext("2d").drawImage(a,0,0,l.width,l.height);const u=await new Promise(m=>l.toBlob(m,"image/webp",o));if(!u)throw new Error("encode fail");const d=(await readAsDataURL(u)).split(",")[1];if(d.length<=7.5*1024*1024)return{base64:d,contentType:u.type||"image/webp"}}throw new Error("too large")}finally{URL.revokeObjectURL(n)}}const IMAGE_UPLOAD_TEXT={notImage:"请选择图片",tooBig:()=>"图片不能超过 50MB",processing:"处理中…",decodeFail:"无法读取该图片",rateLimited:"上传过于频繁，请稍后再试",failed:"上传失败，请重试"};function bindImageUpload(t,e,n,a=IMAGE_UPLOAD_TEXT){const s=$(`${t}Input`),o=$(`${t}PickBtn`),i=$(`${t}Status`);o.addEventListener("click",()=>s.click()),$(`${t}RemoveBtn`).addEventListener("click",()=>n(null)),s.addEventListener("change",async()=>{const l=s.files[0];if(s.value="",!!l){if(!l.type.startsWith("image/")){setMsg(i,a.notImage);return}if(l.size>IMAGE_MAX_BYTES){setMsg(i,a.tooBig(l));return}setMsg(i,a.processing),o.disabled=!0;try{const{base64:u,contentType:d}=await compressImage(l,e);setMsg(i,"上传中…");const m=await callWorker({action:"upload_announcement_image",password:internalAdminPassword,image:u,content_type:d});if(!m?.ok)throw new Error(m?.error||"upload failed");setMsg(i,""),n(new URL(`image/${m.key}`,workerBase()).href)}catch(u){setMsg(i,u.message==="decode fail"?a.decodeFail:u.message==="rate_limited"?a.rateLimited:a.failed)}o.disabled=!1}})}function setAnnouncementImage(t){pendingAnnouncementImageUrl=t,showImagePreview("announcementImage",t)}function startEditAnnouncement(t){openAdminPanel("postAnnouncementPanel"),editingAnnouncementId=t.id,$("announcementText").value=t.body,$("announceShowA").checked=!!t.show_a,$("announceShowB").checked=!!t.show_b,setAnnouncementImage(t.image_url||null),$("postAnnouncementBtn").textContent="保存修改",$("cancelEditAnnouncementBtn").hidden=!1,$("announcementText").focus({preventScroll:!0})}function cancelEditAnnouncement(){editingAnnouncementId=null,setAnnouncementImage(null),$("announcementText").value="",$("announceShowA").checked=!0,$("announceShowB").checked=!0,$("postAnnouncementBtn").textContent="发布",$("cancelEditAnnouncementBtn").hidden=!0}async function deleteAnnouncement(t){if(!confirm("确定要删除这条公告吗？删除后无法恢复。"))return;const e=await callWorker({action:"delete_announcement",password:internalAdminPassword,id:t});if(!e||!e.ok){showToast("删除失败，请重试");return}showToast("已删除"),String(editingAnnouncementId)===String(t)&&cancelEditAnnouncement(),refreshAnnouncements()}async function submitAnnouncement(){const t=$("announcementText"),e=$("postAnnouncementMsg"),n=$("postAnnouncementBtn"),a=!!editingAnnouncementId;if(setMsg(e,""),!t.value.trim()){setMsg(e,"请填写内容");return}n.disabled=!0;const s=await callWorker({action:a?"edit_announcement":"post_announcement",password:internalAdminPassword,id:editingAnnouncementId,content:t.value,show_a:$("announceShowA").checked,show_b:$("announceShowB").checked,image_url:pendingAnnouncementImageUrl});if(n.disabled=!1,!s||!s.ok){setMsg(e,a?"保存失败，请重试":"发布失败，请重试");return}cancelEditAnnouncement(),closeAdminPanel(),showToast(a?"公告已更新":"公告已发布"),refreshAnnouncements()}function initPostAnnouncement(){$("cancelEditAnnouncementBtn").addEventListener("click",cancelEditAnnouncement),$("postAnnouncementBtn").addEventListener("click",submitAnnouncement),bindImageUpload("announcementImage",1600,setAnnouncementImage)}let internalViewPassword=null,ticketViewTimer=0;function enterTicketViewer(t,e){internalViewPassword=t,ticketAdmin.role="viewer",ticketAdmin.perms=e||{stats:!0,survey:!1,pickup:!1},ticketAdmin.tab="orders";const n=$("ticketAdminPanel");n.classList.add("is-readonly"),n.querySelector("h2").textContent="购票情况",$("ticketViewHost").appendChild(n),n.hidden=!1;const a=$("surveyAdminPanel"),s=!!ticketAdmin.perms.survey;s&&(a.classList.add("is-readonly"),$("ticketViewHost").appendChild(a),a.hidden=!0),$("viewerPills").hidden=!s,$("ticketViewBoard").hidden=!1,refreshTicketAdmin(),clearInterval(ticketViewTimer),ticketViewTimer=setInterval(()=>{!document.hidden&&!$("view-internal").hidden&&!$("ticketViewBoard").hidden&&!n.hidden&&refreshTicketAdmin()},60*1e3)}function initViewerPills(){$("viewerPills").addEventListener("click",t=>{const e=t.target.closest("[data-viewer-panel]");if(!e)return;const n=e.dataset.viewerPanel;$("viewerPills").querySelectorAll("[data-viewer-panel]").forEach(a=>a.classList.toggle("is-active",a===e)),["ticketAdminPanel","surveyAdminPanel"].forEach(a=>{$(a).hidden=a!==n}),n==="surveyAdminPanel"?refreshSurveyAdmin():refreshTicketAdmin()})}const ADMIN_PANEL_REFRESH={lockdownPanel:()=>refreshLockdownStatus(),captchaPanel:()=>refreshCaptchaSwitch(),starlightPanel:()=>syncStarlightPanel(),ticketAdminPanel:()=>refreshTicketAdmin(),feedbackAdminPanel:()=>refreshFeedbackAdmin(),venueAdminPanel:()=>refreshVenueAdmin(),popupAdminPanel:()=>refreshPopupAdmin(),huayuAdminPanel:()=>refreshHuayuAdmin(),surveyAdminPanel:()=>typeof window.mountSurvey=="function"?refreshSurveyAdmin():($("surveyAdminStatus").textContent="问卷脚本 survey.js 没有加载成功（没上传或被缓存挡住），刷新页面再试",null)};function stashAdminPanels(){[...$("adminModalHost").children].forEach(t=>{t.hidden=!0,$("adminPanelStash").appendChild(t)})}function openAdminPanel(t){const e=$(t);e&&(stashAdminPanels(),$("adminModalHost").appendChild(e),e.hidden=!1,$("adminModalOverlay").dataset.closeOnlyX=e.dataset.closeOnlyX||"",$("adminModalOverlay").hidden=!1,playEnterAnim(document.querySelector("#adminModalOverlay .admin-modal")),ADMIN_PANEL_REFRESH[t]?.())}function closeAdminPanel(){$("adminModalOverlay").hidden=!0,stashAdminPanels()}function initAdminPanels(){$("adminPills").querySelectorAll("[data-admin-panel]").forEach(t=>{t.addEventListener("click",()=>openAdminPanel(t.dataset.adminPanel))}),$("adminModalClose").addEventListener("click",closeAdminPanel),closeOnBackdrop($("adminModalOverlay"),closeAdminPanel)}async function refreshLockdownStatus(){const t=$("lockdownStatus");t.textContent="当前状态：加载中…";const e=await callWorker({action:"get_lockdown"});if(!e){t.textContent="当前状态：读取失败";return}siteLockdown=!!e.value,t.textContent=e.value?"当前状态：已关闭（纯静态展示，复制附言 / 活动群 / 场地登记 / 活动问卷 / 点赞都不可用）":"当前状态：已开启（正常运行）",$("lockdownToggleBtn").textContent=e.value?"开启分享功能":"关闭分享功能",$("lockdownToggleBtn").dataset.current=e.value?"1":"0"}function initLockdownToggle(){const t=$("lockdownToggleBtn");t.addEventListener("click",async()=>{const e=$("lockdownMsg");setMsg(e,""),t.disabled=!0;const n=await callWorker({action:"set_lockdown",password:internalAdminPassword,value:t.dataset.current!=="1"});if(t.disabled=!1,!n||!n.ok){setMsg(e,adminErr(n,"切换失败，请重新登录内部入口后再试"));return}siteLockdown=!!n.value,showToast(n.value?"分享功能已关闭（纯静态展示）":"分享功能已开启"),refreshLockdownStatus()})}async function refreshCaptchaSwitch(){const t=$("captchaStatus");t.textContent="当前状态：加载中…";const e=await callWorker({action:"get_captcha"});if(!e||!e.ok){t.textContent="当前状态：读取失败";return}applyCaptchaEnabled(!!e.enabled),t.textContent=e.enabled?"当前状态：已开启（正常验证）":"当前状态：已关闭（全站不验证，任何人都能直接提交，请尽快开回来）",$("captchaToggleBtn").textContent=e.enabled?"关闭人机验证":"开启人机验证",$("captchaToggleBtn").dataset.current=e.enabled?"1":"0"}function initCaptchaSwitch(){const t=$("captchaToggleBtn");t.addEventListener("click",async()=>{const e=$("captchaSwitchMsg");setMsg(e,""),t.disabled=!0;const n=await callWorker({action:"set_captcha",password:internalAdminPassword,enabled:t.dataset.current!=="1"});if(t.disabled=!1,!n||!n.ok){setMsg(e,adminErr(n,"切换失败，请重新登录内部入口后再试"));return}applyCaptchaEnabled(!!n.enabled),showToast(n.enabled?"人机验证已开启":"人机验证已关闭"),refreshCaptchaSwitch()})}function syncStarlightPanel(){const t=hjStarlight;$("starlightStatus").textContent=t?`当前时段：${formatCnLabel(t.start)} — ${formatCnLabel(t.end)}${hjStarlightActiveAt(hjNow())?" · 进行中":""}`:"当前状态：未设置",$("starlightStart").value=hjStarlight?epochToCnLocal(hjStarlight.start):"",$("starlightEnd").value=hjStarlight?epochToCnLocal(hjStarlight.end):"",setMsg($("starlightMsg"),"")}async function saveStarlight(t){const e=$("starlightMsg"),n=[$("starlightSaveBtn"),$("starlightClearBtn")];setMsg(e,"保存中…"),n.forEach(s=>{s.disabled=!0});const a=await callWorker({action:"set_starlight",password:internalAdminPassword,value:t});if(n.forEach(s=>{s.disabled=!1}),!a||!a.ok){setMsg(e,adminErr(a,"保存失败，请重新登录内部入口后再试"));return}applyStarlight(t),syncStarlightPanel(),showToast(t?"星芒节时段已保存，期间全站天气显示为小雪":"已清除星芒节覆盖，天气恢复正常计算")}function initStarlightPanel(){$("starlightSaveBtn").addEventListener("click",()=>{const t=$("starlightMsg"),e=cnLocalToEpoch($("starlightStart").value),n=cnLocalToEpoch($("starlightEnd").value);if(!e||!n){setMsg(t,"请填写开始和结束时间");return}if(n<=e){setMsg(t,"结束时间要晚于开始时间");return}saveStarlight({start:e,end:n})}),$("starlightClearBtn").addEventListener("click",()=>saveStarlight(null))}const ticketAdmin={status:null,orders:[],rounds:[],role:"admin",perms:{stats:!0,survey:!0,pickup:!0},tab:"settings",day:null,statsRound:"",search:"",edit:null,editHolders:[],pointsDirty:!1,guideLoaded:!1,logItems:null},TA_TABS=["settings","orders","stats"],isTicketViewer=()=>ticketAdmin.role==="viewer",ticketAdminPassword=()=>internalAdminPassword||internalViewPassword,cnHm=t=>t?formatCnTime(t).slice(11):"",cnMdHm=t=>t?`${Number(formatCnTime(t).slice(5,7))}/${Number(formatCnTime(t).slice(8,10))} ${cnHm(t)}`:"",VERIFY_MODE_TEXT={cf:"自动验证",ff14:"狒科生",poem:"文科生",math:"理科生",off:"验证关闭时提交",manual:"手动验证"};function fmtDuration(t){const e=Math.max(0,Math.round(t/1e3));if(e<60)return`${e} 秒`;const n=Math.floor(e/60);if(n<60)return`${n} 分 ${e%60} 秒`;const a=Math.floor(n/60);return a<24?`${a} 小时 ${n%60} 分`:`${Math.floor(a/24)} 天 ${a%24} 小时`}function ticketRoundList(){const t=ticketAdmin.status,e=new Map;return ticketAdmin.rounds.forEach(n=>e.set(n.key,{...n,estimated:!1})),ticketAdmin.orders.forEach(n=>{if(e.has(n.day))return;const a=/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/.exec(n.day),s=a?Date.parse(`${a[1]}T${a[2]||"00:00"}:00+08:00`)+(a[2]?0:(t?.resetMin||0)*6e4):0,o=t?t.limit:0;e.set(n.day,{key:n.day,startAt:s,base:o,extra:0,quota:o,source:"",openedAt:-1,estimated:!0})}),t?.round&&!e.has(t.round.key)&&e.set(t.round.key,{...t.round,estimated:!1}),[...e.values()].sort((n,a)=>n.startAt-a.startAt||String(n.key).localeCompare(String(a.key)))}function computeTicketDuplicates(t){const e=o=>String(o).replace(/\s+/g,"").toLowerCase(),n=o=>`${String(o.name||"").replace(/\s+/g,"").toLowerCase()}@${o.server}`,a=new Map,s=new Map;return t.filter(o=>!o.voided).forEach(o=>{const i=e(o.contact);a.set(i,(a.get(i)||0)+1),ticketActiveHolders(o.holders).forEach(l=>{if(l.pending)return;const u=n(l);s.set(u,(s.get(u)||0)+1)})}),new Map(t.map(o=>[o.id,o.voided?{contact:!1,holders:o.holders.map(()=>!1)}:{contact:a.get(e(o.contact))>1,holders:o.holders.map(i=>!i.voided&&!i.pending&&s.get(n(i))>1)}]))}function setTicketSwitch(t,e,n,a){t.setAttribute("aria-pressed",e?"true":"false"),t.classList.toggle("is-on",e),t.textContent=e?n:a}function ticketTotals(t){const e=t.filter(i=>!i.voided),n=(i,l)=>i.reduce((u,d)=>u+l(d),0),a=e.filter(i=>i.picked),s=e.filter(i=>i.overLimit),o=t.filter(i=>i.voided);return{liveOrders:e.length,liveTickets:n(e,i=>i.qty),pickedOrders:a.length,pickedTickets:n(a,i=>i.qty),overOrders:s.length,overTickets:n(s,i=>i.qty),voidOrders:o.length,voidTickets:n(o,i=>i.qty),partialVoidTickets:n(e,i=>i.holders.filter(l=>l&&l.voided).length),pending:n(e,i=>ticketActiveHolders(i.holders).filter(l=>l.pending).length)}}const tasItems=t=>t.map(([e,n])=>`<div class="tas-item"><span>${e}</span><b>${n}</b></div>`).join("");function renderTicketAdmin(){const t=ticketAdmin.status;if(!t)return;const e=isTicketViewer(),n=t.round||{key:t.day,quota:t.limit,base:t.limit,extra:0,startAt:0};$("ticketAdminStatus").textContent=`当前轮次：${ticketRoundLabel(n.key,!0)}`+(n.startAt?` · ${formatCnTime(n.startAt)} 开始`:"");const a=ticketAdmin.orders.filter(u=>u.day===n.key&&!u.voided),s=a.filter(u=>u.overLimit).reduce((u,d)=>u+d.qty,0),o=ticketTotals(ticketAdmin.orders);$("ticketAdminStats").innerHTML=tasItems([["本轮已售",`${t.sold} 张`],["本轮票额",`${n.quota} 张${n.extra?`<small>临时 ${n.extra>0?"+":""}${n.extra}</small>`:""}`],["本轮余票",`${t.remaining} 张`],["本轮订单",`${a.length} 单${s?`<small>超额 ${s}</small>`:""}`],["累计有效",`${o.liveOrders} 单 / ${o.liveTickets} 张`],["已取票",`${o.pickedOrders} 单 / ${o.pickedTickets} 张`]]);const i=e?["orders",...ticketAdmin.perms.stats?["stats"]:[]]:TA_TABS;i.includes(ticketAdmin.tab)||(ticketAdmin.tab=i[0]);const l=document.querySelectorAll("#ticketAdminTabs [data-ta-tab]");l.forEach(u=>{u.hidden=!i.includes(u.dataset.taTab)}),markTabs(l,u=>u.dataset.taTab===ticketAdmin.tab),$("ticketAdminTabs").hidden=i.length<2,document.querySelectorAll("#ticketAdminPanel [data-ta-pane]").forEach(u=>{u.hidden=u.dataset.taPane!==ticketAdmin.tab}),ticketAdmin.tab==="settings"?renderTicketSettings(t):ticketAdmin.tab==="orders"?renderTicketOrders():renderTicketStats()}function renderTicketFlagSwitches(t){document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach(e=>{setTicketSwitch(e,!!t[e.dataset.taFlag],e.dataset.on,e.dataset.off)})}const setIdle=(t,e)=>{t&&document.activeElement!==t&&(t.value=e)};function renderTicketSettings(t){setTicketSwitch($("ticketOpenBtn"),t.open,"已开放（点击关闭）","已关闭（点击开放）"),setTicketSwitch($("ticketPendingBtn"),t.allowPending,"允许待定（点击关闭）","不允许待定（点击开启）"),setTicketSwitch($("ticketTestBtn"),!!t.testMode,"显示「（测试）」（点击去掉）","不显示（点击加上）"),setIdle($("ticketTitleInput"),t.title||TICKET_TITLE),$("ticketTitlePreview").textContent=`访客看到：${t.title||TICKET_TITLE}${t.testMode?"（测试）":""}`,$("ticketTitlePreview").hidden=!1,setIdle($("ticketCooldownInput"),String(t.cooldownMin??30)),setIdle($("ticketPerPersonInput"),String(t.perPerson??"")),renderTicketSchedule(t);const e=t.round||{key:t.day,base:t.limit,extra:0,quota:t.limit,startAt:0,source:""},n={daily:"每日刷新",custom:"自定义刷新点",init:"首次记录的轮次"};$("ticketRoundBox").innerHTML=`
    <p><b>${escapeHtml(ticketRoundLabel(e.key,!0))}</b>`+(e.startAt?`<small>${escapeHtml(formatCnTime(e.startAt))} 开始 · ${n[e.source]||""}</small>`:"")+`</p>
    <p>票额：基础 <b>${e.base}</b> 张${e.extra?` ${e.extra>0?"+":"−"} 临时 <b>${Math.abs(e.extra)}</b> 张`:""} = <b>${e.quota}</b> 张
      · 已售 <b>${t.sold}</b> · 余 <b>${t.remaining}</b></p>`,$("ticketExtraClearBtn").disabled=!e.extra,setTicketSwitch($("ticketDailyBtn"),t.dailyOn!==!1,"开（点击关闭）","关（点击打开）"),setIdle($("ticketResetInput"),minutesToHHMM(t.resetMin||0)),setIdle($("ticketLimitInput"),String(t.limit)),document.querySelectorAll(".ta-daily-only").forEach(i=>i.classList.toggle("is-off",t.dailyOn===!1)),$("ticketLimitCurWrap").hidden=!(e.source==="daily"||e.source==="init"),ticketAdmin.pointsDirty||renderTicketPoints(t.points||[],e.startAt),renderTicketNext(t);const a=t.remainingMode||"full";setIdle($("ticketRemainModeSelect"),a);const s=ticketStockHtml(a,t.remaining,t.stockLevel,t.roundWord||"今日");$("ticketRemainPreview").textContent=`访客现在看到：${s?s.replace(/<[^>]+>/g,""):"（不显示余票）"}`+(a==="range"?" · ≤10 张为「余票10张以内」，≤ 票额一半为「余票不多」":""),$("ticketRemainPreview").hidden=!1,setTicketSwitch($("ticketShowSchedBtn"),t.showSchedule!==!1,"显示（点击隐藏）","不显示（点击显示）"),setTicketSwitch($("ticketShowResetBtn"),t.showReset!==!1,"显示（点击隐藏）","不显示（点击显示）"),setTicketSwitch($("ticketViewerBtn"),t.viewerEnabled!==!1,"已开放（点击关闭）","已关闭（点击开放）"),renderTicketFlagSwitches(t),setIdle($("ticketIdleInput"),String(t.idleMin??10));const o=!!t.isolated;document.querySelectorAll(".ta-idle-row").forEach(i=>{i.classList.toggle("is-disabled",o),i.querySelectorAll("input, button").forEach(l=>{l.disabled=o})}),$("ticketIdleIsoNote").hidden=!o,setIdle($("ticketLogHoursInput"),String(t.viewerLogHours??24))}function renderTicketSchedule(t){setIdle($("ticketOpenAtInput"),epochToCnLocal(t.openAt)),setIdle($("ticketCloseAtInput"),epochToCnLocal(t.closeAt));const e=[];t.openAt&&e.push(`将于 ${formatCnTime(t.openAt)} 自动开启`),t.closeAt&&e.push(`将于 ${formatCnTime(t.closeAt)} 自动关闭`);const n=$("ticketSchedNote");n.textContent=e.join("；"),n.hidden=!e.length}function renderTicketPoints(t,e){const n=t.filter(a=>a.at>(e||0));$("ticketPointsList").innerHTML=n.length?n.map(a=>ticketPointRowHtml(epochToCnLocal(a.at),a.qty)).join(""):'<p class="ta-empty" data-points-empty>暂无自定义刷新点</p>'}function ticketPointRowHtml(t="",e=""){return`<div class="ta-point" data-point>
    <input type="datetime-local" class="ta-point-at" value="${escapeHtml(t)}" aria-label="刷新时间">
    <input type="number" class="ta-point-qty" min="0" max="100000" step="1" inputmode="numeric" value="${escapeHtml(String(e))}" placeholder="票额" aria-label="这一轮的票额">
    <span class="ta-point-unit">张</span>
    <button type="button" class="tt-act is-void" data-point-del>删除</button>
  </div>`}function renderTicketNext(t){const e=t.nextRefresh,n=$("ticketNextInfo"),a=$("ticketNextInput"),s=$("ticketNextNote");if($("ticketNextSaveBtn").disabled=!e,a.disabled=!e,!e){n.textContent="不会再刷新",setIdle(a,""),$("ticketNextResetBtn").hidden=!0,s.textContent="每日刷新已关闭且没有自定义刷新点，票额不再重置。",s.hidden=!1;return}n.textContent=`${formatCnTime(e.at)} · ${e.kind==="daily"?"每日刷新":"自定义刷新点"}`,setIdle(a,String(e.qty)),$("ticketNextResetBtn").hidden=!e.override;const o=[];e.override?o.push(`已单独设为 ${e.qty} 张（默认是 ${e.defaultQty} 张），只对这一次刷新有效。`):e.kind==="custom"?o.push("与对应的自定义刷新点同步。"):o.push(`默认 ${e.defaultQty} 张，修改仅对本次有效。`),e.pendingOverride&&o.push(`${formatCnTime(e.pendingOverride.at)} 的每日刷新已单独设为 ${e.pendingOverride.qty} 张。`),s.textContent=o.join(" "),s.hidden=!1}function ticketOrderMatches(t,e){if(!e)return!0;const n=[t.contact,String(t.seq),...t.holders.map(a=>formatHolder(a))].join(" ").toLowerCase();return e.toLowerCase().split(/\s+/).filter(Boolean).every(a=>n.includes(a))}function renderTicketOrders(){const t=ticketAdmin.status,e=isTicketViewer(),n=ticketAdmin.orders,a=ticketRoundList().filter(d=>d.key===t.day||n.some(m=>m.day===d.key));(ticketAdmin.day===null||ticketAdmin.day&&!a.some(d=>d.key===ticketAdmin.day))&&(ticketAdmin.day=t.day);const s=ticketAdmin.day==="";$("ticketDaySelect").innerHTML=`<option value=""${s?" selected":""}>全部轮次 · ${ticketTotals(n).liveOrders} 单</option>`+a.slice().reverse().map(d=>{const m=ticketTotals(n.filter(h=>h.day===d.key));return`<option value="${escapeHtml(d.key)}"${d.key===ticketAdmin.day?" selected":""}>${escapeHtml(ticketRoundLabel(d.key,!0))} · ${m.liveOrders} 单 / ${m.liveTickets} 张${m.voidOrders?` · 作废 ${m.voidOrders}`:""}</option>`}).join(""),setIdle($("ticketSearchInput"),ticketAdmin.search);const o=computeTicketDuplicates(n),i=new Map(a.map((d,m)=>[d.key,m])),l=n.filter(d=>(s||d.day===ticketAdmin.day)&&ticketOrderMatches(d,ticketAdmin.search)).sort((d,m)=>(i.get(d.day)??0)-(i.get(m.day)??0)||d.seq-m.seq),u=!e||ticketAdmin.perms.pickup;if($("ticketAdminPanel").classList.toggle("can-pick",u),$("ticketAdminTbody").innerHTML=l.length?l.map(d=>{const m=o.get(d.id)||{contact:!1,holders:[]},h=d.holders.map((f,S)=>f.voided?`<span class="tt-h-void"><s>${escapeHtml(formatHolder(f))}</s><small>已作废</small></span>`:`<span class="${m.holders[S]?"is-dup":""}">${escapeHtml(formatHolder(f))}</span>`).join("<br>"),w=[d.message?`${escapeHtml(d.message)}<small>${d.anonymous?"匿名":"实名"}</small>`:"",!e&&d.adminNote?`<small class="tt-note">备注：${escapeHtml(d.adminNote)}</small>`:""].join(""),b=formatCnClock(d.createdAt),c=s?`${cnMdHm(d.createdAt).split(" ")[0]} `:"",p=e?"":[d.voided?"":'<button type="button" class="tt-act" data-act="edit">编辑</button>',!d.voided&&d.holders.length>1?'<button type="button" class="tt-act" data-act="partial">部分作废</button>':"",d.voided?'<button type="button" class="tt-act is-restore" data-act="restore">恢复</button>':'<button type="button" class="tt-act is-void" data-act="void">作废</button>'].join(""),r=d.picked&&d.pickedAt?`${d.pickedBy==="viewer"?"只读端":"管理员"} ${cnMdHm(d.pickedAt)} 勾选`:"",v=d.voided?"—":u?`<label class="tt-pick" title="${escapeHtml(r)}"><input type="checkbox" data-pick${d.picked?" checked":""} aria-label="第 ${d.seq} 号已取票"><span>${d.picked?"已取":"未取"}</span></label>`:d.picked?`<span class="tt-picked" title="${escapeHtml(r)}">已取</span>`:'<span class="tt-unpicked">未取</span>';return`<tr class="${[d.voided?"is-void":d.overLimit?"is-over":"",d.picked&&!d.voided?"is-picked":""].filter(Boolean).join(" ")}" data-order-id="${d.id}">
      <td>${d.seq}${s?`<small class="tt-round">${escapeHtml(ticketRoundLabel(d.day))}</small>`:""}</td>
      <td class="${m.contact?"is-dup":""}">${escapeHtml(d.contact)}</td>
      <td>${d.qty}</td>
      <td>${h}</td>
      <td class="tt-msg">${w}</td>
      <td>${c}${b}${e?"":submitMetaHtml(d)}</td>
      <td class="tt-actions"><div class="tt-acts">${p}</div></td>
      <td class="tt-pick-cell">${v}</td>
    </tr>`}).join(""):`<tr><td colspan="8" class="tt-empty">${ticketAdmin.search?"没有符合搜索条件的订单":"暂无订单"}</td></tr>`,ticketAdmin.edit){const d=n.find(m=>m.id===ticketAdmin.edit.id);!d||d.voided?closeTicketEdit():ticketAdmin.edit.mode==="partial"&&renderTicketPartial()}}function openTicketEdit(t){ticketAdmin.edit={mode:"edit",id:t.id},ticketAdmin.editHolders=t.holders.map(a=>({...a}));const e=ticketRoundList(),n=$("ticketEditBox");n.innerHTML=`
    <h3 class="venue-edit-title">编辑订单 · ${escapeHtml(ticketRoundLabel(t.day,!0))} 第 ${t.seq} 号</h3>
    <div class="ta-edit-grid">
      <label class="ta-field"><span>所属轮次</span><select id="teDay">${e.map(a=>`<option value="${escapeHtml(a.key)}"${a.key===t.day?" selected":""}>${escapeHtml(ticketRoundLabel(a.key,!0))}</option>`).join("")}</select></label>
      <label class="ta-field"><span>联系方式</span><input type="text" id="teContact" maxlength="40" autocomplete="off"></label>
    </div>
    <div class="ta-field"><span>持票人</span><div id="teHolders"></div>
      <button type="button" class="tt-act" id="teAddHolder">+ 添加持票人</button></div>
    <label class="ta-field"><span>留言</span><textarea id="teMessage" maxlength="200"></textarea></label>
    <div class="ta-edit-checks">
      <label class="audience-opt"><input type="checkbox" id="teAnon"><span>匿名留言</span></label>
      <label class="audience-opt"><input type="checkbox" id="teOver"><span>超额</span></label>
    </div>
    <label class="ta-field"><span>管理备注</span><textarea id="teNote" maxlength="500"></textarea></label>
    <div class="venue-edit-actions">
      <button type="button" id="teSave">保存</button>
      <button type="button" class="ticket-btn-ghost" id="teCancel">取消</button>
    </div>
    <p class="form-msg" id="teMsg" hidden></p>`,$("teContact").value=t.contact,$("teMessage").value=t.message||"",$("teAnon").checked=t.anonymous,$("teOver").checked=t.overLimit,$("teNote").value=t.adminNote||"",renderTicketEditHolders(),n.hidden=!1,n.scrollIntoView({behavior:"smooth",block:"nearest"})}function renderTicketEditHolders(){const t=$("teHolders");t.innerHTML=ticketAdmin.editHolders.map((e,n)=>e.voided?`<div class="te-holder is-void"><span><s>${escapeHtml(formatHolder(e))}</s> 已作废</span></div>`:`<div class="te-holder" data-h="${n}">
        <input type="text" class="te-name" maxlength="12" placeholder="角色名" autocomplete="off" spellcheck="false"${e.pending?" disabled":""}>
        <select class="te-server"${e.pending?" disabled":""}>${TICKET_SERVER_OPTIONS}</select>
        <label class="audience-opt"><input type="checkbox" class="te-pending"${e.pending?" checked":""}><span>待定</span></label>
        <button type="button" class="tt-act is-void" data-h-del>删除</button>
      </div>`).join(""),t.querySelectorAll(".te-holder[data-h]").forEach(e=>{const n=ticketAdmin.editHolders[Number(e.dataset.h)];e.querySelector(".te-name").value=n.pending?"":n.name||"",e.querySelector(".te-server").value=n.pending?"":n.server||""})}function collectTicketEditHolders(){$("teHolders").querySelectorAll(".te-holder[data-h]").forEach(t=>{const e=Number(t.dataset.h),n=t.querySelector(".te-pending").checked;ticketAdmin.editHolders[e]=n?{pending:!0}:{name:normalizeTicketName(t.querySelector(".te-name").value),server:t.querySelector(".te-server").value}})}function closeTicketEdit(){ticketAdmin.edit=null,ticketAdmin.editHolders=[];const t=$("ticketEditBox");t.hidden=!0,t.innerHTML=""}async function saveTicketEdit(){const t=$("teMsg"),e=ticketAdmin.orders.find(o=>o.id===ticketAdmin.edit?.id);if(!e){closeTicketEdit();return}collectTicketEditHolders();const n=$("teContact").value.trim();if(!n){setMsg(t,"请填写联系方式");return}const a=ticketAdmin.editHolders;for(const[o,i]of a.entries()){if(i.voided||i.pending)continue;const l=i.name?ticketNameError(i.name):"请填写持票人 id";if(l){setMsg(t,`第 ${o+1} 位持票人：${l}`);return}if(!i.server){setMsg(t,`第 ${o+1} 位持票人：请选择区服`);return}}if(!ticketActiveHolders(a).length){setMsg(t,"至少要留一位持票人；整单不要了请用「作废」");return}setMsg(t,""),$("teSave").disabled=!0;const s=await callWorker({action:"ticket_admin_edit",password:internalAdminPassword,id:e.id,rev:e.rev,contact:n,holders:a,day:$("teDay").value,message:$("teMessage").value,anonymous:$("teAnon").checked,overLimit:$("teOver").checked,adminNote:$("teNote").value});if($("teSave")&&($("teSave").disabled=!1),!s||!s.ok){const o={conflict:"订单已被修改，已刷新",bad_contact:"请填写联系方式",bad_holders:"持票人数量需为 1–50",bad_holder_name:"有持票人未填写 id",bad_holder_server:"有持票人未选择区服",bad_holder_name_format:"持票人 id 格式不符",no_active_holder:"至少要留一位持票人；整单不要了请用「作废」",bad_day:"所选轮次不存在，刷新后再试"};setMsg(t,adminErr(s,"保存失败，请重新登录内部入口后再试",o)),s?.error==="conflict"&&(closeTicketEdit(),await refreshTicketAdmin());return}ticketAdminApplyOrder(s.order,s.status),closeTicketEdit(),renderTicketAdmin(),showToast(s.overQuota?`已保存。注意：${ticketRoundLabel(s.order.day)}这一轮已经超出票额`:`第 ${s.order.seq} 号已保存`)}function ticketAdminApplyOrder(t,e){const n=ticketAdmin.orders.findIndex(a=>a.id===t.id);n>=0&&(ticketAdmin.orders[n]={...ticketAdmin.orders[n],...t}),e&&(ticketAdmin.status=e)}function openTicketPartial(t){ticketAdmin.edit={mode:"partial",id:t.id},renderTicketPartial(),$("ticketEditBox").hidden=!1,$("ticketEditBox").scrollIntoView({behavior:"smooth",block:"nearest"})}function renderTicketPartial(){const t=ticketAdmin.orders.find(n=>n.id===ticketAdmin.edit?.id);if(!t){closeTicketEdit();return}const e=ticketActiveHolders(t.holders).length;$("ticketEditBox").innerHTML=`
    <h3 class="venue-edit-title">部分作废 · ${escapeHtml(ticketRoundLabel(t.day,!0))} 第 ${t.seq} 号 · ${t.qty} 张</h3>
    <p class="hint">作废后票额放回本轮；恢复时若票额不足则标为超额。</p>
    <div class="ta-partial">${t.holders.map((n,a)=>`
      <div class="ta-partial-row${n.voided?" is-void":""}">
        <span>${a+1}. ${n.voided?`<s>${escapeHtml(formatHolder(n))}</s> <small>已作废</small>`:escapeHtml(formatHolder(n))}</span>
        ${n.voided?`<button type="button" class="tt-act is-restore" data-pv="${a}" data-pv-void="0">恢复</button>`:`<button type="button" class="tt-act is-void" data-pv="${a}" data-pv-void="1"${e<=1?' disabled title="至少留一张"':""}>作废这张</button>`}
      </div>`).join("")}</div>
    <div class="venue-edit-actions"><button type="button" class="ticket-btn-ghost" id="tpClose">关闭</button></div>
    <p class="form-msg" id="tpMsg" hidden></p>`}async function ticketPartialVoid(t,e){const n=ticketAdmin.orders.find(o=>o.id===ticketAdmin.edit?.id);if(!n)return;const a=n.holders[t];if(e&&!confirm(`确定作废第 ${n.seq} 号里的「${formatHolder(a)}」这一张吗？

这张的票额会放回这一轮，之后可以再恢复。`))return;const s=await callWorker({action:"ticket_admin_void_holder",password:internalAdminPassword,id:n.id,index:t,voided:e,rev:n.rev});if(!s||!s.ok){const o={conflict:"订单已被修改，已刷新",last_holder:"至少要留一张；整单不要了请用「作废」",order_voided:"该订单已作废",not_changed:"状态已变化，已刷新"};setMsg($("tpMsg"),adminErr(s,"操作失败，请重新登录内部入口后再试",o)),["conflict","not_changed"].includes(s?.error)&&await refreshTicketAdmin();return}ticketAdminApplyOrder(s.order,s.status),renderTicketAdmin(),showToast(e?`已作废第 ${s.order.seq} 号的一张，现在 ${s.order.qty} 张`:`已恢复，现在 ${s.order.qty} 张${s.becameOver?"（这一轮票额不够，这一单标成了超额）":""}`)}async function ticketAdminVoid(t,e){const n=$("ticketAdminMsg");setMsg(n,"");const a=await callWorker({action:"ticket_admin_void",password:internalAdminPassword,id:t,voided:e});if(!a||!a.ok){if(a&&a.error==="not_changed"){setMsg(n,"状态已变化，已刷新"),await refreshTicketAdmin();return}setMsg(n,adminErr(a,"操作失败，请重新登录内部入口后再试"));return}ticketAdminApplyOrder(a.order,a.status),renderTicketAdmin(),showToast(a.order.voided?`第 ${a.order.seq} 号已作废，票额已放回`:`第 ${a.order.seq} 号已恢复${a.order.overLimit?"，已标为超额":""}`)}async function ticketTogglePickup(t,e,n){const a=$("ticketAdminMsg");setMsg(a,""),n.disabled=!0;const s=await callWorker({action:"ticket_pickup",password:ticketAdminPassword(),id:t,picked:e});if(n.disabled=!1,s&&s.order&&ticketAdminApplyOrder(s.order),!s||!s.ok){const o={not_changed:"这一单已经是这个状态了（可能别人刚勾过），已同步",order_voided:"该订单已作废",no_permission:"无取票勾选权限",viewer_closed:"「购票情况」已关闭"};setMsg(a,adminErr(s,"勾选失败，请重新登录后再试",o)),s?.order||(n.checked=!e),renderTicketAdmin();return}renderTicketAdmin()}function renderTicketStats(){const t=ticketAdmin.orders,e=ticketRoundList().filter(d=>d.key===ticketAdmin.status.day||t.some(m=>m.day===d.key));ticketAdmin.statsRound&&!e.some(d=>d.key===ticketAdmin.statsRound)&&(ticketAdmin.statsRound="");const n=ticketAdmin.statsRound;$("ticketStatsRound").innerHTML='<option value="">全部轮次</option>'+e.slice().reverse().map(d=>`<option value="${escapeHtml(d.key)}"${d.key===n?" selected":""}>${escapeHtml(ticketRoundLabel(d.key,!0))}</option>`).join("");const a=t.filter(d=>!n||d.day===n),s=a.filter(d=>!d.voided),o=ticketTotals(a),i=Math.max(300,($("ticketStatsBody").clientWidth||640)-2),u=[`<div class="ticket-admin-stats">${tasItems([["有效订单",`${o.liveOrders} 单`],["有效票数",`${o.liveTickets} 张`],["已取票",`${o.pickedOrders} 单 / ${o.pickedTickets} 张`],["未取票",`${o.liveOrders-o.pickedOrders} 单 / ${o.liveTickets-o.pickedTickets} 张`],["超额",`${o.overOrders} 单 / ${o.overTickets} 张`],["已作废",`${o.voidOrders} 单 / ${o.voidTickets} 张${o.partialVoidTickets?`，另部分作废 ${o.partialVoidTickets} 张`:""}`],["持票人待定",`${o.pending} 位`]])}</div>`,`<h3 class="ta-stat-title">售罄耗时</h3>${ticketSelloutTable(e,n)}`,`<h3 class="ta-stat-title">每小时售出</h3>${ticketHourlyChart(s,i)}`,`<h3 class="ta-stat-title">各服务器玩家数量</h3>${ticketServerBars(s)}`,`<h3 class="ta-stat-title">验证方式分布</h3>${ticketVerifyBars(s)}`,ticketUnpickedHtml(s)];$("ticketStatsBody").innerHTML=u.join("")}function ticketSelloutInfo(t){const e=ticketAdmin.orders.filter(u=>u.day===t.key&&!u.voided).sort((u,d)=>u.createdAt-d.createdAt),n=e.reduce((u,d)=>u+d.qty,0);let a=0,s=0;if(t.quota>0){for(const u of e)if(s+=u.qty,s>=t.quota){a=u.createdAt;break}}let o=0,i=!1;t.openedAt>0?o=Math.max(t.startAt,t.openedAt):e.length&&(o=e[0].createdAt,i=!0);let l;return e.length?a?l=`${i?"约 ":""}${fmtDuration(a-o)}`:l="未售罄":l=t.openedAt?"未售罄":"未开放",{sold:n,soldOutAt:a,start:o,approx:i,text:l}}function ticketSelloutTable(t,e){if(!t.length)return'<p class="fb-empty">暂无轮次</p>';const n=t.slice().reverse().map(s=>{const o=ticketSelloutInfo(s);return`<tr class="${s.key===e?"is-sel":""}">
      <td>${escapeHtml(ticketRoundLabel(s.key,!0))}</td>
      <td>${s.startAt?escapeHtml(cnMdHm(s.startAt)):"—"}${s.openedAt>0&&s.openedAt>s.startAt?`<small>开放 ${escapeHtml(cnMdHm(s.openedAt))}</small>`:""}</td>
      <td>${s.quota}${s.estimated?"<small>估</small>":""}</td>
      <td>${o.sold}</td>
      <td>${escapeHtml(o.text)}${o.soldOutAt?`<small>${escapeHtml(cnMdHm(o.soldOutAt))} 售罄</small>`:""}</td>
    </tr>`}).join(""),a=t.some(s=>s.estimated||s.openedAt===-1);return`<div class="ticket-table-wrap"><table class="ticket-table ta-sellout">
    <thead><tr><th>轮次</th><th>开始</th><th>票额</th><th>售出</th><th>售罄耗时</th></tr></thead><tbody>${n}</tbody></table></div>`+(a?'<p class="ta-footnote">约：从第一单起算；估：按当前每日票额估算</p>':"")}function ticketHourlyChart(t,e){if(!t.length)return'<p class="fb-empty">暂无订单</p>';const n=3600*1e3,s=(Math.max(...t.map(k=>k.createdAt))-Math.min(...t.map(k=>k.createdAt)))/(24*n)>14?24:1,o=k=>Math.floor((k+CN_TZ_OFFSET_MS)/(s*n)),i=new Map;t.forEach(k=>{const y=o(k.createdAt),L=i.get(y)||{tickets:0,orders:0};L.tickets+=k.qty,L.orders+=1,i.set(y,L)});const l=Math.min(...i.keys()),d=Math.max(...i.keys())-l+1,m=Array.from({length:d},(k,y)=>i.get(l+y)||{tickets:0,orders:0}),h=Math.max(1,...m.map(k=>k.tickets)),w=(()=>{const k=10**Math.floor(Math.log10(h));return[1,2,2.5,5,10].find(L=>L*k>=h)*k})(),b=190,c=34,p=8,r=12,v=26,g=e-c-p,f=b-r-v,S=g/d,E=k=>r+f-k/w*f,_=k=>(l+k)*s*n-CN_TZ_OFFSET_MS,A=k=>{const y=new Date(_(k)+CN_TZ_OFFSET_MS),L=`${y.getUTCMonth()+1}/${y.getUTCDate()}`;return s===24||y.getUTCHours()===0?L:`${y.getUTCHours()}时`},T=Math.max(3,Math.floor(g/64)),C=(s===24?[1,2,3,7,14,30]:[1,2,3,6,12,24,48,72,96,168]).find(k=>d/k<=T)||(s===24?30:168),B=(Number.isInteger(w/2)?[0,.5,1]:[0,1]).map(k=>{const y=w*k;return`<line x1="${c}" x2="${e-p}" y1="${E(y)}" y2="${E(y)}" class="ta-grid"/><text x="${c-6}" y="${E(y)+4}" class="ta-axis" text-anchor="end">${Math.round(y)}</text>`}).join(""),x=k=>c+k*S+S/2,M=m.map((k,y)=>`${x(y).toFixed(1)},${E(k.tickets).toFixed(1)}`),H=d===1?`<line x1="${c}" x2="${e-p}" y1="${E(m[0].tickets)}" y2="${E(m[0].tickets)}" class="ta-line"/>`:`<path class="ta-area" d="M${x(0)},${E(0)} L${M.join(" L")} L${x(d-1)},${E(0)} Z"/><polyline class="ta-line" points="${M.join(" ")}"/>`,I=S>=8?4:3,P=m.map((k,y)=>{const L=`${cnMdHm(_(y))}–${cnHm(_(y)+s*n)||"24:00"}：${k.tickets} 张 / ${k.orders} 单`;return`<g class="ta-bar-g"><title>${escapeHtml(L)}</title><rect x="${c+y*S}" y="${r}" width="${S}" height="${f}" class="ta-hit"/>`+(k.tickets?`<circle cx="${x(y)}" cy="${E(k.tickets)}" r="${I}" class="ta-dot"/>`:"")+"</g>"}).join(""),O=m.map((k,y)=>(l+y)%C!==0?"":`<text x="${c+y*S+S/2}" y="${b-8}" class="ta-axis" text-anchor="middle">${escapeHtml(A(y))}</text>`).join(""),R=m.reduce((k,y,L)=>y.tickets>m[k].tickets?L:k,0);return`<div class="ta-chart"><svg width="${e}" height="${b}" viewBox="0 0 ${e} ${b}" role="img" aria-label="每${s===24?"天":"小时"}售出张数">${B}<line x1="${c}" x2="${e-p}" y1="${E(0)}" y2="${E(0)}" class="ta-base"/>${H}${P}${O}</svg></div><p class="ta-footnote">单位：张 · 每点一${s===24?"天":"小时"} · 峰值 ${escapeHtml(cnMdHm(_(R)))} 起 ${m[R].tickets} 张</p>`}function taBarsHtml(t,e,n){const a=n||Math.max(1,...t.map(s=>s.n));return`<div class="sv-bars">${t.map(s=>`<div class="sv-bar-row"><span class="sv-bar-key">${escapeHtml(s.label)}</span><span class="sv-bar"><i style="width:${s.n/a*100}%"></i></span><span class="sv-bar-n">${s.n}<small>${e?Math.round(s.n/e*100):0}%</small></span></div>`).join("")}</div>`}function ticketServerBars(t){const e=new Map;let n=0;t.forEach(l=>ticketActiveHolders(l.holders).forEach(u=>{u.pending?n++:e.set(u.server,(e.get(u.server)||0)+1)}));const a=[...e.values()].reduce((l,u)=>l+u,0)+n;if(!a)return'<p class="fb-empty">暂无持票人</p>';const s=Math.max(1,n,...e.values()),o=TICKET_SERVER_GROUPS.map(l=>{const u=l.servers.map(m=>({label:m,n:e.get(m)||0})).filter(m=>m.n).sort((m,h)=>h.n-m.n),d=u.reduce((m,h)=>m+h.n,0);return d?`<p class="ta-dc">【${l.dc}】${d} 人</p>${taBarsHtml(u,a,s)}`:""}).join(""),i=[...e.entries()].filter(([l])=>!TICKET_SERVERS.includes(l)).map(([l,u])=>({label:l,n:u}));return`<p class="ta-footnote">按持票人计，共 ${a} 位</p>${o}`+(i.length?`<p class="ta-dc">其他</p>${taBarsHtml(i,a,s)}`:"")+(n?`<p class="ta-dc">待定</p>${taBarsHtml([{label:"id 待定",n}],a,s)}`:"")}function ticketVerifyBars(t){if(!t.length)return'<p class="fb-empty">暂无订单</p>';const e={};t.forEach(s=>{const o=s.verifyMode||"";e[o]=(e[o]||0)+1});const a=["cf","ff14","poem","math","manual","off",""].filter(s=>e[s]).map(s=>({label:s?VERIFY_MODE_TEXT[s]:"未记录",n:e[s]}));return`<p class="ta-footnote">按订单计，共 ${t.length} 单</p>${taBarsHtml(a,t.length)}`}function ticketUnpickedList(t){const e=ticketRoundList(),n=new Map(e.map((a,s)=>[a.key,s]));return t.filter(a=>!a.picked).sort((a,s)=>(n.get(a.day)??0)-(n.get(s.day)??0)||a.seq-s.seq)}function ticketUnpickedHtml(t){const e=ticketUnpickedList(t),n=e.reduce((s,o)=>s+o.qty,0),a=`<div class="ta-list-head"><h3 class="ta-stat-title">未取票名单</h3><span>${e.length} 单 / ${n} 张</span>
    ${e.length?`<button type="button" class="tt-act" data-copy-unpicked="full">复制完整名单</button>
    <button type="button" class="tt-act" data-copy-unpicked="ids">复制持票人</button>`:""}</div>`;return e.length?`${a}<details class="ta-unpicked"${e.length<=30?" open":""}><summary>${e.length<=30?"名单":`展开 · ${e.length} 单`}</summary><div class="ticket-table-wrap"><table class="ticket-table">
    <thead><tr><th>轮次</th><th>序号</th><th>联系方式</th><th>张数</th><th>持票人</th></tr></thead><tbody>${e.map(s=>`<tr>
      <td>${escapeHtml(ticketRoundLabel(s.day))}</td><td>${s.seq}</td><td>${escapeHtml(s.contact)}</td><td>${s.qty}</td>
      <td>${ticketActiveHolders(s.holders).map(o=>escapeHtml(formatHolder(o))).join("、")}</td></tr>`).join("")}</tbody></table></div></details>
    <textarea class="ta-copy-fallback" id="ticketUnpickedFallback" readonly hidden></textarea>`:`${a}<p class="fb-empty">没有未取票的有效订单</p>`}function ticketUnpickedText(t){const e=ticketAdmin.statsRound,n=ticketAdmin.orders.filter(i=>!i.voided&&(!e||i.day===e)),a=ticketUnpickedList(n),s=[];let o=null;return a.forEach(i=>{i.day!==o&&(s.push(`【${ticketRoundLabel(i.day)}】`),o=i.day);const l=ticketActiveHolders(i.holders).map(formatHolder).join("、");s.push(t==="full"?`${i.seq}. ${i.contact}：${l}（${i.qty} 张）`:`${i.seq}. ${l}`)}),s.join(`
`)}async function copyTicketUnpicked(t){const e=ticketUnpickedText(t);try{await navigator.clipboard.writeText(e),showToast("未取票名单已复制")}catch{const a=$("ticketUnpickedFallback");a.value=e,a.hidden=!1,a.focus(),a.select(),showToast("自动复制失败，已全选，请手动复制（Ctrl+C / 长按）")}}let ticketAdminTimer=0;async function refreshTicketAdmin(){const t=await callWorker({action:"ticket_admin_get",password:ticketAdminPassword()});return t&&t.error==="viewer_closed"?(clearInterval(ticketViewTimer),ticketAdmin.orders=[],$("ticketAdminStats").innerHTML="",$("ticketAdminTbody").innerHTML="",$("ticketStatsBody").innerHTML="",$("ticketAdminStatus").textContent="「购票情况」已关闭",!1):!t||!t.ok?($("ticketAdminStatus").textContent=adminErr(t,"读取失败，请重新登录内部入口后再试"),!1):(ticketAdmin.status=t.status,ticketAdmin.orders=Array.isArray(t.orders)?t.orders:[],ticketAdmin.rounds=Array.isArray(t.rounds)?t.rounds:[],ticketAdmin.role=t.role==="viewer"||!internalAdminPassword?"viewer":"admin",ticketAdmin.perms=t.perms||(isTicketViewer()?{stats:!0,survey:!1,pickup:!1}:{stats:!0,survey:!0,pickup:!0}),renderTicketAdmin(),!0)}async function ticketAdminSet(t,e){const n=$("ticketAdminMsg");setMsg(n,"");const a=await callWorker({action:"ticket_admin_set",password:internalAdminPassword,...t});if(!a||!a.ok){const s={bad_limit:"票额需为 0 以上的整数",bad_per_person:"单人限购需为 1–20 之间的整数",bad_cooldown:"购票间隔需为 0–1440 的整数",bad_reset:"刷新时间无效",bad_title:"标题最多 60 字",bad_remaining_mode:"余票显示方式无效",bad_schedule:"定时时间无效",bad_idle:"停留时限需为 0–1440 的整数",bad_log_hours:"日志间隔需为 1–720 的整数",bad_extra:"加票数量无效",extra_below_zero:"票额不能小于 0",bad_points:"刷新点最多 60 个",bad_point_time:"刷新点时间无效",bad_point_qty:"刷新点票额需为 0 以上的整数",no_next_refresh:"现在没有下一次刷新（每日刷新关着，也没有自定义刷新点）",bad_next_qty:"下一次刷新的票额需为 0 以上的整数",bad_guide:"须知格式无效",guide_too_long:"须知最多 12000 字"};return setMsg(n,adminErr(a,"保存失败，请重新登录内部入口后再试",s)),!1}return ticketAdmin.status=a.status,renderTicketAdmin(),showTicketEntry(ticketEntryVisible(a.status)),scheduleTicketEntryCheck(a.status),e&&showToast(e),!0}async function loadTicketLog(){const t=$("ticketLogList");t.hidden=!1,t.innerHTML='<p class="fb-empty">加载中…</p>';const e=await callWorker({action:"ticket_log_get",password:internalAdminPassword});if(!e||!e.ok){t.innerHTML=`<p class="fb-empty">${escapeHtml(adminErr(e,"读取失败"))}</p>`;return}if(!e.items.length){t.innerHTML='<p class="fb-empty">暂无记录</p>';return}t.innerHTML=e.items.map(n=>{const a=n.ops.slice().sort((o,i)=>o.lastAt-i.lastAt),s=a.filter(o=>o.picked).length;return`<div class="fb-item ta-log-item">
      <div class="fb-head"><span class="venue-date">${escapeHtml(cnMdHm(n.windowStart))} – ${escapeHtml(cnMdHm(n.windowStart+n.hours*3600*1e3))}</span>
        <span class="fb-time">${n.hours} 小时 · ${a.length} 单 · 已取 ${s} 单</span></div>
      <ul class="ta-log-ops">${a.map(o=>`<li>${escapeHtml(ticketRoundLabel(o.day))} 第 ${o.seq} 号 → <b>${o.picked?"已取票":"取消取票"}</b><small>${escapeHtml(cnMdHm(o.lastAt))}${o.count>1?` · 共 ${o.count} 次，首次 ${escapeHtml(cnHm(o.firstAt))}`:""}</small></li>`).join("")}</ul>
    </div>`}).join("")}async function loadTicketGuideEditor(){if(ticketAdmin.guideLoaded)return;const t=await callWorker({action:"get_ticket_guide"});if(!t||!t.ok){setMsg($("ticketGuideMsg"),adminErr(t,"读取失败"));return}$("ticketGuideInput").value=t.text||TICKET_GUIDE_DEFAULT,$("ticketGuideState").textContent=t.text?"· 已修改":"· 默认",ticketAdmin.guideLoaded=!0,renderTicketGuidePreview()}function renderTicketGuidePreview(){$("ticketGuidePreview").innerHTML=renderGuideMarkup($("ticketGuideInput").value)}async function saveTicketGuide(t){const e=t.trim()===TICKET_GUIDE_DEFAULT.trim()?"":t;await ticketAdminSet({guide:e},e?"购票须知已保存":"购票须知已恢复默认")&&($("ticketGuideState").textContent=e?"· 已修改":"· 默认",ticketGuide.loaded=!1,$("ticketGuideContent").innerHTML=renderGuideMarkup(e||TICKET_GUIDE_DEFAULT))}const loadExcelJs=()=>loadLateScript("assets/lib/exceljs.min.js",()=>!!window.ExcelJS).then(()=>window.ExcelJS);async function saveWorkbook(t,e){const n=await t.xlsx.writeBuffer(),a=epochToCnLocal(Date.now()).replace(/[-:]/g,"").replace("T","-");downloadBlob(new Blob([n],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),`${e}_${a}.xlsx`)}const XL_RED="FFE02020",XL_ORANGE="FFED7D31",XL_GREEN="FF92D050";function ticketMessageLine(t){const e=ticketActiveHolders(t.holders).find(n=>!n.pending)||t.holders.find(n=>n&&!n.pending);return e?t.anonymous?`来自${e.server}的冒险者：${t.message}`:`${e.name}@${e.server}：${t.message}`:`某位冒险者：${t.message}`}async function buildTicketWorkbook(t){const e=await loadExcelJs(),n=new e.Workbook,a={horizontal:"center",vertical:"middle"},s=t.filter(r=>!r.voided),o=computeTicketDuplicates(t),i=ticketRoundList().filter(r=>s.some(v=>v.day===r.key)),l=Math.max(5,...s.map(r=>ticketActiveHolders(r.holders).length)),u=l+4,d=n.addWorksheet("预售票"),m=["联系方式","序号","购票数量",...Array.from({length:l},(r,v)=>`购票id（${v+1}）`),"是否取票"];let h=1;i.forEach(r=>{const v=s.filter(A=>A.day===r.key).sort((A,T)=>A.seq-T.seq),g=v.reduce((A,T)=>A+T.qty,0);d.mergeCells(h,1,h,u-2);const f=d.getCell(h,1),S=/^(\d{4})-(\d{2})-(\d{2})$/.exec(r.key);S?(f.value=new Date(Date.UTC(Number(S[1]),Number(S[2])-1,Number(S[3]))),f.numFmt="yyyy/m/d"):f.value=ticketRoundLabel(r.key,!0),f.alignment=a,f.font={bold:!0},f.fill={type:"pattern",pattern:"solid",fgColor:{argb:XL_GREEN}},d.getCell(h,u-1).value="售出票数：",d.getCell(h,u-1).alignment=a;const E=h+2,_=h+1+Math.max(1,v.length);d.getCell(h,u).value={formula:`SUM(C${E}:C${_})`,result:g},d.getCell(h,u).alignment=a,h++,m.forEach((A,T)=>{const C=d.getCell(h,T+1);C.value=A,C.alignment=a,C.font={bold:!0}}),h++,v.length||h++,v.forEach(A=>{const T=o.get(A.id)||{contact:!1,holders:[]},C=A.holders.map((x,M)=>({h:x,i:M})).filter(x=>!x.h.voided);[A.contact,A.seq,A.qty,...Array.from({length:l},(x,M)=>C[M]?formatHolder(C[M].h):null),A.picked?"是":null].forEach((x,M)=>{const H=d.getCell(h,M+1);H.value=x,H.alignment=a;let I=A.overLimit?XL_RED:null;M===0&&T.contact&&(I=XL_ORANGE),M>=3&&M<3+l&&C[M-3]&&T.holders[C[M-3].i]&&(I=XL_ORANGE),I&&(H.font={color:{argb:I},bold:A.overLimit})}),h++}),h++}),i.length||(d.getCell(1,1).value="还没有有效订单"),d.getColumn(1).width=16,d.getColumn(2).width=6,d.getColumn(3).width=9;for(let r=4;r<4+l;r++)d.getColumn(r).width=22;d.getColumn(u).width=10;const w=u+2;[["标注说明",{bold:!0}],["每一块是一轮（两次票额刷新之间）；绿色格是这一轮的日期",null],["红字：提交时这一轮票额已满（超额登记，整单标红）",{color:{argb:XL_RED}}],["橙字：联系方式或持票 id 与其他订单重复",{color:{argb:XL_ORANGE}}],["作废的订单和持票人不在本页，见「已作废」页",null]].forEach(([r,v],g)=>{const f=d.getCell(g+1,w);f.value=r,v&&(f.font=v)}),d.getColumn(w).width=50;const b=s.filter(r=>r.message);if(ticketAdmin.status?.messageOn!==!1||b.length){const r=n.addWorksheet("留言");r.addRow(["轮次","序号","留言"]),r.getRow(1).font={bold:!0},b.forEach(v=>r.addRow([ticketRoundLabel(v.day,!0),v.seq,ticketMessageLine(v)])),r.getColumn(1).width=20,r.getColumn(2).width=6,r.getColumn(3).width=90,r.getColumn(3).alignment={wrapText:!0,vertical:"top"}}const c=n.addWorksheet("已作废");c.addRow(["轮次","序号","联系方式","作废范围","作废的持票人","留言","登记时间"]),c.getRow(1).font={bold:!0},t.forEach(r=>{r.voided&&c.addRow([ticketRoundLabel(r.day,!0),r.seq,r.contact,`整单（${r.qty} 张）`,ticketActiveHolders(r.holders).map(formatHolder).join("、"),r.message||"",formatCnSeconds(r.createdAt)]);const v=r.holders.filter(g=>g&&g.voided);v.length&&c.addRow([ticketRoundLabel(r.day,!0),r.seq,r.contact,`部分（${v.length} 张）${r.voided?"，后来整单作废":""}`,v.map(formatHolder).join("、"),r.message||"",formatCnSeconds(r.createdAt)])}),[20,6,16,18,40,40,20].forEach((r,v)=>{c.getColumn(v+1).width=r});const p=n.addWorksheet("登记信息");return p.addRow(["轮次","序号","联系方式","张数","状态","登记时间","IP 属地","验证方式"]),p.getRow(1).font={bold:!0},t.forEach(r=>{const v=r.voided?"已作废":r.overLimit?"超额":"有效";p.addRow([ticketRoundLabel(r.day,!0),r.seq,r.contact,r.qty,v,formatCnSeconds(r.createdAt),geoText(r.geo),verifyModeText(r.verifyMode)])}),[20,6,16,6,8,20,14,10].forEach((r,v)=>{p.getColumn(v+1).width=r}),n}async function exportTicketExcel(t=""){await saveWorkbook(await buildTicketWorkbook(ticketAdmin.orders),`花街购票信息${ticketAdmin.status?.testMode?"（测试）":""}${t}`)}async function withAdminBusy(t,e){const n=$("ticketAdminMsg");setMsg(n,""),t.disabled=!0;try{await e(n)}finally{t.disabled=!1}}function initTicketAdmin(){const t=()=>$("ticketAdminMsg"),e=(c,p,r,v)=>{const g=$(c).value.trim(),f=Number(g);return g===""||!Number.isInteger(f)||f<p||f>r?(setMsg(t(),v),null):($(c).blur(),f)},n=(c,p)=>$(c).addEventListener("keydown",r=>{r.key==="Enter"&&p()});$("ticketAdminTabs").addEventListener("click",c=>{const p=c.target.closest("[data-ta-tab]");p&&(ticketAdmin.tab=p.dataset.taTab,renderTicketAdmin())}),$("ticketOpenBtn").addEventListener("click",()=>{const c=!ticketAdmin.status?.open;ticketAdminSet({open:c},c?"购票已开放":"购票已关闭")}),$("ticketPendingBtn").addEventListener("click",()=>{const c=!ticketAdmin.status?.allowPending;ticketAdminSet({allowPending:c},c?"已允许持票 id 待定":"已关闭持票 id 待定")});const a=()=>{const c=$("ticketTitleInput").value.trim();if(c.length>60){setMsg(t(),"标题最多 60 字");return}$("ticketTitleInput").blur(),ticketAdminSet({title:c},c?"购票页标题已保存":"已恢复默认标题")};$("ticketTitleSaveBtn").addEventListener("click",a),n("ticketTitleInput",a),$("ticketTestBtn").addEventListener("click",()=>{const c=!ticketAdmin.status?.testMode;ticketAdminSet({testMode:c},c?"已加上「测试」后缀":"已去掉「测试」后缀")});const s=()=>{const c=e("ticketPerPersonInput",1,20,"单人限购需为 1–20 之间的整数");c!==null&&ticketAdminSet({perPerson:c},`单人限购已设为 ${c} 张`)};$("ticketPerPersonSaveBtn").addEventListener("click",s),n("ticketPerPersonInput",s);const o=()=>{const c=e("ticketCooldownInput",0,1440,"购票间隔需为 0–1440 的整数");c!==null&&ticketAdminSet({cooldownMin:c},c?`再次购票间隔已设为 ${c} 分钟`:"已取消再次购票间隔")};$("ticketCooldownSaveBtn").addEventListener("click",o),n("ticketCooldownInput",o),$("ticketSchedSaveBtn").addEventListener("click",()=>{const c=cnLocalToEpoch($("ticketOpenAtInput").value),p=cnLocalToEpoch($("ticketCloseAtInput").value);if($("ticketOpenAtInput").value&&!c){setMsg(t(),"开启时间无效");return}if($("ticketCloseAtInput").value&&!p){setMsg(t(),"关闭时间无效");return}if(!c&&!p){setMsg(t(),"请至少填写一个时间");return}const r=Date.now(),v=[c&&c<=r?"开启":"",p&&p<=r?"关闭":""].filter(Boolean);if(v.length&&!confirm(`定时${v.join("和")}时间已过，保存后立即生效，继续？`))return;const g=[];c&&g.push(`${formatCnTime(c)} 开启`),p&&g.push(`${formatCnTime(p)} 关闭`),ticketAdminSet({openAt:c,closeAt:p},`已设定：${g.join("，")}`)}),$("ticketSchedClearBtn").addEventListener("click",()=>{$("ticketOpenAtInput").value="",$("ticketCloseAtInput").value="",ticketAdminSet({openAt:0,closeAt:0},"已清除定时开关")});const i=c=>{const p=e("ticketExtraInput",1,1e5,"请填写 1 以上的整数");if(p===null)return;const r=ticketAdmin.status?.round;if(c<0&&r&&r.quota-p<0){setMsg(t(),`本轮票额仅 ${r.quota} 张`);return}ticketAdminSet({extraDelta:c*p},`本轮票额 ${c>0?"+":"−"}${p}`).then(v=>{v&&($("ticketExtraInput").value="")})};$("ticketExtraAddBtn").addEventListener("click",()=>i(1)),$("ticketExtraSubBtn").addEventListener("click",()=>i(-1)),$("ticketExtraClearBtn").addEventListener("click",()=>{confirm("清零本轮临时加票？")&&ticketAdminSet({extraSet:0},"临时加票已清零")}),$("ticketDailyBtn").addEventListener("click",()=>{const c=ticketAdmin.status?.dailyOn===!1;!c&&!confirm(`关闭每日刷新？

之后仅在自定义刷新点刷新票额，当前轮次不受影响。`)||ticketAdminSet({dailyOn:c},c?"已打开每日刷新":"已关闭每日刷新")});const l=()=>{const c=hhmmToMinutes($("ticketResetInput").value);if(c===null){setMsg(t(),"请填写刷新时间");return}c!==(ticketAdmin.status?.resetMin||0)&&!confirm(`每日刷新时间改为 ${minutesToHHMM(c)}？

当前轮次不受影响。`)||($("ticketResetInput").blur(),ticketAdminSet({resetMin:c},`每日刷新时间：${minutesToHHMM(c)}`))};$("ticketResetSaveBtn").addEventListener("click",l),n("ticketResetInput",l);const u=()=>{const c=e("ticketLimitInput",0,1e5,"每日票额需为 0 以上的整数");if(c===null)return;const p=!$("ticketLimitCurWrap").hidden&&$("ticketLimitCurChk").checked;ticketAdminSet({limit:c,limitApplyCurrent:p},p?`每日票额已设为 ${c} 张（当前这一轮也改成 ${c} 张）`:`每日票额已设为 ${c} 张（从下一次每日刷新开始）`)};$("ticketLimitSaveBtn").addEventListener("click",u),n("ticketLimitInput",u);const d=$("ticketPointsList");d.addEventListener("input",()=>{ticketAdmin.pointsDirty=!0}),d.addEventListener("click",c=>{const p=c.target.closest("[data-point-del]");p&&(p.closest("[data-point]").remove(),ticketAdmin.pointsDirty=!0,d.querySelector("[data-point]")||(d.innerHTML='<p class="ta-empty" data-points-empty>暂无自定义刷新点</p>'))}),$("ticketPointAddBtn").addEventListener("click",()=>{d.querySelector("[data-points-empty]")?.remove(),d.insertAdjacentHTML("beforeend",ticketPointRowHtml("",ticketAdmin.status?.limit??"")),ticketAdmin.pointsDirty=!0,d.querySelector("[data-point]:last-child .ta-point-at")?.focus()}),$("ticketPointSaveBtn").addEventListener("click",async()=>{const c=[...d.querySelectorAll("[data-point]")],p=[];for(const[f,S]of c.entries()){const E=S.querySelector(".ta-point-at").value,_=S.querySelector(".ta-point-qty").value.trim(),A=cnLocalToEpoch(E),T=Number(_);if(!A){setMsg(t(),`第 ${f+1} 个刷新点缺少时间`);return}if(_===""||!Number.isInteger(T)||T<0){setMsg(t(),`第 ${f+1} 个刷新点票额无效`);return}p.push({at:A,qty:T})}const r=p.map(f=>Math.floor(f.at/6e4));if(new Set(r).size!==r.length){setMsg(t(),"刷新点时间重复");return}const v=p.filter(f=>f.at<=Date.now());if(v.length&&!confirm(`${v.length} 个刷新点时间已过：${v.map(f=>formatCnTime(f.at)).join("、")}

保存后将立即以最晚的一个开始新一轮，继续？`))return;ticketAdmin.pointsDirty=!1,await ticketAdminSet({points:p},p.length?`已保存 ${p.length} 个刷新点`:"已清空自定义刷新点")||(ticketAdmin.pointsDirty=!0)}),$("ticketPointResetBtn").addEventListener("click",()=>{ticketAdmin.pointsDirty=!1,renderTicketAdmin()});const m=()=>{const c=e("ticketNextInput",0,1e5,"下一次刷新的票额需为 0 以上的整数");c!==null&&(ticketAdmin.pointsDirty&&ticketAdmin.status?.nextRefresh?.kind==="custom"&&!confirm("自定义刷新点列表里有还没保存的修改，会被这次保存覆盖。继续吗？")||(ticketAdmin.pointsDirty=!1,ticketAdminSet({nextQty:c},`下一次刷新的票额已设为 ${c} 张`)))};$("ticketNextSaveBtn").addEventListener("click",m),n("ticketNextInput",m),$("ticketNextResetBtn").addEventListener("click",()=>ticketAdminSet({nextQty:null},"下一次刷新恢复默认票额"));const h={full:"购票页显示具体余票张数",range:"购票页只显示余票大致范围",hidden:"购票页不显示余票"};$("ticketRemainModeSelect").addEventListener("change",c=>{const p=c.target.value;c.target.blur(),ticketAdminSet({remainingMode:p},h[p]||"已保存")}),$("ticketShowSchedBtn").addEventListener("click",()=>{const c=ticketAdmin.status?.showSchedule===!1;ticketAdminSet({showSchedule:c},c?"购票页显示定时开启 / 关闭时间":"购票页不显示定时开启 / 关闭时间")}),$("ticketShowResetBtn").addEventListener("click",()=>{const c=ticketAdmin.status?.showReset===!1;ticketAdminSet({showReset:c},c?"购票页显示刷新时间":"购票页不显示刷新时间")}),$("ticketViewerBtn").addEventListener("click",()=>{const c=ticketAdmin.status?.viewerEnabled===!1;ticketAdminSet({viewerEnabled:c},c?"「购票情况」已开放":"「购票情况」已关闭")}),document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach(c=>{c.addEventListener("click",()=>{const p=c.dataset.taFlag,r=!ticketAdmin.status?.[p];c.dataset.confirmOn&&r&&!confirm(c.dataset.confirmOn)||ticketAdminSet({[p]:r},r?c.dataset.toastOn:c.dataset.toastOff)})});const w=()=>{const c=e("ticketIdleInput",0,1440,"停留时限需为 0–1440 的整数");c!==null&&ticketAdminSet({idleMin:c},c?`停留时限：${c} 分钟`:"已取消停留时限")};$("ticketIdleSaveBtn").addEventListener("click",w),n("ticketIdleInput",w),$("ticketGuideEditor").addEventListener("toggle",c=>{c.currentTarget.open&&loadTicketGuideEditor()}),$("ticketGuideInput").addEventListener("input",()=>{clearTimeout($("ticketGuideInput")._t),$("ticketGuideInput")._t=setTimeout(renderTicketGuidePreview,250)}),$("ticketGuideSaveBtn").addEventListener("click",c=>withAdminBusy(c.currentTarget,async()=>{if(!ticketAdmin.guideLoaded){setMsg($("ticketGuideMsg"),"读取中，请稍候");return}setMsg($("ticketGuideMsg"),""),await saveTicketGuide($("ticketGuideInput").value)})),$("ticketGuideResetBtn").addEventListener("click",c=>withAdminBusy(c.currentTarget,async()=>{confirm("恢复默认须知？")&&($("ticketGuideInput").value=TICKET_GUIDE_DEFAULT,renderTicketGuidePreview(),ticketAdmin.guideLoaded=!0,await saveTicketGuide(TICKET_GUIDE_DEFAULT))}));const b=()=>{const c=e("ticketLogHoursInput",1,720,"日志间隔需为 1–720 的整数");c!==null&&ticketAdminSet({viewerLogHours:c},`日志间隔：${c} 小时`)};$("ticketLogHoursSaveBtn").addEventListener("click",b),n("ticketLogHoursInput",b),$("ticketLogBtn").addEventListener("click",c=>withAdminBusy(c.currentTarget,loadTicketLog)),$("ticketDaySelect").addEventListener("change",c=>{ticketAdmin.day=c.target.value,renderTicketAdmin()}),$("ticketSearchInput").addEventListener("input",c=>{ticketAdmin.search=c.target.value.trim(),renderTicketOrders()}),$("ticketAdminTbody").addEventListener("click",async c=>{const p=c.target.closest("[data-act]");if(!p)return;const r=Number(p.closest("[data-order-id]").dataset.orderId),v=ticketAdmin.orders.find(S=>S.id===r);if(!v)return;const g=p.dataset.act;if(g==="edit"){openTicketEdit(v);return}if(g==="partial"){openTicketPartial(v);return}const f=g==="void";if(!(f&&!confirm(`作废第 ${v.seq} 号（${v.qty} 张）？票额将放回本轮。`))){p.disabled=!0;try{await ticketAdminVoid(r,f)}finally{p.disabled=!1}}}),$("ticketAdminTbody").addEventListener("change",c=>{const p=c.target.closest("[data-pick]");if(!p)return;const r=Number(p.closest("[data-order-id]").dataset.orderId);ticketTogglePickup(r,p.checked,p)}),$("ticketEditBox").addEventListener("click",c=>{const p=c.target;if(p.closest("#teCancel")||p.closest("#tpClose")){closeTicketEdit();return}if(p.closest("#teSave")){saveTicketEdit();return}if(p.closest("#teAddHolder")){if(collectTicketEditHolders(),ticketAdmin.editHolders.length>=50){setMsg($("teMsg"),"一单最多 50 位持票人");return}ticketAdmin.editHolders.push({name:"",server:""}),renderTicketEditHolders();return}const r=p.closest("[data-h-del]");if(r){collectTicketEditHolders(),ticketAdmin.editHolders.splice(Number(r.closest("[data-h]").dataset.h),1),renderTicketEditHolders();return}const v=p.closest("[data-pv]");v&&(v.disabled=!0,ticketPartialVoid(Number(v.dataset.pv),v.dataset.pvVoid==="1").finally(()=>{v.disabled=!1}))}),$("ticketEditBox").addEventListener("change",c=>{const p=c.target.closest(".te-pending");if(p){const r=p.closest("[data-h]");r.querySelector(".te-name").disabled=p.checked,r.querySelector(".te-server").disabled=p.checked}}),$("ticketEditBox").addEventListener("focusout",c=>{const p=c.target.closest(".te-name");p&&(p.value=normalizeTicketName(p.value))}),$("ticketStatsRound").addEventListener("change",c=>{ticketAdmin.statsRound=c.target.value,renderTicketStats()}),$("ticketStatsBody").addEventListener("click",c=>{const p=c.target.closest("[data-copy-unpicked]");p&&copyTicketUnpicked(p.dataset.copyUnpicked)}),$("ticketRefreshBtn").addEventListener("click",c=>withAdminBusy(c.currentTarget,async()=>{await refreshTicketAdmin()&&showToast("已刷新")})),$("ticketExportBtn").addEventListener("click",c=>withAdminBusy(c.currentTarget,async p=>{if(!await refreshTicketAdmin()){setMsg(p,"读取购票数据失败，未导出");return}try{await exportTicketExcel()}catch(r){console.error(r),setMsg(p,"导出失败：表格组件加载不出来，检查一下网络后再试")}})),$("ticketClearBtn").addEventListener("click",c=>withAdminBusy(c.currentTarget,async p=>{if(!await refreshTicketAdmin()){setMsg(p,"读取购票数据失败，未执行清空");return}const r=ticketAdmin.orders.length,v=ticketAdmin.orders.filter(f=>f.voided).length;if(!confirm(`清空全部购票数据？共 ${r} 单${v?`，含作废 ${v} 单`:""}

将先下载 Excel 备份，清空后无法恢复。`))return;if(r)try{await exportTicketExcel("_清空前备份")}catch(f){console.error(f),setMsg(p,"备份导出失败，已取消清空。检查网络后再试");return}const g=await callWorker({action:"ticket_admin_clear",password:internalAdminPassword,confirm:"CLEAR"});if(!g||!g.ok){setMsg(p,adminErr(g,"清空失败，请重新登录内部入口后再试"));return}await refreshTicketAdmin(),showToast(r?"已备份并清空购票数据":"购票数据已清空")})),clearInterval(ticketAdminTimer),ticketAdminTimer=setInterval(()=>{document.hidden||isTicketViewer()||!internalAdminPassword||$("ticketAdminPanel").hidden||$("adminModalOverlay").hidden||ticketAdmin.edit||ticketAdmin.tab==="settings"||refreshTicketAdmin()},60*1e3)}const feedbackAdmin={items:[],loaded:!1};function renderFeedbackAdmin(){const t=$("feedbackFilterCat").value,e=$("feedbackFilterState").value,n=feedbackAdmin.items,a=n.filter(i=>!i.handled).length;$("feedbackAdminStatus").textContent=n.length?`共 ${n.length} 条，未处理 ${a} 条`:"暂无反馈";const s=$("feedbackPillBadge");s.hidden=!a,s.textContent=a>99?"99+":String(a);const o=n.filter(i=>(!t||i.category===t)&&(!e||(e==="done"?i.handled:!i.handled)));$("feedbackAdminList").innerHTML=o.length?o.map(i=>`<div class="fb-item${i.handled?" is-done":""}" data-fb-id="${i.id}">
      <div class="fb-head">
        <span class="fb-cat fb-cat-${escapeHtml(i.category)}">${escapeHtml(FEEDBACK_CATEGORIES[i.category]||i.category)}</span>
        <span class="fb-time">${escapeHtml(formatCnTime(i.createdAt))}</span>
        ${submitMetaHtml(i)}
        ${i.handled?'<span class="fb-state">已处理</span>':""}
      </div>
      <div class="fb-body">${escapeHtml(i.content)}</div>
      <div class="fb-contact">${i.contact?`联系方式：<b>${escapeHtml(i.contact)}</b>`:"未留联系方式"}</div>
      <div class="fb-actions">
        ${i.contact?'<button type="button" class="tt-act is-copy" data-fb-act="copy">复制联系方式</button>':""}
        <button type="button" class="tt-act ${i.handled?"is-reopen":"is-restore"}" data-fb-act="mark">${i.handled?"标记为未处理":"标记已处理"}</button>
        <button type="button" class="tt-act is-void" data-fb-act="delete">删除</button>
      </div>
    </div>`).join(""):`<p class="fb-empty">${n.length?"无匹配结果":"暂无反馈"}</p>`}async function refreshFeedbackAdmin(){const t=await callWorker({action:"feedback_admin_list",password:internalAdminPassword});return!t||!t.ok?($("feedbackAdminStatus").textContent=adminErr(t,"读取失败，请重新登录内部入口后再试"),!1):(feedbackAdmin.items=t.items,feedbackAdmin.loaded=!0,renderFeedbackAdmin(),!0)}function initFeedbackAdmin(){$("feedbackFilterCat").insertAdjacentHTML("beforeend",Object.entries(FEEDBACK_CATEGORIES).map(([t,e])=>`<option value="${t}">${e}</option>`).join("")),$("feedbackFilterCat").addEventListener("change",renderFeedbackAdmin),$("feedbackFilterState").addEventListener("change",renderFeedbackAdmin),$("feedbackRefreshBtn").addEventListener("click",async t=>{const e=t.currentTarget;e.disabled=!0;try{await refreshFeedbackAdmin()&&showToast("已刷新")}finally{e.disabled=!1}}),$("feedbackAdminList").addEventListener("click",async t=>{const e=t.target.closest("[data-fb-act]");if(!e)return;const n=Number(e.closest("[data-fb-id]").dataset.fbId),a=feedbackAdmin.items.find(l=>l.id===n);if(!a)return;const s=$("feedbackAdminMsg");setMsg(s,"");const o=e.dataset.fbAct;if(o==="copy"){copyText(a.contact,"联系方式已复制",a.contact);return}if(o==="delete"&&!confirm("确定删除这条反馈吗？删除后无法恢复。"))return;e.disabled=!0;const i=o==="mark"?await callWorker({action:"feedback_admin_mark",password:internalAdminPassword,id:n,handled:!a.handled}):await callWorker({action:"feedback_admin_delete",password:internalAdminPassword,id:n});if(e.disabled=!1,!i||!i.ok){setMsg(s,adminErr(i,"操作失败，请重新登录内部入口后再试"));return}o==="mark"?a.handled=!!i.handled:feedbackAdmin.items=feedbackAdmin.items.filter(l=>l.id!==n),renderFeedbackAdmin(),showToast(o==="mark"?a.handled?"已标记为已处理":"已标记为未处理":"已删除")})}const venueAdmin={items:[],today:"",editingId:null,loaded:!1},VENUE_SOURCE_TEXT={web:"网站登记",admin:"后台录入",import:"金数据导入"};function venueAdminFiltered(){const t=$("venueFilterState").value,e=$("venueFilterTime").value,n=venueAdmin.today||cnDate(0),a=venueAdmin.items.filter(s=>(!t||(t==="void"?s.voided:!s.voided))&&(!e||(e==="upcoming"?s.date>=n:s.date<n)));return a.sort((s,o)=>e==="upcoming"?s.date.localeCompare(o.date)||s.id-o.id:o.date.localeCompare(s.date)||o.id-s.id),a}function renderVenueAdmin(){const t=venueAdmin.items,e=venueAdmin.today||cnDate(0),n=t.filter(i=>!i.voided),a=n.filter(i=>i.date>=e).length,s=t.length-n.length;$("venueAdminStatus").textContent=t.length?`共 ${t.length} 条 · 有效 ${n.length} 条 · 近期 ${a} 条${s?` · 已作废 ${s} 条`:""}`:"暂无登记";const o=venueAdminFiltered();$("venueAdminList").innerHTML=o.length?o.map(i=>{const l=i.date<e,u=venueSummaryRows(i).filter(([d])=>!["预约日期","申请身份","使用意向","预约场地"].includes(d));return`<div class="fb-item venue-item${i.voided?" is-void":""}${l?" is-past":""}" data-venue-id="${i.id}">
      <div class="fb-head">
        <span class="venue-date">${escapeHtml(venueDateLabel(i.date))}</span>
        ${i.voided?'<span class="venue-tag is-void">已作废</span>':l?'<span class="venue-tag">已过去</span>':""}
        <span class="fb-time">#${i.id} · ${escapeHtml(VENUE_SOURCE_TEXT[i.source]||i.source)}</span>
      </div>
      <div class="venue-tags">
        <span class="fb-cat">${escapeHtml(venueIdentityText(i))}</span>
        <span class="fb-cat venue-purpose">${escapeHtml(venuePurposeText(i))}</span>
      </div>
      <div class="venue-places-line">${(i.places||[]).map(d=>`<span class="venue-chip">${escapeHtml(venuePlaceLabel(d))}</span>`).join("")}</div>
      <dl class="venue-kv">${u.map(([d,m])=>`<dt>${escapeHtml(d)}</dt><dd>${escapeHtml(m)}</dd>`).join("")}</dl>
      ${i.adminNote?`<p class="venue-note"><b>管理备注</b>${escapeHtml(i.adminNote)}</p>`:""}
      <p class="fb-contact">提交于 ${escapeHtml(formatCnTime(i.createdAt))}${i.updatedAt?` · 修改于 ${escapeHtml(formatCnTime(i.updatedAt))}`:""}${submitMetaHtml(i)}</p>
      <div class="fb-actions">
        ${i.contact?'<button type="button" class="tt-act is-copy" data-venue-act="copy">复制联系方式</button>':""}
        <button type="button" class="tt-act" data-venue-act="edit">修改</button>
        ${i.voided?'<button type="button" class="tt-act is-restore" data-venue-act="restore">恢复</button>':'<button type="button" class="tt-act is-void" data-venue-act="void">作废</button>'}
      </div>
    </div>`}).join(""):`<p class="fb-empty">${t.length?"无匹配结果":"暂无登记"}</p>`}async function refreshVenueAdmin(){const t=await callWorker({action:"venue_admin_list",password:internalAdminPassword});return!t||!t.ok?($("venueAdminStatus").textContent=adminErr(t,"读取失败，请重新登录内部入口后再试"),!1):(venueAdmin.items=t.items,venueAdmin.today=t.today||cnDate(0),venueAdmin.loaded=!0,renderVenueAdmin(),!0)}function openVenueEditor(t=null){venueAdmin.editingId=t?t.id:null;const e=$("venueAdminFields");t?fillVenueForm(e,t):clearVenueForm(e),$("venueEditTitle").textContent=t?`修改登记 #${t.id}`:"新增预约",$("venueAdminSaveBtn").textContent=t?"保存修改":"保存",setMsg($("venueAdminFormMsg"),""),$("venueEditBox").hidden=!1,$("venueNewBtn").disabled=!0,$("venueEditBox").scrollIntoView({behavior:"smooth",block:"start"})}function closeVenueEditor(){venueAdmin.editingId=null,$("venueEditBox").hidden=!0,$("venueNewBtn").disabled=!1,clearVenueForm($("venueAdminFields"))}async function saveVenueAdmin(t){t.preventDefault();const e=$("venueAdminFormMsg"),n=readVenueForm($("venueAdminFields"));if(n.error){setMsg(e,n.error),n.focus?.focus();return}const a=venueAdmin.editingId,s=$("venueAdminSaveBtn");s.disabled=!0,setMsg(e,"");const o=await callWorker({action:"venue_admin_save",password:internalAdminPassword,...a?{id:a}:{},...n.payload});if(s.disabled=!1,!o||!o.ok){setMsg(e,adminErr(o,"保存失败，请重新登录内部入口后再试",VENUE_ERRORS));return}const i=venueAdmin.items.findIndex(l=>l.id===o.item.id);i>=0?venueAdmin.items[i]=o.item:venueAdmin.items.push(o.item),closeVenueEditor(),renderVenueAdmin(),showToast(a?`登记 #${a} 已保存`:`已新增登记 #${o.item.id}`)}async function venueAdminVoid(t,e){const n=$("venueAdminMsg");setMsg(n,"");const a=await callWorker({action:"venue_admin_void",password:internalAdminPassword,id:t.id,voided:e});if(!a||!a.ok){if(a&&a.error==="not_changed"){setMsg(n,"状态已变化，已刷新"),await refreshVenueAdmin();return}setMsg(n,adminErr(a,"操作失败，请重新登录内部入口后再试"));return}const s=venueAdmin.items.findIndex(o=>o.id===a.item.id);s>=0&&(venueAdmin.items[s]=a.item),renderVenueAdmin(),showToast(e?`登记 #${t.id} 已作废`:`登记 #${t.id} 已恢复`)}function initVenueAdmin(){buildVenueForm($("venueAdminFields"),{prefix:"vfa",admin:!0}),["input","change"].forEach(t=>$("venueAdminFields").addEventListener(t,()=>setMsg($("venueAdminFormMsg"),""))),$("venueFilterState").addEventListener("change",renderVenueAdmin),$("venueFilterTime").addEventListener("change",renderVenueAdmin),$("venueRefreshBtn").addEventListener("click",async t=>{const e=t.currentTarget;e.disabled=!0;try{await refreshVenueAdmin()&&showToast("已刷新")}finally{e.disabled=!1}}),$("venueNewBtn").addEventListener("click",()=>openVenueEditor(null)),$("venueAdminCancelBtn").addEventListener("click",closeVenueEditor),$("venueAdminForm").addEventListener("submit",saveVenueAdmin),$("venueAdminList").addEventListener("click",async t=>{const e=t.target.closest("[data-venue-act]");if(!e)return;const n=Number(e.closest("[data-venue-id]").dataset.venueId),a=venueAdmin.items.find(o=>o.id===n);if(!a)return;const s=e.dataset.venueAct;if(s==="copy"){copyText(a.contact,"联系方式已复制",a.contact);return}if(s==="edit"){if(venueAdmin.editingId&&venueAdmin.editingId!==n&&!confirm(`#${venueAdmin.editingId} 的修改尚未保存，放弃并改为修改 #${n}？`))return;openVenueEditor(a);return}if(!(s==="void"&&!confirm(`确定作废登记 #${n}（${venueDateLabel(a.date)} · ${a.charId||a.contact}）吗？

作废后不会删除，切到「已作废」还能恢复。`))){e.disabled=!0;try{await venueAdminVoid(a,s==="void")}finally{e.disabled=!1}}})}const surveyAdmin={items:[],open:!0,lockdown:!1,loaded:!1,readonly:!1},surveyAdminValid=()=>surveyAdmin.items.filter(t=>!t.voided);function surveyAdminSeqMap(){const t=new Map;return surveyAdminValid().forEach((e,n)=>t.set(e.id,n+1)),t}function surveyAdminStats(t){const e={};return SURVEY_FIELDS.forEach(n=>{e[n.key]={n:0,counts:{},sum:0,dist:Array(11).fill(0),texts:[]}}),t.forEach(n=>{const a=n.answers||{};SURVEY_FIELDS.forEach(s=>{const o=a[s.key];if(o==null||o==="")return;const i=e[s.key];if(s.type==="score"){if(!Number.isInteger(o)||o<1||o>10)return;i.n++,i.sum+=o,i.dist[o]++}else if(s.type==="single"||s.type==="multi"){const l=Array.isArray(o)?o:[o];if(!l.length)return;i.n++,l.forEach(u=>{i.counts[u]=(i.counts[u]||0)+1})}else i.n++,i.texts.push({id:n.id,text:String(o)})})}),e}const surveyAvg=t=>t.n?(t.sum/t.n).toFixed(1):"—",surveyPct=(t,e)=>e?Math.round(t/e*100):0;function surveyTextsHtml(t,e,n){return e.length?`<details class="sv-texts"><summary>${escapeHtml(t)}（${e.length} 条）</summary><ul>`+e.map(a=>`<li><span class="sv-text-id">${n.has(a.id)?`第 ${n.get(a.id)} 份`:`#${a.id}`}</span>${escapeHtml(a.text)}</li>`).join("")+"</ul></details>":""}function renderSurveyAdminStats(){const t=surveyAdminValid(),e=$("surveyAdminStats");if(!t.length){e.innerHTML=`<p class="fb-empty">${surveyAdmin.items.length?"暂无有效答卷":"暂无答卷"}</p>`;return}const n=surveyAdminStats(t),a=surveyAdminSeqMap(),o='<div class="sv-overview"><p class="sv-stat-sec">评分一览（平均分，满分 10 分）</p><dl class="sv-overview-list">'+[...SURVEY_ITEMS.filter(l=>l.kind==="score"&&!l.card),...SURVEY_ITEMS.filter(l=>l.kind==="score"&&l.card)].map(l=>{const u=n[l.key];return`<div class="sv-ov-item${u.n?"":" is-empty"}"><dt>${escapeHtml(l.card?`项目 · ${l.card.title}`:l.short||l.label)}</dt><dd><b>${surveyAvg(u)}</b><small>${u.n} 人</small></dd></div>`}).join("")+"</dl></div>",i=SURVEY.sections.map((l,u)=>{const d=SURVEY_ITEMS.filter(m=>m.section===u).map(m=>{const h=n[m.key];if(m.kind==="choice"){const w=Math.max(1,...m.options.map(p=>h.counts[p.key]||0)),b=m.options.map(p=>{const r=h.counts[p.key]||0;return`<div class="sv-bar-row"><span class="sv-bar-key">${escapeHtml(p.label)}</span><span class="sv-bar"><i style="width:${r/w*100}%"></i></span><span class="sv-bar-n">${r}<small>${surveyPct(r,h.n)}%</small></span></div>`}).join(""),c=m.other?surveyTextsHtml("其他",n[m.other.key].texts,a):"";return`<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(m.label)}</p><p class="sv-stat-meta">${h.n} 人作答</p><div class="sv-bars">${b}</div>${c}</div>`}if(m.kind==="score"){const w=Math.max(1,...h.dist.slice(1)),b=h.dist.slice(1).map((r,v)=>`<span class="sv-hist-col" title="${v+1} 分：${r} 人"><span class="sv-hist-bar"><i style="height:${r/w*100}%"></i></span><span class="sv-hist-n">${r}</span><span class="sv-hist-k">${v+1}</span></span>`).join(""),c=m.comment?surveyTextsHtml("意见或建议",n[m.comment.key].texts,a):"",p=m.card?`${escapeHtml(m.card.title)}<small>${escapeHtml(m.card.sub)}</small>`:escapeHtml(m.label);return`<div class="sv-stat${m.card?" is-card":""}"><p class="sv-stat-title">${p}</p><p class="sv-stat-meta">${h.n?`${h.n} 人 · 平均 <b>${surveyAvg(h)}</b> 分`:"暂无评分"}</p>`+(h.n?`<div class="sv-hist" aria-label="1～10 分各有多少人">${b}</div>`:"")+c+"</div>"}return`<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(m.label)}</p><p class="sv-stat-meta">${h.n?`${h.n} 条`:"暂无"}</p>`+surveyTextsHtml("展开查看",h.texts,a)+"</div>"}).join("");return`<p class="sv-stat-sec">${SURVEY_SECTION_NO[u]||u+1}、${escapeHtml(l.title)}</p>${d}`}).join("");e.innerHTML=o+i}function renderSurveyAdminList(){const t=$("surveyFilterState").value,e=surveyAdminSeqMap(),n=surveyAdmin.items.filter(a=>!t||(t==="void"?a.voided:!a.voided)).slice().sort((a,s)=>s.id-a.id);$("surveyAdminList").innerHTML=n.length?n.map(a=>{const s=a.answers||{},o=SURVEY_FIELDS.filter(i=>s[i.key]!==void 0&&s[i.key]!=="").map(i=>{const l=i.type==="score"?`${s[i.key]} 分`:surveyAnswerText(i.key,s[i.key]);return`<dt>${escapeHtml(surveyFieldHeader(i.key))}</dt><dd>${escapeHtml(l)}</dd>`}).join("");return`<div class="fb-item venue-item survey-item${a.voided?" is-void":""}" data-sv-id="${a.id}">
      <div class="fb-head">
        <span class="venue-date">${a.voided?`#${a.id}`:`第 ${e.get(a.id)} 份`}</span>
        ${a.voided?'<span class="venue-tag is-void">已作废</span>':""}
        <span class="fb-time">#${a.id} · ${escapeHtml(formatCnTime(a.createdAt))}</span>
        ${submitMetaHtml(a)}
      </div>
      <dl class="venue-kv">${o}</dl>
      <div class="fb-actions">
        ${s.contact?'<button type="button" class="tt-act is-copy" data-sv-act="copy">复制联系方式</button>':""}
        ${surveyAdmin.readonly?"":a.voided?'<button type="button" class="tt-act is-restore" data-sv-act="restore">恢复</button>':'<button type="button" class="tt-act is-void" data-sv-act="void">作废</button>'}
      </div>
    </div>`}).join(""):`<p class="fb-empty">${surveyAdmin.items.length?"无匹配结果":"暂无答卷"}</p>`}function renderSurveyAdmin(){const t=surveyAdmin.items,e=surveyAdminValid().length,n=t.length-e;$("surveyAdminStatus").textContent=t.length?`共 ${t.length} 份 · 有效 ${e} 份${n?` · 已作废 ${n} 份`:""}`:"暂无答卷",setTicketSwitch($("surveyOpenBtn"),surveyAdmin.open,"已开放（点击关闭）","已关闭（点击开放）"),$("surveyLockNote").hidden=!surveyAdmin.lockdown;const a=$("surveyViewSelect").value;$("surveyFilterState").hidden=a!=="list",$("surveyAdminStats").hidden=a!=="stats",$("surveyAdminList").hidden=a!=="list",a==="list"?renderSurveyAdminList():renderSurveyAdminStats()}async function refreshSurveyAdmin(){const t=await callWorker({action:"survey_admin_list",password:internalAdminPassword||internalViewPassword,survey:SURVEY.id});return!t||!t.ok?($("surveyAdminStatus").textContent=t?.error==="viewer_closed"?"未开放":adminErr(t,"读取失败",{bad_survey:`问卷「${SURVEY.id}」不存在`}),!1):(surveyAdmin.readonly=!!t.readonly,$("surveyAdminPanel").classList.toggle("is-readonly",surveyAdmin.readonly),surveyAdmin.items=Array.isArray(t.items)?t.items:[],surveyAdmin.open=t.open!==!1,surveyAdmin.lockdown=!!t.lockdown,surveyAdmin.loaded=!0,renderSurveyAdmin(),!0)}async function exportSurveyExcel(){const t=await loadExcelJs(),e=new t.Workbook,n=surveyAdminValid(),a={bold:!0},s=e.addWorksheet("答卷");s.addRow(["第几份","编号","提交时间","IP 属地","验证方式",...SURVEY_FIELDS.map(d=>surveyFieldHeader(d.key))]),s.getRow(1).font=a,n.forEach((d,m)=>{const h=d.answers||{};s.addRow([m+1,d.id,formatCnTime(d.createdAt),geoText(d.geo),verifyModeText(d.verifyMode),...SURVEY_FIELDS.map(w=>{const b=h[w.key];return w.type==="score"?typeof b=="number"?b:null:surveyAnswerText(w.key,b)||null})])}),s.getColumn(1).width=7,s.getColumn(2).width=7,s.getColumn(3).width=18,s.getColumn(4).width=12,s.getColumn(5).width=10,SURVEY_FIELDS.forEach((d,m)=>{s.getColumn(m+6).width=d.type==="score"?12:d.type==="text"?30:24}),s.views=[{state:"frozen",xSplit:1,ySplit:1}];const o=surveyAdminStats(n),i=e.addWorksheet("统计");i.addRow([`有效答卷 ${n.length} 份`]).font=a,i.addRow([]),i.addRow(["打分题","作答人数","平均分",...Array.from({length:10},(d,m)=>`${m+1}分`)]).font=a,SURVEY_ITEMS.filter(d=>d.kind==="score").forEach(d=>{const m=o[d.key];i.addRow([d.card?`${d.card.title}（${d.card.sub}）`:d.label,m.n,m.n?Number((m.sum/m.n).toFixed(2)):null,...m.dist.slice(1)])}),i.addRow([]),i.addRow(["选择题","选项","人数","占作答人数"]).font=a,SURVEY_ITEMS.filter(d=>d.kind==="choice").forEach(d=>{const m=o[d.key];d.options.forEach((h,w)=>{const b=m.counts[h.key]||0;i.addRow([w===0?`${d.label}（${m.n} 人作答）`:"",h.label,b,m.n?`${surveyPct(b,m.n)}%`:"—"])})}),i.getColumn(1).width=52,i.getColumn(2).width=28;for(let d=3;d<=13;d++)i.getColumn(d).width=9;const l=e.addWorksheet("文字意见");l.addRow(["题目","第几份","编号","内容"]).font=a;const u=surveyAdminSeqMap();SURVEY_FIELDS.filter(d=>d.type==="text").forEach(d=>{o[d.key].texts.forEach(m=>l.addRow([surveyFieldHeader(d.key),u.get(m.id),m.id,m.text]))}),l.getColumn(1).width=34,l.getColumn(2).width=8,l.getColumn(3).width=7,l.getColumn(4).width=80,l.getColumn(4).alignment={wrapText:!0,vertical:"top"},await saveWorkbook(e,`花街活动问卷_${SURVEY.id}`)}async function surveyAdminVoid(t,e){const n=$("surveyAdminMsg");setMsg(n,"");const a=await callWorker({action:"survey_admin_void",password:internalAdminPassword,id:t.id,voided:e});if(!a||!a.ok){if(a&&a.error==="not_changed"){setMsg(n,"这份答卷的状态已经变过了，已为你刷新"),await refreshSurveyAdmin();return}setMsg(n,adminErr(a,"操作失败，请重新登录内部入口后再试"));return}const s=surveyAdmin.items.findIndex(o=>o.id===a.item.id);s>=0&&(surveyAdmin.items[s]=a.item),renderSurveyAdmin(),showToast(e?`答卷 #${t.id} 已作废`:`答卷 #${t.id} 已恢复`)}function initSurveyAdmin(){$("surveyViewSelect").addEventListener("change",renderSurveyAdmin),$("surveyFilterState").addEventListener("change",renderSurveyAdmin),$("surveyRefreshBtn").addEventListener("click",async t=>{const e=t.currentTarget;e.disabled=!0;try{await refreshSurveyAdmin()&&showToast("已刷新")}finally{e.disabled=!1}}),$("surveyOpenBtn").addEventListener("click",async t=>{const e=t.currentTarget,n=!surveyAdmin.open;if(!(!n&&!confirm(`确定关闭问卷吗？

关闭后访客看到「问卷已经结束收集」，不能再提交；已经收到的答卷不受影响，之后随时可以再开放。`))){setMsg($("surveyAdminMsg"),""),e.disabled=!0;try{const a=await callWorker({action:"survey_admin_set",password:internalAdminPassword,survey:SURVEY.id,open:n});if(!a||!a.ok){setMsg($("surveyAdminMsg"),adminErr(a,"切换失败，请重新登录内部入口后再试"));return}surveyAdmin.open=a.open,renderSurveyAdmin(),showToast(a.open?"问卷已开放":"问卷已关闭")}finally{e.disabled=!1}}}),$("surveyExportBtn").addEventListener("click",async t=>{const e=t.currentTarget,n=$("surveyAdminMsg");setMsg(n,""),e.disabled=!0;try{if(!await refreshSurveyAdmin()){setMsg(n,"读取问卷数据失败，未导出");return}if(!surveyAdminValid().length){setMsg(n,"暂无有效答卷");return}await exportSurveyExcel()}catch(a){console.error(a),setMsg(n,"导出失败：表格组件加载不出来，检查一下网络后再试")}finally{e.disabled=!1}}),$("surveyCopyLinkBtn").addEventListener("click",()=>{const t=`${location.origin}${location.pathname}${SURVEY_HASH}`;copyText(t,"问卷链接已复制",t)}),$("surveyAdminList").addEventListener("click",async t=>{const e=t.target.closest("[data-sv-act]");if(!e)return;const n=Number(e.closest("[data-sv-id]").dataset.svId),a=surveyAdmin.items.find(o=>o.id===n);if(!a)return;const s=e.dataset.svAct;if(s==="copy"){copyText(a.answers.contact,"联系方式已复制",a.answers.contact);return}if(!(s==="void"&&!confirm(`作废答卷 #${n}？`))){e.disabled=!0;try{await surveyAdminVoid(a,s==="void")}finally{e.disabled=!1}}})}const popupAdmin={saved:null,imageUrl:null,loaded:!1},popupFormValue=()=>({title:$("popupTitleInput").value.trim(),body:$("popupBodyInput").value.replace(/\r\n?/g,`
`).trim(),image_url:popupAdmin.imageUrl||null});function popupFormDirty(){const t=popupAdmin.saved;if(!t)return!1;const e=popupFormValue();return e.title!==(t.title||"")||e.body!==(t.body||"")||e.image_url!==(t.image_url||null)}function updatePopupBodyCount(){$("popupBodyCount").textContent=`${$("popupBodyInput").value.length} / 3000`}function renderPopupAdminStatus(){const t=popupAdmin.saved,e=$("popupToggleBtn");if(!t){$("popupAdminStatus").textContent="当前状态：读取失败",e.disabled=!0;return}const n=t.updated_at?` · 更新于 ${formatCnTime(t.updated_at)}`:"";$("popupAdminStatus").textContent=`当前状态：${t.enabled?"已开启":"已关闭"}${n}`,e.textContent=t.enabled?"关闭弹窗":"开启弹窗",e.disabled=!1}function fillPopupAdminForm(t){$("popupTitleInput").value=t.title||"",$("popupBodyInput").value=t.body||"",popupAdmin.imageUrl=t.image_url||null,showImagePreview("popupImage",popupAdmin.imageUrl),updatePopupBodyCount()}async function refreshPopupAdmin(){$("popupAdminStatus").textContent="当前状态：加载中…",$("popupToggleBtn").disabled=!0,setMsg($("popupAdminMsg"),"");const t=await callWorker({action:"popup_admin_get",password:internalAdminPassword});if(!t||!t.ok){popupAdmin.saved=null,renderPopupAdminStatus(),setMsg($("popupAdminMsg"),adminErr(t,"读取失败，请重新登录内部入口后再试"));return}const e=popupAdmin.loaded&&popupFormDirty();popupAdmin.saved=t.popup,popupAdmin.loaded=!0,e||fillPopupAdminForm(t.popup),renderPopupAdminStatus(),e&&setMsg($("popupAdminMsg"),"有未保存的修改")}const POPUP_ERRORS={empty:"标题、正文、配图至少填写一项",title_too_long:"标题最多 60 字",body_too_long:"正文最多 3000 字",bad_image_url:"配图无效，请重新上传"};async function savePopupAdmin(t={}){const e=popupFormValue();if(!e.title&&!e.body&&!e.image_url)return setMsg($("popupAdminMsg"),POPUP_ERRORS.empty),!1;const n=await callWorker({action:"popup_admin_save",password:internalAdminPassword,title:e.title,content:e.body,image_url:e.image_url,...t});return!n||!n.ok?(setMsg($("popupAdminMsg"),adminErr(n,"保存失败，请重新登录内部入口后再试",{...POPUP_ERRORS,auth:"登录状态失效了，重新登录内部入口后再试"})),!1):(popupAdmin.saved=n.popup,fillPopupAdminForm(n.popup),renderPopupAdminStatus(),setMsg($("popupAdminMsg"),""),!0)}function initPopupAdmin(){$("popupBodyInput").addEventListener("input",updatePopupBodyCount),bindImageUpload("popupImage",2560,t=>{popupAdmin.imageUrl=t,showImagePreview("popupImage",t),t&&setMsg($("popupImageStatus"),"已上传，记得点「保存」")},{notImage:"只能选图片",tooBig:t=>`图片太大了（${(t.size/1024/1024).toFixed(1)}MB），限 50MB`,processing:"图片处理中…",decodeFail:"这张图浏览器打不开，换一张试试（或先转成 JPG / PNG）",rateLimited:"上传太频繁了（每小时 10 张），歇一会儿再试",failed:"图片上传失败，请重试"}),$("popupSaveBtn").addEventListener("click",()=>withAdminBusy($("popupSaveBtn"),async()=>{await savePopupAdmin()&&showToast(popupAdmin.saved.enabled?"已保存，访客打开首页会看到新内容":"已保存（弹窗目前是关着的）")})),$("popupPreviewBtn").addEventListener("click",()=>{const t=popupFormValue();if(!t.title&&!t.body&&!t.image_url){setMsg($("popupAdminMsg"),"请先填写内容");return}openSitePopup(t,!0)}),$("popupToggleBtn").addEventListener("click",()=>withAdminBusy($("popupToggleBtn"),async()=>{const t=popupAdmin.saved;if(!t)return;const e=!t.enabled;if(setMsg($("popupAdminMsg"),""),e&&popupFormDirty()){if(!confirm("保存修改并开启弹窗？"))return;await savePopupAdmin({enabled:!0})&&showToast("已保存并开启弹窗");return}const n=await callWorker({action:"popup_admin_set",password:internalAdminPassword,enabled:e});if(!n||!n.ok){setMsg($("popupAdminMsg"),adminErr(n,"切换失败，请重新登录内部入口后再试",{empty:"请先保存内容"}));return}popupAdmin.saved=n.popup,renderPopupAdminStatus(),showToast(e?"弹窗公告已开启":"弹窗公告已关闭")}))}const HUAYU_ADMIN_MAX=2e4,HUAYU_MODE_NAME={open:"完全开放",decrypt:"仅开放解密",off:"彻底关闭"},HUAYU_MODE_NOTE={open:"访客可生成和解读花语",decrypt:"访客仅可解读花语",off:"隐藏入口，拒绝访客请求"},HUAYU_ALGO_NOTE={1:"一代：「听花语：」+ 草木字，篇幅最短",2:"二代：散文句式，长度约为一代的四五倍"},HUAYU_ADMIN_ERRORS={bad_key:"解密失败：密钥错误或花语被改动",need_key:"请输入自定义密钥",bad_key_input:"密钥不能为空，最长 128 字",bad_mode:"参数无效，请刷新页面",bad_algo:"参数无效，请刷新页面",no_key:"请先设置站点密钥",too_long:"内容过长",bad_input:"内容无效",empty:"请输入内容"},huayuAdmin={clearArmedAt:0,resultCopy:"",detectTimer:0};function setHuayuSeg(t,e){$(t).querySelectorAll("input").forEach(n=>{n.checked=n.value===String(e)}),syncSegments($(t))}const huayuSegValue=t=>$(t).querySelector("input:checked")?.value;function renderHuayuAdmin(t){setHuayuSeg("huayuModeSeg",t.mode),setHuayuSeg("huayuAlgoSeg",t.algo),setHuayuSeg("huayuAdminAlgoSeg",t.algo),$("huayuModeNote").textContent=HUAYU_MODE_NOTE[t.mode]||"",$("huayuAlgoNote").textContent=HUAYU_ALGO_NOTE[t.algo]||"",$("huayuAdminStatus").textContent=`当前状态：${HUAYU_MODE_NAME[t.mode]||t.mode} · ${t.algo===1?"一代":"二代"}算法`+(t.updatedAt?` · 更新于 ${formatCnTime(t.updatedAt)}`:"");const e=$("huayuKeyInput");document.activeElement!==e&&(e.value=t.key||""),$("huayuOldText").textContent=t.oldCount?`保留着 ${t.oldCount} 个旧密钥，用它们写的花语仍能解开`:"没有保留旧密钥",$("huayuClearOldBtn").hidden=!t.oldCount,applyHuayuMode(t)}async function refreshHuayuVisits(){const t=$("huayuVisitSummary"),e=await callWorker({action:"huayu_admin_visits",password:internalAdminPassword});if(!e||!e.ok){t.textContent=adminErr(e,"读取失败");return}t.textContent=e.total?`共 ${e.total} 次，今日 ${e.today} 次；显示最近 ${e.items.length} 次`:"暂无记录",$("huayuVisitList").innerHTML=e.items.map(n=>`<li>
    <span class="hy-visit-time">${escapeHtml(formatCnSeconds(n.at))}</span>
    <span title="${escapeHtml(geoTitle(n.geo))}">${escapeHtml(geoText(n.geo)||"—")}</span>
    <span>${escapeHtml(verifyModeText(n.verifyMode)||"—")}</span>
    <span class="hy-visit-id" title="访客标识">${escapeHtml(n.visitor)}</span>
  </li>`).join("")}async function refreshHuayuAdmin(){refreshHuayuVisits(),$("huayuAdminStatus").textContent="当前状态：加载中…",setMsg($("huayuSettingMsg"),""),loadHuayuJs().catch(()=>{});const t=await callWorker({action:"huayu_admin_get",password:internalAdminPassword});if(!t||!t.ok){$("huayuAdminStatus").textContent=adminErr(t,"读取失败，请重新登录内部入口后再试");return}renderHuayuAdmin(t)}async function saveHuayuAdmin(t,e,n){const a=$("huayuSettingMsg");setMsg(a,""),n&&(n.disabled=!0);const s=await callWorker({action:"huayu_admin_set",password:internalAdminPassword,...t});return n&&(n.disabled=!1),!s||!s.ok?(setMsg(a,adminErr(s,"保存失败，请重新登录内部入口后再试",HUAYU_ADMIN_ERRORS)),!1):(renderHuayuAdmin(s),showToast(e),!0)}function syncHuayuAdminKeySeg(){syncSegments($("huayuAdminKeySeg"));const t=huayuSegValue("huayuAdminKeySeg")==="custom";return $("huayuAdminCustomKey").hidden=!t,t}function syncHuayuAdminInput(){clearTimeout(huayuAdmin.detectTimer),$("huayuAdminInput").value.length>HUAYU_DETECT_NOW?huayuAdmin.detectTimer=setTimeout(syncHuayuAdminInputNow,300):syncHuayuAdminInputNow()}function syncHuayuAdminInputNow(){const t=$("huayuAdminInput").value,e=window.HJHuayu;if(!e||!t){$("huayuAdminCount").textContent=t?`${t.length} 字`:"";return}const n=e.detect(t);if(!n.ok){$("huayuAdminCount").textContent=`${e.countChars(t)} 字`;return}$("huayuAdminCount").textContent=`${e.ALGO_NAMES[n.algo]}花语 ${e.countChars(t)} 字`,n.kind===1&&(setHuayuSeg("huayuAdminKeySeg","custom"),syncHuayuAdminKeySeg())}function showHuayuAdminResult(t,e,n,a){$("huayuAdminResultLabel").textContent=t,$("huayuAdminResultMeta").textContent=n,$("huayuAdminResultText").textContent=e,$("huayuAdminCopyBtn").textContent=a,huayuAdmin.resultCopy=e,$("huayuAdminResult").hidden=!1}async function huayuAdminConvert(t,e){const n=$("huayuAdminMsg");setMsg(n,"");try{await loadHuayuJs()}catch{setMsg(n,"花语脚本 huayu.js 没有加载成功（没上传或被缓存挡住），刷新页面再试");return}const a=window.HJHuayu,s=$("huayuAdminInput").value,o=syncHuayuAdminKeySeg(),i=o?$("huayuAdminCustomKey").value.trim():"",l={password:internalAdminPassword};if(!s.trim()){setMsg(n,HUAYU_ADMIN_ERRORS.empty);return}if(o&&!i){setMsg(n,"请输入自定义密钥"),$("huayuAdminCustomKey").focus();return}e.disabled=!0;try{if(t==="seal"){if(a.countChars(s)>HUAYU_ADMIN_MAX){setMsg(n,`最多 ${HUAYU_ADMIN_MAX} 字`);return}const m=Number(huayuSegValue("huayuAdminAlgoSeg"))||2,h=await a.encrypt(s,{algo:m,post:callWorker,auth:l,key:i});if(!h.ok){setMsg(n,adminErr(h.error==="net"?null:h,"加密失败",HUAYU_ADMIN_ERRORS));return}showHuayuAdminResult("花语",h.text,`${a.ALGO_NAMES[m]} · 原文 ${h.plainChars} 字 → 花语 ${h.cipherChars} 字 · ${o?"自定义密钥":"站点密钥"}`,"复制花语");return}const u=await a.decrypt(s,{post:callWorker,auth:l,key:i});if(!u.ok){u.error==="need_key"&&(setHuayuSeg("huayuAdminKeySeg","custom"),syncHuayuAdminKeySeg(),$("huayuAdminCustomKey").focus()),setMsg(n,HUAYU_ERRORS[u.error]&&!HUAYU_ADMIN_ERRORS[u.error]?HUAYU_ERRORS[u.error]:adminErr(u.error==="net"?null:u,"解密失败",HUAYU_ADMIN_ERRORS));return}const d=u.kind===1?"自定义密钥":u.old?"旧的站点密钥":"当前站点密钥";showHuayuAdminResult("原文",u.text,`${a.ALGO_NAMES[u.algo]}花语 ${a.countChars(s)} 字 → 原文 ${a.countChars(u.text)} 字 · ${d}`,"复制原文")}finally{e.disabled=!1}}function initHuayuAdmin(){$("huayuModeSeg").addEventListener("change",async t=>{const e=t.target.value;syncSegments($("huayuModeSeg")),$("huayuModeNote").textContent=HUAYU_MODE_NOTE[e]||"",await saveHuayuAdmin({mode:e},`花语访客端：${HUAYU_MODE_NAME[e]}`)||refreshHuayuAdmin()}),$("huayuAlgoSeg").addEventListener("change",async t=>{const e=Number(t.target.value);syncSegments($("huayuAlgoSeg")),$("huayuAlgoNote").textContent=HUAYU_ALGO_NOTE[e]||"",await saveHuayuAdmin({algo:e},`访客写花语改用${e===1?"一代":"二代"}算法`)||refreshHuayuAdmin()}),$("huayuKeyShow").addEventListener("change",t=>{$("huayuKeyInput").type=t.target.checked?"text":"password"}),$("huayuKeySaveBtn").addEventListener("click",t=>{const e=$("huayuKeyInput").value.trim();if(!e){setMsg($("huayuSettingMsg"),"密钥不能为空");return}saveHuayuAdmin({key:e},"站点密钥已保存",t.currentTarget)}),$("huayuKeyInput").addEventListener("keydown",t=>{t.key==="Enter"&&$("huayuKeySaveBtn").click()}),$("huayuKeyRandomBtn").addEventListener("click",t=>{saveHuayuAdmin({randomKey:!0},"已换成一个随机密钥",t.currentTarget)}),$("huayuClearOldBtn").addEventListener("click",t=>{const e=t.currentTarget;if(Date.now()-huayuAdmin.clearArmedAt>4e3){huayuAdmin.clearArmedAt=Date.now(),e.textContent="再点一次确认清除",setTimeout(()=>{Date.now()-huayuAdmin.clearArmedAt>=4e3&&(e.textContent="清除旧密钥")},4100);return}huayuAdmin.clearArmedAt=0,e.textContent="清除旧密钥",saveHuayuAdmin({clearOld:!0},"旧密钥已清除",e)}),$("huayuAdminAlgoSeg").addEventListener("change",t=>syncSegments(t.currentTarget)),$("huayuAdminKeySeg").addEventListener("change",syncHuayuAdminKeySeg),$("huayuAdminInput").addEventListener("input",()=>{syncHuayuAdminInput(),setMsg($("huayuAdminMsg"),"")}),$("huayuAdminSealBtn").addEventListener("click",t=>huayuAdminConvert("seal",t.currentTarget)),$("huayuAdminOpenBtn").addEventListener("click",t=>huayuAdminConvert("open",t.currentTarget)),$("huayuAdminCopyBtn").addEventListener("click",()=>{copyText(huayuAdmin.resultCopy,"已复制","复制失败，请手动选中复制")}),$("huayuVisitRefreshBtn").addEventListener("click",refreshHuayuVisits)}const ADMIN_PANELS_HTML=`
<div class="gate-card admin-card" id="lockdownPanel" hidden>
<h2>分享功能开关</h2>
<p class="hint">关闭后为纯静态展示：活动群、复制附言、场地登记、问卷、点赞不可用。</p>
<p class="hint" id="lockdownStatus">当前状态：加载中…</p>
<button id="lockdownToggleBtn">切换</button>
<p class="form-msg" id="lockdownMsg" hidden></p>
</div>
<div class="gate-card admin-card" id="captchaPanel" hidden>
<h2>人机验证开关</h2>
<p class="hint">关闭后全站不进行人机验证，仅用于压力测试。</p>
<p class="hint" id="captchaStatus">当前状态：加载中…</p>
<button id="captchaToggleBtn">切换</button>
<p class="form-msg" id="captchaSwitchMsg" hidden></p>
</div>
<div class="gate-card admin-card" id="starlightPanel" hidden>
<h2>星芒节时间覆盖</h2>
<p class="hint">星芒节期间游戏内全境下雪，设置的时段内天气显示为小雪。</p>
<p class="hint" id="starlightStatus">当前状态：加载中…</p>
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
<button id="starlightClearBtn" type="button">清除</button>
</div>
<p class="form-msg" id="starlightMsg" hidden></p>
</div>
<div class="gate-card admin-card ticket-admin" id="ticketAdminPanel" hidden>
<h2>活动购票管理</h2>
<p class="hint" id="ticketAdminStatus">加载中…</p>
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
<span class="ticket-admin-key">标题后缀「测试」</span>
<button type="button" class="ticket-switch" id="ticketTestBtn" aria-pressed="false">—</button>
</div>
<p class="ticket-sched-note ticket-title-preview" id="ticketTitlePreview" hidden></p>
<div class="ticket-admin-row">
<span class="ticket-admin-key">购票开放</span>
<button type="button" class="ticket-switch" id="ticketOpenBtn" aria-pressed="false">—</button>
</div>
<div class="ticket-admin-row ticket-sched-row">
<span class="ticket-admin-key">定时开关</span>
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
<p class="ta-group-hint">两次刷新之间为一轮，未售出的票不结转。</p>
<div class="ta-round" id="ticketRoundBox"></div>
<div class="ticket-admin-row">
<label class="ticket-admin-key" for="ticketExtraInput">本轮临时加票</label>
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
<label class="ticket-admin-key" for="ticketResetInput">每日刷新时间</label>
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
<p class="ta-sub-title">自定义刷新点</p>
<p class="ta-group-hint">到点开始新一轮并使用该票额；与每日刷新同一分钟时以此为准。</p>
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
<option value="full">具体张数</option>
<option value="range">大致范围</option>
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
<span class="ticket-admin-key">向访客显示超额标记</span>
<button type="button" class="ticket-switch" data-ta-flag="showOver" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="已显示超额标记" data-toast-off="已隐藏超额标记">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">向访客显示重复标记</span>
<button type="button" class="ticket-switch" data-ta-flag="showDup" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="已显示重复标记" data-toast-off="已隐藏重复标记">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">购票留言栏</span>
<button type="button" class="ticket-switch" data-ta-flag="messageOn" data-on="有（点击去掉）" data-off="没有（点击加上）"
data-toast-on="已开启留言栏" data-toast-off="已关闭留言栏">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">显示网站标题（标题、地址、时间天气）</span>
<button type="button" class="ticket-switch" data-ta-flag="showBrand" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="购票页显示网站标题" data-toast-off="购票页不显示网站标题、地址和时间天气">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">与首页隔离</span>
<button type="button" class="ticket-switch" data-ta-flag="isolated" data-on="已隔离（点击取消）" data-off="不隔离（点击隔离）"
data-toast-on="购票页已与首页隔离" data-toast-off="已取消隔离"
data-confirm-on="与首页隔离？&#10;&#10;购票页将没有返回按钮，首页不显示入口，停留时限失效。">—</button>
</div>
<div class="ticket-admin-row ta-idle-row">
<label class="ticket-admin-key" for="ticketIdleInput">停留时限（分钟，0 为不限）</label>
<span class="ticket-limit-edit">
<input type="number" id="ticketIdleInput" min="0" max="1440" step="1" inputmode="numeric">
<button type="button" id="ticketIdleSaveBtn">保存</button>
</span>
</div>
<div class="ticket-admin-row ta-idle-row">
<span class="ticket-admin-key">向访客显示剩余时间</span>
<button type="button" class="ticket-switch" data-ta-flag="showIdle" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="购票页显示剩余时间" data-toast-off="购票页不显示剩余时间">—</button>
</div>
<p class="ticket-sched-note" id="ticketIdleIsoNote" hidden>已与首页隔离，停留时限不生效。</p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">购票须知</h3>
<div class="ticket-admin-row">
<span class="ticket-admin-key">显示购票须知</span>
<button type="button" class="ticket-switch" data-ta-flag="guideOn" data-on="显示（点击关闭）" data-off="不显示（点击打开）"
data-toast-on="购票须知已开启" data-toast-off="购票须知已关闭：首页入口直接进购票页，购票页也没有须知按钮">—</button>
</div>
<details class="ta-guide" id="ticketGuideEditor">
<summary>编辑购票须知正文 <span id="ticketGuideState"></span></summary>
<div class="ta-guide-help">
<ul>
<li><code>^ 文字</code> 标题上方小字　<code># 文字</code> 大标题　<code>## 文字</code> 小节标题</li>
<li><code>[票价] 名称 | 价格 | 标签 | 时间</code> 票价卡片，连续多行并排</li>
<li><code>### 标题</code> 卡片，连续多张并排</li>
<li><code>1. 文字</code> 有序列表　<code>- 文字</code> 无序列表</li>
<li><code>Q1：问题</code> 问答，其后各行为回答</li>
<li><code>&gt; 文字</code> 结尾说明　<code>-- 文字</code> 署名　<code>---</code> 分隔线</li>
<li><code>**加粗**</code>　<code>__下划线__</code>　网址自动转为链接</li>
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
data-toast-on="只读端可查看售票统计" data-toast-off="只读端不可查看售票统计">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">显示「活动问卷」（只读）</span>
<button type="button" class="ticket-switch" data-ta-flag="viewerSurvey" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
data-toast-on="只读端可查看活动问卷" data-toast-off="只读端不可查看活动问卷">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">可以勾选取票</span>
<button type="button" class="ticket-switch" data-ta-flag="viewerPickup" data-on="可以（点击关闭）" data-off="不可以（点击打开）"
data-toast-on="只读端可以勾选取票了（操作会记日志）" data-toast-off="只读端不可勾选取票">—</button>
</div>
<div class="ticket-admin-row">
<label class="ticket-admin-key" for="ticketLogHoursInput">操作日志合并间隔（小时）</label>
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
<p class="hint" id="venueAdminStatus">加载中…</p>
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
<p class="hint" id="surveyAdminStatus">加载中…</p>
<div class="ticket-admin-row">
<span class="ticket-admin-key">问卷开放</span>
<button type="button" class="ticket-switch" id="surveyOpenBtn" aria-pressed="false">—</button>
</div>
<p class="ticket-sched-note" id="surveyLockNote" hidden>分享功能已关闭，访客暂时无法提交问卷。</p>
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
<p class="hint" id="feedbackAdminStatus">加载中…</p>
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
<p class="hint">开启后访客打开首页时弹出，每次打开网站最多一次；修改内容并保存后会重新弹出。</p>
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
<p class="hint">首页「更多」中的「听得花间语」。明文在浏览器中压缩后由后端加密，密钥仅保存在后端，不保存明文和花语。</p>
<p class="hint" id="huayuAdminStatus">当前状态：加载中…</p>
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
<p class="ta-group-hint">用于访客生成花语；解读时自动识别两代。</p>
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
<p class="ta-group-hint">不受访客端开关限制。自定义密钥生成的花语需输入密钥才能解读。</p>
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
<section class="ta-group">
<h3 class="ta-group-title">打开记录</h3>
<p class="ta-group-hint">访客通过人机验证后打开「听得花间语」的记录，访客标识由 IP 散列得到，不保存 IP 本身。</p>
<p class="ta-group-hint" id="huayuVisitSummary">加载中…</p>
<ol class="hy-visits" id="huayuVisitList"></ol>
<div class="popup-admin-btns"><button type="button" id="huayuVisitRefreshBtn">刷新</button></div>
</section>
</div>
<div class="gate-card admin-card" id="postAnnouncementPanel" hidden>
<h2>发布公告</h2>
<textarea id="announcementText" placeholder="公告内容"></textarea>
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
`;function mountAdminPanels(){$("adminPanelStash").innerHTML=ADMIN_PANELS_HTML}mountAdminPanels(),[initInternal,initAdminPanels,initLockdownToggle,initCaptchaSwitch,initStarlightPanel,initTicketAdmin,initViewerPills,initFeedbackAdmin,typeof window.buildVenueForm=="function"?initVenueAdmin:()=>console.error("[场地预约] venue.js 没有加载成功，管理页的「场地预约」不可用"),typeof window.mountSurvey=="function"?initSurveyAdmin:()=>console.error("[活动问卷] survey.js 没有加载成功，管理页的「活动问卷」不可用"),initPostAnnouncement,initPopupAdmin,initHuayuAdmin].forEach(t=>{try{t()}catch(e){console.error(e)}}),HJ.adminReady=!0;
