import { useEffect, useRef, useState } from "react";
import { getAllPosts } from "../db/postRepository";
import { parseInstagramUrl } from "../features/import/parseInstagramUrl";
import "./embedLab.css";

export function EmbedLab() {
  const [input, setInput] = useState("");
  const [post, setPost] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [mode, setMode] = useState("standard");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("等待载入帖子");
  const [log, setLog] = useState<string[]>([]);
  const [auto, setAuto] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const addLog = (message: string) =>
    setLog((items) =>
      [`${new Date().toLocaleTimeString()} · ${message}`, ...items].slice(
        0,
        12,
      ),
    );
  useEffect(() => {
    void getAllPosts()
      .then((posts) => setSaved(posts.map((p) => p.canonicalUrl)))
      .catch(() => setStatus("本地图库读取失败；仍可粘贴链接"));
  }, []);
  useEffect(() => {
    if (!playing || photos.length === 1) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % (photos.length || 3)),
      2000,
    );
    return () => window.clearInterval(timer);
  }, [playing, photos.length]);
  useEffect(() => () => photos.forEach(URL.revokeObjectURL), [photos]);
  useEffect(() => {
    if (!post) return;
    setStatus("等待 Instagram 响应；加载事件不代表帖子可用");
    const timer = window.setTimeout(
      () =>
        setStatus(
          "已等待 15 秒；若仍空白，请检查网络、帖子权限或 Instagram 登录要求",
        ),
      15000,
    );
    return () => window.clearTimeout(timer);
  }, [post, mode, revision]);
  function probe() {
    if (!frame.current) return;
    try {
      const document = frame.current.contentWindow?.document;
      if (!document) {
        addLog("无法读取 iframe 文档");
        return;
      }
      addLog("可以读取文档：可能仍是初始空白页，不能据此认定 Instagram 可控。");
    } catch (error) {
      addLog(
        `${error instanceof Error ? error.name : "访问失败"}：父页面无法访问 Instagram 内部 DOM，因此不能查找或点击 Next。`,
      );
    }
  }
  useEffect(() => {
    if (!auto || !post) return;
    const timer = window.setInterval(probe, 2000);
    return () => window.clearInterval(timer);
  }, [auto, post]);
  const src = post
    ? `${post}embed/${mode === "caption" ? "captioned/" : ""}${mode === "index" ? "?img_index=2" : ""}`
    : undefined;
  return (
    <main className="embed-lab">
      <header>
        <span>INS VIEWER / LOCAL LAB</span>
        <h1>一条帖子，不止第一张？</h1>
        <p>
          把 Instagram
          的真实表现与我们自己能控制的部分放在一起测试。此页仅开发环境可用，不写入图库。
        </p>
      </header>
      <section>
        <h2>01 / 选择真实的多图帖子</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseInstagramUrl(input);
            if (!parsed.isValid) {
              setStatus("请输入有效的 Instagram /p/ 帖子链接");
              return;
            }
            setPost(parsed.canonicalUrl!);
            setRevision((r) => r + 1);
            setAuto(false);
          }}
        >
          <label htmlFor="post-url">Instagram 帖子链接</label>
          <div className="lab-row">
            <input
              id="post-url"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://www.instagram.com/p/…/"
            />
            <button>载入帖子</button>
          </div>
        </form>
        <label htmlFor="saved-post">
          或从这个浏览器的本地图库选择（不保证是多图）
        </label>
        <select
          id="saved-post"
          value=""
          onChange={(e) => setInput(e.target.value)}
        >
          <option value="">
            {saved.length
              ? `共 ${saved.length} 条，请选择后点击载入`
              : "暂无本地帖子，请粘贴一个已知的多图链接"}
          </option>
          {saved.map((url) => (
            <option key={url}>{url}</option>
          ))}
        </select>
      </section>
      <div className="lab-grid">
        <section>
          <h2>02 / Instagram 原生 iframe</h2>
          <label htmlFor="embed-mode">展示方式</label>
          <select
            id="embed-mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setAuto(false);
            }}
          >
            <option value="standard">
              A · 完整 embed（手动找 Next，不裁切）
            </option>
            <option value="caption">B · captioned 路径（对照展示）</option>
            <option value="index">C · img_index=2（未获保证的参数实验）</option>
            <option value="crop">D · 图片区域裁切（观察按钮是否被遮挡）</option>
          </select>
          <p>
            {mode === "index"
              ? "观察首屏是否真是第 2 张。参数可能被忽略；不是已确认的导航 API。"
              : mode === "crop"
                ? "裁切只改变外层可视区域，不会得到独立图片，也不会添加翻页能力。"
                : "在 Instagram 提供箭头或圆点时，直接在框内点击。能否翻页由该帖子的嵌入实现决定。"}
          </p>
          <div className={mode === "crop" ? "lab-frame lab-crop" : "lab-frame"}>
            {src ? (
              <iframe
                key={`${src}:${revision}`}
                ref={frame}
                src={src}
                title="Instagram 实验帖子"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="autoplay; encrypted-media; picture-in-picture"
                onLoad={() =>
                  setStatus(
                    "iframe 已触发 load；请目视确认内容、箭头和登录提示",
                  )
                }
              />
            ) : (
              <p>载入帖子后，这里显示真实 Instagram 内容。</p>
            )}
          </div>
          <p role="status">{status}</p>
          {post && (
            <a href={`${post}?img_index=2`} target="_blank" rel="noreferrer">
              在 Instagram 打开第 2 张参数链接 ↗
            </a>
          )}
          <div className="lab-row">
            <button disabled={!post} onClick={() => setRevision((r) => r + 1)}>
              重新载入
            </button>
            <button disabled={!post} onClick={probe}>
              测试读取内部按钮
            </button>
            <button disabled={!post} onClick={() => setAuto((a) => !a)}>
              {auto ? "停止每 2 秒访问测试" : "每 2 秒尝试访问 Next"}
            </button>
          </div>
          <p>
            定时测试只尝试访问内部文档，并记录结果；不会假装成功切图。allow="autoplay"
            是播放权限，不是轮播指令。
          </p>
          <div className="lab-log" role="log">
            {log.length
              ? log.map((line, i) => <p key={i}>{line}</p>)
              : "实验记录会显示在这里。"}
          </div>
        </section>
        <section>
          <h2>03 / 自己持有图片时：真正的 2 秒轮播</h2>
          <p>
            这是独立媒体演示，不是从上面的帖子提取图片。默认使用项目示例，也可选择你自己的多张照片；文件只在本页内存使用。
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            aria-label="选择本地照片"
            onChange={(e) => {
              setPlaying(false);
              setIndex(0);
              setPhotos(
                Array.from(e.target.files ?? [])
                  .filter((f) => f.type.startsWith("image/"))
                  .map((f) => URL.createObjectURL(f)),
              );
            }}
          />
          <img
            className="lab-photo"
            src={
              photos.length
                ? photos[index]
                : `${import.meta.env.BASE_URL}demo/${["quiet-lake.webp", "mountain-light.webp", "city-night.webp"][index % 3]}`
            }
            alt={`独立媒体演示，第 ${index + 1} 张`}
          />
          <p>
            第 {index + 1} / {photos.length || 3} 张 ·{" "}
            {photos.length ? "你的本地文件" : "项目示例图片"}
          </p>
          <div className="lab-row">
            <button
              onClick={() =>
                setIndex(
                  (i) => (i + (photos.length || 3) - 1) % (photos.length || 3),
                )
              }
            >
              上一张
            </button>
            <button
              onClick={() => setIndex((i) => (i + 1) % (photos.length || 3))}
            >
              下一张
            </button>
            <button
              disabled={photos.length === 1}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "暂停自动轮播" : "每 2 秒自动轮播"}
            </button>
          </div>
          <h2>能力边界</h2>
          <ul>
            <li>
              可控制：iframe
              地址、尺寸、外层裁切、重新载入，以及切换到另一条帖子。
            </li>
            <li>
              受限制：读取内部图片数量、当前页、点击 Next、修改内部样式。跨域
              DOM 访问会被浏览器阻止。
            </li>
            <li>
              尚未确认：img_index 参数能否在 embed
              内定位第二张。需要用已知多图帖目视对照。
            </li>
            <li>
              没有已核实的 Instagram embed 轮播控制协议；postMessage
              必须对方实现并公布命令，不能凭空发送 next 就期待有效。
            </li>
            <li>
              独立媒体可自由轮播。通过授权 API
              获得轮播子媒体属于另一种数据来源，需要单独核实账号、权限和媒体访问条件；不能推定任意保存的帖子都能读取。
            </li>
          </ul>
          <p>
            资料：
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy"
              target="_blank"
              rel="noreferrer"
            >
              浏览器同源策略
            </a>{" "}
            ·{" "}
            <a
              href="https://developers.facebook.com/docs/instagram-platform/oembed/"
              target="_blank"
              rel="noreferrer"
            >
              Meta oEmbed 文档
            </a>
            （本次检索遭遇 429，最新 API 条件未核实）
          </p>
        </section>
      </div>
    </main>
  );
}
