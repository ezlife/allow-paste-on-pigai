// ==UserScript==
// @name         批改网解除禁止粘贴 (PigAI Paste Enabler)
// @namespace    https://pigai.org/
// @version      1.0
// @description  解除批改网(pigai.org)写作页禁止粘贴：拦截 spss.js init_no_paste() 的 document.onpaste、.no_paste 的 contextmenu/selectstart、#contents 的 dragenter 禁用，恢复 粘贴/复制/右键/选中/拖拽。
// @author       github.com/ezlife
// @match        *://*.pigai.org/*
// @match        *://pigai.org/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

/*
 * 逆向依据（批改网前端实测）：
 * 文件: https://www.pigai.org/res/javascript/spss.js  →  function init_no_paste()
 *   1) $('.no_paste') / $('.no_paste *')  jQuery .bind("contextmenu"/"selectstart", ()=>false)   → 禁右键/禁选中
 *   2) 老师勾选"禁止粘贴"时页面输出 var _no_paste="1"，随后：
 *        document.onpaste = function(e){ alert("您的老师启用了"禁止粘贴"选项"); e.preventDefault(); }
 *        $('#contents').bind("contextmenu", ()=>false)
 *        $('#contents').bind("dragenter", ()=>{ textarea 置 disabled + 弹"请勿拖拽" })
 *   （Ctrl+V 的 keydown 拦截代码在源码中是被注释掉的，未启用）
 *
 * 解锁策略：
 *   A. document-start 用 defineProperty 吞掉 spss.js 对 document.onpaste 的 DOM0 赋值
 *   B. window 捕获阶段 stopPropagation()，阻断 jQuery bind 挂在元素上的 contextmenu/selectstart/dragenter/paste 处理器
 *      （stopPropagation 不影响默认行为 → 右键菜单/选中/拖放/粘贴照常发生）
 *   C. 兜底定时器：#contents 若被 dragenter 流程置 disabled/readonly 则自动恢复
 *   D. 兜底 CSS：强制 user-select:text
 *   E. 终极兜底：Alt+V 直接读剪贴板插入光标处（Chrome 需允许一次剪贴板读取权限）
 */

(function () {
  'use strict';

  /* ---------- A+B：注入页面真实上下文（穿透油猴沙箱，双保险） ---------- */
  const pageCode = '(' + function () {
    // A. 吞掉 DOM0 属性赋值：spss.js 里 document.onpaste = fn 会被 setter 静默丢弃
    const DOM0 = ['onpaste', 'oncopy', 'oncut', 'oncontextmenu', 'onselectstart', 'ondragenter', 'ondragstart', 'ondrop'];
    const lockProps = (obj) => {
      DOM0.forEach(p => {
        try {
          Object.defineProperty(obj, p, {
            configurable: true,
            get() { return null; },
            set() { /* swallow spss.js assignments */ }
          });
        } catch (e) {}
      });
    };
    lockProps(document); // document 在 document-start 已存在

    // B. 捕获阶段拦截：事件到不了元素上 jQuery bind 的 handler，默认行为保留
    const EV = ['paste', 'copy', 'cut', 'contextmenu', 'selectstart', 'dragenter', 'dragover', 'drop'];
    EV.forEach(t => window.addEventListener(t, e => {
      try { e.stopPropagation(); } catch (err) {}
    }, true));

    // body 出现后同样锁 DOM0 属性，并做一次强制清理（对抗 <body onpaste> / 先于脚本的赋值）
    const clear = () => {
      DOM0.forEach(p => { try { document.body[p] = null; } catch (e) {} });
      if (document.body) lockProps(document.body);
    };
    document.addEventListener('DOMContentLoaded', clear, true);
    window.addEventListener('load', clear, true);

    // C. textarea 被 dragenter 流程 disable 后自动恢复（兼容写作页 #contents / 其它输入框）
    setInterval(() => {
      document.querySelectorAll('#contents, textarea, [contenteditable="true"]').forEach(el => {
        if (el.disabled) el.disabled = false;
        if (el.readOnly && el.id !== 'pigai_txt') el.readOnly = false;
      });
    }, 800);

    // D. 强制可选中（对抗可能存在的 CSS user-select）
    try {
      const st = document.createElement('style');
      st.textContent = [
        '.no_paste, .no_paste *, #contents, textarea, [contenteditable="true"] {',
        '  -webkit-user-select: text !important;',
        '  user-select: text !important;',
        '}'
      ].join('\n');
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  } + ')();';

  try {
    const s = document.createElement('script');
    s.textContent = pageCode;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  } catch (e) {}

  /* ---------- E：Alt+V 手动兜底粘贴（读剪贴板插入光标处） ---------- */
  const insertAtCursor = (text) => {
    const active = document.activeElement;
    if (!text) return;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      const st = active.selectionStart, en = active.selectionEnd;
      active.value = active.value.slice(0, st) + text + active.value.slice(en);
      const pos = st + text.length;
      active.setSelectionRange(pos, pos);
      active.dispatchEvent(new Event('input', { bubbles: true }));
      active.dispatchEvent(new Event('keyup', { bubbles: true })); // 触发字数统计
    } else if (active && active.isContentEditable) {
      document.execCommand('insertText', false, text);
    } else {
      const c = document.querySelector('#contents');
      if (c) { c.value += text; c.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault(); e.stopPropagation();
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(insertAtCursor).catch(() => {
          alert('读取剪贴板被拒绝：请点击地址栏剪贴板权限允许，或直接用 Ctrl+V');
        });
      }
    }
  }, true);

  /* ---------- 状态角标：确认脚本已生效（可点击隐藏） ---------- */
  window.addEventListener('load', () => {
    try {
      const badge = document.createElement('div');
      badge.textContent = '✅ 批改网粘贴已解锁（Alt+V 兜底）';
      Object.assign(badge.style, {
        position: 'fixed', right: '8px', bottom: '8px', zIndex: 99999,
        background: 'rgba(60,179,113,.92)', color: '#fff',
        padding: '4px 10px', borderRadius: '4px',
        font: '12px/1.6 sans-serif', cursor: 'pointer'
      });
      badge.onclick = () => badge.remove();
      document.body.appendChild(badge);
      setTimeout(() => badge.remove(), 15000);
    } catch (e) {}
  });
})();
