import { useEffect, useRef, useState } from "react";
import {
  extractInstagramUrls,
  parseInstagramUrl,
} from "../features/import/parseInstagramUrl";
import "./embedLab.css";

const strategies = [
  { id: "standard", label: "原始 embed · 第一张基准", suffix: "embed/" },
  { id: "index", label: "img_index=2", suffix: "embed/?img_index=2" },
  {
    id: "caption",
    label: "captioned + img_index=2",
    suffix: "embed/captioned/?img_index=2",
  },
  { id: "page", label: "page=2（猜测参数）", suffix: "embed/?page=2" },
  { id: "next", label: "next=1（猜测参数）", suffix: "embed/?next=1" },
  {
    id: "autoplay",
    label: "autoplay=1 + interval=2000（猜测参数）",
    suffix: "embed/?autoplay=1&interval=2000",
  },
  {
    id: "normal",
    label: "普通帖子页 + img_index=2（可能禁止嵌入）",
    suffix: "?img_index=2",
  },
];

export function EmbedLab() {
  const [input, setInput] = useState("");
  const [post, setPost] = useState("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [mode, setMode] = useState("standard");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("正在读取项目 saved_posts.json…");
  const [log, setLog] = useState<string[]>([]);
  const [auto, setAuto] = useState(false);
  const [autoIndex, setAutoIndex] = useState(1);
  const [messageAuto, setMessageAuto] = useState(false);
  const [messages, setMessages] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const addLog = (message: string) =>
    setLog((items) =>
      [`${new Date().toLocaleTimeString()} · ${message}`, ...items].slice(
        0,
        24,
      ),
    );
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/saved_posts.json", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json: unknown = await response.json();
        const urls = Array.from(
          new Set(
            extractInstagramUrls(JSON.stringify(json))
              .map((url) => parseInstagramUrl(url).canonicalUrl)
              .filter((url): url is string => Boolean(url)),
          ),
        );
        if (!urls.length) throw new Error("文件没有 /p/ 帖子链接");
        if (abort.signal.aborted) return;
        setCandidates(urls);
        setInput(urls[0]);
        setPost(urls[0]);
        setStatus(
          "已自动载入 JSON 的第一条 /p/ 帖子；JSON 本身不含多图数量，需观察箭头确认。",
        );
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setStatus(
            `读取失败：${error instanceof Error ? error.message : String(error)}。仍可粘贴帖子链接。`,
          );
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "https://www.instagram.com"
      )
        return;
      setMessages((n) => n + 1);
      addLog(
        `收到 Instagram 消息（不代表支持 next）：${String(typeof event.data === "string" ? event.data : JSON.stringify(event.data)).slice(0, 350)}`,
      );
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(
      () => setAutoIndex((i) => (i === 1 ? 2 : 1)),
      2000,
    );
    return () => window.clearInterval(timer);
  }, [auto]);
  function sendNext() {
    frame.current?.contentWindow?.postMessage(
      { method: "next" },
      "https://www.instagram.com",
    );
    addLog('已发送 {method:"next"}，此为猜测消息。只有画面切换才算成功。');
  }
  useEffect(() => {
    if (!messageAuto) return;
    const timer = window.setInterval(sendNext, 2000);
    return () => window.clearInterval(timer);
  }, [messageAuto]);
  function probe(kind: "dom" | "keyboard") {
    if (!frame.current) return;
    try {
      if (kind === "keyboard") {
        frame.current.contentWindow?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        );
        addLog("已尝试合成 ArrowRight；不等于真实键盘输入，请观察。");
      } else {
        const doc = frame.current.contentWindow?.document;
        addLog(
          doc?.URL === "about:blank"
            ? "仍为空白文档，不能判定 Instagram 可访问。"
            : `可以读取文档：${doc?.URL ?? "无文档"}`,
        );
      }
    } catch (error) {
      addLog(
        `${kind === "dom" ? "读取内部 DOM" : "向内部派发 ArrowRight"}：${error instanceof Error ? error.name : "失败"}，跨域操作被阻止。`,
      );
    }
  }
  function choosePost(url: string) {
    setInput(url);
    setPost(url);
    setAuto(false);
    setMessageAuto(false);
    setMode("standard");
    setMessages(0);
    setLog([]);
  }
  const strategy = strategies.find((s) => s.id === mode)!;
  const src = post
    ? `${post}${auto ? `embed/?img_index=${autoIndex}` : strategy.suffix}`
    : undefined;
  return (
    <main className="embed-lab">
      <header>
        <span>INS VIEWER / LOCAL LAB</span>
        <h1>同一条真实帖子，逐项测试第二张</h1>
        <p>
          自动读取项目 saved_posts.json，只载入一条帖子。先手动点 Next
          确认它确实是多图，再测试参数。所有“成功”都以实际画面变化为准。
        </p>
      </header>
      <section>
        <h2>01 / 已预载项目中的帖子</h2>
        <p>
          来源：saved_posts.json · 找到 {candidates.length} 条 /p/ 链接 · 不修改
          JSON 或图库。
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseInstagramUrl(input);
            if (parsed.canonicalUrl) choosePost(parsed.canonicalUrl);
            else setStatus("请输入有效的 Instagram /p/ 帖子链接");
          }}
        >
          <label htmlFor="post-url">当前帖子</label>
          <div className="lab-row">
            <input
              id="post-url"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button>载入帖子</button>
          </div>
        </form>
        <details>
          <summary>当前帖子不可用？换 JSON 中另一条</summary>
          <select
            aria-label="JSON 备用帖子"
            value={post}
            onChange={(e) => choosePost(e.target.value)}
          >
            {candidates.map((url) => (
              <option key={url}>{url}</option>
            ))}
          </select>
        </details>
        <p role="status">{status}</p>
      </section>
      <section>
        <h2>02 / 切换实验策略</h2>
        <label htmlFor="embed-mode">展示方式</label>
        <select
          id="embed-mode"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setAuto(false);
            setMessageAuto(false);
          }}
        >
          {strategies.map((s) => (
            <option value={s.id} key={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <p>
          完整展示，不裁切。请记录：第一张 →
          手动第二张的外观，再重新载入参数版本比较。参数名称相似不代表 Instagram
          实现了它。
        </p>
        <p className="lab-url">{src}</p>
        <div className="lab-row">
          <button disabled={!post} onClick={() => setRevision((r) => r + 1)}>
            重新载入 / 重置位置
          </button>
          <button
            disabled={!post}
            onClick={() => {
              setAuto((a) => !a);
              setAutoIndex(1);
              setMessageAuto(false);
            }}
          >
            {auto ? "停止参数轮播" : "每 2 秒切换 img_index=1 / 2"}
          </button>
        </div>
        <div className="lab-frame">
          {src && (
            <iframe
              key={`${src}:${revision}`}
              ref={frame}
              src={src}
              title="Instagram 实验帖子"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; picture-in-picture"
              onLoad={() =>
                setStatus(
                  "iframe 触发 load；这不证明图片成功加载，请检查实际画面。参数切换会重载整个 iframe。",
                )
              }
            />
          )}
        </div>
        {post && (
          <a href={`${post}?img_index=2`} target="_blank" rel="noreferrer">
            在 Instagram 独立打开 ?img_index=2（对照普通页面与 embed）↗
          </a>
        )}
      </section>
      <section>
        <h2>03 / 在不重载 iframe 的情况下尝试控制</h2>
        <div className="lab-row">
          <button disabled={!post} onClick={() => probe("dom")}>
            读取内部 DOM
          </button>
          <button disabled={!post} onClick={() => probe("keyboard")}>
            派发 ArrowRight
          </button>
          <button disabled={!post} onClick={sendNext}>
            postMessage method: next
          </button>
          <button
            disabled={!post}
            onClick={() => {
              frame.current?.contentWindow?.postMessage(
                "next",
                "https://www.instagram.com",
              );
              addLog('已发送字符串 "next"（猜测协议），请观察画面。');
            }}
          >
            postMessage 字符串 next
          </button>
          <button
            disabled={!post}
            onClick={() => {
              setMessageAuto((a) => !a);
              setAuto(false);
            }}
          >
            {messageAuto ? "停止 next 消息" : "每 2 秒发送 next 消息"}
          </button>
        </div>
        <p>
          已收到 {messages} 条来自此 iframe 的 Instagram
          消息。收到尺寸或加载消息也不等于支持翻页。浏览器自动化或你真实点击内部箭头，与网页脚本自动点击拥有不同权限。
        </p>
        <div className="lab-log" role="log">
          {log.length
            ? log.map((line, i) => <p key={i}>{line}</p>)
            : "操作后这里显示实验日志。"}
        </div>
      </section>
      <section>
        <h2>04 / 本次真实帖子测试结果（2026-10-23）</h2>
        <p>
          JSON 第一条 /p/
          帖子：DafZycbCAR_。结论只覆盖此帖与本次浏览器环境，不能保证所有帖子的行为相同。
        </p>
        <div className="lab-table-wrap">
          <table>
            <thead>
              <tr>
                <th>策略</th>
                <th>实际结果</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>框内手动 Next</td>
                <td>成功，第二张在同一 iframe 内显示。</td>
              </tr>
              <tr>
                <td>embed + img_index=2</td>
                <td>仍为第一张。</td>
              </tr>
              <tr>
                <td>captioned + img_index=2</td>
                <td>仍为第一张。</td>
              </tr>
              <tr>
                <td>embed + page=2</td>
                <td>仍为第一张。</td>
              </tr>
              <tr>
                <td>embed + next=1</td>
                <td>
                  未稳定成功。一次读到后面图片；重新载入复测仍为第一张，不能归因于参数。
                </td>
              </tr>
              <tr>
                <td>autoplay=1 + interval=2000</td>
                <td>前后两次观察均停在第一张。</td>
              </tr>
              <tr>
                <td>两秒切换 img_index=1 / 2</td>
                <td>
                  定时器会重载
                  iframe；没有验证到第二张定位成功，不能作为可用轮播。
                </td>
              </tr>
              <tr>
                <td>读取 DOM / 合成 ArrowRight</td>
                <td>均为 SecurityError。</td>
              </tr>
              <tr>
                <td>postMessage 对象 / 字符串 next / 定时发送</td>
                <td>画面未前进；收到的消息是加载、尺寸、挂载消息。</td>
              </tr>
              <tr>
                <td>普通帖子页放入 iframe</td>
                <td>Instagram refused to connect。</td>
              </tr>
              <tr>
                <td>独立打开普通帖子页 ?img_index=2</td>
                <td>
                  成功显示第二张；不带参数显示第一张。不是展厅内自动轮播。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <h2>如何判读结果</h2>
        <ul>
          <li>
            跨域限制只解释 DOM 点击为何被挡住，不能用它推断 URL 参数是否有效。
          </li>
          <li>
            img_index / page / next
            参数即使不报错，也可能被忽略。必须与手动第二张对照。
          </li>
          <li>参数轮播会重载整个页面；即使可定位，也不等于能平滑自动播放。</li>
          <li>
            手动 Next 若打开 Instagram，而不是在框内翻图，应记录为“跳转”，不能算
            iframe 轮播成功。
          </li>
          <li>
            第三方代理（例如 OGInstagram）的 img_index
            参数属于该服务，不等于原生 Instagram iframe
            参数。本页不向第三方代理发送你的帖子。
          </li>
        </ul>
        <p>
          参考：
          <a href="https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy">
            同源策略
          </a>{" "}
          ·{" "}
          <a href="https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage">
            postMessage
          </a>{" "}
          ·{" "}
          <a href="https://github.com/seirenkr/OGInstagram">
            第三方代理参数说明
          </a>
        </p>
      </section>
    </main>
  );
}
