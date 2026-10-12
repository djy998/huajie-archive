function adminErr(t,e,n={}){return t?n[t.error]?n[t.error]:t.error==="auth"||!t.error?"登录已失效，请重新登录":t.error==="rate_limited"?"操作过于频繁，请稍后再试":t.error==="server_error"?"服务器出错，请稍后再试":e:"连接失败，检查一下网络后再试"}const VERIFY_MODE_NAMES={cf:"自动验证",ff14:"狒科生",poem:"文科生",math:"理科生",manual:"手动验证",off:"验证已关闭"},CN_REGIONS={Beijing:"北京",Tianjin:"天津",Hebei:"河北",Shanxi:"山西","Inner Mongolia":"内蒙古",Liaoning:"辽宁",Jilin:"吉林",Heilongjiang:"黑龙江",Shanghai:"上海",Jiangsu:"江苏",Zhejiang:"浙江",Anhui:"安徽",Fujian:"福建",Jiangxi:"江西",Shandong:"山东",Henan:"河南",Hubei:"湖北",Hunan:"湖南",Guangdong:"广东",Guangxi:"广西",Hainan:"海南",Chongqing:"重庆",Sichuan:"四川",Guizhou:"贵州",Yunnan:"云南",Tibet:"西藏",Shaanxi:"陕西",Gansu:"甘肃",Qinghai:"青海",Ningxia:"宁夏",Xinjiang:"新疆"},COUNTRY_SHORT={HK:"香港",MO:"澳门",TW:"台湾",XX:"未知",T1:"未知"};let countryNames=null;function countryName(t){if(COUNTRY_SHORT[t])return COUNTRY_SHORT[t];try{return countryNames??=new Intl.DisplayNames(["zh-CN"],{type:"region"}),countryNames.of(t)||t}catch{return t}}function geoText(t){const[e="",n=""]=String(t||"").split("|");if(!e)return"";if(e!=="CN")return[countryName(e),n].filter(Boolean).join(" ");const a=Object.keys(CN_REGIONS).find(s=>n===s||n.startsWith(s+" "));return a?CN_REGIONS[a]:["中国",n].filter(Boolean).join(" ")}const geoTitle=t=>String(t||"").split("|").filter(Boolean).join(" / "),verifyModeText=t=>VERIFY_MODE_NAMES[t]||"";function submitMetaHtml(t){const e=[geoText(t.geo),verifyModeText(t.verifyMode)].filter(Boolean).join(" · ");return e?`<span class="submit-meta" title="${escapeHtml(geoTitle(t.geo))}">${escapeHtml(e)}</span>`:""}let internalAdminPassword=null,editingAnnouncementId=null,pendingAnnouncementImageUrl=null;const PW_FAIL_CAPTCHA_EVERY=5,getPwFailCount=()=>Number(storage.get(STORE.pwFails))||0;function setPwFailCount(t){t>0?storage.set(STORE.pwFails,t):storage.remove(STORE.pwFails)}function initInternal(){$("internalSubmit").addEventListener("click",checkInternalPassword),$("internalPassword").addEventListener("keydown",t=>{t.key==="Enter"&&checkInternalPassword()}),$("internalPasswordShow").addEventListener("change",t=>{$("internalPassword").type=t.target.checked?"text":"password"})}async function checkInternalPassword(){const t=$("internalPassword"),e=$("internalMsg"),n=$("internalSubmit");if(!WORKER_URL){setMsg(e,"数据库还没配置好，暂时无法验证密码。");return}n.disabled=!0,setMsg(e,"验证中…");const a=await callWorker({action:"get_announcements",password:t.value});if(n.disabled=!1,!a){setMsg(e,"连接失败，检查一下网络后再试");return}if(a.error==="viewer_closed"){setMsg(e,viewerClosedText(a.openAt));return}if(!a.ok){const s=getPwFailCount()+1;setPwFailCount(s),s%PW_FAIL_CAPTCHA_EVERY===0?(setMsg(e,"密码错误次数过多，请完成人机验证"),openCaptcha("internal")):setMsg(e,"密码错误");return}if(setPwFailCount(0),setMsg(e,""),$("internalGate").hidden=!0,a.isViewer){enterTicketViewer(t.value,a.perms);return}$("internalBoard").hidden=!1,renderAnnouncements(a.items,a.isAdmin),$("adminPills").hidden=!a.isAdmin,a.isAdmin&&(internalAdminPassword=t.value,startAdminNewWatch())}const viewerClosedText=t=>Number(t)>0?`「购票情况」暂未开放，将于 ${formatCnTime(Number(t))} 开放`:"「购票情况」已关闭";function announcementDate(t){const e=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(t||"")),n=e?new Date(Date.UTC(+e[1],+e[2]-1,+e[3],+e[4],+e[5],+e[6])):new Date(t);return Number.isNaN(n.getTime())?"":n.toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai"})}function renderAnnouncements(t,e){const n=$("announcementList");if(!t||!t.length){n.innerHTML='<div class="empty-note">暂无公告</div>';return}n.innerHTML=t.map(a=>{let s="",d="";if(e){const u=[a.show_a&&"A",a.show_b&&"B"].filter(Boolean);s=`<span class="announcement-audience">[${u.length?u.join("+"):"不可见"}]</span>`,d=`
        <div class="announcement-admin-btns">
          <button type="button" class="announcement-edit-btn" data-id="${a.id}">编辑</button>
          <button type="button" class="announcement-delete-btn" data-id="${a.id}">删除</button>
        </div>`}const i=a.image_url?`<img src="${escapeHtml(workerImageUrl(a.image_url))}" loading="lazy" class="announcement-image" data-lightbox>`:"";return`
      <div class="announcement">
        <div class="date">${escapeHtml(announcementDate(a.created_at))}${s}</div>
        <div class="body">${escapeHtml(a.body)}</div>
        ${i}
        ${d}
      </div>`}).join(""),e&&(n.querySelectorAll(".announcement-edit-btn").forEach(a=>{a.addEventListener("click",()=>{const s=t.find(d=>String(d.id)===a.dataset.id);s&&startEditAnnouncement(s)})}),n.querySelectorAll(".announcement-delete-btn").forEach(a=>{a.addEventListener("click",()=>deleteAnnouncement(a.dataset.id))}))}async function refreshAnnouncements(){const t=await callWorker({action:"get_announcements",password:internalAdminPassword});t&&t.ok&&renderAnnouncements(t.items,t.isAdmin)}const IMAGE_MAX_BYTES=50*1024*1024;function showImagePreview(t,e){const n=$(`${t}PreviewImg`);e?n.src=workerImageUrl(e):n.removeAttribute("src"),$(`${t}Preview`).hidden=!e}const readAsDataURL=t=>new Promise((e,n)=>{const a=new FileReader;a.onload=()=>e(a.result),a.onerror=()=>n(new Error("read fail")),a.readAsDataURL(t)});async function compressImage(t,e){const n=URL.createObjectURL(t);try{const a=await new Promise((s,d)=>{const i=new Image;i.onload=()=>s(i),i.onerror=()=>d(new Error("decode fail")),i.src=n});for(const[s,d]of[[1,.88],[1,.8],[.78,.8],[.62,.75]]){const i=Math.min(1,e*s/Math.max(a.naturalWidth,a.naturalHeight)),u=document.createElement("canvas");u.width=Math.max(1,Math.round(a.naturalWidth*i)),u.height=Math.max(1,Math.round(a.naturalHeight*i)),u.getContext("2d").drawImage(a,0,0,u.width,u.height);const c=await new Promise(p=>u.toBlob(p,"image/webp",d));if(!c)throw new Error("encode fail");const o=(await readAsDataURL(c)).split(",")[1];if(o.length<=7.5*1024*1024)return{base64:o,contentType:c.type||"image/webp"}}throw new Error("too large")}finally{URL.revokeObjectURL(n)}}const IMAGE_UPLOAD_TEXT={notImage:"请选择图片",tooBig:()=>"图片不能超过 50MB",processing:"处理中…",decodeFail:"无法读取该图片",rateLimited:"上传过于频繁，请稍后再试",failed:"上传失败，请重试"};function bindImageUpload(t,e,n,a=IMAGE_UPLOAD_TEXT){const s=$(`${t}Input`),d=$(`${t}PickBtn`),i=$(`${t}Status`);d.addEventListener("click",()=>s.click()),$(`${t}RemoveBtn`).addEventListener("click",()=>n(null)),s.addEventListener("change",async()=>{const u=s.files[0];if(s.value="",!!u){if(!u.type.startsWith("image/")){setMsg(i,a.notImage);return}if(u.size>IMAGE_MAX_BYTES){setMsg(i,a.tooBig(u));return}setMsg(i,a.processing),d.disabled=!0;try{const{base64:c,contentType:o}=await compressImage(u,e);setMsg(i,"上传中…");const p=await callWorker({action:"upload_announcement_image",password:internalAdminPassword,image:c,content_type:o});if(!p?.ok)throw new Error(p?.error||"upload failed");setMsg(i,""),n(new URL(`image/${p.key}`,workerBase()).href)}catch(c){setMsg(i,c.message==="decode fail"?a.decodeFail:c.message==="rate_limited"?a.rateLimited:a.failed)}d.disabled=!1}})}function setAnnouncementImage(t){pendingAnnouncementImageUrl=t,showImagePreview("announcementImage",t)}function startEditAnnouncement(t){openAdminPanel("postAnnouncementPanel"),editingAnnouncementId=t.id,$("announcementText").value=t.body,$("announceShowA").checked=!!t.show_a,$("announceShowB").checked=!!t.show_b,setAnnouncementImage(t.image_url||null),$("postAnnouncementBtn").textContent="保存修改",$("cancelEditAnnouncementBtn").hidden=!1,$("announcementText").focus({preventScroll:!0})}function cancelEditAnnouncement(){editingAnnouncementId=null,setAnnouncementImage(null),$("announcementText").value="",$("announceShowA").checked=!0,$("announceShowB").checked=!0,$("postAnnouncementBtn").textContent="发布",$("cancelEditAnnouncementBtn").hidden=!0}async function deleteAnnouncement(t){if(!confirm("确定要删除这条公告吗？删除后无法恢复。"))return;const e=await callWorker({action:"delete_announcement",password:internalAdminPassword,id:t});if(!e||!e.ok){showToast("删除失败，请重试");return}showToast("已删除"),String(editingAnnouncementId)===String(t)&&cancelEditAnnouncement(),refreshAnnouncements()}async function submitAnnouncement(){const t=$("announcementText"),e=$("postAnnouncementMsg"),n=$("postAnnouncementBtn"),a=!!editingAnnouncementId;if(setMsg(e,""),!t.value.trim()){setMsg(e,"请填写内容");return}n.disabled=!0;const s=await callWorker({action:a?"edit_announcement":"post_announcement",password:internalAdminPassword,id:editingAnnouncementId,content:t.value,show_a:$("announceShowA").checked,show_b:$("announceShowB").checked,image_url:pendingAnnouncementImageUrl});if(n.disabled=!1,!s||!s.ok){setMsg(e,a?"保存失败，请重试":"发布失败，请重试");return}cancelEditAnnouncement(),closeAdminPanel(),showToast(a?"公告已更新":"公告已发布"),refreshAnnouncements()}function initPostAnnouncement(){$("cancelEditAnnouncementBtn").addEventListener("click",cancelEditAnnouncement),$("postAnnouncementBtn").addEventListener("click",submitAnnouncement),bindImageUpload("announcementImage",1600,setAnnouncementImage)}let internalViewPassword=null,ticketViewTimer=0;function enterTicketViewer(t,e){internalViewPassword=t,ticketAdmin.role="viewer",ticketAdmin.perms=e||{stats:!0,survey:!1,pickup:!1},ticketAdmin.tab="orders";const n=$("ticketAdminPanel");n.classList.add("is-readonly"),n.querySelector("h2").textContent="购票情况",$("ticketViewHost").appendChild(n),n.hidden=!1;const a=$("surveyAdminPanel"),s=!!ticketAdmin.perms.survey;s&&(a.classList.add("is-readonly"),$("ticketViewHost").appendChild(a),a.hidden=!0),$("viewerPills").hidden=!s,$("ticketViewBoard").hidden=!1,refreshTicketAdmin(),clearInterval(ticketViewTimer),ticketViewTimer=setInterval(()=>{!document.hidden&&!$("view-internal").hidden&&!$("ticketViewBoard").hidden&&!n.hidden&&runQuietly(refreshTicketAdmin)},60*1e3)}function initViewerPills(){$("viewerPills").addEventListener("click",t=>{const e=t.target.closest("[data-viewer-panel]");if(!e)return;const n=e.dataset.viewerPanel;$("viewerPills").querySelectorAll("[data-viewer-panel]").forEach(a=>a.classList.toggle("is-active",a===e)),["ticketAdminPanel","surveyAdminPanel"].forEach(a=>{$(a).hidden=a!==n}),n==="surveyAdminPanel"?refreshSurveyAdmin():refreshTicketAdmin()})}const ADMIN_PANEL_REFRESH={lockdownPanel:()=>{refreshLockdownStatus(),refreshMaintStatus()},captchaPanel:()=>refreshCaptchaSwitch(),starlightPanel:()=>syncStarlightPanel(),ticketAdminPanel:()=>refreshTicketAdmin(),feedbackAdminPanel:()=>refreshFeedbackAdmin(),venueAdminPanel:()=>refreshVenueAdmin(),popupAdminPanel:()=>refreshPopupAdmin(),huayuAdminPanel:()=>refreshHuayuAdmin(),puzzleAdminPanel:()=>{refreshPuzzleAdmin(),refreshPlays("puzzle")},stageAdminPanel:()=>refreshPlays("stage"),surveyAdminPanel:()=>typeof window.mountSurvey=="function"?refreshSurveyAdmin():($("surveyAdminStatus").textContent="问卷脚本 survey.js 没有加载成功（没上传或被缓存挡住），刷新页面再试",null)},ADMIN_SEEN_STORE="hj_admin_seen",ADMIN_NEW_POLL_MS=300*1e3,ADMIN_NEW={feedbackAdminPanel:{key:()=>"feedback",refresh:()=>refreshFeedbackAdmin()},venueAdminPanel:{key:()=>"venue",refresh:()=>refreshVenueAdmin(),counts:t=>!t.source||t.source==="web"},surveyAdminPanel:{key:()=>`survey:${SURVEY.id}`,refresh:()=>refreshSurveyAdmin(),ready:()=>typeof window.mountSurvey=="function"}},adminNew={timer:0,checkedAt:0},adminPanelShowing=t=>!$(t).hidden&&!$("adminModalOverlay").hidden;function setAdminNewDot(t,e){const n=$("adminPills").querySelector(`[data-admin-panel="${t}"] .admin-new-dot`);n&&(n.hidden=!e)}function noteAdminItems(t,e){const n=ADMIN_NEW[t];if(!n||!internalAdminPassword)return;const a=e.reduce((i,u)=>n.counts&&!n.counts(u)?i:Math.max(i,Number(u.id)||0),0),s=storage.json(ADMIN_SEEN_STORE)||{},d=n.key();adminPanelShowing(t)?(s[d]!==a&&(s[d]=a,storage.set(ADMIN_SEEN_STORE,JSON.stringify(s))),setAdminNewDot(t,!1)):setAdminNewDot(t,a>(Number(s[d])||0))}function checkAdminNew(){if(!(!internalAdminPassword||document.hidden||$("view-internal").hidden)){adminNew.checkedAt=Date.now();for(const[t,e]of Object.entries(ADMIN_NEW))adminPanelShowing(t)||e.ready&&!e.ready()||runQuietly(e.refresh)}}function startAdminNewWatch(){clearInterval(adminNew.timer),checkAdminNew(),adminNew.timer=setInterval(checkAdminNew,ADMIN_NEW_POLL_MS)}function initAdminNewWatch(){document.addEventListener("visibilitychange",()=>{!document.hidden&&Date.now()-adminNew.checkedAt>=ADMIN_NEW_POLL_MS&&checkAdminNew()})}function stashAdminPanels(){[...$("adminModalHost").children].forEach(t=>{t.hidden=!0,$("adminPanelStash").appendChild(t)})}function openAdminPanel(t){const e=$(t);e&&(stashAdminPanels(),$("adminModalHost").appendChild(e),e.hidden=!1,$("adminModalOverlay").dataset.closeOnlyX=e.dataset.closeOnlyX||"",$("adminModalOverlay").hidden=!1,playEnterAnim(document.querySelector("#adminModalOverlay .admin-modal")),ADMIN_PANEL_REFRESH[t]?.())}function closeAdminPanel(){$("adminModalOverlay").hidden=!0,stashAdminPanels()}function initAdminPanels(){$("adminPills").querySelectorAll("[data-admin-panel]").forEach(t=>{t.addEventListener("click",()=>openAdminPanel(t.dataset.adminPanel))}),$("adminModalClose").addEventListener("click",closeAdminPanel),closeOnBackdrop($("adminModalOverlay"),closeAdminPanel)}async function refreshLockdownStatus(){const t=$("lockdownStatus"),e=$("lockdownToggleBtn");t.textContent="加载中…",e.disabled=!0;const n=await callWorker({action:"get_lockdown"});if(!n){t.textContent="读取失败，请刷新后再试";return}e.disabled=!1,siteLockdown=!!n.value,t.textContent=n.value?"现在：纯静态展示中":"现在：正常运行",setTicketSwitch(e,!n.value,"开启","关闭"),e.dataset.current=n.value?"1":"0"}function initLockdownToggle(){const t=$("lockdownToggleBtn");t.addEventListener("click",async()=>{const e=$("lockdownMsg");setMsg(e,""),t.disabled=!0;const n=await callWorker({action:"set_lockdown",password:internalAdminPassword,value:t.dataset.current!=="1"});if(t.disabled=!1,!n||!n.ok){setMsg(e,adminErr(n,"切换失败，请重新登录内部入口后再试"));return}siteLockdown=!!n.value,showToast(n.value?"分享功能已关闭（纯静态展示）":"分享功能已开启"),refreshLockdownStatus()})}const MAINT_ERRORS={unknown_action:"Worker 还没有更新，暂时用不了全站开关（见更新说明）",bad_action:"Worker 还没有更新，暂时用不了全站开关（见更新说明）"},MAINT_FALLBACK="操作失败：Worker 可能还没更新（见更新说明），或登录已失效";async function refreshMaintStatus(){const t=$("maintStatus"),e=$("maintToggleBtn");t.textContent="加载中…",e.disabled=!0;const n=await callWorker({action:"get_maintenance"});if(!n||!n.ok){t.textContent=adminErr(n,MAINT_FALLBACK,MAINT_ERRORS);return}e.disabled=!1,applyMaintenance(!!n.value),t.textContent=n.value?"现在：维护中，访客只能看到维护提示":"现在：正常访问",setTicketSwitch(e,!n.value,"正常访问","维护中"),e.dataset.current=n.value?"1":"0",delete e.dataset.armed}function initMaintToggle(){const t=$("maintToggleBtn");t.addEventListener("click",async()=>{const e=$("maintMsg");setMsg(e,"");const n=t.dataset.current!=="1";if(n&&!(t.dataset.armed&&Date.now()-Number(t.dataset.armed)<4e3)){t.dataset.armed=String(Date.now()),setMsg(e,"切到维护后访客将无法浏览网站，4 秒内再点一次「维护中」确认");return}delete t.dataset.armed,t.disabled=!0;const a=await callWorker({action:"set_maintenance",password:internalAdminPassword,value:n});if(t.disabled=!1,!a||!a.ok){setMsg(e,adminErr(a,MAINT_FALLBACK,MAINT_ERRORS));return}applyMaintenance(!!a.value),showToast(a.value?"全站已关闭，访客只能看到维护提示":"全站已开启"),refreshMaintStatus()})}async function refreshCaptchaSwitch(){const t=$("captchaStatus"),e=$("captchaToggleBtn");t.textContent="加载中…",e.disabled=!0;const n=await callWorker({action:"get_captcha"});if(!n||!n.ok){t.textContent="读取失败，请刷新后再试";return}e.disabled=!1,applyCaptchaEnabled(!!n.enabled),t.textContent=n.enabled?"现在：正常验证":"现在：全站不验证，请尽快开回来",setTicketSwitch(e,!!n.enabled,"开启","关闭"),e.dataset.current=n.enabled?"1":"0"}function initCaptchaSwitch(){const t=$("captchaToggleBtn");t.addEventListener("click",async()=>{const e=$("captchaSwitchMsg");setMsg(e,""),t.disabled=!0;const n=await callWorker({action:"set_captcha",password:internalAdminPassword,enabled:t.dataset.current!=="1"});if(t.disabled=!1,!n||!n.ok){setMsg(e,adminErr(n,"切换失败，请重新登录内部入口后再试"));return}applyCaptchaEnabled(!!n.enabled),showToast(n.enabled?"人机验证已开启":"人机验证已关闭"),refreshCaptchaSwitch()})}function syncStarlightPanel(){const t=hjStarlight;$("starlightStatus").textContent=t?`当前时段：${formatCnLabel(t.start)} — ${formatCnLabel(t.end)}${hjStarlightActiveAt(hjNow())?" · 进行中":""}`:"当前状态：未设置",$("starlightStart").value=hjStarlight?epochToCnLocal(hjStarlight.start):"",$("starlightEnd").value=hjStarlight?epochToCnLocal(hjStarlight.end):"",setMsg($("starlightMsg"),"")}async function saveStarlight(t){const e=$("starlightMsg"),n=[$("starlightSaveBtn"),$("starlightClearBtn")];setMsg(e,"保存中…"),n.forEach(s=>{s.disabled=!0});const a=await callWorker({action:"set_starlight",password:internalAdminPassword,value:t});if(n.forEach(s=>{s.disabled=!1}),!a||!a.ok){setMsg(e,adminErr(a,"保存失败，请重新登录内部入口后再试"));return}applyStarlight(t),syncStarlightPanel(),showToast(t?"星芒节时段已保存，期间全站天气显示为小雪":"已清除星芒节覆盖，天气恢复正常计算")}function initStarlightPanel(){$("starlightSaveBtn").addEventListener("click",()=>{const t=$("starlightMsg"),e=cnLocalToEpoch($("starlightStart").value),n=cnLocalToEpoch($("starlightEnd").value);if(!e||!n){setMsg(t,"请填写开始和结束时间");return}if(n<=e){setMsg(t,"结束时间要晚于开始时间");return}saveStarlight({start:e,end:n})}),$("starlightClearBtn").addEventListener("click",()=>saveStarlight(null))}const ticketAdmin={status:null,orders:[],rounds:[],role:"admin",perms:{stats:!0,survey:!0,pickup:!0},tab:"settings",day:null,statsRound:"",search:"",edit:null,editHolders:[],pointsDirty:!1,guideLoaded:!1,logItems:null},TA_TABS=["settings","orders","stats"],isTicketViewer=()=>ticketAdmin.role==="viewer",ticketAdminPassword=()=>internalAdminPassword||internalViewPassword,cnHm=t=>t?formatCnTime(t).slice(11):"",cnMdHm=t=>t?`${Number(formatCnTime(t).slice(5,7))}/${Number(formatCnTime(t).slice(8,10))} ${cnHm(t)}`:"",VERIFY_MODE_TEXT={cf:"自动验证",ff14:"狒科生",poem:"文科生",math:"理科生",off:"验证关闭时提交",manual:"手动验证"};function fmtDuration(t){const e=Math.max(0,Math.round(t/1e3));if(e<60)return`${e} 秒`;const n=Math.floor(e/60);if(n<60)return`${n} 分 ${e%60} 秒`;const a=Math.floor(n/60);return a<24?`${a} 小时 ${n%60} 分`:`${Math.floor(a/24)} 天 ${a%24} 小时`}function ticketRoundList(){const t=ticketAdmin.status,e=new Map;return ticketAdmin.rounds.forEach(n=>e.set(n.key,{...n,estimated:!1})),ticketAdmin.orders.forEach(n=>{if(e.has(n.day))return;const a=/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/.exec(n.day),s=a?Date.parse(`${a[1]}T${a[2]||"00:00"}:00+08:00`)+(a[2]?0:(t?.resetMin||0)*6e4):0,d=t?t.limit:0;e.set(n.day,{key:n.day,startAt:s,base:d,extra:0,quota:d,source:"",openedAt:-1,estimated:!0})}),t?.round&&!e.has(t.round.key)&&e.set(t.round.key,{...t.round,estimated:!1}),[...e.values()].sort((n,a)=>n.startAt-a.startAt||String(n.key).localeCompare(String(a.key)))}function computeTicketDuplicates(t){const e=d=>String(d).replace(/\s+/g,"").toLowerCase(),n=d=>`${String(d.name||"").replace(/\s+/g,"").toLowerCase()}@${d.server}`,a=new Map,s=new Map;return t.filter(d=>!d.voided).forEach(d=>{const i=e(d.contact);a.set(i,(a.get(i)||0)+1),ticketActiveHolders(d.holders).forEach(u=>{if(u.pending)return;const c=n(u);s.set(c,(s.get(c)||0)+1)})}),new Map(t.map(d=>[d.id,d.voided?{contact:!1,holders:d.holders.map(()=>!1)}:{contact:a.get(e(d.contact))>1,holders:d.holders.map(i=>!i.voided&&!i.pending&&s.get(n(i))>1)}]))}function setTicketSwitch(t,e,n,a){t.setAttribute("aria-pressed",e?"true":"false"),t.classList.toggle("is-on",e),t.querySelector(".sw-opt")||(t.innerHTML='<span class="sw-opt"></span><span class="sw-opt"></span>');const[s,d]=t.querySelectorAll(".sw-opt");s.textContent=n,d.textContent=a,s.classList.toggle("is-cur",e),d.classList.toggle("is-cur",!e);const i=t.closest(".ticket-admin-row")?.querySelector(".ticket-admin-key")?.textContent.trim();t.setAttribute("aria-label",`${i?`${i}：`:""}${e?n:a}`)}document.addEventListener("click",t=>{t.target.closest?.(".ticket-switch .sw-opt.is-cur")&&(t.stopPropagation(),t.preventDefault())},!0);function ticketTotals(t){const e=t.filter(i=>!i.voided),n=(i,u)=>i.reduce((c,o)=>c+u(o),0),a=e.filter(i=>i.picked),s=e.filter(i=>i.overLimit),d=t.filter(i=>i.voided);return{liveOrders:e.length,liveTickets:n(e,i=>i.qty),pickedOrders:a.length,pickedTickets:n(a,i=>i.qty),overOrders:s.length,overTickets:n(s,i=>i.qty),voidOrders:d.length,voidTickets:n(d,i=>i.qty),partialVoidTickets:n(e,i=>i.holders.filter(u=>u&&u.voided).length),pending:n(e,i=>ticketActiveHolders(i.holders).filter(u=>u.pending).length)}}const tasItems=t=>t.map(([e,n])=>`<div class="tas-item"><span>${e}</span><b>${n}</b></div>`).join("");function renderTicketAdmin(){const t=ticketAdmin.status;if(!t)return;const e=isTicketViewer(),n=t.round||{key:t.day,quota:t.limit,base:t.limit,extra:0,startAt:0};$("ticketAdminStatus").textContent=`当前轮次：${ticketRoundLabel(n.key,!0)}`+(n.startAt?` · ${formatCnTime(n.startAt)} 开始`:"");const a=ticketAdmin.orders.filter(c=>c.day===n.key&&!c.voided),s=a.filter(c=>c.overLimit).reduce((c,o)=>c+o.qty,0),d=ticketTotals(ticketAdmin.orders);$("ticketAdminStats").innerHTML=tasItems([["本轮已售",`${t.sold} 张`],["本轮票额",`${n.quota} 张${n.extra?`<small>临时 ${n.extra>0?"+":""}${n.extra}</small>`:""}`],["本轮余票",`${t.remaining} 张`],["本轮订单",`${a.length} 单${s?`<small>超额 ${s}</small>`:""}`],["累计有效",`${d.liveOrders} 单 / ${d.liveTickets} 张`],["已取票",`${d.pickedOrders} 单 / ${d.pickedTickets} 张`]]);const i=e?["orders",...ticketAdmin.perms.stats?["stats"]:[]]:TA_TABS;i.includes(ticketAdmin.tab)||(ticketAdmin.tab=i[0]);const u=document.querySelectorAll("#ticketAdminTabs [data-ta-tab]");u.forEach(c=>{c.hidden=!i.includes(c.dataset.taTab)}),markTabs(u,c=>c.dataset.taTab===ticketAdmin.tab),$("ticketAdminTabs").hidden=i.length<2,document.querySelectorAll("#ticketAdminPanel [data-ta-pane]").forEach(c=>{c.hidden=c.dataset.taPane!==ticketAdmin.tab}),ticketAdmin.tab==="settings"?renderTicketSettings(t):ticketAdmin.tab==="orders"?renderTicketOrders():renderTicketStats()}function renderTicketFlagSwitches(t){document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach(e=>{setTicketSwitch(e,!!t[e.dataset.taFlag],e.dataset.on,e.dataset.off)})}const setIdle=(t,e)=>{t&&document.activeElement!==t&&(t.value=e)};function renderTicketSettings(t){setTicketSwitch($("ticketOpenBtn"),t.open,"开放","关闭"),setTicketSwitch($("ticketPendingBtn"),t.allowPending,"允许","不允许"),setTicketSwitch($("ticketTestBtn"),!!t.testMode,"加上","不加"),setIdle($("ticketTitleInput"),t.title||TICKET_TITLE),$("ticketTitlePreview").textContent=`访客看到：${t.title||TICKET_TITLE}${t.testMode?"（测试）":""}`,$("ticketTitlePreview").hidden=!1,setIdle($("ticketCooldownInput"),String(t.cooldownMin??30)),setIdle($("ticketPerPersonInput"),String(t.perPerson??"")),renderTicketSchedule(t);const e=t.round||{key:t.day,base:t.limit,extra:0,quota:t.limit,startAt:0,source:""},n={daily:"每日刷新",custom:"自定义刷新点",init:"首次记录的轮次"};$("ticketRoundBox").innerHTML=`
    <p><b>${escapeHtml(ticketRoundLabel(e.key,!0))}</b>`+(e.startAt?`<small>${escapeHtml(formatCnTime(e.startAt))} 开始 · ${n[e.source]||""}</small>`:"")+`</p>
    <p>票额：基础 <b>${e.base}</b> 张${e.extra?` ${e.extra>0?"+":"−"} 临时 <b>${Math.abs(e.extra)}</b> 张`:""} = <b>${e.quota}</b> 张
      · 已售 <b>${t.sold}</b> · 余 <b>${t.remaining}</b></p>`,$("ticketExtraClearBtn").disabled=!e.extra,setTicketSwitch($("ticketDailyBtn"),t.dailyOn!==!1,"开启","关闭"),setIdle($("ticketResetInput"),minutesToHHMM(t.resetMin||0)),setIdle($("ticketLimitInput"),String(t.limit)),document.querySelectorAll(".ta-daily-only").forEach(u=>u.classList.toggle("is-off",t.dailyOn===!1)),$("ticketLimitCurWrap").hidden=!(e.source==="daily"||e.source==="init"),ticketAdmin.pointsDirty||renderTicketPoints(t.points||[],e.startAt),renderTicketNext(t);const a=t.remainingMode||"full";setIdle($("ticketRemainModeSelect"),a);const s=ticketStockHtml(a,t.remaining,t.stockLevel,t.roundWord||"今日"),d=s?s.replace(/<[^>]+>/g,""):"";$("ticketRemainPreview").textContent=(t.open?`访客现在看到：${d||"（不显示余票）"}`:`购票关闭中，访客看不到余票${d?`（开放后显示：${d}）`:""}`)+(a==="range"?" · ≤10 张为「余票10张以内」，≤ 票额一半为「余票不多」":""),$("ticketRemainPreview").hidden=!1,setTicketSwitch($("ticketShowSchedBtn"),t.showSchedule!==!1,"显示","隐藏"),setTicketSwitch($("ticketShowResetBtn"),t.showReset!==!1,"显示","隐藏"),setTicketSwitch($("ticketViewerBtn"),t.viewerEnabled!==!1,"开放","关闭"),renderTicketFlagSwitches(t),setIdle($("ticketIdleInput"),String(t.idleMin??10));const i=!!t.isolated;document.querySelectorAll(".ta-idle-row").forEach(u=>{u.classList.toggle("is-disabled",i),u.querySelectorAll("input, button").forEach(c=>{c.disabled=i})}),$("ticketIdleIsoNote").hidden=!i,setIdle($("ticketLogHoursInput"),String(t.viewerLogHours??24)),renderViewerSchedule(t)}function renderViewerSchedule(t){setIdle($("ticketViewerOpenAtInput"),epochToCnLocal(t.viewerOpenAt||0)),setIdle($("ticketViewerCloseAtInput"),epochToCnLocal(t.viewerCloseAt||0));const e=[];t.viewerOpenAt&&e.push(`将于 ${formatCnTime(t.viewerOpenAt)} 自动开放`),t.viewerCloseAt&&e.push(`将于 ${formatCnTime(t.viewerCloseAt)} 自动关闭`);const n=$("ticketViewerSchedNote");n.textContent=e.join("；"),n.hidden=!e.length}function renderTicketSchedule(t){setIdle($("ticketOpenAtInput"),epochToCnLocal(t.openAt)),setIdle($("ticketCloseAtInput"),epochToCnLocal(t.closeAt));const e=[];t.openAt&&e.push(`将于 ${formatCnTime(t.openAt)} 自动开启`),t.closeAt&&e.push(`将于 ${formatCnTime(t.closeAt)} 自动关闭`);const n=$("ticketSchedNote");n.textContent=e.join("；"),n.hidden=!e.length}function renderTicketPoints(t,e){const n=t.filter(a=>a.at>(e||0));$("ticketPointsList").innerHTML=n.length?n.map(a=>ticketPointRowHtml(epochToCnLocal(a.at),a.qty)).join(""):'<p class="ta-empty" data-points-empty>暂无自定义刷新点</p>'}function ticketPointRowHtml(t="",e=""){return`<div class="ta-point" data-point>
    <input type="datetime-local" class="ta-point-at" value="${escapeHtml(t)}" aria-label="刷新时间">
    <input type="number" class="ta-point-qty" min="0" max="100000" step="1" inputmode="numeric" value="${escapeHtml(String(e))}" placeholder="票额" aria-label="这一轮的票额">
    <span class="ta-point-unit">张</span>
    <button type="button" class="tt-act is-void" data-point-del>删除</button>
  </div>`}function renderTicketNext(t){const e=t.nextRefresh,n=$("ticketNextInfo"),a=$("ticketNextInput"),s=$("ticketNextNote");if($("ticketNextSaveBtn").disabled=!e,a.disabled=!e,!e){n.textContent="不会再刷新",setIdle(a,""),$("ticketNextResetBtn").hidden=!0,s.textContent="每日刷新已关闭且没有自定义刷新点，票额不再重置。",s.hidden=!1;return}n.textContent=`${formatCnTime(e.at)} · ${e.kind==="daily"?"每日刷新":"自定义刷新点"}`,setIdle(a,String(e.qty)),$("ticketNextResetBtn").hidden=!e.override;const d=[];e.override?d.push(`已单独设为 ${e.qty} 张（默认是 ${e.defaultQty} 张），只对这一次刷新有效。`):e.kind==="custom"?d.push("与对应的自定义刷新点同步。"):d.push(`默认 ${e.defaultQty} 张，修改仅对本次有效。`),e.pendingOverride&&d.push(`${formatCnTime(e.pendingOverride.at)} 的每日刷新已单独设为 ${e.pendingOverride.qty} 张。`),s.textContent=d.join(" "),s.hidden=!1}function ticketOrderMatches(t,e){if(!e)return!0;const n=[t.contact,String(t.seq),...t.holders.map(a=>formatHolder(a))].join(" ").toLowerCase();return e.toLowerCase().split(/\s+/).filter(Boolean).every(a=>n.includes(a))}function renderTicketOrders(){const t=ticketAdmin.status,e=isTicketViewer(),n=ticketAdmin.orders,a=ticketRoundList().filter(o=>o.key===t.day||n.some(p=>p.day===o.key));(ticketAdmin.day===null||ticketAdmin.day&&!a.some(o=>o.key===ticketAdmin.day))&&(ticketAdmin.day=t.day);const s=ticketAdmin.day==="";$("ticketDaySelect").innerHTML=`<option value=""${s?" selected":""}>全部轮次 · ${ticketTotals(n).liveOrders} 单</option>`+a.slice().reverse().map(o=>{const p=ticketTotals(n.filter(h=>h.day===o.key));return`<option value="${escapeHtml(o.key)}"${o.key===ticketAdmin.day?" selected":""}>${escapeHtml(ticketRoundLabel(o.key,!0))} · ${p.liveOrders} 单 / ${p.liveTickets} 张${p.voidOrders?` · 作废 ${p.voidOrders}`:""}</option>`}).join(""),setIdle($("ticketSearchInput"),ticketAdmin.search);const d=computeTicketDuplicates(n),i=new Map(a.map((o,p)=>[o.key,p])),u=n.filter(o=>(s||o.day===ticketAdmin.day)&&ticketOrderMatches(o,ticketAdmin.search)).sort((o,p)=>(i.get(o.day)??0)-(i.get(p.day)??0)||o.seq-p.seq),c=!e||ticketAdmin.perms.pickup;if($("ticketAdminPanel").classList.toggle("can-pick",c),$("ticketAdminTbody").innerHTML=u.length?u.map(o=>{const p=d.get(o.id)||{contact:!1,holders:[]},h=o.holders.map((f,y)=>f.voided?`<span class="tt-h-void"><s>${escapeHtml(formatHolder(f))}</s><small>已作废</small></span>`:`<span class="${p.holders[y]?"is-dup":""}">${escapeHtml(formatHolder(f))}</span>`).join("<br>"),A=[o.message?`${escapeHtml(o.message)}<small>${o.anonymous?"匿名":"实名"}</small>`:"",!e&&o.adminNote?`<small class="tt-note">备注：${escapeHtml(o.adminNote)}</small>`:""].join(""),w=formatCnClock(o.createdAt),b=s?`${cnMdHm(o.createdAt).split(" ")[0]} `:"",r=e?"":[o.voided?"":'<button type="button" class="tt-act" data-act="edit">编辑</button>',!o.voided&&o.holders.length>1?'<button type="button" class="tt-act" data-act="partial">部分作废</button>':"",o.voided?'<button type="button" class="tt-act is-restore" data-act="restore">恢复</button>':'<button type="button" class="tt-act is-void" data-act="void">作废</button>'].join(""),l=o.picked&&o.pickedAt?`${o.pickedBy==="viewer"?"只读端":"管理员"} ${cnMdHm(o.pickedAt)} 勾选`:"",m=o.voided?"—":c?`<label class="tt-pick" title="${escapeHtml(l)}"><input type="checkbox" data-pick${o.picked?" checked":""} aria-label="第 ${o.seq} 号已取票"><span>${o.picked?"已取":"未取"}</span></label>`:o.picked?`<span class="tt-picked" title="${escapeHtml(l)}">已取</span>`:'<span class="tt-unpicked">未取</span>';return`<tr class="${[o.voided?"is-void":o.overLimit?"is-over":"",o.picked&&!o.voided?"is-picked":""].filter(Boolean).join(" ")}" data-order-id="${o.id}">
      <td>${o.seq}${s?`<small class="tt-round">${escapeHtml(ticketRoundLabel(o.day))}</small>`:""}</td>
      <td class="${p.contact?"is-dup":""}">${escapeHtml(o.contact)}</td>
      <td>${o.qty}</td>
      <td>${h}</td>
      <td class="tt-msg">${A}</td>
      <td>${b}${w}${e?"":submitMetaHtml(o)}</td>
      <td class="tt-actions"><div class="tt-acts">${r}</div></td>
      <td class="tt-pick-cell">${m}</td>
    </tr>`}).join(""):`<tr><td colspan="8" class="tt-empty">${ticketAdmin.search?"没有符合搜索条件的订单":"暂无订单"}</td></tr>`,ticketAdmin.edit){const o=n.find(p=>p.id===ticketAdmin.edit.id);!o||o.voided?closeTicketEdit():ticketAdmin.edit.mode==="partial"&&renderTicketPartial()}}function openTicketEdit(t){ticketAdmin.edit={mode:"edit",id:t.id},ticketAdmin.editHolders=t.holders.map(a=>({...a}));const e=ticketRoundList(),n=$("ticketEditBox");n.innerHTML=`
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
      </div>`).join(""),t.querySelectorAll(".te-holder[data-h]").forEach(e=>{const n=ticketAdmin.editHolders[Number(e.dataset.h)];e.querySelector(".te-name").value=n.pending?"":n.name||"",e.querySelector(".te-server").value=n.pending?"":n.server||""})}function collectTicketEditHolders(){$("teHolders").querySelectorAll(".te-holder[data-h]").forEach(t=>{const e=Number(t.dataset.h),n=t.querySelector(".te-pending").checked;ticketAdmin.editHolders[e]=n?{pending:!0}:{name:normalizeTicketName(t.querySelector(".te-name").value),server:t.querySelector(".te-server").value}})}function closeTicketEdit(){ticketAdmin.edit=null,ticketAdmin.editHolders=[];const t=$("ticketEditBox");t.hidden=!0,t.innerHTML=""}async function saveTicketEdit(){const t=$("teMsg"),e=ticketAdmin.orders.find(d=>d.id===ticketAdmin.edit?.id);if(!e){closeTicketEdit();return}collectTicketEditHolders();const n=$("teContact").value.trim();if(!n){setMsg(t,"请填写联系方式");return}const a=ticketAdmin.editHolders;for(const[d,i]of a.entries()){if(i.voided||i.pending)continue;const u=i.name?ticketNameError(i.name):"请填写持票人 id";if(u){setMsg(t,`第 ${d+1} 位持票人：${u}`);return}if(!i.server){setMsg(t,`第 ${d+1} 位持票人：请选择区服`);return}}if(!ticketActiveHolders(a).length){setMsg(t,"至少要留一位持票人；整单不要了请用「作废」");return}setMsg(t,""),$("teSave").disabled=!0;const s=await callWorker({action:"ticket_admin_edit",password:internalAdminPassword,id:e.id,rev:e.rev,contact:n,holders:a,day:$("teDay").value,message:$("teMessage").value,anonymous:$("teAnon").checked,overLimit:$("teOver").checked,adminNote:$("teNote").value});if($("teSave")&&($("teSave").disabled=!1),!s||!s.ok){const d={conflict:"订单已被修改，已刷新",bad_contact:"请填写联系方式",bad_holders:"持票人数量需为 1–50",bad_holder_name:"有持票人未填写 id",bad_holder_server:"有持票人未选择区服",bad_holder_name_format:"持票人 id 格式不符",no_active_holder:"至少要留一位持票人；整单不要了请用「作废」",bad_day:"所选轮次不存在，刷新后再试"};setMsg(t,adminErr(s,"保存失败，请重新登录内部入口后再试",d)),s?.error==="conflict"&&(closeTicketEdit(),await refreshTicketAdmin());return}ticketAdminApplyOrder(s.order,s.status),closeTicketEdit(),renderTicketAdmin(),showToast(s.overQuota?`已保存。注意：${ticketRoundLabel(s.order.day)}这一轮已经超出票额`:`第 ${s.order.seq} 号已保存`)}function ticketAdminApplyOrder(t,e){const n=ticketAdmin.orders.findIndex(a=>a.id===t.id);n>=0&&(ticketAdmin.orders[n]={...ticketAdmin.orders[n],...t}),e&&(ticketAdmin.status=e)}function openTicketPartial(t){ticketAdmin.edit={mode:"partial",id:t.id},renderTicketPartial(),$("ticketEditBox").hidden=!1,$("ticketEditBox").scrollIntoView({behavior:"smooth",block:"nearest"})}function renderTicketPartial(){const t=ticketAdmin.orders.find(n=>n.id===ticketAdmin.edit?.id);if(!t){closeTicketEdit();return}const e=ticketActiveHolders(t.holders).length;$("ticketEditBox").innerHTML=`
    <h3 class="venue-edit-title">部分作废 · ${escapeHtml(ticketRoundLabel(t.day,!0))} 第 ${t.seq} 号 · ${t.qty} 张</h3>
    <p class="hint">作废后票额放回本轮；恢复时若票额不足则标为超额。</p>
    <div class="ta-partial">${t.holders.map((n,a)=>`
      <div class="ta-partial-row${n.voided?" is-void":""}">
        <span>${a+1}. ${n.voided?`<s>${escapeHtml(formatHolder(n))}</s> <small>已作废</small>`:escapeHtml(formatHolder(n))}</span>
        ${n.voided?`<button type="button" class="tt-act is-restore" data-pv="${a}" data-pv-void="0">恢复</button>`:`<button type="button" class="tt-act is-void" data-pv="${a}" data-pv-void="1"${e<=1?' disabled title="至少留一张"':""}>作废这张</button>`}
      </div>`).join("")}</div>
    <div class="venue-edit-actions"><button type="button" class="ticket-btn-ghost" id="tpClose">关闭</button></div>
    <p class="form-msg" id="tpMsg" hidden></p>`}async function ticketPartialVoid(t,e){const n=ticketAdmin.orders.find(d=>d.id===ticketAdmin.edit?.id);if(!n)return;const a=n.holders[t];if(e&&!confirm(`确定作废第 ${n.seq} 号里的「${formatHolder(a)}」这一张吗？

