# 批改网解除禁止粘贴 — PigAI Paste Enabler

解除批改网（pigai.org）写作页的「禁止粘贴」限制，同时恢复右键菜单、文字选中、拖拽输入。油猴（Tampermonkey）脚本，安装即用。

## 文件

| 文件 | 说明 |
|---|---|
| `pigai-paste-enabler.user.js` | 油猴脚本本体 |
| `README.md` | 本文档 |

## 功能

- ✅ 解除 `document.onpaste` 粘贴拦截（Ctrl+V 直接粘贴）
- ✅ 解除 `.no_paste` 元素禁右键（`contextmenu`）
- ✅ 解除禁选中（`selectstart`），恢复选择复制文字
- ✅ 解除 `#contents` 作文输入框 dragenter 禁用，恢复拖拽输入
- ✅ 自动恢复被拖拽流程置 `disabled` 的 textarea
- ✅ 强制 `user-select: text`，对抗 CSS 层禁选中
- ✅ `Alt+V` 终极兜底：直接读剪贴板插入光标处
- ✅ 右下角绿色角标显示生效状态（15 秒后自动消失，可点击关闭）

## 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox / Safari 均可；Violentmonkey、Greasemonkey 也兼容）
2. 点击浏览器工具栏 Tampermonkey 图标 → 「添加新脚本」
3. 删除编辑器里的默认内容，把 `pigai-paste-enabler.user.js` 全文粘贴进去
4. `Ctrl+S` 保存
5. 刷新批改网写作页（`/?c=v2&a=write&rid=xxx`），右下角出现「✅ 批改网粘贴已解锁」即生效

> 也可以把 `.user.js` 文件直接拖入浏览器由 Tampermonkey 安装。

## 使用

| 操作 | 效果 |
|---|---|
| `Ctrl+V` / `⌘V` | 正常粘贴（主要功能） |
| 拖拽文本到输入框 | 正常拖入 |
| 右键 | 恢复浏览器菜单 |
| 鼠标选择文字 | 恢复选中 |
| `Alt+V` | 剪贴板读取兜底粘贴（Chrome 首次会请求一次剪贴板读取权限，允许即可） |

## 逆向分析

### 拦截源码位置

批改网的禁止粘贴**不在页面 HTML 里**，而在公共脚本：

```
https://www.pigai.org/res/javascript/spss.js
```

写作页（`/?c=v2&a=write&rid=xxx`）在 jQuery ready 回调中调用：

```js
$(function(){
    init_editor();
    init_no_paste();   // ← 禁止粘贴入口
    inti_wc();
    initCopy_write();
});
```

### 拦截点（`init_no_paste()` 原始逻辑）

```js
function init_no_paste(){
    // ① 无条件执行（无论老师是否勾选禁止粘贴）
    $('.no_paste').bind("contextmenu",  function() { return false; });  // 禁右键
    $('.no_paste').bind("selectstart",  function() { return false; });  // 禁选中
    $('.no_paste *').bind("selectstart",function() { return false; });

    // ② 仅当页面变量 _no_paste == "1"（老师布置作业时勾选「禁止粘贴」）才执行
    if( _no_paste != "1") return;
    var cobj = $('#contents');                                          // 作文 textarea
    cobj.bind("contextmenu", function() { return false; });

    // ★ 粘贴拦截主点：DOM0 属性赋值
    document.onpaste = function (e){
        alert("您的老师启用了“禁止粘贴”选项");
        e.preventDefault();
    };

    // ③ 拖拽封锁：拖入即禁用输入框 + 弹窗
    cobj.bind('dragenter', function (e) {
        $(this).attr('disabled', true);
        F.show("请勿拖拽", "老师启用了“禁止粘贴”选项 请勿拖拽", ...);
        return false;
    });
}
```

> 注意：源码中还存在一段 keydown 拦截 Ctrl+V 的代码，但**被注释掉未启用**——所以整站粘贴封锁实际上只靠 `document.onpaste` 这一个 DOM0 挂载点。

### 破解策略（五层防御对应实现）

| 层 | 策略 | 对应拦截点 |
|---|---|---|
| A | `@run-at document-start` 先行运行，`Object.defineProperty(document, 'onpaste', { get: () => null, set: () => {} })` 把 spss.js 后续的 DOM0 赋值**静默吞掉** | ② `document.onpaste = fn` |
| B | `window` **捕获阶段** `stopPropagation()`（事件：`paste/copy/cut/contextmenu/selectstart/dragenter/dragover/drop`）。捕获在 window 上注册得最早，事件到不了元素上 jQuery bind 的 handler，其 `return false`（preventDefault）不会执行，而浏览器**默认行为不受 stopPropagation 影响** → 右键菜单、选中、拖放、粘贴全部照常 | ① ③ 所有 jQuery bind |
| C | 800ms 兜底定时器：`#contents / textarea / contenteditable` 被 `disabled / readOnly` 时自动恢复 | ③ dragenter 置 disabled |
| D | 注入 `user-select: text !important` CSS | CSS 层禁选中（防御性） |
| E | `Alt+V` 读剪贴板插入光标处 + 派发 `input/keyup` 事件触发字数统计 | 全部失效时的终极兜底 |

### 兼容性处理

- 脚本核心代码通过 `<script>` 标签**注入页面真实上下文**执行，穿透 Tampermonkey 沙箱（MV3 / Xray 环境下 `document` 是代理对象，直接 defineProperty 可能失效）
- `@grant none` + 注入双保险，Tampermonkey / Violentmonkey / Greasemonkey 通用
- `@match *://*.pigai.org/*` 覆盖主站与子域，含同源 iframe 场景
- 不修改任何站点请求、不与服务器交互，纯前端行为解锁

## 注意事项

1. **前端解锁 ≠ 无痕**：服务端仍会记录写作用时（页面 `clock` 计时器）。粘贴后秒提交，教师端可能看到「用时极短」的异常。建议粘贴后正常停留一段时间再交。
2. 批改网自身有**相似度/雷同检测**（语料库比对），与粘贴限制无关，粘贴内容本身的质量风险自担。
3. `_no_paste` 由服务端按老师布置作业的选项输出到页面变量，脚本对其无条件解除（未开启时解除也无副作用）。
4. 脚本只对 `pigai.org` 域名生效，不影响其他网站。
5. 教育场景请自行判断使用边界；本脚本仅用于技术研究与个人效率场景。

## 技术栈 / 验证

- 逆向方式：Wayback Machine 存档对比（2014 / 2024 / 2026 三代页面）+ 现网 `spss.js` 静态分析
- 脚本语法校验：`node --check` 通过
- 验证环境：Chrome + Tampermonkey

## License

MIT