这张的票额会放回这一轮，之后可以再恢复。`))return;const s=await callWorker({action:"ticket_admin_void_holder",password:internalAdminPassword,id:n.id,index:t,voided:e,rev:n.rev});if(!s||!s.ok){const d={conflict:"订单已被修改，已刷新",last_holder:"至少要留一张；整单不要了请用「作废」",order_voided:"该订单已作废",not_changed:"状态已变化，已刷新"};setMsg($("tpMsg"),adminErr(s,"操作失败，请重新登录内部入口后再试",d)),["conflict","not_changed"].includes(s?.error)&&await refreshTicketAdmin();return}ticketAdminApplyOrder(s.order,s.status),renderTicketAdmin(),showToast(e?`已作废第 ${s.order.seq} 号的一张，现在 ${s.order.qty} 张`:`已恢复，现在 ${s.order.qty} 张${s.becameOver?"（这一轮票额不够，这一单标成了超额）":""}`)}async function ticketAdminVoid(t,e){const n=$("ticketAdminMsg");setMsg(n,"");const a=await callWorker({action:"ticket_admin_void",password:internalAdminPassword,id:t,voided:e});if(!a||!a.ok){if(a&&a.error==="not_changed"){setMsg(n,"状态已变化，已刷新"),await refreshTicketAdmin();return}setMsg(n,adminErr(a,"操作失败，请重新登录内部入口后再试"));return}ticketAdminApplyOrder(a.order,a.status),renderTicketAdmin(),showToast(a.order.voided?`第 ${a.order.seq} 号已作废，票额已放回`:`第 ${a.order.seq} 号已恢复${a.order.overLimit?"，已标为超额":""}`)}async function ticketTogglePickup(t,e,n){const a=$("ticketAdminMsg");setMsg(a,""),n.disabled=!0;const s=await callWorker({action:"ticket_pickup",password:ticketAdminPassword(),id:t,picked:e});if(n.disabled=!1,s&&s.order&&ticketAdminApplyOrder(s.order),!s||!s.ok){const d={not_changed:"这一单已经是这个状态了（可能别人刚勾过），已同步",order_voided:"该订单已作废",no_permission:"无取票勾选权限",viewer_closed:"「购票情况」已关闭"};setMsg(a,adminErr(s,"勾选失败，请重新登录后再试",d)),s?.order||(n.checked=!e),renderTicketAdmin();return}renderTicketAdmin()}function renderTicketStats(){const t=ticketAdmin.orders,e=ticketRoundList().filter(o=>o.key===ticketAdmin.status.day||t.some(p=>p.day===o.key));ticketAdmin.statsRound&&!e.some(o=>o.key===ticketAdmin.statsRound)&&(ticketAdmin.statsRound="");const n=ticketAdmin.statsRound;$("ticketStatsRound").innerHTML='<option value="">全部轮次</option>'+e.slice().reverse().map(o=>`<option value="${escapeHtml(o.key)}"${o.key===n?" selected":""}>${escapeHtml(ticketRoundLabel(o.key,!0))}</option>`).join("");const a=t.filter(o=>!n||o.day===n),s=a.filter(o=>!o.voided),d=ticketTotals(a),i=Math.max(300,($("ticketStatsBody").clientWidth||640)-2),c=[`<div class="ticket-admin-stats">${tasItems([["有效订单",`${d.liveOrders} 单`],["有效票数",`${d.liveTickets} 张`],["已取票",`${d.pickedOrders} 单 / ${d.pickedTickets} 张`],["未取票",`${d.liveOrders-d.pickedOrders} 单 / ${d.liveTickets-d.pickedTickets} 张`],["超额",`${d.overOrders} 单 / ${d.overTickets} 张`],["已作废",`${d.voidOrders} 单 / ${d.voidTickets} 张${d.partialVoidTickets?`，另部分作废 ${d.partialVoidTickets} 张`:""}`],["持票人待定",`${d.pending} 位`]])}</div>`,`<h3 class="ta-stat-title">售罄耗时</h3>${ticketSelloutTable(e,n)}`,`<h3 class="ta-stat-title">每小时售出</h3>${ticketHourlyChart(s,i)}`,`<h3 class="ta-stat-title">各服务器玩家数量</h3>${ticketServerBars(s)}`,`<h3 class="ta-stat-title">验证方式分布</h3>${ticketVerifyBars(s)}`,ticketUnpickedHtml(s)];$("ticketStatsBody").innerHTML=c.join("")}function ticketSelloutInfo(t){const e=ticketAdmin.orders.filter(c=>c.day===t.key&&!c.voided).sort((c,o)=>c.createdAt-o.createdAt),n=e.reduce((c,o)=>c+o.qty,0);let a=0,s=0;if(t.quota>0){for(const c of e)if(s+=c.qty,s>=t.quota){a=c.createdAt;break}}let d=0,i=!1;t.openedAt>0?d=Math.max(t.startAt,t.openedAt):e.length&&(d=e[0].createdAt,i=!0);let u;return e.length?a?u=`${i?"约 ":""}${fmtDuration(a-d)}`:u="未售罄":u=t.openedAt?"未售罄":"未开放",{sold:n,soldOutAt:a,start:d,approx:i,text:u}}function ticketSelloutTable(t,e){if(!t.length)return'<p class="fb-empty">暂无轮次</p>';const n=t.slice().reverse().map(s=>{const d=ticketSelloutInfo(s);return`<tr class="${s.key===e?"is-sel":""}">
      <td>${escapeHtml(ticketRoundLabel(s.key,!0))}</td>
      <td>${s.startAt?escapeHtml(cnMdHm(s.startAt)):"—"}${s.openedAt>0&&s.openedAt>s.startAt?`<small>开放 ${escapeHtml(cnMdHm(s.openedAt))}</small>`:""}</td>
      <td>${s.quota}${s.estimated?"<small>估</small>":""}</td>
      <td>${d.sold}</td>
      <td>${escapeHtml(d.text)}${d.soldOutAt?`<small>${escapeHtml(cnMdHm(d.soldOutAt))} 售罄</small>`:""}</td>
    </tr>`}).join(""),a=t.some(s=>s.estimated||s.openedAt===-1);return`<div class="ticket-table-wrap"><table class="ticket-table ta-sellout">
    <thead><tr><th>轮次</th><th>开始</th><th>票额</th><th>售出</th><th>售罄耗时</th></tr></thead><tbody>${n}</tbody></table></div>`+(a?'<p class="ta-footnote">约：从第一单起算；估：按当前每日票额估算</p>':"")}function ticketHourlyChart(t,e){if(!t.length)return'<p class="fb-empty">暂无订单</p>';const n=3600*1e3,s=(Math.max(...t.map(g=>g.createdAt))-Math.min(...t.map(g=>g.createdAt)))/(24*n)>14?24:1,d=g=>Math.floor((g+CN_TZ_OFFSET_MS)/(s*n)),i=new Map;t.forEach(g=>{const k=d(g.createdAt),L=i.get(k)||{tickets:0,orders:0};L.tickets+=g.qty,L.orders+=1,i.set(k,L)});const u=Math.min(...i.keys()),o=Math.max(...i.keys())-u+1,p=Array.from({length:o},(g,k)=>i.get(u+k)||{tickets:0,orders:0}),h=Math.max(1,...p.map(g=>g.tickets)),A=(()=>{const g=10**Math.floor(Math.log10(h));return[1,2,2.5,5,10].find(L=>L*g>=h)*g})(),w=190,b=34,r=8,l=12,m=26,v=e-b-r,f=w-l-m,y=v/o,E=g=>l+f-g/A*f,_=g=>(u+g)*s*n-CN_TZ_OFFSET_MS,S=g=>{const k=new Date(_(g)+CN_TZ_OFFSET_MS),L=`${k.getUTCMonth()+1}/${k.getUTCDate()}`;return s===24||k.getUTCHours()===0?L:`${k.getUTCHours()}时`},T=Math.max(3,Math.floor(v/64)),M=(s===24?[1,2,3,7,14,30]:[1,2,3,6,12,24,48,72,96,168]).find(g=>o/g<=T)||(s===24?30:168),R=(Number.isInteger(A/2)?[0,.5,1]:[0,1]).map(g=>{const k=A*g;return`<line x1="${b}" x2="${e-r}" y1="${E(k)}" y2="${E(k)}" class="ta-grid"/><text x="${b-6}" y="${E(k)+4}" class="ta-axis" text-anchor="end">${Math.round(k)}</text>`}).join(""),C=g=>b+g*y+y/2,x=p.map((g,k)=>`${C(k).toFixed(1)},${E(g.tickets).toFixed(1)}`),B=o===1?`<line x1="${b}" x2="${e-r}" y1="${E(p[0].tickets)}" y2="${E(p[0].tickets)}" class="ta-line"/>`:`<path class="ta-area" d="M${C(0)},${E(0)} L${x.join(" L")} L${C(o-1)},${E(0)} Z"/><polyline class="ta-line" points="${x.join(" ")}"/>`,I=y>=8?4:3,z=p.map((g,k)=>{const L=`${cnMdHm(_(k))}–${cnHm(_(k)+s*n)||"24:00"}：${g.tickets} 张 / ${g.orders} 单`;return`<g class="ta-bar-g"><title>${escapeHtml(L)}</title><rect x="${b+k*y}" y="${l}" width="${y}" height="${f}" class="ta-hit"/>`+(g.tickets?`<circle cx="${C(k)}" cy="${E(g.tickets)}" r="${I}" class="ta-dot"/>`:"")+"</g>"}).join(""),P=p.map((g,k)=>(u+k)%M!==0?"":`<text x="${b+k*y+y/2}" y="${w-8}" class="ta-axis" text-anchor="middle">${escapeHtml(S(k))}</text>`).join(""),H=p.reduce((g,k,L)=>k.tickets>p[g].tickets?L:g,0);return`<div class="ta-chart"><svg width="${e}" height="${w}" viewBox="0 0 ${e} ${w}" role="img" aria-label="每${s===24?"天":"小时"}售出张数">${R}<line x1="${b}" x2="${e-r}" y1="${E(0)}" y2="${E(0)}" class="ta-base"/>${B}${z}${P}</svg></div><p class="ta-footnote">单位：张 · 每点一${s===24?"天":"小时"} · 峰值 ${escapeHtml(cnMdHm(_(H)))} 起 ${p[H].tickets} 张</p>`}function taBarsHtml(t,e,n){const a=n||Math.max(1,...t.map(s=>s.n));return`<div class="sv-bars">${t.map(s=>`<div class="sv-bar-row"><span class="sv-bar-key">${escapeHtml(s.label)}</span><span class="sv-bar"><i style="width:${s.n/a*100}%"></i></span><span class="sv-bar-n">${s.n}<small>${e?Math.round(s.n/e*100):0}%</small></span></div>`).join("")}</div>`}function ticketServerBars(t){const e=new Map;let n=0;t.forEach(u=>ticketActiveHolders(u.holders).forEach(c=>{c.pending?n++:e.set(c.server,(e.get(c.server)||0)+1)}));const a=[...e.values()].reduce((u,c)=>u+c,0)+n;if(!a)return'<p class="fb-empty">暂无持票人</p>';const s=Math.max(1,n,...e.values()),d=TICKET_SERVER_GROUPS.map(u=>{const c=u.servers.map(p=>({label:p,n:e.get(p)||0})).filter(p=>p.n).sort((p,h)=>h.n-p.n),o=c.reduce((p,h)=>p+h.n,0);return o?`<p class="ta-dc">【${u.dc}】${o} 人</p>${taBarsHtml(c,a,s)}`:""}).join(""),i=[...e.entries()].filter(([u])=>!TICKET_SERVERS.includes(u)).map(([u,c])=>({label:u,n:c}));return`<p class="ta-footnote">按持票人计，共 ${a} 位</p>${d}`+(i.length?`<p class="ta-dc">其他</p>${taBarsHtml(i,a,s)}`:"")+(n?`<p class="ta-dc">待定</p>${taBarsHtml([{label:"id 待定",n}],a,s)}`:"")}function ticketVerifyBars(t){if(!t.length)return'<p class="fb-empty">暂无订单</p>';const e={};t.forEach(s=>{const d=s.verifyMode||"";e[d]=(e[d]||0)+1});const a=["cf","ff14","poem","math","manual","off",""].filter(s=>e[s]).map(s=>({label:s?VERIFY_MODE_TEXT[s]:"未记录",n:e[s]}));return`<p class="ta-footnote">按订单计，共 ${t.length} 单</p>${taBarsHtml(a,t.length)}`}function ticketUnpickedList(t){const e=ticketRoundList(),n=new Map(e.map((a,s)=>[a.key,s]));return t.filter(a=>!a.picked).sort((a,s)=>(n.get(a.day)??0)-(n.get(s.day)??0)||a.seq-s.seq)}function ticketUnpickedHtml(t){const e=ticketUnpickedList(t),n=e.reduce((s,d)=>s+d.qty,0),a=`<div class="ta-list-head"><h3 class="ta-stat-title">未取票名单</h3><span>${e.length} 单 / ${n} 张</span>
    ${e.length?`<button type="button" class="tt-act" data-copy-unpicked="full">复制完整名单</button>
    <button type="button" class="tt-act" data-copy-unpicked="ids">复制持票人</button>`:""}</div>`;return e.length?`${a}<details class="ta-unpicked"${e.length<=30?" open":""}><summary>${e.length<=30?"名单":`展开 · ${e.length} 单`}</summary><div class="ticket-table-wrap"><table class="ticket-table">
    <thead><tr><th>轮次</th><th>序号</th><th>联系方式</th><th>张数</th><th>持票人</th></tr></thead><tbody>${e.map(s=>`<tr>
      <td>${escapeHtml(ticketRoundLabel(s.day))}</td><td>${s.seq}</td><td>${escapeHtml(s.contact)}</td><td>${s.qty}</td>
      <td>${ticketActiveHolders(s.holders).map(d=>escapeHtml(formatHolder(d))).join("、")}</td></tr>`).join("")}</tbody></table></div></details>
    <textarea class="ta-copy-fallback" id="ticketUnpickedFallback" readonly hidden></textarea>`:`${a}<p class="fb-empty">没有未取票的有效订单</p>`}function ticketUnpickedText(t){const e=ticketAdmin.statsRound,n=ticketAdmin.orders.filter(i=>!i.voided&&(!e||i.day===e)),a=ticketUnpickedList(n),s=[];let d=null;return a.forEach(i=>{i.day!==d&&(s.push(`【${ticketRoundLabel(i.day)}】`),d=i.day);const u=ticketActiveHolders(i.holders).map(formatHolder).join("、");s.push(t==="full"?`${i.seq}. ${i.contact}：${u}（${i.qty} 张）`:`${i.seq}. ${u}`)}),s.join(`
`)}async function copyTicketUnpicked(t){const e=ticketUnpickedText(t);try{await navigator.clipboard.writeText(e),showToast("未取票名单已复制")}catch{const a=$("ticketUnpickedFallback");a.value=e,a.hidden=!1,a.focus(),a.select(),showToast("自动复制失败，已全选，请手动复制（Ctrl+C / 长按）")}}let ticketAdminTimer=0;async function refreshTicketAdmin(){const t=await callWorker({action:"ticket_admin_get",password:ticketAdminPassword()});return t&&t.error==="viewer_closed"?(clearInterval(ticketViewTimer),ticketAdmin.orders=[],$("ticketAdminStats").innerHTML="",$("ticketAdminTbody").innerHTML="",$("ticketStatsBody").innerHTML="",$("ticketAdminStatus").textContent=viewerClosedText(t.openAt),!1):!t||!t.ok?($("ticketAdminStatus").textContent=adminErr(t,"读取失败，请重新登录内部入口后再试"),!1):(ticketAdmin.status=t.status,ticketAdmin.orders=Array.isArray(t.orders)?t.orders:[],ticketAdmin.rounds=Array.isArray(t.rounds)?t.rounds:[],ticketAdmin.role=t.role==="viewer"||!internalAdminPassword?"viewer":"admin",ticketAdmin.perms=t.perms||(isTicketViewer()?{stats:!0,survey:!1,pickup:!1}:{stats:!0,survey:!0,pickup:!0}),renderTicketAdmin(),!0)}async function ticketAdminSet(t,e){const n=$("ticketAdminMsg");setMsg(n,"");const a=await callWorker({action:"ticket_admin_set",password:internalAdminPassword,...t});if(!a||!a.ok){const s={bad_limit:"票额需为 0 以上的整数",bad_per_person:"单人限购需为 1–20 之间的整数",bad_cooldown:"购票间隔需为 0–1440 的整数",bad_reset:"刷新时间无效",bad_title:"标题最多 60 字",bad_remaining_mode:"余票显示方式无效",bad_schedule:"定时时间无效",bad_idle:"停留时限需为 0–1440 的整数",bad_log_hours:"日志间隔需为 1–720 的整数",bad_extra:"加票数量无效",extra_below_zero:"票额不能小于 0",bad_points:"刷新点最多 60 个",bad_point_time:"刷新点时间无效",bad_point_qty:"刷新点票额需为 0 以上的整数",no_next_refresh:"现在没有下一次刷新（每日刷新关着，也没有自定义刷新点）",bad_next_qty:"下一次刷新的票额需为 0 以上的整数",bad_guide:"须知格式无效",guide_too_long:"须知最多 12000 字"};return setMsg(n,adminErr(a,"保存失败，请重新登录内部入口后再试",s)),!1}return ticketAdmin.status=a.status,renderTicketAdmin(),showTicketEntry(ticketEntryVisible(a.status)),scheduleTicketEntryCheck(a.status),e&&showToast(e),!0}async function loadTicketLog(){const t=$("ticketLogList");t.hidden=!1,t.innerHTML='<p class="fb-empty">加载中…</p>';const e=await callWorker({action:"ticket_log_get",password:internalAdminPassword});if(!e||!e.ok){t.innerHTML=`<p class="fb-empty">${escapeHtml(adminErr(e,"读取失败"))}</p>`;return}if(!e.items.length){t.innerHTML='<p class="fb-empty">暂无记录</p>';return}t.innerHTML=e.items.map(n=>{const a=n.ops.slice().sort((d,i)=>d.lastAt-i.lastAt),s=a.filter(d=>d.picked).length;return`<div class="fb-item ta-log-item">
      <div class="fb-head"><span class="venue-date">${escapeHtml(cnMdHm(n.windowStart))} – ${escapeHtml(cnMdHm(n.windowStart+n.hours*3600*1e3))}</span>
        <span class="fb-time">${n.hours} 小时 · ${a.length} 单 · 已取 ${s} 单</span></div>
      <ul class="ta-log-ops">${a.map(d=>`<li>${escapeHtml(ticketRoundLabel(d.day))} 第 ${d.seq} 号 → <b>${d.picked?"已取票":"取消取票"}</b><small>${escapeHtml(cnMdHm(d.lastAt))}${d.count>1?` · 共 ${d.count} 次，首次 ${escapeHtml(cnHm(d.firstAt))}`:""}</small></li>`).join("")}</ul>
    </div>`}).join("")}async function loadTicketGuideEditor(){if(ticketAdmin.guideLoaded)return;const t=await callWorker({action:"get_ticket_guide"});if(!t||!t.ok){setMsg($("ticketGuideMsg"),adminErr(t,"读取失败"));return}$("ticketGuideInput").value=t.text||TICKET_GUIDE_DEFAULT,$("ticketGuideState").textContent=t.text?"· 已修改":"· 默认",ticketAdmin.guideLoaded=!0,renderTicketGuidePreview()}function renderTicketGuidePreview(){$("ticketGuidePreview").innerHTML=renderGuideMarkup($("ticketGuideInput").value)}async function saveTicketGuide(t){const e=t.trim()===TICKET_GUIDE_DEFAULT.trim()?"":t;await ticketAdminSet({guide:e},e?"购票须知已保存":"购票须知已恢复默认")&&($("ticketGuideState").textContent=e?"· 已修改":"· 默认",ticketGuide.loaded=!1,$("ticketGuideContent").innerHTML=renderGuideMarkup(e||TICKET_GUIDE_DEFAULT))}const loadExcelJs=()=>loadLateScript("assets/lib/exceljs.min.js",()=>!!window.ExcelJS).then(()=>window.ExcelJS);async function saveWorkbook(t,e){const n=await t.xlsx.writeBuffer(),a=epochToCnLocal(Date.now()).replace(/[-:]/g,"").replace("T","-");downloadBlob(new Blob([n],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),`${e}_${a}.xlsx`)}const XL_RED="FFE02020",XL_ORANGE="FFED7D31",XL_GREEN="FF92D050";function ticketMessageLine(t){const e=ticketActiveHolders(t.holders).find(n=>!n.pending)||t.holders.find(n=>n&&!n.pending);return e?t.anonymous?`来自${e.server}的冒险者：${t.message}`:`${e.name}@${e.server}：${t.message}`:`某位冒险者：${t.message}`}async function buildTicketWorkbook(t){const e=await loadExcelJs(),n=new e.Workbook,a={horizontal:"center",vertical:"middle"},s=t.filter(l=>!l.voided),d=computeTicketDuplicates(t),i=ticketRoundList().filter(l=>s.some(m=>m.day===l.key)),u=Math.max(5,...s.map(l=>ticketActiveHolders(l.holders).length)),c=u+4,o=n.addWorksheet("预售票"),p=["联系方式","序号","购票数量",...Array.from({length:u},(l,m)=>`购票id（${m+1}）`),"是否取票"];let h=1;i.forEach(l=>{const m=s.filter(S=>S.day===l.key).sort((S,T)=>S.seq-T.seq),v=m.reduce((S,T)=>S+T.qty,0);o.mergeCells(h,1,h,c-2);const f=o.getCell(h,1),y=/^(\d{4})-(\d{2})-(\d{2})$/.exec(l.key);y?(f.value=new Date(Date.UTC(Number(y[1]),Number(y[2])-1,Number(y[3]))),f.numFmt="yyyy/m/d"):f.value=ticketRoundLabel(l.key,!0),f.alignment=a,f.font={bold:!0},f.fill={type:"pattern",pattern:"solid",fgColor:{argb:XL_GREEN}},o.getCell(h,c-1).value="售出票数：",o.getCell(h,c-1).alignment=a;const E=h+2,_=h+1+Math.max(1,m.length);o.getCell(h,c).value={formula:`SUM(C${E}:C${_})`,result:v},o.getCell(h,c).alignment=a,h++,p.forEach((S,T)=>{const M=o.getCell(h,T+1);M.value=S,M.alignment=a,M.font={bold:!0}}),h++,m.length||h++,m.forEach(S=>{const T=d.get(S.id)||{contact:!1,holders:[]},M=S.holders.map((C,x)=>({h:C,i:x})).filter(C=>!C.h.voided);[S.contact,S.seq,S.qty,...Array.from({length:u},(C,x)=>M[x]?formatHolder(M[x].h):null),S.picked?"是":null].forEach((C,x)=>{const B=o.getCell(h,x+1);B.value=C,B.alignment=a;let I=S.overLimit?XL_RED:null;x===0&&T.contact&&(I=XL_ORANGE),x>=3&&x<3+u&&M[x-3]&&T.holders[M[x-3].i]&&(I=XL_ORANGE),I&&(B.font={color:{argb:I},bold:S.overLimit})}),h++}),h++}),i.length||(o.getCell(1,1).value="还没有有效订单"),o.getColumn(1).width=16,o.getColumn(2).width=6,o.getColumn(3).width=9;for(let l=4;l<4+u;l++)o.getColumn(l).width=22;o.getColumn(c).width=10;const A=c+2;[["标注说明",{bold:!0}],["每一块是一轮（两次票额刷新之间）；绿色格是这一轮的日期",null],["红字：提交时这一轮票额已满（超额登记，整单标红）",{color:{argb:XL_RED}}],["橙字：联系方式或持票 id 与其他订单重复",{color:{argb:XL_ORANGE}}],["作废的订单和持票人不在本页，见「已作废」页",null]].forEach(([l,m],v)=>{const f=o.getCell(v+1,A);f.value=l,m&&(f.font=m)}),o.getColumn(A).width=50;const w=s.filter(l=>l.message);if(ticketAdmin.status?.messageOn!==!1||w.length){const l=n.addWorksheet("留言");l.addRow(["轮次","序号","留言"]),l.getRow(1).font={bold:!0},w.forEach(m=>l.addRow([ticketRoundLabel(m.day,!0),m.seq,ticketMessageLine(m)])),l.getColumn(1).width=20,l.getColumn(2).width=6,l.getColumn(3).width=90,l.getColumn(3).alignment={wrapText:!0,vertical:"top"}}const b=n.addWorksheet("已作废");b.addRow(["轮次","序号","联系方式","作废范围","作废的持票人","留言","登记时间"]),b.getRow(1).font={bold:!0},t.forEach(l=>{l.voided&&b.addRow([ticketRoundLabel(l.day,!0),l.seq,l.contact,`整单（${l.qty} 张）`,ticketActiveHolders(l.holders).map(formatHolder).join("、"),l.message||"",formatCnSeconds(l.createdAt)]);const m=l.holders.filter(v=>v&&v.voided);m.length&&b.addRow([ticketRoundLabel(l.day,!0),l.seq,l.contact,`部分（${m.length} 张）${l.voided?"，后来整单作废":""}`,m.map(formatHolder).join("、"),l.message||"",formatCnSeconds(l.createdAt)])}),[20,6,16,18,40,40,20].forEach((l,m)=>{b.getColumn(m+1).width=l});const r=n.addWorksheet("登记信息");return r.addRow(["轮次","序号","联系方式","张数","状态","登记时间","IP 属地","验证方式"]),r.getRow(1).font={bold:!0},t.forEach(l=>{const m=l.voided?"已作废":l.overLimit?"超额":"有效";r.addRow([ticketRoundLabel(l.day,!0),l.seq,l.contact,l.qty,m,formatCnSeconds(l.createdAt),geoText(l.geo),verifyModeText(l.verifyMode)])}),[20,6,16,6,8,20,14,10].forEach((l,m)=>{r.getColumn(m+1).width=l}),n}async function exportTicketExcel(t=""){await saveWorkbook(await buildTicketWorkbook(ticketAdmin.orders),`花街购票信息${ticketAdmin.status?.testMode?"（测试）":""}${t}`)}async function withAdminBusy(t,e){const n=$("ticketAdminMsg");setMsg(n,""),t.disabled=!0;try{await e(n)}finally{t.disabled=!1}}function initTicketAdmin(){const t=()=>$("ticketAdminMsg"),e=(r,l,m,v)=>{const f=$(r).value.trim(),y=Number(f);return f===""||!Number.isInteger(y)||y<l||y>m?(setMsg(t(),v),null):($(r).blur(),y)},n=(r,l)=>$(r).addEventListener("keydown",m=>{m.key==="Enter"&&l()});$("ticketAdminTabs").addEventListener("click",r=>{const l=r.target.closest("[data-ta-tab]");l&&(ticketAdmin.tab=l.dataset.taTab,renderTicketAdmin())}),$("ticketOpenBtn").addEventListener("click",()=>{const r=!ticketAdmin.status?.open;ticketAdminSet({open:r},r?"购票已开放":"购票已关闭")}),$("ticketPendingBtn").addEventListener("click",()=>{const r=!ticketAdmin.status?.allowPending;ticketAdminSet({allowPending:r},r?"已允许持票 id 待定":"已关闭持票 id 待定")});const a=()=>{const r=$("ticketTitleInput").value.trim();if(r.length>60){setMsg(t(),"标题最多 60 字");return}$("ticketTitleInput").blur(),ticketAdminSet({title:r},r?"购票页标题已保存":"已恢复默认标题")};$("ticketTitleSaveBtn").addEventListener("click",a),n("ticketTitleInput",a),$("ticketTestBtn").addEventListener("click",()=>{const r=!ticketAdmin.status?.testMode;ticketAdminSet({testMode:r},r?"已加上「测试」后缀":"已去掉「测试」后缀")});const s=()=>{const r=e("ticketPerPersonInput",1,20,"单人限购需为 1–20 之间的整数");r!==null&&ticketAdminSet({perPerson:r},`单人限购已设为 ${r} 张`)};$("ticketPerPersonSaveBtn").addEventListener("click",s),n("ticketPerPersonInput",s);const d=()=>{const r=e("ticketCooldownInput",0,1440,"购票间隔需为 0–1440 的整数");r!==null&&ticketAdminSet({cooldownMin:r},r?`再次购票间隔已设为 ${r} 分钟`:"已取消再次购票间隔")};$("ticketCooldownSaveBtn").addEventListener("click",d),n("ticketCooldownInput",d),$("ticketSchedSaveBtn").addEventListener("click",()=>{const r=cnLocalToEpoch($("ticketOpenAtInput").value),l=cnLocalToEpoch($("ticketCloseAtInput").value);if($("ticketOpenAtInput").value&&!r){setMsg(t(),"开启时间无效");return}if($("ticketCloseAtInput").value&&!l){setMsg(t(),"关闭时间无效");return}if(!r&&!l){setMsg(t(),"请至少填写一个时间");return}const m=Date.now(),v=[r&&r<=m?"开启":"",l&&l<=m?"关闭":""].filter(Boolean);if(v.length&&!confirm(`定时${v.join("和")}时间已过，保存后立即生效，继续？`))return;const f=[];r&&f.push(`${formatCnTime(r)} 开启`),l&&f.push(`${formatCnTime(l)} 关闭`),ticketAdminSet({openAt:r,closeAt:l},`已设定：${f.join("，")}`)}),$("ticketSchedClearBtn").addEventListener("click",()=>{$("ticketOpenAtInput").value="",$("ticketCloseAtInput").value="",ticketAdminSet({openAt:0,closeAt:0},"已清除定时开关")});const i=r=>{const l=e("ticketExtraInput",1,1e5,"请填写 1 以上的整数");if(l===null)return;const m=ticketAdmin.status?.round;if(r<0&&m&&m.quota-l<0){setMsg(t(),`本轮票额仅 ${m.quota} 张`);return}ticketAdminSet({extraDelta:r*l},`本轮票额 ${r>0?"+":"−"}${l}`).then(v=>{v&&($("ticketExtraInput").value="")})};$("ticketExtraAddBtn").addEventListener("click",()=>i(1)),$("ticketExtraSubBtn").addEventListener("click",()=>i(-1)),$("ticketExtraClearBtn").addEventListener("click",()=>{confirm("清零本轮临时加票？")&&ticketAdminSet({extraSet:0},"临时加票已清零")}),$("ticketDailyBtn").addEventListener("click",()=>{const r=ticketAdmin.status?.dailyOn===!1;!r&&!confirm(`关闭每日刷新？

之后仅在自定义刷新点刷新票额，当前轮次不受影响。`)||ticketAdminSet({dailyOn:r},r?"已打开每日刷新":"已关闭每日刷新")});const u=()=>{const r=hhmmToMinutes($("ticketResetInput").value);if(r===null){setMsg(t(),"请填写刷新时间");return}r!==(ticketAdmin.status?.resetMin||0)&&!confirm(`每日刷新时间改为 ${minutesToHHMM(r)}？

当前轮次不受影响。`)||($("ticketResetInput").blur(),ticketAdminSet({resetMin:r},`每日刷新时间：${minutesToHHMM(r)}`))};$("ticketResetSaveBtn").addEventListener("click",u),n("ticketResetInput",u);const c=()=>{const r=e("ticketLimitInput",0,1e5,"每日票额需为 0 以上的整数");if(r===null)return;const l=!$("ticketLimitCurWrap").hidden&&$("ticketLimitCurChk").checked;ticketAdminSet({limit:r,limitApplyCurrent:l},l?`每日票额已设为 ${r} 张（当前这一轮也改成 ${r} 张）`:`每日票额已设为 ${r} 张（从下一次每日刷新开始）`)};$("ticketLimitSaveBtn").addEventListener("click",c),n("ticketLimitInput",c);const o=$("ticketPointsList");o.addEventListener("input",()=>{ticketAdmin.pointsDirty=!0}),o.addEventListener("click",r=>{const l=r.target.closest("[data-point-del]");l&&(l.closest("[data-point]").remove(),ticketAdmin.pointsDirty=!0,o.querySelector("[data-point]")||(o.innerHTML='<p class="ta-empty" data-points-empty>暂无自定义刷新点</p>'))}),$("ticketPointAddBtn").addEventListener("click",()=>{o.querySelector("[data-points-empty]")?.remove(),o.insertAdjacentHTML("beforeend",ticketPointRowHtml("",ticketAdmin.status?.limit??"")),ticketAdmin.pointsDirty=!0,o.querySelector("[data-point]:last-child .ta-point-at")?.focus()}),$("ticketPointSaveBtn").addEventListener("click",async()=>{const r=[...o.querySelectorAll("[data-point]")],l=[];for(const[y,E]of r.entries()){const _=E.querySelector(".ta-point-at").value,S=E.querySelector(".ta-point-qty").value.trim(),T=cnLocalToEpoch(_),M=Number(S);if(!T){setMsg(t(),`第 ${y+1} 个刷新点缺少时间`);return}if(S===""||!Number.isInteger(M)||M<0){setMsg(t(),`第 ${y+1} 个刷新点票额无效`);return}l.push({at:T,qty:M})}const m=l.map(y=>Math.floor(y.at/6e4));if(new Set(m).size!==m.length){setMsg(t(),"刷新点时间重复");return}const v=l.filter(y=>y.at<=Date.now());if(v.length&&!confirm(`${v.length} 个刷新点时间已过：${v.map(y=>formatCnTime(y.at)).join("、")}

保存后将立即以最晚的一个开始新一轮，继续？`))return;ticketAdmin.pointsDirty=!1,await ticketAdminSet({points:l},l.length?`已保存 ${l.length} 个刷新点`:"已清空自定义刷新点")||(ticketAdmin.pointsDirty=!0)}),$("ticketPointResetBtn").addEventListener("click",()=>{ticketAdmin.pointsDirty=!1,renderTicketAdmin()});const p=()=>{const r=e("ticketNextInput",0,1e5,"下一次刷新的票额需为 0 以上的整数");r!==null&&(ticketAdmin.pointsDirty&&ticketAdmin.status?.nextRefresh?.kind==="custom"&&!confirm("自定义刷新点列表里有还没保存的修改，会被这次保存覆盖。继续吗？")||(ticketAdmin.pointsDirty=!1,ticketAdminSet({nextQty:r},`下一次刷新的票额已设为 ${r} 张`)))};$("ticketNextSaveBtn").addEventListener("click",p),n("ticketNextInput",p),$("ticketNextResetBtn").addEventListener("click",()=>ticketAdminSet({nextQty:null},"下一次刷新恢复默认票额"));const h={full:"购票页显示具体余票张数",range:"购票页只显示余票大致范围",hidden:"购票页不显示余票"};$("ticketRemainModeSelect").addEventListener("change",r=>{const l=r.target.value;r.target.blur(),ticketAdminSet({remainingMode:l},h[l]||"已保存")}),$("ticketShowSchedBtn").addEventListener("click",()=>{const r=ticketAdmin.status?.showSchedule===!1;ticketAdminSet({showSchedule:r},r?"购票页显示定时开启 / 关闭时间":"购票页不显示定时开启 / 关闭时间")}),$("ticketShowResetBtn").addEventListener("click",()=>{const r=ticketAdmin.status?.showReset===!1;ticketAdminSet({showReset:r},r?"购票页显示刷新时间":"购票页不显示刷新时间")}),$("ticketViewerBtn").addEventListener("click",()=>{const r=ticketAdmin.status?.viewerEnabled===!1;ticketAdminSet({viewerEnabled:r},r?"「购票情况」已开放":"「购票情况」已关闭")}),document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach(r=>{r.addEventListener("click",()=>{const l=r.dataset.taFlag,m=!ticketAdmin.status?.[l];r.dataset.confirmOn&&m&&!confirm(r.dataset.confirmOn)||ticketAdminSet({[l]:m},m?r.dataset.toastOn:r.dataset.toastOff)})});const A=()=>{const r=e("ticketIdleInput",0,1440,"停留时限需为 0–1440 的整数");r!==null&&ticketAdminSet({idleMin:r},r?`停留时限：${r} 分钟`:"已取消停留时限")};$("ticketIdleSaveBtn").addEventListener("click",A),n("ticketIdleInput",A),$("ticketGuideEditor").addEventListener("toggle",r=>{r.currentTarget.open&&loadTicketGuideEditor()}),$("ticketGuideInput").addEventListener("input",()=>{clearTimeout($("ticketGuideInput")._t),$("ticketGuideInput")._t=setTimeout(renderTicketGuidePreview,250)}),$("ticketGuideSaveBtn").addEventListener("click",r=>withAdminBusy(r.currentTarget,async()=>{if(!ticketAdmin.guideLoaded){setMsg($("ticketGuideMsg"),"读取中，请稍候");return}setMsg($("ticketGuideMsg"),""),await saveTicketGuide($("ticketGuideInput").value)})),$("ticketGuideResetBtn").addEventListener("click",r=>withAdminBusy(r.currentTarget,async()=>{confirm("恢复默认须知？")&&($("ticketGuideInput").value=TICKET_GUIDE_DEFAULT,renderTicketGuidePreview(),ticketAdmin.guideLoaded=!0,await saveTicketGuide(TICKET_GUIDE_DEFAULT))}));const w=()=>{const r=e("ticketLogHoursInput",1,720,"日志间隔需为 1–720 的整数");r!==null&&ticketAdminSet({viewerLogHours:r},`日志间隔：${r} 小时`)};$("ticketLogHoursSaveBtn").addEventListener("click",w),n("ticketLogHoursInput",w),$("ticketLogBtn").addEventListener("click",r=>withAdminBusy(r.currentTarget,loadTicketLog));const b=()=>$("ticketViewerMsg");$("ticketViewerSchedSaveBtn").addEventListener("click",async()=>{setMsg(b(),"");const r=cnLocalToEpoch($("ticketViewerOpenAtInput").value),l=cnLocalToEpoch($("ticketViewerCloseAtInput").value);if($("ticketViewerOpenAtInput").value&&!r){setMsg(b(),"开放时间无效");return}if($("ticketViewerCloseAtInput").value&&!l){setMsg(b(),"关闭时间无效");return}if(!r&&!l){setMsg(b(),"请至少填写一个时间");return}const m=Date.now(),v=[r&&r<=m?"开放":"",l&&l<=m?"关闭":""].filter(Boolean);if(v.length&&!confirm(`定时${v.join("和")}时间已过，保存后立即生效，继续？`))return;const f=[];r&&f.push(`${formatCnTime(r)} 开放`),l&&f.push(`${formatCnTime(l)} 关闭`),await ticketAdminSet({viewerOpenAt:r,viewerCloseAt:l},`「购票情况」已设定：${f.join("，")}`)||setMsg(b(),$("ticketAdminMsg").textContent||"保存失败")}),$("ticketViewerSchedClearBtn").addEventListener("click",()=>{setMsg(b(),""),$("ticketViewerOpenAtInput").value="",$("ticketViewerCloseAtInput").value="",ticketAdminSet({viewerOpenAt:0,viewerCloseAt:0},"已清除「购票情况」的定时开放 / 关闭")}),$("ticketDaySelect").addEventListener("change",r=>{ticketAdmin.day=r.target.value,renderTicketAdmin()}),$("ticketSearchInput").addEventListener("input",r=>{ticketAdmin.search=r.target.value.trim(),renderTicketOrders()}),$("ticketAdminTbody").addEventListener("click",async r=>{const l=r.target.closest("[data-act]");if(!l)return;const m=Number(l.closest("[data-order-id]").dataset.orderId),v=ticketAdmin.orders.find(E=>E.id===m);if(!v)return;const f=l.dataset.act;if(f==="edit"){openTicketEdit(v);return}if(f==="partial"){openTicketPartial(v);return}const y=f==="void";if(!(y&&!confirm(`作废第 ${v.seq} 号（${v.qty} 张）？票额将放回本轮。`))){l.disabled=!0;try{await ticketAdminVoid(m,y)}finally{l.disabled=!1}}}),$("ticketAdminTbody").addEventListener("change",r=>{const l=r.target.closest("[data-pick]");if(!l)return;const m=Number(l.closest("[data-order-id]").dataset.orderId);ticketTogglePickup(m,l.checked,l)}),$("ticketEditBox").addEventListener("click",r=>{const l=r.target;if(l.closest("#teCancel")||l.closest("#tpClose")){closeTicketEdit();return}if(l.closest("#teSave")){saveTicketEdit();return}if(l.closest("#teAddHolder")){if(collectTicketEditHolders(),ticketAdmin.editHolders.length>=50){setMsg($("teMsg"),"一单最多 50 位持票人");return}ticketAdmin.editHolders.push({name:"",server:""}),renderTicketEditHolders();return}const m=l.closest("[data-h-del]");if(m){collectTicketEditHolders(),ticketAdmin.editHolders.splice(Number(m.closest("[data-h]").dataset.h),1),renderTicketEditHolders();return}const v=l.closest("[data-pv]");v&&(v.disabled=!0,ticketPartialVoid(Number(v.dataset.pv),v.dataset.pvVoid==="1").finally(()=>{v.disabled=!1}))}),$("ticketEditBox").addEventListener("change",r=>{const l=r.target.closest(".te-pending");if(l){const m=l.closest("[data-h]");m.querySelector(".te-name").disabled=l.checked,m.querySelector(".te-server").disabled=l.checked}}),$("ticketEditBox").addEventListener("focusout",r=>{const l=r.target.closest(".te-name");l&&(l.value=normalizeTicketName(l.value))}),$("ticketStatsRound").addEventListener("change",r=>{ticketAdmin.statsRound=r.target.value,renderTicketStats()}),$("ticketStatsBody").addEventListener("click",r=>{const l=r.target.closest("[data-copy-unpicked]");l&&copyTicketUnpicked(l.dataset.copyUnpicked)}),$("ticketRefreshBtn").addEventListener("click",r=>withAdminBusy(r.currentTarget,async()=>{await refreshTicketAdmin()&&showToast("已刷新")})),$("ticketExportBtn").addEventListener("click",r=>withAdminBusy(r.currentTarget,async l=>{if(!await refreshTicketAdmin()){setMsg(l,"读取购票数据失败，未导出");return}try{await exportTicketExcel()}catch(m){console.error(m),setMsg(l,"导出失败：表格组件加载不出来，检查一下网络后再试")}})),$("ticketClearBtn").addEventListener("click",r=>withAdminBusy(r.currentTarget,async l=>{if(!await refreshTicketAdmin()){setMsg(l,"读取购票数据失败，未执行清空");return}const m=ticketAdmin.orders.length,v=ticketAdmin.orders.filter(y=>y.voided).length;if(!confirm(`清空全部购票数据？共 ${m} 单${v?`，含作废 ${v} 单`:""}

将先下载 Excel 备份，清空后无法恢复。`))return;if(m)try{await exportTicketExcel("_清空前备份")}catch(y){console.error(y),setMsg(l,"备份导出失败，已取消清空。检查网络后再试");return}const f=await callWorker({action:"ticket_admin_clear",password:internalAdminPassword,confirm:"CLEAR"});if(!f||!f.ok){setMsg(l,adminErr(f,"清空失败，请重新登录内部入口后再试"));return}await refreshTicketAdmin(),showToast(m?"已备份并清空购票数据":"购票数据已清空")})),clearInterval(ticketAdminTimer),ticketAdminTimer=setInterval(()=>{document.hidden||isTicketViewer()||!internalAdminPassword||$("ticketAdminPanel").hidden||$("adminModalOverlay").hidden||ticketAdmin.edit||ticketAdmin.tab==="settings"||runQuietly(refreshTicketAdmin)},60*1e3)}const feedbackAdmin={items:[],loaded:!1};function renderFeedbackAdmin(){const t=$("feedbackFilterCat").value,e=$("feedbackFilterState").value,n=feedbackAdmin.items,a=n.filter(i=>!i.handled).length;$("feedbackAdminStatus").textContent=n.length?`共 ${n.length} 条，未处理 ${a} 条`:"暂无反馈";const s=$("feedbackPillBadge");s.hidden=!a,s.textContent=a>99?"99+":String(a);const d=n.filter(i=>(!t||i.category===t)&&(!e||(e==="done"?i.handled:!i.handled)));$("feedbackAdminList").innerHTML=d.length?d.map(i=>`<div class="fb-item${i.handled?" is-done":""}" data-fb-id="${i.id}">
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
    </div>`).join(""):`<p class="fb-empty">${n.length?"无匹配结果":"暂无反馈"}</p>`}async function refreshFeedbackAdmin(){const t=await callWorker({action:"feedback_admin_list",password:internalAdminPassword});return!t||!t.ok?($("feedbackAdminStatus").textContent=adminErr(t,"读取失败，请重新登录内部入口后再试"),!1):(feedbackAdmin.items=t.items,feedbackAdmin.loaded=!0,noteAdminItems("feedbackAdminPanel",t.items),renderFeedbackAdmin(),!0)}function initFeedbackAdmin(){$("feedbackFilterCat").insertAdjacentHTML("beforeend",Object.entries(FEEDBACK_CATEGORIES).map(([t,e])=>`<option value="${t}">${e}</option>`).join("")),$("feedbackFilterCat").addEventListener("change",renderFeedbackAdmin),$("feedbackFilterState").addEventListener("change",renderFeedbackAdmin),$("feedbackRefreshBtn").addEventListener("click",async t=>{const e=t.currentTarget;e.disabled=!0;try{await refreshFeedbackAdmin()&&showToast("已刷新")}finally{e.disabled=!1}}),$("feedbackAdminList").addEventListener("click",async t=>{const e=t.target.closest("[data-fb-act]");if(!e)return;const n=Number(e.closest("[data-fb-id]").dataset.fbId),a=feedbackAdmin.items.find(u=>u.id===n);if(!a)return;const s=$("feedbackAdminMsg");setMsg(s,"");const d=e.dataset.fbAct;if(d==="copy"){copyText(a.contact,"联系方式已复制",a.contact);return}if(d==="delete"&&!confirm("确定删除这条反馈吗？删除后无法恢复。"))return;e.disabled=!0;const i=d==="mark"?await callWorker({action:"feedback_admin_mark",password:internalAdminPassword,id:n,handled:!a.handled}):await callWorker({action:"feedback_admin_delete",password:internalAdminPassword,id:n});if(e.disabled=!1,!i||!i.ok){setMsg(s,adminErr(i,"操作失败，请重新登录内部入口后再试"));return}d==="mark"?a.handled=!!i.handled:feedbackAdmin.items=feedbackAdmin.items.filter(u=>u.id!==n),renderFeedbackAdmin(),showToast(d==="mark"?a.handled?"已标记为已处理":"已标记为未处理":"已删除")})}const venueAdmin={items:[],today:"",editingId:null,loaded:!1},VENUE_SOURCE_TEXT={web:"网站登记",admin:"后台录入",import:"金数据导入"};function venueAdminFiltered(){const t=$("venueFilterState").value,e=$("venueFilterTime").value,n=venueAdmin.today||cnDate(0),a=venueAdmin.items.filter(s=>(!t||(t==="void"?s.voided:!s.voided))&&(!e||(e==="upcoming"?s.date>=n:s.date<n)));return a.sort((s,d)=>e==="upcoming"?s.date.localeCompare(d.date)||s.id-d.id:d.date.localeCompare(s.date)||d.id-s.id),a}function renderVenueAdmin(){const t=venueAdmin.items,e=venueAdmin.today||cnDate(0),n=t.filter(i=>!i.voided),a=n.filter(i=>i.date>=e).length,s=t.length-n.length;$("venueAdminStatus").textContent=t.length?`共 ${t.length} 条 · 有效 ${n.length} 条 · 近期 ${a} 条${s?` · 已作废 ${s} 条`:""}`:"暂无登记";const d=venueAdminFiltered();$("venueAdminList").innerHTML=d.length?d.map(i=>{const u=i.date<e,c=venueSummaryRows(i).filter(([o])=>!["预约日期","申请身份","使用意向","预约场地"].includes(o));return`<div class="fb-item venue-item${i.voided?" is-void":""}${u?" is-past":""}" data-venue-id="${i.id}">
      <div class="fb-head">
        <span class="venue-date">${escapeHtml(venueDateLabel(i.date))}</span>
        ${i.voided?'<span class="venue-tag is-void">已作废</span>':u?'<span class="venue-tag">已过去</span>':""}
        <span class="fb-time">#${i.id} · ${escapeHtml(VENUE_SOURCE_TEXT[i.source]||i.source)}</span>
      </div>
      <div class="venue-tags">
        <span class="fb-cat">${escapeHtml(venueIdentityText(i))}</span>
        <span class="fb-cat venue-purpose">${escapeHtml(venuePurposeText(i))}</span>
      </div>
      <div class="venue-places-line">${(i.places||[]).map(o=>`<span class="venue-chip">${escapeHtml(venuePlaceLabel(o))}</span>`).join("")}</div>
      <dl class="venue-kv">${c.map(([o,p])=>`<dt>${escapeHtml(o)}</dt><dd>${escapeHtml(p)}</dd>`).join("")}</dl>
      ${i.adminNote?`<p class="venue-note"><b>管理备注</b>${escapeHtml(i.adminNote)}</p>`:""}
      <p class="fb-contact">提交于 ${escapeHtml(formatCnTime(i.createdAt))}${i.updatedAt?` · 修改于 ${escapeHtml(formatCnTime(i.updatedAt))}`:""}${submitMetaHtml(i)}</p>
      <div class="fb-actions">
        ${i.contact?'<button type="button" class="tt-act is-copy" data-venue-act="copy">复制联系方式</button>':""}
        <button type="button" class="tt-act" data-venue-act="edit">修改</button>
        ${i.voided?'<button type="button" class="tt-act is-restore" data-venue-act="restore">恢复</button>':'<button type="button" class="tt-act is-void" data-venue-act="void">作废</button>'}
      </div>
    </div>`}).join(""):`<p class="fb-empty">${t.length?"无匹配结果":"暂无登记"}</p>`}async function refreshVenueAdmin(){const t=await callWorker({action:"venue_admin_list",password:internalAdminPassword});return!t||!t.ok?($("venueAdminStatus").textContent=adminErr(t,"读取失败，请重新登录内部入口后再试"),!1):(venueAdmin.items=t.items,venueAdmin.today=t.today||cnDate(0),venueAdmin.loaded=!0,noteAdminItems("venueAdminPanel",t.items),renderVenueAdmin(),!0)}function openVenueEditor(t=null){venueAdmin.editingId=t?t.id:null;const e=$("venueAdminFields");t?fillVenueForm(e,t):clearVenueForm(e),$("venueEditTitle").textContent=t?`修改登记 #${t.id}`:"新增预约",$("venueAdminSaveBtn").textContent=t?"保存修改":"保存",setMsg($("venueAdminFormMsg"),""),$("venueEditBox").hidden=!1,$("venueNewBtn").disabled=!0,$("venueEditBox").scrollIntoView({behavior:"smooth",block:"start"})}function closeVenueEditor(){venueAdmin.editingId=null,$("venueEditBox").hidden=!0,$("venueNewBtn").disabled=!1,clearVenueForm($("venueAdminFields"))}async function saveVenueAdmin(t){t.preventDefault();const e=$("venueAdminFormMsg"),n=readVenueForm($("venueAdminFields"));if(n.error){setMsg(e,n.error),n.focus?.focus();return}const a=venueAdmin.editingId,s=$("venueAdminSaveBtn");s.disabled=!0,setMsg(e,"");const d=await callWorker({action:"venue_admin_save",password:internalAdminPassword,...a?{id:a}:{},...n.payload});if(s.disabled=!1,!d||!d.ok){setMsg(e,adminErr(d,"保存失败，请重新登录内部入口后再试",VENUE_ERRORS));return}const i=venueAdmin.items.findIndex(u=>u.id===d.item.id);i>=0?venueAdmin.items[i]=d.item:venueAdmin.items.push(d.item),closeVenueEditor(),renderVenueAdmin(),showToast(a?`登记 #${a} 已保存`:`已新增登记 #${d.item.id}`)}async function venueAdminVoid(t,e){const n=$("venueAdminMsg");setMsg(n,"");const a=await callWorker({action:"venue_admin_void",password:internalAdminPassword,id:t.id,voided:e});if(!a||!a.ok){if(a&&a.error==="not_changed"){setMsg(n,"状态已变化，已刷新"),await refreshVenueAdmin();return}setMsg(n,adminErr(a,"操作失败，请重新登录内部入口后再试"));return}const s=venueAdmin.items.findIndex(d=>d.id===a.item.id);s>=0&&(venueAdmin.items[s]=a.item),renderVenueAdmin(),showToast(e?`登记 #${t.id} 已作废`:`登记 #${t.id} 已恢复`)}function initVenueAdmin(){buildVenueForm($("venueAdminFields"),{prefix:"vfa",admin:!0}),["input","change"].forEach(t=>$("venueAdminFields").addEventListener(t,()=>setMsg($("venueAdminFormMsg"),""))),$("venueFilterState").addEventListener("change",renderVenueAdmin),$("venueFilterTime").addEventListener("change",renderVenueAdmin),$("venueRefreshBtn").addEventListener("click",async t=>{const e=t.currentTarget;e.disabled=!0;try{await refreshVenueAdmin()&&showToast("已刷新")}finally{e.disabled=!1}}),$("venueNewBtn").addEventListener("click",()=>openVenueEditor(null)),$("venueAdminCancelBtn").addEventListener("click",closeVenueEditor),$("venueAdminForm").addEventListener("submit",saveVenueAdmin),$("venueAdminList").addEventListener("click",async t=>{const e=t.target.closest("[data-venue-act]");if(!e)return;const n=Number(e.closest("[data-venue-id]").dataset.venueId),a=venueAdmin.items.find(d=>d.id===n);if(!a)return;const s=e.dataset.venueAct;if(s==="copy"){copyText(a.contact,"联系方式已复制",a.contact);return}if(s==="edit"){if(venueAdmin.editingId&&venueAdmin.editingId!==n&&!confirm(`#${venueAdmin.editingId} 的修改尚未保存，放弃并改为修改 #${n}？`))return;openVenueEditor(a);return}if(!(s==="void"&&!confirm(`确定作废登记 #${n}（${venueDateLabel(a.date)} · ${a.charId||a.contact}）吗？

作废后不会删除，切到「已作废」还能恢复。`))){e.disabled=!0;try{await venueAdminVoid(a,s==="void")}finally{e.disabled=!1}}})}const surveyAdmin={items:[],open:!0,lockdown:!1,loaded:!1,readonly:!1},surveyAdminValid=()=>surveyAdmin.items.filter(t=>!t.voided);function surveyAdminSeqMap(){const t=new Map;return surveyAdminValid().forEach((e,n)=>t.set(e.id,n+1)),t}function surveyAdminStats(t){const e={};return SURVEY_FIELDS.forEach(n=>{e[n.key]={n:0,counts:{},sum:0,dist:Array(11).fill(0),texts:[]}}),t.forEach(n=>{const a=n.answers||{};SURVEY_FIELDS.forEach(s=>{const d=a[s.key];if(d==null||d==="")return;const i=e[s.key];if(s.type==="score"){if(!Number.isInteger(d)||d<1||d>10)return;i.n++,i.sum+=d,i.dist[d]++}else if(s.type==="single"||s.type==="multi"){const u=Array.isArray(d)?d:[d];if(!u.length)return;i.n++,u.forEach(c=>{i.counts[c]=(i.counts[c]||0)+1})}else i.n++,i.texts.push({id:n.id,text:String(d)})})}),e}const surveyAvg=t=>t.n?(t.sum/t.n).toFixed(1):"—",surveyPct=(t,e)=>e?Math.round(t/e*100):0;function surveyTextsHtml(t,e,n){return e.length?`<details class="sv-texts"><summary>${escapeHtml(t)}（${e.length} 条）</summary><ul>`+e.map(a=>`<li><span class="sv-text-id">${n.has(a.id)?`第 ${n.get(a.id)} 份`:`#${a.id}`}</span>${escapeHtml(a.text)}</li>`).join("")+"</ul></details>":""}function renderSurveyAdminStats(){const t=surveyAdminValid(),e=$("surveyAdminStats");if(!t.length){e.innerHTML=`<p class="fb-empty">${surveyAdmin.items.length?"暂无有效答卷":"暂无答卷"}</p>`;return}const n=surveyAdminStats(t),a=surveyAdminSeqMap(),d='<div class="sv-overview"><p class="sv-stat-sec">评分一览（平均分，满分 10 分）</p><dl class="sv-overview-list">'+[...SURVEY_ITEMS.filter(u=>u.kind==="score"&&!u.card),...SURVEY_ITEMS.filter(u=>u.kind==="score"&&u.card)].map(u=>{const c=n[u.key];return`<div class="sv-ov-item${c.n?"":" is-empty"}"><dt>${escapeHtml(u.card?`项目 · ${u.card.title}`:u.short||u.label)}</dt><dd><b>${surveyAvg(c)}</b><small>${c.n} 人</small></dd></div>`}).join("")+"</dl></div>",i=SURVEY.sections.map((u,c)=>{const o=SURVEY_ITEMS.filter(p=>p.section===c).map(p=>{const h=n[p.key];if(p.kind==="choice"){const A=Math.max(1,...p.options.map(r=>h.counts[r.key]||0)),w=p.options.map(r=>{const l=h.counts[r.key]||0;return`<div class="sv-bar-row"><span class="sv-bar-key">${escapeHtml(r.label)}</span><span class="sv-bar"><i style="width:${l/A*100}%"></i></span><span class="sv-bar-n">${l}<small>${surveyPct(l,h.n)}%</small></span></div>`}).join(""),b=p.other?surveyTextsHtml("其他",n[p.other.key].texts,a):"";return`<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(p.label)}</p><p class="sv-stat-meta">${h.n} 人作答</p><div class="sv-bars">${w}</div>${b}</div>`}if(p.kind==="score"){const A=Math.max(1,...h.dist.slice(1)),w=h.dist.slice(1).map((l,m)=>`<span class="sv-hist-col" title="${m+1} 分：${l} 人"><span class="sv-hist-bar"><i style="height:${l/A*100}%"></i></span><span class="sv-hist-n">${l}</span><span class="sv-hist-k">${m+1}</span></span>`).join(""),b=p.comment?surveyTextsHtml("意见或建议",n[p.comment.key].texts,a):"",r=p.card?`${escapeHtml(p.card.title)}<small>${escapeHtml(p.card.sub)}</small>`:escapeHtml(p.label);return`<div class="sv-stat${p.card?" is-card":""}"><p class="sv-stat-title">${r}</p><p class="sv-stat-meta">${h.n?`${h.n} 人 · 平均 <b>${surveyAvg(h)}</b> 分`:"暂无评分"}</p>`+(h.n?`<div class="sv-hist" aria-label="1～10 分各有多少人">${w}</div>`:"")+b+"</div>"}return`<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(p.label)}</p><p class="sv-stat-meta">${h.n?`${h.n} 条`:"暂无"}</p>`+surveyTextsHtml("展开查看",h.texts,a)+"</div>"}).join("");return`<p class="sv-stat-sec">${SURVEY_SECTION_NO[c]||c+1}、${escapeHtml(u.title)}</p>${o}`}).join("");e.innerHTML=d+i}function renderSurveyAdminList(){const t=$("surveyFilterState").value,e=surveyAdminSeqMap(),n=surveyAdmin.items.filter(a=>!t||(t==="void"?a.voided:!a.voided)).slice().sort((a,s)=>s.id-a.id);$("surveyAdminList").innerHTML=n.length?n.map(a=>{const s=a.answers||{},d=SURVEY_FIELDS.filter(i=>s[i.key]!==void 0&&s[i.key]!=="").map(i=>{const u=i.type==="score"?`${s[i.key]} 分`:surveyAnswerText(i.key,s[i.key]);return`<dt>${escapeHtml(surveyFieldHeader(i.key))}</dt><dd>${escapeHtml(u)}</dd>`}).join("");return`<div class="fb-item venue-item survey-item${a.voided?" is-void":""}" data-sv-id="${a.id}">
      <div class="fb-head">
        <span class="venue-date">${a.voided?`#${a.id}`:`第 ${e.get(a.id)} 份`}</span>
        ${a.voided?'<span class="venue-tag is-void">已作废</span>':""}
        <span class="fb-time">#${a.id} · ${escapeHtml(formatCnTime(a.createdAt))}</span>
        ${submitMetaHtml(a)}
      </div>
      <dl class="venue-kv">${d}</dl>
      <div class="fb-actions">
        ${s.contact?'<button type="button" class="tt-act is-copy" data-sv-act="copy">复制联系方式</button>':""}
        ${surveyAdmin.readonly?"":a.voided?'<button type="button" class="tt-act is-restore" data-sv-act="restore">恢复</button>':'<button type="button" class="tt-act is-void" data-sv-act="void">作废</button>'}
      </div>
    </div>`}).join(""):`<p class="fb-empty">${surveyAdmin.items.length?"无匹配结果":"暂无答卷"}</p>`}function renderSurveyAdmin(){const t=surveyAdmin.items,e=surveyAdminValid().length,n=t.length-e;$("surveyAdminStatus").textContent=t.length?`共 ${t.length} 份 · 有效 ${e} 份${n?` · 已作废 ${n} 份`:""}`:"暂无答卷",setTicketSwitch($("surveyOpenBtn"),surveyAdmin.open,"开放","关闭"),$("surveyLockNote").hidden=!surveyAdmin.lockdown;const a=$("surveyViewSelect").value;$("surveyFilterState").hidden=a!=="list",$("surveyAdminStats").hidden=a!=="stats",$("surveyAdminList").hidden=a!=="list",a==="list"?renderSurveyAdminList():renderSurveyAdminStats()}async function refreshSurveyAdmin(){const t=await callWorker({action:"survey_admin_list",password:internalAdminPassword||internalViewPassword,survey:SURVEY.id});return!t||!t.ok?($("surveyAdminStatus").textContent=t?.error==="viewer_closed"?"未开放":adminErr(t,"读取失败",{bad_survey:`问卷「${SURVEY.id}」不存在`}),!1):(surveyAdmin.readonly=!!t.readonly,$("surveyAdminPanel").classList.toggle("is-readonly",surveyAdmin.readonly),surveyAdmin.items=Array.isArray(t.items)?t.items:[],surveyAdmin.open=t.open!==!1,surveyAdmin.lockdown=!!t.lockdown,surveyAdmin.loaded=!0,noteAdminItems("surveyAdminPanel",surveyAdmin.items),renderSurveyAdmin(),!0)}async function exportSurveyExcel(){const t=await loadExcelJs(),e=new t.Workbook,n=surveyAdminValid(),a={bold:!0},s=e.addWorksheet("答卷");s.addRow(["第几份","编号","提交时间","IP 属地","验证方式",...SURVEY_FIELDS.map(o=>surveyFieldHeader(o.key))]),s.getRow(1).font=a,n.forEach((o,p)=>{const h=o.answers||{};s.addRow([p+1,o.id,formatCnTime(o.createdAt),geoText(o.geo),verifyModeText(o.verifyMode),...SURVEY_FIELDS.map(A=>{const w=h[A.key];return A.type==="score"?typeof w=="number"?w:null:surveyAnswerText(A.key,w)||null})])}),s.getColumn(1).width=7,s.getColumn(2).width=7,s.getColumn(3).width=18,s.getColumn(4).width=12,s.getColumn(5).width=10,SURVEY_FIELDS.forEach((o,p)=>{s.getColumn(p+6).width=o.type==="score"?12:o.type==="text"?30:24}),s.views=[{state:"frozen",xSplit:1,ySplit:1}];const d=surveyAdminStats(n),i=e.addWorksheet("统计");i.addRow([`有效答卷 ${n.length} 份`]).font=a,i.addRow([]),i.addRow(["打分题","作答人数","平均分",...Array.from({length:10},(o,p)=>`${p+1}分`)]).font=a,SURVEY_ITEMS.filter(o=>o.kind==="score").forEach(o=>{const p=d[o.key];i.addRow([o.card?`${o.card.title}（${o.card.sub}）`:o.label,p.n,p.n?Number((p.sum/p.n).toFixed(2)):null,...p.dist.slice(1)])}),i.addRow([]),i.addRow(["选择题","选项","人数","占作答人数"]).font=a,SURVEY_ITEMS.filter(o=>o.kind==="choice").forEach(o=>{const p=d[o.key];o.options.forEach((h,A)=>{const w=p.counts[h.key]||0;i.addRow([A===0?`${o.label}（${p.n} 人作答）`:"",h.label,w,p.n?`${surveyPct(w,p.n)}%`:"—"])})}),i.getColumn(1).width=52,i.getColumn(2).width=28;for(let o=3;o<=13;o++)i.getColumn(o).width=9;const u=e.addWorksheet("文字意见");u.addRow(["题目","第几份","编号","内容"]).font=a;const c=surveyAdminSeqMap();SURVEY_FIELDS.filter(o=>o.type==="text").forEach(o=>{d[o.key].texts.forEach(p=>u.addRow([surveyFieldHeader(o.key),c.get(p.id),p.id,p.text]))}),u.getColumn(1).width=34,u.getColumn(2).width=8,u.getColumn(3).width=7,u.getColumn(4).width=80,u.getColumn(4).alignment={wrapText:!0,vertical:"top"},await saveWorkbook(e,`花街活动问卷_${SURVEY.id}`)}async function surveyAdminVoid(t,e){const n=$("surveyAdminMsg");setMsg(n,"");const a=await callWorker({action:"survey_admin_void",password:internalAdminPassword,id:t.id,voided:e});if(!a||!a.ok){if(a&&a.error==="not_changed"){setMsg(n,"这份答卷的状态已经变过了，已为你刷新"),await refreshSurveyAdmin();return}setMsg(n,adminErr(a,"操作失败，请重新登录内部入口后再试"));return}const s=surveyAdmin.items.findIndex(d=>d.id===a.item.id);s>=0&&(surveyAdmin.items[s]=a.item),renderSurveyAdmin(),showToast(e?`答卷 #${t.id} 已作废`:`答卷 #${t.id} 已恢复`)}function initSurveyAdmin(){$("surveyViewSelect").addEventListener("change",renderSurveyAdmin),$("surveyFilterState").addEventListener("change",renderSurveyAdmin),$("surveyRefreshBtn").addEventListener("click",async t=>{const e=t.currentTarget;e.disabled=!0;try{await refreshSurveyAdmin()&&showToast("已刷新")}finally{e.disabled=!1}}),$("surveyOpenBtn").addEventListener("click",async t=>{const e=t.currentTarget,n=!surveyAdmin.open;if(!(!n&&!confirm(`确定关闭问卷吗？

关闭后访客看到「问卷已经结束收集」，不能再提交；已经收到的答卷不受影响，之后随时可以再开放。`))){setMsg($("surveyAdminMsg"),""),e.disabled=!0;try{const a=await callWorker({action:"survey_admin_set",password:internalAdminPassword,survey:SURVEY.id,open:n});if(!a||!a.ok){setMsg($("surveyAdminMsg"),adminErr(a,"切换失败，请重新登录内部入口后再试"));return}surveyAdmin.open=a.open,renderSurveyAdmin(),showToast(a.open?"问卷已开放":"问卷已关闭")}finally{e.disabled=!1}}}),$("surveyExportBtn").addEventListener("click",async t=>{const e=t.currentTarget,n=$("surveyAdminMsg");setMsg(n,""),e.disabled=!0;try{if(!await refreshSurveyAdmin()){setMsg(n,"读取问卷数据失败，未导出");return}if(!surveyAdminValid().length){setMsg(n,"暂无有效答卷");return}await exportSurveyExcel()}catch(a){console.error(a),setMsg(n,"导出失败：表格组件加载不出来，检查一下网络后再试")}finally{e.disabled=!1}}),$("surveyCopyLinkBtn").addEventListener("click",()=>{const t=`${location.origin}${location.pathname}${SURVEY_HASH}`;copyText(t,"问卷链接已复制",t)}),$("surveyAdminList").addEventListener("click",async t=>{const e=t.target.closest("[data-sv-act]");if(!e)return;const n=Number(e.closest("[data-sv-id]").dataset.svId),a=surveyAdmin.items.find(d=>d.id===n);if(!a)return;const s=e.dataset.svAct;if(s==="copy"){copyText(a.answers.contact,"联系方式已复制",a.answers.contact);return}if(!(s==="void"&&!confirm(`作废答卷 #${n}？`))){e.disabled=!0;try{await surveyAdminVoid(a,s==="void")}finally{e.disabled=!1}}})}const popupAdmin={saved:null,imageUrl:null,loaded:!1},popupFormValue=()=>({title:$("popupTitleInput").value.trim(),body:$("popupBodyInput").value.replace(/\r\n?/g,`
`).trim(),image_url:popupAdmin.imageUrl||null});function popupFormDirty(){const t=popupAdmin.saved;if(!t)return!1;const e=popupFormValue();return e.title!==(t.title||"")||e.body!==(t.body||"")||e.image_url!==(t.image_url||null)}function updatePopupBodyCount(){$("popupBodyCount").textContent=`${$("popupBodyInput").value.length} / 3000`}function renderPopupAdminStatus(){const t=popupAdmin.saved,e=$("popupToggleBtn");if(!t){$("popupAdminStatus").textContent="读取失败，请刷新后再试",e.disabled=!0;return}$("popupAdminStatus").textContent=t.updated_at?`内容更新于 ${formatCnTime(t.updated_at)}`:"还没有保存过内容",setTicketSwitch(e,!!t.enabled,"开启","关闭"),e.disabled=!1}function fillPopupAdminForm(t){$("popupTitleInput").value=t.title||"",$("popupBodyInput").value=t.body||"",popupAdmin.imageUrl=t.image_url||null,showImagePreview("popupImage",popupAdmin.imageUrl),updatePopupBodyCount()}async function refreshPopupAdmin(){$("popupAdminStatus").textContent="加载中…",$("popupToggleBtn").disabled=!0,setMsg($("popupAdminMsg"),"");const t=await callWorker({action:"popup_admin_get",password:internalAdminPassword});if(!t||!t.ok){popupAdmin.saved=null,renderPopupAdminStatus(),setMsg($("popupAdminMsg"),adminErr(t,"读取失败，请重新登录内部入口后再试"));return}const e=popupAdmin.loaded&&popupFormDirty();popupAdmin.saved=t.popup,popupAdmin.loaded=!0,e||fillPopupAdminForm(t.popup),renderPopupAdminStatus(),e&&setMsg($("popupAdminMsg"),"有未保存的修改")}const POPUP_ERRORS={empty:"标题、正文、配图至少填写一项",title_too_long:"标题最多 60 字",body_too_long:"正文最多 3000 字",bad_image_url:"配图无效，请重新上传"};async function savePopupAdmin(t={}){const e=popupFormValue();if(!e.title&&!e.body&&!e.image_url)return setMsg($("popupAdminMsg"),POPUP_ERRORS.empty),!1;const n=await callWorker({action:"popup_admin_save",password:internalAdminPassword,title:e.title,content:e.body,image_url:e.image_url,...t});return!n||!n.ok?(setMsg($("popupAdminMsg"),adminErr(n,"保存失败，请重新登录内部入口后再试",{...POPUP_ERRORS,auth:"登录状态失效了，重新登录内部入口后再试"})),!1):(popupAdmin.saved=n.popup,fillPopupAdminForm(n.popup),renderPopupAdminStatus(),setMsg($("popupAdminMsg"),""),!0)}function initPopupAdmin(){$("popupBodyInput").addEventListener("input",updatePopupBodyCount),bindImageUpload("popupImage",2560,t=>{popupAdmin.imageUrl=t,showImagePreview("popupImage",t),t&&setMsg($("popupImageStatus"),"已上传，记得点「保存」")},{notImage:"只能选图片",tooBig:t=>`图片太大了（${(t.size/1024/1024).toFixed(1)}MB），限 50MB`,processing:"图片处理中…",decodeFail:"这张图浏览器打不开，换一张试试（或先转成 JPG / PNG）",rateLimited:"上传太频繁了（每小时 10 张），歇一会儿再试",failed:"图片上传失败，请重试"}),$("popupSaveBtn").addEventListener("click",()=>withAdminBusy($("popupSaveBtn"),async()=>{await savePopupAdmin()&&showToast(popupAdmin.saved.enabled?"已保存，访客打开首页会看到新内容":"已保存（弹窗目前是关着的）")})),$("popupPreviewBtn").addEventListener("click",()=>{const t=popupFormValue();if(!t.title&&!t.body&&!t.image_url){setMsg($("popupAdminMsg"),"请先填写内容");return}openSitePopup(t,!0)}),$("popupToggleBtn").addEventListener("click",()=>withAdminBusy($("popupToggleBtn"),async()=>{const t=popupAdmin.saved;if(!t)return;const e=!t.enabled;if(setMsg($("popupAdminMsg"),""),e&&popupFormDirty()){if(!confirm("保存修改并开启弹窗？"))return;await savePopupAdmin({enabled:!0})&&showToast("已保存并开启弹窗");return}const n=await callWorker({action:"popup_admin_set",password:internalAdminPassword,enabled:e});if(!n||!n.ok){setMsg($("popupAdminMsg"),adminErr(n,"切换失败，请重新登录内部入口后再试",{empty:"请先保存内容"}));return}popupAdmin.saved=n.popup,renderPopupAdminStatus(),showToast(e?"弹窗公告已开启":"弹窗公告已关闭")}))}const HUAYU_ADMIN_MAX=2e4,HUAYU_MODE_NAME={open:"完全开放",decrypt:"仅开放解密",off:"彻底关闭"},HUAYU_MODE_NOTE={open:"访客可生成和解读花语",decrypt:"访客仅可解读花语",off:"隐藏入口，拒绝访客请求"},HUAYU_ALGO_NOTE={1:"一代：「听花语：」+ 草木字，篇幅最短",2:"二代：散文句式，长度约为一代的四五倍"},HUAYU_ADMIN_ERRORS={bad_key:"解密失败：密钥错误或花语被改动",need_key:"请输入自定义密钥",bad_key_input:"密钥不能为空，最长 128 字",bad_mode:"参数无效，请刷新页面",bad_algo:"参数无效，请刷新页面",no_key:"请先设置站点密钥",too_long:"内容过长",bad_input:"内容无效",empty:"请输入内容"},huayuAdmin={clearArmedAt:0,resultCopy:"",detectTimer:0};function setHuayuSeg(t,e){$(t).querySelectorAll("input").forEach(n=>{n.checked=n.value===String(e)}),syncSegments($(t))}const huayuSegValue=t=>$(t).querySelector("input:checked")?.value;function renderHuayuAdmin(t){setHuayuSeg("huayuModeSeg",t.mode),setHuayuSeg("huayuAlgoSeg",t.algo),setHuayuSeg("huayuAdminAlgoSeg",t.algo),$("huayuModeNote").textContent=HUAYU_MODE_NOTE[t.mode]||"",$("huayuAlgoNote").textContent=HUAYU_ALGO_NOTE[t.algo]||"",$("huayuAdminStatus").textContent=`当前状态：${HUAYU_MODE_NAME[t.mode]||t.mode} · ${t.algo===1?"一代":"二代"}算法`+(t.updatedAt?` · 更新于 ${formatCnTime(t.updatedAt)}`:"");const e=$("huayuKeyInput");document.activeElement!==e&&(e.value=t.key||""),$("huayuOldText").textContent=t.oldCount?`保留着 ${t.oldCount} 个旧密钥，用它们写的花语仍能解开`:"没有保留旧密钥",$("huayuClearOldBtn").hidden=!t.oldCount,applyHuayuMode(t)}async function refreshHuayuVisits(){const t=$("huayuVisitSummary"),e=await callWorker({action:"huayu_admin_visits",password:internalAdminPassword});if(!e||!e.ok){t.textContent=adminErr(e,"读取失败");return}t.textContent=e.total?`共 ${e.total} 次，今日 ${e.today} 次；显示最近 ${e.items.length} 次`:"暂无记录",$("huayuVisitList").innerHTML=e.items.map(n=>`<li>
    <span class="hy-visit-time">${escapeHtml(formatCnSeconds(n.at))}</span>
    <span title="${escapeHtml(geoTitle(n.geo))}">${escapeHtml(geoText(n.geo)||"—")}</span>
    <span>${escapeHtml(verifyModeText(n.verifyMode)||"—")}</span>
    <span class="hy-visit-id" title="访客标识">${escapeHtml(n.visitor)}</span>
  </li>`).join("")}async function refreshHuayuAdmin(){refreshHuayuVisits(),$("huayuAdminStatus").textContent="当前状态：加载中…",setMsg($("huayuSettingMsg"),""),loadHuayuJs({load:"none"}).catch(()=>{});const t=await callWorker({action:"huayu_admin_get",password:internalAdminPassword});if(!t||!t.ok){$("huayuAdminStatus").textContent=adminErr(t,"读取失败，请重新登录内部入口后再试");return}renderHuayuAdmin(t)}async function saveHuayuAdmin(t,e,n){const a=$("huayuSettingMsg");setMsg(a,""),n&&(n.disabled=!0);const s=await callWorker({action:"huayu_admin_set",password:internalAdminPassword,...t});return n&&(n.disabled=!1),!s||!s.ok?(setMsg(a,adminErr(s,"保存失败，请重新登录内部入口后再试",HUAYU_ADMIN_ERRORS)),!1):(renderHuayuAdmin(s),showToast(e),!0)}function syncHuayuAdminKeySeg(){syncSegments($("huayuAdminKeySeg"));const t=huayuSegValue("huayuAdminKeySeg")==="custom";return $("huayuAdminCustomKey").hidden=!t,t}function syncHuayuAdminInput(){clearTimeout(huayuAdmin.detectTimer),$("huayuAdminInput").value.length>HUAYU_DETECT_NOW?huayuAdmin.detectTimer=setTimeout(syncHuayuAdminInputNow,300):syncHuayuAdminInputNow()}function syncHuayuAdminInputNow(){const t=$("huayuAdminInput").value,e=window.HJHuayu;if(!e||!t){$("huayuAdminCount").textContent=t?`${t.length} 字`:"";return}const n=e.detect(t);if(!n.ok){$("huayuAdminCount").textContent=`${e.countChars(t)} 字`;return}$("huayuAdminCount").textContent=`${e.ALGO_NAMES[n.algo]}花语 ${e.countChars(t)} 字`,n.kind===1&&(setHuayuSeg("huayuAdminKeySeg","custom"),syncHuayuAdminKeySeg())}function showHuayuAdminResult(t,e,n,a){$("huayuAdminResultLabel").textContent=t,$("huayuAdminResultMeta").textContent=n,$("huayuAdminResultText").textContent=e,$("huayuAdminCopyBtn").textContent=a,huayuAdmin.resultCopy=e,$("huayuAdminResult").hidden=!1}async function huayuAdminConvert(t,e){const n=$("huayuAdminMsg");setMsg(n,"");try{await loadHuayuJs()}catch{setMsg(n,"花语脚本 huayu.js 没有加载成功（没上传或被缓存挡住），刷新页面再试");return}const a=window.HJHuayu,s=$("huayuAdminInput").value,d=syncHuayuAdminKeySeg(),i=d?$("huayuAdminCustomKey").value.trim():"",u={password:internalAdminPassword};if(!s.trim()){setMsg(n,HUAYU_ADMIN_ERRORS.empty);return}if(d&&!i){setMsg(n,"请输入自定义密钥"),$("huayuAdminCustomKey").focus();return}e.disabled=!0;try{if(t==="seal"){if(a.countChars(s)>HUAYU_ADMIN_MAX){setMsg(n,`最多 ${HUAYU_ADMIN_MAX} 字`);return}const p=Number(huayuSegValue("huayuAdminAlgoSeg"))||2,h=await a.encrypt(s,{algo:p,post:callWorker,auth:u,key:i});if(!h.ok){setMsg(n,adminErr(h.error==="net"?null:h,"加密失败",HUAYU_ADMIN_ERRORS));return}showHuayuAdminResult("花语",h.text,`${a.ALGO_NAMES[p]} · 原文 ${h.plainChars} 字 → 花语 ${h.cipherChars} 字 · ${d?"自定义密钥":"站点密钥"}`,"复制花语");return}const c=await a.decrypt(s,{post:callWorker,auth:u,key:i});if(!c.ok){c.error==="need_key"&&(setHuayuSeg("huayuAdminKeySeg","custom"),syncHuayuAdminKeySeg(),$("huayuAdminCustomKey").focus()),setMsg(n,HUAYU_ERRORS[c.error]&&!HUAYU_ADMIN_ERRORS[c.error]?HUAYU_ERRORS[c.error]:adminErr(c.error==="net"?null:c,"解密失败",HUAYU_ADMIN_ERRORS));return}const o=c.kind===1?"自定义密钥":c.old?"旧的站点密钥":"当前站点密钥";showHuayuAdminResult("原文",c.text,`${a.ALGO_NAMES[c.algo]}花语 ${a.countChars(s)} 字 → 原文 ${a.countChars(c.text)} 字 · ${o}`,"复制原文")}finally{e.disabled=!1}}function initHuayuAdmin(){$("huayuModeSeg").addEventListener("change",async t=>{const e=t.target.value;syncSegments($("huayuModeSeg")),$("huayuModeNote").textContent=HUAYU_MODE_NOTE[e]||"",await saveHuayuAdmin({mode:e},`花语访客端：${HUAYU_MODE_NAME[e]}`)||refreshHuayuAdmin()}),$("huayuAlgoSeg").addEventListener("change",async t=>{const e=Number(t.target.value);syncSegments($("huayuAlgoSeg")),$("huayuAlgoNote").textContent=HUAYU_ALGO_NOTE[e]||"",await saveHuayuAdmin({algo:e},`访客写花语改用${e===1?"一代":"二代"}算法`)||refreshHuayuAdmin()}),$("huayuKeyShow").addEventListener("change",t=>{$("huayuKeyInput").type=t.target.checked?"text":"password"}),$("huayuKeySaveBtn").addEventListener("click",t=>{const e=$("huayuKeyInput").value.trim();if(!e){setMsg($("huayuSettingMsg"),"密钥不能为空");return}saveHuayuAdmin({key:e},"站点密钥已保存",t.currentTarget)}),$("huayuKeyInput").addEventListener("keydown",t=>{t.key==="Enter"&&$("huayuKeySaveBtn").click()}),$("huayuKeyRandomBtn").addEventListener("click",t=>{saveHuayuAdmin({randomKey:!0},"已换成一个随机密钥",t.currentTarget)}),$("huayuClearOldBtn").addEventListener("click",t=>{const e=t.currentTarget;if(Date.now()-huayuAdmin.clearArmedAt>4e3){huayuAdmin.clearArmedAt=Date.now(),e.textContent="再点一次确认清除",setTimeout(()=>{Date.now()-huayuAdmin.clearArmedAt>=4e3&&(e.textContent="清除旧密钥")},4100);return}huayuAdmin.clearArmedAt=0,e.textContent="清除旧密钥",saveHuayuAdmin({clearOld:!0},"旧密钥已清除",e)}),$("huayuAdminAlgoSeg").addEventListener("change",t=>syncSegments(t.currentTarget)),$("huayuAdminKeySeg").addEventListener("change",syncHuayuAdminKeySeg),$("huayuAdminInput").addEventListener("input",()=>{syncHuayuAdminInput(),setMsg($("huayuAdminMsg"),"")}),$("huayuAdminSealBtn").addEventListener("click",t=>huayuAdminConvert("seal",t.currentTarget)),$("huayuAdminOpenBtn").addEventListener("click",t=>huayuAdminConvert("open",t.currentTarget)),$("huayuAdminCopyBtn").addEventListener("click",()=>{copyText(huayuAdmin.resultCopy,"已复制","复制失败，请手动选中复制")}),$("huayuVisitRefreshBtn").addEventListener("click",refreshHuayuVisits)}const PZ_ADMIN_DIFFS={easy:"鱼信 · 36块",normal:"鱼丽 · 60块",hard:"光风院霁月 · 128块"},PZ_ADMIN_AIDS={preview:"原图",edges:"边框",grid:"网格"},pzAidsText=(t,e="、")=>t&&t.length?t.map(n=>PZ_ADMIN_AIDS[n]||n).join(e):"",PZ_ADMIN_ERRORS={no_image:"请先上传并裁剪大赛图片",bad_range:"开启大赛需要填写开始和结束时间，结束要晚于开始",bad_time:"时间无效",bad_title:"大赛名称最多 30 字",bad_diff:"难度无效，请刷新页面",bad_image:"图片无效，请重新上传",bad_max_entries:"参加次数需为 0–99 的整数（0 为不限）",unknown_action:"Worker 还没有更新，暂时用不了（见更新说明）"},PZ_AID_PENALTY=[{name:"edges",rate:.1,min:6e4},{name:"grid",rate:.25,min:12e4}];function pzAdjustedMs(t,e){let n=Math.max(0,Number(t)||0);for(const a of PZ_AID_PENALTY)(e||[]).includes(a.name)&&(n+=Math.max(n*a.rate,a.min));return Math.round(n)}const PZ_CROP_RATIOS={"16:9":16/9,"4:3":4/3,"3:2":3/2,"1:1":1,"3:4":3/4},PZ_CROP_MAX=1600,puzzleAdmin={s:null,image:"",records:[],crop:null},pzImageUrl=t=>t?new URL(`image/${t}`,workerBase()).href:"";function pzFmtMs(t){const e=Math.max(0,Math.round(t)),n=Math.floor(e/1e3),a=Math.floor(n/3600),s=`${pad2(Math.floor(n/60)%60)}:${pad2(n%60)}.${Math.floor(e/100)%10}`;return a?`${a}:${s}`:s}function pzContestStatusText(t,e){return t.enabled?t.image?e<t.start?`大赛已开启 · 未开始（${formatCnTime(t.start)} 开始）`:e<=t.end?`大赛进行中（${formatCnTime(t.end)} 结束）`:`大赛已结束（${formatCnTime(t.end)}）`:"大赛已开启，但还没有图片":"大赛未开启"}function renderPuzzleAdmin(t){puzzleAdmin.s=t;const e=t.contest,n=hjNow();puzzleAdmin.image=e.image,$("pzAdminStatus").textContent=`中断继续${t.resume?"已开启":"已关闭"} · ${pzContestStatusText(e,n)} · 当前第 ${e.rev} 届`,setTicketSwitch($("pzAdminResumeBtn"),!!t.resume,"开启","关闭"),$("pzAdminTitle").value=e.title,$("pzAdminStart").value=e.start?epochToCnLocal(e.start):"",$("pzAdminEnd").value=e.end?epochToCnLocal(e.end):"",setHuayuSeg("pzAdminDiffSeg",e.diff);const a=e.tools||{};$("pzAdminToolPreview").checked=a.preview!==!1,$("pzAdminToolEdges").checked=a.edges!==!1,$("pzAdminToolGrid").checked=a.grid!==!1,setHuayuSeg("pzAdminPauseSeg",e.pauseRun?"run":"stop"),$("pzAdminMaxEntries").value=String(e.maxEntries||0),$("pzAdminContestStatus").textContent=`现在：${pzContestStatusText(e,n)}`,setTicketSwitch($("pzAdminToggleBtn"),!!e.enabled,"开启","关闭"),showPzAdminImage()}function showPzAdminImage(){const t=pzImageUrl(puzzleAdmin.image),e=$("pzAdminImagePreview");e.hidden=!t,t&&e.src!==t&&(e.src=t),$("pzAdminImageNone").hidden=!!t;const n=!!puzzleAdmin.s&&puzzleAdmin.image!==puzzleAdmin.s.contest.image;$("pzAdminImageNote").textContent=n?"新图片已上传，点「保存设置」后生效（更换图片算新一届）":""}async function refreshPuzzleAdmin(){$("pzAdminStatus").textContent="加载中…",setMsg($("pzAdminMsg"),"");const t=await callWorker({action:"puzzle_admin_get",password:internalAdminPassword});if(!t||!t.ok){$("pzAdminStatus").textContent=adminErr(t,"读取失败，请重新登录内部入口后再试",PZ_ADMIN_ERRORS);return}renderPuzzleAdmin(t),refreshPuzzleRecords()}function pzContestForm(){return{title:$("pzAdminTitle").value.trim(),start:cnLocalToEpoch($("pzAdminStart").value),end:cnLocalToEpoch($("pzAdminEnd").value),diff:huayuSegValue("pzAdminDiffSeg")||"easy",image:puzzleAdmin.image||"",tools:{preview:$("pzAdminToolPreview").checked,edges:$("pzAdminToolEdges").checked,grid:$("pzAdminToolGrid").checked},pauseRun:huayuSegValue("pzAdminPauseSeg")==="run",maxEntries:Number($("pzAdminMaxEntries").value||0)}}async function savePuzzleAdmin(t,e,n){const a=$("pzAdminMsg");setMsg(a,"");const s=t.contest;if(s){if(s.title.length>30)return setMsg(a,PZ_ADMIN_ERRORS.bad_title);if(!Number.isInteger(s.maxEntries)||s.maxEntries<0||s.maxEntries>99)return setMsg(a,PZ_ADMIN_ERRORS.bad_max_entries);if(s.start&&s.end&&s.end<=s.start)return setMsg(a,"结束时间要晚于开始时间");if(s.enabled&&!s.image)return setMsg(a,PZ_ADMIN_ERRORS.no_image);if(s.enabled&&(!s.start||!s.end))return setMsg(a,PZ_ADMIN_ERRORS.bad_range)}n&&(n.disabled=!0);const d=puzzleAdmin.s?.contest.rev,i=await callWorker({action:"puzzle_admin_set",password:internalAdminPassword,...t});if(n&&(n.disabled=!1),!i||!i.ok){setMsg(a,adminErr(i,"保存失败，请重新登录内部入口后再试",PZ_ADMIN_ERRORS));return}renderPuzzleAdmin(i),typeof puzzleSiteState<"u"&&(puzzleSiteState=null),showToast(d!==void 0&&i.contest.rev!==d?`${e}，已开始第 ${i.contest.rev} 届`:e),renderPuzzleRecords()}function openPzCrop(t){const e=$("pzAdminImageMsg");if(setMsg(e,""),!t.type.startsWith("image/"))return setMsg(e,"请选择图片");if(t.size>IMAGE_MAX_BYTES)return setMsg(e,"图片不能超过 50MB");closePzCrop();const n=URL.createObjectURL(t),a=$("pzCropImg");a.onload=()=>{puzzleAdmin.crop={url:n,nw:a.naturalWidth,nh:a.naturalHeight,ratio:PZ_CROP_RATIOS[huayuSegValue("pzCropRatioSeg")]||16/9},resetPzCrop(),$("pzCropBox").hidden=!1,layoutPzCrop()},a.onerror=()=>{URL.revokeObjectURL(n),setMsg(e,"无法读取该图片")},a.src=n}function closePzCrop(){const t=puzzleAdmin.crop;t&&URL.revokeObjectURL(t.url),puzzleAdmin.crop=null,$("pzCropBox").hidden=!0,$("pzCropImg").removeAttribute("src")}function resetPzCrop(){const t=puzzleAdmin.crop;let e=t.nw,n=e/t.ratio;n>t.nh&&(n=t.nh,e=n*t.ratio),Object.assign(t,{w:e,h:n,x:(t.nw-e)/2,y:(t.nh-n)/2})}function layoutPzCrop(){const t=puzzleAdmin.crop;if(!t||$("pzCropBox").hidden)return;const e=$("pzCropImg").clientWidth/t.nw;Object.assign($("pzCropRect").style,{left:t.x*e+"px",top:t.y*e+"px",width:t.w*e+"px",height:t.h*e+"px"});const n=Math.min(1,PZ_CROP_MAX/Math.max(t.w,t.h));$("pzCropInfo").textContent=`选中 ${Math.round(t.w)}×${Math.round(t.h)}，输出 ${Math.round(t.w*n)}×${Math.round(t.h*n)}`+(Math.max(t.w,t.h)<900?" · 图片偏小，拼块可能模糊":"")}function initPzCrop(){const t=$("pzCropRect");let e=null;t.addEventListener("pointerdown",a=>{const s=puzzleAdmin.crop;if(!s||a.pointerType==="mouse"&&a.button!==0)return;a.preventDefault();const d=a.target.dataset.h||"";e={id:a.pointerId,k:$("pzCropImg").clientWidth/s.nw,sx:a.clientX,sy:a.clientY,x:s.x,y:s.y,w:s.w,h:s.h,handle:d},d&&(e.dx=d.includes("w")?-1:1,e.dy=d.includes("n")?-1:1,e.ax=e.dx<0?s.x+s.w:s.x,e.ay=e.dy<0?s.y+s.h:s.y);try{t.setPointerCapture(a.pointerId)}catch{}}),t.addEventListener("pointermove",a=>{if(!e||a.pointerId!==e.id)return;const s=puzzleAdmin.crop,d=(a.clientX-e.sx)/e.k,i=(a.clientY-e.sy)/e.k;if(!e.handle)s.x=clamp(e.x+d,0,s.nw-s.w),s.y=clamp(e.y+i,0,s.nh-s.h);else{const u=(e.dx>0?e.x+e.w:e.x)+d,c=(e.dy>0?e.y+e.h:e.y)+i,o=Math.min(e.dx>0?s.nw-e.ax:e.ax,(e.dy>0?s.nh-e.ay:e.ay)*s.ratio),p=clamp(Math.max(Math.abs(u-e.ax),Math.abs(c-e.ay)*s.ratio),Math.min(60,o),o);s.w=p,s.h=p/s.ratio,s.x=e.dx>0?e.ax:e.ax-p,s.y=e.dy>0?e.ay:e.ay-s.h}layoutPzCrop()});const n=a=>{e&&a.pointerId===e.id&&(e=null)};t.addEventListener("pointerup",n),t.addEventListener("pointercancel",n),window.addEventListener("resize",layoutPzCrop),$("pzCropRatioSeg").addEventListener("change",()=>{syncSegments($("pzCropRatioSeg"));const a=puzzleAdmin.crop;a&&(a.ratio=PZ_CROP_RATIOS[huayuSegValue("pzCropRatioSeg")]||16/9,resetPzCrop(),layoutPzCrop())}),$("pzCropCancelBtn").addEventListener("click",closePzCrop),$("pzCropOkBtn").addEventListener("click",uploadPzCrop)}async function uploadPzCrop(){const t=puzzleAdmin.crop;if(!t)return;const e=$("pzCropOkBtn"),n=$("pzAdminImageMsg");e.disabled=!0,setMsg(n,"处理中…");try{const a=Math.min(1,PZ_CROP_MAX/Math.max(t.w,t.h)),s=document.createElement("canvas");s.width=Math.max(1,Math.round(t.w*a)),s.height=Math.max(1,Math.round(t.h*a));const d=s.getContext("2d");d.imageSmoothingQuality="high",d.drawImage($("pzCropImg"),t.x,t.y,t.w,t.h,0,0,s.width,s.height);let i=await new Promise(o=>s.toBlob(o,"image/webp",.9));if((!i||i.type!=="image/webp")&&(i=await new Promise(o=>s.toBlob(o,"image/jpeg",.9))),!i)throw new Error("encode fail");const u=(await readAsDataURL(i)).split(",")[1];setMsg(n,"上传中…");const c=await callWorker({action:"upload_announcement_image",password:internalAdminPassword,image:u,content_type:i.type});if(!c?.ok)throw new Error(c?.error||"upload failed");puzzleAdmin.image=c.key,closePzCrop(),setMsg(n,""),showPzAdminImage(),showToast("图片已上传，记得点「保存设置」")}catch(a){setMsg(n,a.message==="rate_limited"?"上传过于频繁，请稍后再试":"上传失败，请重试")}e.disabled=!1}async function refreshPuzzleRecords(){$("pzRecSummary").textContent="加载中…";const t=await callWorker({action:"puzzle_admin_records",password:internalAdminPassword});if(!t||!t.ok){$("pzRecSummary").textContent=adminErr(t,"读取失败",PZ_ADMIN_ERRORS);return}puzzleAdmin.records=t.items||[],renderPuzzleRecords()}function pzRecordsShown(){const t=$("pzRecRound").value||"cur",e=puzzleAdmin.s?.contest.rev??0,n=$("pzRecSort").value!=="at";let a=puzzleAdmin.records.filter(d=>t==="all"||d.rev===(t==="cur"?e:Number(t)));if(a=a.map(d=>({...d,adj:pzAdjustedMs(d.elapsed,d.aids)})).sort((d,i)=>n?d.voided-i.voided||d.adj-i.adj||d.elapsed-i.elapsed||d.at-i.at:i.at-d.at),$("pzRecBest").checked){const d=new Set;a=a.filter(i=>{if(i.voided)return!1;const u=`${i.rev}|${i.player}`;return d.has(u)?!1:(d.add(u),!0)})}let s=0;return a.map(d=>({...d,rank:n&&!d.voided?++s:0}))}function renderPuzzleRecords(){const t=$("pzRecRound"),e=t.value||"cur",n=puzzleAdmin.s?.contest.rev??0,a=[...new Set(puzzleAdmin.records.map(i=>i.rev))].filter(i=>i!==n).sort((i,u)=>u-i);t.innerHTML=`<option value="cur">本届（第 ${n} 届）</option><option value="all">全部</option>`+a.map(i=>`<option value="${i}">第 ${i} 届</option>`).join(""),t.value=[...t.options].some(i=>i.value===e)?e:"cur";const s=pzRecordsShown(),d=s.filter(i=>!i.voided);$("pzRecSummary").textContent=s.length?`共 ${s.length} 条（有效 ${d.length} 条，${new Set(d.map(i=>i.player)).size} 位玩家）`:"暂无记录",$("pzRecBody").innerHTML=s.map(i=>`<tr class="${i.voided?"is-voided":""}">
    <td>${i.rank||""}</td>
    <td>No.${i.id}</td>
    <td class="pz-rec-player">${escapeHtml(i.player)}</td>
    <td>${escapeHtml(PZ_ADMIN_DIFFS[i.diff]||i.diff)}</td>
    <td title="开局到登记 ${escapeHtml(pzFmtMs(i.serverMs))}">${escapeHtml(pzFmtMs(i.elapsed))}</td>
    <td>${escapeHtml(pzAidsText(i.aids)||"—")}</td>
    <td class="${i.adj!==i.elapsed?"pz-rec-adj":""}">${escapeHtml(pzFmtMs(i.adj))}</td>
    <td>${escapeHtml(formatCnSeconds(i.at))}</td>
    <td title="${escapeHtml(geoTitle(i.geo))}">${escapeHtml(geoText(i.geo)||"—")}</td>
    <td class="hy-visit-id">${escapeHtml(i.visitor)}</td>
    <td><button type="button" class="pz-rec-void" data-id="${i.id}" data-voided="${i.voided?1:0}">${i.voided?"恢复":"作废"}</button></td>
  </tr>`).join("")||'<tr><td colspan="11" class="pz-rec-empty">暂无记录</td></tr>'}function exportPuzzleRecords(){const t=pzRecordsShown();if(!t.length)return showToast("没有可导出的记录");const e=i=>/^[=+\-@\t\r]/.test(String(i))?`'${i}`:String(i),n=["名次","登记号","届","玩家ID","难度","块数","耗时(秒)","耗时","开局到登记(秒)","辅助功能","计入用时(秒)","计入用时","登记时间","IP属地","访客标识","状态"],a=t.map(i=>[i.rank||"",i.id,i.rev,e(i.player),PZ_ADMIN_DIFFS[i.diff]||i.diff,i.pieces,(i.elapsed/1e3).toFixed(1),pzFmtMs(i.elapsed),(i.serverMs/1e3).toFixed(1),pzAidsText(i.aids)||"未使用",(i.adj/1e3).toFixed(1),pzFmtMs(i.adj),formatCnSeconds(i.at),geoText(i.geo),i.visitor,i.voided?"已作废":"有效"]),s=[n,...a].map(i=>i.map(u=>`"${String(u).replace(/"/g,'""')}"`).join(",")).join(`\r
`),d=epochToCnLocal(Date.now()).replace(/[-:]/g,"").replace("T","-");downloadBlob(new Blob(["\uFEFF"+s],{type:"text/csv;charset=utf-8"}),`拼图大赛记录_${d}.csv`)}function initPuzzleAdmin(){$("pzAdminResumeBtn").addEventListener("click",t=>{const e=!puzzleAdmin.s?.resume;savePuzzleAdmin({resume:e},e?"中断继续已开启":"中断继续已关闭",t.currentTarget)}),$("pzAdminDiffSeg").addEventListener("change",()=>syncSegments($("pzAdminDiffSeg"))),$("pzAdminPauseSeg").addEventListener("change",()=>syncSegments($("pzAdminPauseSeg"))),$("pzAdminSaveBtn").addEventListener("click",t=>savePuzzleAdmin({contest:pzContestForm()},"大赛设置已保存",t.currentTarget)),$("pzAdminToggleBtn").addEventListener("click",t=>{const e=!puzzleAdmin.s?.contest.enabled;savePuzzleAdmin({contest:{...pzContestForm(),enabled:e}},e?"大赛已开启":"大赛已关闭",t.currentTarget)}),$("pzAdminPickBtn").addEventListener("click",()=>$("pzAdminFile").click()),$("pzAdminFile").addEventListener("change",()=>{const t=$("pzAdminFile").files[0];$("pzAdminFile").value="",t&&openPzCrop(t)}),initPzCrop(),["pzRecRound","pzRecSort","pzRecBest"].forEach(t=>$(t).addEventListener("change",renderPuzzleRecords)),$("pzRecRefreshBtn").addEventListener("click",refreshPuzzleRecords),$("pzRecExportBtn").addEventListener("click",exportPuzzleRecords),$("pzRecBody").addEventListener("click",async t=>{const e=t.target.closest(".pz-rec-void");if(!e)return;e.disabled=!0;const n=await callWorker({action:"puzzle_admin_void",password:internalAdminPassword,id:Number(e.dataset.id),voided:e.dataset.voided!=="1"});if(!n||!n.ok){e.disabled=!1,showToast(adminErr(n,"操作失败，刷新后再试"));return}const a=puzzleAdmin.records.findIndex(s=>s.id===n.item.id);a>=0&&(puzzleAdmin.records[a]=n.item),renderPuzzleRecords()})}const PLAY_ADMIN_ERRORS={unknown_action:"Worker 还没有更新，暂时用不了（见更新说明）"},PZ_PLAY_MODES={casual:"休闲",timed:"限时",overtime:"限时（超时后拼完）",contest:"大赛"},STAGE_DIFF_NAMES={easy:"仙人刺",normal:"魔界花",hard:"泰坦"},STAGE_JUDGE_NAMES={normal:"正常",loose:"宽松",hover:"放水"},STAGE_MODE_NAMES={show:"演出",learn:"学习",auto:"自动演奏"},playAdmin={puzzle:[],stage:[],perfOpen:new Set},playIds={puzzle:["pzPlay","pzPlayBody",10],stage:["stPlay","stPlayBody",13]},csvSafe=t=>/^[=+\-@\t\r]/.test(String(t))?`'${t}`:String(t),playerText=t=>t||"（未填写）";async function refreshPlays(t){const[e]=playIds[t];$(`${e}Summary`).textContent="加载中…";const n=await callWorker({action:"play_admin_list",password:internalAdminPassword,game:t});if(!n||!n.ok){$(`${e}Summary`).textContent=adminErr(n,"读取失败",PLAY_ADMIN_ERRORS);return}playAdmin[t]=n.items||[],renderPlays(t)}function playsShown(t){const[e]=playIds[t],n=($(`${e}Search`).value||"").trim().toLowerCase(),a=t==="stage"?$("stPlayMode").value:"";return playAdmin[t].filter(s=>(!n||`${s.player} ${s.title||""} ${s.song||""}`.toLowerCase().includes(n))&&(!a||s.mode===a))}function stagePerfLines(t){if(!t)return[];const e=n=>n?"开":"关";return[t.lat!==void 0&&`输出延迟 ${t.lat} ms`,t.hz?`刷新率 ${t.hz} Hz`:"刷新率未测出",t.frames!==void 0&&`${t.frames} 帧，掉帧 ${t.drop||0}（${t.frames?(100*(t.drop||0)/t.frames).toFixed(1):0}%），最长一帧 ${t.maxFrame||0} ms`,t.busy!==void 0&&`主线程每帧 ${t.busy} ms（最多 ${t.busyMax||0} ms）`,t.longs?`长任务 ${t.longs} 次（最长 ${t.longMax||0} ms）`:"无长任务",t.tapWait===-1?"点按时间戳不可用":t.tapWait?`点按排队 ${t.tapWait} ms`:null,`画面 ${t.render==="simple"?"简单显示":"正常显示"} · 气泡动画 ${t.anim==="browser"?"浏览器":"逐帧"} · 省电 ${{on:"开启",auto:"自动",off:"关闭"}[t.power]||t.power||""}${t.lite?"（已自动切换）":""} · 飞花线 ${e(t.fly)}`,t.delay!==void 0&&`判定延迟 ${t.delay>0?"+":""}${t.delay} ms`,t.resizes?`窗口大小变了 ${t.resizes} 次`:null,t.fixes?`动画对时 ${t.fixes} 次`:null,t.audio&&t.audio!=="running"?`音频 ${t.audio}`:null,(t.screen||t.stage)&&`屏幕 ${t.screen||"?"} · 舞台 ${t.stage||"?"}`,t.ua&&`浏览器 ${t.ua}`].filter(Boolean)}const stageScoreText=t=>t.mode==="show"?t.score.toLocaleString("en-US"):`${t.hits} / ${t.total}`,stageCountsText=t=>t?`P ${t.perfect} · G ${t.great} · Gd ${t.good} · J ${t.just} · M ${t.miss}`:"";function renderPlays(t){const[e,n,a]=playIds[t],s=playsShown(t),d=s.filter(o=>!o.voided),i=new Set(d.map(o=>o.player).filter(Boolean));$(`${e}Summary`).textContent=playAdmin[t].length?`共 ${s.length} 条（有效 ${d.length} 条，填了名称的玩家 ${i.size} 位）`:"暂无记录";const u=o=>`<button type="button" class="pz-rec-void" data-game="${t}" data-id="${o.id}" data-voided="${o.voided?1:0}">${o.voided?"恢复":"作废"}</button>`,c=o=>`<td>${escapeHtml(formatCnSeconds(o.at))}</td>
    <td title="${escapeHtml(geoTitle(o.geo))}">${escapeHtml(geoText(o.geo)||"—")}</td>
    <td class="hy-visit-id">${escapeHtml(o.visitor)}</td>`;$(n).innerHTML=s.map(o=>t==="puzzle"?`<tr class="${o.voided?"is-voided":""}">
    <td>${o.id}</td>
    <td class="pz-rec-player">${escapeHtml(playerText(o.player))}</td>
    <td>${escapeHtml(PZ_ADMIN_DIFFS[o.diff]||o.diff)}</td>
    <td title="${escapeHtml(o.contestTitle?`${o.contestTitle} · 第 ${o.contestRev} 届`:o.img?`相册第 ${o.img} 张`:"")}">${escapeHtml(PZ_PLAY_MODES[o.mode]||o.mode)}</td>
    <td>${escapeHtml(pzFmtMs(o.elapsed))}</td>
    <td>${escapeHtml(pzAidsText(o.aids)||"—")}</td>
    <td class="${o.adj!==o.elapsed?"pz-rec-adj":""}">${escapeHtml(pzFmtMs(o.adj))}</td>
    ${c(o)}
    <td>${u(o)}</td>
  </tr>`:`<tr class="${o.voided?"is-voided":""}">
    <td>${o.id}</td>
    <td class="pz-rec-player">${escapeHtml(playerText(o.player))}</td>
    <td class="pz-rec-player" title="${escapeHtml(o.song)}">${escapeHtml(o.title||o.song)}</td>
    <td>${escapeHtml(STAGE_DIFF_NAMES[o.diff]||o.diff)}${o.mode!=="show"?`<br><small>${escapeHtml(STAGE_MODE_NAMES[o.mode]||o.mode)}</small>`:""}</td>
    <td title="${escapeHtml(stageCountsText(o.counts))}">${escapeHtml(stageScoreText(o))}${o.mode==="show"?`<br><small>${o.acc}% · 最大COMBO ${o.maxCombo}/${o.total}</small>`:""}</td>
    <td>${escapeHtml(o.rank||"—")}</td>
    <td>${escapeHtml(STAGE_JUDGE_NAMES[o.judge]||o.judge)}</td>
    <td>${escapeHtml(STAGE_JUDGE_NAMES[o.range]||o.range)}</td>
    ${c(o)}
    <td>${o.perf?`<button type="button" class="st-perf-btn" data-id="${o.id}" aria-expanded="${playAdmin.perfOpen.has(o.id)}">${playAdmin.perfOpen.has(o.id)?"收起":"查看"}</button>`:"—"}</td>
    <td>${u(o)}</td>
  </tr>${o.perf&&playAdmin.perfOpen.has(o.id)?`<tr class="st-perf-row"><td colspan="${a}"><ul>${stagePerfLines(o.perf).map(p=>`<li>${escapeHtml(p)}</li>`).join("")}${o.ghosts?`<li>点空 ${o.ghosts} 次</li>`:""}</ul></td></tr>`:""}`).join("")||`<tr><td colspan="${a+1}" class="pz-rec-empty">暂无记录</td></tr>`}function exportPlays(t){const e=playsShown(t);if(!e.length)return showToast("没有可导出的记录");const n=c=>[formatCnSeconds(c.at),geoText(c.geo),c.visitor,c.voided?"已作废":"有效"],[a,s,d]=t==="puzzle"?[["编号","玩家ID","难度","块数","模式","大赛","相册图","耗时(秒)","耗时","辅助功能","计入用时(秒)","计入用时","登记时间","IP属地","访客标识","状态"],e.map(c=>[c.id,csvSafe(c.player),PZ_ADMIN_DIFFS[c.diff]||c.diff,c.pieces,PZ_PLAY_MODES[c.mode]||c.mode,c.contestTitle?`${csvSafe(c.contestTitle)}（第 ${c.contestRev} 届）`:"",c.img,(c.elapsed/1e3).toFixed(1),pzFmtMs(c.elapsed),pzAidsText(c.aids)||"未使用",(c.adj/1e3).toFixed(1),pzFmtMs(c.adj),...n(c)]),"拼图通关记录"]:[["编号","玩家ID","曲目","曲目id","难度","模式","得分","评价","准确率%","最大COMBO","音数","弹对(学习/自动)","PERFECT","GREAT","GOOD","JUST","MISS","点空","判定模式","范围模式","登记时间","IP属地","访客标识","状态","性能测试记录"],e.map(c=>{const o=c.counts||{};return[c.id,csvSafe(c.player),csvSafe(c.title),c.song,STAGE_DIFF_NAMES[c.diff]||c.diff,STAGE_MODE_NAMES[c.mode]||c.mode,c.mode==="show"?c.score:"",c.rank,c.mode==="show"?c.acc:"",c.maxCombo,c.total,c.mode==="show"?"":c.hits,o.perfect??"",o.great??"",o.good??"",o.just??"",o.miss??"",c.ghosts,STAGE_JUDGE_NAMES[c.judge]||c.judge,STAGE_JUDGE_NAMES[c.range]||c.range,...n(c),csvSafe(stagePerfLines(c.perf).join(" | "))]}),"舞台演奏记录"],i=[a,...s].map(c=>c.map(o=>`"${String(o??"").replace(/"/g,'""')}"`).join(",")).join(`\r
`),u=epochToCnLocal(Date.now()).replace(/[-:]/g,"").replace("T","-");downloadBlob(new Blob(["\uFEFF"+i],{type:"text/csv;charset=utf-8"}),`${d}_${u}.csv`)}function initPlayAdmin(){["puzzle","stage"].forEach(t=>{const[e,n]=playIds[t];$(`${e}RefreshBtn`).addEventListener("click",()=>refreshPlays(t)),$(`${e}ExportBtn`).addEventListener("click",()=>exportPlays(t)),$(`${e}Search`).addEventListener("input",()=>renderPlays(t)),$(n).addEventListener("click",async a=>{const s=a.target.closest(".st-perf-btn");if(s){const c=Number(s.dataset.id);playAdmin.perfOpen.delete(c)||playAdmin.perfOpen.add(c),renderPlays(t);return}const d=a.target.closest(".pz-rec-void");if(!d)return;d.disabled=!0;const i=await callWorker({action:"play_admin_void",password:internalAdminPassword,game:t,id:Number(d.dataset.id),voided:d.dataset.voided!=="1"});if(!i||!i.ok){d.disabled=!1,showToast(adminErr(i,"操作失败，刷新后再试",PLAY_ADMIN_ERRORS));return}const u=playAdmin[t].findIndex(c=>c.id===i.item.id);u>=0&&(playAdmin[t][u]=i.item),renderPlays(t)})}),$("stPlayMode").addEventListener("change",()=>renderPlays("stage"))}const ADMIN_PANELS_HTML=`
<div class="gate-card admin-card" id="lockdownPanel" hidden>
<h2>分享功能与全站开关</h2>
<section class="ta-group">
<h3 class="ta-group-title">分享功能</h3>
<div class="ticket-admin-row">
<span class="ticket-admin-key">分享功能</span>
<button type="button" class="ticket-switch" id="lockdownToggleBtn" aria-pressed="false" disabled>—</button>
</div>
<p class="ta-group-hint">关闭后网站为纯静态展示：活动群、复制附言、场地登记、活动问卷、点赞都不可用。</p>
<p class="ta-group-hint" id="lockdownStatus">加载中…</p>
<p class="form-msg" id="lockdownMsg" hidden></p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">全站访问</h3>
<div class="ticket-admin-row">
<span class="ticket-admin-key">全站访问</span>
<button type="button" class="ticket-switch" id="maintToggleBtn" aria-pressed="false" disabled>—</button>
</div>
<p class="ta-group-hint">维护时除内部入口（#internal）外，所有页面只显示背景和「网站正在维护中……」。切到维护需在 4 秒内点两次确认。</p>
<p class="ta-group-hint" id="maintStatus">加载中…</p>
<p class="form-msg" id="maintMsg" hidden></p>
</section>
</div>
<div class="gate-card admin-card" id="captchaPanel" hidden>
<h2>人机验证</h2>
<div class="ticket-admin-row">
<span class="ticket-admin-key">人机验证</span>
<button type="button" class="ticket-switch" id="captchaToggleBtn" aria-pressed="false" disabled>—</button>
</div>
<p class="ta-group-hint">关闭后全站不做人机验证，任何人都能直接提交，仅用于压力测试，用完请尽快开回来。</p>
<p class="ta-group-hint" id="captchaStatus">加载中…</p>
<p class="form-msg" id="captchaSwitchMsg" hidden></p>
</div>
<div class="gate-card admin-card" id="starlightPanel" hidden>
<h2>星芒节时间覆盖</h2>
<p class="hint">星芒节期间游戏内全境下雪，设置的时段内天气显示为小雪。</p>
<p class="hint" id="starlightStatus">当前状态：加载中…</p>
<div class="starlight-fields">
<label class="starlight-field">
<span>从（本地时间）</span>
<input type="datetime-local" id="starlightStart">
</label>
<span class="starlight-sep" aria-hidden="true">—</span>
<label class="starlight-field">
<span>到（本地时间）</span>
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
<span class="ticket-admin-key">标题后加「（测试）」</span>
<button type="button" class="ticket-switch" id="ticketTestBtn" aria-pressed="false">—</button>
</div>
<p class="ticket-sched-note ticket-title-preview" id="ticketTitlePreview" hidden></p>
<div class="ticket-admin-row">
<span class="ticket-admin-key">购票</span>
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
<span class="ticket-admin-key">持票人 id 可填「待定」</span>
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
<h3 class="ta-group-title">购票页向访客显示</h3>
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
<span class="ticket-admin-key">定时开放 / 关闭的时间</span>
<button type="button" class="ticket-switch" id="ticketShowSchedBtn" aria-pressed="false">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">票额刷新时间</span>
<button type="button" class="ticket-switch" id="ticketShowResetBtn" aria-pressed="false">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">超额标记</span>
<button type="button" class="ticket-switch" data-ta-flag="showOver" data-on="显示" data-off="隐藏"
data-toast-on="已显示超额标记" data-toast-off="已隐藏超额标记">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">重复标记</span>
<button type="button" class="ticket-switch" data-ta-flag="showDup" data-on="显示" data-off="隐藏"
data-toast-on="已显示重复标记" data-toast-off="已隐藏重复标记">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">购票留言栏</span>
<button type="button" class="ticket-switch" data-ta-flag="messageOn" data-on="开启" data-off="关闭"
data-toast-on="已开启留言栏" data-toast-off="已关闭留言栏">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">网站标题（含地址、时间天气）</span>
<button type="button" class="ticket-switch" data-ta-flag="showBrand" data-on="显示" data-off="隐藏"
data-toast-on="购票页显示网站标题" data-toast-off="购票页不显示网站标题、地址和时间天气">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">与首页隔离</span>
<button type="button" class="ticket-switch" data-ta-flag="isolated" data-on="隔离" data-off="不隔离"
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
<span class="ticket-admin-key">剩余停留时间</span>
<button type="button" class="ticket-switch" data-ta-flag="showIdle" data-on="显示" data-off="隐藏"
data-toast-on="购票页显示剩余时间" data-toast-off="购票页不显示剩余时间">—</button>
</div>
<p class="ticket-sched-note" id="ticketIdleIsoNote" hidden>已与首页隔离，停留时限不生效。</p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">购票须知</h3>
<div class="ticket-admin-row">
<span class="ticket-admin-key">购票须知</span>
<button type="button" class="ticket-switch" data-ta-flag="guideOn" data-on="显示" data-off="隐藏"
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
<div class="ticket-admin-row ticket-sched-row">
<span class="ticket-admin-key">定时开放 / 关闭</span>
<span class="ticket-sched-edit">
<label for="ticketViewerOpenAtInput">开放</label>
<input type="datetime-local" id="ticketViewerOpenAtInput">
<label for="ticketViewerCloseAtInput">关闭</label>
<input type="datetime-local" id="ticketViewerCloseAtInput">
<button type="button" id="ticketViewerSchedSaveBtn">保存</button>
<button type="button" id="ticketViewerSchedClearBtn" class="ticket-btn-ghost">清除</button>
</span>
</div>
<p class="ticket-sched-note" id="ticketViewerSchedNote" hidden></p>
<p class="form-msg" id="ticketViewerMsg" hidden></p>
<div class="ticket-admin-row">
<span class="ticket-admin-key">「售票统计」</span>
<button type="button" class="ticket-switch" data-ta-flag="viewerStats" data-on="显示" data-off="隐藏"
data-toast-on="只读端可查看售票统计" data-toast-off="只读端不可查看售票统计">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">「活动问卷」（只读）</span>
<button type="button" class="ticket-switch" data-ta-flag="viewerSurvey" data-on="显示" data-off="隐藏"
data-toast-on="只读端可查看活动问卷" data-toast-off="只读端不可查看活动问卷">—</button>
</div>
<div class="ticket-admin-row">
<span class="ticket-admin-key">勾选取票（记日志）</span>
<button type="button" class="ticket-switch" data-ta-flag="viewerPickup" data-on="允许" data-off="不允许"
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
<span class="ticket-admin-key">问卷收集</span>
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
<div class="ticket-admin-row">
<span class="ticket-admin-key">首页弹窗</span>
<button type="button" class="ticket-switch" id="popupToggleBtn" aria-pressed="false" disabled>—</button>
</div>
<p class="ta-group-hint">开启后访客打开首页时弹出，每次打开网站最多一次；修改内容并保存后会重新弹出。</p>
<p class="ta-group-hint" id="popupAdminStatus">加载中…</p>
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
<div class="gate-card admin-card pz-admin" id="puzzleAdminPanel" data-close-only-x="1" hidden>
<h2>花街拼图</h2>
<p class="hint" id="pzAdminStatus">加载中…</p>
<section class="ta-group">
<h3 class="ta-group-title">中断继续</h3>
<div class="ticket-admin-row">
<span class="ticket-admin-key">中断后继续</span>
<button type="button" class="ticket-switch" id="pzAdminResumeBtn" aria-pressed="false">—</button>
</div>
<p class="ta-group-hint">开启后，访客关掉拼图、刷新或切走页面，再打开时可以从中断处继续（进度存在访客自己的浏览器里）。关闭时关掉拼图即放弃本局。默认关闭。</p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">大赛拼图</h3>
<div class="ticket-admin-row">
<span class="ticket-admin-key">大赛</span>
<button type="button" class="ticket-switch" id="pzAdminToggleBtn" aria-pressed="false">—</button>
</div>
<p class="ta-group-hint">开启后在设定时段内，拼图首页出现大赛入口。大赛用下面的图片和难度、正计时；通关后访客填写游戏 ID 登记成绩，并自动生成一代通关码。更换图片或难度算新一届，记录分开显示。开启时会一并保存下面的设置。</p>
<p class="ta-group-hint" id="pzAdminContestStatus"></p>
<label class="pz-admin-field"><span>大赛名称</span><input type="text" id="pzAdminTitle" maxlength="30" placeholder="如：中秋花街拼图大赛"></label>
<div class="starlight-fields">
<label class="starlight-field">
<span>开始（本地时间）</span>
<input type="datetime-local" id="pzAdminStart">
</label>
<span class="starlight-sep" aria-hidden="true">—</span>
<label class="starlight-field">
<span>结束（本地时间）</span>
<input type="datetime-local" id="pzAdminEnd">
</label>
</div>
<span class="pz-admin-label">难度</span>
<div class="alarm-seg pz-admin-seg" id="pzAdminDiffSeg">
<label class="is-active"><input type="radio" name="pzAdminDiff" value="easy" checked><span>鱼信 36块</span></label>
<label><input type="radio" name="pzAdminDiff" value="normal"><span>鱼丽 60块</span></label>
<label><input type="radio" name="pzAdminDiff" value="hard"><span>光风院霁月 128块</span></label>
</div>
<span class="pz-admin-label">大赛中可以使用</span>
<div class="pz-admin-tools">
<label class="audience-opt"><input type="checkbox" id="pzAdminToolPreview" checked><span>显示原图</span></label>
<label class="audience-opt"><input type="checkbox" id="pzAdminToolEdges" checked><span>仅显示边框图块</span></label>
<label class="audience-opt"><input type="checkbox" id="pzAdminToolGrid" checked><span>网格提示</span></label>
</div>
<span class="pz-admin-label">暂停 / 切到后台时</span>
<div class="alarm-seg pz-admin-seg" id="pzAdminPauseSeg">
<label class="is-active"><input type="radio" name="pzAdminPause" value="stop" checked><span>停止计时</span></label>
<label><input type="radio" name="pzAdminPause" value="run"><span>继续计时</span></label>
</div>
<p class="ta-group-hint pz-admin-sub">继续计时：从开局起按服务器时间算，暂停、切后台、关掉后再继续都不停表。</p>
<label class="pz-admin-field pz-admin-num"><span>每个浏览器最多参加几次（0 为不限）</span>
<input type="number" id="pzAdminMaxEntries" min="0" max="99" step="1" inputmode="numeric" value="0"></label>
<p class="ta-group-hint pz-admin-sub">每点一次「参加大赛」算一次（继续上次中断的那局不算），次数记在访客自己的浏览器里，换浏览器或清除网站数据后会重新计。按届分开计。</p>
<span class="pz-admin-label">图片</span>
<div class="pz-admin-image">
<img id="pzAdminImagePreview" alt="大赛图片" hidden>
<p class="ta-group-hint" id="pzAdminImageNone">还没有上传图片</p>
<p class="ta-group-hint pz-admin-note" id="pzAdminImageNote"></p>
</div>
<div class="popup-admin-btns">
<input type="file" id="pzAdminFile" accept="image/*" hidden>
<button type="button" id="pzAdminPickBtn">选择图片并裁剪</button>
</div>
<div class="pz-crop-box" id="pzCropBox" hidden>
<div class="alarm-seg pz-admin-seg" id="pzCropRatioSeg">
<label class="is-active"><input type="radio" name="pzCropRatio" value="16:9" checked><span>16:9</span></label>
<label><input type="radio" name="pzCropRatio" value="4:3"><span>4:3</span></label>
<label><input type="radio" name="pzCropRatio" value="3:2"><span>3:2</span></label>
<label><input type="radio" name="pzCropRatio" value="1:1"><span>1:1</span></label>
<label><input type="radio" name="pzCropRatio" value="3:4"><span>3:4</span></label>
</div>
<div class="pz-crop-stage">
<img id="pzCropImg" alt="" draggable="false">
<div class="pz-crop-rect" id="pzCropRect">
<span class="pz-crop-handle" data-h="nw"></span><span class="pz-crop-handle" data-h="ne"></span>
<span class="pz-crop-handle" data-h="sw"></span><span class="pz-crop-handle" data-h="se"></span>
</div>
</div>
<p class="ta-group-hint pz-crop-info" id="pzCropInfo"></p>
<p class="ta-group-hint">拖动选框移动位置，拖四角调整大小；推荐 16:9，和相册图片一致</p>
<div class="popup-admin-btns">
<button type="button" id="pzCropOkBtn">裁剪并上传</button>
<button type="button" id="pzCropCancelBtn">取消</button>
</div>
</div>
<p class="form-msg" id="pzAdminImageMsg" hidden></p>
<div class="popup-admin-btns">
<button type="button" id="pzAdminSaveBtn">保存设置</button>
</div>
<p class="form-msg" id="pzAdminMsg" hidden></p>
</section>
<section class="ta-group">
<h3 class="ta-group-title">参赛记录</h3>
<p class="ta-group-hint">耗时为拼图计时（设为停止计时时，暂停、切后台不计）；鼠标停在耗时上可以看开局到登记的服务器时长，相差很大的可以留意。「辅助」为本局用过的原图、边框块、网格提示。「计入」= 耗时 + 辅助加时（仅显示边框图块 +10%、至少 1 分钟；网格提示 +25%、至少 2 分钟；两项相乘），按耗时排序时按它排名次。IP 属地与访客标识不含 IP 本身。</p>
<div class="pz-rec-tools">
<select id="pzRecRound" aria-label="届"><option value="cur">本届</option></select>
<select id="pzRecSort" aria-label="排序"><option value="time">按耗时</option><option value="at">按登记时间</option></select>
<label class="audience-opt"><input type="checkbox" id="pzRecBest"><span>每人最好成绩</span></label>
<button type="button" id="pzRecRefreshBtn">刷新</button>
<button type="button" id="pzRecExportBtn">导出 CSV</button>
</div>
<p class="ta-group-hint" id="pzRecSummary"></p>
<div class="ticket-table-wrap">
<table class="ticket-table pz-rec-table">
<thead><tr><th>名次</th><th>登记号</th><th>玩家 ID</th><th>难度</th><th>耗时</th><th>辅助</th><th>计入</th><th>登记时间</th><th>属地</th><th>访客</th><th></th></tr></thead>
<tbody id="pzRecBody"></tbody>
</table>
</div>
</section>
<section class="ta-group">
<h3 class="ta-group-title">通关记录</h3>
<p class="ta-group-hint">访客每次通关（休闲、限时、大赛都算）网页自动发来的成绩，玩家名称为拼图首页选填的「玩家名称」。数据由访客的浏览器算出，仅供参考；大赛排名以上面的参赛记录为准。</p>
<div class="pz-rec-tools">
<input type="search" class="play-search" id="pzPlaySearch" placeholder="搜索玩家名称" aria-label="搜索玩家名称">
<button type="button" id="pzPlayRefreshBtn">刷新</button>
<button type="button" id="pzPlayExportBtn">导出 CSV</button>
</div>
<p class="ta-group-hint" id="pzPlaySummary"></p>
<div class="ticket-table-wrap">
<table class="ticket-table pz-rec-table">
<thead><tr><th>编号</th><th>玩家 ID</th><th>难度</th><th>模式</th><th>耗时</th><th>辅助</th><th>计入</th><th>登记时间</th><th>属地</th><th>访客</th><th></th></tr></thead>
<tbody id="pzPlayBody"></tbody>
</table>
</div>
</section>
</div>
<div class="gate-card admin-card pz-admin" id="stageAdminPanel" data-close-only-x="1" hidden>
<h2>舞台演奏</h2>
<section class="ta-group">
<h3 class="ta-group-title">演奏记录</h3>
<p class="ta-group-hint">访客在吟游诗人模拟器「舞台演奏」里演完一首（中途结束不算）时网页自动发来的成绩，玩家名称为大厅里选填的「玩家名称」（与花街拼图共用）。学习模式、自动演奏不计分，得分一栏为弹对几个。鼠标停在得分上可以看各档判定数；「性能」里是这一局的性能测试记录摘要。数据由访客的浏览器算出，仅供参考。</p>
<div class="pz-rec-tools">
<input type="search" class="play-search" id="stPlaySearch" placeholder="搜索玩家名称或曲目" aria-label="搜索玩家名称或曲目">
<select id="stPlayMode" aria-label="模式"><option value="">全部模式</option><option value="show">演出</option><option value="learn">学习</option><option value="auto">自动演奏</option></select>
<button type="button" id="stPlayRefreshBtn">刷新</button>
<button type="button" id="stPlayExportBtn">导出 CSV</button>
</div>
<p class="ta-group-hint" id="stPlaySummary"></p>
<div class="ticket-table-wrap">
<table class="ticket-table pz-rec-table st-play-table">
<thead><tr><th>编号</th><th>玩家 ID</th><th>曲目</th><th>难度</th><th>得分</th><th>评价</th><th>判定模式</th><th>范围模式</th><th>登记时间</th><th>属地</th><th>访客</th><th>性能</th><th></th></tr></thead>
<tbody id="stPlayBody"></tbody>
</table>
</div>
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
`;function mountAdminPanels(){$("adminPanelStash").innerHTML=ADMIN_PANELS_HTML}mountAdminPanels(),[initInternal,initAdminPanels,initAdminNewWatch,initLockdownToggle,initMaintToggle,initCaptchaSwitch,initStarlightPanel,initTicketAdmin,initViewerPills,initFeedbackAdmin,typeof window.buildVenueForm=="function"?initVenueAdmin:()=>console.error("[场地预约] venue.js 没有加载成功，管理页的「场地预约」不可用"),typeof window.mountSurvey=="function"?initSurveyAdmin:()=>console.error("[活动问卷] survey.js 没有加载成功，管理页的「活动问卷」不可用"),initPostAnnouncement,initPopupAdmin,initHuayuAdmin,initPuzzleAdmin,initPlayAdmin].forEach(t=>{try{t()}catch(e){console.error(e)}}),HJ.adminReady=!0;
